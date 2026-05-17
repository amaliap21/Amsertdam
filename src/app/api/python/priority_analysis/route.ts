import { NextRequest, NextResponse } from "next/server";
import {
  analyzeBatch,
  analyzeEffortImpact,
} from "@/lib/python-ports/priority-analysis";

// Mirror of api/python/priority_analysis.py — same input/output schema so the
// front-end can target this URL in dev and the Vercel Python function in prod.

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();

    if (data && typeof data === "object" && "feedback" in data) {
      return NextResponse.json({ status: "ok", path: "(in-memory)" });
    }

    if (data && Array.isArray((data as { tasks?: unknown[] }).tasks)) {
      const result = analyzeBatch(data);
      return NextResponse.json(result);
    }

    return NextResponse.json(analyzeEffortImpact(data));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid JSON";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function GET() {
  return NextResponse.json({
    message: "Use POST to analyze priority for one task or a batch.",
    endpoint: "/api/python/priority_analysis",
    method: "POST",
    example_body: {
      method: "topsis",
      tasks: [
        {
          task_name: "Mathematics Midterm Exam",
          task_type: "exam",
          sks: 3,
          grade_weight: 25,
          estimated_hours: 10,
          deadline_days: 2,
          current_grade: 58,
          passing_grade: 70,
          weekly_capacity_hours: 20,
        },
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
