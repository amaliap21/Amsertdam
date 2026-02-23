"""
Sacrifice Intelligence
----------------------
Greedy algorithm that identifies which tasks can be sacrificed (skipped or
done minimally) to protect energy for high-impact work.

Algorithm: Efficiency-ranked greedy selection
  1. Compute value/cost ratio for every task
  2. Sort descending by efficiency ratio
  3. Greedily fill available time budget with highest-efficiency tasks → FOCUS
  4. Remaining tasks beyond budget → SACRIFICE or MINIMAL

Tiers:
  FOCUS    – do fully; high grade impact per effort unit
  MINIMAL  – do just enough; medium return
  SACRIFICE – skip or do the bare minimum; low return, high cost
"""

from http.server import BaseHTTPRequestHandler
import json


# ---------------------------------------------------------------------------
# Scoring helpers
# ---------------------------------------------------------------------------

def _effort_hours_effective(hours: float, stress_level: int) -> float:
    """Adjust actual hours by a stress multiplier (burnout inflates perceived cost)."""
    stress_multiplier = {1: 0.8, 2: 0.9, 3: 1.0, 4: 1.2, 5: 1.5}
    return hours * stress_multiplier.get(int(stress_level), 1.0)


def _grade_value(grade_weight: float, grade_gap: float, passing_grade: float) -> float:
    """
    Value of completing this task well.
    Boosted when student is below passing threshold.
    """
    base_value = grade_weight / 100.0
    # Gap bonus: each point below passing adds 1% extra value
    gap_bonus = max(0, grade_gap) / 100.0 * 0.5
    return min(1.0, base_value + gap_bonus)


def _deadline_urgency(days: float) -> float:
    """Urgency weight: closer deadline raises importance."""
    if days <= 1:
        return 2.0
    if days <= 3:
        return 1.5
    if days <= 7:
        return 1.2
    return 1.0


# ---------------------------------------------------------------------------
# Core algorithm
# ---------------------------------------------------------------------------

def sacrifice_analysis(data: dict) -> dict:
    tasks           = data.get("tasks", [])
    available_hours = float(data.get("available_hours_per_week", 40))
    current_grade   = float(data.get("current_grade", 0))
    passing_grade   = float(data.get("passing_grade", 75))

    if not tasks:
        return {"error": "No tasks provided"}

    grade_gap = passing_grade - current_grade

    # Score each task
    scored = []
    for t in tasks:
        name         = t.get("name", "Task")
        weight       = float(t.get("grade_weight", 0))
        hours        = float(t.get("estimated_hours", 1))
        days         = float(t.get("deadline_days", 7))
        stress       = int(t.get("stress_level", 3))
        already_done = float(t.get("completion_pct", 0))  # 0-100

        effective_hours = _effort_hours_effective(hours * (1 - already_done / 100), stress)
        value           = _grade_value(weight, grade_gap, passing_grade)
        urgency         = _deadline_urgency(days)
        adjusted_value  = value * urgency

        # Efficiency ratio: grade return per effective hour invested
        efficiency = adjusted_value / max(0.1, effective_hours)

        scored.append({
            "name": name,
            "grade_weight": weight,
            "estimated_hours": hours,
            "effective_hours": round(effective_hours, 1),
            "deadline_days": days,
            "stress_level": stress,
            "completion_pct": already_done,
            "efficiency": round(efficiency, 4),
            "adjusted_value": round(adjusted_value, 3),
            "_raw": t,
        })

    # Sort by efficiency descending (greedy)
    scored.sort(key=lambda x: x["efficiency"], reverse=True)

    # Greedy selection within budget
    results = []
    hours_used = 0.0

    for item in scored:
        h = item["effective_hours"]

        # Already mostly done tasks: always FOCUS regardless of budget
        if item["completion_pct"] >= 80:
            tier = "FOCUS"
            advice = "Almost done — finish it to lock in the grade."
        elif hours_used + h <= available_hours:
            # Fits in budget
            if item["efficiency"] >= 0.08:
                tier = "FOCUS"
                advice = _focus_advice(item)
            else:
                tier = "MINIMAL"
                advice = _minimal_advice(item)
            hours_used += h
        else:
            # Exceeds budget
            remaining_budget = available_hours - hours_used
            if item["efficiency"] >= 0.12 and remaining_budget >= h * 0.5:
                # High efficiency + partial time available → do partial
                tier = "MINIMAL"
                advice = f"Time is tight — spend only {int(remaining_budget)}h on this."
                hours_used = available_hours
            else:
                tier = "SACRIFICE"
                advice = _sacrifice_advice(item)

        results.append({
            "name": item["name"],
            "grade_weight": item["grade_weight"],
            "estimated_hours": item["estimated_hours"],
            "deadline_days": item["deadline_days"],
            "tier": tier,
            "efficiency": item["efficiency"],
            "advice": advice,
        })

    focus_names    = [r["name"] for r in results if r["tier"] == "FOCUS"]
    minimal_names  = [r["name"] for r in results if r["tier"] == "MINIMAL"]
    sacrifice_names= [r["name"] for r in results if r["tier"] == "SACRIFICE"]

    summary = _build_summary(focus_names, minimal_names, sacrifice_names, hours_used, available_hours)

    return {
        "tasks": results,
        "hours_allocated": round(hours_used, 1),
        "available_hours": available_hours,
        "summary": summary,
    }


# ---------------------------------------------------------------------------
# Template-based text generation
# ---------------------------------------------------------------------------

def _focus_advice(item: dict) -> str:
    if item["deadline_days"] <= 3:
        return f"Deadline in {int(item['deadline_days'])} day(s) — prioritise now."
    if item["grade_weight"] >= 30:
        return f"Worth {item['grade_weight']}% of grade — invest time here."
    return "Good return on effort — do it fully."


def _minimal_advice(item: dict) -> str:
    return (
        f"Moderate impact ({item['grade_weight']}%). "
        "Do it, but cap your time to avoid over-investing."
    )


def _sacrifice_advice(item: dict) -> str:
    if item["grade_weight"] <= 5:
        return "Very small grade contribution — safe to skip entirely."
    if item["effective_hours"] >= 10:
        return (
            f"Too costly ({item['estimated_hours']}h) for a {item['grade_weight']}% task. "
            "Consider submitting a basic attempt only."
        )
    return (
        f"Low efficiency. Submit minimal work to capture partial credit "
        f"and redirect energy to higher-value tasks."
    )


def _build_summary(focus, minimal, sacrifice, used, available) -> str:
    parts = []
    if focus:
        parts.append(f"Focus on: {', '.join(focus)}")
    if minimal:
        parts.append(f"Do minimally: {', '.join(minimal)}")
    if sacrifice:
        parts.append(f"Sacrifice: {', '.join(sacrifice)}")
    budget_note = f"You'll use {round(used, 1)}/{available}h of your weekly budget."
    return " | ".join(parts) + ". " + budget_note


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
            result = sacrifice_analysis(data)
            self._send_json(200, result)
        except json.JSONDecodeError:
            self._send_json(400, {"error": "Invalid JSON"})
        except Exception as e:
            self._send_json(500, {"error": str(e)})
