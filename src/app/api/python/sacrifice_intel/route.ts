import { NextRequest, NextResponse } from "next/server";

// Port of api/python/sacrifice_intel.py

const STRESS_MULTIPLIER: Record<number, number> = { 1: 0.8, 2: 0.9, 3: 1.0, 4: 1.2, 5: 1.5 };

function effectiveHours(hours: number, stress: number): number {
  return hours * (STRESS_MULTIPLIER[stress] ?? 1.0);
}

function gradeValue(weight: number, gradeGap: number): number {
  const base = weight / 100;
  const bonus = (Math.max(0, gradeGap) / 100) * 0.5;
  return Math.min(1, base + bonus);
}

function deadlineUrgency(days: number): number {
  if (days <= 1) return 2.0;
  if (days <= 3) return 1.5;
  if (days <= 7) return 1.2;
  return 1.0;
}

interface SacrificeTaskInput {
  name?: string;
  grade_weight?: number;
  estimated_hours?: number;
  deadline_days?: number;
  stress_level?: number;
  completion_pct?: number;
}

function focusAdvice(days: number, weight: number): string {
  if (days <= 3) return `Deadline in ${Math.round(days)} day(s), prioritise now.`;
  if (weight >= 30) return `Worth ${weight}% of grade, invest time here.`;
  return "Good return on effort, do it fully.";
}

function minimalAdvice(weight: number): string {
  return `Moderate impact (${weight}%). Do it, but cap your time to avoid over-investing.`;
}

function sacrificeAdvice(weight: number, hours: number): string {
  if (weight <= 5) return "Very small grade contribution, safe to skip entirely.";
  if (hours >= 10) return `Too costly (${hours}h) for a ${weight}% task. Consider submitting a basic attempt only.`;
  return "Low efficiency. Submit minimal work to capture partial credit and redirect energy to higher-value tasks.";
}

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    const tasks: SacrificeTaskInput[] = data.tasks ?? [];
    const availableHours = data.available_hours_per_week ?? 40;
    const currentGrade   = data.current_grade ?? 0;
    const passingGrade   = data.passing_grade ?? 75;

    if (!tasks.length) return NextResponse.json({ error: "No tasks provided" }, { status: 400 });

    const gradeGap = passingGrade - currentGrade;

    const scored = tasks.map((t) => {
      const name        = t.name ?? "Task";
      const weight      = t.grade_weight ?? 0;
      const hours       = t.estimated_hours ?? 1;
      const days        = t.deadline_days ?? 7;
      const stress      = t.stress_level ?? 3;
      const done        = t.completion_pct ?? 0;
      const effHours    = effectiveHours(hours * (1 - done / 100), stress);
      const value       = gradeValue(weight, gradeGap);
      const urgency     = deadlineUrgency(days);
      const adjValue    = value * urgency;
      const efficiency  = adjValue / Math.max(0.1, effHours);
      return { name, weight, hours, days, stress, done, effHours, efficiency, adjValue };
    });

    scored.sort((a, b) => b.efficiency - a.efficiency);

    const results: { name: string; grade_weight: number; estimated_hours: number; deadline_days: number; tier: string; efficiency: number; advice: string }[] = [];
    let hoursUsed = 0;

    for (const item of scored) {
      let tier: string;
      let advice: string;

      if (item.done >= 80) {
        tier = "FOCUS"; advice = "Almost done, finish it to lock in the grade.";
      } else if (hoursUsed + item.effHours <= availableHours) {
        if (item.efficiency >= 0.08) {
          tier = "FOCUS"; advice = focusAdvice(item.days, item.weight);
        } else {
          tier = "MINIMAL"; advice = minimalAdvice(item.weight);
        }
        hoursUsed += item.effHours;
      } else {
        const remaining = availableHours - hoursUsed;
        if (item.efficiency >= 0.12 && remaining >= item.effHours * 0.5) {
          tier = "MINIMAL"; advice = `Time is tight, spend only ${Math.round(remaining)}h on this.`;
          hoursUsed = availableHours;
        } else {
          tier = "SACRIFICE"; advice = sacrificeAdvice(item.weight, item.hours);
        }
      }

      results.push({
        name: item.name,
        grade_weight: item.weight,
        estimated_hours: item.hours,
        deadline_days: item.days,
        tier,
        efficiency: Math.round(item.efficiency * 10000) / 10000,
        advice,
      });
    }

    const focus    = results.filter((r) => r.tier === "FOCUS").map((r) => r.name);
    const minimal  = results.filter((r) => r.tier === "MINIMAL").map((r) => r.name);
    const sacrifice = results.filter((r) => r.tier === "SACRIFICE").map((r) => r.name);
    const parts: string[] = [];
    if (focus.length)    parts.push(`Focus on: ${focus.join(", ")}`);
    if (minimal.length)  parts.push(`Do minimally: ${minimal.join(", ")}`);
    if (sacrifice.length) parts.push(`Sacrifice: ${sacrifice.join(", ")}`);
    const summary = parts.join(" | ") + `. You'll use ${Math.round(hoursUsed * 10) / 10}/${availableHours}h of your weekly budget.`;

    return NextResponse.json({ tasks: results, hours_allocated: Math.round(hoursUsed * 10) / 10, available_hours: availableHours, summary });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

export async function GET() {
  return NextResponse.json({
    message: "Use POST to classify tasks into FOCUS, MINIMAL, or SACRIFICE.",
    endpoint: "/api/python/sacrifice_intel",
    method: "POST",
    example_body: {
      current_grade: 70,
      passing_grade: 75,
      available_hours_per_week: 20,
      tasks: [
        {
          name: "Weekly Quiz",
          grade_weight: 10,
          estimated_hours: 3,
          deadline_days: 2,
          stress_level: 2,
          completion_pct: 30,
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
