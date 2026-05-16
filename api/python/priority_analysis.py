"""
Effort Impact Analyzer
----------------------
Deterministic Multi-Criteria Decision Analysis (MCDA) for evaluating
whether a task is worth prioritizing.

Scoring dimensions:
  1. Grade Impact     - how much does this task affect the final grade?
  2. Effort Cost      - how expensive is it in time/energy?
  3. Urgency          - how close is the deadline?
  4. Grade Gap        - how critical is it relative to passing threshold?
  5. Stress Risk      - estimated psychological cost

Decision:  HIGH / MEDIUM / LOW priority
"""

from http.server import BaseHTTPRequestHandler
import json
import math
import os
from datetime import datetime


# ---------------------------------------------------------------------------
# MCDA Engine
# ---------------------------------------------------------------------------

WEIGHT_IMPACT = 0.25
WEIGHT_URGENCY = 0.35
WEIGHT_GAP = 0.20
WEIGHT_EFFORT = 0.12  # inverted (high effort → lower score)
# WEIGHT_STRESS = 0.08  # inverted

"""
input:
sks
bobot asesmen
nilai saat ini
passing target
estimasi jam


"""

HIGH_THRESHOLD = 0.5
MEDIUM_THRESHOLD = 0.3

# Criteria order used in TOPSIS and matrix construction
CRITERIA_KEYS = ["grade_impact", "urgency", "gap_factor", "effort_penalty", "stress_penalty"]
CRITERIA_WEIGHTS = [WEIGHT_IMPACT, WEIGHT_URGENCY, WEIGHT_GAP, WEIGHT_EFFORT, WEIGHT_STRESS]
CRITERIA_BENEFIT = [True, True, True, False, False]

TYPE_MULTIPLIER = { "exam": 1.30, "project": 1.15, "quiz": 1.15, "homework": 0.95, "generic": 1.00 }


def _normalize(value: float, min_val: float, max_val: float) -> float:
    """Clamp and normalize value to [0, 1]."""
    if max_val == min_val:
        return 0.5
    return max(0.0, min(1.0, (value - min_val) / (max_val - min_val)))


def _urgency_score(deadline_days: float) -> float:
    """Exponential urgency: very urgent within 3 days, low urgency after 14 days."""
    if deadline_days <= 0:
        return 1.0
    return math.exp(-0.15 * deadline_days)


def _effort_score(estimated_hours: float, weekly_capacity_hours: float) -> float:
    """Normalized effort cost. Higher effort → higher cost → lower priority contribution."""
    if weekly_capacity_hours <= 0:
        return 1.0
    ratio = estimated_hours / weekly_capacity_hours
    return min(1.0, ratio)   # inverted below


def _clamp01(x: float) -> float:
    return max(0.0, min(1.0, float(x)))


def compute_breakdown(data: dict) -> dict:
    """Compute per-criterion scores (all normalized 0..1) and composite score.

    Returns dict with breakdown keys, composite score and auxiliary values.
    """
    grade_weight = float(data.get("grade_weight", 0))
    estimated_hours = float(data.get("estimated_hours", 1))
    deadline_days = float(data.get("deadline_days", 7))
    current_grade = float(data.get("current_grade", 0))
    passing_grade = float(data.get("passing_grade", 75))
    stress_level = float(data.get("stress_level", 3))
    weekly_capacity = float(data.get("weekly_capacity_hours", 40))
    task_type = str(data.get("task_type", "generic")).lower()

    # impact adjusted by task type
    multiplier = TYPE_MULTIPLIER.get(task_type, 1.0)
    impact = min(1.0, (grade_weight / 100.0) * multiplier)

    urgency = _urgency_score(deadline_days)

    gap = passing_grade - current_grade
    gap_factor = _normalize(gap, -20, 40)

    effort_raw = _effort_score(estimated_hours, weekly_capacity)
    effort_penalty = effort_raw

    stress_penalty = _normalize(stress_level, 1, 5)

    raw_score = (
        WEIGHT_IMPACT * impact
        + WEIGHT_URGENCY * urgency
        + WEIGHT_GAP * gap_factor
        - WEIGHT_EFFORT * effort_penalty
        - WEIGHT_STRESS * stress_penalty
    )
    composite = _normalize(raw_score, -0.20, 0.80)

    return {
        "impact": impact,
        "urgency": urgency,
        "gap": gap,
        "gap_factor": gap_factor,
        "effort_raw": effort_raw,
        "effort_penalty": effort_penalty,
        "stress_penalty": stress_penalty,
        "composite": composite,
    }


def _priority_from_score(score: float) -> tuple[str, str, str]:
    """Map a 0..1 score to priority, action, and color."""
    if score >= HIGH_THRESHOLD:
        return "HIGH", "Do it fully and on time", "green"
    if score >= MEDIUM_THRESHOLD:
        return "MEDIUM", "Do it, but time-box your effort", "yellow"
    return "LOW", "Consider skipping or doing minimally", "red"


def _build_topsis_matrix(results: list[dict]) -> list[list[float]]:
    """Extract TOPSIS input matrix from analyzed task results."""
    matrix = []
    for result in results:
        breakdown = result.get("breakdown", {})
        row = [float(breakdown.get(key, 0.0)) for key in CRITERIA_KEYS]
        matrix.append(row)
    return matrix


def rank_tasks_with_topsis(results: list[dict], tasks: list[dict]) -> list[dict]:
    """Attach TOPSIS scores, derive priority from them, and sort descending.
    
    Args:
        results: analyzed task results from analyze_effort_impact
        tasks: original task data to check current_grade >= passing_grade
    """
    cols = len(CRITERIA_KEYS)
    rows = len(results)
    if rows == 0:
        return results

    matrix = _build_topsis_matrix(results)

    denom = [0.0] * cols
    for j in range(cols):
        squared_sum = 0.0
        for i in range(rows):
            squared_sum += matrix[i][j] ** 2
        denom[j] = math.sqrt(squared_sum) or 1.0

    weighted = [[0.0] * cols for _ in range(rows)]
    for i in range(rows):
        for j in range(cols):
            weighted[i][j] = (matrix[i][j] / denom[j]) * CRITERIA_WEIGHTS[j]

    ideal_positive = [0.0] * cols
    ideal_negative = [0.0] * cols
    for j in range(cols):
        column_values = [weighted[i][j] for i in range(rows)]
        if CRITERIA_BENEFIT[j]:
            ideal_positive[j] = max(column_values)
            ideal_negative[j] = min(column_values)
        else:
            ideal_positive[j] = min(column_values)
            ideal_negative[j] = max(column_values)

    closeness_scores = [0.0] * rows
    for i in range(rows):
        distance_positive = 0.0
        distance_negative = 0.0
        for j in range(cols):
            distance_positive += (weighted[i][j] - ideal_positive[j]) ** 2
            distance_negative += (weighted[i][j] - ideal_negative[j]) ** 2
        distance_positive = math.sqrt(distance_positive)
        distance_negative = math.sqrt(distance_negative)
        denominator = (distance_positive + distance_negative) or 1.0
        closeness_scores[i] = distance_negative / denominator

    for i, result in enumerate(results):
        topsis_score = round(closeness_scores[i], 4)
        result["topsis_score"] = topsis_score
        result["priority_basis"] = "topsis"
        result["priority"], result["action"], result["color"] = _priority_from_score(topsis_score)
        
        # Override: if grade already meets or exceeds passing threshold
        if i < len(tasks):
            current_grade = float(tasks[i].get("current_grade", 0))
            passing_grade = float(tasks[i].get("passing_grade", 75))
            if current_grade >= passing_grade:
                result["priority"] = "LOW"
                result["action"] = "Already passing - focus on other tasks"
                result["color"] = "gray"
                result["topsis_score"] = 0.0  # Penalti score agar tetap di ranking bawah
                result["composite_score"] = 0.0  # Penalti score agar tetap di ranking bawah

    results.sort(key=lambda item: item["topsis_score"], reverse=True)
    return results


def analyze_effort_impact(data: dict) -> dict:
    task_name = data.get("task_name", "Task")
    reported_conf = data.get("confidence", None)

    # compute breakdown + composite
    subs = compute_breakdown(data)
    impact = subs["impact"]
    urgency = subs["urgency"]
    gap = subs["gap"]
    gap_factor = subs["gap_factor"]
    effort_raw = subs["effort_raw"]
    effort_penalty = subs["effort_penalty"]
    stress_penalty = subs["stress_penalty"]
    composite = subs["composite"]

    # Confidence: prefer user-reported, otherwise heuristic
    if reported_conf is not None:
        try:
            confidence = _clamp01(float(reported_conf))
        except Exception:
            confidence = 0.5
    else:
        estimated_hours = float(data.get("estimated_hours", 1))
        weekly_capacity = float(data.get("weekly_capacity_hours", 40))
        deadline_days = float(data.get("deadline_days", 7))
        effort_ratio = min(1.0, estimated_hours / max(1.0, weekly_capacity))
        deadline_factor = 1.0 if deadline_days <= 3 else 0.95 if deadline_days <= 14 else 0.9
        confidence = _clamp01(max(0.2, 1.0 - 0.5 * effort_ratio) * deadline_factor)

    # Decision mapping still uses composite score for the single-item path
    priority, action, color = _priority_from_score(composite)

    # Override: if grade already meets or exceeds passing threshold, deprioritize
    current_grade = float(data.get("current_grade", 0))
    passing_grade = float(data.get("passing_grade", 75))
    if current_grade >= passing_grade:
        priority = "LOW"
        action = "Already passing - focus on other tasks"
        color = "gray"

    # efficiency
    grade_weight = float(data.get("grade_weight", 0))
    estimated_hours = float(data.get("estimated_hours", 1))
    efficiency = round(grade_weight / max(1, estimated_hours), 2)

    # rationale - use new comprehensive builder
    # rationale_parts = _build_rationale_parts(data, {
    #     "grade_impact": impact,
    #     "urgency": urgency,
    #     "gap_factor": gap_factor,
    #     "effort_penalty": effort_penalty,
    #     "stress_penalty": stress_penalty,
    # })

    # if rationale_parts:
    #     rationale = f"{task_name}: " + "; ".join(rationale_parts) + "."
    # else:
    #     rationale = f"{task_name} has moderate impact and manageable effort."

    return {
        "task_id": data.get("task_id"),
        "task_name": task_name,
        "task_type": str(data.get("task_type", "generic") ).lower(),
        "priority": priority,
        "action": action,
        "color": color,
        "composite_score": round(composite, 3),
        "confidence": round(confidence, 2),
        "efficiency_ratio": efficiency,
        "breakdown": {
            "grade_impact": round(impact, 3),
            "urgency": round(urgency, 3),
            "gap_factor": round(gap_factor, 3),
            "effort_penalty": round(effort_penalty, 3),
            "stress_penalty": round(stress_penalty, 3),
        },
        # "rationale": rationale,
        "details": data,
    }


# ---------------------------------------------------------------------------
# Batch mode: analyze multiple tasks at once
# ---------------------------------------------------------------------------

def analyze_batch(data: dict) -> dict:
    tasks = data.get("tasks", [])
    if not tasks:
        return {"error": "No tasks provided"}

    # support optional ranking method: 'weighted' (default) or 'topsis'
    method = str(data.get("method", "weighted")).lower()

    results = [analyze_effort_impact(t) for t in tasks]

    def _summary(res):
        return {
            "high": sum(1 for r in res if r["priority"] == "HIGH"),
            "medium": sum(1 for r in res if r["priority"] == "MEDIUM"),
            "low": sum(1 for r in res if r["priority"] == "LOW"),
        }

    if method == "topsis":
        rank_tasks_with_topsis(results, tasks)
        return {"method": "topsis", "tasks": results, "summary": _summary(results)}

    else:
        # default: sort by composite_score descending
        results.sort(key=lambda r: r["composite_score"], reverse=True)
        return {"method": "weighted", "tasks": results, "summary": _summary(results)}


def record_feedback(feedback: dict) -> dict:
    """Append feedback (accept/reject) as JSONL with timestamp for later calibration.

    Expected feedback fields: task_name, accepted (bool), composite_score (optional),
    user_id (optional), note (optional), confidence (optional)
    """
    try:
        base = os.path.dirname(__file__)
        logfile = os.path.join(base, "effort_feedback.jsonl")
        entry = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
        }
        if isinstance(feedback, dict):
            entry.update(feedback)
        else:
            entry["value"] = str(feedback)

        with open(logfile, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")

        return {"status": "ok", "path": logfile}
    except Exception as e:
        return {"status": "error", "error": str(e)}


# ---------------------------------------------------------------------------
# Vercel Handler
# ---------------------------------------------------------------------------

class handler(BaseHTTPRequestHandler):

    def log_message(self, format, *args):
        pass

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

            # Feedback logging: accept POSTs with a top-level "feedback" key
            if "feedback" in data:
                fb = data.get("feedback")
                result = record_feedback(fb)
                self._send_json(200, result)
                return

            # Support both single task and batch analysis
            if "tasks" in data:
                result = analyze_batch(data)
            else:
                result = analyze_effort_impact(data)

            self._send_json(200, result)
        except json.JSONDecodeError:
            self._send_json(400, {"error": "Invalid JSON"})
        except Exception as e:
            self._send_json(500, {"error": str(e)})

if __name__ == "__main__":
    data = {
        "method": "topsis",
        "tasks": [
            {
                "task_name": "Mathematics Midterm Exam",
                "task_type": "exam",
                "grade_weight": 25,
                "estimated_hours": 10,
                "deadline_days": 2,
                "current_grade": 58,
                "passing_grade": 70,
                "stress_level": 5,
                "weekly_capacity_hours": 20
            },
            {
                "task_name": "Physics Lab Report",
                "task_type": "project",
                "grade_weight": 15,
                "estimated_hours": 6,
                "deadline_days": 4,
                "current_grade": 62,
                "passing_grade": 70,
                "stress_level": 4,
                "weekly_capacity_hours": 18
            },
            {
                "task_name": "Programming Quiz 3",
                "task_type": "quiz",
                "grade_weight": 10,
                "estimated_hours": 2,
                "deadline_days": 1,
                "current_grade": 66,
                "passing_grade": 70,
                "stress_level": 3,
                "weekly_capacity_hours": 16
            },
            {
                "task_name": "History Essay Draft",
                "task_type": "assignment",
                "grade_weight": 12,
                "estimated_hours": 5,
                "deadline_days": 7,
                "current_grade": 74,
                "passing_grade": 70,
                "stress_level": 3,
                "weekly_capacity_hours": 15
            },
            {
                "task_name": "Chemistry Problem Set",
                "task_type": "homework",
                "grade_weight": 8,
                "estimated_hours": 4,
                "deadline_days": 3,
                "current_grade": 49,
                "passing_grade": 70,
                "stress_level": 4,
                "weekly_capacity_hours": 14
            },
            {
                "task_name": "Data Structures Project",
                "task_type": "project",
                "grade_weight": 20,
                "estimated_hours": 12,
                "deadline_days": 10,
                "current_grade": 55,
                "passing_grade": 70,
                "stress_level": 5,
                "weekly_capacity_hours": 18
            },
            {
                "task_name": "English Vocabulary Quiz",
                "task_type": "quiz",
                "grade_weight": 5,
                "estimated_hours": 1,
                "deadline_days": 2,
                "current_grade": 78,
                "passing_grade": 70,
                "stress_level": 1,
                "weekly_capacity_hours": 10
            },
            {
                "task_name": "Statistics Assignment 2",
                "task_type": "assignment",
                "grade_weight": 14,
                "estimated_hours": 7,
                "deadline_days": 5,
                "current_grade": 60,
                "passing_grade": 70,
                "stress_level": 4,
                "weekly_capacity_hours": 16
            },
            {
                "task_name": "Biology Practical Exam",
                "task_type": "exam",
                "grade_weight": 18,
                "estimated_hours": 8,
                "deadline_days": 6,
                "current_grade": 68,
                "passing_grade": 70,
                "stress_level": 5,
                "weekly_capacity_hours": 20
            },
            {
                "task_name": "Marketing Case Study",
                "task_type": "project",
                "grade_weight": 12,
                "estimated_hours": 4,
                "deadline_days": 14,
                "current_grade": 72,
                "passing_grade": 70,
                "stress_level": 2,
                "weekly_capacity_hours": 12
            },
            {
                "task_name": "Economics Weekly Homework",
                "task_type": "homework",
                "grade_weight": 6,
                "estimated_hours": 2,
                "deadline_days": 1,
                "current_grade": 40,
                "passing_grade": 70,
                "stress_level": 3,
                "weekly_capacity_hours": 10
            },
            {
                "task_name": "Computer Networks Quiz",
                "task_type": "quiz",
                "grade_weight": 9,
                "estimated_hours": 3,
                "deadline_days": 3,
                "current_grade": 71,
                "passing_grade": 70,
                "stress_level": 3,
                "weekly_capacity_hours": 14
            },
            {
                "task_name": "Sociology Term Paper",
                "task_type": "project",
                "grade_weight": 22,
                "estimated_hours": 15,
                "deadline_days": 20,
                "current_grade": 53,
                "passing_grade": 70,
                "stress_level": 4,
                "weekly_capacity_hours": 20
            },
            {
                "task_name": "Accounting Worksheet",
                "task_type": "assignment",
                "grade_weight": 7,
                "estimated_hours": 3,
                "deadline_days": 2,
                "current_grade": 69,
                "passing_grade": 70,
                "stress_level": 2,
                "weekly_capacity_hours": 12
            },
            {
                "task_name": "Design Portfolio Review",
                "task_type": "project",
                "grade_weight": 16,
                "estimated_hours": 9,
                "deadline_days": 8,
                "current_grade": 76,
                "passing_grade": 70,
                "stress_level": 4,
                "weekly_capacity_hours": 18
            },
            {
                "task_name": "Philosophy Reflection Essay",
                "task_type": "assignment",
                "grade_weight": 10,
                "estimated_hours": 5,
                "deadline_days": 9,
                "current_grade": 61,
                "passing_grade": 70,
                "stress_level": 2,
                "weekly_capacity_hours": 15
            },
            {
                "task_name": "Information Systems Final Exam",
                "task_type": "exam",
                "grade_weight": 30,
                "estimated_hours": 14,
                "deadline_days": 40,
                "current_grade": 64,
                "passing_grade": 70,
                "stress_level": 5,
                "weekly_capacity_hours": 25
            },
            {
                "task_name": "Literature Reading Response",
                "task_type": "homework",
                "grade_weight": 4,
                "estimated_hours": 2,
                "deadline_days": 5,
                "current_grade": 80,
                "passing_grade": 70,
                "stress_level": 1,
                "weekly_capacity_hours": 8
            }
        ]
    }
    
    result = analyze_batch(data)
    for task in result.get("tasks", []):
        print(f"{task['task_name']}: Priority={task['priority']}, task weight={task['details']['grade_weight']}, Estimated Hours={task['details']['estimated_hours']}, Score={task['composite_score']}, Score Topsis={task['topsis_score']}, 'Deadline in {task['details']['deadline_days']} days', 'Gap in {task['details']['passing_grade'] - task['details']['current_grade']}'")
    print("Summary:", result.get("summary", {}))
    # print(json.dumps(analyze_batch(data), indent=2))
    