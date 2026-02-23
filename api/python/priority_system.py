"""
Priority Recommendation System
--------------------------------
Deterministic scheduling algorithm that ranks tasks and produces a
day-by-day study plan.

Algorithm:
  1. Score each task using weighted criteria
     - Deadline urgency    (exponential decay)
     - Grade weight        (higher weight = higher priority)
     - Difficulty          (hard tasks need more lead time)
     - Grade gap           (below-passing courses get boosted)
     - Completion gap      (undone tasks ranked higher)

  2. Sort by composite priority score (descending)

  3. Greedy day-by-day slot allocation
     - Assign top-priority tasks to earliest available days
     - Respect daily hour limit and task duration
     - Output a schedule list with day assignments
"""

from http.server import BaseHTTPRequestHandler
import json
import math
from datetime import date, timedelta


# ---------------------------------------------------------------------------
# Priority scoring
# ---------------------------------------------------------------------------

WEIGHT_DEADLINE    = 0.30
WEIGHT_GRADE       = 0.25
WEIGHT_GAP         = 0.20
WEIGHT_DIFFICULTY  = 0.15
WEIGHT_COMPLETION  = 0.10

DIFFICULTY_MAP = {"easy": 1, "medium": 2, "hard": 3, "very_hard": 4}


def _deadline_urgency(days: float) -> float:
    """Exponential urgency score. 0 days = 1.0, 14+ days ≈ 0.1."""
    if days <= 0:
        return 1.0
    return math.exp(-0.18 * days)


def _grade_score(weight: float) -> float:
    return weight / 100.0


def _gap_score(current: float, passing: float) -> float:
    gap = passing - current
    if gap <= 0:
        return 0.0
    return min(1.0, gap / 30.0)


def _difficulty_urgency(difficulty_label: str, days: float) -> float:
    """Hard tasks need more lead time → higher urgency if deadline is close."""
    level = DIFFICULTY_MAP.get(difficulty_label.lower(), 2)
    # Scale: harder + closer → higher score
    return min(1.0, (level / 4.0) * _deadline_urgency(days / 2))


def _completion_gap_score(completion_pct: float) -> float:
    return 1.0 - (completion_pct / 100.0)


def _priority_score(task: dict, current_grade: float, passing_grade: float) -> float:
    days        = float(task.get("deadline_days", 7))
    weight      = float(task.get("grade_weight", 0))
    difficulty  = task.get("difficulty", "medium")
    completion  = float(task.get("completion_pct", 0))

    urgency    = _deadline_urgency(days)
    grade      = _grade_score(weight)
    gap        = _gap_score(current_grade, passing_grade)
    diff_urg   = _difficulty_urgency(difficulty, days)
    comp_gap   = _completion_gap_score(completion)

    return (
        WEIGHT_DEADLINE   * urgency
      + WEIGHT_GRADE      * grade
      + WEIGHT_GAP        * gap
      + WEIGHT_DIFFICULTY * diff_urg
      + WEIGHT_COMPLETION * comp_gap
    )


# ---------------------------------------------------------------------------
# Scheduler
# ---------------------------------------------------------------------------

def _hours_needed(task: dict) -> float:
    hours = float(task.get("estimated_hours", 1))
    completion = float(task.get("completion_pct", 0))
    return hours * (1 - completion / 100.0)


def build_schedule(
    scored_tasks: list,
    daily_limit: float,
    start_date: date,
) -> list:
    """
    Greedy day-by-day assignment.
    Returns list of schedule entries: {day, date, task_name, hours_allocated}.
    """
    schedule = []
    day_idx = 0
    day_hours_used = 0.0

    for task in scored_tasks:
        remaining = _hours_needed(task)
        name = task.get("name", "Task")

        while remaining > 0.05:
            if day_hours_used >= daily_limit:
                day_idx += 1
                day_hours_used = 0.0

            slot = min(remaining, daily_limit - day_hours_used)
            if slot <= 0:
                day_idx += 1
                day_hours_used = 0.0
                continue

            current_date = start_date + timedelta(days=day_idx)

            # Don't schedule past the task's deadline
            deadline_date = start_date + timedelta(days=int(task.get("deadline_days", 99)))
            if current_date > deadline_date:
                break  # deadline passed, skip remaining hours

            schedule.append({
                "day": day_idx + 1,
                "date": current_date.isoformat(),
                "task_name": name,
                "hours_allocated": round(slot, 1),
                "priority_score": task["_priority_score"],
                "tier": task["_tier"],
            })

            day_hours_used += slot
            remaining -= slot

    return schedule


def _tier_label(score: float) -> str:
    if score >= 0.55:
        return "HIGH"
    elif score >= 0.30:
        return "MEDIUM"
    return "LOW"


def recommend_priorities(data: dict) -> dict:
    tasks         = data.get("tasks", [])
    current_grade = float(data.get("current_grade", 0))
    passing_grade = float(data.get("passing_grade", 75))
    daily_hours   = float(data.get("daily_study_hours", 6))
    start_date_str = data.get("start_date")  # ISO format "YYYY-MM-DD" or None

    if not tasks:
        return {"error": "No tasks provided"}

    # Parse start date
    try:
        start = date.fromisoformat(start_date_str) if start_date_str else date.today()
    except (ValueError, TypeError):
        start = date.today()

    # Score and annotate each task
    scored = []
    for t in tasks:
        score = _priority_score(t, current_grade, passing_grade)
        scored.append({
            **t,
            "_priority_score": round(score, 4),
            "_tier": _tier_label(score),
        })

    # Sort by priority score descending
    scored.sort(key=lambda x: x["_priority_score"], reverse=True)

    # Build daily schedule
    schedule = build_schedule(scored, daily_hours, start)

    # Format ranked list (clean output, no internal keys)
    ranked = []
    for rank, t in enumerate(scored, start=1):
        ranked.append({
            "rank": rank,
            "name": t.get("name", "Task"),
            "grade_weight": t.get("grade_weight", 0),
            "deadline_days": t.get("deadline_days", 0),
            "difficulty": t.get("difficulty", "medium"),
            "estimated_hours": t.get("estimated_hours", 0),
            "completion_pct": t.get("completion_pct", 0),
            "priority_score": t["_priority_score"],
            "tier": t["_tier"],
            "action": _rank_action(rank, t["_tier"], t),
        })

    # Days needed summary
    total_hours = sum(_hours_needed(t) for t in scored)
    days_needed = math.ceil(total_hours / daily_hours) if daily_hours > 0 else 0

    return {
        "ranked_tasks": ranked,
        "schedule": schedule,
        "summary": {
            "total_tasks": len(ranked),
            "total_hours_needed": round(total_hours, 1),
            "days_needed": days_needed,
            "daily_study_hours": daily_hours,
            "high_priority": sum(1 for t in ranked if t["tier"] == "HIGH"),
            "medium_priority": sum(1 for t in ranked if t["tier"] == "MEDIUM"),
            "low_priority": sum(1 for t in ranked if t["tier"] == "LOW"),
        },
    }


def _rank_action(rank: int, tier: str, task: dict) -> str:
    days = task.get("deadline_days", 7)
    name = task.get("name", "this task")
    if tier == "HIGH":
        if days <= 2:
            return f"Start {name} today — deadline is critical."
        return f"Tackle {name} first thing — high impact."
    elif tier == "MEDIUM":
        return f"Schedule {name} after HIGH priority tasks."
    else:
        return f"Do {name} only if time permits."


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
            result = recommend_priorities(data)
            self._send_json(200, result)
        except json.JSONDecodeError:
            self._send_json(400, {"error": "Invalid JSON"})
        except Exception as e:
            self._send_json(500, {"error": str(e)})
