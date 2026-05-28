import { extractFirstJson } from "@/lib/anthropic";
import type { QuizPayload, FlashcardPayload } from "./schema";

function tryParseJsonLike<T>(raw: string): T | null {
  if (!raw) return null;
  // Try direct parse first
  try {
    const p = JSON.parse(raw) as T;
    return p;
  } catch (_) {
    // fallthrough to extractFirstJson which finds the first {...}
  }
  try {
    const p = extractFirstJson(raw) as T;
    return p;
  } catch {
    return null;
  }
}

export function normalizeAnthropicQuiz(rawText: string): QuizPayload | null {
  return tryParseJsonLike<QuizPayload>(rawText);
}

export function normalizeAnthropicFlashcards(rawText: string): FlashcardPayload | null {
  return tryParseJsonLike<FlashcardPayload>(rawText);
}

export function normalizeOpenRouterQuiz(rawText: string): QuizPayload | null {
  // OpenRouter often emits plain text; attempt best-effort parsing
  return tryParseJsonLike<QuizPayload>(rawText);
}

export function normalizeOpenRouterFlashcards(rawText: string): FlashcardPayload | null {
  return tryParseJsonLike<FlashcardPayload>(rawText);
}

export function normalizeHfQuiz(rawText: string): QuizPayload | null {
  // HuggingFace outputs may include extra prefixes; same strategy
  return tryParseJsonLike<QuizPayload>(rawText);
}

export function normalizeHfFlashcards(rawText: string): FlashcardPayload | null {
  return tryParseJsonLike<FlashcardPayload>(rawText);
}
