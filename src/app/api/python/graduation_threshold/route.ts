import { NextRequest, NextResponse } from "next/server";

// Port of api/python/graduation_threshold.py

interface Assessment {
  name: string;
  weight: number;
  score?: number;
}

interface Requirement {
  name: string;
  weight: number;
  min_score: number;
  is_feasible: boolean;
}

interface ThresholdResult {
  current_grade: number;
  passing_grade: number;
  gap: number;
  requirements: Requirement[];
  status: string;
  safety_margin: number;
  min_score_raw: number;
  predicted_achievable: number | null;
  is_feasible: boolean;
  message: string;
}

function safetyMargin(historical: number[] | null | undefined): number {
  if (!historical || historical.length < 2) return 5.0;
  const n = historical.length;
  const mean = historical.reduce((s, x) => s + x, 0) / n;
  const variance = historical.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1);
  const std = Math.sqrt(variance);
  return Math.min(10.0, Math.max(3.0, 1.5 * std));
}

function predictAchievable(historical: number[] | null | undefined): number | null {
  if (!historical || historical.length < 3) return null;
  const n = historical.length;
  const xs = Array.from({ length: n }, (_, i) => i + 1);
  const meanX = xs.reduce((s, x) => s + x, 0) / n;
  const meanY = historical.reduce((s, y) => s + y, 0) / n;
  const num = xs.reduce((s, x, i) => s + (x - meanX) * (historical[i] - meanY), 0);
  const den = xs.reduce((s, x) => s + (x - meanX) ** 2, 0);
  const slope = den === 0 ? 0 : num / den;
  const intercept = meanY - slope * meanX;
  const val = slope * (n + 1) + intercept;
  return Math.round(Math.min(100, Math.max(0, val)) * 10) / 10;
}

function trackingStatus(minScore: number): string {
  if (minScore <= 70) return "On Track";
  if (minScore <= 85) return "Worth Reviewing";
  return "At Risk";
}

function calculateThreshold(data: {
  passing_grade?: number;
  assessments?: Assessment[];
  historical_scores?: number[];
}): ThresholdResult | { error: string } {
  const assessments = data.assessments ?? [];
  const passingGrade = data.passing_grade ?? 75;
  const historical = data.historical_scores ?? null;

  if (!assessments.length) return { error: "No assessments provided" };

  const totalWeight = assessments.reduce((s, a) => s + a.weight, 0);
  if (Math.abs(totalWeight - 100) > 0.5)
    return { error: `Assessment weights must sum to 100, got ${totalWeight}` };

  let achievedSum = 0;
  let completedWeight = 0;
  for (const a of assessments) {
    if (a.score !== undefined) {
      achievedSum += a.weight * a.score;
      completedWeight += a.weight;
    }
  }

  const pending = assessments.filter((a) => a.score === undefined);
  const remainingWeight = pending.reduce((s, a) => s + a.weight, 0);
  const currentGrade = completedWeight > 0 ? Math.round((achievedSum / 100) * 100) / 100 : 0;

  if (remainingWeight === 0) {
    const status = currentGrade >= passingGrade ? "Passed" : "Failed";
    return {
      current_grade: currentGrade,
      passing_grade: passingGrade,
      gap: 0,
      requirements: [],
      status,
      safety_margin: 0,
      min_score_raw: 0,
      predicted_achievable: null,
      is_feasible: true,
      message: `All assessments graded. Final grade: ${currentGrade}`,
    };
  }

  const minScoreRaw = (passingGrade - currentGrade) * 100 / remainingWeight;
  const margin = safetyMargin(historical);
  const minScoreWithMargin = minScoreRaw + margin;
  const isFeasible = minScoreWithMargin <= 100;
  const predicted = predictAchievable(historical);

  const requirements: Requirement[] = pending.map((a) => ({
    name: a.name,
    weight: a.weight,
    min_score: Math.round(Math.min(100, Math.max(0, minScoreWithMargin)) * 10) / 10,
    is_feasible: minScoreWithMargin <= 100,
  }));

  let status = trackingStatus(minScoreWithMargin);
  if (!isFeasible) status = "At Risk";

  let message: string;
  if (requirements.length === 1) {
    message = `To pass this course, you need at least ${requirements[0].min_score} on ${requirements[0].name}`;
  } else {
    const parts = requirements.map((r) => `${r.min_score} on ${r.name}`);
    const last = parts.pop()!;
    message = "To pass this course, you need at least " + parts.join(", ") + `, and ${last}`;
  }

  return {
    current_grade: currentGrade,
    passing_grade: passingGrade,
    gap: Math.round(Math.max(0, passingGrade - currentGrade) * 100) / 100,
    requirements,
    status,
    safety_margin: Math.round(margin * 10) / 10,
    min_score_raw: Math.round(minScoreRaw * 10) / 10,
    predicted_achievable: predicted,
    is_feasible: isFeasible,
    message,
  };
}

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    const result = calculateThreshold(data);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

export async function GET() {
  return NextResponse.json({
    message: "Use POST to calculate graduation threshold.",
    endpoint: "/api/python/graduation_threshold",
    method: "POST",
    example_body: {
      passing_grade: 75,
      assessments: [
        { name: "Midterm", weight: 40, score: 70 },
        { name: "Final", weight: 60 },
      ],
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
