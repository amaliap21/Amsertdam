"use client";

import Link from "next/link";
import { Suspense, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { FileText, MessagesSquare, Sparkles } from "lucide-react";
import toast from "react-hot-toast";
import { useStore } from "@/store/use-store";
import { useAiUsageOnMount } from "@/lib/use-ai-analyze";

export default function StudyCompanion() {
  return (
    <Suspense fallback={null}>
      <StudyCompanionInner />
    </Suspense>
  );
}

function StudyCompanionInner() {
  const attempts = useStore((s) => s.attempts);
  const liveQuizzes = useStore((s) => s.quizzes);
  const coursesCache = useStore((s) => s.coursesCache);
  // Credits are shown in the navbar now; we still refresh here to catch the
  // balance update after returning from a successful purchase.
  const { refresh } = useAiUsageOnMount();
  const searchParams = useSearchParams();
  const router = useRouter();

  // Handle the redirect back from Midtrans. Credits are granted by the
  // webhook (async), so poll a couple of times to catch the balance update.
  useEffect(() => {
    const purchase = searchParams.get("purchase");
    if (!purchase) return;
    if (purchase === "success") {
      // Midtrans appends transaction_status to the finish redirect URL. The
      // finish callback fires for PENDING payments too (QRIS / virtual account
      // aren't settled instantly), so only claim "received" when Midtrans
      // actually settled/captured it — otherwise the money isn't in yet.
      const status = (searchParams.get("transaction_status") ?? "").toLowerCase();
      const failed = ["deny", "cancel", "expire", "failure"].includes(status);
      const pending = status === "pending";

      if (failed) {
        toast.error("Payment was not completed.");
        router.replace("/study-companion");
        return;
      }

      if (pending) {
        // Payment created but NOT yet received — don't promise credits.
        toast("Payment pending, we'll add your credits once it's confirmed.", {
          icon: "⏳",
        });
      } else {
        // settlement / capture (or a finish callback without a status param).
        toast.success("Payment received, adding your credits…");
      }
      // Either way refresh a few times: a pending QRIS can settle within
      // seconds, and the webhook may land a beat after the redirect.
      refresh();
      const t1 = setTimeout(refresh, 2000);
      const t2 = setTimeout(refresh, 5000);
      router.replace("/study-companion");
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
    if (purchase === "failed") {
      toast.error("Payment was not completed.");
      router.replace("/study-companion");
    }
  }, [searchParams, refresh, router]);

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

  // Per-quiz score % (latest attempt).
  const scoreOf = (q: (typeof quizzes)[number]) =>
    q.total > 0 ? Math.round((q.correct / q.total) * 100) : 0;

  // Course readiness: group the latest quiz scores by course, average them,
  // and compare to the course's pass threshold (from Passing Target) — or a
  // sensible default. Tells the user whether their quiz performance puts the
  // course at risk.
  const courseReadiness = (() => {
    // Pull thresholds from the cached courses (Passing Target).
    const thresholdByCourse = new Map<string, number>();
    if (Array.isArray(coursesCache)) {
      for (const c of coursesCache as Array<{
        title?: string;
        course_payload?: { threshold?: number | null };
      }>) {
        const t = c.course_payload?.threshold;
        if (c.title && typeof t === "number") thresholdByCourse.set(c.title, t);
      }
    }

    const byCourse = new Map<string, number[]>();
    for (const q of quizzes) {
      const course = q.course || "Uncategorized";
      if (!byCourse.has(course)) byCourse.set(course, []);
      byCourse.get(course)!.push(scoreOf(q));
    }

    return Array.from(byCourse.entries()).map(([course, scores]) => {
      const avg = Math.round(
        scores.reduce((s, v) => s + v, 0) / scores.length,
      );
      // Default pass threshold of 60% when the course has none set.
      const threshold = thresholdByCourse.get(course) ?? 60;
      const safe = avg >= threshold;
      // "Borderline" within 10 points below the line.
      const borderline = !safe && avg >= threshold - 10;
      return { course, avg, threshold, safe, borderline, count: scores.length };
    });
  })();

  return (
    <div className="min-h-dvh bg-white px-4 sm:px-6 md:px-10 lg:px-14.75 py-6 md:py-11.5">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-[28px] font-semibold text-black-primary mb-2">
          Study Companion
        </h1>
        <p className="text-gray-primary">
          AI that reviews your answers, explains mistakes, and helps you improve.
        </p>
      </div>

      {/* Course Readiness — pass/at-risk based on quiz performance */}
      {courseReadiness.length > 0 && (
        <div className="mb-10">
          <h2 className="mb-4 text-xl font-semibold text-black-primary">
            Course Readiness
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {courseReadiness.map((c) => (
              <div
                key={c.course}
                className={`rounded-xl border p-4 ${
                  c.safe
                    ? "border-green-200 bg-green-50"
                    : c.borderline
                      ? "border-amber-200 bg-amber-50"
                      : "border-red-200 bg-red-50"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-semibold text-black-primary truncate">
                    {c.course}
                  </h3>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      c.safe
                        ? "bg-green-100 text-green-700"
                        : c.borderline
                          ? "bg-amber-100 text-amber-700"
                          : "bg-red-100 text-red-700"
                    }`}
                  >
                    {c.safe ? "On track" : c.borderline ? "Borderline" : "At risk"}
                  </span>
                </div>
                <p className="mt-2 text-2xl font-semibold text-black-primary">
                  {c.avg}
                  <span className="text-sm font-normal text-gray-primary">
                    {" "}
                    / {c.threshold} needed
                  </span>
                </p>
                <p className="mt-1 text-xs text-gray-primary">
                  Avg across {c.count} quiz{c.count === 1 ? "" : "zes"}.{" "}
                  {c.safe
                    ? "Your quiz scores meet this course's pass threshold."
                    : c.borderline
                      ? "Close to the line, a few more correct answers and you're safe."
                      : "Below the pass threshold, you risk failing this course. Review weak topics and retake quizzes."}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

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
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-block px-3 py-1 bg-indigo-50 text-indigo-primary text-xs font-medium rounded-full">
                        {quiz.correct}/{quiz.total} correct
                      </span>
                      <span
                        className={`inline-block px-3 py-1 text-xs font-semibold rounded-full ${
                          scoreOf(quiz) >= 80
                            ? "bg-green-100 text-green-700"
                            : scoreOf(quiz) >= 60
                              ? "bg-amber-100 text-amber-700"
                              : "bg-red-100 text-red-700"
                        }`}
                      >
                        Score {scoreOf(quiz)}
                      </span>
                    </div>
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
