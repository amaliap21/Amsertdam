"use client";

import Link from "next/link";
import { FileText, MessagesSquare, Sparkles } from "lucide-react";
import { useStore } from "@/store/use-store";

export default function StudyCompanion() {
  const attempts = useStore((s) => s.attempts);
  const liveQuizzes = useStore((s) => s.quizzes);

  // Only show attempts whose quiz still exists in Quiz Lab. When a quiz is
  // deleted there, its Study Companion entry vanishes too, Study Companion
  // is a live mirror of takeable quizzes, not a history archive.
  const liveQuizIds = new Set(liveQuizzes.map((q) => q.id));

  // De-duplicate by quizId, keep latest.
  const latestByQuiz = new Map<string, (typeof attempts)[number]>();
  for (const a of attempts) {
    if (!liveQuizIds.has(a.quizId)) continue;
    const prev = latestByQuiz.get(a.quizId);
    if (!prev || new Date(a.completedAt) > new Date(prev.completedAt)) {
      latestByQuiz.set(a.quizId, a);
    }
  }
  const quizzes = Array.from(latestByQuiz.values()).sort(
    (a, b) =>
      new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime(),
  );

  return (
    <div className="min-h-dvh bg-white px-4 sm:px-6 md:px-10 lg:px-14.75 py-6 md:py-11.5">
      {/* Header */}
      <div className="mb-12">
        <h1 className="text-[28px] font-semibold text-black-primary mb-2">
          Study Companion
        </h1>
        <p className="text-gray-primary">
          AI that reviews your answers, explains mistakes, and helps you improve.
        </p>
      </div>

      {/* Completed Quizzes Section */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold text-black-primary">
            Completed Quizzes
          </h2>
          <span className="text-sm text-gray-primary">
            {quizzes.length} elements
          </span>
        </div>

        {quizzes.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-10 text-center">
            <Sparkles size={28} className="mx-auto text-indigo-primary mb-3" />
            <h3 className="text-base font-semibold text-black-primary mb-1">
              No completed quizzes yet
            </h3>
            <p className="text-sm text-gray-primary mb-4">
              Take a quiz from Quiz Lab and your results will show up here for AI review.
            </p>
            <Link
              href="/quiz-lab"
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-primary text-white rounded-lg hover:opacity-90 text-sm font-medium"
            >
              Go to Quiz Lab
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {quizzes.map((quiz) => (
              <div
                key={quiz.id}
                className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-md transition-shadow"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-semibold text-black-primary mb-1 break-words">
                      {quiz.quizTitle}
                    </h3>
                    <p className="text-sm text-gray-primary mb-3 break-words">{quiz.course}</p>
                    <span className="inline-block px-3 py-1 bg-indigo-50 text-indigo-primary text-xs font-medium rounded-full">
                      {quiz.correct}/{quiz.total} correct
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 sm:shrink-0">
                    <Link
                      href={`/study-companion/${quiz.quizId}/review`}
                      className="flex items-center gap-2 px-4 py-2 border border-gray-200 text-black-primary rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
                    >
                      <FileText size={16} />
                      Review
                    </Link>
                    <Link
                      href={`/study-companion/${quiz.quizId}/chat`}
                      className="flex items-center gap-2 px-4 py-2 bg-indigo-primary text-white rounded-lg hover:bg-indigo-600 transition-colors text-sm font-medium"
                    >
                      <MessagesSquare size={16} />
                      Chat with AI
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
