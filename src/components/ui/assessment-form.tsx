"use client";
import { X, ChevronUp, ChevronDown, CirclePlus } from "lucide-react";
import React, { useState } from "react";

type AssessmentFormProps = {
  onSubmit: (assessment: {
    name: string;
    weight: number;
    score?: number;
  }) => void;
  onCancel: () => void;
  maxWeight?: number;
};

export default function AssessmentForm({
  onSubmit,
  onCancel,
  maxWeight = 100,
}: AssessmentFormProps) {
  const [name, setName] = useState("");
  const [weight, setWeight] = useState<number | "">("");
  const [mark, setMark] = useState<number | "">("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const w = Number(weight) || 0;
    if (w > maxWeight) {
      alert(
        `Weight ${w}% exceeds the remaining capacity of ${maxWeight}% for this course.`,
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
      className="fixed inset-0 flex items-end justify-center p-2 sm:items-center sm:p-4 z-50"
      style={{ background: "rgba(0, 0, 0, 0.64)" }}
    >
      <div className="relative w-[calc(100vw-0.5rem)] max-w-[20.5rem] max-h-[90dvh] overflow-y-auto rounded-2xl bg-white px-2.5 pb-2.5 pt-9 shadow-xl sm:w-full sm:max-w-lg sm:px-6 sm:pb-6 sm:pt-6">
        {/* Close button */}
        <button
          onClick={onCancel}
          className="absolute right-4 top-4 text-gray-400 transition-colors hover:text-gray-600 sm:right-6 sm:top-6.75"
        >
          <X size={20} />
        </button>

        <div className="px-4 pb-5 pt-6 sm:px-6 sm:pb-8.75 sm:pt-8.75">
          {/* Header */}
          <div className="mb-5">
            <h2 className="text-sm font-medium text-black-primary sm:text-base">
              Add New Assessment
            </h2>
            <p className="text-sm text-gray-primary mt-1.75">
              Enter the assessment detail below
            </p>
          </div>

          {/* Form */}
          <form
            onSubmit={handleSubmit}
            className="flex flex-col gap-4 sm:gap-5"
          >
            {/* Assessment Name */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-black-primary">
                Assessment Name<span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g., Project"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-[#b1b1b1] rounded-xl text-sm text-black-primary placeholder:text-gray-primary focus:outline-none focus:ring-2 focus:ring-indigo-primary focus:border-transparent sm:px-4"
                required
              />
            </div>

            {/* Weight */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-black-primary">
                Weight<span className="text-red-500">*</span>
              </label>
              <div className="flex items-center justify-between border border-[#b1b1b1] rounded-xl px-3.5 py-2.5 focus-within:ring-2 focus-within:ring-indigo-primary focus-within:border-transparent sm:px-4">
                <input
                  type="number"
                  min={0}
                  max={maxWeight}
                  placeholder="0"
                  value={weight}
                  onChange={(e) =>
                    setWeight(
                      e.target.value === "" ? "" : Number(e.target.value),
                    )
                  }
                  className="text-sm text-gray-primary w-full focus:outline-none appearance-none"
                  required
                />
                <span className="text-sm font-medium text-black-primary whitespace-nowrap">
                  / {maxWeight}%
                </span>
              </div>
            </div>

            {/* Mark */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-black-primary">
                Mark
              </label>
              <div className="flex items-center justify-between border border-[#b1b1b1] rounded-xl px-3.5 py-2.5 focus-within:ring-2 focus-within:ring-indigo-primary focus-within:border-transparent sm:px-4">
                <input
                  type="number"
                  min={0}
                  max={100}
                  placeholder="0"
                  value={mark}
                  onChange={(e) =>
                    setMark(e.target.value === "" ? "" : Number(e.target.value))
                  }
                  className="text-sm text-gray-primary w-full focus:outline-none appearance-none"
                />
                <div className="flex flex-col shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      setMark((prev) => Math.min(100, Number(prev) + 1))
                    }
                    className="text-gray-primary hover:text-black-primary transition-colors leading-none"
                  >
                    <ChevronUp size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setMark((prev) => Math.max(0, Number(prev) - 1))
                    }
                    className="text-gray-primary hover:text-black-primary transition-colors leading-none"
                  >
                    <ChevronDown size={16} />
                  </button>
                </div>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-primary py-2.5 text-sm text-white transition-colors hover:bg-indigo-500"
            >
              <CirclePlus size={20} />
              Add Assessment
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
