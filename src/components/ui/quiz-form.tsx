"use client";

import Link from "next/link";
import { X, Upload, CirclePlus, Loader2, AlertCircle } from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

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
  const [requestedQuestions, setRequestedQuestions] = useState(5);
  const [recommendedMaxQuestions, setRecommendedMaxQuestions] = useState<number | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [courseOptions, setCourseOptions] = useState<string[]>([]);
  const [coursesLoaded, setCoursesLoaded] = useState(false);

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

  const analyzeFile = async (file: File, title: string, course: string) => {
    setAnalyzing(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("title", title || "Untitled Quiz");
      fd.append("course", course);
      fd.append("mode", "analyze");

      const resp = await fetch("/api/ai/quiz/generate", {
        method: "POST",
        body: fd,
      });
      const json = await resp.json().catch(() => ({}));
      if (resp.ok && Number.isFinite(Number(json.maxQuestions))) {
        const maxQuestions = Math.max(1, Math.round(Number(json.maxQuestions)));
        setRecommendedMaxQuestions(maxQuestions);
        setRequestedQuestions((current) => Math.min(current, maxQuestions));
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
      setError("Please upload a source PDF or image.");
      return;
    }
    if (formData.file.size > MAX_SIZE) {
      setError("File exceeds the 50 MB limit.");
      return;
    }
    if (recommendedMaxQuestions && requestedQuestions > recommendedMaxQuestions) {
      setError(`This source supports up to ${recommendedMaxQuestions} questions.`);
      return;
    }
    setError(null);
    setLoading(true);
    const t = toast.loading("AI is generating quiz questions…");
    try {
      const fd = new FormData();
      fd.append("file", formData.file);
      fd.append("title", formData.title);
      fd.append("course", formData.course);
      fd.append("requestedQuestions", String(requestedQuestions));
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
      };
      toast.success(`Generated ${json.questions.length} questions`, { id: t });
      onCreated?.({
        title: json.title,
        course: json.course,
        source: json.source,
        questions: json.questions,
      });
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const f = e.target.files[0];
      if (f.size > MAX_SIZE) {
        setError("File exceeds the 50 MB limit.");
        return;
      }
      setError(null);
      setFormData({ ...formData, file: f });
      analyzeFile(f, formData.title, formData.course);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const f = e.dataTransfer.files[0];
      if (f.size > MAX_SIZE) {
        setError("File exceeds the 50 MB limit.");
        return;
      }
      setError(null);
      setFormData({ ...formData, file: f });
      analyzeFile(f, formData.title, formData.course);
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
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-8 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-6 right-6 text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Close"
        >
          <X size={24} />
        </button>

        <header className="mb-8">
          <h2 className="text-2xl font-semibold text-black-primary mb-2">
            Create New Quiz
          </h2>
          <p className="text-sm text-gray-primary">
            Generate a practice quiz from your course materials
          </p>
        </header>

        {coursesLoaded && courseOptions.length === 0 && (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <AlertCircle size={18} className="mt-0.5 shrink-0 text-amber-600" />
            <div className="text-sm text-amber-800">
              <p className="font-medium">No courses yet.</p>
              <p className="mt-1">
                Add a course in{" "}
                <Link
                  href="/passing-target"
                  className="font-semibold underline"
                >
                  Passing Target
                </Link>{" "}
                first — quizzes must be tied to one of your courses.
              </p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-black-primary mb-3">
              Questions to generate
            </label>
            <input
              type="number"
              min={1}
              max={recommendedMaxQuestions ?? undefined}
              value={requestedQuestions}
              onChange={(e) => setRequestedQuestions(Number(e.target.value || 1))}
              disabled={loading || analyzing}
              className="w-full px-4 py-3.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-primary focus:border-transparent text-black-primary"
            />
            <p className="mt-2 text-sm text-gray-primary">
              {recommendedMaxQuestions
                ? `This file supports up to ${recommendedMaxQuestions} questions. You can choose any value up to that limit.`
                : analyzing
                  ? "AI is estimating the maximum question count…"
                  : "Upload a file to estimate the maximum question count."}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-black-primary mb-3">
              Title<span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="e.g., Algorithms Midterm Practice"
              value={formData.title}
              onChange={(e) =>
                setFormData({ ...formData, title: e.target.value })
              }
              className="w-full px-4 py-3.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-primary focus:border-transparent text-black-primary placeholder:text-gray-400"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-black-primary mb-3">
              Course<span className="text-red-500">*</span>
            </label>
            <select
              value={formData.course}
              onChange={(e) =>
                setFormData({ ...formData, course: e.target.value })
              }
              disabled={courseOptions.length === 0}
              className="w-full px-4 py-3.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-primary focus:border-transparent bg-white text-black-primary disabled:bg-gray-50 disabled:text-gray-400"
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
                <p className="text-sm text-gray-500">
                  {formData.file ? (
                    <span className="font-medium text-indigo-primary">
                      {formData.file.name}
                    </span>
                  ) : (
                    "Upload a PDF or text file (max. 50 MB)"
                  )}
                </p>
                {recommendedMaxQuestions ? (
                  <p className="mt-2 text-xs text-indigo-primary">
                    AI limit: {recommendedMaxQuestions} questions
                  </p>
                ) : null}
              </div>
              <input
                id="quiz-source-upload"
                type="file"
                className="hidden"
                accept="image/*,.pdf"
                onChange={handleFileChange}
              />
            </label>
            {error && (
              <p className="text-sm text-red-500 mt-2">{error}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 px-4 py-4 bg-indigo-primary text-white rounded-xl hover:bg-indigo-600 transition-colors font-medium disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 size={20} className="animate-spin" />
                Generating with AI…
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
