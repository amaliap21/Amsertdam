"use client";

import { MODEL_OPTIONS } from "@/lib/ai/openrouter";

export const DEFAULT_MODEL_ID = MODEL_OPTIONS[0].id;

type ModelPickerProps = {
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  label?: string;
  hint?: string;
  /** Visual variant: "compact" for inline pills (review/chat), "form" for modals. */
  variant?: "compact" | "form";
  id?: string;
};

/**
 * Single source of truth for picking which OpenRouter model an AI call uses.
 * Premium models are marked with "(Premium)" — selecting one spends credits
 * (1 per generated flashcard/quiz question, or 1 per analysis/chat reply).
 * Free models are no-charge but rate-limited.
 */
export default function ModelPicker({
  value,
  onChange,
  disabled,
  label,
  hint,
  variant = "form",
  id,
}: ModelPickerProps) {
  if (variant === "compact") {
    return (
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-[11px] font-medium text-black-primary outline-none focus:border-indigo-primary disabled:opacity-50"
        title="Choose the AI model"
      >
        {MODEL_OPTIONS.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
            {m.tier === "premium" ? " (Premium)" : ""}
          </option>
        ))}
      </select>
    );
  }

  return (
    <div>
      {label && (
        <label
          htmlFor={id}
          className="mb-1 block text-[11px] font-medium text-black-primary sm:mb-3 sm:text-sm"
        >
          {label}
        </label>
      )}
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full rounded-xl border border-gray-300 bg-white px-2.5 py-2 text-[13px] text-black-primary focus:border-transparent focus:outline-none focus:ring-2 focus:ring-indigo-primary disabled:bg-gray-50 disabled:text-gray-400 sm:px-4 sm:py-3.5 sm:text-sm"
      >
        {MODEL_OPTIONS.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
            {m.tier === "premium" ? ", Premium (uses credits)" : ", Free"}
          </option>
        ))}
      </select>
      {hint && (
        <p className="mt-1.5 text-[11px] leading-tight text-gray-primary sm:text-sm">
          {hint}
        </p>
      )}
    </div>
  );
}
