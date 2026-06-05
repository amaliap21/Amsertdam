import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getUserId } from "@/lib/get-user-id";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabaseAdmin as any;

// GET /api/social/articles — published feed, newest first, with author + my-like state.
export async function GET() {
  try {
    const userId = await getUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: articles, error } = await db
      .from("articles")
      .select("id, author_id, title, body, course, tags, like_count, created_at")
      .eq("published", true)
      .order("created_at", { ascending: false })
      .limit(60);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const list = articles ?? [];
    const authorIds = [...new Set(list.map((a: { author_id: string }) => a.author_id))];
    const articleIds = list.map((a: { id: string }) => a.id);

    // Author profiles (no FK to profiles, so resolve manually).
    const { data: authors } = authorIds.length
      ? await db.from("profiles").select("id, full_name, avatar_url, is_tutor, rating_avg").in("id", authorIds)
      : { data: [] };
    const authorMap = new Map((authors ?? []).map((p: { id: string }) => [p.id, p]));

    // Which of these have I liked?
    const { data: myLikes } = articleIds.length
      ? await db.from("article_likes").select("article_id").eq("user_id", userId).in("article_id", articleIds)
      : { data: [] };
    const likedSet = new Set((myLikes ?? []).map((l: { article_id: string }) => l.article_id));

    const enriched = list.map((a: Record<string, unknown>) => ({
      ...a,
      author: authorMap.get(a.author_id as string) ?? null,
      liked: likedSet.has(a.id as string),
      is_mine: a.author_id === userId,
      excerpt: String(a.body ?? "").slice(0, 220),
    }));

    return NextResponse.json({ articles: enriched });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// POST /api/social/articles { title, body, course?, tags?, published? } — publish an article.
export async function POST(req: Request) {
  try {
    const userId = await getUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    const title = String(body.title ?? "").trim();
    const content = String(body.body ?? "").trim();
    if (title.length < 3) return NextResponse.json({ error: "Title is too short" }, { status: 400 });
    if (content.length < 20) return NextResponse.json({ error: "Article body is too short" }, { status: 400 });

    const row = {
      author_id: userId,
      title: title.slice(0, 200),
      body: content.slice(0, 20000),
      course: body.course ? String(body.course).slice(0, 120) : null,
      tags: Array.isArray(body.tags) ? body.tags.slice(0, 8).map((t: unknown) => String(t).slice(0, 40)) : [],
      published: body.published !== false,
    };
    const { data, error } = await db.from("articles").insert(row).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
