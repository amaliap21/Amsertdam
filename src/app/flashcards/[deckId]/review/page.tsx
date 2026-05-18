"use client";

import { ChevronLeft, ChevronRight, Lightbulb, Eye, EyeOff, Check } from "lucide-react";
import Link from "next/link";
import { use, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useStore, type ImageOcrRegion } from "@/store/use-store";

const COVER_COLORS = [
  "rgb(99, 102, 241)",   // 1  indigo
  "rgb(236, 72, 153)",   // 2  pink
  "rgb(16, 185, 129)",   // 3  emerald
  "rgb(245, 158, 11)",   // 4  amber
  "rgb(168, 85, 247)",   // 5  purple
  "rgb(14, 165, 233)",   // 6  sky
  "rgb(239, 68, 68)",    // 7  red
  "rgb(34, 197, 94)",    // 8  green
  "rgb(59, 130, 246)",   // 9  blue
  "rgb(251, 146, 60)",   // 10 orange
  "rgb(217, 70, 239)",   // 11 fuchsia
  "rgb(20, 184, 166)",   // 12 teal
  "rgb(234, 179, 8)",    // 13 yellow
  "rgb(244, 63, 94)",    // 14 rose
  "rgb(132, 204, 22)",   // 15 lime
  "rgb(6, 182, 212)",    // 16 cyan
  "rgb(139, 92, 246)",   // 17 violet
  "rgb(249, 115, 22)",   // 18 deep orange
  "rgb(236, 72, 113)",   // 19 crimson
  "rgb(56, 189, 248)",   // 20 light blue
  "rgb(180, 83, 9)",     // 21 brown
  "rgb(71, 85, 105)",    // 22 slate
  "rgb(190, 18, 60)",    // 23 ruby
  "rgb(5, 150, 105)",    // 24 green-600
  "rgb(79, 70, 229)",    // 25 indigo-600
  "rgb(219, 39, 119)",   // 26 pink-600
  "rgb(202, 138, 4)",    // 27 yellow-600
  "rgb(220, 38, 38)",    // 28 red-600
  "rgb(37, 99, 235)",    // 29 blue-600
  "rgb(147, 51, 234)",   // 30 purple-600
  "rgb(234, 88, 12)",    // 31 orange-600
  "rgb(13, 148, 136)",   // 32 teal-600
  "rgb(101, 163, 13)",   // 33 lime-600
  "rgb(8, 145, 178)",    // 34 cyan-600
  "rgb(162, 28, 175)",   // 35 fuchsia-700
  "rgb(225, 29, 72)",    // 36 rose-600
  "rgb(21, 128, 61)",    // 37 green-700
  "rgb(67, 56, 202)",    // 38 indigo-700
  "rgb(194, 65, 12)",    // 39 orange-700
  "rgb(161, 98, 7)",     // 40 amber-700
  "rgb(185, 28, 28)",    // 41 red-700
  "rgb(29, 78, 216)",    // 42 blue-700
  "rgb(126, 34, 206)",   // 43 purple-700
  "rgb(15, 118, 110)",   // 44 teal-700
  "rgb(77, 124, 15)",    // 45 lime-700
  "rgb(14, 116, 144)",   // 46 cyan-700
  "rgb(134, 25, 143)",   // 47 fuchsia-800
  "rgb(190, 24, 93)",    // 48 pink-700
  "rgb(22, 101, 52)",    // 49 green-800
  "rgb(55, 48, 163)",    // 50 indigo-800
  "rgb(154, 52, 18)",    // 51 orange-800
  "rgb(146, 64, 14)",    // 52 amber-800
  "rgb(153, 27, 27)",    // 53 red-800
  "rgb(30, 64, 175)",    // 54 blue-800
  "rgb(107, 33, 168)",   // 55 purple-800
  "rgb(17, 94, 89)",     // 56 teal-800
  "rgb(63, 98, 18)",     // 57 lime-800
  "rgb(21, 94, 117)",    // 58 cyan-800
  "rgb(112, 26, 117)",   // 59 fuchsia-900
  "rgb(157, 23, 77)",    // 60 pink-800
  "rgb(74, 222, 128)",   // 61 green-400
  "rgb(129, 140, 248)",  // 62 indigo-400
  "rgb(251, 191, 36)",   // 63 amber-400
  "rgb(248, 113, 113)",  // 64 red-400
  "rgb(96, 165, 250)",   // 65 blue-400
  "rgb(192, 132, 252)",  // 66 purple-400
  "rgb(45, 212, 191)",   // 67 teal-400
  "rgb(163, 230, 53)",   // 68 lime-400
  "rgb(34, 211, 238)",   // 69 cyan-400
  "rgb(232, 121, 249)",  // 70 fuchsia-400
  "rgb(244, 114, 182)",  // 71 pink-400
  "rgb(253, 186, 116)",  // 72 orange-300
  "rgb(252, 211, 77)",   // 73 yellow-400
  "rgb(110, 231, 183)",  // 74 emerald-300
  "rgb(165, 180, 252)",  // 75 indigo-300
  "rgb(253, 164, 175)",  // 76 rose-300
  "rgb(134, 239, 172)",  // 77 green-300
  "rgb(196, 181, 253)",  // 78 violet-300
  "rgb(252, 165, 165)",  // 79 red-300
  "rgb(147, 197, 253)",  // 80 blue-300
  "rgb(94, 234, 212)",   // 81 teal-300
  "rgb(190, 242, 100)",  // 82 lime-300
  "rgb(103, 232, 249)",  // 83 cyan-300
  "rgb(240, 171, 252)",  // 84 fuchsia-300
  "rgb(249, 168, 212)",  // 85 pink-300
  "rgb(253, 230, 138)",  // 86 amber-300
  "rgb(252, 141, 98)",   // 87 orange-400
  "rgb(167, 139, 250)",  // 88 violet-400
  "rgb(74, 232, 201)",   // 89 emerald-400
  "rgb(250, 204, 21)",   // 90 yellow-500
  "rgb(120, 53, 15)",    // 91 orange-900
  "rgb(113, 63, 18)",    // 92 amber-900
  "rgb(127, 29, 29)",    // 93 red-900
  "rgb(30, 58, 138)",    // 94 blue-900
  "rgb(88, 28, 135)",    // 95 purple-900
  "rgb(19, 78, 74)",     // 96 teal-900
  "rgb(54, 83, 20)",     // 97 lime-900
  "rgb(22, 78, 99)",     // 98 cyan-900
  "rgb(86, 20, 89)",     // 99 fuchsia-950
  "rgb(131, 24, 67)",    // 100 pink-900
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
  const [allRevealed, setAllRevealed] = useState(false);
  const [highlighted, setHighlighted] = useState<number | null>(null);
  const [guesses, setGuesses] = useState<Record<number, string>>({});
  const [checked, setChecked] = useState(false);

  // Label mode = multi-character labels (from Claude Vision).
  // Character mode = single chars (from old Python OCR).
  const isLabelMode = useMemo(
    () => regions.some((r) => r.char.length > 1),
    [regions],
  );

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
    setHighlighted(idx);
    setRevealed((prev) => {
      const next = new Set(prev);
      next.add(idx);
      return next;
    });
    const el = regionRefs.current[idx];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    window.setTimeout(() => setHighlighted(null), 1500);
  };

  const isCorrect = (idx: number) => {
    const guess = (guesses[idx] || "").trim().toLowerCase();
    const answer = regions[idx].char.trim().toLowerCase();
    return guess === answer;
  };

  const correctCount = useMemo(() => {
    if (!checked) return 0;
    return regions.filter((_, idx) => isCorrect(idx)).length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checked, guesses, regions]);

  const handleCheck = () => {
    setChecked(true);
    // Auto-reveal correct answers
    setRevealed((prev) => {
      const next = new Set(prev);
      regions.forEach((_, idx) => {
        if (isCorrect(idx)) next.add(idx);
      });
      return next;
    });
  };

  const handleReset = () => {
    setRevealed(new Set());
    setAllRevealed(false);
    setGuesses({});
    setChecked(false);
    setHighlighted(null);
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
          {allRevealed ? regions.length : revealed.size} / {regions.length}{" "}
          revealed
        </span>
      </div>

      <div className="text-center mb-8">
        <h1 className="text-[28px] font-semibold text-indigo-primary mb-2">
          {title}
        </h1>
        <p className="text-gray-primary">{description}</p>
        <p className="text-xs text-gray-400 mt-2">
          {isLabelMode
            ? "Type your guesses for each numbered label below, then click Check Answers. Click a box on the image to peek."
            : "Click a colored box to peek under it. Or type what you see below and reveal everything at once."}
        </p>
      </div>

      <div
        className="mx-auto mb-8"
        style={{ maxWidth: Math.min(width, 1200) }}
      >
        <div
          className="relative w-full overflow-hidden rounded-xl border border-gray-200"
          style={{ aspectRatio: `${width} / ${height}` }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageDataUrl}
            alt="Source"
            className="absolute inset-0 w-full h-full object-fill"
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
                aria-label={
                  isRevealed ? "Hide label" : `Reveal label ${idx + 1}`
                }
                className={`absolute transition-opacity duration-150 hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-white flex items-center justify-center ${
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
              >
                {!isRevealed && isLabelMode && (
                  <span
                    className="text-white font-bold drop-shadow-md select-none"
                    style={{ fontSize: "clamp(8px, 1.2vw, 14px)" }}
                  >
                    {idx + 1}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Label mode: per-label guess inputs */}
      {isLabelMode ? (
        <div className="max-w-2xl mx-auto bg-indigo-50 border border-indigo-100 rounded-xl p-6">
          <p className="text-sm font-medium text-black-primary mb-4">
            Name each labeled part
          </p>
          <div className="space-y-3 mb-4">
            {regions.map((region, idx) => {
              const color = COVER_COLORS[idx % COVER_COLORS.length];
              const correct = checked && isCorrect(idx);
              const wrong = checked && !isCorrect(idx);
              return (
                <div key={idx} className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => jumpToRegion(idx)}
                    className="w-7 h-7 rounded-md flex items-center justify-center text-white text-xs font-bold shrink-0 hover:scale-110 transition-transform"
                    style={{ backgroundColor: color }}
                    title={`Jump to label ${idx + 1}`}
                  >
                    {idx + 1}
                  </button>
                  <input
                    type="text"
                    value={guesses[idx] || ""}
                    onChange={(e) => {
                      setGuesses((prev) => ({
                        ...prev,
                        [idx]: e.target.value,
                      }));
                      if (checked) setChecked(false);
                    }}
                    placeholder={`Label ${idx + 1}…`}
                    className={`flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-primary text-black-primary placeholder:text-gray-400 ${
                      correct
                        ? "border-green-400 bg-green-50"
                        : wrong
                          ? "border-red-300 bg-red-50"
                          : "border-gray-300 bg-white"
                    }`}
                  />
                  {correct && (
                    <Check size={16} className="text-green-600 shrink-0" />
                  )}
                  {wrong && (
                    <span className="text-xs text-red-500 shrink-0 max-w-[120px] truncate">
                      {region.char}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          {checked && (
            <p className="text-sm text-gray-700 mb-3">
              {correctCount} / {regions.length} correct
            </p>
          )}
          <div className="flex gap-3 flex-wrap">
            <button
              type="button"
              onClick={handleCheck}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-primary text-white rounded-lg hover:bg-indigo-600 transition-colors text-sm"
            >
              <Check size={16} />
              Check Answers
            </button>
            <button
              type="button"
              onClick={() => setAllRevealed((v) => !v)}
              className="flex items-center gap-2 px-4 py-2 border border-indigo-primary text-indigo-primary rounded-lg hover:bg-indigo-50 transition-colors text-sm"
            >
              {allRevealed ? <EyeOff size={16} /> : <Eye size={16} />}
              {allRevealed ? "Hide All" : "Reveal All"}
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="px-4 py-2 border border-gray-300 text-gray-primary rounded-lg hover:bg-gray-50 transition-colors text-sm"
            >
              Reset
            </button>
          </div>
        </div>
      ) : (
        /* Character mode: legacy single-input UI */
        <CharacterModePanel
          regions={regions}
          revealed={revealed}
          setRevealed={setRevealed}
          allRevealed={allRevealed}
          setAllRevealed={setAllRevealed}
          jumpToRegion={jumpToRegion}
        />
      )}
    </div>
  );
}

/** Legacy character-level input panel (from old Python OCR decks). */
function CharacterModePanel({
  regions,
  revealed,
  setRevealed,
  allRevealed,
  setAllRevealed,
  jumpToRegion,
}: {
  regions: ImageOcrRegion[];
  revealed: Set<number>;
  setRevealed: React.Dispatch<React.SetStateAction<Set<number>>>;
  allRevealed: boolean;
  setAllRevealed: React.Dispatch<React.SetStateAction<boolean>>;
  jumpToRegion: (idx: number) => void;
}) {
  const [guess, setGuess] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
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

  return (
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
                Perfect — {score.hits} / {score.total} (jump to a card)
              </span>
            ) : (
              <span>
                {score.hits} / {score.total} characters match so far (jump to a
                card)
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
                    const isRev = allRevealed || revealed.has(idx);
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setPickerOpen(false);
                          jumpToRegion(idx);
                        }}
                        className={`h-9 rounded-md text-xs font-semibold border transition-colors ${
                          isRev
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
