import { NextRequest, NextResponse } from "next/server";

// Port of api/python/effort_impact.py

const WEIGHT_IMPACT  = 0.35;
const WEIGHT_URGENCY = 0.25;
const WEIGHT_GAP     = 0.20;
const WEIGHT_EFFORT  = 0.15;
const WEIGHT_STRESS  = 0.05;
const HIGH_THRESHOLD   = 0.62;
const MEDIUM_THRESHOLD = 0.38;

function normalize(value: number, min: number, max: number): number {
  if (max === min) return 0.5;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

function urgencyScore(deadlineDays: number): number {
  if (deadlineDays <= 0) return 1.0;
  return Math.exp(-0.15 * deadlineDays);
}

interface TaskInput {
  task_name?: string;
  grade_weight?: number;
  estimated_hours?: number;
  deadline_days?: number;
  current_grade?: number;
  passing_grade?: number;
  stress_level?: number;
  weekly_capacity_hours?: number;
}

interface TaskResult {
  task_name: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  action: string;
  color: string;
  composite_score: number;
  efficiency_ratio: number;
  breakdown: {
    grade_impact: number;
    urgency: number;
    gap_factor: number;
    effort_penalty: number;
    stress_penalty: number;
  };
  rationale: string;
}

function analyzeTask(data: TaskInput): TaskResult {
  const taskName      = data.task_name ?? "Task";
  const gradeWeight   = data.grade_weight ?? 0;
  const estHours      = data.estimated_hours ?? 1;
  const deadlineDays  = data.deadline_days ?? 7;
  const currentGrade  = data.current_grade ?? 0;
  const passingGrade  = data.passing_grade ?? 75;
  const stressLevel   = data.stress_level ?? 3;
  const weeklyCapacity = data.weekly_capacity_hours ?? 40;

  const impact        = gradeWeight / 100;
  const urgency       = urgencyScore(deadlineDays);
  const gap           = passingGrade - currentGrade;
  const gapFactor     = normalize(gap, -20, 40);
  const effortRaw     = Math.min(1, estHours / Math.max(1, weeklyCapacity));
  const stressPenalty = normalize(stressLevel, 1, 5);

  const rawScore =
    WEIGHT_IMPACT  * impact
    + WEIGHT_URGENCY * urgency
    + WEIGHT_GAP     * gapFactor
    - WEIGHT_EFFORT  * effortRaw
    - WEIGHT_STRESS  * stressPenalty;

  const composite = normalize(rawScore, -0.20, 0.80);

  let priority: "HIGH" | "MEDIUM" | "LOW";
  let action: string;
  let color: string;

  if (composite >= HIGH_THRESHOLD) {
    priority = "HIGH"; action = "Do it fully and on time"; color = "green";
  } else if (composite >= MEDIUM_THRESHOLD) {
    priority = "MEDIUM"; action = "Do it, but time-box your effort"; color = "yellow";
  } else {
    priority = "LOW"; action = "Consider skipping or doing minimally"; color = "red";
  }

  const efficiency = Math.round((gradeWeight / Math.max(1, estHours)) * 100) / 100;

  const rationaleparts: string[] = [];
  if (impact >= 0.3) rationaleparts.push(`carries ${gradeWeight}% of your final grade`);
  if (urgency >= 0.7) rationaleparts.push(`deadline in ${Math.round(deadlineDays)} day(s)`);
  if (gapFactor >= 0.6) rationaleparts.push(`you are ${Math.round(gap * 10) / 10} points below passing`);
  if (effortRaw >= 0.5) rationaleparts.push(`requires ${estHours}h (~${Math.round(effortRaw * 100)}% of weekly capacity)`);
  if (stressLevel >= 4) rationaleparts.push("high stress risk");

  const rationale = rationaleparts.length
    ? `${taskName} ${rationaleparts.join("; ")}.`
    : `${taskName} has moderate impact and manageable effort.`;

  return {
    task_name: taskName,
    priority,
    action,
    color,
    composite_score: Math.round(composite * 1000) / 1000,
    efficiency_ratio: efficiency,
    breakdown: {
      grade_impact:   Math.round(impact        * 1000) / 1000,
      urgency:        Math.round(urgency       * 1000) / 1000,
      gap_factor:     Math.round(gapFactor     * 1000) / 1000,
      effort_penalty: Math.round(effortRaw     * 1000) / 1000,
      stress_penalty: Math.round(stressPenalty * 1000) / 1000,
    },
    rationale,
  };
}

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    if (Array.isArray(data.tasks)) {
      const results = data.tasks.map((t: TaskInput) => analyzeTask(t));
      results.sort((a: TaskResult, b: TaskResult) => b.composite_score - a.composite_score);
      return NextResponse.json({
        tasks: results,
        summary: {
          high:   results.filter((r: TaskResult) => r.priority === "HIGH").length,
          medium: results.filter((r: TaskResult) => r.priority === "MEDIUM").length,
          low:    results.filter((r: TaskResult) => r.priority === "LOW").length,
        },
      });
    }
    return NextResponse.json(analyzeTask(data));
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

export async function GET() {
  return NextResponse.json({
    message: "Use POST to analyze effort-impact priority for one task or a batch.",
    endpoint: "/api/python/effort_impact",
    method: "POST",
    example_body: {
      task_name: "Project Report",
      grade_weight: 25,
      estimated_hours: 8,
      deadline_days: 4,
      current_grade: 68,
      passing_grade: 75,
      stress_level: 3,
      weekly_capacity_hours: 35,
    },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
