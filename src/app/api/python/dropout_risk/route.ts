import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/get-user-id";

// Port of api/python/dropout_risk.py
// Predictive dropout / under-performance early-warning engine.

const W_TRAJECTORY = 0.28;
const W_BUFFER = 0.27;
const W_WORKLOAD = 0.18;
const W_COMPLETION = 0.17;
const W_PROCRASTINATION = 0.1;

const RED_THRESHOLD = 66;
const YELLOW_THRESHOLD = 33;

const clamp = (x: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));

function slope(series: number[]): number {
  const n = series.length;
  if (n < 2) return 0;
  const xs = series.map((_, i) => i);
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = series.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (series[i] - meanY);
    den += (xs[i] - meanX) ** 2;
  }
  return num / (den || 1);
}

function band(score: number): { label: string; color: "red" | "yellow" | "green" } {
  if (score >= RED_THRESHOLD) return { label: "High risk", color: "red" };
  if (score >= YELLOW_THRESHOLD) return { label: "Needs attention", color: "yellow" };
  return { label: "On track", color: "green" };
}

function trajectoryDetail(s: number): string {
  if (s <= -2) return `declining ~${Math.abs(Math.round(s * 10) / 10)} pts per assessment`;
  if (s >= 2) return `improving ~${Math.round(s * 10) / 10} pts per assessment`;
  return "roughly flat";
}
function bufferDetail(b: number): string {
  return b >= 0
    ? `${Math.round(b * 10) / 10} pts above the passing threshold`
    : `${Math.round(Math.abs(b) * 10) / 10} pts BELOW the passing threshold`;
}
function workloadDetail(ratio: number): string {
  if (ratio >= 900) return "no study capacity set";
  const pct = Math.round(ratio * 100);
  return ratio <= 1 ? `needs ${pct}% of your weekly capacity (sustainable)` : `needs ${pct}% of your weekly capacity (over budget)`;
}

function intervention(driver: string, color: string): string {
  if (color === "green") return "You're on track here — protect this and rest when you can.";
  const table: Record<string, string> = {
    trajectory: "Your grade is trending down. Book one focused review session this week before the next assessment.",
    buffer: "You're close to the threshold. Use Passing Target to find the exact score you still need.",
    workload: "This course is over your time budget. Use Task Value to find what's safe to minimize elsewhere.",
    completion: "Missed assessments are the main risk. Catch up on the most recent one first — even partial credit helps.",
    procrastination: "You tend to start late. Schedule the next deadline in Priority Planner and start 3 days earlier.",
  };
  return table[driver] ?? "Review this course with your Study Companion.";
}

interface CourseInput {
  course?: string;
  name?: string;
  grade_history?: number[];
  passing_grade?: number;
  current_grade?: number;
  required_hours?: number;
  weekly_capacity_hours?: number;
  completion_rate?: number;
  avg_lead_days?: number;
}

function computeRisk(course: CourseInput) {
  const grades = (course.grade_history ?? []).filter((g) => g != null).map(Number);
  const passing = Number(course.passing_grade ?? 70);
  const current = Number(course.current_grade ?? (grades.length ? grades[grades.length - 1] : passing));
  const requiredHours = Number(course.required_hours ?? 0);
  const capacity = Number(course.weekly_capacity_hours ?? 30);
  const completionRate = clamp(Number(course.completion_rate ?? 1));
  const avgLeadDays = Number(course.avg_lead_days ?? 7);

  const s = slope(grades.length ? grades : [current]);
  const trajRisk = clamp(0.5 - s / 20);
  const buffer = current - passing;
  const bufRisk = clamp(0.5 - buffer / 30);
  const loadRatio = capacity <= 0 ? 999 : requiredHours / capacity;
  const workRisk = capacity <= 0 ? 1 : clamp((loadRatio - 0.6) / 1);
  const compRisk = clamp(1 - completionRate);
  const procRisk = clamp(1 - avgLeadDays / 14);

  const score01 =
    W_TRAJECTORY * trajRisk +
    W_BUFFER * bufRisk +
    W_WORKLOAD * workRisk +
    W_COMPLETION * compRisk +
    W_PROCRASTINATION * procRisk;
  const score = Math.round(score01 * 1000) / 10;
  const { label, color } = band(score);

  const factors = [
    { key: "trajectory", label: "Grade trend", contribution: Math.round(W_TRAJECTORY * trajRisk * 1000) / 10, detail: trajectoryDetail(s) },
    { key: "buffer", label: "Margin above passing", contribution: Math.round(W_BUFFER * bufRisk * 1000) / 10, detail: bufferDetail(buffer) },
    { key: "workload", label: "Workload vs. capacity", contribution: Math.round(W_WORKLOAD * workRisk * 1000) / 10, detail: workloadDetail(loadRatio) },
    { key: "completion", label: "Assessments completed", contribution: Math.round(W_COMPLETION * compRisk * 1000) / 10, detail: `${Math.round(completionRate * 100)}% of assessments completed on time` },
    { key: "procrastination", label: "Starts work early", contribution: Math.round(W_PROCRASTINATION * procRisk * 1000) / 10, detail: `Starts ~${Math.round(avgLeadDays)} day(s) before deadlines on average` },
  ].sort((a, b) => b.contribution - a.contribution);

  const top = factors[0];

  let weeksToThreshold: number | null = null;
  if (grades.length) {
    if (current < passing) weeksToThreshold = 0;
    else if (s < -0.01) weeksToThreshold = Math.round(((current - passing) / -s) * 10) / 10;
  }

  return {
    course: course.course ?? course.name ?? "Course",
    risk_score: score,
    risk_label: label,
    color,
    weeks_to_threshold: weeksToThreshold,
    top_driver: top.key,
    intervention: intervention(top.key, color),
    explanation: `${label} (${score}/100). Biggest driver: ${top.label.toLowerCase()} — ${top.detail}.`,
    factors,
  };
}

type RiskResult = ReturnType<typeof computeRisk>;

function summarize(results: RiskResult[]) {
  if (!results.length)
    return { overall_risk: 0, band: "On track", color: "green", red: 0, yellow: 0, green: 0, headline: "No courses to assess yet." };
  const scores = results.map((r) => r.risk_score);
  const overall = Math.round((0.6 * Math.max(...scores) + 0.4 * (scores.reduce((a, b) => a + b, 0) / scores.length)) * 10) / 10;
  const { label, color } = band(overall);
  const worst = results[0];
  const counts = { red: 0, yellow: 0, green: 0 };
  for (const r of results) counts[r.color] += 1;
  let headline: string;
  if (color === "red") headline = `${worst.course} needs attention now — ${worst.intervention}`;
  else if (color === "yellow") headline = `Mostly steady, but keep an eye on ${worst.course}.`;
  else headline = "You're on track across all courses. Keep the pace and rest.";
  return { overall_risk: overall, band: label, color, headline, ...counts };
}

export async function POST(req: NextRequest) {
  const auth = await requireUserId();
  if (auth.response) return auth.response;
  try {
    const data = await req.json();
    const courses: CourseInput[] | undefined = data.courses;
    if (!courses) {
      const result = computeRisk(data);
      return NextResponse.json({ courses: [result], summary: summarize([result]) });
    }
    const results = courses.map(computeRisk).sort((a, b) => b.risk_score - a.risk_score);
    return NextResponse.json({ courses: results, summary: summarize(results) });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

export async function GET() {
  return NextResponse.json({
    message: "POST a list of courses to get dropout/under-performance risk scores.",
    endpoint: "/api/python/dropout_risk",
    example_body: {
      courses: [
        { course: "Operating Systems", grade_history: [78, 72, 65, 61], passing_grade: 70, required_hours: 12, weekly_capacity_hours: 20, completion_rate: 0.6, avg_lead_days: 1 },
      ],
    },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" },
  });
}
