import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/get-user-id";
import { chatWithFallback, AllModelsFailedError, resolveChain, modelTier } from "@/lib/ai/openrouter";
import { spendCredit, refundCredit, getCredits } from "@/lib/ai/credits";

export const runtime = "nodejs";
export const maxDuration = 40;

// AI label detection for cover-and-reveal.
//
// The premium vision model uses its own knowledge to NAME every label in the
// diagram (correctly spelled, multi-line/hyphenated terms joined, e.g.
// "hypothalamus", "medulla oblongata") and give an approximate box. The client
// then SNAPS each box to the precise Tesseract word pixels (see
// snapLabelsToWords), so the result is accurate names + precise covers.
export async function POST(req: NextRequest) {
  const auth = await requireUserId();
  if (auth.response) return auth.response;
  const { userId } = auth;

  try {
    const form = await req.formData();
    const file = form.get("file");
    const model = typeof form.get("model") === "string" ? (form.get("model") as string) : undefined;

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "Missing image file" }, { status: 400 });
    }
    if (modelTier(model ?? "") !== "premium") {
      return NextResponse.json({ error: "AI detection needs a Premium model." }, { status: 400 });
    }

    if ((await getCredits(userId)) <= 0) {
      return NextResponse.json({ error: "Not enough premium credits.", needsCredits: true, cost: 1 }, { status: 402 });
    }
    if ((await spendCredit(userId, 1)) === null) {
      return NextResponse.json({ error: "Not enough premium credits.", needsCredits: true, cost: 1 }, { status: 402 });
    }

    const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    const dataUrl = `data:${file.type || "image/png"};base64,${base64}`;

    const system =
      "You are an expert diagram label reader for any subject (anatomy, biology, geography, engineering, etc.). " +
      "Identify EVERY text label/callout in the image and name each one correctly using your own knowledge: " +
      "fix OCR-style errors, join words split across lines or hyphens into the proper term (for example 'hypothal-' + 'amus' is 'hypothalamus', 'medulla' + 'oblongata' is 'medulla oblongata'), and keep the label's language. " +
      "For each label give an approximate bounding box around the LABEL TEXT (not the arrow or the part in the picture) as fractions of the image size. " +
      "Respond with ONLY a JSON array: [{\"label\":\"text\",\"x\":0.0,\"y\":0.0,\"w\":0.0,\"h\":0.0}] where x,y is the top-left corner and w,h the size, all between 0 and 1. No prose.";

    try {
      const result = await chatWithFallback(
        [
          { role: "system", content: system },
          {
            role: "user",
            content: [
              { type: "text", text: "List every label in this diagram with its bounding box." },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
        resolveChain(model, "premium"),
        { maxTokens: 2000, deadlineMs: 32000 },
      );
      const match = result.content.match(/\[[\s\S]*\]/);
      const parsed = match ? (JSON.parse(match[0]) as { label?: string; x?: number; y?: number; w?: number; h?: number }[]) : [];
      const labels = parsed
        .filter((r) => r && typeof r.label === "string" && [r.x, r.y, r.w, r.h].every((n) => Number.isFinite(Number(n))))
        .map((r) => ({
          label: String(r.label).trim().slice(0, 80),
          x: Math.max(0, Math.min(1, Number(r.x))),
          y: Math.max(0, Math.min(1, Number(r.y))),
          w: Math.max(0, Math.min(1, Number(r.w))),
          h: Math.max(0, Math.min(1, Number(r.h))),
        }))
        .filter((r) => r.label.length >= 2 && r.w > 0 && r.h > 0);

      if (!labels.length) {
        await refundCredit(userId, 1);
        return NextResponse.json({ error: "No labels detected. Try a clearer diagram or the free path." }, { status: 422 });
      }
      return NextResponse.json({ labels });
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
