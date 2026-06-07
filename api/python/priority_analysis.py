"""
Effort Impact Analyzer
----------------------
Deterministic Multi-Criteria Decision Analysis (MCDA) for evaluating
whether a task is worth prioritizing.

Scoring dimensions:
    1. Grade Impact     - how much does this task affect the final grade?
    2. SKS Load         - how large the course credit weight is
    3. Effort Cost      - how expensive is it in time/energy?
    4. Urgency          - how close is the deadline?
    5. Grade Gap        - how critical it is relative to passing threshold

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

WEIGHT_IMPACT       = 0.22      # how much the task affects the final grade
WEIGHT_SKS          = 0.08      # course credit weight: a high-grade-impact
WEIGHT_URGENCY      = 0.30      # how close is the deadline?
WEIGHT_GAP          = 0.18      # how critical it is relative to passing threshold
WEIGHT_EFFICIENCY   = 0.14      # grade-per-hour benefit: same grade in less time wins
WEIGHT_EFFORT       = 0.08      # remaining cost penalty for genuinely overwhelming tasks

HIGH_THRESHOLD = 0.5
MEDIUM_THRESHOLD = 0.3

# Criteria order used in TOPSIS and matrix construction. Efficiency is a
# benefit criterion (higher → better); effort_penalty is the only cost.
CRITERIA_KEYS = [
    "urgency",
    "grade_impact",
    "sks_score",
    "gap_factor",
    "efficiency",
    "effort_penalty",
]
CRITERIA_WEIGHTS = [
    WEIGHT_URGENCY,
    WEIGHT_IMPACT,
    WEIGHT_SKS,
    WEIGHT_GAP,
    WEIGHT_EFFICIENCY,
    WEIGHT_EFFORT,
]
CRITERIA_BENEFIT = [
    True,   # urgency: more urgent is better to prioritize
    True,   # grade_impact: higher impact is better
    True,   # sks_score: more credits is generally more important
    True,   # gap_factor: bigger gap to passing threshold is more critical
    True,   # efficiency: higher grade-per-hour is better
    False,  # effort_penalty: higher effort cost should reduce priority
]

TYPE_MULTIPLIER = { "exam": 1.00, "project": 1.15, "quiz": 1.00, "homework": 0.95, "generic": 1.00 }


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


def _effort_score(
    estimated_hours: float,
    weekly_capacity_hours: float,
    deadline_days: float,
    completion_pct: float = 0.0,
) -> float:
    """Effort cost as a fraction of the *time available before the deadline*.

    A 3-hour task is trivial when you have a week, crushing when it's due in
    two hours. So we compare remaining hours to the capacity-adjusted hours
    available before the deadline, not to a flat weekly budget.

    Also subtracts the portion already completed: a 10-hour task at 80% done
    only has 2 hours of real work left.

    The result is in [0, 1] where:
      0.00 - 0.30  -> easy, fits with plenty of slack
      0.30 - 0.60  -> moderate
      0.60 - 0.85  -> tight
      0.85 - 1.00  -> overwhelming / impossible
    """
    if weekly_capacity_hours <= 0:
        return 1.0

    # Hours of real work still required.
    completion = max(0.0, min(100.0, completion_pct))
    remaining = max(0.0, estimated_hours * (1.0 - completion / 100.0))
    if remaining <= 0.0:
        return 0.0

    # Capacity-adjusted hours available before the deadline.
    # Treat day 0 as "due now", give at least one capacity-hour so we don't
    # divide by zero and so a tiny task on the same day isn't reported as
    # infinitely costly.
    daily_capacity = weekly_capacity_hours / 7.0
    effective_days = max(deadline_days, 1.0)
    available = max(1.0, daily_capacity * effective_days)

    ratio = remaining / available

    # Slightly convex curve so the score discriminates between "tight" and
    # "impossible": ratio 0.5 -> 0.40, ratio 1.0 -> 1.0, ratio >1 saturates.
    if ratio >= 1.0:
        return 1.0
    return ratio ** 1.2


def _clamp01(x: float) -> float:
    """Clamp a float to the [0, 1] range."""
    return max(0.0, min(1.0, float(x)))


def compute_breakdown(data: dict) -> dict:
    """Compute normalized criteria values and the composite score for one task."""
    grade_weight    = float(data.get("grade_weight", 0))
    sks             = float(data.get("sks", data.get("credits", 0)))
    estimated_hours = float(data.get("estimated_hours", 1))
    deadline_days   = float(data.get("deadline_days", 7))
    current_grade   = float(data.get("current_grade", 0))
    passing_grade   = float(data.get("passing_grade", 75))
    weekly_capacity = float(data.get("weekly_capacity_hours", 40))
    completion_pct  = float(data.get("completion_pct", 0))
    task_type       = str(data.get("task_type", "generic")).lower()

    # impact adjusted by task type
    multiplier = TYPE_MULTIPLIER.get(task_type, 1.0)
    impact = min(1.0, (grade_weight / 100.0) * multiplier)

    urgency = _urgency_score(deadline_days)

    sks_score = _normalize(sks, 0, 6)

    gap = passing_grade - current_grade
    gap_factor = _normalize(gap, -20, 40)

    # Effort now compares remaining work to the capacity-adjusted hours
    # available before the deadline (instead of a flat weekly budget).
    effort_raw = _effort_score(
        estimated_hours,
        weekly_capacity,
        deadline_days,
        completion_pct,
    )
    effort_penalty = effort_raw

    # Time-efficiency = grade-weight earned per hour of remaining work. This
    # is the direct expression of "same grade in less time should win".
    # Normalized against 25 (a very efficient task: 25% of grade for 1 hour).
    remaining_hours = max(1.0, estimated_hours * (1.0 - max(0.0, min(100.0, completion_pct)) / 100.0))
    efficiency_raw = grade_weight / remaining_hours
    efficiency = _normalize(efficiency_raw, 0.0, 25.0)

    raw_score = (
        WEIGHT_IMPACT * impact
        + WEIGHT_SKS * sks_score
        + WEIGHT_URGENCY * urgency
        + WEIGHT_GAP * gap_factor
        + WEIGHT_EFFICIENCY * efficiency
        - WEIGHT_EFFORT * effort_penalty
    )
    composite = _normalize(raw_score, -0.10, 0.92)

    return {
        "impact": impact,
        "sks_score": sks_score,
        "urgency": urgency,
        "gap": gap,
        "gap_factor": gap_factor,
        "efficiency_raw": efficiency_raw,
        "efficiency": efficiency,
        "effort_raw": effort_raw,
        "effort_penalty": effort_penalty,
        "composite": composite,
    }


def _priority_from_composite_score(score: float) -> tuple[str, str, str]:
    """Map a 0..1 score to priority, action, and color."""
    if score >= HIGH_THRESHOLD:
        return "HIGH", "Worth your energy - do it fully and on time", "green"
    if score >= MEDIUM_THRESHOLD:
        return "MEDIUM", "Helpful but flexible - time-box your effort", "yellow"
    return "LOW", "Safe to minimize - protect your energy for higher-impact work", "red"


def _calculate_confidence(data: dict) -> float:
    """Derive confidence from optional user input and task difficulty."""
    reported_confidence = data.get("confidence", None)
    if reported_confidence is not None:
        try:
            return _clamp01(float(reported_confidence))
        except Exception:
            return 0.5

    estimated_hours = float(data.get("estimated_hours", 1))
    weekly_capacity = float(data.get("weekly_capacity_hours", 40))
    deadline_days = float(data.get("deadline_days", 7))
    effort_ratio = min(1.0, estimated_hours / max(1.0, weekly_capacity))
    deadline_factor = 1.0 if deadline_days <= 3 else 0.95 if deadline_days <= 14 else 0.9
    return _clamp01(max(0.2, 1.0 - 0.5 * effort_ratio) * deadline_factor)


def _build_batch_summary(results: list[dict]) -> dict:
    """Count HIGH, MEDIUM, and LOW results for batch responses."""
    return {
        "high": sum(1 for result in results if result["priority"] == "HIGH"),
        "medium": sum(1 for result in results if result["priority"] == "MEDIUM"),
        "low": sum(1 for result in results if result["priority"] == "LOW"),
    }


def rank_tasks_with_topsis(results: list[dict], tasks: list[dict]) -> list[dict]:
    """Attach TOPSIS scores, derive priority from them, and sort descending."""
    cols = len(CRITERIA_KEYS)
    rows = len(results)
    if rows == 0:
        return results

    matrix = []
    for result in results:
        breakdown = result.get("breakdown", {})
        matrix.append([float(breakdown.get(key, 0.0)) for key in CRITERIA_KEYS])

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
        result["priority"], result["action"], result["color"] = _priority_from_composite_score(topsis_score)

        # Override: if grade already meets or exceeds passing threshold
        if i < len(tasks):
            current_grade = float(tasks[i].get("current_grade", 0))
            passing_grade = float(tasks[i].get("passing_grade", 75))
            if current_grade >= passing_grade:
                result["priority"] = "LOW"
                result["action"] = "Already passing - focus your energy elsewhere"
                result["color"] = "gray"
                result["topsis_score"] = 0.0  # Penalti score agar tetap di ranking bawah
                result["composite_score"] = 0.0  # Penalti score agar tetap di ranking bawah

    results.sort(key=lambda item: item["topsis_score"], reverse=True)
    return results


def analyze_effort_impact(data: dict) -> dict:
    """Analyze a single task and return deterministic priority metadata."""
    task_name = data.get("task_name", "Task")
    breakdown = compute_breakdown(data)
    confidence = _calculate_confidence(data)

    impact = breakdown["impact"]
    sks_score = breakdown["sks_score"]
    urgency = breakdown["urgency"]
    gap_factor = breakdown["gap_factor"]
    effort_penalty = breakdown["effort_penalty"]
    composite = breakdown["composite"]

    # Decision mapping still uses composite score for the single-item path
    priority, action, color = _priority_from_composite_score(composite)

    # Override: if grade already meets or exceeds passing threshold, deprioritize
    current_grade = float(data.get("current_grade", 0))
    passing_grade = float(data.get("passing_grade", 75))
    if current_grade >= passing_grade:
        priority = "LOW"
        action = "Already passing - focus your energy elsewhere"
        color = "gray"

    # efficiency
    grade_weight = float(data.get("grade_weight", 0))
    estimated_hours = float(data.get("estimated_hours", 1))
    efficiency = round(grade_weight / max(1, estimated_hours), 2)

    return {
        "task_id": data.get("task_id"),
        "task_name": task_name,
        "task_type": str(data.get("task_type", "generic")).lower(),
        "priority": priority,
        "action": action,
        "color": color,
        "composite_score": round(composite, 3),
        "confidence": round(confidence, 2),
        "efficiency_ratio": efficiency,
        "breakdown": {
            "grade_impact": round(impact, 3),
            "sks_score": round(sks_score, 3),
            "urgency": round(urgency, 3),
            "gap_factor": round(gap_factor, 3),
            "effort_penalty": round(effort_penalty, 3),
        },
        "details": data,
    }


# ---------------------------------------------------------------------------
# Batch mode: analyze multiple tasks at once
# ---------------------------------------------------------------------------

def analyze_batch(data: dict) -> dict:
    """Analyze a batch of tasks and optionally rank them with TOPSIS."""
    tasks = data.get("tasks", [])
    if not tasks:
        return {"error": "No tasks provided"}

    # support optional ranking method: 'weighted' (default) or 'topsis'
    method = str(data.get("method", "weighted")).lower()

    results = [analyze_effort_impact(t) for t in tasks]

    if method == "topsis":
        rank_tasks_with_topsis(results, tasks)
        return {"method": "topsis", "tasks": results, "summary": _build_batch_summary(results)}

    # default: sort by composite_score descending
    results.sort(key=lambda r: r["composite_score"], reverse=True)
    return_dict = {"method": "weighted", "tasks": results, "summary": _build_batch_summary(results)}
    
    _print_batch_report(return_dict)  # Print the batch report for local demos
    return return_dict

def record_feedback(feedback: dict) -> dict:
    """Append feedback as JSONL for future calibration."""
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
    """HTTP entry point used by the Vercel function runtime."""

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


def _print_batch_report(result: dict) -> None:
    """Print a compact, readable batch-analysis report for local demos."""
    tasks = result.get("tasks", [])
    summary = result.get("summary", {})

    print()
    print("=" * 92)
    print("PRIORITY ANALYSIS DEMO")
    print("=" * 92)
    print(
        f"Summary: high={summary.get('high', 0)} | medium={summary.get('medium', 0)} | low={summary.get('low', 0)}"
    )
    print("-" * 92)
    print(f"{'Rank':<5} {'Task':<32} {'Priority':<8} {'Composite':<10} {'TOPSIS':<8} {'SKS':<6} {'Action'}")
    print("-" * 92)

    for index, task in enumerate(tasks, start=1):
        task_name = task.get("task_name", "Task")[:31]
        priority = task.get("priority", "-")
        composite = f"{task.get('composite_score', 0):.3f}"
        topsis = task.get("topsis_score")
        topsis_text = f"{topsis:.3f}" if isinstance(topsis, (int, float)) else "-"
        sks_text = f"{task.get('details', {}).get('sks', 0):.0f}" if isinstance(task.get('details', {}), dict) else "-"
        action = task.get("action", "")
        print(f"{index:<5} {task_name:<32} {priority:<8} {composite:<10} {topsis_text:<8} {sks_text:<6} {action}")

    print("-" * 92)


if __name__ == "__main__":
    demo_data = {
        "method": "topsis",
        "tasks": [
            # {
            #     "task_name": "Mathematics Midterm Exam",
            #     "task_type": "exam",
            #     "sks": 3,
            #     "grade_weight": 25,
            #     "estimated_hours": 10,
            #     "deadline_days": 2,
            #     "current_grade": 58,
            #     "passing_grade": 70,
            #     "weekly_capacity_hours": 20,
            # },
            # {
            #     "task_name": "Physics Lab Report",
            #     "task_type": "project",
            #     "sks": 2,
            #     "grade_weight": 15,
            #     "estimated_hours": 6,
            #     "deadline_days": 4,
            #     "current_grade": 62,
            #     "passing_grade": 70,
            #     "weekly_capacity_hours": 18,
            # },
            # {
            #     "task_name": "Programming Quiz 3",
            #     "task_type": "quiz",
            #     "sks": 1,
            #     "grade_weight": 10,
            #     "estimated_hours": 2,
            #     "deadline_days": 1,
            #     "current_grade": 66,
            #     "passing_grade": 70,
            #     "weekly_capacity_hours": 16,
            # },
            # {
            #     "task_name": "History Essay Draft",
            #     "task_type": "assignment",
            #     "sks": 2,
            #     "grade_weight": 12,
            #     "estimated_hours": 5,
            #     "deadline_days": 7,
            #     "current_grade": 74,
            #     "passing_grade": 70,
            #     "weekly_capacity_hours": 15,
            # },
            # {
            #     "task_name": "Chemistry Problem Set",
            #     "task_type": "homework",
            #     "sks": 2,
            #     "grade_weight": 8,
            #     "estimated_hours": 4,
            #     "deadline_days": 3,
            #     "current_grade": 49,
            #     "passing_grade": 70,
            #     "weekly_capacity_hours": 14,
            # },
            # {
            #     "task_name": "Data Structures Project",
            #     "task_type": "project",
            #     "sks": 4,
            #     "grade_weight": 20,
            #     "estimated_hours": 12,
            #     "deadline_days": 10,
            #     "current_grade": 55,
            #     "passing_grade": 70,
            #     "weekly_capacity_hours": 18,
            # },
            # {
            #     "task_name": "English Vocabulary Quiz",
            #     "task_type": "quiz",
            #     "sks": 1,
            #     "grade_weight": 5,
            #     "estimated_hours": 1,
            #     "deadline_days": 2,
            #     "current_grade": 78,
            #     "passing_grade": 70,
            #     "weekly_capacity_hours": 10,
            # },
            # {
            #     "task_name": "Statistics Assignment 2",
            #     "task_type": "assignment",
            #     "sks": 3,
            #     "grade_weight": 14,
            #     "estimated_hours": 7,
            #     "deadline_days": 5,
            #     "current_grade": 60,
            #     "passing_grade": 70,
            #     "weekly_capacity_hours": 16,
            # },
            # {
            #     "task_name": "Biology Practical Exam",
            #     "task_type": "exam",
            #     "sks": 3,
            #     "grade_weight": 18,
            #     "estimated_hours": 8,
            #     "deadline_days": 6,
            #     "current_grade": 68,
            #     "passing_grade": 70,
            #     "weekly_capacity_hours": 20,
            # },
            # {
            #     "task_name": "Marketing Case Study",
            #     "task_type": "project",
            #     "sks": 2,
            #     "grade_weight": 12,
            #     "estimated_hours": 4,
            #     "deadline_days": 14,
            #     "current_grade": 72,
            #     "passing_grade": 70,
            #     "weekly_capacity_hours": 12,
            # },
            # {
            #     "task_name": "Economics Weekly Homework",
            #     "task_type": "homework",
            #     "sks": 1,
            #     "grade_weight": 6,
            #     "estimated_hours": 2,
            #     "deadline_days": 1,
            #     "current_grade": 40,
            #     "passing_grade": 70,
            #     "weekly_capacity_hours": 10,
            # },
            # {
            #     "task_name": "Computer Networks Quiz",
            #     "task_type": "quiz",
            #     "sks": 2,
            #     "grade_weight": 9,
            #     "estimated_hours": 3,
            #     "deadline_days": 3,
            #     "current_grade": 71,
            #     "passing_grade": 70,
            #     "weekly_capacity_hours": 14,
            # },
            # {
            #     "task_name": "Sociology Term Paper",
            #     "task_type": "project",
            #     "sks": 3,
            #     "grade_weight": 22,
            #     "estimated_hours": 15,
            #     "deadline_days": 20,
            #     "current_grade": 53,
            #     "passing_grade": 70,
            #     "weekly_capacity_hours": 20,
            # },
            # {
            #     "task_name": "Accounting Worksheet",
            #     "task_type": "assignment",
            #     "sks": 1,
            #     "grade_weight": 7,
            #     "estimated_hours": 3,
            #     "deadline_days": 2,
            #     "current_grade": 69,
            #     "passing_grade": 70,
            #     "weekly_capacity_hours": 12,
            # },
            # {
            #     "task_name": "Design Portfolio Review",
            #     "task_type": "project",
            #     "sks": 2,
            #     "grade_weight": 16,
            #     "estimated_hours": 9,
            #     "deadline_days": 8,
            #     "current_grade": 76,
            #     "passing_grade": 70,
            #     "weekly_capacity_hours": 18,
            # },
            # {
            #     "task_name": "Philosophy Reflection Essay",
            #     "task_type": "assignment",
            #     "sks": 2,
            #     "grade_weight": 10,
            #     "estimated_hours": 5,
            #     "deadline_days": 9,
            #     "current_grade": 61,
            #     "passing_grade": 70,
            #     "weekly_capacity_hours": 15,
            # },
            # {
            #     "task_name": "Information Systems Final Exam",
            #     "task_type": "exam",
            #     "sks": 4,
            #     "grade_weight": 30,
            #     "estimated_hours": 14,
            #     "deadline_days": 40,
            #     "current_grade": 64,
            #     "passing_grade": 70,
            #     "weekly_capacity_hours": 25,
            # },
            # {
            #     "task_name": "Literature Reading Response",
            #     "task_type": "homework",
            #     "sks": 1,
            #     "grade_weight": 4,
            #     "estimated_hours": 2,
            #     "deadline_days": 5,
            #     "current_grade": 80,
            #     "passing_grade": 70,
            #     "weekly_capacity_hours": 8,
            # },
            {
                "task_name": "project",
                "task_type": "project",
                "sks": 3,
                "grade_weight": 20,
                "estimated_hours": 20,
                "deadline_days": 2,
                "current_grade": 23,
                "passing_grade": 75,
                "weekly_capacity_hours": 8*5,
            },
                        {
                "task_name": "homework",
                "task_type": "homework",
                "sks": 2,
                "grade_weight": 10,
                "estimated_hours": 2,
                "deadline_days": 1,
                "current_grade": 18,
                "passing_grade": 60,
                "weekly_capacity_hours": 8*5,
            }
        ],
    }
    
    demo_data = {
            "method": "topsis",
            "tasks": [
{
    "task_id": "ca07bc04-5234-46f4-b2ad-99aff9bf3d38",
    "task_name": "homework1",
    "task_type": "homework",
    "sks": 2,
    "grade_weight": 10,
    "estimated_hours": 2,
    "deadline_days": 2,
    "current_grade": 18,
    "passing_grade": 65,
    "weekly_capacity_hours": 49
},
{
    "task_id": "61f76490-34d4-4649-8afa-9fa7f9f47b15",
    "task_name": "tes",
    "task_type": "generic",
    "sks": 3,
    "grade_weight": 30,
    "estimated_hours": 20,
    "deadline_days": 10,
    "current_grade": 50,
    "passing_grade": 75,
    "weekly_capacity_hours": 49
}
            ]
        }

    _print_batch_report(analyze_batch(demo_data))
    
    print(json.dumps(analyze_batch(demo_data), indent=2))
