import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/get-user-id";
import { chatWithFallback, AllModelsFailedError, resolveChain, modelTier } from "@/lib/ai/openrouter";
import { spendCredit, refundCredit, getCredits } from "@/lib/ai/credits";

export const runtime = "nodejs";
export const maxDuration = 40;

// Premium label refinement for cover-and-reveal.
//
// Geometry stays with Tesseract (pixel-accurate); an LLM cannot return precise
// boxes. This endpoint takes the image plus Tesseract's detected label texts
// and returns CORRECTED labels in the same order (fix OCR garble, proper
// spelling/casing, fill a label Tesseract misread). The client keeps the exact
// Tesseract boxes and only swaps the text.
export async function POST(req: NextRequest) {
  const auth = await requireUserId();
  if (auth.response) return auth.response;
  const { userId } = auth;

  try {
    const form = await req.formData();
    const file = form.get("file");
    const model = typeof form.get("model") === "string" ? (form.get("model") as string) : undefined;
    let labels: string[] = [];
    try {
      const raw = form.get("labels");
      labels = Array.isArray(JSON.parse(String(raw))) ? JSON.parse(String(raw)) : [];
    } catch {
      labels = [];
    }
    labels = labels.map((l) => String(l)).slice(0, 40);

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "Missing image file" }, { status: 400 });
    }
    if (!labels.length) {
      return NextResponse.json({ error: "No labels to refine" }, { status: 400 });
    }
    if (modelTier(model ?? "") !== "premium") {
      return NextResponse.json({ error: "Refinement needs a Premium model." }, { status: 400 });
    }

    // One credit per refinement pass.
    if ((await getCredits(userId)) <= 0) {
      return NextResponse.json({ error: "Not enough premium credits.", needsCredits: true, cost: 1 }, { status: 402 });
    }
    if ((await spendCredit(userId, 1)) === null) {
      return NextResponse.json({ error: "Not enough premium credits.", needsCredits: true, cost: 1 }, { status: 402 });
    }

    const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    const dataUrl = `data:${file.type || "image/png"};base64,${base64}`;

    const system =
      "You correct OCR label text for a labelled diagram. You receive the image and an ordered list of OCR-detected labels. Return a JSON array of the SAME length and SAME order, where each item is the corrected label as it appears in the image (fix spelling, casing, spacing, and obvious OCR errors; keep the original language). Do not add, remove, or reorder items. Respond with ONLY the JSON array of strings.";
    const userText = `OCR labels in order:\n${JSON.stringify(labels)}`;

    try {
      const result = await chatWithFallback(
        [
          { role: "system", content: system },
          {
            role: "user",
            content: [
              { type: "text", text: userText },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
        resolveChain(model, "premium"),
        { maxTokens: 800, deadlineMs: 28000 },
      );
      const match = result.content.match(/\[[\s\S]*\]/);
      const parsed = match ? (JSON.parse(match[0]) as unknown[]) : [];
      // Only accept a same-length result; otherwise keep the originals.
      const refined =
        Array.isArray(parsed) && parsed.length === labels.length
          ? parsed.map((s, i) => (typeof s === "string" && s.trim() ? s.trim().slice(0, 80) : labels[i]))
          : labels;
      return NextResponse.json({ labels: refined });
    } catch (e) {
      // Refinement is best-effort: refund the credit and return the originals
      // so the user still gets a precise cover-and-reveal deck.
      await refundCredit(userId, 1);
      if (e instanceof AllModelsFailedError || e instanceof SyntaxError) {
        return NextResponse.json({ labels });
      }
      return NextResponse.json({ labels });
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
