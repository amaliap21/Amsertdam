"use client";

import { CirclePlus, Play, FileText, Download, Sparkles, Trash2 } from "lucide-react";
import { useState, useEffect } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import CreateQuizModal, {
  type GeneratedQuestion,
} from "@/components/ui/quiz-form";
import { useStore, type GeneratedQuiz } from "@/store/use-store";

async function downloadQuizPdf(quiz: GeneratedQuiz) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });

  const marginX = 48;
  const marginTop = 56;
  const marginBottom = 56;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - marginX * 2;
  let y = marginTop;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - marginBottom) {
      doc.addPage();
      y = marginTop;
    }
  };

  const writeWrapped = (
    text: string,
    fontSize: number,
    style: "normal" | "bold" = "normal",
    leftPad = 0,
  ) => {
    doc.setFont("helvetica", style);
    doc.setFontSize(fontSize);
    const lineHeight = fontSize * 1.35;
    const lines = doc.splitTextToSize(text, contentWidth - leftPad) as string[];
    for (const line of lines) {
      ensureSpace(lineHeight);
      doc.text(line, marginX + leftPad, y);
      y += lineHeight;
    }
  };

  // Header
  writeWrapped(quiz.title || "Quiz", 18, "bold");
  writeWrapped(
    `${quiz.course || "-"} • ${quiz.questions.length} questions`,
    11,
    "normal",
  );
  if (quiz.source) {
    writeWrapped(`Source: ${quiz.source}`, 10, "normal");
  }
  y += 12;

  // Questions
  quiz.questions.forEach((q, idx) => {
    ensureSpace(40);
    writeWrapped(`${idx + 1}. ${q.prompt}`, 12, "bold");
    y += 2;
    q.options.forEach((opt) => {
      writeWrapped(`${opt.letter}. ${opt.text}`, 11, "normal", 16);
    });
    y += 10;
  });

  // Answer key on a new page
  doc.addPage();
  y = marginTop;
  writeWrapped("Answer Key", 16, "bold");
  y += 6;
  quiz.questions.forEach((q, idx) => {
    const opt = q.options.find((o) => o.letter === q.correctAnswer);
    const line = opt
      ? `${idx + 1}. ${q.correctAnswer}. ${opt.text}`
      : `${idx + 1}. ${q.correctAnswer}`;
    writeWrapped(line, 11, "normal");
  });

  const safeName =
    (quiz.title || "quiz").replace(/[^a-z0-9-_\s]/gi, "").trim() || "quiz";
  doc.save(`${safeName}.pdf`);
}

export default function QuizLab() {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const quizzes = useStore((s) => s.quizzes);
  const addQuiz = useStore((s) => s.addQuiz);
  const fetchInitial = useStore((s) => s.fetchInitial);
  const removeQuiz = useStore((s) => s.removeQuiz);

  const handleCreated = (data: {
    title: string;
    course: string;
    source: string;
    questions: GeneratedQuestion[];
    imageDataUrl?: string | null;
  }) => {
    addQuiz(data)
      .then(() => toast.success("Quiz saved"))
      .catch(() => toast.success("Quiz saved"));
  };

  useEffect(() => {
    fetchInitial().catch(() => {});
  }, [fetchInitial]);

  return (
    <div className="min-h-dvh bg-white px-4 sm:px-6 md:px-10 lg:px-14.75 py-6 md:py-11.5">
      <header className="mb-12 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-[28px] font-semibold text-black-primary mb-2">
            Quiz Lab
          </h1>
          <p className="text-gray-primary">
            Generate practice questions from your course materials
          </p>
        </div>
        <button
          data-tour="create-quiz"
          onClick={() => setShowCreateModal(true)}
          className="self-auto inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-primary px-4 py-2.5 text-white transition-colors hover:bg-indigo-600"
        >
          <CirclePlus size={18} />
          Create New Quiz
        </button>
      </header>

      <section>
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-xl font-semibold text-black-primary">
            Your Quizzes
          </h2>
          <span className="text-sm text-gray-primary">
            {quizzes.length} quizzes
          </span>
        </div>

        {quizzes.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 p-10 text-center">
            <Sparkles size={28} className="mx-auto text-indigo-primary mb-3" />
            <p className="text-sm text-black-primary font-medium mb-1">
              No quizzes yet
            </p>
            <p className="text-sm text-gray-primary">
              Click <span className="font-medium text-indigo-primary">Create New Quiz</span> to upload course material, we&apos;ll build a practice quiz.
            </p>
          </div>
        ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {quizzes.map((quiz) => (
            <article
              key={quiz.id}
              className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-md transition-shadow flex flex-col"
            >
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-base font-semibold text-black-primary truncate">
                      {quiz.title}
                    </h3>
                    <span className="flex items-center gap-1 text-[10px] font-medium text-indigo-primary bg-indigo-primary/10 px-1.5 py-0.5 rounded">
                      <Sparkles size={10} />
                      Auto
                    </span>
                    <button
                      title="Delete quiz"
                      onClick={async () => {
                        if (!confirm("Delete this quiz?")) return;
                        await removeQuiz(quiz.id);
                      }}
                      className="ml-auto text-red-400 hover:text-red-600"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <p className="text-sm text-gray-primary mb-2">
                    {quiz.course} &bull; {quiz.questions.length} questions
                  </p>
                  <p className="text-xs text-gray-400 truncate">
                    Source: {quiz.source}
                  </p>
                </div>
                <Link
                  href={`/quiz-lab/${quiz.id}/take`}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg bg-indigo-primary px-3 py-1.5 text-sm text-white transition-colors hover:bg-indigo-600"
                >
                  <Play size={14} />
                  Take Quiz
                </Link>
              </div>

              <div className="flex items-center gap-5 pt-4 border-t border-gray-100 mt-auto">
                <Link
                  href={`/quiz-lab/${quiz.id}/preview`}
                  className="flex items-center gap-1.5 text-sm text-gray-primary hover:text-indigo-primary transition-colors"
                >
                  <FileText size={14} />
                  Preview
                </Link>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await downloadQuizPdf(quiz);
                      toast.success("PDF downloaded");
                    } catch (err) {
                      toast.error(
                        err instanceof Error
                          ? err.message
                          : "Failed to generate PDF",
                      );
                    }
                  }}
                  className="flex items-center gap-1.5 text-sm text-gray-primary hover:text-indigo-primary transition-colors"
                >
                  <Download size={14} />
                  Download
                </button>
              </div>
            </article>
          ))}
        </div>
        )}
      </section>

      <CreateQuizModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={handleCreated}
      />
    </div>
  );
}
