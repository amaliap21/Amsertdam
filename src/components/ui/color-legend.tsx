"use client";

/**
 * Explainable colour legend.
 *
 * RealTrack uses a red/yellow/green system across Task Value, Passing Target
 * and Dropout Risk. This component makes the colours *self-explanatory* — a
 * judge (or a stressed student) should never have to guess what "red" means.
 * Drop it next to any colour-coded list.
 */

export type LegendVariant = "priority" | "risk";

type LegendRow = { color: string; swatch: string; label: string; meaning: string };

const PRIORITY: LegendRow[] = [
  { color: "green", swatch: "bg-[#73C58F]", label: "Focus first", meaning: "High impact on your grade — worth your energy now." },
  { color: "yellow", swatch: "bg-[#E5B03D]", label: "If you have energy", meaning: "Helpful but flexible — scale back when you're tired." },
  { color: "red", swatch: "bg-[#E53D3D]", label: "Safe to minimize", meaning: "Low impact — protecting your wellbeing here is a valid choice." },
];

const RISK: LegendRow[] = [
  { color: "red", swatch: "bg-[#E53D3D]", label: "High risk", meaning: "On track to fall below your target — act this week." },
  { color: "yellow", swatch: "bg-[#E5B03D]", label: "Needs attention", meaning: "Drifting — one focused change keeps you on track." },
  { color: "green", swatch: "bg-[#73C58F]", label: "On track", meaning: "Comfortably on pace — protect this and rest." },
];

export default function ColorLegend({
  variant = "priority",
  className = "",
}: {
  variant?: LegendVariant;
  className?: string;
}) {
  const rows = variant === "risk" ? RISK : PRIORITY;
  return (
    <div className={`rounded-xl border border-gray-200 bg-white p-4 ${className}`}>
      <p className="mb-3 text-sm font-medium text-black-primary">
        What the colors mean
      </p>
      <ul className="flex flex-col gap-2.5">
        {rows.map((r) => (
          <li key={r.color} className="flex items-start gap-2.5">
            <span className={`mt-1 h-3 w-3 shrink-0 rounded-full ${r.swatch}`} aria-hidden />
            <p className="text-sm leading-snug text-gray-primary">
              <span className="font-semibold text-black-primary">{r.label}</span>
              {" — "}
              {r.meaning}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
