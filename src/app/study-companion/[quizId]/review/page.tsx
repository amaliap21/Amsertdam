"use client";

import Link from "next/link";
import { ArrowLeft, CheckCircle2, MessagesSquare, XCircle } from "lucide-react";
import { use, useMemo } from "react";
import { useQuizById } from "@/lib/quiz-data";
import { useStore } from "@/store/use-store";

export default function StudyCompanionReview({
  params,
}: {
  params: Promise<{ quizId: string }>;
}) {
  const { quizId } = use(params);
  const liveQuiz = useQuizById(quizId);
  const attempts = useStore((s) => s.attempts);

  // Most recent attempt for this quiz.
  const attempt = useMemo(() => {
    const matching = attempts.filter((a) => a.quizId === quizId);
    if (matching.length === 0) return null;
    return matching.reduce((latest, a) =>
      new Date(a.completedAt) > new Date(latest.completedAt) ? a : latest,
    );
  }, [attempts, quizId]);

  // Study Companion mirrors the live quiz list. If the quiz was deleted in
  // Quiz Lab, this entry shouldn't exist, bounce the user back.
  const quizView = liveQuiz
    ? {
        title: liveQuiz.title,
        course: liveQuiz.course,
        questions: liveQuiz.questions,
      }
    : null;

  if (!quizView) {
    return (
      <div className="min-h-dvh bg-white px-4 sm:px-6 md:px-10 lg:px-14.75 py-6 md:py-11.5">
        <Link
          href="/study-companion"
          className="flex items-center gap-2 text-gray-primary hover:text-black-primary transition-colors mb-8"
        >
          <ArrowLeft size={18} />
          <span className="text-sm">Back to Study Companion</span>
        </Link>
        <p className="text-gray-primary">
          This quiz was deleted from Quiz Lab. Create or take a new quiz to
          start a new review here.
        </p>
      </div>
    );
  }

  const questions = quizView.questions.map((q) => {
    const userLetter = attempt?.answers?.[q.id];
    const userOption = q.options.find((o) => o.letter === userLetter);
    const correctOption = q.options.find((o) => o.letter === q.correctAnswer);
    return {
      id: q.id,
      prompt: q.prompt,
      yourAnswer: userOption
        ? `${userOption.letter}. ${userOption.text}`
        : "—",
      correctAnswer: correctOption
        ? `${correctOption.letter}. ${correctOption.text}`
        : q.correctAnswer,
      isCorrect: Boolean(userLetter) && userLetter === q.correctAnswer,
      answered: Boolean(userLetter),
    };
  });

  const correctCount = questions.filter((q) => q.isCorrect).length;
  const total = questions.length;

  return (
    <div className="min-h-dvh bg-white px-4 sm:px-6 md:px-10 lg:px-14.75 py-6 md:py-11.5">
      {/* Top bar */}
      <div className="flex flex-col sm:flex-row gap-3 sm:justify-between sm:items-center mb-8">
        <Link
          href="/study-companion"
          className="flex items-center gap-2 text-gray-primary hover:text-black-primary transition-colors"
        >
          <ArrowLeft size={18} />
          <span className="text-sm">Back to Study Companion</span>
        </Link>
        <Link
          href={`/study-companion/${quizId}/chat`}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-primary text-white rounded-lg hover:bg-indigo-600 transition-colors text-sm font-medium"
        >
          <MessagesSquare size={16} />
          Chat with AI
        </Link>
      </div>

      {/* Title */}
      <div className="mb-10">
        <h1 className="text-[28px] font-semibold text-black-primary mb-2">
          {quizView.title}
        </h1>
        <p className="text-gray-primary">
          {attempt
            ? `${correctCount}/${total} correct`
            : "No attempt recorded yet"}{" "}
          &bull; {quizView.course}
        </p>
      </div>

      {!attempt && (
        <div className="mb-8 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          You haven&apos;t taken this quiz yet, answers are shown below but
          there&apos;s nothing to review. Take the quiz in Quiz Lab first.
        </div>
      )}

      {/* Question list */}
      <div className="space-y-4">
        {questions.map((q, idx) => (
          <div
            key={q.id}
            className="bg-white border border-gray-200 rounded-xl p-5"
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5 shrink-0">
                {q.isCorrect ? (
                  <CheckCircle2 size={20} className="text-green-500" />
                ) : (
                  <XCircle size={20} className="text-red-500" />
                )}
              </div>
              <div className="flex-1">
                <h3 className="text-base font-semibold text-black-primary mb-2">
                  Question {idx + 1}: {q.prompt}
                </h3>
                <p className="text-sm text-gray-primary mb-1">
                  Your answer: {q.answered ? q.yourAnswer : "Not answered"}
                </p>
                {!q.isCorrect && (
                  <p className="text-sm text-green-600 font-medium">
                    Correct: {q.correctAnswer}
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
