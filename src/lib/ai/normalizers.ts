import { extractFirstJson } from "@/lib/anthropic";
import type { QuizPayload, FlashcardPayload } from "./schema";

// Best-effort JSON normalisers for LLM output. Free models often wrap their
// JSON in prose, code fences, or stray prefixes — try a direct parse first,
// then fall back to extracting the first {...} block.

function tryParseJsonLike<T>(raw: string): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    // fall through
  }
  try {
    return extractFirstJson(raw) as T;
  } catch {
    return null;
  }
}

export function normalizeOpenRouterQuiz(rawText: string): QuizPayload | null {
  return tryParseJsonLike<QuizPayload>(rawText);
}

export function normalizeOpenRouterFlashcards(
  rawText: string,
): FlashcardPayload | null {
  return tryParseJsonLike<FlashcardPayload>(rawText);
}
