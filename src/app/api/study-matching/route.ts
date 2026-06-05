import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/get-user-id";

// Port of api/python/study_matching.py
// Peer matching driven by RealTrack's own priority/risk data — not a follow graph.

const W_COMPLEMENT = 0.4;
const W_SHARED = 0.25;
const W_SCHEDULE = 0.2;
const W_GOAL = 0.15;

const STRONG_GRADE = 78;
const WEAK_GRADE = 70;

const clamp = (x: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
const title = (s: string) => s.split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

interface CourseInput {
  course?: string;
  name?: string;
  current_grade?: number;
  grade?: number;
}
interface StudentInput {
  user_id?: string;
  id?: string;
  name?: string;
  target_grade?: number;
  availability?: string[];
  courses?: CourseInput[];
}

function courseMap(courses: CourseInput[] = []): Map<string, number> {
  const out = new Map<string, number>();
  for (const c of courses) {
    const name = String(c.course ?? c.name ?? "").trim().toLowerCase();
    if (name) out.set(name, Number(c.current_grade ?? c.grade ?? 0));
  }
  return out;
}
const weakSet = (m: Map<string, number>) => new Set([...m].filter(([, v]) => v < WEAK_GRADE).map(([k]) => k));
const strongSet = (m: Map<string, number>) => new Set([...m].filter(([, v]) => v >= STRONG_GRADE).map(([k]) => k));
const inter = (a: Set<string>, b: Set<string>) => new Set([...a].filter((x) => b.has(x)));
const union = (a: Set<string>, b: Set<string>) => new Set([...a, ...b]);

function scheduleOverlap(a: string[] = [], b: string[] = []): number {
  const sa = new Set(a);
  const sb = new Set(b);
  if (!sa.size || !sb.size) return 0;
  return inter(sa, sb).size / union(sa, sb).size;
}

function scoreCandidate(me: StudentInput, other: StudentInput) {
  const mine = courseMap(me.courses);
  const theirs = courseMap(other.courses);
  const myWeak = weakSet(mine);
  const myStrong = strongSet(mine);
  const theirWeak = weakSet(theirs);
  const theirStrong = strongSet(theirs);

  const theyHelpMe = inter(myWeak, theirStrong);
  const iHelpThem = inter(theirWeak, myStrong);
  const denom = Math.max(1, union(myWeak, theirWeak).size);
  const complement = clamp((theyHelpMe.size + iHelpThem.size) / denom);

  const shared = inter(myWeak, theirWeak);
  const sharedScore = myWeak.size ? clamp(shared.size / Math.max(1, myWeak.size)) : 0;

  const schedule = scheduleOverlap(me.availability, other.availability);

  const myGoal = Number(me.target_grade ?? 80);
  const theirGoal = Number(other.target_grade ?? 80);
  const goal = clamp(1 - Math.abs(myGoal - theirGoal) / 30);

  const total = W_COMPLEMENT * complement + W_SHARED * sharedScore + W_SCHEDULE * schedule + W_GOAL * goal;

  const reasons: string[] = [];
  if (theyHelpMe.size) reasons.push(`can help you with ${[...theyHelpMe].sort().map(title).join(", ")}`);
  if (iHelpThem.size) reasons.push(`you could help them with ${[...iHelpThem].sort().map(title).join(", ")}`);
  if (shared.size) reasons.push(`both behind on ${[...shared].sort().map(title).join(", ")} this week`);
  if (schedule >= 0.34) reasons.push("overlapping free time");
  if (!reasons.length && goal >= 0.8) reasons.push("similar target grade and pace");

  let matchType: string;
  if (theyHelpMe.size && iHelpThem.size) matchType = "Study partner (mutual help)";
  else if (theyHelpMe.size) matchType = "Mentor";
  else if (iHelpThem.size) matchType = "Mentee";
  else if (shared.size) matchType = "Study buddy (same struggle)";
  else matchType = "Accountability partner";

  return {
    user_id: other.user_id ?? other.id,
    name: other.name ?? "Student",
    match_score: Math.round(total * 1000) / 10,
    match_type: matchType,
    reasons,
    shared_courses: [...shared].sort().map(title),
    breakdown: {
      complement: Math.round(complement * 1000) / 1000,
      shared_struggle: Math.round(sharedScore * 1000) / 1000,
      schedule: Math.round(schedule * 1000) / 1000,
      goal_alignment: Math.round(goal * 1000) / 1000,
    },
  };
}

type Match = ReturnType<typeof scoreCandidate>;

function headline(top: Match[]): string {
  if (!top.length) return "No strong study matches yet — add your courses to find peers.";
  const best = top[0];
  if (best.shared_courses.length) {
    const n = top.filter((m) => m.shared_courses.length).length;
    return `${n} peer(s) are also behind on ${best.shared_courses[0]} this week — start a focus room?`;
  }
  return `${best.name} looks like a great ${best.match_type.toLowerCase()} for you.`;
}

export async function POST(req: NextRequest) {
  const auth = await requireUserId();
  if (auth.response) return auth.response;
  try {
    const data = await req.json();
    const me: StudentInput = data.me ?? {};
    const pool: StudentInput[] = data.candidates ?? [];
    const limit = Number(data.limit ?? 5);
    const scored = pool
      .map((other) => scoreCandidate(me, other))
      .filter((s) => s.match_score > 0 && s.reasons.length)
      .sort((a, b) => b.match_score - a.match_score);
    const top = scored.slice(0, limit);
    return NextResponse.json({
      matches: top,
      summary: { evaluated: pool.length, matched: scored.length, best: top[0]?.name ?? null, headline: headline(top) },
    });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" },
  });
}
