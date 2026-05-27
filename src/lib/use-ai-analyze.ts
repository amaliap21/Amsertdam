"use client";
import { useCallback, useEffect } from "react";
import type { AnalysisResult } from "@/lib/ai/prompt";
import { useStore } from "@/store/use-store";

export type AnalyzeInput = {
  question: string;
  userAnswer: string;
  correctAnswer?: string;
  subject?: string;
  /** Specific model id (from MODEL_OPTIONS). Billing tier is derived from
   *  it server-side. Omit to use the default free chain. */
  model?: string;
  tier?: "free" | "premium";
};

export type AnalyzeOutcome =
  | { ok: true; result: AnalysisResult; cached: boolean }
  | { ok: false; error: string };

/**
 * Shared AI usage hook. Reads the daily-free and premium-credit counters
 * from the global store, so EVERY Analyze button across the page shows the
 * same numbers (they're one pool). `analyze()` returns the result for the
 * specific call instead of holding it in hook state — each card keeps and
 * persists its own result.
 */
export function useAiAnalyze() {
  const remaining = useStore((s) => s.aiRemaining);
  const credits = useStore((s) => s.aiCredits);
  const setAiUsage = useStore((s) => s.setAiUsage);

  const refresh = useCallback(() => {
    fetch("/api/ai/analyze")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setAiUsage({ remaining: d.remaining, credits: d.credits });
      })
      .catch(() => {});
  }, [setAiUsage]);

  const analyze = useCallback(
    async (input: AnalyzeInput): Promise<AnalyzeOutcome> => {
      try {
        const r = await fetch("/api/ai/analyze", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
        });
        const data = await r.json();
        // Always sync the shared counters from the server's response so all
        // buttons update together.
        setAiUsage({ remaining: data.remaining, credits: data.credits });
        if (!r.ok) {
          return { ok: false, error: data.error ?? "Something went wrong." };
        }
        return { ok: true, result: data.analysis, cached: Boolean(data.cached) };
      } catch {
        return { ok: false, error: "Network error. Please try again." };
      }
    },
    [setAiUsage],
  );

  return { analyze, remaining, credits, refresh };
}

/** Fetches usage once on mount. Call this at a page level (not per card). */
export function useAiUsageOnMount() {
  const { remaining, credits, refresh } = useAiAnalyze();
  useEffect(() => {
    refresh();
  }, [refresh]);
  return { remaining, credits, refresh };
}
