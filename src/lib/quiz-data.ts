export type QuizQuestion = {
  id: string;
  prompt: string;
  options: { letter: "A" | "B" | "C" | "D"; text: string }[];
  correctAnswer: "A" | "B" | "C" | "D";
};

export type Quiz = {
  id: string;
  title: string;
  course: string;
  source: string;
  questions: QuizQuestion[];
};

export const QUIZZES: Quiz[] = [];

export function getQuizById(id: string): Quiz | undefined {
  return QUIZZES.find((q) => q.id === id);
}

import { useStore } from "@/store/use-store";

export function useQuizById(id: string): Quiz | undefined {
  const generated = useStore((s) => s.quizzes.find((q) => q.id === id));
  if (generated) {
    return {
      id: generated.id,
      title: generated.title,
      course: generated.course,
      source: generated.source,
      questions: generated.questions,
    };
  }
  return getQuizById(id);
}
