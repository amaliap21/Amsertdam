"use client";
import {
  X,
  CalendarDays,
  ChevronUp,
  ChevronDown,
  CirclePlus,
} from "lucide-react";
import React, { useState } from "react";
import { formatDate } from "@/lib/utils";

type ItemFormProps = {
  assessmentName: string;
  assessmentWeight: number;
  onSubmit: (item: {
    name: string;
    weight: number;
    score?: number;
    date?: string;
  }) => void;
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
  const [deadline, setDeadline] = useState("");
  const [mark, setMark] = useState<number | "">(0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      name,
      weight: Number(weight) || 0,
      score: mark !== "" ? Number(mark) : undefined,
      date: deadline ? formatDate(deadline) : undefined,
    });
  };

  return (
    <div
      className="fixed inset-0 flex justify-center items-center z-50"
      style={{ background: "rgba(0, 0, 0, 0.64)" }}
    >
      <div className="bg-white rounded-2xl shadow-lg w-127.75 relative">
        {/* Close button */}
        <button
          onClick={onCancel}
          className="absolute top-6.75 right-6 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X size={20} />
        </button>

        <div className="px-6 pt-8.75 pb-8.75">
          {/* Header */}
          <div className="mb-5">
            <h2 className="text-base font-medium text-black-primary">
              Add New Item
            </h2>
            <p className="text-sm text-gray-primary mt-1.75">
              Enter the item detail below for{" "}
              <span className="font-medium text-black-primary">
                {assessmentName}
              </span>
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            {/* Item Name */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-black-primary">
                Item Name<span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g., Project 1"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-2.5 border border-[#b1b1b1] rounded-xl text-sm text-black-primary placeholder:text-gray-primary focus:outline-none focus:ring-2 focus:ring-indigo-primary focus:border-transparent"
                required
              />
            </div>

            {/* Weight */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-black-primary">
                Weight<span className="text-red-500">*</span>
              </label>
              <div className="flex items-center justify-between border border-[#b1b1b1] rounded-xl px-4 py-2.5 focus-within:ring-2 focus-within:ring-indigo-primary focus-within:border-transparent">
                <input
                  type="number"
                  min={0}
                  max={assessmentWeight}
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
                  / {assessmentWeight}%
                </span>
              </div>
            </div>

            {/* Deadline */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-black-primary">
                Deadline
              </label>
              <div className="flex items-center gap-3 border border-[#b1b1b1] rounded-xl px-4 py-2.5 focus-within:ring-2 focus-within:ring-indigo-primary focus-within:border-transparent">
                <CalendarDays
                  size={20}
                  className="text-gray-primary shrink-0"
                />
                <input
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  className="text-sm text-gray-primary w-full focus:outline-none bg-transparent"
                />
              </div>
            </div>

            {/* Mark */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-black-primary">
                Mark
              </label>
              <div className="flex items-center justify-between border border-[#b1b1b1] rounded-xl px-4 py-2.5 focus-within:ring-2 focus-within:ring-indigo-primary focus-within:border-transparent">
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
              className="flex items-center justify-center gap-2 w-full py-2.5 bg-indigo-primary text-white text-sm rounded-lg hover:bg-indigo-500 transition-colors"
            >
              <CirclePlus size={20} />
              Add Item
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
