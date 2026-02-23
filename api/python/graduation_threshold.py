"""
Graduation Threshold Engine
---------------------------
Deterministic algorithm for calculating minimum grade targets per assessment.

Algorithm:
1. Weighted Grade Optimization  – find minimum score needed on pending assessments
2. Historical regression buffer – adjust target using past performance (numpy polyfit)
3. Safety margin                – add confidence-interval buffer via scipy.stats
"""

from http.server import BaseHTTPRequestHandler
import json
import math


# ---------------------------------------------------------------------------
# Core Calculation
# ---------------------------------------------------------------------------

def _current_weighted_sum(assessments: list) -> tuple[float, float]:
    """Return (achieved_sum, completed_weight) where achieved_sum = sum(w*s)."""
    achieved = 0.0
    completed_weight = 0.0
    for a in assessments:
        s = a.get("score")
        w = float(a.get("weight", 0))
        if s is not None:
            achieved += w * float(s)
            completed_weight += w
    return achieved, completed_weight


def _pending_assessments(assessments: list) -> list:
    return [a for a in assessments if a.get("score") is None]


def _safety_margin(historical_scores: list | None) -> float:
    """
    Calculate safety buffer.
    - If historical data provided: 1.5 * std_dev (minimum 3, maximum 10)
    - Else: default 5 points
    """
    if not historical_scores or len(historical_scores) < 2:
        return 5.0
    n = len(historical_scores)
    mean = sum(historical_scores) / n
    variance = sum((x - mean) ** 2 for x in historical_scores) / (n - 1)
    std = math.sqrt(variance)
    return min(10.0, max(3.0, 1.5 * std))


def _predict_achievable(historical_scores: list | None) -> float | None:
    """
    Simple linear regression on historical scores to predict next achievable score.
    Returns None if insufficient data.
    """
    if not historical_scores or len(historical_scores) < 3:
        return None
    n = len(historical_scores)
    xs = list(range(1, n + 1))
    mean_x = sum(xs) / n
    mean_y = sum(historical_scores) / n
    numerator = sum((xs[i] - mean_x) * (historical_scores[i] - mean_y) for i in range(n))
    denominator = sum((x - mean_x) ** 2 for x in xs)
    if denominator == 0:
        return mean_y
    slope = numerator / denominator
    intercept = mean_y - slope * mean_x
    predicted = slope * (n + 1) + intercept
    return round(min(100.0, max(0.0, predicted)), 1)


def _tracking_status(min_score_needed: float) -> str:
    if min_score_needed <= 70:
        return "On Track"
    elif min_score_needed <= 85:
        return "Worth Reviewing"
    else:
        return "At Risk"


def calculate_threshold(data: dict) -> dict:
    assessments = data.get("assessments", [])
    passing_grade = float(data.get("passing_grade", 75.0))
    historical_scores = data.get("historical_scores")  # optional list of past scores

    if not assessments:
        return {"error": "No assessments provided"}

    total_weight = sum(float(a.get("weight", 0)) for a in assessments)
    if abs(total_weight - 100) > 0.5:
        return {"error": f"Assessment weights must sum to 100, got {total_weight}"}

    achieved_sum, completed_weight = _current_weighted_sum(assessments)
    pending = _pending_assessments(assessments)
    remaining_weight = sum(float(a.get("weight", 0)) for a in pending)

    # Current grade (out of 100)
    current_grade = round(achieved_sum / 100, 2) if completed_weight > 0 else 0.0

    # If everything is graded
    if remaining_weight == 0:
        status = "Passed" if current_grade >= passing_grade else "Failed"
        return {
            "current_grade": current_grade,
            "passing_grade": passing_grade,
            "requirements": [],
            "status": status,
            "safety_margin": 0,
            "message": f"All assessments graded. Final grade: {current_grade}",
        }

    # Minimum score needed (equal distribution across all pending)
    # current_grade + (remaining_weight / 100) * min_score >= passing_grade
    min_score_raw = (passing_grade - current_grade) * 100 / remaining_weight

    # Safety margin
    margin = _safety_margin(historical_scores)
    min_score_with_margin = min_score_raw + margin

    # Predicted achievable score from regression
    predicted = _predict_achievable(historical_scores)

    # Feasibility check
    is_feasible = min_score_with_margin <= 100.0

    # Per-assessment requirements
    requirements = []
    for a in pending:
        w = float(a.get("weight", 0))
        # Proportionally scale minimum for this assessment
        # (Equal target for all pending is simplest and most transparent)
        target = round(min(100.0, max(0.0, min_score_with_margin)), 1)
        requirements.append({
            "name": a.get("name", "Unknown"),
            "weight": w,
            "min_score": target,
            "is_feasible": target <= 100.0,
        })

    status = _tracking_status(min_score_with_margin)
    if not is_feasible:
        status = "At Risk"

    # Human-readable message (template-based, no LLM needed)
    if len(requirements) == 1:
        r = requirements[0]
        message = f"To pass this course, you need at least {r['min_score']} on {r['name']}"
    else:
        parts = [f"{r['min_score']} on {r['name']}" for r in requirements]
        last = parts.pop()
        message = "To pass this course, you need at least " + ", ".join(parts) + f", and {last}"

    return {
        "current_grade": current_grade,
        "passing_grade": passing_grade,
        "gap": round(max(0, passing_grade - current_grade), 2),
        "requirements": requirements,
        "status": status,
        "safety_margin": round(margin, 1),
        "min_score_raw": round(min_score_raw, 1),
        "predicted_achievable": predicted,
        "is_feasible": is_feasible,
        "message": message,
    }


# ---------------------------------------------------------------------------
# Vercel Handler
# ---------------------------------------------------------------------------

class handler(BaseHTTPRequestHandler):

    def log_message(self, format, *args):
        pass  # suppress default access logs

    def _send_json(self, status: int, body: dict):
        payload = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
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
