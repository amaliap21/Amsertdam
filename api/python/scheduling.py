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
import importlib.util
import json
import math
import os
from datetime import date, datetime, timedelta, time
from functools import lru_cache


# ---------------------------------------------------------------------------
# Priority scoring (hybrid mode only)
# ---------------------------------------------------------------------------

EFFECTIVE_W_TOPSIS    = 0.52
EFFECTIVE_W_COMPOSITE = 0.18
EFFECTIVE_W_SKS       = 0.10
EFFECTIVE_W_URGENCY   = 0.14
EFFECTIVE_W_GAP       = 0.10
EFFECTIVE_W_IMPACT    = 0.06

EFFECTIVE_W_EFFORT_PENALTY = 0.18

BUCKET_PRIORITY_SCORE = {
    "focus first": 0.75,
    "if you have energy": 0.45,
    "safe to minimize": 0.20,
}

EFFORT_LABEL_PENALTY = {
    "low": 0.25,
    "medium": 0.55,
    "high": 0.80,
}


def _clip01(value: float) -> float:
    """Clamp a numeric value to the inclusive [0, 1] range."""
    return max(0.0, min(1.0, value))


def _safe_float(value, default: float) -> float:
    """Parse a numeric input defensively and fall back to a default."""
    try:
        if value is None:
            return float(default)
        if isinstance(value, str):
            cleaned = value.strip().lower()
            cleaned = cleaned.replace("hours", "").replace("hour", "").replace("h", "")
            if cleaned == "":
                return float(default)
            return float(cleaned)
        return float(value)
    except (TypeError, ValueError):
        return float(default)


def _normalize(value: float, min_val: float, max_val: float) -> float:
    """Normalize a value into the [0, 1] range using the supplied bounds."""
    if max_val == min_val:
        return 0.5
    return _clip01((value - min_val) / (max_val - min_val))


def _bucket_priority_score(task: dict) -> float | None:
    """Return a score for legacy bucket-style priority labels when present."""
    label = str(task.get("priority", "")).strip().lower()
    if not label:
        return None
    return BUCKET_PRIORITY_SCORE.get(label)


def _default_effort_penalty(task: dict) -> float:
    """Estimate the effort penalty from explicit effort or study capacity."""
    label = str(task.get("effort", "")).strip().lower()
    if label in EFFORT_LABEL_PENALTY:
        return EFFORT_LABEL_PENALTY[label]

    estimated = _safe_float(task.get("estimated_hours", 1), 1)
    weekly_capacity = _safe_float(task.get("weekly_capacity_hours", 40), 40)
    if weekly_capacity <= 0:
        return 1.0
    return _clip01(estimated / weekly_capacity)


def _default_sks_score(task: dict) -> float:
    """Normalize course credits into the SKS contribution used by scoring."""
    sks = _safe_float(task.get("sks", task.get("credits", 0)), 0)
    return _normalize(sks, 0, 6)


def _extract_analysis(task: dict) -> dict:
    """Return the nested analysis payload or a flattened fallback view."""
    analysis = task.get("analysis")
    if isinstance(analysis, dict):
        return analysis

    # Support flattened priority-analysis payloads.
    if any(k in task for k in ("topsis_score", "composite_score", "breakdown", "priority_basis")):
        return task

    return {}


def _task_name(task: dict) -> str:
    """Resolve the best available display name for a task."""
    return task.get("name") or task.get("task_name") or task.get("title") or "Task"


def _parse_iso_date(raw_value):
    """Parse an ISO-like date string and return a date object when possible."""
    if not raw_value:
        return None
    try:
        return date.fromisoformat(str(raw_value)[:10])
    except (TypeError, ValueError):
        return None


def _parse_timestamp(raw_value):
    """Parse an ISO-like timestamp string and return a datetime object when possible."""
    if not raw_value:
        return None
    try:
        return datetime.fromisoformat(str(raw_value))
    except (TypeError, ValueError):
        return None


def _analysis_priority_label(score: float) -> str:
    """Map a composite score to a coarse priority tier."""
    if score >= 0.5:
        return "HIGH"
    if score >= 0.3:
        return "MEDIUM"
    return "LOW"


def _analysis_priority_action(score: float, task: dict) -> str:
    """Generate a short human-readable action recommendation for a task."""
    name = _task_name(task)
    days = _safe_float(task.get("deadline_days", 7), 7)
    if score >= 0.5:
        if days <= 2:
            return f"Start {name} today — deadline is critical."
        return f"Tackle {name} first thing — high impact."
    if score >= 0.3:
        return f"Schedule {name} after HIGH priority tasks."
    return f"Do {name} only if time permits."


def _infer_task_type(task: dict) -> str:
    """Infer a canonical task category from the available task metadata."""
    combined = " ".join(
        str(part)
        for part in (
            task.get("task_type"),
            task.get("course"),
            task.get("name"),
            task.get("task_name"),
            task.get("title"),
            task.get("description"),
        )
        if part
    ).lower()

    if any(keyword in combined for keyword in ("exam", "midterm", "final")):
        return "exam"
    if "quiz" in combined:
        return "quiz"
    if "project" in combined:
        return "project"
    if any(keyword in combined for keyword in ("homework", "assignment", "task")):
        return "homework"
    return "generic"


def _infer_effort_label(estimated_hours: float) -> str:
    """Translate estimated effort into a coarse low/medium/high label."""
    if estimated_hours <= 2:
        return "low"
    if estimated_hours <= 5:
        return "medium"
    return "high"


def _grade_weight_from_bucket(priority_label: str) -> float:
    """Convert a textual priority bucket into a grade-weight proxy."""
    if priority_label == "focus first":
        return 25.0
    if priority_label == "if you have energy":
        return 12.0
    if priority_label == "safe to minimize":
        return 5.0
    return 0.0


def _derive_grade_weight(task: dict) -> float:
    """Derive grade weight from explicit input or inferred task type."""
    if task.get("grade_weight") is not None:
        return _safe_float(task.get("grade_weight"), 0)

    bucket_label = str(task.get("priority", "")).strip().lower()
    if bucket_label:
        return _grade_weight_from_bucket(bucket_label)

    task_type = _infer_task_type(task)
    if task_type == "exam":
        return 25.0
    if task_type == "project":
        return 15.0
    if task_type == "quiz":
        return 10.0
    if task_type == "homework":
        return 5.0
    return 0.0


def _derive_deadline_days(task: dict, start_date: date) -> float:
    """Resolve a task deadline from relative days or an absolute date."""
    explicit = task.get("deadline_days")
    if explicit is not None:
        return max(0.0, _safe_float(explicit, 7))

    for key in ("date", "deadline", "due_date"):
        parsed = _parse_iso_date(task.get(key))
        if parsed is not None:
            return max(0.0, float((parsed - start_date).days))

    return 7.0


def _resolve_analysis_method(raw_method) -> str:
    """Normalize the requested analysis method to a supported value."""
    mode = str(raw_method or "topsis").strip().lower()
    if mode in ("topsis", "weighted"):
        return mode
    return "topsis"


def _priority_analysis_task_payload(
    task: dict,
    index: int,
    current_grade: float,
    passing_grade: float,
    daily_hours: float,
    start_date: date,
) -> dict:
    """Build the canonical payload consumed by priority analysis."""
    task_id = str(task.get("task_id") or task.get("id") or f"task_{index}")
    name = _task_name(task)
    estimated_hours = _safe_float(task.get("estimated_hours", task.get("timeEstimate", 1)), 1)
    deadline_days = _derive_deadline_days(task, start_date)
    grade_weight = _derive_grade_weight(task)
    sks = _safe_float(task.get("sks", task.get("credits", 0)), 0)
    completion_pct = _safe_float(task.get("completion_pct", task.get("completion", 0)), 0)
    completion_pct = max(0.0, min(100.0, completion_pct))
    effort_label = str(task.get("effort", "")).strip().lower() or _infer_effort_label(estimated_hours)
    weekly_capacity = _safe_float(task.get("weekly_capacity_hours", daily_hours * 7), daily_hours * 7)
    task_type = _infer_task_type(task)
    difficulty = str(task.get("difficulty", "")).strip().lower() or (
        "hard" if estimated_hours > 5 else "medium"
    )

    analysis_payload = {
        "task_id": task_id,
        "task_name": name,
        "task_type": task_type,
        "grade_weight": grade_weight,
        "sks": sks,
        "estimated_hours": estimated_hours,
        "deadline_days": deadline_days,
        "current_grade": current_grade,
        "passing_grade": passing_grade,
        "weekly_capacity_hours": weekly_capacity,
        "difficulty": difficulty,
        "completion_pct": completion_pct,
        "effort": effort_label,
        "priority": str(task.get("priority", "")).strip(),
    }

    canonical_task = {
        **task,
        "task_id": task_id,
        "name": name,
        "task_name": name,
        "title": task.get("title") or name,
        "course": task.get("course"),
        "estimated_hours": estimated_hours,
        "deadline_days": deadline_days,
        "grade_weight": grade_weight,
        "sks": sks,
        "current_grade": current_grade,
        "passing_grade": passing_grade,
        "weekly_capacity_hours": weekly_capacity,
        "task_type": task_type,
        "difficulty": difficulty,
        "completion_pct": completion_pct,
        "effort": effort_label,
        "_analysis_payload": analysis_payload,
    }

    return canonical_task


@lru_cache(maxsize=1)
def _load_priority_analysis_module():
    """Load the priority-analysis module lazily to avoid import overhead."""
    module_path = os.path.join(os.path.dirname(__file__), "priority_analysis.py")
    try:
        spec = importlib.util.spec_from_file_location("priority_analysis", module_path)
        if not spec or not spec.loader:
            return None
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module
    except Exception:
        return None


def _summarize_analysis_results(results: list[dict]) -> dict:
    """Summarize analysis results by priority tier."""
    return {
        "total": len(results),
        "high": sum(1 for item in results if item.get("priority") == "HIGH"),
        "medium": sum(1 for item in results if item.get("priority") == "MEDIUM"),
        "low": sum(1 for item in results if item.get("priority") == "LOW"),
    }


def _build_synthetic_analysis(task: dict, current_grade: float, passing_grade: float) -> dict:
    """Create a deterministic fallback analysis when the analyzer is unavailable."""
    deadline_days = _safe_float(task.get("deadline_days", 7), 7)
    completion_pct = _safe_float(task.get("completion_pct", 0), 0)
    completion_pct = max(0.0, min(100.0, completion_pct))
    grade_weight = _safe_float(task.get("grade_weight", 0), 0)
    estimated_hours = _safe_float(task.get("estimated_hours", 1), 1)
    sks_score = _default_sks_score(task)

    impact = min(1.0, grade_weight / 100.0)
    urgency = _deadline_urgency(deadline_days)
    gap = _gap_score(current_grade, passing_grade)
    effort_penalty = _default_effort_penalty(task)

    raw_score = (
        0.25 * impact
        + 0.10 * sks_score
        + 0.35 * urgency
        + 0.20 * gap
        - 0.12 * effort_penalty
    )
    composite = _normalize(raw_score, -0.20, 0.80)
    priority = _analysis_priority_label(composite)

    return {
        "task_id": task.get("task_id"),
        "task_name": _task_name(task),
        "task_type": task.get("task_type", "generic"),
        "priority": priority,
        "action": _analysis_priority_action(composite, task),
        "color": "gray" if priority == "LOW" else ("yellow" if priority == "MEDIUM" else "green"),
        "composite_score": round(composite, 3),
        "confidence": 0.5,
        "efficiency_ratio": round(grade_weight / max(1.0, estimated_hours), 2),
        "breakdown": {
            "grade_impact": round(impact, 3),
            "sks_score": round(sks_score, 3),
            "urgency": round(urgency, 3),
            "gap_factor": round(_normalize(passing_grade - current_grade, -20, 40), 3),
            "effort_penalty": round(effort_penalty, 3),
        },
        "priority_basis": "synthetic_fallback",
        "details": task.get("_analysis_payload", task),
    }


def _run_analysis_pipeline(canonical_tasks: list[dict], analysis_method: str, current_grade: float, passing_grade: float) -> dict:
    """Run the external analyzer and fall back to a synthetic report when needed."""
    payload = {
        "method": analysis_method,
        "tasks": [task["_analysis_payload"] for task in canonical_tasks],
    }
    module = _load_priority_analysis_module()
    report = {
        "method": analysis_method,
        "tasks": [],
        "summary": _summarize_analysis_results([]),
        "source": "synthetic_fallback",
    }

    if module is not None and hasattr(module, "analyze_batch"):
        try:
            analyzed = module.analyze_batch(payload)
            if isinstance(analyzed, dict):
                report.update(analyzed)
                report.setdefault("method", analysis_method)
                report["source"] = "priority_analysis"
            elif isinstance(analyzed, list):
                report["tasks"] = analyzed
                report["summary"] = _summarize_analysis_results(analyzed)
                report["source"] = "priority_analysis"
        except Exception as exc:
            report["error"] = str(exc)

    if not report.get("tasks"):
        report["tasks"] = [_build_synthetic_analysis(task, current_grade, passing_grade) for task in canonical_tasks]
        report["summary"] = _summarize_analysis_results(report["tasks"])

    return report


def _merge_analysis_results(canonical_tasks: list[dict], analysis_report: dict, current_grade: float, passing_grade: float) -> list[dict]:
    """Merge analysis results back into the canonical task list."""
    analysis_items = analysis_report.get("tasks", []) if isinstance(analysis_report, dict) else []
    by_task_id = {}
    by_name = {}

    for item in analysis_items:
        if not isinstance(item, dict):
            continue
        task_id = item.get("task_id")
        if not task_id and isinstance(item.get("details"), dict):
            task_id = item["details"].get("task_id")
        if task_id is not None:
            by_task_id[str(task_id)] = item

        detail_name = _task_name(item.get("details", item))
        by_name.setdefault(detail_name.lower(), item)

    merged = []
    for task in canonical_tasks:
        analysis = by_task_id.get(task["task_id"]) or by_name.get(_task_name(task).lower())
        if analysis is None:
            analysis = _build_synthetic_analysis(task, current_grade, passing_grade)
        merged.append({
            **task,
            "analysis": analysis,
        })

    return merged


def _deadline_urgency(days: float) -> float:
    """Compute an exponentially decaying urgency score from deadline distance."""
    if days <= 0:
        return 1.0
    return math.exp(-0.18 * days)


def _grade_score(weight: float) -> float:
    """Scale a grade weight to the normalized range used by scoring."""
    return weight / 100.0


def _gap_score(current: float, passing: float) -> float:
    """Convert the grade gap into a normalized urgency boost."""
    gap = passing - current
    if gap <= 0:
        return 0.0
    return min(1.0, gap / 30.0)


# ---------------------------------------------------------------------------
# Scheduler
# ---------------------------------------------------------------------------

def _hours_needed(task: dict) -> float:
    """Return the remaining study hours after accounting for completion."""
    hours = _safe_float(task.get("estimated_hours", 1), 1)
    completion = _safe_float(task.get("completion_pct", 0), 0)
    completion = max(0.0, min(100.0, completion))
    return hours * (1 - completion / 100.0)


def _compute_hybrid_priority_score(task: dict, current_grade: float, passing_grade: float) -> float:
    """Compute the hybrid scheduling score from analysis output and local fallbacks."""
    analysis = _extract_analysis(task)
    breakdown = analysis.get("breakdown", {}) if isinstance(analysis.get("breakdown", {}), dict) else {}

    days = _safe_float(task.get("deadline_days", 7), 7)
    completion = _safe_float(task.get("completion_pct", 0), 0)
    completion = max(0.0, min(100.0, completion))

    # Simple internal fallback based on urgency and grade weight
    internal_score = _clip01(0.3 * _deadline_urgency(days) + 0.2 * _grade_score(_safe_float(task.get("grade_weight", 0), 0)))
    bucket_score = _bucket_priority_score(task)

    topsis_raw = analysis.get("topsis_score")
    composite_raw = analysis.get("composite_score")

    topsis = None if topsis_raw is None else _clip01(_safe_float(topsis_raw, 0))
    composite = None if composite_raw is None else _clip01(_safe_float(composite_raw, 0))

    if topsis is None:
        if composite is not None:
            topsis = composite
        elif bucket_score is not None:
            topsis = bucket_score
        else:
            topsis = internal_score

    if composite is None:
        if bucket_score is not None:
            composite = bucket_score
        else:
            composite = internal_score

    urgency = _clip01(_safe_float(breakdown.get("urgency"), _deadline_urgency(days)))
    gap_factor = _clip01(_safe_float(breakdown.get("gap_factor"), _gap_score(current_grade, passing_grade)))
    sks_score = _clip01(_safe_float(breakdown.get("sks_score"), _default_sks_score(task)))
    impact = _clip01(_safe_float(
        breakdown.get("grade_impact"),
        _grade_score(_safe_float(task.get("grade_weight", 0), 0)),
    ))
    effort_penalty = _clip01(_safe_float(breakdown.get("effort_penalty"), _default_effort_penalty(task)))

    base = (
        EFFECTIVE_W_TOPSIS * topsis
        + EFFECTIVE_W_COMPOSITE * composite
        + EFFECTIVE_W_SKS * sks_score
        + EFFECTIVE_W_URGENCY * urgency
        + EFFECTIVE_W_GAP * gap_factor
        + EFFECTIVE_W_IMPACT * impact
    )

    penalty = EFFECTIVE_W_EFFORT_PENALTY * effort_penalty

    progress_boost = 0.12 * (1 - completion / 100.0)

    if days <= 2:
        deadline_boost = 0.12
    elif days <= 5:
        deadline_boost = 0.08
    elif days <= 10:
        deadline_boost = 0.03
    else:
        deadline_boost = 0.0

    score = _clip01(base - penalty + progress_boost + deadline_boost)

    # Keep already-safe courses from monopolizing schedule.
    if current_grade >= passing_grade:
        score = min(score, 0.35)

    if completion >= 100:
        return 0.0

    return round(score, 4)


def build_schedule(
    scored_tasks: list,
    daily_limit: float,
    start_date: date,
    available_sessions=None,
) -> list:
    """
    Greedy hour-by-hour assignment with a single active task at any point in time.
    Returns list of schedule entries:
    {day, start_time, end_time, task_name, hours_allocated}.
    """
    schedule = []
    last_entry = None

    # If explicit available sessions are provided, schedule only inside those
    if available_sessions:
        # sessions are expected as list of dicts with start_dt/end_dt datetimes
        sessions_state = [
            {"start_dt": s["start_dt"], "end_dt": s["end_dt"], "cursor": s["start_dt"]}
            for s in available_sessions
        ]

        for task in scored_tasks:
            remaining = _hours_needed(task)
            name = _task_name(task)

            while remaining > 0.05:
                # find next session that still has room
                session = None
                for s in sessions_state:
                    if s["cursor"] < s["end_dt"]:
                        session = s
                        break

                if session is None:
                    # no more available time
                    break

                available = (session["end_dt"] - session["cursor"]).total_seconds() / 3600.0
                if available <= 0:
                    continue

                slot = min(1.0, remaining, available)
                start_dt = session["cursor"]
                end_dt = start_dt + timedelta(hours=slot)

                # Don't schedule past the task's deadline
                deadline_date = start_date + timedelta(days=int(task.get("deadline_days", 99)))
                if start_dt.date() > deadline_date:
                    # cannot schedule remaining hours for this task
                    remaining = 0
                    break

                schedule.append({
                    "day": (start_dt.date() - start_date).days + 1,
                    "start_time": start_dt.isoformat(),
                    "end_time": end_dt.isoformat(),
                    "task_id": task.get("task_id"),
                    "task_name": name,
                    "hours_allocated": round(slot, 1),
                    "priority_score": task["_priority_score"],
                    "tier": task["_tier"],
                    "priority_source": task.get("_priority_source", "effective_hybrid"),
                    "analysis_priority": task.get("analysis", {}).get("priority"),
                })

                current_entry = schedule[-1]
                if (
                    last_entry is not None
                    and last_entry.get("day") == current_entry.get("day")
                    and last_entry.get("task_id") == current_entry.get("task_id")
                    and last_entry.get("task_name") == current_entry.get("task_name")
                    and last_entry.get("end_time") == current_entry.get("start_time")
                ):
                    last_entry["end_time"] = current_entry["end_time"]
                    last_entry["hours_allocated"] = round(
                        float(last_entry.get("hours_allocated", 0)) + float(current_entry.get("hours_allocated", 0)),
                        1,
                    )
                    schedule.pop()
                else:
                    last_entry = current_entry

                # advance session cursor
                session["cursor"] = end_dt
                remaining -= slot

        return schedule

    # Fallback: original daily-based scheduling
    day_idx = 0
    day_hours_used = 0.0

    for task in scored_tasks:
        remaining = _hours_needed(task)
        name = _task_name(task)

        while remaining > 0.05:
            if daily_limit > 0 and day_hours_used >= daily_limit:
                day_idx += 1
                day_hours_used = 0.0

            available_today = daily_limit - day_hours_used if daily_limit > 0 else remaining
            if available_today <= 0:
                day_idx += 1
                day_hours_used = 0.0
                continue

            slot = min(1.0, remaining, available_today)

            current_date = start_date + timedelta(days=day_idx)
            start_dt = datetime.combine(current_date, time.min) + timedelta(hours=day_hours_used)
            end_dt = start_dt + timedelta(hours=slot)

            # Don't schedule past the task's deadline
            deadline_date = start_date + timedelta(days=int(task.get("deadline_days", 99)))
            if current_date > deadline_date:
                break  # deadline passed, skip remaining hours

            schedule.append({
                "day": day_idx + 1,
                "start_time": start_dt.isoformat(),
                "end_time": end_dt.isoformat(),
                "task_id": task.get("task_id"),
                "task_name": name,
                "hours_allocated": round(slot, 1),
                "priority_score": task["_priority_score"],
                "tier": task["_tier"],
                "priority_source": task.get("_priority_source", "effective_hybrid"),
                "analysis_priority": task.get("analysis", {}).get("priority"),
            })

            current_entry = schedule[-1]
            if (
                last_entry is not None
                and last_entry.get("day") == current_entry.get("day")
                and last_entry.get("task_id") == current_entry.get("task_id")
                and last_entry.get("task_name") == current_entry.get("task_name")
                and last_entry.get("end_time") == current_entry.get("start_time")
            ):
                last_entry["end_time"] = current_entry["end_time"]
                last_entry["hours_allocated"] = round(
                    float(last_entry.get("hours_allocated", 0)) + float(current_entry.get("hours_allocated", 0)),
                    1,
                )
                schedule.pop()
            else:
                last_entry = current_entry

            day_hours_used += slot
            remaining -= slot

    return schedule


def _build_deadline_warnings(scored_tasks: list, schedule: list, start_date: date) -> list:
    """
    Identify tasks that cannot finish before their deadline based on allocated hours.

    A task is flagged when the hours scheduled on or before its deadline are still
    smaller than the remaining hours needed to finish it.
    """
    warnings = []

    schedule_by_task = {}
    for entry in schedule:
        task_id = entry.get("task_id")
        if task_id is None:
            continue
        schedule_by_task.setdefault(str(task_id), []).append(entry)

    for task in scored_tasks:
        task_id = str(task.get("task_id"))
        needed_hours = _hours_needed(task)
        deadline_days = _safe_float(task.get("deadline_days", 7), 7)
        deadline_date = start_date + timedelta(days=int(deadline_days))

        allocated_before_deadline = 0.0
        for entry in schedule_by_task.get(task_id, []):
            start_dt = _parse_timestamp(entry.get("start_time"))
            if start_dt is None:
                continue
            if start_dt.date() <= deadline_date:
                allocated_before_deadline += _safe_float(entry.get("hours_allocated", 0), 0)

        if allocated_before_deadline + 0.05 < needed_hours:
            warnings.append({
                "task_id": task.get("task_id"),
                "task_name": _task_name(task),
                "deadline_days": round(deadline_days, 1),
                "hours_needed": round(needed_hours, 1),
                "hours_allocated_before_deadline": round(allocated_before_deadline, 1),
                "hours_missing": round(max(0.0, needed_hours - allocated_before_deadline), 1),
                "deadline_date": deadline_date.isoformat(),
                "reason": "Not enough scheduled hours before deadline",
            })

    return warnings


def _normalize_sessions(raw_sessions):
    """Normalize incoming session specs into a sorted list of start/end datetimes.

    Accepts a list of dicts like {"start_time": ISO, "end_time": ISO} or
    list/tuple pairs [start_iso, end_iso]. Returns list of dicts with
    `start_dt` and `end_dt` datetime objects, or None if parsing fails.
    """
    if not raw_sessions:
        return None

    absolute_sessions = []
    daily_templates = []
    for item in raw_sessions:
        start = None
        end = None
        if isinstance(item, dict):
            raw_start = item.get("start_time") or item.get("start") or item.get("from")
            raw_end = item.get("end_time") or item.get("end") or item.get("to")
            start_dt = _parse_timestamp(raw_start)
            end_dt = _parse_timestamp(raw_end)
            if start_dt and end_dt:
                start = start_dt
                end = end_dt
            else:
                # try parse as time-only strings (daily template)
                try:
                    if raw_start and raw_end:
                        try:
                            tstart = time.fromisoformat(str(raw_start))
                        except Exception:
                            tstart = None
                        try:
                            tend = time.fromisoformat(str(raw_end))
                        except Exception:
                            tend = None
                        if tstart and tend:
                            daily_templates.append({"start_time": tstart, "end_time": tend})
                            continue
                except Exception:
                    pass
        elif isinstance(item, (list, tuple)) and len(item) >= 2:
            s0 = _parse_timestamp(item[0])
            s1 = _parse_timestamp(item[1])
            if s0 and s1:
                start = s0
                end = s1
            else:
                # maybe time-only pair
                try:
                    t0 = time.fromisoformat(str(item[0]))
                    t1 = time.fromisoformat(str(item[1]))
                    daily_templates.append({"start_time": t0, "end_time": t1})
                    continue
                except Exception:
                    pass

        if start and end and end > start:
            absolute_sessions.append({"start_dt": start, "end_dt": end})

    # Prefer absolute sessions if any; otherwise return daily templates.
    if absolute_sessions:
        absolute_sessions.sort(key=lambda s: s["start_dt"])
        return absolute_sessions

    if daily_templates:
        return daily_templates

    return None


def _priority_tier_label(score: float) -> str:
    """Map the final score to a display tier used in the schedule output."""
    if score >= 0.55:
        return "HIGH"
    elif score >= 0.30:
        return "MEDIUM"
    return "LOW"


def recommend_priorities(data: dict) -> dict:
    """Return ranked tasks and a day-by-day schedule for the supplied payload."""
    incoming_tasks = data.get("tasks", [])
    current_grade = float(data.get("current_grade", 0))
    passing_grade = float(data.get("passing_grade", 75))
    daily_hours = float(data.get("daily_study_hours", 6))
    start_date_str = data.get("start_date")  # ISO format "YYYY-MM-DD" or None
    analysis_method = _resolve_analysis_method(data.get("analysis_method"))
    raw_sessions = data.get("available_sessions") or data.get("sessions")

    if not incoming_tasks:
        return {"error": "No tasks provided"}

    # Parse start date
    try:
        start = date.fromisoformat(start_date_str) if start_date_str else date.today()
    except (ValueError, TypeError):
        start = date.today()

    canonical_tasks = [
        _priority_analysis_task_payload(task, index, current_grade, passing_grade, daily_hours, start)
        for index, task in enumerate(incoming_tasks, start=1)
    ]

    analysis_report = _run_analysis_pipeline(canonical_tasks, analysis_method, current_grade, passing_grade)
    merged_tasks = _merge_analysis_results(canonical_tasks, analysis_report, current_grade, passing_grade)

    # Score and annotate each task. The HYBRID score is used to *sort* tasks
    # for the schedule (it factors in completion %, deadline boosts, etc), but
    # the TIER label is taken straight from priority_analysis so task-value
    # and priority-planner show the same HIGH/MEDIUM/LOW for the same task.
    scored = []
    for task in merged_tasks:
        score = _compute_hybrid_priority_score(task, current_grade, passing_grade)
        analysis_priority = (task.get("analysis") or {}).get("priority")
        tier = analysis_priority if analysis_priority in ("HIGH", "MEDIUM", "LOW") else _priority_tier_label(score)
        scored.append({
            **task,
            "_priority_score": round(score, 4),
            "_tier": tier,
            "_priority_source": "analysis_aligned",
        })

    # Sort by priority score descending
    scored.sort(key=lambda x: x["_priority_score"], reverse=True)

    # Normalize sessions (if provided). Support daily templates (time-only)
    normalized_sessions = _normalize_sessions(raw_sessions)

    # Fallback: sometimes _normalize_sessions can fail to detect simple
    # time-only dicts due to input shapes. Try a permissive parse here.
    if raw_sessions and normalized_sessions is None:
        try:
            fallback_templates = []
            for item in raw_sessions:
                if isinstance(item, dict):
                    rs = item.get("start_time") or item.get("start") or item.get("from")
                    re = item.get("end_time") or item.get("end") or item.get("to")
                    if rs and re:
                        try:
                            t0 = time.fromisoformat(str(rs))
                            t1 = time.fromisoformat(str(re))
                            fallback_templates.append({"start_time": t0, "end_time": t1})
                        except Exception:
                            continue
                elif isinstance(item, (list, tuple)) and len(item) >= 2:
                    try:
                        t0 = time.fromisoformat(str(item[0]))
                        t1 = time.fromisoformat(str(item[1]))
                        fallback_templates.append({"start_time": t0, "end_time": t1})
                    except Exception:
                        continue

            if fallback_templates:
                normalized_sessions = fallback_templates
        except Exception:
            normalized_sessions = None

    # If sessions are provided as daily templates (contain start_time keys),
    # expand them into absolute datetimes for each day starting at `start`.
    if normalized_sessions and isinstance(normalized_sessions[0].get("start_time"), time):
        # total hours needed
        total_hours_needed = sum(_hours_needed(t) for t in scored)
        # compute availability per day from template
        per_day_available = 0.0
        for s in normalized_sessions:
            dur = (datetime.combine(date.min, s["end_time"]) - datetime.combine(date.min, s["start_time"]))
            per_day_available += max(0.0, dur.total_seconds() / 3600.0)

        if per_day_available <= 0:
            expanded_sessions = None
        else:
            days_needed_est = math.ceil(total_hours_needed / per_day_available) if per_day_available > 0 else 0
            max_deadline = 0
            for t in scored:
                max_deadline = max(max_deadline, int(_safe_float(t.get("deadline_days", 7), 7)))
            horizon_days = max(14, days_needed_est + 3, max_deadline + 1)
            expanded_sessions = []
            for d in range(horizon_days):
                day_date = start + timedelta(days=d)
                for s in normalized_sessions:
                    st = datetime.combine(day_date, s["start_time"])
                    en = datetime.combine(day_date, s["end_time"])
                    if en > st:
                        expanded_sessions.append({"start_dt": st, "end_dt": en})
        normalized_sessions = expanded_sessions

    # Build schedule using normalized (absolute) sessions or fallback daily limit
    schedule = build_schedule(scored, daily_hours, start, available_sessions=normalized_sessions)
    deadline_warnings = _build_deadline_warnings(scored, schedule, start)

    # Format ranked list (clean output, no internal keys)
    ranked = []
    for rank, t in enumerate(scored, start=1):
        ranked.append({
            "rank": rank,
            "task_id": t.get("task_id"),
            "name": _task_name(t),
            "sks": t.get("sks", 0),
            "grade_weight": t.get("grade_weight", 0),
            "deadline_days": t.get("deadline_days", 0),
            "difficulty": t.get("difficulty", "medium"),
            "estimated_hours": t.get("estimated_hours", 0),
            "completion_pct": t.get("completion_pct", 0),
            "priority_score": t["_priority_score"],
            "tier": t["_tier"],
            "priority_source": t.get("_priority_source", "effective_hybrid"),
            "action": _build_rank_action(t["_tier"], t),
            "analysis": {
                "task_name": (t.get("analysis") or {}).get("task_name") or _task_name(t),
                "composite_score": (t.get("analysis") or {}).get("composite_score"),
            },
        })

    # Days needed summary
    total_hours = sum(_hours_needed(t) for t in scored)
    if normalized_sessions:
        # compute total available hours across sessions and average per-day
        total_available = sum((s["end_dt"] - s["start_dt"]).total_seconds() / 3600.0 for s in normalized_sessions)
        span_days = max(1, (normalized_sessions[-1]["end_dt"].date() - normalized_sessions[0]["start_dt"].date()).days + 1)
        avg_hours_per_day = total_available / span_days
        days_needed = math.ceil(total_hours / avg_hours_per_day) if avg_hours_per_day > 0 else 0
    else:
        days_needed = math.ceil(total_hours / daily_hours) if daily_hours > 0 else 0

    # expose a minimal analysis summary for backward compatibility (no full internal payload)
    analysis_summary_minimal = {
        "method": analysis_method,
        "tasks": [
            {
                "task_id": item.get("task_id"),
                "task_name": item.get("task_name") or item.get("details", {}).get("task_name"),
                "priority": item.get("priority"),
                "composite_score": item.get("composite_score"),
            }
            for item in analysis_report.get("tasks", [])
        ],
    }

    result = {
        "analysis": analysis_summary_minimal,
        "analysis_method": analysis_method,
        "ranked_tasks": ranked,
        "schedule": schedule,
        "deadline_warnings": deadline_warnings,
        "summary": {
            "total_tasks": len(ranked),
            "total_hours_needed": round(total_hours, 1),
            "days_needed": days_needed,
            "daily_study_hours": daily_hours,
            "high_priority": sum(1 for t in ranked if t["tier"] == "HIGH"),
            "medium_priority": sum(1 for t in ranked if t["tier"] == "MEDIUM"),
            "low_priority": sum(1 for t in ranked if t["tier"] == "LOW"),
            "deadline_warnings": len(deadline_warnings),
        },
    }

    # echo normalized sessions back to caller (as ISO strings) when provided
    if normalized_sessions:
        result["available_sessions"] = [
            {"start_time": s["start_dt"].isoformat(), "end_time": s["end_dt"].isoformat()} for s in normalized_sessions
        ]

    return result


def _build_rank_action(tier: str, task: dict) -> str:
    """Build the concise action string shown in the ranked output."""
    days = task.get("deadline_days", 7)
    name = _task_name(task) if task else "this task"
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
    """Vercel-compatible HTTP handler for the scheduling endpoint."""

    def log_message(self, format, *args):
        pass

    def _send_json(self, status: int, body: dict):
        """Write a JSON response with permissive CORS headers."""
        payload = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(payload)

    def do_OPTIONS(self):
        """Handle CORS preflight requests."""
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_POST(self):
        """Parse the request body, run scheduling, and return JSON output."""
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

def _print_schedule_gantt_chart(schedule: list, days_span: int = 14):
    """Print a simple ASCII Gantt-style view of the generated schedule."""
    if not schedule:
        print("No schedule generated.")
        return
    
    # Group by task_id
    tasks_in_schedule = {}
    for entry in schedule:
        task_id = entry.get("task_id")
        task_name = entry.get("task_name", "Unknown")
        day = entry.get("day", 0)
        hours = entry.get("hours_allocated", 0)
        
        if task_id not in tasks_in_schedule:
            tasks_in_schedule[task_id] = {"name": task_name, "entries": []}
        tasks_in_schedule[task_id]["entries"].append({"day": day, "hours": hours})
    
    print("\n" + "="*100)
    print("STUDY SCHEDULE (GANTT CHART)")
    print("="*100)
    
    # Header: day numbers
    header = "Task".ljust(25)
    for d in range(1, days_span + 1):
        header += f" D{d:2d}"
    print(header)
    print("-" * len(header))
    
    # For each task, print a bar
    for task_id, task_info in tasks_in_schedule.items():
        row = task_info["name"][:24].ljust(25)
        
        # Track cumulative hours per day
        hours_by_day = {}
        for entry in task_info["entries"]:
            day = entry["day"]
            hours = entry["hours"]
            hours_by_day[day] = hours_by_day.get(day, 0) + hours
        
        # Draw cells
        for d in range(1, days_span + 1):
            if d in hours_by_day:
                h = hours_by_day[d]
                if h >= 4:
                    cell = "███"
                elif h >= 2:
                    cell = "██"
                elif h > 0:
                    cell = "█"
                else:
                    cell = "   "
            else:
                cell = "   "
            row += f" {cell}"
        
        print(row)
    
    print("="*100)
    print("Legend: ███ = 4+ hours, ██ = 2-4 hours, █ = <2 hours")
    print()


def _print_ranked_tasks_table(ranked_tasks: list):
    """Print ranked tasks in a compact table for the local demo."""
    if not ranked_tasks:
        print("No ranked tasks.")
        return
    
    print("\n" + "="*100)
    print("PRIORITY RANKING")
    print("="*100)
    print(f"{'Rank':<4} {'Task':<30} {'Tier':<7} {'Score':<7} {'Days':<5} {'Hours':<6} {'%Done':<6} {'Weight':<6}")
    print("-"*100)
    
    for task in ranked_tasks:
        rank = task.get("rank", "-")
        name = task.get("name", "Unknown")[:28]
        tier = task.get("tier", "LOW")
        score = f"{task.get('priority_score', 0):.3f}"
        days = task.get("deadline_days", 0)
        hours = task.get("estimated_hours", 0)
        completion = task.get("completion_pct", 0)
        weight = task.get("grade_weight", 0)
        
        print(f"{rank:<4} {name:<30} {tier:<7} {score:<7} {days:<5} {hours:<6.1f} {completion:<6.0f} {weight:<6.0f}")
    
    print("="*100)
    print()


def plot_schedule_gantt_chart(
    schedule: list,
    *,
    title: str = "Study Schedule Gantt Chart",
    save_path: str | None = None,
    show: bool = True,
    sessions=None,
) -> None:
    """
    Render a modern Gantt-style chart using matplotlib.

    The chart groups contiguous entries by task name and draws one horizontal
    bar per scheduled segment. It expects schedule entries with `start_time`
    and `end_time` as ISO datetime strings.
    """
    if not schedule:
        print("No schedule generated.")
        return

    try:
        import matplotlib.pyplot as plt
        import matplotlib.dates as mdates
    except ImportError:
        print("matplotlib is not installed. Falling back to ASCII chart.")
        _print_schedule_gantt_chart(schedule)
        return

    def parse_dt(value):
        if not value:
            return None
        try:
            return datetime.fromisoformat(str(value))
        except ValueError:
            return None

    def task_color(tier: str) -> str:
        return {
            "HIGH": "#d94841",
            "MEDIUM": "#f0ad4e",
            "LOW": "#4e79a7",
        }.get(str(tier).upper(), "#6c757d")

    parsed_entries = []
    for entry in schedule:
        start_dt = parse_dt(entry.get("start_time"))
        end_dt = parse_dt(entry.get("end_time"))
        if not start_dt or not end_dt:
            continue
        parsed_entries.append({
            "task_name": entry.get("task_name", "Task"),
            "task_id": entry.get("task_id"),
            "start_dt": start_dt,
            "end_dt": end_dt,
            "tier": entry.get("tier", "LOW"),
            "priority_score": entry.get("priority_score", 0),
        })

    if not parsed_entries:
        print("No valid timestamp entries found in schedule.")
        return

    # Use a stable task order based on first appearance.
    task_order = []
    task_index = {}
    for item in parsed_entries:
        key = (item["task_id"], item["task_name"])
        if key not in task_index:
            task_index[key] = len(task_order)
            task_order.append(key)

    fig_height = max(3.0, 0.7 * len(task_order) + 1.8)
    fig, ax = plt.subplots(figsize=(14, fig_height))

    # Draw available sessions as light background bands when provided
    if sessions:
        for s in sessions:
            s_start = s.get("start_dt") if isinstance(s.get("start_dt"), datetime) else _parse_timestamp(s.get("start_time"))
            s_end = s.get("end_dt") if isinstance(s.get("end_dt"), datetime) else _parse_timestamp(s.get("end_time"))
            if not s_start or not s_end:
                continue
            left = mdates.date2num(s_start)
            right = mdates.date2num(s_end)
            ax.axvspan(left, right, color="#f5f5f5", zorder=0)

    # Render one bar per contiguous entry.
    for item in parsed_entries:
        key = (item["task_id"], item["task_name"])
        y = task_index[key]
        start_num = mdates.date2num(item["start_dt"])
        end_num = mdates.date2num(item["end_dt"])
        duration = max(end_num - start_num, 1.0 / (24 * 60))
        ax.barh(
            y=y,
            width=duration,
            left=start_num,
            height=0.55,
            color=task_color(item["tier"]),
            edgecolor="white",
            linewidth=1.1,
            alpha=0.95,
        )

        label = f"{item['task_name']} ({item['tier']})"
        ax.text(
            start_num + duration / 2,
            y,
            label,
            va="center",
            ha="center",
            color="white",
            fontsize=9,
            fontweight="bold",
        )

    # Axis formatting.
    ax.set_title(title, fontsize=16, fontweight="bold", pad=16)
    ax.set_yticks(range(len(task_order)))
    ax.set_yticklabels([name for _, name in task_order], fontsize=10)
    ax.xaxis_date()
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%b %d\n%H:%M"))
    ax.xaxis.set_major_locator(mdates.AutoDateLocator())
    ax.grid(axis="x", linestyle="--", alpha=0.25)
    ax.set_axisbelow(True)

    # Clean up the frame for a modern look.
    for spine in ["top", "right", "left"]:
        ax.spines[spine].set_visible(False)

    ax.tick_params(axis="y", length=0)
    fig.autofmt_xdate(rotation=0)
    plt.tight_layout()

    if save_path:
        plt.savefig(save_path, dpi=200, bbox_inches="tight")

    if show:
        plt.show()
    else:
        plt.close(fig)


if __name__ == "__main__":
    from datetime import date
    
    data = {
        "current_grade": 68,
        "passing_grade": 75,
        "daily_study_hours": 5,
        "sessions": [{"start_time":"09:00","end_time":"12:00"}, {"start_time":"18:00","end_time":"20:00"}],
        "start_date": date.today().isoformat(),
        "tasks": [
            {
                "task_id": "task_1",
                "task_name": "Mathematics Midterm",
                "task_type": "exam",
                "sks": 3,
                "grade_weight": 25,
                "estimated_hours": 10,
                "deadline_days": 3,
                "difficulty": "hard",
                "completion_pct": 10,
                "effort": "high",
            },
            {
                "task_id": "task_2",
                "task_name": "Programming Assignment",
                "task_type": "project",
                "sks": 4,
                "grade_weight": 15,
                "estimated_hours": 10,
                "deadline_days": 7,
                "difficulty": "hard",
                "completion_pct": 0,
                "effort": "high",
            },
            {
                "task_id": "task_3",
                "task_name": "Literature Essay",
                "task_type": "assignment",
                "sks": 2,
                "grade_weight": 12,
                "estimated_hours": 10,
                "deadline_days": 5,
                "difficulty": "medium",
                "completion_pct": 20,
                "effort": "medium",
            },
            {
                "task_id": "task_4",
                "task_name": "Physics Lab Report",
                "task_type": "project",
                "sks": 3,
                "grade_weight": 18,
                "estimated_hours": 10,
                "deadline_days": 10,
                "difficulty": "medium",
                "completion_pct": 0,
                "effort": "medium",
            },
            {
                "task_id": "task_5",
                "task_name": "Chemistry Quiz Prep",
                "task_type": "quiz",
                "sks": 1,
                "grade_weight": 8,
                "estimated_hours": 10,
                "deadline_days": 2,
                "difficulty": "easy",
                "completion_pct": 0,
                "effort": "low",
            },
            {
                "task_id": "task_6",
                "task_name": "History Reading Notes",
                "task_type": "homework",
                "sks": 1,
                "grade_weight": 6,
                "estimated_hours": 10,
                "deadline_days": 6,
                "difficulty": "easy",
                "completion_pct": 50,
                "effort": "low",
            },
        ],
    }
    
    result = recommend_priorities(data)
    
    # Print summary
    summary = result.get("summary", {})
    print("\n" + "="*100)
    print("SCHEDULING SUMMARY")
    print("="*100)
    print(f"Total Tasks:         {summary.get('total_tasks', 0)}")
    print(f"High Priority:       {summary.get('high_priority', 0)}")
    print(f"Medium Priority:     {summary.get('medium_priority', 0)}")
    print(f"Low Priority:        {summary.get('low_priority', 0)}")
    print(f"Total Hours Needed:  {summary.get('total_hours_needed', 0):.1f}")
    print(f"Days Needed:         {summary.get('days_needed', 0)}")
    print(f"Daily Study Hours:   {summary.get('daily_study_hours', 0):.1f}")
    print("="*100)
    
    # Print ranked tasks
    ranked = result.get("ranked_tasks", [])
    _print_ranked_tasks_table(ranked)
    
    # Print gantt chart
    schedule = result.get("schedule", [])
    _print_schedule_gantt_chart(schedule, days_span=14)
    
    # print(json.dumps(result, indent=2))
    plot_schedule_gantt_chart(result["schedule"])