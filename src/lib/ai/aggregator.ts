import type { QuizQuestion } from "@/lib/python-ports/quiz-extractor";
import type { Flashcard } from "@/lib/python-ports/flashcard-extractor";

function normalize(s: string) {
  return (s || "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function aggregateQuizResults(parts: QuizQuestion[][], limit: number): QuizQuestion[] {
  const seen = new Set<string>();
  const out: QuizQuestion[] = [];
  for (const arr of parts) {
    for (const q of arr || []) {
      const key = normalize(q.prompt || q.prompt || "");
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(q);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

export function aggregateFlashcardResults(parts: Flashcard[][], limit: number) {
  const seen = new Set<string>();
  const out: Flashcard[] = [];
  for (const arr of parts) {
    for (const c of arr || []) {
      const key = normalize(c.front || "");
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(c);
      if (out.length >= limit) return out;
    }
  }
  return out;
}
