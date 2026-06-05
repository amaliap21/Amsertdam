import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getUserId } from "@/lib/get-user-id";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabaseAdmin as any;

// POST /api/social/articles/like { article_id } — toggle like (trigger keeps like_count).
export async function POST(req: Request) {
  try {
    const userId = await getUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { article_id } = await req.json();
    if (!article_id || typeof article_id !== "string") {
      return NextResponse.json({ error: "Missing article_id" }, { status: 400 });
    }

    const { data: existing } = await db
      .from("article_likes")
      .select("article_id")
      .eq("article_id", article_id)
      .eq("user_id", userId)
      .maybeSingle();

    if (existing) {
      const { error } = await db.from("article_likes").delete().eq("article_id", article_id).eq("user_id", userId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    } else {
      const { error } = await db.from("article_likes").insert({ article_id, user_id: userId });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { data: art } = await db.from("articles").select("like_count").eq("id", article_id).single();
    return NextResponse.json({ liked: !existing, like_count: art?.like_count ?? 0 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
