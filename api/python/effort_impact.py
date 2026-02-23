"""
Effort Impact Analyzer
----------------------
Deterministic Multi-Criteria Decision Analysis (MCDA) for evaluating
whether a task is worth prioritizing.

Scoring dimensions:
  1. Grade Impact     – how much does this task affect the final grade?
  2. Effort Cost      – how expensive is it in time/energy?
  3. Urgency          – how close is the deadline?
  4. Grade Gap        – how critical is it relative to passing threshold?
  5. Stress Risk      – estimated psychological cost

Decision:  HIGH / MEDIUM / LOW priority
"""

from http.server import BaseHTTPRequestHandler
import json
import math


# ---------------------------------------------------------------------------
# MCDA Engine
# ---------------------------------------------------------------------------

WEIGHT_IMPACT   = 0.35
WEIGHT_URGENCY  = 0.25
WEIGHT_GAP      = 0.20
WEIGHT_EFFORT   = 0.15   # inverted (high effort → lower score)
WEIGHT_STRESS   = 0.05   # inverted

HIGH_THRESHOLD   = 0.62
MEDIUM_THRESHOLD = 0.38


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


def analyze_effort_impact(data: dict) -> dict:
    task_name          = data.get("task_name", "Task")
    grade_weight       = float(data.get("grade_weight", 0))          # 0-100 %
    estimated_hours    = float(data.get("estimated_hours", 1))
    deadline_days      = float(data.get("deadline_days", 7))
    current_grade      = float(data.get("current_grade", 0))
    passing_grade      = float(data.get("passing_grade", 75))
    stress_level       = float(data.get("stress_level", 3))           # 1-5
    weekly_capacity    = float(data.get("weekly_capacity_hours", 40))

    # 1. Grade Impact (0-1): weight / 100, but boosted if grade gap is critical
    impact = grade_weight / 100.0

    # 2. Urgency (0-1): exponential decay
    urgency = _urgency_score(deadline_days)

    # 3. Grade Gap Factor (0-1): how far below passing threshold
    gap = passing_grade - current_grade
    gap_factor = _normalize(gap, -20, 40)   # negative gap means already passing

    # 4. Effort cost (0-1), inverted: high effort penalises priority
    effort_raw = _effort_score(estimated_hours, weekly_capacity)
    effort_penalty = effort_raw  # will be subtracted

    # 5. Stress penalty (0-1), inverted
    stress_penalty = _normalize(stress_level, 1, 5)

    # Composite score
    raw_score = (
        WEIGHT_IMPACT   * impact
      + WEIGHT_URGENCY  * urgency
      + WEIGHT_GAP      * gap_factor
      - WEIGHT_EFFORT   * effort_penalty
      - WEIGHT_STRESS   * stress_penalty
    )
    # Re-map raw_score (roughly -0.2 … +0.8) to [0, 1]
    composite = _normalize(raw_score, -0.20, 0.80)

    # Decision
    if composite >= HIGH_THRESHOLD:
        priority   = "HIGH"
        action     = "Do it fully and on time"
        color      = "green"
    elif composite >= MEDIUM_THRESHOLD:
        priority   = "MEDIUM"
        action     = "Do it, but time-box your effort"
        color      = "yellow"
    else:
        priority   = "LOW"
        action     = "Consider skipping or doing minimally"
        color      = "red"

    # Efficiency ratio: impact per hour invested
    efficiency = round(grade_weight / max(1, estimated_hours), 2)

    # Template-based rationale (no LLM needed)
    rationale_parts = []
    if impact >= 0.3:
        rationale_parts.append(f"carries {grade_weight}% of your final grade")
    if urgency >= 0.7:
        rationale_parts.append(f"deadline in {int(deadline_days)} day(s)")
    if gap_factor >= 0.6:
        rationale_parts.append(f"you are {round(gap, 1)} points below passing")
    if effort_raw >= 0.5:
        rationale_parts.append(f"requires {estimated_hours}h (~{round(effort_raw*100)}% of weekly capacity)")
    if stress_level >= 4:
        rationale_parts.append("high stress risk")

    if rationale_parts:
        rationale = f"{task_name} " + "; ".join(rationale_parts) + "."
    else:
        rationale = f"{task_name} has moderate impact and manageable effort."

    return {
        "task_name": task_name,
        "priority": priority,
        "action": action,
        "color": color,
        "composite_score": round(composite, 3),
        "efficiency_ratio": efficiency,
        "breakdown": {
            "grade_impact": round(impact, 3),
            "urgency": round(urgency, 3),
            "gap_factor": round(gap_factor, 3),
            "effort_penalty": round(effort_penalty, 3),
            "stress_penalty": round(stress_penalty, 3),
        },
        "rationale": rationale,
    }


# ---------------------------------------------------------------------------
# Batch mode: analyze multiple tasks at once
# ---------------------------------------------------------------------------

def analyze_batch(data: dict) -> dict:
    tasks = data.get("tasks", [])
    if not tasks:
        return {"error": "No tasks provided"}

    results = [analyze_effort_impact(t) for t in tasks]

    # Sort by composite_score descending
    results.sort(key=lambda r: r["composite_score"], reverse=True)

    return {
        "tasks": results,
        "summary": {
            "high": sum(1 for r in results if r["priority"] == "HIGH"),
            "medium": sum(1 for r in results if r["priority"] == "MEDIUM"),
            "low": sum(1 for r in results if r["priority"] == "LOW"),
        },
    }


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

            # Support both single task and batch
            if "tasks" in data:
                result = analyze_batch(data)
            else:
                result = analyze_effort_impact(data)

            self._send_json(200, result)
        except json.JSONDecodeError:
            self._send_json(400, {"error": "Invalid JSON"})
        except Exception as e:
            self._send_json(500, {"error": str(e)})
