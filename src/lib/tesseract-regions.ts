// Client-side Tesseract OCR that returns precise pixel bounding boxes for each
// text label in an image. Used by the flashcard cover-and-reveal flow.
//
// Both the free path and the premium path use THIS for geometry, because an LLM
// cannot return pixel-accurate boxes. The premium path additionally sends the
// detected label text to Claude for correction/translation, keeping these
// exact boxes.

import type { ImageOcrRegion } from "@/store/use-store";

export type TesseractResult = {
  imageDataUrl: string;
  width: number;
  height: number;
  regions: ImageOcrRegion[];
};

export async function extractTesseractRegions(file: File): Promise<TesseractResult> {
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
  const imgDims = { w: imgEl.naturalWidth, h: imgEl.naturalHeight };

  // Upscale small images so Tesseract reads text clearly (no sharpening, which
  // creates edge artifacts on coloured diagrams).
  const MIN_OCR_SIZE = 2000;
  const longest = Math.max(imgDims.w, imgDims.h);
  const scale = longest < MIN_OCR_SIZE ? MIN_OCR_SIZE / longest : 1;
  let ocrInput: string | HTMLCanvasElement = imageDataUrl;
  if (scale > 1) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(imgDims.w * scale);
    canvas.height = Math.round(imgDims.h * scale);
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

  type OcrWord = { x0: number; y0: number; x1: number; y1: number; text: string; confidence: number };
  const words: OcrWord[] = (data.words ?? [])
    .map((w) => ({ bbox: w.bbox, text: cleanText(w.text), confidence: w.confidence }))
    .filter((w) => w.confidence > 40 && w.text.length >= 2 && /[a-zA-Z]/.test(w.text))
    .map((w) => ({
      x0: Math.round(w.bbox.x0 * scaleBack),
      y0: Math.round(w.bbox.y0 * scaleBack),
      x1: Math.round(w.bbox.x1 * scaleBack),
      y1: Math.round(w.bbox.y1 * scaleBack),
      text: w.text,
      confidence: w.confidence,
    }));

  // Group words into labels with Union-Find: same label when they overlap
  // vertically AND the horizontal gap is small.
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
      if (overlapY < minH * 0.4) continue;
      const gap = Math.max(0, Math.max(a.x0 - b.x1, b.x0 - a.x1));
      const maxH = Math.max(a.y1 - a.y0, b.y1 - b.y0);
      if (gap > maxH * 1.2) continue;
      union(i, j);
    }
  }

  const groups = new Map<number, number[]>();
  for (let i = 0; i < words.length; i++) {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(i);
  }
  const labels: OcrWord[] = [];
  for (const members of groups.values()) {
    const grp = members.map((i) => words[i]);
    grp.sort((a, b) => a.x0 - b.x0);
    labels.push({
      x0: Math.min(...grp.map((g) => g.x0)),
      y0: Math.min(...grp.map((g) => g.y0)),
      x1: Math.max(...grp.map((g) => g.x1)),
      y1: Math.max(...grp.map((g) => g.y1)),
      text: grp.map((g) => g.text).join(" "),
      confidence: Math.min(...grp.map((g) => g.confidence)),
    });
  }

  const validLabels = labels.filter((m) => m.text.length >= 4 && /[a-zA-Z]{3,}/.test(m.text));
  const pad = Math.max(8, Math.round(imgDims.h * 0.012));
  const regions: ImageOcrRegion[] = validLabels.map((m) => ({
    bbox: [
      Math.max(0, m.x0 - pad),
      Math.max(0, m.y0 - pad),
      Math.min(imgDims.w, m.x1 - m.x0 + pad * 2),
      Math.min(imgDims.h, m.y1 - m.y0 + pad * 2),
    ] as [number, number, number, number],
    char: m.text,
    confidence: m.confidence / 100,
  }));

  return { imageDataUrl, width: imgDims.w, height: imgDims.h, regions };
}
