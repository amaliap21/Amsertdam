"use client";

import { X, Upload, CirclePlus, Loader2 } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import LanguagePicker, { type Language } from "@/components/ui/language-picker";
import ModelPicker, { DEFAULT_MODEL_ID } from "@/components/ui/model-picker";
import { modelTier } from "@/lib/ai/openrouter";

export type GeneratedFlashcard = { front: string; back: string };

export type ImageOcrRegion = {
  bbox: [number, number, number, number];
  char: string;
  confidence: number;
};

export type ImageFlashcardPayload = {
  kind: "image";
  deckName: string;
  imageDataUrl: string;
  width: number;
  height: number;
  regions: ImageOcrRegion[];
  modelLoaded?: boolean;
};

type CreateFlashcardModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: (
    data:
      | { deckName: string; cards: GeneratedFlashcard[] }
      | ImageFlashcardPayload,
  ) => void;
};

const ACCEPTED_IMAGE_TYPES = new Set([
  "image/png", "image/jpeg", "image/webp", "image/bmp", "image/gif",
]);

async function validateImageFile(file: File): Promise<string | null> {
  const isImage =
    file.type.startsWith("image/") ||
    /\.(png|jpg|jpeg|gif|webp|bmp)$/i.test(file.name);
  if (!isImage) return null; // PDF, skip image checks

  if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
    return `Unsupported format (${file.type || "unknown"}). Use PNG, JPG, WebP, BMP, or GIF.`;
  }

  const MIN_DIM = 200;
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new window.Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Cannot read image"));
      el.src = url;
    });
    if (img.naturalWidth < MIN_DIM || img.naturalHeight < MIN_DIM) {
      return `Image too small (${img.naturalWidth}\u00d7${img.naturalHeight}). Minimum ${MIN_DIM}\u00d7${MIN_DIM} px for OCR to detect labels.`;
    }
    return null;
  } catch {
    return "Cannot read image. File may be corrupted.";
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function CreateFlashcardModal({
  isOpen,
  onClose,
  onCreated,
}: CreateFlashcardModalProps) {
  const [formData, setFormData] = useState({
    deckName: "",
    file: null as File | null,
  });
  const [requestedCards, setRequestedCards] = useState<number | "">(8);
  const [language, setLanguage] = useState<Language>("en");
  const [model, setModel] = useState<string>(DEFAULT_MODEL_ID);
  const [recommendedMaxCards, setRecommendedMaxCards] = useState<number | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);

  const MAX_SIZE = 50 * 1024 * 1024;

  const reset = () => {
    setFormData({ deckName: "", file: null });
    setRequestedCards(8);
    setRecommendedMaxCards(null);
    setAnalyzing(false);
    setLoading(false);
  };

  const analyzeFile = async (file: File, deckName: string) => {
    // The analyzer is a PDF-only flow that estimates the max number of
    // generatable cards. For images we do OCR instead, and the "card count"
    // is whatever the OCR pipeline detects, no estimation needed.
    const isImage =
      file.type.startsWith("image/") ||
      /\.(png|jpg|jpeg|gif|webp|bmp)$/i.test(file.name);
    if (isImage) {
      setRecommendedMaxCards(null);
      setAnalyzing(false);
      return;
    }
    setAnalyzing(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("deckName", deckName || "Untitled Deck");
      fd.append("mode", "analyze");

      const resp = await fetch("/api/ai/flashcards/generate", {
        method: "POST",
        body: fd,
      });
      const json = await resp.json().catch(() => ({}));
      if (resp.ok && Number.isFinite(Number(json.maxCards))) {
        const maxCards = Math.max(1, Math.round(Number(json.maxCards)));
        setRecommendedMaxCards(maxCards);
        setRequestedCards((current) => Math.min(current === "" ? maxCards : current, maxCards));
        return;
      }
      setRecommendedMaxCards(null);
    } catch {
      setRecommendedMaxCards(null);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.file) {
      toast.error("Please upload a PDF or image");
      return;
    }
    if (formData.file.size > MAX_SIZE) {
      toast.error("File exceeds the 50 MB limit.");
      return;
    }
    if (!formData.deckName.trim()) {
      toast.error("Please enter a deck name");
      return;
    }
    const finalRequestedCards =
      requestedCards === "" || requestedCards < 1 ? 1 : requestedCards;
    if (recommendedMaxCards && finalRequestedCards > recommendedMaxCards) {
      toast.error(`This source supports up to ${recommendedMaxCards} flashcards.`);
      return;
    }
    setLoading(true);
    const isImage =
      formData.file.type.startsWith("image/") ||
      /\.(png|jpg|jpeg|gif|webp|bmp)$/i.test(formData.file.name);
    const useVision = isImage && modelTier(model) === "premium";

    const t = toast.loading(
      useVision
        ? "Reading the image with the Premium model…"
        : isImage
          ? "Running OCR on your image…"
          : "Extracting flashcards…",
    );
    try {
      if (useVision) {
        // Premium model + image → server-side vision LLM that handles
        // handwriting, stacked fractions, and other 2D math the Tesseract
        // cover-and-reveal path can't read.
        const fd = new FormData();
        fd.append("file", formData.file);
        fd.append("deckName", formData.deckName);
        fd.append("requestedCards", String(finalRequestedCards));
        fd.append("language", language);
        fd.append("model", model);
        const resp = await fetch("/api/ai/flashcards/generate", {
          method: "POST",
          body: fd,
        });
        if (!resp.ok) {
          const body = await resp.json().catch(() => ({}));
          throw new Error(body.error || `Failed (${resp.status})`);
        }
        const json = (await resp.json()) as {
          deckName: string;
          cards: GeneratedFlashcard[];
        };
        toast.success(`Generated ${json.cards.length} flashcards`, { id: t });
        onCreated?.({ deckName: json.deckName, cards: json.cards });
      } else if (isImage) {
        // Client-side OCR using Tesseract.js, no server/AI API call.
        const file = formData.file;
        const imageDataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        // Load image to get dimensions.
        const imgEl = await new Promise<HTMLImageElement>(
          (resolve, reject) => {
            const img = new window.Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = imageDataUrl;
          },
        );
        const imgDims = { w: imgEl.naturalWidth, h: imgEl.naturalHeight };

        // Upscale small images so Tesseract can read text clearly.
        // No sharpening, it creates edge artifacts on coloured diagrams
        // that Tesseract misreads as characters.
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

        // Run Tesseract with both eng+ind for maximum coverage.
        const { createWorker } = await import("tesseract.js");
        const worker = await createWorker("eng+ind");
        const { data } = await worker.recognize(ocrInput);
        await worker.terminate();

        const scaleBack = 1 / scale;

        // Strip non-alphanumeric noise from each word.
        const cleanText = (raw: string) =>
          raw.replace(/[^a-zA-Z0-9\s'-]/g, "").trim();

        type OcrWord = {
          x0: number; y0: number; x1: number; y1: number;
          text: string; confidence: number;
        };
        const words: OcrWord[] = (data.words ?? [])
          .map((w) => ({
            bbox: w.bbox,
            text: cleanText(w.text),
            confidence: w.confidence,
          }))
          .filter(
            (w) =>
              w.confidence > 40 &&
              w.text.length >= 2 &&
              /[a-zA-Z]/.test(w.text),
          )
          .map((w) => ({
            x0: Math.round(w.bbox.x0 * scaleBack),
            y0: Math.round(w.bbox.y0 * scaleBack),
            x1: Math.round(w.bbox.x1 * scaleBack),
            y1: Math.round(w.bbox.y1 * scaleBack),
            text: w.text,
            confidence: w.confidence,
          }));

        // Group words into labels using Union-Find. Two words belong to
        // the same label only when they overlap vertically AND the
        // horizontal gap is small (< 1× the taller word's height).
        // This merges "Right primary bronchus" but keeps "Pharynx" and
        // "Nasal cavity" (on opposite sides) separate.
        const parent = words.map((_, i) => i);
        function find(x: number): number {
          while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
          return x;
        }
        function union(a: number, b: number) {
          parent[find(a)] = find(b);
        }
        for (let i = 0; i < words.length; i++) {
          for (let j = i + 1; j < words.length; j++) {
            const a = words[i], b = words[j];
            // Vertical overlap check: their y-ranges must intersect.
            const overlapY = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
            const minH = Math.min(a.y1 - a.y0, b.y1 - b.y0);
            if (overlapY < minH * 0.4) continue;
            // Horizontal gap must be small.
            const gap = Math.max(0, Math.max(a.x0 - b.x1, b.x0 - a.x1));
            const maxH = Math.max(a.y1 - a.y0, b.y1 - b.y0);
            if (gap > maxH * 1.2) continue;
            union(i, j);
          }
        }

        // Build merged labels from groups.
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

        // Drop noise: merged label must be ≥ 4 chars with 3+
        // consecutive letters (filters "yy", "ET", "NA", "aol", etc.).
        const validLabels = labels.filter(
          (m) => m.text.length >= 4 && /[a-zA-Z]{3,}/.test(m.text),
        );

        // Generous padding so boxes fully cover labels.
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

        if (!regions.length) {
          throw new Error(
            "No text detected. Try a clearer image with visible text labels.",
          );
        }

        toast.success(
          `Found ${regions.length} labels, cover and reveal!`,
          { id: t },
        );
        onCreated?.({
          kind: "image",
          deckName: formData.deckName,
          imageDataUrl,
          width: imgDims.w,
          height: imgDims.h,
          regions,
          modelLoaded: true,
        });
      } else {
        // PDF path, server-side extraction.
        const fd = new FormData();
        fd.append("file", formData.file);
        fd.append("deckName", formData.deckName);
        fd.append("requestedCards", String(finalRequestedCards));
        fd.append("language", language);
        fd.append("model", model);
        const resp = await fetch("/api/ai/flashcards/generate", {
          method: "POST",
          body: fd,
        });
        if (!resp.ok) {
          const body = await resp.json().catch(() => ({}));
          throw new Error(body.error || `Failed (${resp.status})`);
        }
        const json = (await resp.json()) as {
          deckName: string;
          cards: GeneratedFlashcard[];
        };
        toast.success(`Generated ${json.cards.length} flashcards`, { id: t });
        onCreated?.({ deckName: json.deckName, cards: json.cards });
      }
      reset();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Generation failed", {
        id: t,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const f = e.target.files[0];
      if (f.size > MAX_SIZE) {
        toast.error("File exceeds the 50 MB limit.");
        return;
      }
      const imgErr = await validateImageFile(f);
      if (imgErr) {
        toast.error(imgErr);
        return;
      }
      setFormData({ ...formData, file: f });
      analyzeFile(f, formData.deckName);
    }
  };

  const handleDrop = async (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const f = e.dataTransfer.files[0];
      if (f.size > MAX_SIZE) {
        toast.error("File exceeds the 50 MB limit.");
        return;
      }
      const imgErr = await validateImageFile(f);
      if (imgErr) {
        toast.error(imgErr);
        return;
      }
      setFormData({ ...formData, file: f });
      analyzeFile(f, formData.deckName);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 flex items-end justify-center p-2 sm:items-center sm:p-4 z-50"
      style={{ background: "rgba(0, 0, 0, 0.5)" }}
      onClick={loading ? undefined : onClose}
    >
      <div
        className="relative w-[calc(100vw-0.5rem)] max-w-[20.5rem] max-h-[90dvh] overflow-y-auto rounded-2xl bg-white px-2.5 pb-2.5 pt-9 shadow-xl sm:w-full sm:max-w-lg sm:px-6 sm:pb-6 sm:pt-6"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          disabled={loading}
          className="absolute right-4 top-4 text-gray-400 transition-colors hover:text-gray-600 disabled:opacity-50 sm:right-6 sm:top-6"
        >
          <X size={24} />
        </button>

        <div className="mb-6 sm:mb-8">
          <h2 className="mb-2 text-lg font-semibold text-black-primary sm:text-2xl">
            Create Flashcard
          </h2>
          <p className="text-sm text-gray-primary">
            Upload an image or PDF, we&apos;ll turn it into flashcards
          </p>
        </div>

        {(() => {
          const selectedIsImage =
            !!formData.file &&
            (formData.file.type.startsWith("image/") ||
              /\.(png|jpg|jpeg|gif|webp|bmp)$/i.test(formData.file.name));
          return (
            <form onSubmit={handleSubmit} className="space-y-5 sm:space-y-6">
              {selectedIsImage ? (
                <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-3.5 py-3 text-sm text-indigo-primary sm:px-4">
                  Image upload detected, we&apos;ll run OCR to find text
                  labels, then cover them with colored boxes for
                  cover-and-reveal practice. No card count to set.
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-black-primary mb-3">
                    Cards to generate
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={recommendedMaxCards ?? undefined}
                    value={requestedCards}
                    onChange={(e) =>
                      setRequestedCards(
                        e.target.value === "" ? "" : Number(e.target.value),
                      )
                    }
                    onBlur={() => {
                      if (requestedCards === "" || requestedCards < 1) {
                        setRequestedCards(1);
                      }
                    }}
                    disabled={loading || analyzing}
                    className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-primary focus:border-transparent text-black-primary sm:px-4 sm:py-3.5"
                  />
                  <p className="mt-2 text-sm text-gray-primary">
                    {recommendedMaxCards
                      ? `This file supports up to ${recommendedMaxCards} cards. You can choose any value up to that limit.`
                      : analyzing
                        ? "Estimating the maximum card count…"
                        : "Upload a PDF to estimate the maximum card count."}
                  </p>
                </div>
              )}

          {!selectedIsImage && (
            <LanguagePicker
              value={language}
              onChange={setLanguage}
              disabled={loading || analyzing}
              label="Card Language"
            />
          )}

          <ModelPicker
            id="flashcard-model"
            value={model}
            onChange={setModel}
            disabled={loading || analyzing}
            label="AI Model"
            hint={
              selectedIsImage
                ? modelTier(model) === "premium"
                  ? "Premium model — reads handwriting & math from the image into Q&A cards (1 credit)."
                  : "Free model on an image — runs Tesseract OCR for cover-and-reveal labels. For handwriting or math, pick a Premium model."
                : modelTier(model) === "premium"
                  ? "Premium model — uses 1 credit per generation."
                  : "Free model — rate-limited but no cost."
            }
          />

          <div>
            <label className="mb-2 block text-sm font-medium text-black-primary sm:mb-3">
              Deck Name<span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="e.g., Database Terms"
              value={formData.deckName}
              onChange={(e) =>
                setFormData({ ...formData, deckName: e.target.value })
              }
              className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-primary focus:border-transparent text-black-primary placeholder:text-gray-400 sm:px-4 sm:py-3.5"
              required
              disabled={loading}
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-black-primary sm:mb-3">
              PDF / Image<span className="text-red-500">*</span>
            </label>
            <label
              htmlFor="file-upload"
              className={`flex flex-col items-center justify-center w-full h-28 border-2 border-dashed rounded-xl cursor-pointer transition-colors sm:h-32 ${
                isDragging
                  ? "border-indigo-primary bg-indigo-50"
                  : "border-gray-300 bg-white hover:bg-gray-50"
              } ${loading ? "pointer-events-none opacity-70" : ""}`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
            >
              <div className="flex flex-col items-center justify-center pt-4 pb-5 sm:pt-5 sm:pb-6">
                <Upload size={22} className="mb-2 text-gray-400 sm:size-6" />
                <p className="text-center text-sm text-gray-500">
                  {formData.file ? (
                    <span className="font-medium text-indigo-primary">
                      {formData.file.name}
                    </span>
                  ) : (
                    "Upload a PDF or text file (max. 50 MB)"
                  )}
                </p>
                {recommendedMaxCards ? (
                  <p className="mt-2 text-[11px] text-indigo-primary sm:text-xs">
                    Estimated max: {recommendedMaxCards} cards
                  </p>
                ) : null}
              </div>
              <input
                id="file-upload"
                type="file"
                className="hidden"
                accept="image/*,.pdf"
                onChange={handleFileChange}
                disabled={loading}
              />
            </label>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-primary px-4 py-3.5 font-medium text-white transition-colors hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-70 sm:py-4"
          >
            {loading ? (
              <>
                <Loader2 size={20} className="animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <CirclePlus size={20} />
                Generate Flashcards
              </>
            )}
          </button>
        </form>
          );
        })()}
      </div>
    </div>
  );
}
