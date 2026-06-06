import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getUserId } from "@/lib/get-user-id";
import { getMutualIds } from "@/lib/social";

// profiles/social tables aren't in the generated Database type, so cast.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabaseAdmin as any;

/** Reputation score: stars dominate, followers and hosted sessions add to it.
 *  "more followers + more stars + more engagement => higher standing." */
function reputation(p: { rating_avg?: number; rating_count?: number; follower_count?: number; sessions_hosted?: number; recommend_count?: number }): number {
  const stars = Number(p.rating_avg ?? 0);
  const ratings = Number(p.rating_count ?? 0);
  const followers = Number(p.follower_count ?? 0);
  const hosted = Number(p.sessions_hosted ?? 0);
  const recommends = Number(p.recommend_count ?? 0);
  return Math.round(stars * 20 + Math.min(ratings, 50) + followers + hosted * 5 + recommends * 3);
}

// GET /api/social/tutors — ranked tutor directory
export async function GET() {
  try {
    const userId = await getUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: tutors, error } = await db
      .from("profiles")
      .select("id, full_name, avatar_url, headline, bio, tutor_subjects, interests, country, is_public, follower_count, rating_avg, rating_count, recommend_count, sessions_hosted")
      .eq("is_tutor", true)
      .limit(100);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Who do I already follow? (to render follow state)
    const { data: myFollows } = await db.from("follows").select("following_id").eq("follower_id", userId);
    const followingSet = new Set((myFollows ?? []).map((f: { following_id: string }) => f.following_id));

    // Privacy: hide private tutors unless they're my mutual (or me).
    const mutuals = await getMutualIds(db, userId);
    const ranked = (tutors ?? [])
      .filter((t: { id: string; is_public?: boolean | null }) => t.is_public !== false || t.id === userId || mutuals.has(t.id))
      .map((t: Record<string, unknown>) => ({
        ...t,
        reputation: reputation(t),
        is_following: followingSet.has(t.id),
        is_me: t.id === userId,
      }))
      .sort((a: { reputation: number }, b: { reputation: number }) => b.reputation - a.reputation);

    return NextResponse.json({ tutors: ranked });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// POST /api/social/tutors — become / update a tutor profile
export async function POST(req: Request) {
  try {
    const userId = await getUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    const becomingTutor = body.is_tutor !== false;
    const updates: Record<string, unknown> = { id: userId, is_tutor: becomingTutor };

    if (becomingTutor) {
      if (body.headline !== undefined) updates.headline = String(body.headline).slice(0, 140);
      if (body.bio !== undefined) updates.bio = String(body.bio).slice(0, 2000);
      if (Array.isArray(body.tutor_subjects)) updates.tutor_subjects = body.tutor_subjects.slice(0, 12).map((s: unknown) => String(s).slice(0, 40));
    } else {
      // Stop tutoring resets the whole tutor profile and cancels every session
      // the user was hosting (participants cascade away with them).
      updates.headline = null;
      updates.tutor_subjects = [];
      await db.from("study_sessions").delete().eq("host_id", userId);
    }

    // Upsert (not update) so it self-heals if the profile row doesn't exist yet.
    const { data, error } = await db.from("profiles").upsert(updates, { onConflict: "id" }).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
