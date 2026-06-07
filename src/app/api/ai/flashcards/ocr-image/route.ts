import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/get-user-id";
import { chatWithFallback, AllModelsFailedError, resolveChain, modelTier } from "@/lib/ai/openrouter";
import { spendCredit, refundCredit, getCredits } from "@/lib/ai/credits";
import { ownsStoragePath, downloadStoredFile, deleteStoredFile, UPLOAD_BUCKETS } from "@/lib/storage-uploads";

export const runtime = "nodejs";
export const maxDuration = 40;

// Premium LABEL TEXT refinement for cover-and-reveal.
//
// Geometry stays with Tesseract (pixel-accurate) — an LLM cannot return precise
// boxes, and asking it to caused giant misplaced covers. This endpoint takes the
// image plus Tesseract's detected label texts and returns CORRECTED labels in
// the same order: fix OCR garble, spelling and casing, and drop trailing
// hyphens from line-wrapped words. The client keeps the exact Tesseract boxes
// and only swaps the text.
export async function POST(req: NextRequest) {
  const auth = await requireUserId();
  if (auth.response) return auth.response;
  const { userId } = auth;

  try {
    const form = await req.formData();
    let file = form.get("file") as File | null;
    const bucket = form.get("bucket") as string | null;
    const path = form.get("path") as string | null;
    const fileName = form.get("fileName") as string | null;
    const fileType = form.get("fileType") as string | null;

    if (bucket && path && fileName && fileType) {
      if (!ownsStoragePath(bucket, path, userId, [UPLOAD_BUCKETS.transient, UPLOAD_BUCKETS.materials])) {
        return NextResponse.json({ error: "Invalid storage path." }, { status: 403 });
      }
      file = await downloadStoredFile(bucket, path, fileName, fileType);
      void deleteStoredFile(bucket, path);
    }

    const model = typeof form.get("model") === "string" ? (form.get("model") as string) : undefined;
    let labels: string[] = [];
    try {
      const parsed = JSON.parse(String(form.get("labels")));
      labels = Array.isArray(parsed) ? parsed.map((l) => String(l)).slice(0, 50) : [];
    } catch {
      labels = [];
    }

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "Missing image file" }, { status: 400 });
    }
    if (!labels.length) {
      return NextResponse.json({ error: "No labels to refine" }, { status: 400 });
    }
    if (modelTier(model ?? "") !== "premium") {
      return NextResponse.json({ error: "Refinement needs a Premium model." }, { status: 400 });
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
      "You correct OCR label text for a labelled diagram, using the image and your own subject knowledge. " +
      "You receive an ordered list of OCR-detected labels. Return a JSON array of the SAME length and SAME order. " +
      "For each item, return the correct label as it should read: fix spelling, casing and spacing, drop a trailing hyphen from a line-wrapped word, and use the proper term (e.g. 'hypothal-' becomes 'hypothalamus', 'medulla' stays 'medulla'). " +
      "Keep the original language. Do not add, remove, or reorder items. Respond with ONLY the JSON array of strings.";
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
      const refined =
        Array.isArray(parsed) && parsed.length === labels.length
          ? parsed.map((s, i) => (typeof s === "string" && s.trim() ? s.trim().slice(0, 80) : labels[i]))
          : labels;
      return NextResponse.json({ labels: refined });
    } catch (e) {
      // Best-effort: refund and return originals so the deck stays precise.
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
