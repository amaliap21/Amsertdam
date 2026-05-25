"use client";

import React from "react";

export type Language = "en" | "id";

type Props = {
  value: Language;
  onChange: (lang: Language) => void;
  disabled?: boolean;
  label?: string;
};

// Inline SVG flags, keeps the bundle small (no asset round-trip) and renders
// reliably on every OS, unlike 🇮🇩 / 🇬🇧 emoji which Windows browsers drop to
// "ID" / "GB" text.

function FlagIndonesia({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 6 4"
      className={className}
      aria-hidden="true"
      preserveAspectRatio="none"
    >
      <rect width="6" height="2" fill="#E70011" />
      <rect y="2" width="6" height="2" fill="#FFFFFF" />
    </svg>
  );
}

function FlagUk({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 60 30"
      className={className}
      aria-hidden="true"
      preserveAspectRatio="none"
    >
      <clipPath id="lp-uk-clip">
        <path d="M0,0 v30 h60 v-30 z" />
      </clipPath>
      <path d="M0,0 v30 h60 v-30 z" fill="#012169" />
      <path
        d="M0,0 L60,30 M60,0 L0,30"
        stroke="#fff"
        strokeWidth="6"
        clipPath="url(#lp-uk-clip)"
      />
      <path
        d="M0,0 L60,30 M60,0 L0,30"
        stroke="#C8102E"
        strokeWidth="4"
        clipPath="url(#lp-uk-clip)"
      />
      <path d="M30,0 v30 M0,15 h60" stroke="#fff" strokeWidth="10" />
      <path d="M30,0 v30 M0,15 h60" stroke="#C8102E" strokeWidth="6" />
    </svg>
  );
}

const OPTIONS: Array<{
  value: Language;
  label: string;
  Flag: (props: { className?: string }) => React.JSX.Element;
}> = [
  { value: "en", label: "English", Flag: FlagUk },
  { value: "id", label: "Bahasa Indonesia", Flag: FlagIndonesia },
];

export default function LanguagePicker({ value, onChange, disabled, label }: Props) {
  return (
    <div>
      {label && (
        <label className="block text-sm font-medium text-black-primary mb-3">
          {label}
        </label>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {OPTIONS.map(({ value: v, label: name, Flag }) => {
          const active = value === v;
          return (
            <button
              key={v}
              type="button"
              onClick={() => onChange(v)}
              disabled={disabled}
              aria-pressed={active}
              className={`flex items-center gap-3 rounded-xl border px-3.5 py-3 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed sm:px-4 ${
                active
                  ? "border-indigo-primary bg-indigo-primary/5 text-indigo-primary"
                  : "border-gray-300 bg-white text-black-primary hover:border-indigo-primary/40"
              }`}
            >
              <span className="block h-5 w-7 overflow-hidden rounded-sm border border-gray-200 shrink-0">
                <Flag className="block h-full w-full" />
              </span>
              {name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
