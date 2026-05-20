"use client";

import { use, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { useSearchParams, notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, XCircle } from "lucide-react";
import { useQuizById } from "@/lib/quiz-data";
import { useStore } from "@/store/use-store";

type Answer = "A" | "B" | "C" | "D";

export default function QuizResult({
  params,
}: {
  params: Promise<{ quizId: string }>;
}) {
  const { quizId } = use(params);
  const searchParams = useSearchParams();
  const quiz = useQuizById(quizId);

  if (!quiz) {
    notFound();
  }

  const raw = searchParams.get("a");
  // Wrapped in useMemo so the object identity is stable across renders, which
  // keeps the useEffect below from re-firing every time React rerenders.
  const answers: Record<string, Answer> = useMemo(() => {
    if (!raw) return {};
    try {
      return JSON.parse(decodeURIComponent(raw));
    } catch {
      return {};
    }
  }, [raw]);

  const correct = quiz.questions.filter(
    (q) => answers[q.id] === q.correctAnswer,
  ).length;
  const total = quiz.questions.length;

  const recordAttempt = useStore((s) => s.recordAttempt);
  const recordedRef = useRef(false);
  useEffect(() => {
    if (recordedRef.current || !quiz || total === 0) return;
    recordedRef.current = true;
    recordAttempt({
      id: `${quiz.id}-${Date.now()}`,
      quizId: quiz.id,
      quizTitle: quiz.title,
      course: quiz.course,
      correct,
      total,
      answers,
      completedAt: new Date().toISOString(),
    });
  }, [quiz, total, correct, answers, recordAttempt]);

  return (
    <div className="min-h-dvh bg-white px-4 sm:px-6 md:px-10 lg:px-14.75 py-6 md:py-11.5">
      <div className="mb-10">
        <Link
          href="/quiz-lab"
          className="flex items-center gap-2 text-black-primary hover:text-indigo-primary transition-colors"
        >
          <ArrowLeft size={20} />
          <span className="text-sm font-medium">Back to Quizzes</span>
        </Link>
      </div>

      <div className="text-center mb-14">
        <h1 className="text-[32px] font-semibold text-black-primary mb-3">
          Quiz Complete
        </h1>
        <p className="text-[48px] font-semibold text-indigo-primary mb-3">
          {correct}/{total}
        </p>
        <p className="text-base text-gray-primary mb-6">
          You answered {correct} out of {total} questions correctly
        </p>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3">
          <Link
            href={`/quiz-lab/${quiz.id}/take`}
            className="text-center rounded-lg border border-gray-300 px-6 py-2.5 text-sm font-medium text-black-primary hover:bg-gray-50 transition-colors"
          >
            Retake Quiz
          </Link>
          <Link
            href={`/study-companion/${quiz.id}/chat`}
            className="text-center rounded-lg bg-indigo-primary px-6 py-2.5 text-sm font-medium text-white hover:opacity-90 transition"
          >
            Review with Study Companion
          </Link>
        </div>
      </div>

      <section>
        <h2 className="text-lg font-semibold text-black-primary mb-5">
          Answer Review
        </h2>
        <div className="flex flex-col gap-3">
          {quiz.questions.map((q, idx) => {
            const userAnswer = answers[q.id];
            const isCorrect = userAnswer === q.correctAnswer;
            const userOption = q.options.find((o) => o.letter === userAnswer);
            const correctOption = q.options.find(
              (o) => o.letter === q.correctAnswer,
            );

            return (
              <article
                key={q.id}
                className="flex items-start gap-4 rounded-xl border border-gray-200 bg-white p-5"
              >
                {isCorrect ? (
                  <CheckCircle2
                    size={24}
                    className="shrink-0 text-green-600"
                  />
                ) : (
                  <XCircle size={24} className="shrink-0 text-red-500" />
                )}
                <div className="flex-1">
                  <h3 className="text-base font-medium text-black-primary mb-2">
                    {idx + 1}. {q.prompt}
                  </h3>
                  <p className="text-sm text-gray-primary">
                    Your answer:{" "}
                    {userOption
                      ? `${userOption.letter}. ${userOption.text}`
                      : "—"}
                  </p>
                  {!isCorrect && correctOption && (
                    <p className="text-sm text-green-700 mt-1">
                      Correct: {correctOption.letter}. {correctOption.text}
                    </p>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
