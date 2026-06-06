"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter, notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useQuizById } from "@/lib/quiz-data";

type Answer = "A" | "B" | "C" | "D";

export default function TakeQuiz({
  params,
}: {
  params: Promise<{ quizId: string }>;
}) {
  const { quizId } = use(params);
  const quiz = useQuizById(quizId);
  const router = useRouter();
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});

  if (!quiz) {
    notFound();
  }

  const total = quiz.questions.length;
  const question = quiz.questions[current];
  const progress = ((current + 1) / total) * 100;
  const selected = answers[question.id];

  const handleSelect = (letter: Answer) => {
    setAnswers((prev) => ({ ...prev, [question.id]: letter }));
  };

  const handleNext = () => {
    if (current < total - 1) {
      setCurrent((c) => c + 1);
    } else {
      submit();
    }
  };

  const submit = () => {
    const payload = encodeURIComponent(JSON.stringify(answers));
    router.push(`/quiz-lab/${quiz.id}/result?a=${payload}`);
  };

  return (
    <div className="min-h-dvh bg-white px-4 sm:px-6 md:px-10 lg:px-14.75 py-6 md:py-11.5">
      <div className="flex flex-col-reverse lg:flex-row gap-6 lg:gap-8">
        <div className="flex-1 min-w-0 max-w-[920px]">
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <Link
                href="/quiz-lab"
                className="flex items-center gap-2 text-black-primary hover:text-indigo-primary transition-colors"
              >
                <ArrowLeft size={20} />
                <span className="text-sm font-medium">Exit Quiz</span>
              </Link>
              <span className="text-sm text-gray-primary">
                {current + 1} out of {total} questions
              </span>
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full bg-indigo-primary transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          <h1 className="text-[24px] font-semibold text-black-primary mb-2">
            {quiz.title}
          </h1>

          {quiz.imageDataUrl && (
            <div className="mb-4 overflow-hidden rounded-xl border border-gray-200 bg-white p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={quiz.imageDataUrl} alt="Quiz reference" className="mx-auto max-h-[420px] w-auto object-contain" />
            </div>
          )}

          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <h2 className="text-lg font-medium text-black-primary mb-6">
              {question.prompt}
            </h2>
            <div className="flex flex-col gap-3">
              {question.options.map((opt) => {
                const isSelected = selected === opt.letter;
                return (
                  <button
                    key={opt.letter}
                    type="button"
                    onClick={() => handleSelect(opt.letter)}
                    className={`flex items-center gap-4 rounded-lg border px-4 py-3 text-left transition-colors ${
                      isSelected
                        ? "border-indigo-primary bg-indigo-primary/5"
                        : "border-gray-200 hover:border-indigo-primary/50"
                    }`}
                  >
                    <span
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-sm font-semibold ${
                        isSelected
                          ? "border-indigo-primary bg-indigo-primary text-white"
                          : "border-gray-300 text-black-primary"
                      }`}
                    >
                      {opt.letter}
                    </span>
                    <span className="text-base text-black-primary">
                      {opt.text}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-8 flex justify-end">
            <button
              type="button"
              onClick={handleNext}
              disabled={!selected}
              className="flex items-center gap-2 rounded-lg bg-indigo-primary px-6 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {current < total - 1 ? "Next" : "Finish"}
              <ArrowRight size={16} />
            </button>
          </div>
        </div>

        <aside className="w-full lg:w-[214px] lg:shrink-0">
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-black-primary mb-4">
              Quiz Navigation
            </h3>
            <div className="flex flex-wrap gap-2 mb-4">
              {quiz.questions.map((q, idx) => {
                const answered = answers[q.id] !== undefined;
                const active = idx === current;
                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => setCurrent(idx)}
                    className={`flex h-8 w-8 items-center justify-center rounded-md text-xs font-semibold transition-colors ${
                      active
                        ? "bg-indigo-primary text-white"
                        : answered
                          ? "bg-indigo-primary/10 text-indigo-primary"
                          : "border border-gray-300 text-gray-primary hover:border-indigo-primary"
                    }`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={submit}
              className="text-sm font-medium text-indigo-primary hover:underline"
            >
              Finish quiz
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
