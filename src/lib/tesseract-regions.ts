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
  // Same-line words that sit close together form one label.
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
  // Hyphenated line wraps: a word ending in "-" joins the nearest word directly
  // below it whose x-range overlaps (e.g. "hypothal-" + "amus"). Only hyphenated
  // continuations merge across lines, so distinct stacked labels stay separate.
  for (let i = 0; i < words.length; i++) {
    if (!words[i].text.endsWith("-")) continue;
    const a = words[i];
    let best = -1;
    let bestDy = Infinity;
    for (let j = 0; j < words.length; j++) {
      if (j === i) continue;
      const b = words[j];
      const dy = b.y0 - a.y1;
      if (dy < -2 || dy > (a.y1 - a.y0) * 1.6) continue;
      const xOverlap = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
      if (xOverlap <= 0) continue;
      if (dy < bestDy) { bestDy = dy; best = j; }
    }
    if (best >= 0) union(i, best);
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
    // Reading order: top-to-bottom, then left-to-right.
    const grp = members.map((i) => words[i]).sort((a, b) => (a.y0 - b.y0) || (a.x0 - b.x0));
    // Join words; a trailing hyphen glues straight onto the next word.
    let text = "";
    for (const g of grp) {
      if (text.endsWith("-")) text = text.slice(0, -1) + g.text;
      else text = text ? `${text} ${g.text}` : g.text;
    }
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
