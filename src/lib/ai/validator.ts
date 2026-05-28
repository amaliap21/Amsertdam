import type { QuizPayload, FlashcardPayload } from "./schema";

function isNonEmptyString(s: unknown): s is string {
  return typeof s === "string" && s.trim().length > 0;
}

export function validateQuizPayload(obj: unknown): obj is QuizPayload {
  if (!obj || typeof obj !== "object") return false;
  const anyObj = obj as any;
  if (!Array.isArray(anyObj.questions)) return false;
  for (const q of anyObj.questions) {
    if (!isNonEmptyString(q.prompt)) return false;
    if (!Array.isArray(q.options) || q.options.length !== 4) return false;
    const texts = new Set<string>();
    for (const opt of q.options) {
      if (!isNonEmptyString(opt.text)) return false;
      texts.add(opt.text.trim().toLowerCase());
    }
    if (texts.size !== 4) return false;
    if (!isNonEmptyString(q.correctAnswer)) return false;
    // correctAnswer can match option text or option letter/label (e.g. "A")
    const answer = q.correctAnswer.trim();
    const matches = q.options.some(
      (o: any) =>
        (typeof o.text === "string" && o.text.trim() === answer) ||
        (typeof o.label === "string" && o.label.trim() === answer) ||
        (typeof o.letter === "string" && o.letter.trim() === answer),
    );
    if (!matches) return false;
  }
  return true;
}

export function validateFlashcardPayload(obj: unknown): obj is FlashcardPayload {
  if (!obj || typeof obj !== "object") return false;
  const anyObj = obj as any;
  if (!Array.isArray(anyObj.cards)) return false;
  for (const c of anyObj.cards) {
    if (!isNonEmptyString(c.front) || !isNonEmptyString(c.back)) return false;
  }
  return true;
}
