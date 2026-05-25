"use client";

import { CirclePlus, Sparkles, Trash2 } from "lucide-react";
import { useState, useEffect } from "react";
import Link from "next/link";
import CreateFlashcardModal, {
  type GeneratedFlashcard,
  type ImageFlashcardPayload,
} from "@/components/ui/flashcard-form";
import { useStore } from "@/store/use-store";

export default function Flashcards() {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const decks = useStore((s) => s.decks);
  const addDeck = useStore((s) => s.addDeck);
  const fetchInitial = useStore((s) => s.fetchInitial);
  const removeDeck = useStore((s) => s.removeDeck);

  useEffect(() => {
    fetchInitial().catch(() => {});
  }, [fetchInitial]);

  const handleCreated = (
    data:
      | { deckName: string; cards: GeneratedFlashcard[] }
      | ImageFlashcardPayload,
  ) => {
    addDeck(data);
  };

  return (
    <div className="min-h-dvh bg-white px-4 sm:px-6 md:px-10 lg:px-14.75 py-6 md:py-11.5">
      {/* Header */}
      <div className="mb-12 flex flex-col lg:items-center gap-4 lg:flex-row lg:justify-between">
        <div>
          <h1 className="text-[28px] font-semibold text-black-primary mb-2">
            Flashcards
          </h1>
          <p className="text-gray-primary">
            Review and memorize key concepts without pressure
          </p>
        </div>
        <button
          data-tour="create-deck"
          onClick={() => setShowCreateModal(true)}
          className="self-auto inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-primary px-4 py-2.5 text-white transition-colors hover:bg-indigo-600"
        >
          <CirclePlus size={18} />
          Create Flashcard
        </button>
      </div>

      {/* Your Decks Section */}
      <div className="mb-6">
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-xl font-semibold text-black-primary">
            Your Decks
          </h2>
          <span className="text-sm text-gray-primary">
            {decks.length} elements
          </span>
        </div>

        {/* Deck Cards */}
        {decks.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 p-10 text-center">
            <Sparkles size={28} className="mx-auto text-indigo-primary mb-3" />
            <p className="text-sm text-black-primary font-medium mb-1">
              No flashcard decks yet
            </p>
            <p className="text-sm text-gray-primary">
              Click{" "}
              <span className="font-medium text-indigo-primary">
                Create Flashcard
              </span>{" "}
              to upload a PDF or image, we&apos;ll extract a deck for you.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {decks.map((deck) => (
              <div
                key={deck.id}
                className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-md transition-shadow"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                  <div className="w-16 h-16 shrink-0 rounded-lg bg-linear-to-br from-indigo-primary/20 to-purple-300/30 overflow-hidden flex items-center justify-center">
                    <Sparkles size={24} className="text-indigo-primary" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-base font-semibold text-black-primary truncate">
                        {deck.title}
                      </h3>
                      <span className="text-[10px] font-medium text-indigo-primary bg-indigo-primary/10 px-1.5 py-0.5 rounded">
                        Auto
                      </span>
                      <button
                        title="Delete deck"
                        onClick={async () => {
                          if (!confirm("Delete this deck?")) return;
                          await removeDeck(deck.id);
                        }}
                        className="ml-auto text-red-400 hover:text-red-600"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <p className="text-sm text-gray-primary line-clamp-2">
                      {deck.description}
                    </p>
                  </div>

                  <div className="flex flex-row items-center justify-between gap-3 sm:flex-col sm:items-center">
                    <div className="text-center">
                      <p className="text-2xl font-semibold text-black-primary">
                        {deck.cardCount}
                      </p>
                      <p className="text-xs text-gray-primary">Cards</p>
                    </div>
                    <Link
                      href={`/flashcards/${deck.id}/review`}
                      className="px-4 py-1.5 bg-indigo-primary text-white text-sm rounded-lg hover:bg-indigo-600 transition-colors"
                    >
                      Review
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Flashcard Modal */}
      <CreateFlashcardModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={handleCreated}
      />
    </div>
  );
}
