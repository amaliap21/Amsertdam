"use client";

import { X, Upload, CirclePlus, Loader2 } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import LanguagePicker, { type Language } from "@/components/ui/language-picker";
import ModelPicker, { DEFAULT_MODEL_ID } from "@/components/ui/model-picker";
import { modelTier } from "@/lib/ai/openrouter";
import { useAiAnalyze } from "@/lib/use-ai-analyze";
import { extractTesseractRegions } from "@/lib/tesseract-regions";

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
    // Multiple text/PDF sources merged into one deck (images stay single).
    files: [] as File[],
  });
  const [requestedCards, setRequestedCards] = useState<number | "">(8);
  const [language, setLanguage] = useState<Language>("en");
  const [model, setModel] = useState<string>(DEFAULT_MODEL_ID);
  const [recommendedMaxCards, setRecommendedMaxCards] = useState<number | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const { refresh: refreshUsage } = useAiAnalyze();

  const MAX_SIZE = 50 * 1024 * 1024;

  const reset = () => {
    setFormData({ deckName: "", file: null, files: [] });
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
        // Premium image: Tesseract gives PRECISE boxes (an LLM cannot return
        // pixel-accurate coordinates), then Claude refines the label TEXT.
        // Best of both: exact geometry + clean, corrected labels.
        const base = await extractTesseractRegions(formData.file);
        if (!base.regions.length) {
          throw new Error("No text detected. Try a clearer image with visible labels.");
        }
        let regions = base.regions;
        try {
          const fd = new FormData();
          fd.append("file", formData.file);
          fd.append("labels", JSON.stringify(base.regions.map((r) => r.char)));
          fd.append("model", model);
          const resp = await fetch("/api/ai/flashcards/ocr-image", { method: "POST", body: fd });
          const json = await resp.json();
          if (resp.ok && Array.isArray(json.labels) && json.labels.length === base.regions.length) {
            regions = base.regions.map((r, i) => ({ ...r, char: String(json.labels[i] ?? r.char) }));
          }
          refreshUsage(); // a credit may have been spent, sync the navbar
        } catch {
          /* refinement is best-effort, keep the precise Tesseract labels */
        }
        toast.success(`Found ${regions.length} labels, cover and reveal!`, { id: t });
        onCreated?.({
          kind: "image",
          deckName: formData.deckName,
          imageDataUrl: base.imageDataUrl,
          width: base.width,
          height: base.height,
          regions,
          modelLoaded: true,
        });
      } else if (isImage) {
        // Free image: Tesseract cover-and-reveal, fully client-side.
        const base = await extractTesseractRegions(formData.file);
        if (!base.regions.length) {
          throw new Error("No text detected. Try a clearer image with visible text labels.");
        }
        toast.success(`Found ${base.regions.length} labels, cover and reveal!`, { id: t });
        onCreated?.({
          kind: "image",
          deckName: formData.deckName,
          imageDataUrl: base.imageDataUrl,
          width: base.width,
          height: base.height,
          regions: base.regions,
          modelLoaded: true,
        });
      } else {
        // PDF path, server-side extraction. Merge multiple text/PDF sources.
        const fd = new FormData();
        const sources = formData.files.length ? formData.files : [formData.file];
        for (const f of sources) if (f) fd.append("file", f);
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
        refreshUsage(); // credits/quota spent server-side, sync the navbar
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

  const isImageName = (f: File) =>
    f.type.startsWith("image/") || /\.(png|jpg|jpeg|gif|webp|bmp)$/i.test(f.name);

  const acceptFiles = async (list: FileList) => {
    const picked = Array.from(list);
    if (!picked.length) return;
    if (picked.some((f) => f.size > MAX_SIZE)) {
      toast.error("A file exceeds the 50 MB limit.");
      return;
    }
    // Images stay single-source; PDFs/text can be merged.
    if (isImageName(picked[0])) {
      const imgErr = await validateImageFile(picked[0]);
      if (imgErr) {
        toast.error(imgErr);
        return;
      }
      setFormData({ ...formData, file: picked[0], files: [picked[0]] });
      analyzeFile(picked[0], formData.deckName);
      return;
    }
    const textFiles = picked.filter((f) => !isImageName(f));
    const files = textFiles.length ? textFiles : [picked[0]];
    setFormData({ ...formData, file: files[0], files });
    analyzeFile(files[0], formData.deckName);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length) acceptFiles(e.target.files);
  };

  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length) acceptFiles(e.dataTransfer.files);
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
                  ? "Premium model, detects labels with AI vision for cover-and-reveal, more accurate on handwriting and math (1 credit)."
                  : "Free model on an image, runs Tesseract OCR for cover-and-reveal labels. For handwriting or math, pick a Premium model."
                : modelTier(model) === "premium"
                  ? "Premium model, uses 1 credit per card generated."
                  : "Free model, rate-limited but no cost."
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
                  {formData.files.length > 1 ? (
                    <span className="font-medium text-indigo-primary">
                      {formData.files.length} files, merged into one deck
                    </span>
                  ) : formData.file ? (
                    <span className="font-medium text-indigo-primary">
                      {formData.file.name}
                    </span>
                  ) : (
                    "Upload PDFs or text files, select several to merge (max. 50 MB each)"
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
                multiple
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
