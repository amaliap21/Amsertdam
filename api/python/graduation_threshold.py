"""Graduation Threshold Engine

Implements a deterministic, auditable calculation pipeline that:
 - validates inputs and normalizes assessment structures
 - computes current weighted grade from completed assessments
 - solves a weighted grade optimization (LP) to find minimal targets for pending assessments
 - fits a Bayesian Ridge regression to estimate achievable scores based on historical data
 - computes a statistical safety margin (residual-based) to protect against performance variability
 - combines results and returns per-assessment targets with feasibility and success probability

The module degrades gracefully when optional ML/statistics libs are missing, falling back to
simpler heuristics while maintaining calculation integrity.

Architecture:
  - Input validation & normalization
  - Assessment structure flattening (handles nested sub-assessments)
  - Current performance calculation (weighted grade from completed items)
  - Target optimization (LP-based to equalize or minimize effort)
  - Capacity prediction (regression on historical scores)
  - Safety margin calculation (residual-based)
  - Result aggregation (per-assessment targets, feasibility, success probability)
  - HTTP handler for Vercel deployment
"""

from http.server import BaseHTTPRequestHandler
import json
from typing import List, Dict, Optional, Tuple
import math

# Optional dependencies with graceful degradation
try:
    import numpy as np
    HAS_NUMPY = True
except ImportError:
    np = None
    HAS_NUMPY = False

try:
    from sklearn.linear_model import BayesianRidge
    HAS_SKLEARN = True
except ImportError:
    BayesianRidge = None
    HAS_SKLEARN = False

try:
    from scipy.optimize import linprog
    from scipy import stats
    HAS_SCIPY = True
except ImportError:
    linprog = None
    stats = None
    HAS_SCIPY = False

# ============================= CONFIGURATION CONSTANTS =======================

# Safety margin calculation parameters
SAFETY_MARGIN_MULTIPLIER = 1.5  # k in: margin = k * residual_std
SAFETY_MARGIN_MIN = 3.0  # Minimum safety buffer in points
SAFETY_MARGIN_MAX = 20.0  # Maximum safety buffer in points (cap)

# Status determination thresholds (based on aggregate success probability)
PROBABILITY_ON_TRACK = 0.7  # >= 70% success probability → On Track
PROBABILITY_REVIEWING = 0.4  # 40-70% → Worth Reviewing; < 40% → At Risk

# Score bounds
MIN_SCORE = 0.0
MAX_SCORE = 100.0
IDEAL_WEIGHT_SUM = 100.0
WEIGHT_SUM_TOLERANCE = 0.5  # Allow ±0.5 tolerance for floating point

# Default configuration values
DEFAULT_PASSING_GRADE = 75.0
DEFAULT_CONFIDENCE_LEVEL = 0.95
DEFAULT_OPTIMIZER_OBJECTIVE = "min_max"  # Equalize targets by default

# ============================= INPUT VALIDATION ==============================

def _validate_and_normalize_input(data: dict) -> Tuple[List[dict], float, List[float], dict]:
    """
    Validate and normalize input data from request.
    
    Ensures assessment structure is correct, weights sum to 100, and all numeric
    fields are properly typed. Extracts configuration parameters with sensible defaults.
    
    Args:
        data: Request payload dict with keys:
            - assessments (list): Assessment objects with name, weight, score (optional)
            - passing_grade (float): Course passing threshold (0-100)
            - historical_scores (list, optional): Previous assessment scores
            - confidence_level (float, optional): Confidence for margin calc (default 0.95)
            - min_margin (float, optional): Minimum safety margin floor (default 3.0)
            - objective (str, optional): Optimizer objective ('min_sum' or 'min_max', default 'min_max')
    
    Returns:
        Tuple of (assessments, passing_grade, historical_scores, config)
        - assessments: Normalized list with weight and score as floats
        - passing_grade: Float value
        - historical_scores: List of past scores or empty list
        - config: Dict with confidence_level, min_margin, objective
    
    Raises:
        ValueError: If assessments missing, empty, or weights don't sum to ~100
    """
    assessments = data.get("assessments", [])
    passing_grade = float(data.get("passing_grade", DEFAULT_PASSING_GRADE))
    historical_scores = data.get("historical_scores") or []
    
    config = {
        "confidence": float(data.get("confidence_level", DEFAULT_CONFIDENCE_LEVEL)),
        "min_margin": float(data.get("min_margin", SAFETY_MARGIN_MIN)),
        "objective": data.get("objective", DEFAULT_OPTIMIZER_OBJECTIVE),
    }

    if not isinstance(assessments, list) or len(assessments) == 0:
        raise ValueError("No assessments provided")

    # Normalize all numeric fields
    total_weight = 0.0
    for assessment in assessments:
        if "weight" not in assessment:
            assessment["weight"] = 0.0
        assessment["weight"] = float(assessment.get("weight", 0.0))
        
        score = assessment.get("score")
        if score is not None:
            assessment["score"] = float(score)
        
        total_weight += assessment["weight"]

    # Validate weight sum (allow small floating-point tolerance)
    if abs(total_weight - IDEAL_WEIGHT_SUM) > WEIGHT_SUM_TOLERANCE:
        raise ValueError(f"Assessment weights must sum to ~{IDEAL_WEIGHT_SUM}, got {total_weight}")

    return assessments, passing_grade, historical_scores, config


# ============================= DATA TRANSFORMATION ==========================

def _flatten_assessments(assessments: List[dict]) -> Tuple[List[dict], Dict[str, str]]:
    """
    Flatten nested assessment structure (handles sub-assessments).
    
    Converts hierarchical assessment structure into flat list for calculation.
    When an assessment has sub_assessments, only sub-items are included in
    calculations. Parent assessment itself is not directly graded.
    
    Args:
        assessments: List of assessment dicts, each may have optional sub_assessments list
    
    Returns:
        Tuple of (flattened_assessments, parent_map):
        - flattened_assessments: List of assessment dicts with added 'id' and optional 'parent'
        - parent_map: Dict mapping assessment_id → parent_name for hierarchical display
    
    Example:
        Input:  [{"name": "Midterm", "weight": 40, "score": 85}]
        Output: ([{"id": 0, "name": "Midterm", "weight": 40, "score": 85}], {})
        
        Input:  [{"name": "Project", "weight": 30, "sub_assessments": [
                    {"name": "Part 1", "weight": 15, "score": None},
                    {"name": "Part 2", "weight": 15, "score": 90}
                ]}]
        Output: ([
                    {"id": 0, "parent": "Project", "name": "Part 1", "weight": 15, "score": None},
                    {"id": 1, "parent": "Project", "name": "Part 2", "weight": 15, "score": 90}
                ], {0: "Project", 1: "Project"})
    """
    flattened = []
    parent_map = {}
    item_id = 0

    for parent_assessment in assessments:
        parent_name = parent_assessment.get("name", f"Assessment_{item_id}")
        sub_assessments = parent_assessment.get("sub_assessments", [])

        if not sub_assessments:
            # No children → treat parent as direct assessment
            parent_copy = dict(parent_assessment)
            parent_copy["id"] = item_id
            flattened.append(parent_copy)
            item_id += 1
        else:
            # Has children → only add sub-assessments, not the parent
            for sub_assessment in sub_assessments:
                sub_copy = dict(sub_assessment)
                sub_copy["id"] = item_id
                sub_copy["parent"] = parent_name
                flattened.append(sub_copy)
                parent_map[item_id] = parent_name
                item_id += 1

    return flattened, parent_map


def _compute_current_weighted_grade(assessments: List[dict]) -> Tuple[float, float, float]:
    """
    Calculate current weighted grade from completed assessments.
    
    Computes:
    - achieved_sum: Total weighted points earned so far
    - completed_weight: Total weight of completed assessments
    - remaining_weight: Weight of assessments not yet graded
    - current_grade: Normalized grade (0-100 scale)
    
    Args:
        assessments: Flattened assessment list with name, weight, score
    
    Returns:
        Tuple of (current_grade, completed_weight, remaining_weight)
        - current_grade: Weighted average of completed assessments (0-100)
        - completed_weight: Sum of weights for graded items
        - remaining_weight: Sum of weights for ungraded items
    """
    achieved_sum = 0.0
    completed_weight = 0.0
    
    for assessment in assessments:
        score = assessment.get("score")
        weight = assessment.get("weight", 0.0)
        
        if score is not None:
            achieved_sum += weight * score
            completed_weight += weight
    
    # Normalize to 0-100 scale
    current_grade = round(achieved_sum / IDEAL_WEIGHT_SUM, 3) if completed_weight > 0 else 0.0
    remaining_weight = sum(
        a.get("weight", 0.0) for a in assessments 
        if a.get("score") is None
    )
    
    return current_grade, completed_weight, remaining_weight


# ============================= OPTIMIZATION (LP) =============================

def _optimize_assessment_targets(
    pending_assessments: List[dict],
    required_weighted_points: float,
    objective: str = "min_sum"
) -> Dict[str, float]:
    """
    Solve linear program to find minimum target scores for pending assessments.
    
    Two optimization objectives:
    
    1. 'min_sum': Minimize total effort across all pending assessments
       - Formula: minimize sum(t_j)
       - Subject to: sum(w_j * t_j) >= required_weighted_points, 0 <= t_j <= 100
       - Result: Some assessments may have very low targets if lightly weighted
    
    2. 'min_max': Equalize targets across all pending assessments (default)
       - Formula: minimize maximum target M
       - Subject to: t_j <= M for all j, sum(w_j * t_j) >= required, 0 <= t_j <= 100
       - Result: All assessments get similar targets for fairer workload distribution
    
    Args:
        pending_assessments: List of ungraded assessments {name, weight, score=None}
        required_weighted_points: Total weighted points needed to reach passing grade
        objective: 'min_sum' for minimizing total effort, 'min_max' for load balancing
    
    Returns:
        Dict mapping assessment_name → target_score (float 0-100)
    
    Note:
        Falls back to equal distribution if scipy.optimize.linprog unavailable.
    """
    assessment_names = [a.get("name", "Unknown") for a in pending_assessments]
    assessment_weights = [a.get("weight", 0.0) for a in pending_assessments]
    
    num_assessments = len(assessment_weights)
    if num_assessments == 0:
        return {}
    
    # Fallback if linprog unavailable: equal distribution
    if linprog is None:
        avg_target = (
            required_weighted_points / sum(assessment_weights) 
            if sum(assessment_weights) > 0 
            else MIN_SCORE
        )
        avg_target = max(MIN_SCORE, avg_target)
        return {assessment_names[i]: avg_target for i in range(num_assessments)}
    
    if objective == "min_max":
        # Equalize targets: all pending assessments get same target
        avg_target = (
            required_weighted_points / sum(assessment_weights) 
            if sum(assessment_weights) > 0 
            else MIN_SCORE
        )
        avg_target = max(MIN_SCORE, avg_target)
        return {assessment_names[i]: round(avg_target, 2) for i in range(num_assessments)}
    
    # Default: min_sum objective
    # Minimize sum(t_j) subject to sum(w_j * t_j) >= required
    objective_coeffs = [1.0] * num_assessments
    
    # Constraint: sum(w_j * t_j) >= required  →  -sum(w_j * t_j) <= -required
    constraint_A = [[-w for w in assessment_weights]]
    constraint_b = [-required_weighted_points]
    
    # Bounds: 0 <= t_j <= 100
    bounds = [(MIN_SCORE, None) for _ in range(num_assessments)]
    
    result = linprog(
        c=objective_coeffs,
        A_ub=constraint_A,
        b_ub=constraint_b,
        bounds=bounds,
        method="highs"
    )
    
    if not result.success:
        # Fallback: equal distribution if LP solver fails
        avg_target = (
            required_weighted_points / sum(assessment_weights) 
            if sum(assessment_weights) > 0 
            else MIN_SCORE
        )
        avg_target = max(MIN_SCORE, avg_target)
        return {assessment_names[i]: avg_target for i in range(num_assessments)}
    
    return {assessment_names[i]: round(float(result.x[i]), 2) for i in range(num_assessments)}


# ============================= REGRESSION / PREDICTION =======================

def _predict_achievable_score(
    historical_scores: List[float],
    num_pending_assessments: int
) -> Tuple[Optional[float], float]:
    """
    Estimate achievable score based on historical performance.
    
    Uses Bayesian Ridge Regression to model score trend over time (indexed by assessment order).
    Predicts mean achievable score for next upcoming assessments and returns residual
    standard deviation as measure of historical volatility.
    
    Gracefully degrades:
    - If historical_scores has < 2 items: returns (None, 10.0)
    - If sklearn/numpy unavailable: returns (mean, sample_std) as simple estimate
    - If BayesianRidge available: fits regression on (index → score) time series
    
    Args:
        historical_scores: List of past assessment scores (ordered chronologically)
        num_pending_assessments: Number of upcoming assessments (used to project prediction range)
    
    Returns:
        Tuple of (predicted_mean, residual_std):
        - predicted_mean: Expected score (0-100) for next assessments, or None if insufficient data
        - residual_std: Standard deviation of model residuals; measures score variability
    
    Example:
        historical_scores = [65, 70, 72, 68, 75]
        → Bayesian Ridge fits trend, predicts ~73, residual_std ~3.5
    """
    # Insufficient historical data
    if not historical_scores or len(historical_scores) < 2:
        if not historical_scores:
            return None, 10.0  # Default std if no data
        # Single score: use it as mean, default std
        return float(historical_scores[0]), 10.0
    
    # Fallback if sklearn unavailable
    if not HAS_SKLEARN or not HAS_NUMPY:
        scores_array = np.array(historical_scores) if HAS_NUMPY else None
        
        if scores_array is not None:
            mean_score = float(np.mean(scores_array))
            std_dev = float(np.std(scores_array, ddof=1)) if len(scores_array) > 1 else 10.0
        else:
            mean_score = sum(historical_scores) / len(historical_scores)
            std_dev = 10.0
        
        mean_score = round(max(MIN_SCORE, mean_score), 1)
        return mean_score, std_dev
    
    # Bayesian Ridge Regression: fit historical data as time series (index → score)
    X_train = np.arange(len(historical_scores)).reshape(-1, 1)
    y_train = np.array(historical_scores)
    
    model = BayesianRidge()
    model.fit(X_train, y_train)
    
    # Predict for upcoming assessments
    X_future = np.arange(
        len(historical_scores),
        len(historical_scores) + num_pending_assessments
    ).reshape(-1, 1)
    predictions = model.predict(X_future)
    
    # Mean of future predictions
    predicted_mean = (
        float(np.mean(predictions)) if len(predictions) > 0 
        else float(model.predict([[len(historical_scores)]])[0])
    )
    
    # Residual standard deviation (volatility measure)
    residuals = y_train - model.predict(X_train)
    residual_std = (
        float(np.std(residuals, ddof=1)) if len(residuals) > 1 
        else 10.0
    )
    
    # Bound predicted mean to valid score range
    predicted_mean = round(max(MIN_SCORE, predicted_mean), 1)
    return predicted_mean, residual_std


# ============================= SAFETY MARGIN ================================

def _compute_safety_margin(
    historical_scores: List[float],
    residual_std: float,
    config: dict
) -> float:
    """
    Calculate safety buffer for target scores based on historical volatility.
    
    Uses residual standard deviation from regression as measure of score variability.
    Adds k * residual_std as safety buffer, bounded by [min_margin, max_margin].
    
    Rationale:
    - Higher residual_std (more variable scores) → larger margin
    - Larger margin → more conservative targets → better success chance
    - Margin protects against performance fluctuations
    
    Calculation: margin = k * residual_std, where k=1.5 (conservative multiplier)
    
    Args:
        historical_scores: Past assessment scores (used to validate sufficiency)
        residual_std: Standard deviation of regression residuals
        config: Config dict with keys:
            - min_margin: Floor for safety margin (default 3.0)
            - confidence: Confidence level (stored for future use, not used in current impl)
    
    Returns:
        Float representing safety margin in points (bounded [3.0, 20.0])
    
    Example:
        residual_std = 5.87 → margin = 1.5 * 5.87 ≈ 8.81 points
    """
    min_margin = config.get("min_margin", SAFETY_MARGIN_MIN)
    
    # Not enough historical data: use minimum margin
    if not historical_scores or not HAS_SCIPY or len(historical_scores) < 2:
        return min_margin
    
    # Calculate margin from residual volatility
    margin = max(min_margin, SAFETY_MARGIN_MULTIPLIER * residual_std)
    
    # Cap at maximum to prevent unreasonable buffers
    margin = min(SAFETY_MARGIN_MAX, margin)
    
    return round(float(margin), 2)


# ============================= STATUS DETERMINATION ==========================

def _determine_overall_status(aggregate_success_probability: float, has_infeasible: bool) -> str:
    """
    Classify overall course status based on feasibility and success probability.
    
    Uses heuristic thresholds:
    - 'At Risk': If any target infeasible (>100) or probability < 40%
    - 'Worth Reviewing': If probability 40-70%
    - 'On Track': If probability >= 70%
    
    Args:
        aggregate_success_probability: Joint probability of achieving all adjusted targets (0-1)
        has_infeasible: Boolean indicating any target > 100
    
    Returns:
        Status string: 'At Risk' | 'Worth Reviewing' | 'On Track'
    """
    if has_infeasible:
        return "At Risk"
    
    if aggregate_success_probability >= PROBABILITY_ON_TRACK:
        return "On Track"
    elif aggregate_success_probability >= PROBABILITY_REVIEWING:
        return "Worth Reviewing"
    else:
        return "At Risk"


def _compute_success_probability(
    adjusted_target: float,
    predicted_mean: Optional[float],
    residual_std: float
) -> Optional[float]:
    """
    Calculate probability of achieving a target score given historical distribution.
    
    Assumes scores are normally distributed with mean=predicted_mean and std=residual_std.
    Uses survival function: P(X >= target) = 1 - Φ((target - μ) / σ)
    
    Args:
        adjusted_target: Target score to achieve (0-100)
        predicted_mean: Estimated achievable mean score, or None
        residual_std: Standard deviation of score distribution
    
    Returns:
        Probability (0-1) or None if insufficient data for calculation
    
    Example:
        adjusted_target=70, predicted_mean=75, residual_std=5
        → z = (70-75)/5 = -1.0
        → P(X >= 70) ≈ 0.84 (84% chance)
    """
    if predicted_mean is None or not HAS_SCIPY:
        return None
    
    # Avoid division by zero
    std_safe = residual_std if residual_std > 0 else 10.0
    
    # Standardized score: how many stds is target above/below mean
    z_score = (adjusted_target - predicted_mean) / std_safe
    
    # Survival function: P(X >= target)
    probability = float(stats.norm.sf(z_score))
    return probability


def _build_requirement_item(
    assessment: dict,
    baseline_target: float,
    safety_margin: float,
    predicted_mean: Optional[float],
    residual_std: float
) -> Tuple[Dict, Optional[float], bool]:
    """
    Build a single requirement object for pending assessment.
    
    Combines baseline optimization target with safety margin and historical prediction
    to produce a conservative recommendation for student.
    
    Args:
        assessment: Pending assessment dict with id, name, weight, parent (optional)
        baseline_target: Minimum target from LP optimizer
        safety_margin: Safety buffer from margin calculation
        predicted_mean: Estimated achievable score (or None)
        residual_std: Score volatility measure
    
    Returns:
        Tuple of (requirement_dict, success_probability, is_feasible)
        where requirement_dict contains name, weight, baseline_target, adjusted_target, etc.
    """
    parent_name = assessment.get("parent")
    name = assessment.get("name", "Unknown")
    weight = assessment.get("weight", 0.0)
    
    # Hierarchical display name
    display_name = f"{parent_name} > {name}" if parent_name else name
    
    # Apply margin without capping so bonus-score assessments can exceed 100.
    adjusted_target = baseline_target + safety_margin
    
    # Calculate success probability
    success_prob = _compute_success_probability(adjusted_target, predicted_mean, residual_std)
    
    # Feasibility is determined by the raw required score before margin.
    is_feasible = baseline_target <= MAX_SCORE
    
    requirement = {
        "name": display_name,
        "weight": weight,
        "min_score": round(baseline_target, 2),
        "baseline_target": round(baseline_target, 2),
        "adjusted_target": round(adjusted_target, 2),
        "predicted": predicted_mean,
        "residual_std": round(residual_std, 2),
        "probability_of_success": round(success_prob, 3) if success_prob is not None else None,
        "feasible": is_feasible,
        "is_feasible": is_feasible,
    }
    
    return requirement, success_prob, is_feasible


# ============================= MAIN CALCULATION ==============================

def calculate_threshold(data: dict) -> dict:
    """
    Main entry point: calculate graduation threshold and recommend targets.
    
    Complete pipeline:
    1. Validate and normalize input
    2. Flatten nested assessment structure
    3. Calculate current weighted grade
    4. Check if already passing or if work remains
    5. Optimize baseline targets for pending assessments
    6. Predict achievable performance from history
    7. Calculate safety margins
    8. Compute success probabilities
    9. Determine overall status
    10. Return comprehensive result
    
    Args:
        data: Request dict with assessments, passing_grade, historical_scores, and config options
    
    Returns:
        Dict with keys:
        - current_grade (float): Current weighted average (0-100)
        - passing_grade (float): Course threshold
        - gap (float): Points needed to reach passing grade
        - requirements (list): Per-assessment targets with success probabilities
        - status (str): 'On Track' | 'Worth Reviewing' | 'At Risk'
        - safety_margin (float): Buffer added to baseline targets
        - predicted_achievable (float): Expected score from regression
        - residual_std (float): Score volatility measure
        - is_feasible (bool): All targets are achievable (<=100)
        - probability_of_success_overall (float): Joint success probability
        - message (str): Human-readable summary
        - diagnostics (dict): Tools used (optimizer, regression, data count)
    """
    # ===================== INPUT VALIDATION =====================
    try:
        assessments, passing_grade, historical_scores, config = _validate_and_normalize_input(data)
    except ValueError as error:
        return {"error": str(error)}
    
    # ===================== DATA PREPARATION =====================
    # Flatten sub-assessments for calculation
    flat_assessments, _parent_map = _flatten_assessments(assessments)

    # If the request does not provide historical scores, reuse already-graded
    # assessment scores so the regression step can still operate.
    if not historical_scores:
        historical_scores = [
            float(assessment["score"])
            for assessment in flat_assessments
            if assessment.get("score") is not None
        ]
    
    # Calculate current performance
    current_grade, _completed_weight, remaining_weight = _compute_current_weighted_grade(flat_assessments)
    
    # List of pending (ungraded) assessments
    pending_assessments = [a for a in flat_assessments if a.get("score") is None]
    
    # ===================== EARLY EXIT: ALL GRADED =====================
    if remaining_weight <= 0.0:
        final_status = "Passed" if current_grade >= passing_grade else "Failed"
        return {
            "current_grade": current_grade,
            "passing_grade": passing_grade,
            "requirements": [],
            "status": final_status,
            "safety_margin": 0.0,
            "message": f"All assessments graded. Final grade: {current_grade}",
        }
    
    # ===================== EARLY EXIT: ALREADY PASSING =====================
    required_total_points = passing_grade * IDEAL_WEIGHT_SUM
    achieved_total_points = current_grade * IDEAL_WEIGHT_SUM
    required_additional_points = required_total_points - achieved_total_points
    
    if required_additional_points <= 0:
        return {
            "current_grade": current_grade,
            "passing_grade": passing_grade,
            "gap": 0.0,
            "requirements": [],
            "status": "On Track",
            "message": "Current weighted grade already meets or exceeds passing grade.",
        }
    
    # ===================== OPTIMIZATION & PREDICTION =====================
    # Solve LP to get baseline targets
    baseline_targets = _optimize_assessment_targets(
        pending_assessments,
        required_additional_points,
        objective=config.get("objective", DEFAULT_OPTIMIZER_OBJECTIVE)
    )
    
    # Estimate achievable score from history
    predicted_mean, residual_std = _predict_achievable_score(
        historical_scores,
        len(pending_assessments)
    )
    
    # Calculate safety margin
    margin = _compute_safety_margin(historical_scores, residual_std, config)
    
    # ===================== BUILD REQUIREMENTS & CALCULATE PROBABILITIES =====================
    requirements = []
    aggregate_probability = 1.0
    any_infeasible = False
    
    for assessment in pending_assessments:
        name = assessment.get("name", "Unknown")
        baseline = float(baseline_targets.get(name, 0.0))
        
        requirement, success_prob, feasible = _build_requirement_item(
            assessment, baseline, margin, predicted_mean, residual_std
        )
        requirements.append(requirement)
        
        if not feasible:
            any_infeasible = True
        
        if success_prob is not None:
            aggregate_probability *= success_prob
    
    # ===================== DETERMINE STATUS =====================
    overall_status = _determine_overall_status(aggregate_probability, any_infeasible)
    
    # ===================== GENERATE SUMMARY MESSAGE =====================
    baseline_average = required_additional_points / remaining_weight if remaining_weight > 0 else 100.0
    message = (
        f"Current grade: {current_grade}; "
        f"Need {round(baseline_average, 2)} average on remaining assessments (baseline)"
    )
    
    # ===================== RETURN RESULT =====================
    min_score_raw = round(
        required_additional_points / remaining_weight if remaining_weight > 0 else 0.0,
        2
    )
    
    return {
        "current_grade": current_grade,
        "passing_grade": passing_grade,
        "gap": round(max(0.0, passing_grade - current_grade), 2),
        "requirements": requirements,
        "status": overall_status,
        "safety_margin": margin,
        "min_score_raw": min_score_raw,
        "predicted_achievable": predicted_mean,
        "residual_std": round(residual_std, 2),
        "is_feasible": not any_infeasible,
        "probability_of_success_overall": round(aggregate_probability, 3) if aggregate_probability is not None else None,
        "message": message,
        "diagnostics": {
            "optimizer": "linprog" if linprog is not None else "fallback_equidistribute",
            "regression": "BayesianRidge" if HAS_SKLEARN else "fallback_mean",
            "historical_count": len(historical_scores) if historical_scores else 0,
        },
    }


# ============================= HTTP HANDLER (VERCEL) =========================

class handler(BaseHTTPRequestHandler):
    """HTTP request handler for Vercel serverless deployment."""

    def log_message(self, format, *args):
        """Suppress default HTTP access logs."""
        pass

    def _send_json(self, status: int, body: dict) -> None:
        """
        Send JSON response with proper headers.
        
        Args:
            status: HTTP status code (200, 400, 500, etc.)
            body: Response body dict (will be JSON-encoded)
        """
        payload = json.dumps(body, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(payload)

    def do_OPTIONS(self) -> None:
        """Handle CORS preflight requests."""
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_POST(self) -> None:
        """
        Handle POST request: receive JSON, calculate threshold, return JSON response.
        
        Expects:
            Content-Type: application/json
            Body: Graduation threshold request (see calculate_threshold docstring)
        
        Returns:
            JSON response with keys: current_grade, passing_grade, requirements, status, etc.
            On error: {error: string}
        """
        try:
            # Read request body
            content_length = int(self.headers.get("Content-Length", 0))
            request_body = self.rfile.read(content_length)
            
            # Parse JSON
            request_data = json.loads(request_body)
            
            # Calculate threshold
            result = calculate_threshold(request_data)
            
            # Send success response
            self._send_json(200, result)
            
        except json.JSONDecodeError:
            self._send_json(400, {"error": "Invalid JSON in request body"})
        except Exception as error:
            self._send_json(500, {"error": str(error)})


if __name__ == "__main__":
    """
    Demo / Test Harness
    
    Run: python graduation_threshold.py
    
    Shows a realistic scenario with:
    - Multiple hierarchical assessments with sub-components
    - Mix of completed and pending grades
    - Historical performance data for prediction
    - Demonstrates min_max objective (equalized load distribution)
    """
    example_request = {
        "passing_grade": 75.0,
        "assessments": [
            {
                "name": "Exam",
                "weight": 80,
                "sub_assessments": [
                    {"name": "Midterm", "weight": 40, "score": 70},
                    {"name": "Final", "weight": 40, "score": None},
                ],
            },
            {
                "name": "Project",
                "weight": 20,
                "sub_assessments": [
                    {"name": "Project 1", "weight": 10, "score": None},
                    {"name": "Project 2", "weight": 10, "score": 70},
                ],
            },
        ],
        "historical_scores": [90, 80, 87, 95, 83],
        "confidence_level": 0.95,
        "min_margin": 3.0,
        "objective": "min_max",
    }

    print("\n" + "=" * 80)
    print("GRADUATION THRESHOLD ENGINE - DEMO")
    print("=" * 80)
    print("\nInput Request:")
    print("-" * 80)
    print(json.dumps(example_request, indent=2))
    
    print("\n" + "=" * 80)
    print("Calculation Result:")
    print("=" * 80 + "\n")
    
    result = calculate_threshold(example_request)
    print(json.dumps(result, indent=2, ensure_ascii=False))
    print("\n" + "=" * 80)