import { NextRequest, NextResponse } from "next/server";
import { callClaude, extractFirstJson } from "@/lib/anthropic";

export const runtime = "nodejs";
export const maxDuration = 60;

type Assessment = {
  name: string;
  weight: number;
  current?: number | null;
  done?: boolean;
};

type Body = {
  course: string;
  passingThreshold?: number;
  targetGrade?: number;
  assessments: Assessment[];
};

type Recommendation = {
  name: string;
  weight: number;
  status: "done" | "pending";
  currentScore: number | null;
  targetScore: number;
  rationale: string;
};

type ModelResponse = {
  course: string;
  passingThreshold: number;
  projectedFinal: number;
  recommendations: Recommendation[];
  summary: string;
  risk: "low" | "medium" | "high";
};

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (
    !body?.course ||
    !Array.isArray(body.assessments) ||
    body.assessments.length === 0
  ) {
    return NextResponse.json(
      { error: "course and assessments[] are required" },
      { status: 400 },
    );
  }

  const passingThreshold = body.passingThreshold ?? 60;
  const targetGrade = body.targetGrade ?? Math.max(passingThreshold, 70);

  const prompt = `You are an academic coach. Compute, for each remaining assessment in a course, the **minimum score the student needs** so that their final weighted course grade is at least the target. Be realistic — if the target is unreachable, say so and suggest a recovery plan.

Course: "${body.course}"
Passing threshold: ${passingThreshold}/100
Student's target grade: ${targetGrade}/100

Assessments (weights are percentage of final grade, summing to ~100):
${body.assessments
  .map(
    (a, i) =>
      `${i + 1}. ${a.name} — weight: ${a.weight}% — ${
        a.done && typeof a.current === "number"
          ? `done, scored ${a.current}/100`
          : a.current != null
            ? `in progress, current ${a.current}/100`
            : "not yet completed"
      }`,
  )
  .join("\n")}

Return ONLY a JSON object with this shape — no prose:
{
  "course": "${body.course}",
  "passingThreshold": ${passingThreshold},
  "projectedFinal": <number 0-100, your best estimate of their final grade if they hit recommended targets>,
  "summary": "<2-3 sentence plain-language summary>",
  "risk": "low" | "medium" | "high",
  "recommendations": [
    {
      "name": "<assessment name>",
      "weight": <number>,
      "status": "done" | "pending",
      "currentScore": <number or null>,
      "targetScore": <number 0-100, the minimum they should aim for>,
      "rationale": "<short explanation tied to weights and remaining workload>"
    }
  ]
}`;

  try {
    const response = await callClaude(
      [{ role: "user", content: prompt }],
      { jsonMode: true },
    );

    const result = extractFirstJson<ModelResponse>(response);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Recommendation failed" },
      { status: 502 },
    );
  }
}
