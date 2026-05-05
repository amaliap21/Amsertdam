import { NextRequest, NextResponse } from "next/server";
import { callOllama, extractFirstJson } from "@/lib/ollama";

export const runtime = "nodejs";
export const maxDuration = 60;

type Task = {
  id?: string;
  name: string;
  course: string;
  bucket?: "Focus First" | "If You Have Energy" | "Safe to Minimize";
  estimatedHours?: number;
  deadline?: string;
};

type Constraints = {
  startDate?: string;
  endDate?: string;
  workingHoursPerDay?: number;
  blockedTimes?: { date: string; startTime: string; endTime: string; reason?: string }[];
};

type Body = {
  tasks: Task[];
  constraints?: Constraints;
  contextNote?: string;
};

type ScheduledBlock = {
  taskId?: string;
  taskName: string;
  course: string;
  type: "Class" | "Task" | "Self Study";
  date: string;
  startTime: string;
  endTime: string;
  rationale: string;
};

type ModelResponse = {
  blocks: ScheduledBlock[];
  summary: string;
  warnings?: string[];
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

  const today = new Date().toISOString().slice(0, 10);
  const startDate = body.constraints?.startDate ?? today;
  const endDate = body.constraints?.endDate;
  const dailyHours = body.constraints?.workingHoursPerDay ?? 6;

  const prompt = `You are an AI study planner. Build a realistic week-level schedule of focused work blocks for the student. Respect deadlines, group related work, and protect breaks.

Today: ${today}
Window: ${startDate}${endDate ? ` to ${endDate}` : " for the next 7 days"}
Working hours target per day: ${dailyHours}h
${body.contextNote ? `Student context: ${body.contextNote}\n` : ""}

Tasks to schedule:
${body.tasks
  .map(
    (t, i) =>
      `${i + 1}. ${t.name} (${t.course})${t.bucket ? `, bucket: ${t.bucket}` : ""}${t.estimatedHours ? `, est ${t.estimatedHours}h` : ""}${t.deadline ? `, due ${t.deadline}` : ""}`,
  )
  .join("\n")}

${body.constraints?.blockedTimes?.length ? `Blocked times (do NOT schedule into these):\n${body.constraints.blockedTimes.map((b) => `- ${b.date} ${b.startTime}-${b.endTime}${b.reason ? ` (${b.reason})` : ""}`).join("\n")}\n` : ""}

Rules:
- Use 1-3 hour blocks. Schedule "Focus First" earlier in the week.
- Don't schedule past midnight; daytime hours (8 AM - 9 PM) only.
- Block IDs should reference the task index when applicable.
- Include short breaks implicit between blocks (don't schedule back-to-back >3h on one task).

Return ONLY this JSON — no prose:
{
  "summary": "<1-2 sentence overview of the plan>",
  "warnings": ["<optional caveats, e.g., 'Tight deadline on X'>"],
  "blocks": [
    {
      "taskId": "<input id or null>",
      "taskName": "<task name>",
      "course": "<course>",
      "type": "Task" | "Self Study" | "Class",
      "date": "YYYY-MM-DD",
      "startTime": "8 AM" | "10 AM" | "1 PM" | etc,
      "endTime": "10 AM" | etc,
      "rationale": "<one sentence>"
    }
  ]
}`;

  try {
    const response = await callOllama([
      { role: "user", content: prompt },
    ]);

    const result = extractFirstJson<ModelResponse>(response);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Scheduling failed" },
      { status: 502 },
    );
  }
}
