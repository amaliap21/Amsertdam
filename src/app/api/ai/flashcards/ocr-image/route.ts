import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_FILE_SIZE = 50 * 1024 * 1024;

// Proxies the uploaded image to the Python OCR endpoint (api/python/ocr_image.py
// on Vercel) and shapes the response for the flashcard form. Keeps all the
// computer-vision work in Python — no AI API is called.

type OcrRegion = {
  bbox: [number, number, number, number];
  char: string;
  confidence: number;
};

type OcrResponse = {
  width: number;
  height: number;
  regions: OcrRegion[];
  model_loaded: boolean;
  error?: string;
};

function getOcrUrl(req: NextRequest): string {
  // Use the same origin so this works in both dev and Vercel deployments.
  const url = new URL(req.url);
  return `${url.origin}/api/python/ocr_image`;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");
    const deckName = (formData.get("deckName") as string) || "Untitled Deck";

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "Missing 'file' in form data" },
        { status: 400 },
      );
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File exceeds the 50 MB limit." },
        { status: 413 },
      );
    }
    const isImage =
      file.type.startsWith("image/") ||
      /\.(png|jpg|jpeg|gif|webp|bmp)$/i.test(file.name);
    if (!isImage) {
      return NextResponse.json(
        { error: "ocr-image expects an image upload." },
        { status: 415 },
      );
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const imageBase64 = buf.toString("base64");
    const mime = file.type || "image/png";
    const imageDataUrl = `data:${mime};base64,${imageBase64}`;

    // Call the Python OCR endpoint.
    const ocrResp = await fetch(getOcrUrl(req), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ image_base64: imageBase64 }),
    });

    if (!ocrResp.ok) {
      const body = await ocrResp.text().catch(() => "");
      return NextResponse.json(
        {
          error:
            "OCR endpoint unavailable. The Python OCR function needs to be deployed (api/python/ocr_image.py).",
          detail: body.slice(0, 300),
        },
        { status: 502 },
      );
    }

    const ocr = (await ocrResp.json()) as OcrResponse;
    if (ocr.error) {
      return NextResponse.json({ error: ocr.error }, { status: 502 });
    }
    if (!ocr.regions || ocr.regions.length === 0) {
      return NextResponse.json(
        {
          error:
            "No alphanumeric characters detected in this image. Try a clearer / higher-contrast image.",
        },
        { status: 422 },
      );
    }

    return NextResponse.json({
      deckName,
      kind: "image",
      imageDataUrl,
      width: ocr.width,
      height: ocr.height,
      regions: ocr.regions,
      modelLoaded: ocr.model_loaded,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
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
