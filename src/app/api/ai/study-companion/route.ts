import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/get-user-id";

/**
 * Agentic Study Companion hub router.
 *
 * Turns Study Companion from a single-purpose quiz tutor into a hub that can
 * answer questions about ANY part of RealTrack — schedule, task priorities,
 * dropout risk, passing targets, flashcards, quizzes. This deterministic
 * intent router classifies the user's question and tells the client which
 * feature to pull data from and which endpoint/route to deep-link to.
 *
 * It is intentionally LLM-free: fast, free, and fully explainable (it returns
 * the keywords that matched), so it can run on every keystroke/submit without
 * burning chat credits. The chat LLM is only invoked once the relevant feature
 * context has been gathered.
 */

type Intent =
  | "schedule"
  | "priority"
  | "dropout_risk"
  | "passing_target"
  | "flashcards"
  | "quiz"
  | "tutoring"
  | "general";

interface IntentSpec {
  intent: Intent;
  feature: string;
  route: string;
  /** API the client should call to gather context before answering. */
  dataSource: string | null;
  keywords: string[];
  follow_up: string;
}

// Order matters: earlier specs win ties. More specific intents first.
const INTENTS: IntentSpec[] = [
  {
    intent: "dropout_risk",
    feature: "Dropout Risk",
    route: "/dashboard",
    dataSource: "/api/python/dropout_risk",
    keywords: ["risk", "fall behind", "falling behind", "drop out", "dropout", "fail", "failing", "on track", "graduate", "graduation", "behind"],
    follow_up: "Want me to pull your risk breakdown and show the one course to focus on?",
  },
  {
    intent: "passing_target",
    feature: "Passing Target",
    route: "/passing-target",
    dataSource: "/api/python/graduation_threshold",
    keywords: ["pass", "passing", "target", "score i need", "grade i need", "minimum", "threshold", "what do i need", "gpa", "final exam score"],
    follow_up: "I can calculate the exact score you still need on each assessment, want that?",
  },
  {
    intent: "priority",
    feature: "Task Value",
    route: "/task-value",
    dataSource: "/api/python/priority_analysis",
    keywords: ["priorit", "what should i do", "what to do first", "important", "focus first", "skip", "minimize", "task value", "which task", "what matters", "worth it"],
    follow_up: "I can re-rank your tasks by what's worth your energy right now, shall I?",
  },
  {
    intent: "schedule",
    feature: "Priority Planner",
    route: "/priority-planner",
    dataSource: "/api/python/scheduling",
    keywords: ["schedule", "plan my", "planner", "calendar", "when should i", "this week", "my week", "timetable", "free time", "study time", "agenda"],
    follow_up: "Want me to lay out a realistic plan for your week?",
  },
  {
    intent: "flashcards",
    feature: "Flashcards",
    route: "/flashcards",
    dataSource: null,
    keywords: ["flashcard", "memorize", "memorise", "recall", "review cards", "spaced repetition", "drill"],
    follow_up: "I can pull up a deck and quiz you with hints, ready?",
  },
  {
    intent: "quiz",
    feature: "Quiz Lab",
    route: "/quiz-lab",
    dataSource: null,
    keywords: ["quiz", "practice questions", "test me", "mock exam", "practice test", "generate questions"],
    follow_up: "I can generate practice questions from your material, want a set?",
  },
  {
    intent: "tutoring",
    feature: "Study Companion",
    route: "/study-companion",
    dataSource: null,
    keywords: ["explain", "how does", "why does", "what is", "help me understand", "i don't get", "confused", "solve", "derive", "prove"],
    follow_up: "Let's work through it together, one step at a time.",
  },
];

const GENERAL: IntentSpec = {
  intent: "general",
  feature: "Study Companion",
  route: "/study-companion",
  dataSource: null,
  keywords: [],
  follow_up: "I can help with your schedule, priorities, risk, passing targets, flashcards, or any concept, what's on your mind?",
};

function classify(query: string): {
  primary: IntentSpec & { matched: string[]; confidence: number };
  alternates: { intent: Intent; feature: string; route: string; score: number }[];
} {
  const q = ` ${query.toLowerCase()} `;
  const scored = INTENTS.map((spec) => {
    const matched = spec.keywords.filter((k) => q.includes(k));
    return { spec, matched, score: matched.length };
  });
  scored.sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best || best.score === 0) {
    return { primary: { ...GENERAL, matched: [], confidence: 0.3 }, alternates: [] };
  }
  // Confidence scales with how many cues matched, capped at 0.95.
  const confidence = Math.min(0.95, 0.55 + 0.15 * best.score);
  const alternates = scored
    .filter((s) => s.score > 0 && s.spec.intent !== best.spec.intent)
    .slice(0, 2)
    .map((s) => ({ intent: s.spec.intent, feature: s.spec.feature, route: s.spec.route, score: s.score }));

  return {
    primary: { ...best.spec, matched: best.matched, confidence: Math.round(confidence * 100) / 100 },
    alternates,
  };
}

export async function POST(req: NextRequest) {
  const auth = await requireUserId();
  if (auth.response) return auth.response;
  try {
    const { query } = await req.json();
    if (typeof query !== "string" || !query.trim()) {
      return NextResponse.json({ error: "Missing query" }, { status: 400 });
    }
    const { primary, alternates } = classify(query);
    return NextResponse.json({
      query,
      intent: primary.intent,
      feature: primary.feature,
      route: primary.route,
      data_source: primary.dataSource,
      confidence: primary.confidence,
      matched_keywords: primary.matched, // explainable: why this route
      follow_up: primary.follow_up,
      alternates,
    });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

export async function GET() {
  return NextResponse.json({
    message: "POST { query } to route a Study Companion question to the right RealTrack feature.",
    endpoint: "/api/ai/study-companion",
    intents: INTENTS.map((i) => ({ intent: i.intent, feature: i.feature, route: i.route })),
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" },
  });
}
