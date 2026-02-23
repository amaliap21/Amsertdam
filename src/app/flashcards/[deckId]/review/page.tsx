"use client";

import { ChevronLeft, ChevronRight, Lightbulb } from "lucide-react";
import Link from "next/link";
import { use, useState } from "react";
import Image from "next/image";

type Flashcard = {
  id: string;
  question: string;
  answer: string;
  hint?: string;
};

type Deck = {
  id: string;
  title: string;
  description: string;
  cards: Flashcard[];
};

export default function FlashcardReview({
  params,
}: {
  params: Promise<{ deckId: string }>;
}) {
  const { deckId } = use(params);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [showHint, setShowHint] = useState(false);

  // Dummy data
  const deck: Deck = {
    id: deckId,
    title: "Database Terms",
    description: "SQL and relational database vocabulary",
    cards: [
      {
        id: "1",
        question:
          "A table column that uniquely identifies each record is called a...",
        answer: "primary key",
        hint: "It's a two-word term that starts with 'p'",
      },
      {
        id: "2",
        question: "What does SQL stand for?",
        answer: "Structured Query Language",
        hint: "It's related to structured data querying",
      },
      {
        id: "3",
        question:
          "A relationship between tables where one record in table A can relate to many records in table B is called...",
        answer: "one-to-many relationship",
        hint: "Think about the cardinality between tables",
      },
      {
        id: "4",
        question: "What does CRUD stand for in database operations?",
        answer: "Create, Read, Update, Delete",
        hint: "Four basic operations on data",
      },
      {
        id: "5",
        question:
          "A constraint that ensures values in a column match values in another table is called...",
        answer: "foreign key",
        hint: "It references another table's primary key",
      },
    ],
  };

  const currentCard = deck.cards[currentCardIndex];
  const totalCards = deck.cards.length;

  const handleNext = () => {
    if (currentCardIndex < totalCards - 1) {
      setCurrentCardIndex(currentCardIndex + 1);
      setShowAnswer(false);
      setShowHint(false);
    }
  };

  const handlePrevious = () => {
    if (currentCardIndex > 0) {
      setCurrentCardIndex(currentCardIndex - 1);
      setShowAnswer(false);
      setShowHint(false);
    }
  };

  const formatAnswerBlanks = (answer: string) => {
    return answer
      .split(" ")
      .map((word) => "_".repeat(word.length))
      .join("    ");
  };

  return (
    <div className="min-h-screen bg-white px-14.75 py-11.5">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <Link
          href="/flashcards"
          className="flex items-center gap-2 text-gray-primary hover:text-black-primary transition-colors"
        >
          <ChevronLeft size={18} />
          <span className="text-sm">Back to Decks</span>
        </Link>
        <span className="text-sm text-gray-primary">
          {currentCardIndex + 1} / {totalCards}
        </span>
      </div>

      {/* Deck Title */}
      <div className="text-center mb-12">
        <h1 className="text-[28px] font-semibold text-indigo-primary mb-2">
          {deck.title}
        </h1>
        <p className="text-gray-primary">{deck.description}</p>
      </div>

      {/* Flashcard */}
      <div className="max-w-3xl mx-auto">
        <div className="bg-white border border-gray-200 rounded-2xl p-12 mb-8 min-h-[280px] flex flex-col justify-center">
          {/* Question */}
          <p className="text-lg text-black-primary text-center mb-8">
            {currentCard.question}
          </p>

          {/* Answer Section */}
          <div
            className="bg-indigo-50 rounded-xl p-6 cursor-pointer hover:bg-indigo-100 transition-colors"
            onClick={() => setShowAnswer(!showAnswer)}
          >
            <p className="text-center text-2xl font-mono tracking-wider text-black-primary">
              {showAnswer ? currentCard.answer : formatAnswerBlanks(currentCard.answer)}
            </p>
          </div>

          {/* Hint Button */}
          {currentCard.hint && (
            <div className="mt-6 text-center">
              <button
                onClick={() => setShowHint(!showHint)}
                className="inline-flex items-center gap-2 text-sm text-gray-primary hover:text-indigo-primary transition-colors"
              >
                <Lightbulb size={16} />
                <span>Stuck? Get a hint (no penalty)</span>
              </button>
              {showHint && (
                <p className="mt-3 text-sm text-indigo-primary italic">
                  {currentCard.hint}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Mascot Message */}
        <div className="flex justify-center mb-8">
          <div className="flex items-center gap-3 bg-indigo-50 rounded-2xl px-3 max-w-[300px]">
            <Image
            src="/blue-girl.svg"
            alt="Mascot"
            width={64}
            height={64}
            className="w-full h-full"
            />
            <p className="text-sm text-gray-primary py-0">
              Take your time. No scores, no streaks.
            </p>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex justify-center items-center gap-4">
          <button
            onClick={handlePrevious}
            disabled={currentCardIndex === 0}
            className="p-2 text-gray-primary hover:text-black-primary transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft size={20} />
          </button>
          <span className="text-sm text-gray-primary">Navigate cards</span>
          <button
            onClick={handleNext}
            disabled={currentCardIndex === totalCards - 1}
            className="p-2 text-gray-primary hover:text-black-primary transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}
