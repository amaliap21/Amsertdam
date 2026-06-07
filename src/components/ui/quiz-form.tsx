"use client";

import Link from "next/link";
import { X, Upload, CirclePlus, Loader2, AlertCircle } from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import LanguagePicker, { type Language } from "@/components/ui/language-picker";
import ModelPicker, { DEFAULT_MODEL_ID } from "@/components/ui/model-picker";
import { modelTier } from "@/lib/ai/openrouter";
import { useAiAnalyze } from "@/lib/use-ai-analyze";
import { extractTesseractRegions } from "@/lib/tesseract-regions";
import type { ImageOcrRegion } from "@/store/use-store";
import { uploadToStorage } from "@/lib/upload-to-storage";

export type GeneratedQuestion = {
  id: string;
  prompt: string;
  options: { letter: "A" | "B" | "C" | "D"; text: string }[];
  correctAnswer: "A" | "B" | "C" | "D";
};

type CreateQuizModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: (data: {
    title: string;
    course: string;
    source: string;
    questions: GeneratedQuestion[];
    imageDataUrl?: string | null;
    imageRegions?: ImageOcrRegion[] | null;
    basic?: boolean;
  }) => void;
};

export default function CreateQuizModal({
  isOpen,
  onClose,
  onCreated,
}: CreateQuizModalProps) {
  const [formData, setFormData] = useState({
    title: "",
    course: "",
    file: null as File | null,
  });
  // The user sets only questions-PER-TOPIC. The generator detects how many
  // distinct topics the material has and makes this many questions for each, so
  // 1 topic gives N, 2 topics give 2N, etc. (no manual topic count).
  // Total questions. When several files are merged, the total is split evenly
  // across them (each file is one topic).
  const [numQuestions, setNumQuestions] = useState<string>("10");
  const [language, setLanguage] = useState<Language>("en");
  const [model, setModel] = useState<string>(DEFAULT_MODEL_ID);
  const [recommendedMaxQuestions, setRecommendedMaxQuestions] = useState<number | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [courseOptions, setCourseOptions] = useState<string[]>([]);
  const [coursesLoaded, setCoursesLoaded] = useState(false);
  // Usage counters: refresh after a generation, and disable Generate when the
  // chosen model has no budget left (free quota for free models, credits for
  // premium). This is the only genuinely "AI unavailable" state for the user.
  const { refresh: refreshUsage, remaining, credits } = useAiAnalyze();
  const outOfBudget =
    modelTier(model) === "premium" ? credits === 0 : remaining === 0;

  useEffect(() => {
    if (!isOpen) return;
    (async () => {
      try {
        const r = await fetch("/api/courses");
        if (r.ok) {
          const list = await r.json();
          if (Array.isArray(list)) {
            setCourseOptions(
              list
                .map((c: { title?: string }) => c.title)
                .filter((t): t is string => typeof t === "string"),
            );
          }
        }
      } catch {}
      setCoursesLoaded(true);
    })();
  }, [isOpen]);

  const MAX_SIZE = 50 * 1024 * 1024;

  const isImageFile = (f: File) =>
    f.type.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp)$/i.test(f.name);

  // Upload straight to Supabase Storage (via a server-signed URL) so the file
  // never passes through the Vercel function and its ~4.5 MB body cap. The
  // signed-URL flow also self-provisions the bucket and needs no storage RLS
  // policy, so it works without any manual Supabase setup.
  const uploadTransientFile = async (f: File) => {
    const up = await uploadToStorage(f, "quiz");
    return { bucket: up.bucket, path: up.path, fileName: up.name, fileType: up.type };
  };

  const analyzeFile = async (file: File, title: string, course: string) => {
    // Skip the text-estimate analyze pass for images. The route returns a
    // fixed maxQuestions for image input (no source text to count terms in)
    // and we don't want to burn vision credits estimating.
    if (isImageFile(file)) {
      setRecommendedMaxQuestions(8);
      setAnalyzing(false);
      return;
    }
    setAnalyzing(true);
    try {
      const up = await uploadTransientFile(file);
      const fd = new FormData();
      fd.append("bucket", up.bucket);
      fd.append("path", up.path);
      fd.append("fileName", up.fileName);
      fd.append("fileType", up.fileType);
      fd.append("title", title || "Untitled Quiz");
      fd.append("course", course);
      fd.append("mode", "analyze");

      const resp = await fetch("/api/ai/quiz/generate", {
        method: "POST",
        body: fd,
      });
      const json = await resp.json().catch(() => ({}));
      if (resp.ok && Number.isFinite(Number(json.maxQuestions))) {
        setRecommendedMaxQuestions(Math.max(1, Math.round(Number(json.maxQuestions))));
        return;
      }
      setRecommendedMaxQuestions(null);
    } catch {
      setRecommendedMaxQuestions(null);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (courseOptions.length === 0) {
      setError("Please add a course in Passing Target before creating a quiz.");
      return;
    }
    if (!formData.file) {
      setError("Please upload a source PDF, .txt, or image.");
      return;
    }
    if (formData.file.size > MAX_SIZE) {
      setError("File exceeds the 50 MB limit.");
      return;
    }
    // Images need a vision-capable (Premium) model — Tesseract OCR can't
    // read stacked fractions / exponents / 2D math.
    if (isImageFile(formData.file) && modelTier(model) !== "premium") {
      setError(
        "Image input needs a Premium model (Claude Opus) to read math layouts correctly.",
      );
      return;
    }
    let parsedTotal = Math.max(1, Math.floor(Number(numQuestions) || 1));
    if (recommendedMaxQuestions && parsedTotal > recommendedMaxQuestions) {
      parsedTotal = recommendedMaxQuestions;
    }
    setError(null);
    setLoading(true);
    const t = toast.loading("Generating quiz questions…");
    try {
      const up = await uploadTransientFile(formData.file);
      const fd = new FormData();
      fd.append("bucket", up.bucket);
      fd.append("path", up.path);
      fd.append("fileName", up.fileName);
      fd.append("fileType", up.fileType);
      fd.append("title", formData.title);
      fd.append("course", formData.course);
      fd.append("requestedQuestions", String(parsedTotal));
      fd.append("language", language);
      fd.append("model", model);
      const resp = await fetch("/api/ai/quiz/generate", {
        method: "POST",
        body: fd,
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.error || `Failed (${resp.status})`);
      }
      const json = (await resp.json()) as {
        title: string;
        course: string;
        source: string;
        questions: GeneratedQuestion[];
        imageDataUrl?: string | null;
        basic?: boolean;
      };
      toast.success(`Generated ${json.questions.length} questions`, { id: t });
      refreshUsage(); // credits/quota were spent server-side, sync the navbar
      // For image quizzes, detect label boxes (Tesseract) so the quiz page can
      // COVER the labels and the student answers without reading the diagram.
      let imageRegions: ImageOcrRegion[] | null = null;
      if (formData.file && isImageFile(formData.file)) {
        try {
          const tess = await extractTesseractRegions(formData.file);
          imageRegions = tess.regions;
        } catch {
          imageRegions = null;
        }
      }
      onCreated?.({
        title: json.title,
        course: json.course,
        source: json.source,
        questions: json.questions,
        imageDataUrl: json.imageDataUrl ?? null,
        imageRegions,
        basic: json.basic ?? false,
      });
      if (json.basic) {
        toast("Made a basic quiz: the free AI models couldn't build a structured quiz this time. Try again, or use a Premium model (Claude Opus) for full AI quality.", { icon: "ℹ️", duration: 7000 });
      }
      setFormData({ title: "", course: "", file: null });
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Generation failed", {
        id: t,
      });
    } finally {
      setLoading(false);
    }
  };

  const acceptFile = (f: File) => {
    if (f.size > MAX_SIZE) {
      setError("File exceeds the 50 MB limit.");
      return;
    }
    setError(null);
    setFormData({ ...formData, file: f });
    analyzeFile(f, formData.title, formData.course);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) acceptFile(e.target.files[0]);
  };

  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) acceptFile(e.dataTransfer.files[0]);
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
      className="fixed inset-0 z-50 flex items-center justify-center p-1 sm:p-4"
      style={{ background: "rgba(0, 0, 0, 0.5)" }}
      onClick={onClose}
    >
      <div
        className="relative w-[calc(100vw-0.5rem)] max-w-[20.5rem] max-h-[90dvh] overflow-y-auto rounded-2xl bg-white px-2.5 pb-2.5 pt-9 shadow-xl sm:w-full sm:max-w-lg sm:px-6 sm:pb-6 sm:pt-6"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-2.5 top-2.5 text-gray-400 transition-colors hover:text-gray-600 sm:right-6 sm:top-6"
          aria-label="Close"
        >
          <X size={18} />
        </button>

        <header className="mb-3 sm:mb-8">
          <h2 className="mb-1 text-xs font-semibold text-black-primary sm:text-2xl">
            Create New Quiz
          </h2>
          <p className="text-[11px] leading-tight text-gray-primary sm:text-sm">
            Generate a practice quiz from your course materials
          </p>
        </header>

        {coursesLoaded && courseOptions.length === 0 && (
          <div className="mb-3 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-2.5 sm:mb-6 sm:p-4">
            <AlertCircle size={18} className="mt-0.5 shrink-0 text-amber-600" />
            <div className="text-xs text-amber-800 sm:text-sm">
              <p className="font-medium">No courses yet.</p>
              <p className="mt-1">
                Add a course in{" "}
                <Link
                  href="/passing-target"
                  className="font-semibold underline"
                >
                  Passing Target
                </Link>{" "}
                first, quizzes must be tied to one of your courses.
              </p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-6">
          <div>
            <label className="mb-1 block text-[11px] font-medium text-black-primary sm:mb-3 sm:text-sm">
              Number of questions
            </label>
            <input
              type="number"
              min={1}
              max={recommendedMaxQuestions ?? undefined}
              value={numQuestions}
              onChange={(e) => setNumQuestions(e.target.value)}
              onBlur={() => { if (numQuestions === "" || Number(numQuestions) < 1) setNumQuestions("1"); }}
              disabled={loading || analyzing}
              className="w-full rounded-xl border border-gray-300 px-2.5 py-2 text-[13px] text-black-primary focus:border-transparent focus:outline-none focus:ring-2 focus:ring-indigo-primary sm:px-4 sm:py-3.5 sm:text-sm"
            />
            <p className="mt-1.5 text-[11px] leading-tight text-gray-primary sm:text-sm">
              We aim for this many. A thin source can yield fewer, and you only spend credits on questions actually created.
              {recommendedMaxQuestions ? ` This file supports about ${recommendedMaxQuestions}.` : analyzing ? " Estimating how many this file supports…" : ""}
            </p>
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-medium text-black-primary sm:mb-3 sm:text-sm">
              Title<span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="e.g., Algorithms Midterm Practice"
              value={formData.title}
              onChange={(e) =>
                setFormData({ ...formData, title: e.target.value })
              }
              className="w-full rounded-xl border border-gray-300 px-2.5 py-2 text-[13px] text-black-primary placeholder:text-gray-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-indigo-primary sm:px-4 sm:py-3.5 sm:text-sm"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-medium text-black-primary sm:mb-3 sm:text-sm">
              Course<span className="text-red-500">*</span>
            </label>
            <select
              value={formData.course}
              onChange={(e) =>
                setFormData({ ...formData, course: e.target.value })
              }
              disabled={courseOptions.length === 0}
              className="w-full rounded-xl border border-gray-300 bg-white px-2.5 py-2 text-[13px] text-black-primary focus:border-transparent focus:outline-none focus:ring-2 focus:ring-indigo-primary disabled:bg-gray-50 disabled:text-gray-400 sm:px-4 sm:py-3.5 sm:text-sm"
              required
            >
              <option value="">
                {courseOptions.length === 0
                  ? "Add a course in Passing Target first"
                  : "Select a course"}
              </option>
              {courseOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <LanguagePicker
            value={language}
            onChange={setLanguage}
            disabled={loading || analyzing}
            label="Question Language"
          />

          <ModelPicker
            id="quiz-model"
            value={model}
            onChange={setModel}
            disabled={loading || analyzing}
            label="AI Model"
            hint={
              modelTier(model) === "premium"
                ? "Premium model, uses 1 credit per question generated."
                : "Free model, rate-limited but no cost."
            }
          />

          <div>
            <label className="block text-sm font-medium text-black-primary mb-3">
              Source<span className="text-red-500">*</span>
            </label>
            <label
              htmlFor="quiz-source-upload"
              className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${
                isDragging
                  ? "border-indigo-primary bg-indigo-50"
                  : "border-gray-300 bg-white hover:bg-gray-50"
              }`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
            >
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                <Upload size={24} className="text-gray-400 mb-2" />
                <p className="text-sm text-gray-500 text-center">
                  {formData.file ? (
                    <span className="font-medium text-indigo-primary">
                      {formData.file.name}
                    </span>
                  ) : (
                    "Upload a PDF, .txt, or image (max. 50 MB)"
                  )}
                </p>
                {recommendedMaxQuestions ? (
                  <p className="mt-2 text-xs text-indigo-primary">
                    Supports about {recommendedMaxQuestions} questions
                  </p>
                ) : null}
              </div>
              <input
                id="quiz-source-upload"
                type="file"
                className="hidden"
                accept="application/pdf,.pdf,text/plain,.txt,image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
                onChange={handleFileChange}
              />
            </label>
            {error && (
              <p className="text-sm text-red-500 mt-2">{error}</p>
            )}
          </div>

          {outOfBudget && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {modelTier(model) === "premium"
                ? "You have no premium credits left. Buy credits, or switch to a free model."
                : "You've used all your free generations today (resets at midnight UTC). Switch to a Premium model, or come back tomorrow."}
            </p>
          )}
          <button
            type="submit"
            disabled={loading || outOfBudget}
            className="w-full flex items-center justify-center gap-2 px-4 py-4 bg-indigo-primary text-white rounded-xl hover:bg-indigo-600 transition-colors font-medium disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 size={20} className="animate-spin" />
                Generating…
              </>
            ) : outOfBudget ? (
              <>
                <CirclePlus size={20} />
                {modelTier(model) === "premium" ? "No credits left" : "No free generations left"}
              </>
            ) : (
              <>
                <CirclePlus size={20} />
                Generate Quiz
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
