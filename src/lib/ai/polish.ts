// Regex polishing pass.
//
// Runs AFTER the LLM emits JSON, BEFORE structural validation and dedup. The
// idea: free models in particular love to wrap option text in "A) ", "**bold**",
// "Question 1: ...", trailing periods, smart quotes, and stray whitespace.
// Validating that raw output rejects perfectly good questions on cosmetics; the
// polisher normalizes those artifacts so the same content survives validation
// and renders cleanly in the UI.
//
// Polish is intentionally lossless on meaning: it strips formatting noise, not
// content. If a regex would change the semantics of a math expression, it's
// out.

import type { QuizPayload, FlashcardPayload, QuizItem, FlashcardItem } from "./schema";

// --- shared text-level cleanup ---------------------------------------------

const LEADING_BULLET = /^\s*(?:[-*•·▪◦]|[(\[]?\d{1,3}[.)\]:-])\s+/;
const LEADING_QA_LABEL = /^\s*(?:q(?:uestion)?|a(?:nswer)?|front|back|prompt)\s*[:.\-)]\s*/i;
const MD_BOLD = /\*\*([^*]+)\*\*/g;
const MD_ITALIC_STAR = /(^|[^\w*])\*([^*\n]+)\*(?=[^\w*]|$)/g;
const MD_ITALIC_UNDER = /(^|[^\w_])_([^_\n]+)_(?=[^\w_]|$)/g;
const MD_CODE_TICK = /`([^`]+)`/g;
const SMART_QUOTES = /[‘’‚‛]/g; // ' ' ‚ ‛
const SMART_DBL_QUOTES = /[“”„‟]/g; // " " „ ‟
const ZERO_WIDTH = /[​-‍﻿]/g;
const MULTI_WS = /[ \t]{2,}/g;
const MULTI_NL = /\n{3,}/g;

function stripMarkdown(s: string): string {
  return s
    .replace(MD_BOLD, "$1")
    .replace(MD_ITALIC_STAR, "$1$2")
    .replace(MD_ITALIC_UNDER, "$1$2")
    .replace(MD_CODE_TICK, "$1");
}

function normalizeQuotes(s: string): string {
  return s.replace(SMART_QUOTES, "'").replace(SMART_DBL_QUOTES, '"');
}

function squashWhitespace(s: string): string {
  return s.replace(ZERO_WIDTH, "").replace(MULTI_WS, " ").replace(MULTI_NL, "\n\n").trim();
}

function decodeBasicEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function tidyText(s: string): string {
  if (!s) return "";
  let out = String(s);
  out = decodeBasicEntities(out);
  out = stripMarkdown(out);
  out = normalizeQuotes(out);
  out = out.replace(LEADING_BULLET, "");
  out = out.replace(LEADING_QA_LABEL, "");
  out = squashWhitespace(out);
  return out;
}

// --- quiz polishing --------------------------------------------------------

// Option text often arrives as "A) foo", "A. foo", "A: foo", "(A) foo",
// "(A). foo". Match the letter, then any combination of closing brackets and
// trailing punctuation, then whitespace.
const OPTION_PREFIX = /^\s*[(\[]?([A-D])[)\].:\-]+\s+/i;

function stripOptionPrefix(text: string): { letter?: "A" | "B" | "C" | "D"; text: string } {
  const m = text.match(OPTION_PREFIX);
  if (!m) return { text: tidyText(text) };
  const letter = m[1].toUpperCase() as "A" | "B" | "C" | "D";
  return { letter, text: tidyText(text.slice(m[0].length)) };
}

const LETTERS = ["A", "B", "C", "D"] as const;
type Letter = (typeof LETTERS)[number];

function asLetter(value: unknown): Letter | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toUpperCase();
  // Accept "A", "(A)", "A.", "A)", "A: foo", or even "A. The answer is..."
  const m = trimmed.match(/^[(\[]?([A-D])\b/);
  return m ? (m[1] as Letter) : null;
}

function resolveCorrectAnswer(
  raw: string,
  options: { letter: Letter; text: string }[],
): Letter | null {
  // Try letter form first.
  const byLetter = asLetter(raw);
  if (byLetter && options.some((o) => o.letter === byLetter)) return byLetter;
  // Try matching the option text (case/whitespace insensitive).
  const norm = (s: string) => tidyText(s).toLowerCase().replace(/\s+/g, " ");
  const target = norm(raw);
  const hit = options.find((o) => norm(o.text) === target);
  return hit ? hit.letter : null;
}

export type PolishedQuizQuestion = {
  prompt: string;
  options: { letter: Letter; text: string }[];
  correctAnswer: Letter;
};

/**
 * Polish a single LLM-emitted quiz item into the strict 4-option / A-D /
 * letter-correct shape the rest of the pipeline expects. Returns null when
 * the question can't be salvaged (fewer than 4 distinct options, no
 * resolvable correct answer).
 */
export function polishQuizQuestion(raw: QuizItem): PolishedQuizQuestion | null {
  if (!raw || typeof raw !== "object") return null;
  const prompt = tidyText(String(raw.prompt ?? ""));
  if (!prompt) return null;

  const rawOpts = Array.isArray(raw.options) ? raw.options.slice(0, 6) : [];
  const seen = new Set<string>();
  const cleaned: { letter: Letter; text: string }[] = [];
  for (let i = 0; i < rawOpts.length; i++) {
    const opt = rawOpts[i];
    const rawText = typeof opt?.text === "string" ? opt.text : "";
    if (!rawText) continue;
    const { letter: parsedLetter, text } = stripOptionPrefix(rawText);
    if (!text) continue;
    const key = text.toLowerCase().replace(/\s+/g, " ");
    if (seen.has(key)) continue;
    seen.add(key);
    // Prefer the explicit `label` if present, then the prefix we parsed off
    // the text, then fall back to positional A/B/C/D.
    const labelLetter = asLetter(opt?.label);
    const letter: Letter =
      labelLetter ?? parsedLetter ?? LETTERS[cleaned.length];
    cleaned.push({ letter, text });
    if (cleaned.length === 4) break;
  }
  if (cleaned.length < 4) return null;

  // Reassign letters positionally so the output is always exactly A/B/C/D in
  // order — the original letters may have collided or skipped.
  const options = cleaned.map((o, i) => ({ letter: LETTERS[i], text: o.text }));

  const correct = resolveCorrectAnswer(String(raw.correctAnswer ?? ""), options) ?? null;
  if (!correct) {
    // Last-ditch: if the model put "(correct)" or "✓" in one of the original
    // option texts, use that. Cheap, helps rescue otherwise-good questions.
    const idx = rawOpts.findIndex(
      (o) =>
        typeof o?.text === "string" &&
        /\((correct|right|answer)\)|✓|✔/i.test(o.text),
    );
    if (idx >= 0 && idx < 4) {
      return { prompt, options, correctAnswer: LETTERS[idx] };
    }
    return null;
  }

  return { prompt, options, correctAnswer: correct };
}

/** Polish every question in an LLM payload; drop ones that don't survive. */
export function polishQuizPayload(payload: QuizPayload): PolishedQuizQuestion[] {
  if (!payload || !Array.isArray(payload.questions)) return [];
  const out: PolishedQuizQuestion[] = [];
  const seenPrompts = new Set<string>();
  for (const q of payload.questions) {
    const polished = polishQuizQuestion(q);
    if (!polished) continue;
    const key = polished.prompt.toLowerCase().replace(/\s+/g, " ");
    if (seenPrompts.has(key)) continue;
    seenPrompts.add(key);
    out.push(polished);
  }
  return out;
}

// --- flashcard polishing ---------------------------------------------------

const TRAILING_PUNCT = /[.,;:!?\-–—]+\s*$/;

export type PolishedFlashcard = { front: string; back: string };

/**
 * Polish a single LLM-emitted flashcard. Trims markdown, Q/A labels, leading
 * numbering, and balances whitespace. The `front` gets trailing punctuation
 * stripped when it looks like a bare term (single line, no spaces in the
 * stripped suffix) so "Photosynthesis." becomes "Photosynthesis" but the
 * sentence "Define the derivative." stays intact.
 */
export function polishFlashcard(raw: FlashcardItem): PolishedFlashcard | null {
  if (!raw || typeof raw !== "object") return null;
  let front = tidyText(String(raw.front ?? ""));
  let back = tidyText(String(raw.back ?? ""));
  if (!front || !back) return null;

  // Strip a single trailing punctuation char when the front is short — bare
  // term cards read better without "Photosynthesis." style punctuation.
  if (!/\s/.test(front) || front.length <= 24) {
    front = front.replace(TRAILING_PUNCT, "");
  }

  // Hard cap back length to match the prompt's contract.
  if (back.length > 300) back = back.slice(0, 297) + "…";

  // Reject placeholder content the LLM occasionally emits.
  if (
    /^(n\/?a|none|tba|placeholder|sample)$/i.test(front) ||
    /^(n\/?a|none|tba|placeholder|sample)$/i.test(back)
  ) {
    return null;
  }

  return { front, back };
}

export function polishFlashcardPayload(payload: FlashcardPayload): PolishedFlashcard[] {
  if (!payload || !Array.isArray(payload.cards)) return [];
  const seen = new Set<string>();
  const out: PolishedFlashcard[] = [];
  for (const c of payload.cards) {
    const polished = polishFlashcard(c);
    if (!polished) continue;
    const key = polished.front.toLowerCase().replace(/\s+/g, " ");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(polished);
  }
  return out;
}
