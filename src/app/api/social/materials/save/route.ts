import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getUserId } from "@/lib/get-user-id";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabaseAdmin as any;

// POST /api/social/materials/save { share_id }
// Clones a shared quiz or flashcard deck into the recipient's own library so
// they can actually use it. (Materials that are just links are opened directly.)
export async function POST(req: Request) {
  try {
    const userId = await getUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { share_id } = await req.json();
    if (!share_id || typeof share_id !== "string") {
      return NextResponse.json({ error: "Missing share_id" }, { status: 400 });
    }

    // Only the recipient of the share can save it.
    const { data: share } = await db
      .from("resource_shares")
      .select("id, recipient_id, kind, ref_id, title")
      .eq("id", share_id)
      .maybeSingle();
    if (!share || share.recipient_id !== userId) {
      return NextResponse.json({ error: "Share not found" }, { status: 404 });
    }
    if (share.kind === "material") {
      return NextResponse.json({ error: "Open the link directly — nothing to save." }, { status: 400 });
    }
    if (!share.ref_id) {
      return NextResponse.json({ error: "Original resource is unavailable." }, { status: 404 });
    }

    if (share.kind === "quiz") {
      const { data: src } = await db.from("quizzes").select("title, course, source, questions").eq("id", share.ref_id).maybeSingle();
      if (!src) return NextResponse.json({ error: "Quiz no longer exists" }, { status: 404 });
      const { data, error } = await db.from("quizzes").insert({
        user_id: userId,
        title: `${src.title} (shared)`.slice(0, 200),
        course: src.course ?? null,
        source: src.source ?? null,
        questions: src.questions ?? [],
      }).select("id").single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, kind: "quiz", id: data.id });
    }

    // flashcard
    const { data: src } = await db.from("flashcard_decks").select("title, description, card_count, cards").eq("id", share.ref_id).maybeSingle();
    if (!src) return NextResponse.json({ error: "Deck no longer exists" }, { status: 404 });
    const { data, error } = await db.from("flashcard_decks").insert({
      user_id: userId,
      title: `${src.title} (shared)`.slice(0, 200),
      description: src.description ?? null,
      card_count: src.card_count ?? 0,
      cards: src.cards ?? [],
    }).select("id").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, kind: "flashcard", id: data.id });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
