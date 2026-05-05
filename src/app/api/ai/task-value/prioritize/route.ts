import { NextRequest, NextResponse } from "next/server";
import { callOllama, extractFirstJson } from "@/lib/ollama";

export const runtime = "nodejs";
export const maxDuration = 60;

type Task = {
  id?: string;
  name: string;
  course: string;
  description?: string;
  deadline?: string;
  weight?: number;
  estimatedHours?: number;
};

type Body = {
  tasks: Task[];
  contextNote?: string;
  todayISO?: string;
};

type Bucket = "Focus First" | "If You Have Energy" | "Safe to Minimize";

type Prioritized = {
  id?: string;
  name: string;
  course: string;
  bucket: Bucket;
  reason: string;
  estimatedHours: number;
  effortLabel: "low effort" | "medium effort" | "high effort";
  recommendedDeadline?: string;
};

type ModelResponse = {
  prioritized: Prioritized[];
  summary: string;
};

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!Array.isArray(body?.tasks) || body.tasks.length === 0) {
    return NextResponse.json(
      { error: "tasks[] is required" },
      { status: 400 },
    );
  }

  const today = body.todayISO ?? new Date().toISOString().slice(0, 10);

  const prompt = `You are a wellbeing-aware academic recommender. Sort tasks into three buckets based on impact-vs-effort and protect the student from burnout.

Buckets:
- "Focus First" — high impact OR due today/overdue OR within 2 days; must be done well.
- "If You Have Energy" — meaningful but flexible; OK to scale back if tired.
- "Safe to Minimize" — low impact toward final grade and not urgent.

HARD RULES (must follow):
- Any task with a deadline of today (${today}) or earlier MUST be placed in "Focus First".
- Any task with a deadline within 2 days of ${today} SHOULD be "Focus First" unless clearly trivial (under 1h and very low weight).
- Even when there is only ONE task, you must still apply these deadline rules — a single task due today is "Focus First".

Today: ${today}
${body.contextNote ? `Student context: ${body.contextNote}\n` : ""}

Tasks:
${body.tasks
  .map(
    (t, i) =>
      `${i + 1}. ${t.name} (${t.course})${t.weight ? `, weight ${t.weight}%` : ""}${t.deadline ? `, due ${t.deadline}` : ""}${t.estimatedHours ? `, est ${t.estimatedHours}h` : ""}${t.description ? ` — ${t.description}` : ""}`,
  )
  .join("\n")}

Estimate effort: < 2h = "low effort", 2-6h = "medium effort", > 6h = "high effort".

Return ONLY a single JSON object, no prose, no code fences. Use this exact shape with double-quoted keys:
{
  "summary": "1-2 sentence overview",
  "prioritized": [
    {
      "id": "input id if provided",
      "name": "task name",
      "course": "course",
      "bucket": "Focus First",
      "reason": "short rationale referencing deadline/weight/wellbeing",
      "estimatedHours": 2,
      "effortLabel": "medium effort"
    }
  ]
}`;

  try {
    const response = await callOllama(
      [
        {
          role: "system",
          content:
            "You are an academic prioritization assistant. Always respond with strict JSON only. Use double-quoted keys and string values. No commentary.",
        },
        { role: "user", content: prompt },
      ],
      { jsonMode: true },
    );

    const result = extractFirstJson<ModelResponse>(response);

    // Post-process: enforce the deadline rule even if the model ignored it.
    const todayDate = new Date(today);
    const isDueSoon = (deadline?: string) => {
      if (!deadline) return false;
      const d = new Date(deadline);
      if (isNaN(d.getTime())) return false;
      const diffMs = d.getTime() - todayDate.getTime();
      return diffMs <= 2 * 24 * 60 * 60 * 1000;
    };
    const inputById = new Map(body.tasks.filter((t) => t.id).map((t) => [t.id!, t] as const));
    const inputByName = new Map(body.tasks.map((t) => [t.name, t] as const));
    result.prioritized = (result.prioritized ?? []).map((p) => {
      const src =
        (p.id && inputById.get(p.id)) || inputByName.get(p.name) || undefined;
      if (src && isDueSoon(src.deadline)) {
        return { ...p, bucket: "Focus First" as Bucket };
      }
      return p;
    });

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Prioritization failed" },
      { status: 502 },
    );
  }
}
