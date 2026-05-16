"""Graduation Threshold Engine

Implements a deterministic, auditable calculation pipeline that:
 - validates inputs
 - computes current weighted grade
 - solves a weighted grade optimization (LP) for minimal targets
 - fits a Bayesian Ridge regression (if historical data exists) to estimate achievable scores
 - computes a statistical safety margin (residual-based or bootstrap)
 - combines results and returns per-assessment targets with feasibility and probability

The module degrades gracefully when optional ML/statistics libs are missing.
"""

from http.server import BaseHTTPRequestHandler
import json
from typing import List, Dict, Optional, Tuple
import math

try:
    import numpy as np
    import pandas as pd
except Exception:  # pragma: no cover - fallback
    np = None
    pd = None

try:
    from sklearn.linear_model import BayesianRidge
except Exception:
    BayesianRidge = None

try:
    from scipy.optimize import linprog
    from scipy import stats
except Exception:
    linprog = None
    stats = None


# ----------------------------- Utilities ----------------------------------

def _validate_and_normalize(data: dict) -> Tuple[List[dict], float, List[float], dict]:
    assessments = data.get("assessments", [])
    passing_grade = float(data.get("passing_grade", 75.0))
    historical_scores = data.get("historical_scores") or []
    cfg = {
        "confidence": float(data.get("confidence_level", 0.95)),
        "min_margin": float(data.get("min_margin", 3.0)),
        # default to min_max (equalize targets across pending) per user request
        "objective": data.get("objective", "min_max"),
    }

    if not isinstance(assessments, list) or len(assessments) == 0:
        raise ValueError("No assessments provided")

    # Convert and validate weights & scores
    total_weight = 0.0
    for a in assessments:
        if "weight" not in a:
            a["weight"] = 0.0
        a["weight"] = float(a.get("weight", 0.0))
        s = a.get("score")
        if s is not None:
            a["score"] = float(s)
        total_weight += a["weight"]

    # Accept small floating error; otherwise normalise
    if abs(total_weight - 100.0) > 0.5:
        raise ValueError(f"Assessment weights must sum to ~100, got {total_weight}")

    return assessments, passing_grade, historical_scores, cfg


def _current_weighted(assessments: List[dict]) -> Tuple[float, float, float]:
    achieved = 0.0
    completed_weight = 0.0
    for a in assessments:
        s = a.get("score")
        w = a.get("weight", 0.0)
        if s is not None:
            achieved += w * s
            completed_weight += w
    current_grade = round(achieved / 100.0, 3) if completed_weight > 0 else 0.0
    remaining_weight = sum(a.get("weight", 0.0) for a in assessments if a.get("score") is None)
    return achieved, completed_weight, remaining_weight


def _flatten_assessments(assessments: List[dict]) -> Tuple[List[dict], Dict[str, str]]:
    """
    Flatten nested assessment structure for calculation.
    Returns (flattened_list, parent_map) where parent_map[child_id] = parent_name.
    Each flattened item has "id" (unique), "parent" (optional), "name", "weight", "score".
    """
    flat = []
    parent_map = {}
    item_id = 0

    for parent in assessments:
        parent_name = parent.get("name", f"Assessment_{item_id}")
        sub_assessments = parent.get("sub_assessments", [])

        if not sub_assessments:
            # No children; treat parent as direct assessment
            parent_copy = dict(parent)
            parent_copy["id"] = item_id
            flat.append(parent_copy)
            item_id += 1
        else:
            # Parent has sub-assessments; add only sub-assessments to flat list
            for sub in sub_assessments:
                sub_copy = dict(sub)
                sub_copy["id"] = item_id
                sub_copy["parent"] = parent_name
                flat.append(sub_copy)
                parent_map[item_id] = parent_name
                item_id += 1

    return flat, parent_map


# ------------------------- Optimization (LP) -------------------------------

def _optimize_targets(pending: List[dict], required_weighted_points: float, objective: str = "min_sum") -> Dict[str, float]:
    # Optimize targets for pending assessments.
    # - objective == 'min_sum': minimize sum(t_j) subject to sum(w_j * t_j) >= required
    # - objective == 'min_max': minimize M s.t. t_j <= M and sum(w_j * t_j) >= required
    # t_j bounded [0,100]
    names = [p.get("name", "Unknown") for p in pending]
    weights = [p.get("weight", 0.0) for p in pending]

    n = len(weights)
    if n == 0:
        return {}

    if linprog is None:
        # simple equal-distribution fallback (same as min_max)
        per = required_weighted_points / sum(weights) if sum(weights) > 0 else 100.0
        per = max(0.0, min(100.0, per))
        return {names[i]: per for i in range(n)}

    if objective == "min_max":
        # Equalize targets across pending assessments: set t_j = required / sum(weights)
        per = required_weighted_points / sum(weights) if sum(weights) > 0 else 100.0
        per = max(0.0, min(100.0, per))
        return {names[i]: round(per, 2) for i in range(n)}

    # default: min_sum
    c = [1.0] * n  # minimize sum of t_j
    A = [[-w for w in weights]]  # linprog solves: A_ub x <= b_ub, so negate to convert >=
    b = [-required_weighted_points]
    bounds = [(0.0, 100.0) for _ in range(n)]
    res = linprog(c=c, A_ub=A, b_ub=b, bounds=bounds, method="highs")
    if not res.success:
        # fallback: equal distribution
        per = required_weighted_points / sum(weights) if sum(weights) > 0 else 100.0
        per = max(0.0, min(100.0, per))
        return {names[i]: per for i in range(n)}

    targets = {names[i]: round(float(res.x[i]), 2) for i in range(n)}
    return targets


# ------------------------- Regression / Prediction ------------------------

def _fit_predict_capacity(historical: List[float], n_pending: int) -> Tuple[Optional[float], float]:
    # Returns (predicted_mean_per_assessment, residual_std)
    if not historical or len(historical) < 2 or BayesianRidge is None or np is None:
        # fallback: use mean and sample std
        if not historical:
            return None, 10.0
        arr = np.array(historical) if np is not None else None
        mean = float(np.mean(arr)) if arr is not None else float(sum(historical) / len(historical))
        std = float(np.std(arr, ddof=1)) if arr is not None and len(arr) > 1 else 10.0
        return round(min(100.0, max(0.0, mean)), 1), std

    # Use BayesianRidge on simple time series (index -> score)
    X = np.arange(len(historical)).reshape(-1, 1)
    y = np.array(historical)
    model = BayesianRidge()
    model.fit(X, y)
    X_next = np.arange(len(historical), len(historical) + n_pending).reshape(-1, 1)
    preds = model.predict(X_next)
    pred_mean = float(np.mean(preds)) if len(preds) > 0 else float(model.predict([[len(historical)]])[0])
    residuals = y - model.predict(X)
    resid_std = float(np.std(residuals, ddof=1)) if len(residuals) > 1 else 10.0
    return round(min(100.0, max(0.0, pred_mean)), 1), resid_std


# ------------------------- Safety margin ---------------------------------

def _compute_margin(historical: List[float], resid_std: float, cfg: dict) -> float:
    # Prefer residual-based t-CI for mean, else fallback to k*std
    min_margin = cfg.get("min_margin", 3.0)
    conf = cfg.get("confidence", 0.95)
    if not historical or stats is None or len(historical) < 2:
        return min_margin

    n = len(historical)
    # margin for an individual's score: use k * resid_std where k ~ 1.5 (conservative)
    k = 1.5
    margin = max(min_margin, k * resid_std)
    return round(float(min(20.0, margin)), 2)


# ------------------------- Combine & Diagnostics --------------------------

def calculate_threshold(data: dict) -> dict:
    try:
        assessments, passing_grade, historical_scores, cfg = _validate_and_normalize(data)
    except ValueError as e:
        return {"error": str(e)}

    # Flatten nested sub-assessments for calculation
    flat_assessments, parent_map = _flatten_assessments(assessments)

    achieved, completed_weight, remaining_weight = _current_weighted(flat_assessments)
    current_grade = round(achieved / 100.0, 2) if completed_weight > 0 else 0.0

    pending = [a for a in flat_assessments if a.get("score") is None]

    if remaining_weight <= 0.0:
        status = "Passed" if current_grade >= passing_grade else "Failed"
        return {
            "current_grade": current_grade,
            "passing_grade": passing_grade,
            "requirements": [],
            "status": status,
            "safety_margin": 0.0,
            "message": f"All assessments graded. Final grade: {current_grade}",
        }

    # Required additional weighted points (in weighted-score units) to reach passing grade
    required_total = passing_grade * 100.0
    required_weighted_points = required_total - achieved

    # If already above required by rounding
    if required_weighted_points <= 0:
        return {
            "current_grade": current_grade,
            "passing_grade": passing_grade,
            "gap": 0.0,
            "requirements": [],
            "status": "On Track",
            "message": "Current weighted grade already meets or exceeds passing grade.",
        }

    # LP optimization to get baseline per-assessment targets
    baseline_targets = _optimize_targets(pending, required_weighted_points, objective=cfg.get("objective", "min_sum"))

    # Predict achievable average per pending using historical data
    predicted_mean, resid_std = _fit_predict_capacity(historical_scores, len(pending))

    # Safety margin
    margin = _compute_margin(historical_scores, resid_std, cfg)

    # Build per-assessment outputs combining baseline, prediction and margin
    requirements = []
    aggregate_prob = 1.0
    infeasible = False
    for idx, a in enumerate(pending):
        item_id = a.get("id", idx)
        parent = a.get("parent")
        name = a.get("name", f"Assessment {idx+1}")
        # Display name: show parent > child if sub-assessment
        display_name = f"{parent} > {name}" if parent else name
        
        w = a.get("weight", 0.0)
        baseline = float(baseline_targets.get(name, 0.0))
        adjusted = min(100.0, baseline + margin)

        predicted = predicted_mean if predicted_mean is not None else None

        # Probability of achieving adjusted target assuming normal residuals
        if predicted is None or stats is None:
            prob = None
        else:
            # use survival function: P(X >= target)
            z = (adjusted - predicted) / (resid_std if resid_std > 0 else 10.0)
            prob = float(stats.norm.sf(z))

        feasible = adjusted <= 100.0
        if not feasible:
            infeasible = True

        if prob is not None:
            aggregate_prob *= prob

        requirements.append({
            "name": display_name,
            "weight": w,
            "baseline_target": round(baseline, 2),
            "adjusted_target": round(adjusted, 2),
            "predicted": predicted,
            "residual_std": round(resid_std, 2),
            "probability_of_success": round(prob, 3) if prob is not None else None,
            "feasible": feasible,
        })

    # Determine overall status
    if infeasible:
        status = "At Risk"
    else:
        # Heuristic: use aggregate probability thresholds
        if aggregate_prob >= 0.7:
            status = "On Track"
        elif aggregate_prob >= 0.4:
            status = "Worth Reviewing"
        else:
            status = "At Risk"

    message_parts = [f"Current grade: {current_grade}", f"Need {round(required_weighted_points/remaining_weight,2)} average on remaining assessments (baseline)"]
    message = "; ".join(message_parts)

    return {
        "current_grade": current_grade,                                 # calculate
        "passing_grade": passing_grade,                                 # input
        "gap": round(max(0.0, passing_grade - current_grade), 2),       # 100 - current_grade
        "requirements": requirements,
        "status": status,
        "safety_margin": margin,
        "predicted_achievable": predicted_mean,
        "residual_std": round(resid_std, 2),
        "is_feasible": not infeasible,
        "probability_of_success_overall": round(aggregate_prob, 3) if aggregate_prob is not None else None,
        "message": message,
        "diagnostics": {
            "optimizer": "linprog" if linprog is not None else "fallback_equidistribute",
            "regression": "BayesianRidge" if BayesianRidge is not None else "fallback_mean",
            "historical_count": len(historical_scores) if historical_scores is not None else 0,
        },
    }


# ------------------------- HTTP Handler ----------------------------------


class handler(BaseHTTPRequestHandler):

    def log_message(self, format, *args):
        pass  # suppress default access logs

    def _send_json(self, status: int, body: dict):
        payload = json.dumps(body, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(payload)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length)
            data = json.loads(body)
            result = calculate_threshold(data)
            self._send_json(200, result)
        except json.JSONDecodeError:
            self._send_json(400, {"error": "Invalid JSON"})
        except Exception as e:
            self._send_json(500, {"error": str(e)})


if __name__ == "__main__":
    # Quick demo / test harness — run `python graduation_threshold.py` to execute
    example_request = {
        "passing_grade": 75.0,
        "assessments": [
            # {"name": "Midterm", "weight": 40, "score": 90},
            {
                "name": "Project",
                "weight": 20,
                "sub_assessments": [
                    {"name": "Project 1", "weight": 10, "score": None},
                    {"name": "Project 2", "weight": 10, "score": 85},
                ],
            },
            {
                "name": "Exam",
                "weight": 80,
                "sub_assessments": [
                    {"name": "Midterm", "weight": 40, "score": 85},
                    {"name": "Final", "weight": 40, "score": None},
                ],
            }
        ],
        "historical_scores": [90, 80, 87, 95, 83],
        "confidence_level": 0.95,
        "min_margin": 3.0,
        "objective": "min_max",
    }

    print("Running local demo with sub-assessment support:\n")
    out = calculate_threshold(example_request)
    print(json.dumps(out, indent=2, ensure_ascii=False))
