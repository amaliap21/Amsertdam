import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getUserId } from "@/lib/get-user-id";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabaseAdmin as any;

// POST /api/social/ratings { tutor_id, stars, comment? } — rate a tutor (1-5).
// One rating per (tutor, rater); re-posting updates it. Triggers recompute the
// tutor's rating_avg / rating_count.
export async function POST(req: Request) {
  try {
    const userId = await getUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { tutor_id, stars, comment, recommend, session_id } = await req.json();
    const s = Math.round(Number(stars));
    if (!tutor_id || typeof tutor_id !== "string") {
      return NextResponse.json({ error: "Missing tutor_id" }, { status: 400 });
    }
    if (tutor_id === userId) {
      return NextResponse.json({ error: "You can't rate yourself" }, { status: 400 });
    }
    if (!Number.isFinite(s) || s < 1 || s > 5) {
      return NextResponse.json({ error: "Stars must be 1-5" }, { status: 400 });
    }

    const { error } = await db.from("tutor_ratings").upsert(
      {
        tutor_id,
        rater_id: userId,
        stars: s,
        comment: comment ? String(comment).slice(0, 1000) : null,
        recommend: recommend === true,
        session_id: typeof session_id === "string" ? session_id : null,
      },
      { onConflict: "tutor_id,rater_id" },
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const { data: tutor } = await db
      .from("profiles")
      .select("rating_avg, rating_count, recommend_count")
      .eq("id", tutor_id)
      .single();
    return NextResponse.json({
      ok: true,
      rating_avg: tutor?.rating_avg ?? null,
      rating_count: tutor?.rating_count ?? null,
      recommend_count: tutor?.recommend_count ?? null,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
