// Client-side Tesseract OCR helpers for the flashcard cover-and-reveal flow.
//
// Tesseract gives PRECISE pixel boxes but reads word-by-word and mis-groups
// multi-line / hyphenated labels. So:
//   - Free path  -> extractTesseractRegions(): Tesseract words grouped into labels.
//   - Premium    -> extractTesseractWords() gives raw word boxes, which the
//     caller SNAPS to AI-detected labels (AI names + locates, Tesseract gives
//     the exact pixels). See the flashcard form.

import type { ImageOcrRegion } from "@/store/use-store";

export type OcrWord = { x0: number; y0: number; x1: number; y1: number; text: string; confidence: number };

export type TesseractWords = {
  imageDataUrl: string;
  width: number;
  height: number;
  words: OcrWord[];
};

export type TesseractResult = {
  imageDataUrl: string;
  width: number;
  height: number;
  regions: ImageOcrRegion[];
};

/** Run Tesseract and return raw word boxes in original-image pixel coordinates. */
export async function extractTesseractWords(file: File): Promise<TesseractWords> {
  const imageDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const imgEl = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = imageDataUrl;
  });
  const W = imgEl.naturalWidth;
  const H = imgEl.naturalHeight;

  // Upscale small images so Tesseract reads clearly (no sharpening).
  const MIN_OCR_SIZE = 2000;
  const longest = Math.max(W, H);
  const scale = longest < MIN_OCR_SIZE ? MIN_OCR_SIZE / longest : 1;
  let ocrInput: string | HTMLCanvasElement = imageDataUrl;
  if (scale > 1) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(W * scale);
    canvas.height = Math.round(H * scale);
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(imgEl, 0, 0, canvas.width, canvas.height);
    ocrInput = canvas;
  }

  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng+ind");
  const { data } = await worker.recognize(ocrInput);
  await worker.terminate();

  const scaleBack = 1 / scale;
  const cleanText = (raw: string) => raw.replace(/[^a-zA-Z0-9\s'-]/g, "").trim();

  const words: OcrWord[] = (data.words ?? [])
    .map((w) => ({ bbox: w.bbox, text: cleanText(w.text), confidence: w.confidence }))
    .filter((w) => w.confidence > 35 && w.text.length >= 2 && /[a-zA-Z]/.test(w.text))
    .map((w) => ({
      x0: Math.round(w.bbox.x0 * scaleBack),
      y0: Math.round(w.bbox.y0 * scaleBack),
      x1: Math.round(w.bbox.x1 * scaleBack),
      y1: Math.round(w.bbox.y1 * scaleBack),
      text: w.text,
      confidence: w.confidence,
    }));

  return { imageDataUrl, width: W, height: H, words };
}

/** Free path: group Tesseract words into labelled regions (best-effort). */
export async function extractTesseractRegions(file: File): Promise<TesseractResult> {
  const { imageDataUrl, width, height, words } = await extractTesseractWords(file);

  // Union-Find: same label when words share a text line and sit close.
  const parent = words.map((_, i) => i);
  function find(x: number): number {
    while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
    return x;
  }
  function union(a: number, b: number) { parent[find(a)] = find(b); }
  for (let i = 0; i < words.length; i++) {
    for (let j = i + 1; j < words.length; j++) {
      const a = words[i], b = words[j];
      const overlapY = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
      const minH = Math.min(a.y1 - a.y0, b.y1 - b.y0);
      if (overlapY < minH * 0.35) continue;
      const gap = Math.max(0, Math.max(a.x0 - b.x1, b.x0 - a.x1));
      const maxH = Math.max(a.y1 - a.y0, b.y1 - b.y0);
      if (gap > maxH * 2.2) continue;
      union(i, j);
    }
  }

  const groups = new Map<number, number[]>();
  for (let i = 0; i < words.length; i++) {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(i);
  }
  const pad = Math.max(8, Math.round(height * 0.012));
  const regions: ImageOcrRegion[] = [];
  for (const members of groups.values()) {
    const grp = members.map((i) => words[i]).sort((a, b) => a.x0 - b.x0);
    const text = grp.map((g) => g.text).join(" ");
    if (text.length < 4 || !/[a-zA-Z]{3,}/.test(text)) continue;
    const x0 = Math.min(...grp.map((g) => g.x0));
    const y0 = Math.min(...grp.map((g) => g.y0));
    const x1 = Math.max(...grp.map((g) => g.x1));
    const y1 = Math.max(...grp.map((g) => g.y1));
    regions.push({
      bbox: [
        Math.max(0, x0 - pad),
        Math.max(0, y0 - pad),
        Math.min(width, x1 - x0 + pad * 2),
        Math.min(height, y1 - y0 + pad * 2),
      ] as [number, number, number, number],
      char: text,
      confidence: Math.min(...grp.map((g) => g.confidence)) / 100,
    });
  }
  return { imageDataUrl, width, height, regions };
}

/**
 * Snap AI-detected labels (name + approximate normalised box) to the precise
 * Tesseract word pixels they overlap. AI supplies the smart, correctly-spelled
 * label and WHICH region it is; Tesseract supplies the exact box. Where no word
 * matches (AI saw text Tesseract missed), the AI box is used as-is.
 */
export function snapLabelsToWords(
  aiLabels: { label: string; x: number; y: number; w: number; h: number }[],
  words: OcrWord[],
  width: number,
  height: number,
): ImageOcrRegion[] {
  const pad = Math.max(8, Math.round(height * 0.012));
  const regions: ImageOcrRegion[] = [];

  for (const a of aiLabels) {
    // AI box in pixels.
    const ax0 = a.x * width;
    const ay0 = a.y * height;
    const ax1 = (a.x + a.w) * width;
    const ay1 = (a.y + a.h) * height;
    // Expand the search box a little so slightly-off AI boxes still catch words.
    const ex = (ax1 - ax0) * 0.25 + pad;
    const ey = (ay1 - ay0) * 0.5 + pad;
    const sx0 = ax0 - ex, sy0 = ay0 - ey, sx1 = ax1 + ex, sy1 = ay1 + ey;

    // Words whose centre falls inside the expanded AI box.
    const hits = words.filter((w) => {
      const cx = (w.x0 + w.x1) / 2;
      const cy = (w.y0 + w.y1) / 2;
      return cx >= sx0 && cx <= sx1 && cy >= sy0 && cy <= sy1;
    });

    let x0: number, y0: number, x1: number, y1: number;
    if (hits.length) {
      x0 = Math.min(...hits.map((w) => w.x0));
      y0 = Math.min(...hits.map((w) => w.y0));
      x1 = Math.max(...hits.map((w) => w.x1));
      y1 = Math.max(...hits.map((w) => w.y1));
    } else {
      // No Tesseract words here: trust the AI box (approximate).
      x0 = ax0; y0 = ay0; x1 = ax1; y1 = ay1;
    }
    const bw = Math.max(2, x1 - x0);
    const bh = Math.max(2, y1 - y0);
    regions.push({
      bbox: [
        Math.max(0, Math.round(x0 - pad)),
        Math.max(0, Math.round(y0 - pad)),
        Math.min(width, Math.round(bw + pad * 2)),
        Math.min(height, Math.round(bh + pad * 2)),
      ] as [number, number, number, number],
      char: a.label.slice(0, 80),
      confidence: 1,
    });
  }
  return regions;
}
