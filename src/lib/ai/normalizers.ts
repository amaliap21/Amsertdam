import { jsonrepair } from "jsonrepair";
import { extractFirstJson } from "@/lib/anthropic";
import type { QuizPayload, FlashcardPayload, QuizOption } from "./schema";

// Best-effort JSON normalisers for LLM output.
//
// Recovery strategy:
// 1. Try a direct parse.
// 2. Extract the first JSON object/array from surrounding prose.
// 3. Repair common syntax errors with jsonrepair (missing commas, trailing
//    commas, unquoted keys, single quotes, stray tokens, broken braces).
// 4. For quiz payloads, repair malformed option objects into the expected
//    { letter?, text } shape before later validation/polishing.

function stripInvisibleChars(s: string): string {
  return s
    .replace(/\uFEFF/g, "")
    .replace(/[\u200B-\u200D\u2060]/g, "")
    .trim();
}

function extractJsonSlice(raw: string): string | null {
  const codeBlockMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = stripInvisibleChars(codeBlockMatch ? codeBlockMatch[1] : raw);

  const firstObj = candidate.indexOf("{");
  const firstArr = candidate.indexOf("[");
  if (firstObj === -1 && firstArr === -1) return null;

  let startIdx: number;
  let openCh: string;
  let closeCh: string;
  if (firstObj === -1 || (firstArr !== -1 && firstArr < firstObj)) {
    startIdx = firstArr;
    openCh = "[";
    closeCh = "]";
  } else {
    startIdx = firstObj;
    openCh = "{";
    closeCh = "}";
  }

  let depth = 0;
  let endIdx = -1;
  let inStr: '"' | "'" | null = null;
  let escape = false;
  for (let i = startIdx; i < candidate.length; i++) {
    const ch = candidate[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (inStr) {
      if (ch === "\\") escape = true;
      else if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inStr = ch as '"' | "'";
      continue;
    }
    if (ch === openCh) depth++;
    else if (ch === closeCh) {
      depth--;
      if (depth === 0) {
        endIdx = i;
        break;
      }
    }
  }

  if (endIdx === -1) return null;
  return candidate.substring(startIdx, endIdx + 1);
}

function repairJsonText(raw: string): string {
  return stripInvisibleChars(raw)
    .replace(/[“”„‟]/g, '"')
    .replace(/[‘’‚‛]/g, "'")
    .replace(/,\s*([}\]])/g, "$1")
    .replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '$1"$2":');
}

function parseWithRepairs<T>(raw: string): T | null {
  if (!raw) return null;

  const candidates = new Set<string>();
  const cleaned = stripInvisibleChars(raw);
  if (cleaned) candidates.add(cleaned);

  const slice = extractJsonSlice(cleaned);
  if (slice) candidates.add(slice);

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      // fall through
    }

    try {
      const repaired = jsonrepair(repairJsonText(candidate));
      return JSON.parse(repaired) as T;
    } catch {
      // fall through
    }

    try {
      return extractFirstJson(candidate) as T;
    } catch {
      // fall through
    }
  }

  return null;
}

function tryParseJsonLike<T>(raw: string): T | null {
  return parseWithRepairs<T>(raw);
}

function coerceLetter(value: unknown): QuizOption["label"] | undefined {
  if (typeof value !== "string") return undefined;
  const letter = value.trim().toUpperCase();
  return /^[A-D]$/.test(letter) ? letter : undefined;
}

function coerceText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return text.length > 0 ? text : undefined;
}

function repairQuizOption(option: unknown): QuizOption | null {
  if (!option || typeof option !== "object") return null;
  const anyOption = option as Record<string, unknown>;

  const directText = coerceText(anyOption.text);
  const directLetter =
    coerceLetter(anyOption.letter) ?? coerceLetter(anyOption.label);
  if (directText) {
    return directLetter ? { label: directLetter, text: directText } : { text: directText };
  }

  const stringEntries = Object.entries(anyOption).filter(
    (entry): entry is [string, string] =>
      entry[0] !== "label" &&
      entry[0] !== "letter" &&
      entry[0] !== "text" &&
      typeof entry[1] === "string" &&
      entry[1].trim().length > 0,
  );
  if (stringEntries.length === 0) return null;

  for (const [key, value] of stringEntries) {
    const inferredLetter = coerceLetter(key) ?? coerceLetter(value);
    if (inferredLetter) {
      return { label: inferredLetter, text: value.trim() };
    }
  }

  if (stringEntries.length === 1) {
    const [key, value] = stringEntries[0];
    const inferredLetter = coerceLetter(key);
    return inferredLetter
      ? { label: inferredLetter, text: value.trim() }
      : { text: value.trim() };
  }

  return null;
}

function repairQuizPayload(payload: unknown): QuizPayload | null {
  if (!payload || typeof payload !== "object") return null;
  const anyPayload = payload as Record<string, unknown>;
  if (!Array.isArray(anyPayload.questions)) return null;

  const questions = anyPayload.questions
    .map((question) => {
      if (!question || typeof question !== "object") return null;
      const anyQuestion = question as Record<string, unknown>;
      const prompt = coerceText(anyQuestion.prompt);
      const correctAnswer = coerceText(anyQuestion.correctAnswer);
      const options = Array.isArray(anyQuestion.options)
        ? anyQuestion.options
            .map((option) => repairQuizOption(option))
            .filter((option): option is QuizOption => Boolean(option))
        : [];

      if (!prompt || !correctAnswer || options.length < 4) return null;

      return {
        prompt,
        options: options.slice(0, 6),
        correctAnswer,
      };
    })
    .filter((question): question is QuizPayload["questions"][number] => Boolean(question));

  return questions.length > 0 ? { questions } : null;
}

export function normalizeOpenRouterQuiz(rawText: string): QuizPayload | null {
  const parsed = tryParseJsonLike<unknown>(rawText);
  return repairQuizPayload(parsed);
}

export function normalizeOpenRouterFlashcards(
  rawText: string,
): FlashcardPayload | null {
  return tryParseJsonLike<FlashcardPayload>(rawText);
}
