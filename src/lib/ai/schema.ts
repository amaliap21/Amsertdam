export type QuizOption = { label?: string; text: string };

export type QuizItem = {
  prompt: string;
  options: QuizOption[]; // ideally 4
  correctAnswer: string; // either label or exact text
  explanation?: string;
};

export type FlashcardItem = {
  front: string;
  back: string;
  sourceSnippet?: string;
};

export type QuizPayload = { questions: QuizItem[] };
export type FlashcardPayload = { cards: FlashcardItem[] };
