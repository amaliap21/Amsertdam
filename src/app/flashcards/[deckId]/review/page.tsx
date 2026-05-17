"use client";

import { ChevronLeft, ChevronRight, Lightbulb, Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { use, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useStore, type ImageOcrRegion } from "@/store/use-store";

const COVER_COLORS = [
  "rgba(99, 102, 241, 0.85)",
  "rgba(236, 72, 153, 0.85)",
  "rgba(16, 185, 129, 0.85)",
  "rgba(245, 158, 11, 0.85)",
  "rgba(168, 85, 247, 0.85)",
  "rgba(14, 165, 233, 0.85)",
];

function ImageCoverReveal({
  imageDataUrl,
  width,
  height,
  regions,
  title,
  description,
}: {
  imageDataUrl: string;
  width: number;
  height: number;
  regions: ImageOcrRegion[];
  title: string;
  description: string;
}) {
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [guess, setGuess] = useState("");
  const [allRevealed, setAllRevealed] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [highlighted, setHighlighted] = useState<number | null>(null);

  const groundTruth = useMemo(
    () => regions.map((r) => r.char).join(""),
    [regions],
  );

  const score = useMemo(() => {
    if (!groundTruth) return null;
    const g = guess.replace(/\s+/g, "").toLowerCase();
    const t = groundTruth.replace(/\s+/g, "").toLowerCase();
    if (!g) return null;
    let hits = 0;
    for (let i = 0; i < Math.min(g.length, t.length); i++) {
      if (g[i] === t[i]) hits++;
    }
    return { hits, total: t.length };
  }, [guess, groundTruth]);

  const toggleRegion = (idx: number) => {
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const regionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const jumpToRegion = (idx: number) => {
    setPickerOpen(false);
    setHighlighted(idx);
    // Reveal the picked region so the user can see what they jumped to.
    setRevealed((prev) => {
      const next = new Set(prev);
      next.add(idx);
      return next;
    });
    const el = regionRefs.current[idx];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    // Auto-clear the highlight ring after a brief pulse.
    window.setTimeout(() => setHighlighted(null), 1500);
  };

  return (
    <div className="min-h-screen bg-white px-14.75 py-11.5">
      <div className="flex justify-between items-center mb-8">
        <Link
          href="/flashcards"
          className="flex items-center gap-2 text-gray-primary hover:text-black-primary transition-colors"
        >
          <ChevronLeft size={18} />
          <span className="text-sm">Back to Decks</span>
        </Link>
        <span className="text-sm text-gray-primary">
          {allRevealed ? regions.length : revealed.size} / {regions.length} revealed
        </span>
      </div>

      <div className="text-center mb-8">
        <h1 className="text-[28px] font-semibold text-indigo-primary mb-2">
          {title}
        </h1>
        <p className="text-gray-primary">{description}</p>
        <p className="text-xs text-gray-400 mt-2">
          Click a colored box to peek under it. Or type what you see below and
          reveal everything at once.
        </p>
      </div>

      <div className="max-w-4xl mx-auto mb-8">
        <div
          className="relative w-full overflow-hidden rounded-xl border border-gray-200"
          style={{ aspectRatio: `${width} / ${height}` }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageDataUrl}
            alt="Source"
            className="absolute inset-0 w-full h-full object-contain"
          />
          {regions.map((region, idx) => {
            const [x, y, w, h] = region.bbox;
            const isRevealed = allRevealed || revealed.has(idx);
            const isHighlighted = highlighted === idx;
            const color = COVER_COLORS[idx % COVER_COLORS.length];
            return (
              <button
                key={idx}
                ref={(el) => {
                  regionRefs.current[idx] = el;
                }}
                type="button"
                onClick={() => toggleRegion(idx)}
                aria-label={isRevealed ? "Hide character" : "Reveal character"}
                className={`absolute transition-opacity duration-150 hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-white ${
                  isHighlighted ? "animate-pulse" : ""
                }`}
                style={{
                  left: `${(x / width) * 100}%`,
                  top: `${(y / height) * 100}%`,
                  width: `${(w / width) * 100}%`,
                  height: `${(h / height) * 100}%`,
                  background: isRevealed ? "transparent" : color,
                  border: isHighlighted
                    ? `3px solid #facc15`
                    : isRevealed
                      ? `2px solid ${color}`
                      : `2px solid rgba(255,255,255,0.8)`,
                  borderRadius: "4px",
                  cursor: "pointer",
                  boxShadow: isHighlighted
                    ? "0 0 12px 4px rgba(250, 204, 21, 0.7)"
                    : undefined,
                }}
              />
            );
          })}
        </div>
      </div>

      <div className="max-w-2xl mx-auto bg-indigo-50 border border-indigo-100 rounded-xl p-6">
        <label className="block text-sm font-medium text-black-primary mb-2">
          Your answer
        </label>
        <input
          type="text"
          value={guess}
          onChange={(e) => setGuess(e.target.value)}
          placeholder="Type what you see in the covered boxes…"
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-primary text-black-primary placeholder:text-gray-400"
        />
        {score && (
          <div className="mt-2 relative">
            <button
              type="button"
              onClick={() => setPickerOpen((v) => !v)}
              className="text-sm text-gray-primary underline-offset-2 hover:underline focus:outline-none focus:underline"
              aria-expanded={pickerOpen}
              aria-haspopup="dialog"
            >
              {score.hits === score.total ? (
                <span className="text-green-600 font-medium">
                  ✓ Perfect — {score.hits} / {score.total} (jump to a card)
                </span>
              ) : (
                <span>
                  {score.hits} / {score.total} characters match so far (jump to a card)
                </span>
              )}
            </button>
            {pickerOpen && (
              <>
                <button
                  type="button"
                  aria-label="Close jump picker"
                  className="fixed inset-0 z-10 cursor-default bg-transparent"
                  onClick={() => setPickerOpen(false)}
                />
                <div
                  role="dialog"
                  aria-label="Jump to card"
                  className="absolute left-0 right-0 mt-2 z-20 bg-white border border-gray-200 rounded-xl shadow-lg p-4 max-h-72 overflow-y-auto"
                >
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-medium text-gray-primary">
                      Pick a card to jump to ({regions.length} total)
                    </p>
                    <button
                      type="button"
                      onClick={() => setPickerOpen(false)}
                      className="text-xs text-indigo-primary hover:underline"
                    >
                      Close
                    </button>
                  </div>
                  <div className="grid grid-cols-8 gap-2">
                    {regions.map((_, idx) => {
                      const isRevealed = allRevealed || revealed.has(idx);
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => jumpToRegion(idx)}
                          className={`h-9 rounded-md text-xs font-semibold border transition-colors ${
                            isRevealed
                              ? "border-green-300 bg-green-50 text-green-700 hover:bg-green-100"
                              : "border-gray-300 bg-white text-black-primary hover:border-indigo-primary hover:text-indigo-primary"
                          }`}
                          aria-label={`Jump to card ${idx + 1}`}
                        >
                          {idx + 1}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={() => setAllRevealed((v) => !v)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-primary text-white rounded-lg hover:bg-indigo-600 transition-colors text-sm"
          >
            {allRevealed ? <EyeOff size={16} /> : <Eye size={16} />}
            {allRevealed ? "Hide All" : "Reveal All"}
          </button>
          <button
            type="button"
            onClick={() => {
              setRevealed(new Set());
              setAllRevealed(false);
              setGuess("");
            }}
            className="px-4 py-2 border border-gray-300 text-gray-primary rounded-lg hover:bg-gray-50 transition-colors text-sm"
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}

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

const STATIC_DECK: Omit<Deck, "id"> = {
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

export default function FlashcardReview({
  params,
}: {
  params: Promise<{ deckId: string }>;
}) {
  const { deckId } = use(params);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [showHint, setShowHint] = useState(false);

  const generatedDeck = useStore((s) =>
    s.decks.find((d) => d.id === deckId),
  );

  // Image-mode deck → cover-and-reveal UI.
  if (generatedDeck?.imageMode) {
    return (
      <ImageCoverReveal
        imageDataUrl={generatedDeck.imageMode.imageDataUrl}
        width={generatedDeck.imageMode.width}
        height={generatedDeck.imageMode.height}
        regions={generatedDeck.imageMode.regions}
        title={generatedDeck.title}
        description={generatedDeck.description}
      />
    );
  }

  const deck: Deck = generatedDeck
    ? {
        id: generatedDeck.id,
        title: generatedDeck.title,
        description: generatedDeck.description,
        cards: generatedDeck.cards.map((c) => ({
          id: c.id,
          question: c.question,
          answer: c.answer,
        })),
      }
    : { id: deckId, ...STATIC_DECK };

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

  const formatAnswerBlanks = (answer: string | undefined | null) => {
    if (typeof answer !== "string" || !answer.trim()) return "";
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
