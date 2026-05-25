import { NextResponse } from "next/server";

export const runtime = "nodejs";

// OCR is now handled client-side using Tesseract.js (no server dependency).
// This route exists only as a placeholder to avoid 404s if anything still
// references it.

export async function POST() {
  return NextResponse.json(
    {
      error:
        "OCR is handled client-side. The flashcard form runs Tesseract.js in the browser, no server call needed.",
    },
    { status: 410 },
  );
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
