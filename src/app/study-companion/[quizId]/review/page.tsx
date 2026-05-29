"use client";

import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  MessagesSquare,
  XCircle,
  Loader2,
} from "lucide-react";
import { use, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { useQuizById } from "@/lib/quiz-data";
import { useAiAnalyze, useAiUsageOnMount } from "@/lib/use-ai-analyze";
import { MODEL_OPTIONS, modelTier } from "@/lib/ai/openrouter";
import ModelPicker, { DEFAULT_MODEL_ID } from "@/components/ui/model-picker";
import { useStore } from "@/store/use-store";

const DEFAULT_MODEL = DEFAULT_MODEL_ID;

export default function StudyCompanionReview({
  params,
}: {
  params: Promise<{ quizId: string }>;
}) {
  const { quizId } = use(params);
  const liveQuiz = useQuizById(quizId);
  const attempts = useStore((s) => s.attempts);
  // Load the shared free/credit counters once for this page.
  useAiUsageOnMount();

  // ── All hooks must run unconditionally, before any early return ──
  const { analyze, remaining, credits } = useAiAnalyze();
  const aiAnalyses = useStore((s) => s.aiAnalyses);
  const setAiAnalysis = useStore((s) => s.setAiAnalysis);
  const [bulkModel, setBulkModel] = useState(DEFAULT_MODEL);
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);

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

  // ── Analyze-all (bulk) ────────────────────────────────────────────────
  // (bulk hooks declared at the top of the component, before the early
  // return, to keep hook order stable.)

  // Answered questions that don't already have a stored analysis.
  const pendingQuestions = questions.filter(
    (q) => q.answered && !aiAnalyses[`${quizId}:${q.id}`],
  );

  const bulkPremium = modelTier(bulkModel) === "premium";
  const bulkModelLabel =
    MODEL_OPTIONS.find((m) => m.id === bulkModel)?.label ?? bulkModel;

  const handleAnalyzeAll = async () => {
    if (pendingQuestions.length === 0) {
      toast("All answered questions are already analyzed.");
      return;
    }
    const n = pendingQuestions.length;
    const units = bulkPremium ? "premium credits" : "free analyses";
    // Confirm + show the cost up front.
    if (
      !confirm(
        `Are you sure to analyze all?\n\nThis will analyze ${n} question${
          n === 1 ? "" : "s"
        } with ${bulkModelLabel}${
          bulkPremium ? `, using ${n} ${units}` : " (free)"
        }.`,
      )
    ) {
      return;
    }

    setBulkRunning(true);
    let done = 0;
    setBulkProgress({ done: 0, total: n });
    // Sequential — respects rate limits and avoids racing the shared quota.
    for (const q of pendingQuestions) {
      const outcome = await analyze({
        question: q.prompt,
        userAnswer: q.yourAnswer,
        correctAnswer: q.correctAnswer,
        subject: quizView.course,
        model: bulkModel,
      });
      if (outcome.ok) {
        setAiAnalysis(`${quizId}:${q.id}`, outcome.result);
        done += 1;
        setBulkProgress({ done, total: n });
      } else {
        // Stop on first failure (quota/credits exhausted or models busy).
        toast.error(`${outcome.error} (analyzed ${done}/${n})`);
        break;
      }
    }
    setBulkRunning(false);
    setBulkProgress(null);
    if (done > 0) {
      toast.success(`Analyzed ${done} question${done === 1 ? "" : "s"}.`);
    }
  };

  const bulkBalance = bulkPremium ? (credits ?? 0) : (remaining ?? 0);

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

      {/* Bulk analyze bar */}
      {attempt && (
        <div className="mb-4 flex flex-col gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-gray-primary">
            {pendingQuestions.length > 0
              ? `${pendingQuestions.length} question${
                  pendingQuestions.length === 1 ? "" : "s"
                } not analyzed yet.`
              : "All answered questions analyzed."}
          </p>
          <div className="flex items-center gap-2">
            {/* Pick the model for the bulk run */}
            <ModelPicker
              variant="compact"
              value={bulkModel}
              onChange={setBulkModel}
              disabled={bulkRunning}
            />
            <button
              type="button"
              onClick={handleAnalyzeAll}
              disabled={bulkRunning || pendingQuestions.length === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-primary px-3 py-1.5 text-xs font-medium text-white transition hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {bulkRunning ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  {bulkProgress
                    ? `Analyzing ${bulkProgress.done}/${bulkProgress.total}…`
                    : "Analyzing…"}
                </>
              ) : (
                <>
                  Analyze all
                  <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] font-semibold">
                    {bulkBalance} {bulkPremium ? "cr" : "free"}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Question list */}
      <div className="space-y-4">
        {questions.map((q, idx) => (
          <QuestionReviewCard
            key={q.id}
            quizId={quizId}
            question={q}
            number={idx + 1}
            course={quizView.course}
          />
        ))}
      </div>
    </div>
  );
}

type QuestionReview = {
  id: string;
  prompt: string;
  yourAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
  answered: boolean;
};

function QuestionReviewCard({
  quizId,
  question,
  number,
  course,
}: {
  quizId: string;
  question: QuestionReview;
  number: number;
  course: string;
}) {
  const { analyze, remaining, credits } = useAiAnalyze();
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cached, setCached] = useState(false);

  const premium = modelTier(model) === "premium";

  // Persisted result, keyed per quiz+question, so feedback survives refresh.
  const storeKey = `${quizId}:${question.id}`;
  const result = useStore((s) => s.aiAnalyses[storeKey]) ?? null;
  const setAiAnalysis = useStore((s) => s.setAiAnalysis);

  // Free model needs daily quota; premium model needs ≥1 credit.
  const canAnalyze =
    question.answered &&
    !loading &&
    (premium ? (credits ?? 0) > 0 : remaining !== 0);

  const handleAnalyze = async () => {
    if (!canAnalyze) return;
    setLoading(true);
    setError(null);
    setCached(false);
    const outcome = await analyze({
      question: question.prompt,
      userAnswer: question.yourAnswer,
      // Pass the answer key so the AI grades against it instead of guessing.
      correctAnswer: question.correctAnswer,
      subject: course,
      model,
    });
    if (outcome.ok) {
      setAiAnalysis(storeKey, outcome.result); // persist → survives refresh
      setCached(outcome.cached);
    } else {
      setError(outcome.error);
    }
    setLoading(false);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0">
          {question.isCorrect ? (
            <CheckCircle2 size={20} className="text-green-500" />
          ) : (
            <XCircle size={20} className="text-red-500" />
          )}
        </div>
        <div className="flex-1">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-base font-semibold text-black-primary">
              Question {number}: {question.prompt}
            </h3>
            <div className="flex items-center gap-2 shrink-0">
              {/* Pick any model — free ones are free, Opus charges a credit. */}
              <ModelPicker
                variant="compact"
                value={model}
                onChange={setModel}
                disabled={loading}
              />
              <button
                type="button"
                onClick={handleAnalyze}
                disabled={!canAnalyze}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-black-primary transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span>{loading ? "Analyzing…" : "Analyze"}</span>
                <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-primary">
                  {premium
                    ? `${credits ?? "…"} cr`
                    : `${remaining ?? "…"} free`}
                </span>
              </button>
            </div>
          </div>
          <p className="text-sm text-gray-primary mt-2">
            Your answer: {question.answered ? question.yourAnswer : "Not answered"}
          </p>
          {!question.isCorrect && (
            <p className="text-sm text-green-600 font-medium">
              Correct: {question.correctAnswer}
            </p>
          )}

          {!premium && remaining === 0 && (
            <p className="mt-2 text-xs text-amber-700">
              Daily free limit reached (resets midnight UTC). Switch to Opus to
              keep going.
            </p>
          )}
          {premium && (credits ?? 0) === 0 && (
            <p className="mt-2 text-xs text-amber-700">
              No premium credits left. Buy a pack on the Study Companion page.
            </p>
          )}
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

          {result && (
            <div className="mt-4 rounded-lg border border-gray-100 bg-gray-50 p-3 text-sm text-gray-900">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {result.verdict.replace("_", " ")}
                </span>
                <span className="text-xs font-medium text-indigo-primary">
                  Score {result.score}
                </span>
                {cached && (
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                    ⚡ Cached
                  </span>
                )}
              </div>
              <p className="mt-2 text-sm text-gray-800">{result.feedback}</p>
              {result.mistakes.length > 0 && (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-gray-700">
                  {result.mistakes.map((mistake, idx) => (
                    <li key={idx}>{mistake}</li>
                  ))}
                </ul>
              )}
              {result.concept && (
                <p className="mt-2 text-xs text-gray-700">
                  {result.concept}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
