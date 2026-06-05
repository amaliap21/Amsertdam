import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getUserId } from "@/lib/get-user-id";
import { rankMatches, type MatchProfile, type MatchCourse } from "@/lib/match";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabaseAdmin as any;

// Courses store their assessment payload encoded in the title as
// `title|||{json}` (see /api/courses). Decode to read grades.
function decodeCourse(rawTitle: string): { title: string; payload: Record<string, unknown> } {
  const sep = rawTitle.indexOf("|||");
  if (sep === -1) return { title: rawTitle, payload: {} };
  try {
    const payload = JSON.parse(rawTitle.slice(sep + 3));
    return { title: rawTitle.slice(0, sep), payload: payload && typeof payload === "object" ? payload : {} };
  } catch {
    return { title: rawTitle.slice(0, sep), payload: {} };
  }
}

// Weighted average over scored assessments; 75 (neutral) when nothing graded.
function currentGrade(payload: Record<string, unknown>): number {
  const assessments = Array.isArray(payload.assessments) ? (payload.assessments as { weight?: number; score?: number | null }[]) : [];
  let w = 0;
  let ws = 0;
  for (const a of assessments) {
    const weight = Number(a.weight);
    if (Number.isFinite(weight) && weight > 0 && a.score != null && Number.isFinite(Number(a.score))) {
      w += weight;
      ws += Number(a.score) * weight;
    }
  }
  return w > 0 ? Math.round(ws / w) : 75;
}

function coursesFor(rows: { user_id: string; title: string }[]): Map<string, MatchCourse[]> {
  const map = new Map<string, MatchCourse[]>();
  for (const r of rows) {
    const { title, payload } = decodeCourse(r.title);
    if (!title) continue;
    const list = map.get(r.user_id) ?? [];
    list.push({ course: title, current_grade: currentGrade(payload) });
    map.set(r.user_id, list);
  }
  return map;
}

// GET /api/study-buddy — match the current user against REAL public peers.
export async function GET() {
  try {
    const userId = await getUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // My profile (interests) + public candidate profiles ("go global" users).
    const { data: me } = await db.from("profiles").select("id, full_name, avatar_url, interests, is_public").eq("id", userId).maybeSingle();
    const { data: candidates, error: candErr } = await db
      .from("profiles")
      .select("id, full_name, avatar_url, is_tutor, interests")
      .eq("is_public", true)
      .neq("id", userId)
      .limit(200);
    if (candErr) return NextResponse.json({ error: candErr.message }, { status: 500 });

    const candidateIds = (candidates ?? []).map((c: { id: string }) => c.id);
    const allIds = [userId, ...candidateIds];

    // Everyone's courses in one query.
    const { data: courseRows } = allIds.length
      ? await db.from("courses").select("user_id, title").in("user_id", allIds)
      : { data: [] };
    const byUser = coursesFor((courseRows ?? []) as { user_id: string; title: string }[]);

    const meProfile: MatchProfile = {
      user_id: userId,
      name: me?.full_name ?? "You",
      interests: me?.interests ?? [],
      target_grade: 80,
      courses: byUser.get(userId) ?? [],
    };

    const candidateProfiles: MatchProfile[] = (candidates ?? []).map((c: { id: string; full_name: string | null; avatar_url: string | null; is_tutor: boolean; interests: string[] | null }) => ({
      user_id: c.id,
      name: c.full_name ?? "Student",
      avatar_url: c.avatar_url,
      is_tutor: c.is_tutor,
      interests: c.interests ?? [],
      target_grade: 80,
      courses: byUser.get(c.id) ?? [],
    }));

    const matches = rankMatches(meProfile, candidateProfiles, 8);

    const sharedCount = matches.filter((m) => m.shared_courses.length).length;
    const headline = !candidateProfiles.length
      ? "No public peers yet — invite classmates, or turn on “Go global” in your profile."
      : !matches.length
        ? "No strong matches yet — add your courses and interests to find peers."
        : sharedCount
          ? `${sharedCount} peer(s) share a course you're working on — start a focus room?`
          : `${matches[0].name} looks like a great ${matches[0].match_type.toLowerCase()} for you.`;

    return NextResponse.json({
      matches,
      summary: {
        evaluated: candidateProfiles.length,
        matched: matches.length,
        my_courses: meProfile.courses.length,
        my_public: me?.is_public ?? true,
        headline,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
