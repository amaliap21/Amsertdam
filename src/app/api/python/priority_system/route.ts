import { NextRequest, NextResponse } from "next/server";

// Port of api/python/priority_system.py

const W_DEADLINE   = 0.30;
const W_GRADE      = 0.25;
const W_GAP        = 0.20;
const W_DIFFICULTY = 0.15;
const W_COMPLETION = 0.10;

const DIFFICULTY_MAP: Record<string, number> = { easy: 1, medium: 2, hard: 3, very_hard: 4 };

function deadlineUrgency(days: number): number {
  if (days <= 0) return 1.0;
  return Math.exp(-0.18 * days);
}

function gapScore(current: number, passing: number): number {
  const gap = passing - current;
  if (gap <= 0) return 0;
  return Math.min(1, gap / 30);
}

function difficultyUrgency(difficulty: string, days: number): number {
  const level = DIFFICULTY_MAP[difficulty] ?? 2;
  return Math.min(1, (level / 4) * deadlineUrgency(days / 2));
}

function priorityScore(task: TaskInput, currentGrade: number, passingGrade: number): number {
  const days       = task.deadline_days ?? 7;
  const weight     = task.grade_weight ?? 0;
  const difficulty = task.difficulty ?? "medium";
  const completion = task.completion_pct ?? 0;

  return (
    W_DEADLINE   * deadlineUrgency(days)
    + W_GRADE    * (weight / 100)
    + W_GAP      * gapScore(currentGrade, passingGrade)
    + W_DIFFICULTY * difficultyUrgency(difficulty, days)
    + W_COMPLETION * (1 - completion / 100)
  );
}

function tierLabel(score: number): "HIGH" | "MEDIUM" | "LOW" {
  if (score >= 0.55) return "HIGH";
  if (score >= 0.30) return "MEDIUM";
  return "LOW";
}

function rankAction(tier: string, task: TaskInput): string {
  const days = task.deadline_days ?? 7;
  const name = task.name ?? "this task";
  if (tier === "HIGH") {
    if (days <= 2) return `Start ${name} today — deadline is critical.`;
    return `Tackle ${name} first thing — high impact.`;
  }
  if (tier === "MEDIUM") return `Schedule ${name} after HIGH priority tasks.`;
  return `Do ${name} only if time permits.`;
}

function hoursNeeded(task: TaskInput): number {
  const hours     = task.estimated_hours ?? 1;
  const completion = task.completion_pct ?? 0;
  return hours * (1 - completion / 100);
}

interface TaskInput {
  name?: string;
  grade_weight?: number;
  estimated_hours?: number;
  deadline_days?: number;
  difficulty?: string;
  completion_pct?: number;
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    const tasks: TaskInput[]  = data.tasks ?? [];
    const currentGrade        = data.current_grade ?? 0;
    const passingGrade        = data.passing_grade ?? 75;
    const dailyHours          = data.daily_study_hours ?? 6;
    const startDate           = data.start_date ?? new Date().toISOString().split("T")[0];

    if (!tasks.length) return NextResponse.json({ error: "No tasks provided" }, { status: 400 });

    // Score & sort
    const scored = tasks
      .map((t) => ({
        ...t,
        _score: priorityScore(t, currentGrade, passingGrade),
        _tier:  tierLabel(priorityScore(t, currentGrade, passingGrade)),
      }))
      .sort((a, b) => b._score - a._score);

    // Ranked list
    const rankedTasks = scored.map((t, i) => ({
      rank:            i + 1,
      name:            t.name ?? "Task",
      grade_weight:    t.grade_weight ?? 0,
      deadline_days:   t.deadline_days ?? 0,
      difficulty:      t.difficulty ?? "medium",
      estimated_hours: t.estimated_hours ?? 0,
      completion_pct:  t.completion_pct ?? 0,
      priority_score:  Math.round(t._score * 10000) / 10000,
      tier:            t._tier,
      action:          rankAction(t._tier, t),
    }));

    // Greedy schedule
    const schedule: { day: number; date: string; task_name: string; hours_allocated: number; priority_score: number; tier: string }[] = [];
    let dayIdx = 0;
    let dayHoursUsed = 0;

    for (const task of scored) {
      let remaining = hoursNeeded(task);
      const name = task.name ?? "Task";
      const deadlineDate = addDays(startDate, task.deadline_days ?? 99);

      while (remaining > 0.05) {
        if (dayHoursUsed >= dailyHours) { dayIdx++; dayHoursUsed = 0; }
        const slot = Math.min(remaining, dailyHours - dayHoursUsed);
        if (slot <= 0) { dayIdx++; dayHoursUsed = 0; continue; }

        const currentDate = addDays(startDate, dayIdx);
        if (currentDate > deadlineDate) break;

        schedule.push({
          day: dayIdx + 1,
          date: currentDate,
          task_name: name,
          hours_allocated: Math.round(slot * 10) / 10,
          priority_score: Math.round(task._score * 10000) / 10000,
          tier: task._tier,
        });

        dayHoursUsed += slot;
        remaining -= slot;
      }
    }

    const totalHours  = scored.reduce((s, t) => s + hoursNeeded(t), 0);
    const daysNeeded  = dailyHours > 0 ? Math.ceil(totalHours / dailyHours) : 0;

    return NextResponse.json({
      ranked_tasks: rankedTasks,
      schedule,
      summary: {
        total_tasks:      rankedTasks.length,
        total_hours_needed: Math.round(totalHours * 10) / 10,
        days_needed:      daysNeeded,
        daily_study_hours: dailyHours,
        high_priority:   rankedTasks.filter((t) => t.tier === "HIGH").length,
        medium_priority: rankedTasks.filter((t) => t.tier === "MEDIUM").length,
        low_priority:    rankedTasks.filter((t) => t.tier === "LOW").length,
      },
    });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

export async function GET() {
  return NextResponse.json({
    message: "Use POST to generate ranked priorities and schedule.",
    endpoint: "/api/python/priority_system",
    method: "POST",
    example_body: {
      current_grade: 70,
      passing_grade: 75,
      daily_study_hours: 4,
      tasks: [
        {
          name: "Final Exam Prep",
          grade_weight: 40,
          estimated_hours: 12,
          deadline_days: 5,
          difficulty: "hard",
          completion_pct: 20,
        },
      ],
    },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" },
  });
}
