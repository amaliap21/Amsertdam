import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/get-user-id";
import { chatWithFallback, AllModelsFailedError, resolveChain, modelTier } from "@/lib/ai/openrouter";
import { spendCredit, refundCredit, getCredits } from "@/lib/ai/credits";

export const runtime = "nodejs";
export const maxDuration = 40;

// AI cover-and-reveal: a Premium vision model reads a labelled diagram and
// returns each text label with a normalised bounding box. The client converts
// those to pixel regions and renders the same cover-and-reveal UI as the free
// Tesseract path, but with vision-grade label detection (handwriting, math).
export async function POST(req: NextRequest) {
  const auth = await requireUserId();
  if (auth.response) return auth.response;
  const { userId } = auth;

  try {
    const form = await req.formData();
    const file = form.get("file");
    const width = Math.max(1, Number(form.get("width") ?? 0));
    const height = Math.max(1, Number(form.get("height") ?? 0));
    const model = typeof form.get("model") === "string" ? (form.get("model") as string) : undefined;

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "Missing image file" }, { status: 400 });
    }
    if (modelTier(model ?? "") !== "premium") {
      return NextResponse.json(
        { error: "AI cover-and-reveal needs a Premium model. For free, upload the image with a free model to use Tesseract." },
        { status: 400 },
      );
    }

    // One credit per AI cover-and-reveal generation.
    if ((await getCredits(userId)) <= 0) {
      return NextResponse.json({ error: "Not enough premium credits.", needsCredits: true, cost: 1 }, { status: 402 });
    }
    if ((await spendCredit(userId, 1)) === null) {
      return NextResponse.json({ error: "Not enough premium credits.", needsCredits: true, cost: 1 }, { status: 402 });
    }

    const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    const dataUrl = `data:${file.type || "image/png"};base64,${base64}`;

    const system =
      "You are a precise diagram label detector. Find every distinct text label in the image (anatomy parts, diagram callouts, handwritten or printed). For each, give its bounding box as fractions of the image size. Respond ONLY with a JSON array: [{\"label\":\"text\",\"x\":0.0,\"y\":0.0,\"w\":0.0,\"h\":0.0}] where x,y are the top-left corner and w,h the width/height, all between 0 and 1. No prose.";

    try {
      const result = await chatWithFallback(
        [
          { role: "system", content: system },
          {
            role: "user",
            content: [
              { type: "text", text: "Detect all text labels and their bounding boxes in this image." },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
        resolveChain(model, "premium"),
        { maxTokens: 1500, deadlineMs: 30000 },
      );

      const match = result.content.match(/\[[\s\S]*\]/);
      const parsed = match ? (JSON.parse(match[0]) as { label?: string; x?: number; y?: number; w?: number; h?: number }[]) : [];
      const regions = parsed
        .filter((r) => r && typeof r.label === "string" && [r.x, r.y, r.w, r.h].every((n) => Number.isFinite(Number(n))))
        .map((r) => ({
          bbox: [
            Math.round(Number(r.x) * width),
            Math.round(Number(r.y) * height),
            Math.round(Number(r.w) * width),
            Math.round(Number(r.h) * height),
          ] as [number, number, number, number],
          char: String(r.label).slice(0, 80),
          confidence: 1,
        }))
        .filter((r) => r.bbox[2] > 2 && r.bbox[3] > 2);

      if (!regions.length) {
        await refundCredit(userId, 1);
        return NextResponse.json({ error: "No labels detected. Try a clearer diagram or the free Tesseract path." }, { status: 422 });
      }
      return NextResponse.json({ regions, width, height });
    } catch (e) {
      await refundCredit(userId, 1);
      if (e instanceof AllModelsFailedError || e instanceof SyntaxError) {
        return NextResponse.json({ error: "The vision model was busy. Your credit was refunded, please try again." }, { status: 503 });
      }
      return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" },
  });
}
