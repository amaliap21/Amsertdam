"""
Priority-Based Study-Matching Engine
------------------------------------
The differentiator vs. a generic "study social network": matches are driven
by RealTrack's own priority/risk data, not by popularity or a follow graph.

Given the requesting student and a pool of candidate peers, it scores each
candidate on four signals and returns a ranked, *explained* match list:

    1. Complementary help (peer-teaching) - candidate is STRONG where the
       requester is WEAK. Highest value: the protege effect cuts both ways.
    2. Shared struggle (body-doubling)     - both are behind on the same
       course this week -> study-together room.
    3. Schedule overlap                    - overlapping free time slots.
    4. Goal alignment                      - similar target grade / pace.

Pure stdlib. Run `py -3 study_matching.py` for a local demo.
"""

from http.server import BaseHTTPRequestHandler
import json


W_COMPLEMENT = 0.40
W_SHARED = 0.25
W_SCHEDULE = 0.20
W_GOAL = 0.15

STRONG_GRADE = 78.0  # at/above this in a course => can help others
WEAK_GRADE = 70.0    # below this => struggling / wants help


def _clamp(x: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, x))


def _course_map(courses: list[dict]) -> dict[str, float]:
    """name -> current grade."""
    out = {}
    for c in courses:
        name = str(c.get("course", c.get("name", ""))).strip().lower()
        if name:
            out[name] = float(c.get("current_grade", c.get("grade", 0)))
    return out


def _weak_set(cmap: dict[str, float]) -> set[str]:
    return {k for k, v in cmap.items() if v < WEAK_GRADE}


def _strong_set(cmap: dict[str, float]) -> set[str]:
    return {k for k, v in cmap.items() if v >= STRONG_GRADE}


def _schedule_overlap(a: list[str], b: list[str]) -> float:
    """Jaccard overlap of availability slots (e.g. 'mon-am', 'wed-pm')."""
    sa, sb = set(a), set(b)
    if not sa or not sb:
        return 0.0
    return len(sa & sb) / len(sa | sb)


def _title(name: str) -> str:
    return " ".join(w.capitalize() for w in name.split())


def score_candidate(me: dict, other: dict) -> dict:
    my_courses = _course_map(me.get("courses", []))
    their_courses = _course_map(other.get("courses", []))
    my_weak = _weak_set(my_courses)
    my_strong = _strong_set(my_courses)
    their_weak = _weak_set(their_courses)
    their_strong = _strong_set(their_courses)

    # 1. Complementary: they are strong where I am weak (they tutor me),
    #    and I am strong where they are weak (I tutor them). Mutual help.
    they_help_me = my_weak & their_strong
    i_help_them = their_weak & my_strong
    helpful_courses = sorted(set(my_courses) | set(their_courses))
    denom = max(1, len(my_weak | their_weak))
    complement = _clamp((len(they_help_me) + len(i_help_them)) / denom)

    # 2. Shared struggle: same course, both below passing => study together.
    shared = my_weak & their_weak
    shared_score = _clamp(len(shared) / max(1, len(my_weak))) if my_weak else 0.0

    # 3. Schedule overlap
    schedule = _schedule_overlap(me.get("availability", []), other.get("availability", []))

    # 4. Goal alignment: closeness of target grade / weekly study pace.
    my_goal = float(me.get("target_grade", 80))
    their_goal = float(other.get("target_grade", 80))
    goal = _clamp(1.0 - abs(my_goal - their_goal) / 30.0)

    total = (
        W_COMPLEMENT * complement
        + W_SHARED * shared_score
        + W_SCHEDULE * schedule
        + W_GOAL * goal
    )

    reasons = []
    if they_help_me:
        reasons.append(f"can help you with {', '.join(_title(c) for c in sorted(they_help_me))}")
    if i_help_them:
        reasons.append(f"you could help them with {', '.join(_title(c) for c in sorted(i_help_them))}")
    if shared:
        reasons.append(f"both behind on {', '.join(_title(c) for c in sorted(shared))} this week")
    if schedule >= 0.34:
        reasons.append("overlapping free time")
    if not reasons and goal >= 0.8:
        reasons.append("similar target grade and pace")

    if they_help_me and i_help_them:
        match_type = "Study partner (mutual help)"
    elif they_help_me:
        match_type = "Mentor"
    elif i_help_them:
        match_type = "Mentee"
    elif shared:
        match_type = "Study buddy (same struggle)"
    else:
        match_type = "Accountability partner"

    return {
        "user_id": other.get("user_id", other.get("id")),
        "name": other.get("name", "Student"),
        "match_score": round(total * 100, 1),
        "match_type": match_type,
        "reasons": reasons,
        "shared_courses": [_title(c) for c in sorted(shared)],
        "breakdown": {
            "complement": round(complement, 3),
            "shared_struggle": round(shared_score, 3),
            "schedule": round(schedule, 3),
            "goal_alignment": round(goal, 3),
        },
    }


def match(data: dict) -> dict:
    me = data.get("me", {})
    pool = data.get("candidates", [])
    limit = int(data.get("limit", 5))
    scored = [score_candidate(me, other) for other in pool]
    # Only surface matches with a real reason to connect.
    scored = [s for s in scored if s["match_score"] > 0 and s["reasons"]]
    scored.sort(key=lambda s: s["match_score"], reverse=True)
    top = scored[:limit]
    return {
        "matches": top,
        "summary": {
            "evaluated": len(pool),
            "matched": len(scored),
            "best": top[0]["name"] if top else None,
            "headline": _headline(top),
        },
    }


def _headline(top: list[dict]) -> str:
    if not top:
        return "No strong study matches yet — add your courses to find peers."
    best = top[0]
    if best["shared_courses"]:
        return (f"{len([m for m in top if m['shared_courses']])} peer(s) are also behind on "
                f"{best['shared_courses'][0]} this week — start a focus room?")
    return f"{best['name']} looks like a great {best['match_type'].lower()} for you."


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
            self._send_json(200, match(data))
        except json.JSONDecodeError:
            self._send_json(400, {"error": "Invalid JSON"})
        except Exception as e:  # noqa: BLE001
            self._send_json(500, {"error": str(e)})


if __name__ == "__main__":
    demo = {
        "me": {
            "name": "Amalia",
            "target_grade": 82,
            "availability": ["mon-pm", "wed-pm", "sat-am"],
            "courses": [
                {"course": "Operating Systems", "current_grade": 61},
                {"course": "Data Structures", "current_grade": 84},
                {"course": "Databases", "current_grade": 66},
            ],
        },
        "candidates": [
            {"user_id": "u1", "name": "Budi", "target_grade": 85, "availability": ["mon-pm", "tue-am"],
             "courses": [{"course": "Operating Systems", "current_grade": 88},
                         {"course": "Databases", "current_grade": 60}]},
            {"user_id": "u2", "name": "Citra", "target_grade": 80, "availability": ["wed-pm", "sat-am"],
             "courses": [{"course": "Operating Systems", "current_grade": 59},
                         {"course": "Databases", "current_grade": 63}]},
            {"user_id": "u3", "name": "Dewi", "target_grade": 70, "availability": ["fri-am"],
             "courses": [{"course": "Algorithms", "current_grade": 90}]},
        ],
    }
    out = match(demo)
    print("=" * 78)
    print("STUDY-MATCHING ENGINE DEMO")
    print("=" * 78)
    print("Headline:", out["summary"]["headline"])
    print("-" * 78)
    for m in out["matches"]:
        print(f"{m['match_score']:>5}  {m['name']:<8} [{m['match_type']}]")
        for r in m["reasons"]:
            print(f"        - {r}")
    print("-" * 78)
