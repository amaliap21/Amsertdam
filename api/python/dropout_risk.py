"""
Predictive Dropout-Risk Engine
------------------------------
Deterministic early-warning model that estimates a student's risk of
falling behind / not graduating on time, *weeks before* it happens, from
signals the app already collects:

    1. Grade trajectory   - is the running GPA/grade trending up or down?
    2. Grade buffer       - how far above (or below) the passing threshold?
    3. Workload pressure   - required hours vs. available weekly capacity
    4. Completion rate     - share of assessments actually completed on time
    5. Procrastination     - how often work is started near the deadline

It outputs a 0-100 risk score, a RAG band (green/yellow/red), the single
most useful intervention, and a transparent factor breakdown so the UI can
explain *why* the score is what it is (Explainable AI).

Pure stdlib — no numpy/scipy needed, so it is trivially testable and fast.
Run `py -3 dropout_risk.py` for a local demo.
"""

from http.server import BaseHTTPRequestHandler
import json
import math


# ---------------------------------------------------------------------------
# Tunable weights — sum to 1.0. Trajectory and buffer dominate because a
# falling grade near the threshold is the strongest dropout predictor.
# ---------------------------------------------------------------------------

W_TRAJECTORY = 0.28
W_BUFFER = 0.27
W_WORKLOAD = 0.18
W_COMPLETION = 0.17
W_PROCRASTINATION = 0.10

RED_THRESHOLD = 66.0    # >= 66 -> high risk
YELLOW_THRESHOLD = 33.0  # 33..65 -> watch


def _clamp(x: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, x))


def _slope(series: list[float]) -> float:
    """Least-squares slope of a grade series (points per assessment).

    Positive = improving, negative = declining. Returns 0 for <2 points.
    """
    n = len(series)
    if n < 2:
        return 0.0
    xs = list(range(n))
    mean_x = sum(xs) / n
    mean_y = sum(series) / n
    num = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, series))
    den = sum((x - mean_x) ** 2 for x in xs) or 1.0
    return num / den


def _trajectory_risk(grades: list[float]) -> tuple[float, float]:
    """Risk from the grade trend. Returns (risk in [0,1], slope)."""
    slope = _slope(grades)
    # A decline of ~10 points/assessment is alarming -> risk ~1.
    # An improvement of the same magnitude -> risk ~0.
    risk = _clamp(0.5 - slope / 20.0)
    return risk, slope


def _buffer_risk(current_grade: float, passing_grade: float) -> tuple[float, float]:
    """Risk from distance to the passing threshold. Returns (risk, buffer)."""
    buffer = current_grade - passing_grade
    # +15 above passing -> safe (risk 0); 15 below -> critical (risk 1).
    risk = _clamp(0.5 - buffer / 30.0)
    return risk, buffer


def _workload_risk(required_hours: float, capacity_hours: float) -> tuple[float, float]:
    """Risk from workload pressure. Returns (risk, load_ratio)."""
    if capacity_hours <= 0:
        return 1.0, 999.0
    ratio = required_hours / capacity_hours
    # At/under capacity -> low risk; 2x over capacity -> saturated risk.
    risk = _clamp((ratio - 0.6) / 1.0)
    return risk, ratio


def _completion_risk(completion_rate: float) -> float:
    """completion_rate in [0,1]; lower completion -> higher risk."""
    return _clamp(1.0 - completion_rate)


def _procrastination_risk(avg_lead_days: float, deadline_window_days: float = 14.0) -> float:
    """Average days between starting and the deadline.

    Starting the day-of (lead 0) -> max risk; starting two weeks early -> ~0.
    """
    return _clamp(1.0 - avg_lead_days / deadline_window_days)


def _band(score: float) -> tuple[str, str]:
    """Map a 0-100 score to (label, color)."""
    if score >= RED_THRESHOLD:
        return "High risk", "red"
    if score >= YELLOW_THRESHOLD:
        return "Needs attention", "yellow"
    return "On track", "green"


def _weeks_to_threshold(grades: list[float], passing_grade: float, slope: float) -> float | None:
    """Project how many assessments until the grade crosses below passing.

    None when the trend is flat/improving or already below threshold.
    """
    if not grades:
        return None
    current = grades[-1]
    if current < passing_grade:
        return 0.0
    if slope >= -0.01:
        return None
    return round((current - passing_grade) / (-slope), 1)


def compute_risk(course: dict) -> dict:
    """Score a single course's dropout/under-performance risk."""
    grades = [float(g) for g in course.get("grade_history", []) if g is not None]
    passing_grade = float(course.get("passing_grade", 70))
    current_grade = float(course.get("current_grade", grades[-1] if grades else passing_grade))
    required_hours = float(course.get("required_hours", 0))
    capacity_hours = float(course.get("weekly_capacity_hours", 30))
    completion_rate = _clamp(float(course.get("completion_rate", 1.0)))
    avg_lead_days = float(course.get("avg_lead_days", 7))

    traj_risk, slope = _trajectory_risk(grades or [current_grade])
    buf_risk, buffer = _buffer_risk(current_grade, passing_grade)
    work_risk, load_ratio = _workload_risk(required_hours, capacity_hours)
    comp_risk = _completion_risk(completion_rate)
    proc_risk = _procrastination_risk(avg_lead_days)

    score01 = (
        W_TRAJECTORY * traj_risk
        + W_BUFFER * buf_risk
        + W_WORKLOAD * work_risk
        + W_COMPLETION * comp_risk
        + W_PROCRASTINATION * proc_risk
    )
    score = round(score01 * 100, 1)
    label, color = _band(score)

    # Rank factors by their *weighted* contribution so we can explain and
    # intervene on the single biggest driver.
    factors = [
        {"key": "trajectory", "label": "Grade trend",
         "contribution": round(W_TRAJECTORY * traj_risk * 100, 1),
         "detail": _trajectory_detail(slope)},
        {"key": "buffer", "label": "Margin above passing",
         "contribution": round(W_BUFFER * buf_risk * 100, 1),
         "detail": _buffer_detail(buffer)},
        {"key": "workload", "label": "Workload vs. capacity",
         "contribution": round(W_WORKLOAD * work_risk * 100, 1),
         "detail": _workload_detail(load_ratio)},
        {"key": "completion", "label": "Assessments completed",
         "contribution": round(W_COMPLETION * comp_risk * 100, 1),
         "detail": f"{round(completion_rate * 100)}% of assessments completed on time"},
        {"key": "procrastination", "label": "Starts work early",
         "contribution": round(W_PROCRASTINATION * proc_risk * 100, 1),
         "detail": f"Starts ~{round(avg_lead_days)} day(s) before deadlines on average"},
    ]
    factors.sort(key=lambda f: f["contribution"], reverse=True)
    top = factors[0]

    return {
        "course": course.get("course", course.get("name", "Course")),
        "risk_score": score,
        "risk_label": label,
        "color": color,
        "weeks_to_threshold": _weeks_to_threshold(grades, passing_grade, slope),
        "top_driver": top["key"],
        "intervention": _intervention(top["key"], color),
        "explanation": (
            f"{label} ({score}/100). Biggest driver: {top['label'].lower()} "
            f"— {top['detail']}."
        ),
        "factors": factors,
    }


def _trajectory_detail(slope: float) -> str:
    if slope <= -2:
        return f"declining ~{abs(round(slope, 1))} pts per assessment"
    if slope >= 2:
        return f"improving ~{round(slope, 1)} pts per assessment"
    return "roughly flat"


def _buffer_detail(buffer: float) -> str:
    if buffer >= 0:
        return f"{round(buffer, 1)} pts above the passing threshold"
    return f"{round(abs(buffer), 1)} pts BELOW the passing threshold"


def _workload_detail(ratio: float) -> str:
    if ratio >= 900:
        return "no study capacity set"
    pct = round(ratio * 100)
    if ratio <= 1.0:
        return f"needs {pct}% of your weekly capacity (sustainable)"
    return f"needs {pct}% of your weekly capacity (over budget)"


def _intervention(driver: str, color: str) -> str:
    """The single most useful next action for the dominant risk driver."""
    if color == "green":
        return "You're on track here — protect this and rest when you can."
    table = {
        "trajectory": "Your grade is trending down. Book one focused review session this week before the next assessment.",
        "buffer": "You're close to the threshold. Use Passing Target to find the exact score you still need.",
        "workload": "This course is over your time budget. Use Task Value to find what's safe to minimize elsewhere.",
        "completion": "Missed assessments are the main risk. Catch up on the most recent one first — even partial credit helps.",
        "procrastination": "You tend to start late. Schedule the next deadline in Priority Planner and start 3 days earlier.",
    }
    return table.get(driver, "Review this course with your Study Companion.")


def analyze(data: dict) -> dict:
    """Score one or many courses and produce a portfolio-level summary."""
    courses = data.get("courses")
    if courses is None:
        # single-course shape
        result = compute_risk(data)
        return {"courses": [result], "summary": _summary([result])}
    results = [compute_risk(c) for c in courses]
    results.sort(key=lambda r: r["risk_score"], reverse=True)
    return {"courses": results, "summary": _summary(results)}


def _summary(results: list[dict]) -> dict:
    if not results:
        return {"overall_risk": 0, "band": "On track", "color": "green",
                "red": 0, "yellow": 0, "green": 0, "headline": "No courses to assess yet."}
    # Overall risk is weighted toward the worst course (a single failing
    # course can derail graduation), so we blend mean with max.
    scores = [r["risk_score"] for r in results]
    overall = round(0.6 * max(scores) + 0.4 * (sum(scores) / len(scores)), 1)
    label, color = _band(overall)
    worst = results[0]
    counts = {"red": 0, "yellow": 0, "green": 0}
    for r in results:
        counts[r["color"]] += 1
    if color == "red":
        headline = f"{worst['course']} needs attention now — {worst['intervention']}"
    elif color == "yellow":
        headline = f"Mostly steady, but keep an eye on {worst['course']}."
    else:
        headline = "You're on track across all courses. Keep the pace and rest."
    return {"overall_risk": overall, "band": label, "color": color,
            "headline": headline, **counts}


# ---------------------------------------------------------------------------
# Vercel handler
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
            data = json.loads(self.rfile.read(length))
            self._send_json(200, analyze(data))
        except json.JSONDecodeError:
            self._send_json(400, {"error": "Invalid JSON"})
        except Exception as e:  # noqa: BLE001
            self._send_json(500, {"error": str(e)})


if __name__ == "__main__":
    demo = {
        "courses": [
            {"course": "Operating Systems", "grade_history": [78, 72, 65, 61],
             "passing_grade": 70, "required_hours": 12, "weekly_capacity_hours": 20,
             "completion_rate": 0.6, "avg_lead_days": 1},
            {"course": "Data Structures", "grade_history": [70, 74, 79, 83],
             "passing_grade": 70, "required_hours": 8, "weekly_capacity_hours": 20,
             "completion_rate": 1.0, "avg_lead_days": 6},
            {"course": "Computer Networks", "grade_history": [68, 69, 71],
             "passing_grade": 70, "required_hours": 10, "weekly_capacity_hours": 12,
             "completion_rate": 0.8, "avg_lead_days": 3},
        ]
    }
    out = analyze(demo)
    print("=" * 78)
    print("DROPOUT-RISK ENGINE DEMO")
    print("=" * 78)
    s = out["summary"]
    print(f"Overall: {s['overall_risk']}/100 [{s['band']}]  red={s['red']} yellow={s['yellow']} green={s['green']}")
    print(f"Headline: {s['headline']}")
    print("-" * 78)
    for c in out["courses"]:
        wk = c["weeks_to_threshold"]
        wk_txt = f"  ~{wk} assessments to threshold" if wk else ""
        print(f"[{c['color']:>6}] {c['course']:<20} {c['risk_score']:>5}/100  {c['risk_label']}{wk_txt}")
        print(f"         -> {c['intervention']}")
    print("-" * 78)
