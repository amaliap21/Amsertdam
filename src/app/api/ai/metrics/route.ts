import { NextResponse } from "next/server";
import { getAllMetrics } from "@/lib/ai/metrics";

export const runtime = "nodejs";

export async function GET() {
  try {
    const metrics = getAllMetrics();
    return NextResponse.json({ ok: true, metrics });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
