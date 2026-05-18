"use client";

import { X, Upload, CirclePlus, Loader2 } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import LanguagePicker, { type Language } from "@/components/ui/language-picker";

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

export default function CreateFlashcardModal({
  isOpen,
  onClose,
  onCreated,
}: CreateFlashcardModalProps) {
  const [formData, setFormData] = useState({
    deckName: "",
    file: null as File | null,
  });
  const [requestedCards, setRequestedCards] = useState(8);
  const [language, setLanguage] = useState<Language>("en");
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
    // is whatever the OCR pipeline detects — no estimation needed.
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
        setRequestedCards((current) => Math.min(current, maxCards));
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
    if (recommendedMaxCards && requestedCards > recommendedMaxCards) {
      toast.error(`This source supports up to ${recommendedMaxCards} flashcards.`);
      return;
    }
    setLoading(true);
    // Both paths run on custom Python: images → OCR cover-and-reveal, PDFs
    // → pattern-based flashcard extractor.
    const isImage =
      formData.file.type.startsWith("image/") ||
      /\.(png|jpg|jpeg|gif|webp|bmp)$/i.test(formData.file.name);

    const t = toast.loading(
      isImage
        ? "Detecting characters in your image…"
        : "Extracting flashcards…",
    );
    try {
      const fd = new FormData();
      fd.append("file", formData.file);
      fd.append("deckName", formData.deckName);
      if (!isImage) fd.append("requestedCards", String(requestedCards));
      fd.append("language", language);
      const endpoint = isImage
        ? "/api/ai/flashcards/ocr-image"
        : "/api/ai/flashcards/generate";
      const resp = await fetch(endpoint, { method: "POST", body: fd });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.error || `Failed (${resp.status})`);
      }
      if (isImage) {
        const json = (await resp.json()) as ImageFlashcardPayload;
        toast.success(
          `Found ${json.regions.length} characters — flip them to reveal!`,
          { id: t },
        );
        onCreated?.(json);
      } else {
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const f = e.target.files[0];
      if (f.size > MAX_SIZE) {
        toast.error("File exceeds the 50 MB limit.");
        return;
      }
      setFormData({ ...formData, file: f });
      analyzeFile(f, formData.deckName);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const f = e.dataTransfer.files[0];
      if (f.size > MAX_SIZE) {
        toast.error("File exceeds the 50 MB limit.");
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
      className="fixed inset-0 flex justify-center items-center z-50"
      style={{ background: "rgba(0, 0, 0, 0.5)" }}
      onClick={loading ? undefined : onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-8 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          disabled={loading}
          className="absolute top-6 right-6 text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
        >
          <X size={24} />
        </button>

        <div className="mb-8">
          <h2 className="text-2xl font-semibold text-black-primary mb-2">
            Create Flashcard
          </h2>
          <p className="text-sm text-gray-primary">
            Upload an image or PDF — we&apos;ll turn it into flashcards
          </p>
        </div>

        {(() => {
          const selectedIsImage =
            !!formData.file &&
            (formData.file.type.startsWith("image/") ||
              /\.(png|jpg|jpeg|gif|webp|bmp)$/i.test(formData.file.name));
          return (
            <form onSubmit={handleSubmit} className="space-y-6">
              {selectedIsImage ? (
                <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-primary">
                  Image upload detected — we&apos;ll run OCR to find every
                  alphanumeric character, then cover them with colored boxes
                  for cover-and-reveal practice. No card count to set.
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
                    onChange={(e) => setRequestedCards(Number(e.target.value || 1))}
                    disabled={loading || analyzing}
                    className="w-full px-4 py-3.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-primary focus:border-transparent text-black-primary"
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

          <div>
            <label className="block text-sm font-medium text-black-primary mb-3">
              Deck Name<span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="e.g., Database Terms"
              value={formData.deckName}
              onChange={(e) =>
                setFormData({ ...formData, deckName: e.target.value })
              }
              className="w-full px-4 py-3.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-primary focus:border-transparent text-black-primary placeholder:text-gray-400"
              required
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-black-primary mb-3">
              PDF / Image<span className="text-red-500">*</span>
            </label>
            <label
              htmlFor="file-upload"
              className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${
                isDragging
                  ? "border-indigo-primary bg-indigo-50"
                  : "border-gray-300 bg-white hover:bg-gray-50"
              } ${loading ? "pointer-events-none opacity-70" : ""}`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
            >
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                <Upload size={24} className="text-gray-400 mb-2" />
                <p className="text-sm text-gray-500">
                  {formData.file ? (
                    <span className="font-medium text-indigo-primary">
                      {formData.file.name}
                    </span>
                  ) : (
                    "Upload a PDF or text file (max. 50 MB)"
                  )}
                </p>
                {recommendedMaxCards ? (
                  <p className="mt-2 text-xs text-indigo-primary">
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
            className="w-full flex items-center justify-center gap-2 px-4 py-4 bg-indigo-primary text-white rounded-xl hover:bg-indigo-600 transition-colors font-medium disabled:opacity-70 disabled:cursor-not-allowed"
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
