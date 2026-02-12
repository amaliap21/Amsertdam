"use client";

import { CirclePlus, Pencil } from "lucide-react";
import { useState } from "react";
import Image from "next/image";
import Link from "next/link";

type FlashcardDeck = {
  id: string;
  title: string;
  description: string;
  image: string;
  cardCount: number;
};

export default function Flashcards() {
  const [showCreateModal, setShowCreateModal] = useState(false);

  const decks: FlashcardDeck[] = [
    {
      id: "1",
      title: "Database Terms",
      description: "SQL and relational database vocabulary",
      image: "/database-deck.jpg",
      cardCount: 20,
    },
    {
      id: "2",
      title: "Data Structures",
      description: "Key concepts from data structures",
      image: "/data-structures-deck.jpg",
      cardCount: 15,
    },
  ];

  return (
    <div className="min-h-screen bg-white px-14.75 py-11.5">
      {/* Header */}
      <div className="flex justify-between items-start mb-12">
        <div>
          <h1 className="text-[28px] font-semibold text-black-primary mb-2">
            Flashcards
          </h1>
          <p className="text-gray-primary">
            Review and memorize key concepts without pressure
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-primary text-white rounded-lg hover:bg-indigo-600 transition-colors"
        >
          <CirclePlus size={18} />
          Create Flashcard
        </button>
      </div>

      {/* Your Decks Section */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold text-black-primary">
            Your Decks
          </h2>
          <span className="text-sm text-gray-primary">{decks.length} elements</span>
        </div>

        {/* Deck Cards */}
        <div className="grid grid-cols-2 gap-6">
          {decks.map((deck) => (
            <div
              key={deck.id}
              className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start gap-4">
                {/* Deck Image */}
                <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-gray-100">
                  <Image
                    src={deck.image}
                    alt={deck.title}
                    width={64}
                    height={64}
                    className="w-full h-full object-cover"
                  />
                </div>

                {/* Deck Info */}
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-base font-semibold text-black-primary">
                      {deck.title}
                    </h3>
                    <button className="text-gray-400 hover:text-gray-600 transition-colors">
                      <Pencil size={14} />
                    </button>
                  </div>
                  <p className="text-sm text-gray-primary">{deck.description}</p>
                </div>

                {/* Review Button & Card Count */}
                <div className="flex flex-col items-center gap-3">
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
      </div>
    </div>
  );
}
