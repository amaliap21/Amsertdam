import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getUserId } from "@/lib/get-user-id";
import { chatWithFallback, AllModelsFailedError } from "@/lib/ai/openrouter";

export const runtime = "nodejs";
export const maxDuration = 30;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabaseAdmin as any;

// Decode the "title|||{json}" course encoding is NOT needed here; we only look
// at tasks, flashcard decks, and quizzes (Passing Target, Study Companion, and
// Community are intentionally excluded from Kaizen suggestions).

type Ctx = {
  tasks: { title: string; priority: string | null; course: string | null }[];
  decks: { title: string }[];
  quizzes: { title: string; course: string | null }[];
};

async function gather(userId: string): Promise<Ctx> {
  const [t, d, q] = await Promise.all([
    db.from("tasks").select("title, priority, course").eq("user_id", userId).limit(25),
    db.from("flashcard_decks").select("title").eq("user_id", userId).limit(25),
    db.from("quizzes").select("title, course").eq("user_id", userId).limit(25),
  ]);
  return {
    tasks: (t.data ?? []).map((r: { title: string; priority: string | null; course: string | null }) => ({ title: r.title, priority: r.priority, course: r.course })),
    decks: (d.data ?? []).map((r: { title: string }) => ({ title: r.title })),
    quizzes: (q.data ?? []).map((r: { title: string; course: string | null }) => ({ title: r.title, course: r.course })),
  };
}

function sanitize(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  return list
    .map((s) => String(s).replace(/[—;]/g, ",").trim())
    .filter((s) => s.length >= 3 && s.length <= 90)
    .slice(0, 6);
}

// Data-driven fallback when the LLM is unavailable. Still derived from the
// user's real data (not a fixed script).
function fallback(ctx: Ctx): string[] {
  const out: string[] = [];
  const focusFirst = ctx.tasks.filter((t) => t.priority === "Focus First");
  for (const t of (focusFirst.length ? focusFirst : ctx.tasks).slice(0, 3)) {
    out.push(`Make progress on ${t.title}`);
  }
  if (ctx.decks[0]) out.push(`Review the ${ctx.decks[0].title} flashcards`);
  if (ctx.quizzes[0]) out.push(`Take the ${ctx.quizzes[0].title} quiz`);
  if (!out.length) out.push("Review your notes for 15 minutes", "Plan your single most important task");
  return out.slice(0, 6);
}

export async function GET() {
  try {
    const userId = await getUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const ctx = await gather(userId);

    // No data at all: nothing to base AI suggestions on.
    if (!ctx.tasks.length && !ctx.decks.length && !ctx.quizzes.length) {
      return NextResponse.json({ goals: fallback(ctx), source: "fallback" });
    }

    const system =
      "You are a supportive study coach. Given a student's current tasks, flashcard decks, and quizzes, suggest 3 to 5 tiny Kaizen micro-goals for today. Each goal is one small concrete step in at most 8 words. Prioritise finishing undone tasks first, then suggest reviewing a specific flashcard deck by name or taking a specific quiz by name. Keep them achievable and encouraging. Never use the em dash character or semicolons. Respond with ONLY a JSON array of strings, no prose.";
    const userMsg = JSON.stringify(ctx);

    try {
      const result = await chatWithFallback(
        [
          { role: "system", content: system },
          { role: "user", content: userMsg },
        ],
        "free",
        { maxTokens: 300, deadlineMs: 18000 },
      );
      // Pull the first JSON array out of the reply (models sometimes wrap it).
      const match = result.content.match(/\[[\s\S]*\]/);
      const goals = sanitize(match ? JSON.parse(match[0]) : []);
      if (goals.length) return NextResponse.json({ goals, source: "ai", model: result.model });
      return NextResponse.json({ goals: fallback(ctx), source: "fallback" });
    } catch (e) {
      if (e instanceof AllModelsFailedError || e instanceof SyntaxError) {
        return NextResponse.json({ goals: fallback(ctx), source: "fallback" });
      }
      return NextResponse.json({ goals: fallback(ctx), source: "fallback" });
    }
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
