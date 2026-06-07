// Shared peer-matching scorer used by /api/study-buddy.
// Driven by RealTrack's own data: course strengths/struggles + shared interests
// — not a follow graph. (Availability isn't stored for real users, so the
// "connection" signal is interest overlap rather than schedule overlap.)

const W_COMPLEMENT = 0.4; // they're strong where I'm weak (and vice versa)
const W_SHARED = 0.25; // both behind on the same course
const W_INTERESTS = 0.2; // shared interests/topics
const W_GOAL = 0.15; // similar target grade

const STRONG_GRADE = 78;
const WEAK_GRADE = 70;

export type MatchCourse = { course: string; current_grade: number };
export type MatchProfile = {
  user_id: string;
  name: string;
  avatar_url?: string | null;
  is_tutor?: boolean;
  target_grade?: number;
  interests?: string[];
  courses: MatchCourse[];
};

const clamp = (x: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
const title = (s: string) => s.split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

function courseMap(courses: MatchCourse[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const c of courses) {
    const name = String(c.course ?? "").trim().toLowerCase();
    if (name) out.set(name, Number(c.current_grade ?? 0));
  }
  return out;
}
const weakSet = (m: Map<string, number>) => new Set([...m].filter(([, v]) => v < WEAK_GRADE).map(([k]) => k));
const strongSet = (m: Map<string, number>) => new Set([...m].filter(([, v]) => v >= STRONG_GRADE).map(([k]) => k));
const inter = (a: Set<string>, b: Set<string>) => new Set([...a].filter((x) => b.has(x)));
const union = (a: Set<string>, b: Set<string>) => new Set([...a, ...b]);

function jaccard(a: string[] = [], b: string[] = []): { score: number; shared: string[] } {
  const sa = new Set(a.map((x) => x.toLowerCase().trim()).filter(Boolean));
  const sb = new Set(b.map((x) => x.toLowerCase().trim()).filter(Boolean));
  if (!sa.size || !sb.size) return { score: 0, shared: [] };
  const shared = [...inter(sa, sb)];
  return { score: shared.length / union(sa, sb).size, shared };
}

export type MatchResult = {
  user_id: string;
  name: string;
  avatar_url: string | null;
  is_tutor: boolean;
  match_score: number;
  match_type: string;
  reasons: string[];
  shared_courses: string[];
  shared_interests: string[];
};

export function scoreCandidate(me: MatchProfile, other: MatchProfile): MatchResult {
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

  const interests = jaccard(me.interests, other.interests);

  const myGoal = Number(me.target_grade ?? 80);
  const theirGoal = Number(other.target_grade ?? 80);
  const goal = clamp(1 - Math.abs(myGoal - theirGoal) / 30);

  const total =
    W_COMPLEMENT * complement + W_SHARED * sharedScore + W_INTERESTS * interests.score + W_GOAL * goal;

  const reasons: string[] = [];
  if (theyHelpMe.size) reasons.push(`can help you with ${[...theyHelpMe].sort().map(title).join(", ")}`);
  if (iHelpThem.size) reasons.push(`you could help them with ${[...iHelpThem].sort().map(title).join(", ")}`);
  if (shared.size) reasons.push(`both behind on ${[...shared].sort().map(title).join(", ")} this week`);
  if (interests.shared.length) reasons.push(`shared interest in ${interests.shared.map(title).join(", ")}`);
  if (!reasons.length && goal >= 0.8) reasons.push("similar target grade and pace");

  let matchType: string;
  if (theyHelpMe.size && iHelpThem.size) matchType = "Study partner (mutual help)";
  else if (theyHelpMe.size || other.is_tutor) matchType = "Mentor";
  else if (iHelpThem.size) matchType = "Mentee";
  else if (shared.size) matchType = "Study buddy (same struggle)";
  else matchType = "Accountability partner";

  return {
    user_id: other.user_id,
    name: other.name,
    avatar_url: other.avatar_url ?? null,
    is_tutor: !!other.is_tutor,
    match_score: Math.round(total * 1000) / 10,
    match_type: matchType,
    reasons,
    shared_courses: [...shared].sort().map(title),
    shared_interests: interests.shared.map(title),
  };
}

export function rankMatches(me: MatchProfile, candidates: MatchProfile[], limit = 8): MatchResult[] {
  return candidates
    .map((c) => scoreCandidate(me, c))
    .filter((m) => m.match_score > 0 && m.reasons.length)
    .sort((a, b) => b.match_score - a.match_score)
    .slice(0, limit);
}
