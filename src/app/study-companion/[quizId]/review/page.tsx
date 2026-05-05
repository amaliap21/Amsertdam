"use client";

import Link from "next/link";
import { ArrowLeft, CheckCircle2, MessagesSquare, XCircle } from "lucide-react";
import { use } from "react";

type Question = {
  id: string;
  question: string;
  yourAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
};

export default function StudyCompanionReview({
  params,
}: {
  params: Promise<{ quizId: string }>;
}) {
  const { quizId } = use(params);

  const questions: Question[] = [
    {
      id: "1",
      question:
        "Which data structure uses Last-In-First-Out (LIFO) ordering?",
      yourAnswer: "B. Stack",
      correctAnswer: "B. Stack",
      isCorrect: true,
    },
    {
      id: "2",
      question: "Which traversal visits the root node first?",
      yourAnswer: "A. Pre-order",
      correctAnswer: "A. Pre-order",
      isCorrect: true,
    },
    {
      id: "3",
      question: "What is the time complexity of binary search?",
      yourAnswer: "A. O(n)",
      correctAnswer: "A. O(log n)",
      isCorrect: false,
    },
  ];

  return (
    <div className="min-h-screen bg-white px-14.75 py-11.5">
      {/* Top bar */}
      <div className="flex justify-between items-center mb-8">
        <Link
          href="/study-companion"
          className="flex items-center gap-2 text-gray-primary hover:text-black-primary transition-colors"
        >
          <ArrowLeft size={18} />
          <span className="text-sm">Back to Study Companion</span>
        </Link>
        <Link
          href={`/study-companion/${quizId}/chat`}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-primary text-white rounded-lg hover:bg-indigo-600 transition-colors text-sm font-medium"
        >
          <MessagesSquare size={16} />
          Chat with AI
        </Link>
      </div>

      {/* Title */}
      <div className="mb-10">
        <h1 className="text-[28px] font-semibold text-black-primary mb-2">
          Algorithms Midterm Practice
        </h1>
        <p className="text-gray-primary">
          2/3 correct &bull; Algorithms & Data Structures
        </p>
      </div>

      {/* Question list */}
      <div className="space-y-4">
        {questions.map((q, idx) => (
          <div
            key={q.id}
            className="bg-white border border-gray-200 rounded-xl p-5"
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5 shrink-0">
                {q.isCorrect ? (
                  <CheckCircle2 size={20} className="text-green-500" />
                ) : (
                  <XCircle size={20} className="text-red-500" />
                )}
              </div>
              <div className="flex-1">
                <h3 className="text-base font-semibold text-black-primary mb-2">
                  Question {idx + 1}: {q.question}
                </h3>
                <p className="text-sm text-gray-primary mb-1">
                  Your answer: {q.yourAnswer}
                </p>
                {!q.isCorrect && (
                  <p className="text-sm text-green-600 font-medium">
                    Correct: {q.correctAnswer}
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
