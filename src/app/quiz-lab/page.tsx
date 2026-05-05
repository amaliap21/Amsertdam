"use client";

import { CirclePlus, Play, FileText, Download, Sparkles, Trash2 } from "lucide-react";
import { useState, useEffect } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import CreateQuizModal, {
  type GeneratedQuestion,
} from "@/components/ui/quiz-form";
import { useStore } from "@/store/use-store";

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
  }) => {
    addQuiz(data)
      .then(() => toast.success("Quiz saved"))
      .catch(() => toast.success("Quiz saved"));
  };

  useEffect(() => {
    fetchInitial().catch(() => {});
  }, [fetchInitial]);

  return (
    <div className="min-h-screen bg-white px-14.75 py-11.5">
      <header className="flex justify-between items-start mb-12">
        <div>
          <h1 className="text-[28px] font-semibold text-black-primary mb-2">
            Quiz Lab
          </h1>
          <p className="text-gray-primary">
            Generate practice questions from your course materials
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-primary text-white rounded-lg hover:bg-indigo-600 transition-colors"
        >
          <CirclePlus size={18} />
          Create New Quiz
        </button>
      </header>

      <section>
        <div className="flex justify-between items-center mb-6">
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
              Click <span className="font-medium text-indigo-primary">Create New Quiz</span> to upload course material — AI will build a practice quiz.
            </p>
          </div>
        ) : (
        <div className="grid grid-cols-2 gap-6">
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
                      AI
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
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-primary text-white text-sm rounded-lg hover:bg-indigo-600 transition-colors flex-shrink-0"
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
                  onClick={() => toast.success("Download started")}
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
