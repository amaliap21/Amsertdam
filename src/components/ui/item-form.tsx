"use client";

import { X, ChevronUp, ChevronDown, CirclePlus } from "lucide-react";
import React, { useState } from "react";

type ItemFormProps = {
  assessmentName: string;
  assessmentWeight: number;
  onSubmit: (item: { name: string; weight: number; score?: number }) => void;
  onCancel: () => void;
};

export default function ItemForm({
  assessmentName,
  assessmentWeight,
  onSubmit,
  onCancel,
}: ItemFormProps) {
  const [name, setName] = useState("");
  const [weight, setWeight] = useState<number | "">("");
  const [mark, setMark] = useState<number | "">("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const w = Number(weight) || 0;
    if (w > assessmentWeight) {
      alert(
        `Weight ${w}% exceeds the remaining capacity of ${assessmentWeight}% for this assessment.`,
      );
      return;
    }
    onSubmit({
      name,
      weight: w,
      score: mark !== "" ? Number(mark) : undefined,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-1.5 sm:items-center sm:p-4"
      style={{ background: "rgba(0, 0, 0, 0.64)" }}
      onClick={onCancel}
    >
      <div
        className="relative w-[calc(100vw-0.5rem)] max-w-[20.5rem] max-h-[90dvh] overflow-y-auto rounded-2xl bg-white px-2.5 pb-2.5 pt-9 shadow-xl sm:w-full sm:max-w-lg sm:px-6 sm:pb-6 sm:pt-6"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onCancel}
          className="absolute right-3 top-3 text-gray-400 transition-colors hover:text-gray-600 sm:right-6 sm:top-6"
        >
          <X size={20} />
        </button>

        <div className="mb-4 sm:mb-6">
          <h2 className="mb-1 text-base font-medium text-black-primary sm:text-lg">
            Add New Item
          </h2>
          <p className="mt-1 text-xs text-gray-primary sm:text-sm">
            Enter the item detail below for{" "}
            <span className="font-medium text-black-primary">
              {assessmentName}
            </span>
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 sm:gap-5">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-black-primary sm:text-sm">
              Item Name<span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="e.g., Project 1"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-[#b1b1b1] px-3 py-2 text-sm text-black-primary placeholder:text-gray-primary focus:border-transparent focus:outline-none focus:ring-2 focus:ring-indigo-primary sm:px-4 sm:py-2.5"
              required
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-black-primary sm:text-sm">
              Weight<span className="text-red-500">*</span>
            </label>
            <div className="flex items-center justify-between rounded-xl border border-[#b1b1b1] px-3 py-2.5 focus-within:border-transparent focus-within:ring-2 focus-within:ring-indigo-primary sm:px-4">
              <input
                type="number"
                min={0}
                max={assessmentWeight}
                placeholder="0"
                value={weight}
                onChange={(e) =>
                  setWeight(e.target.value === "" ? "" : Number(e.target.value))
                }
                className="w-full appearance-none text-sm text-gray-primary focus:outline-none"
                required
              />
              <span className="whitespace-nowrap text-sm font-medium text-black-primary">
                / {assessmentWeight}%
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-black-primary sm:text-sm">
              Mark
            </label>
            <div className="flex items-center justify-between rounded-xl border border-[#b1b1b1] px-3 py-2.5 focus-within:border-transparent focus-within:ring-2 focus-within:ring-indigo-primary sm:px-4">
              <input
                type="number"
                min={0}
                max={100}
                placeholder="0"
                value={mark}
                onChange={(e) =>
                  setMark(e.target.value === "" ? "" : Number(e.target.value))
                }
                className="w-full appearance-none text-sm text-gray-primary focus:outline-none"
              />
              <div className="flex shrink-0 flex-col">
                <button
                  type="button"
                  onClick={() =>
                    setMark((prev) => Math.min(100, Number(prev) + 1))
                  }
                  className="leading-none text-gray-primary transition-colors hover:text-black-primary"
                >
                  <ChevronUp size={16} />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setMark((prev) => Math.max(0, Number(prev) - 1))
                  }
                  className="leading-none text-gray-primary transition-colors hover:text-black-primary"
                >
                  <ChevronDown size={16} />
                </button>
              </div>
            </div>
          </div>

          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-primary py-2.5 text-sm text-white transition-colors hover:bg-indigo-500"
          >
            <CirclePlus size={20} />
            Add Item
          </button>
        </form>
      </div>
    </div>
  );
}
