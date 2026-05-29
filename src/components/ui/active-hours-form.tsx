"use client";

import { X, Clock, Save } from "lucide-react";
import React, { useState } from "react";
import type { ActiveHours } from "@/store/use-store";

type ActiveHoursFormProps = {
  initial: ActiveHours;
  onSubmit: (hours: ActiveHours) => void;
  onCancel: () => void;
};

const HM_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;

function toMinutes(value: string): number | null {
  if (!HM_RE.test(value)) return null;
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

export default function ActiveHoursForm({
  initial,
  onSubmit,
  onCancel,
}: ActiveHoursFormProps) {
  const [start, setStart] = useState(initial.start);
  const [end, setEnd] = useState(initial.end);
  const [hasBreak, setHasBreak] = useState(
    Boolean(initial.breakStart && initial.breakEnd),
  );
  const [breakStart, setBreakStart] = useState(initial.breakStart ?? "12:00");
  const [breakEnd, setBreakEnd] = useState(initial.breakEnd ?? "13:00");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const sMin = toMinutes(start);
    const eMin = toMinutes(end);
    if (sMin == null || eMin == null) {
      setError("Use HH:MM (24-hour) for start and end.");
      return;
    }
    if (eMin <= sMin) {
      setError("End time must be after start time.");
      return;
    }
    if (hasBreak) {
      const bsMin = toMinutes(breakStart);
      const beMin = toMinutes(breakEnd);
      if (bsMin == null || beMin == null) {
        setError("Use HH:MM (24-hour) for the break.");
        return;
      }
      if (beMin <= bsMin) {
        setError("Break end must be after break start.");
        return;
      }
      if (bsMin < sMin || beMin > eMin) {
        setError("Break must sit inside your active window.");
        return;
      }
    }
    onSubmit({
      start,
      end,
      breakStart: hasBreak ? breakStart : null,
      breakEnd: hasBreak ? breakEnd : null,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4"
      style={{ background: "rgba(0, 0, 0, 0.64)" }}
      onClick={onCancel}
    >
      <div
        className="relative w-[calc(100vw-0.5rem)] max-w-[22rem] max-h-[90dvh] overflow-y-auto rounded-2xl bg-white px-4 pb-5 pt-9 shadow-xl sm:w-full sm:max-w-md sm:px-6 sm:pb-6 sm:pt-6"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onCancel}
          aria-label="Close"
          className="absolute right-3 top-3 text-gray-400 transition-colors hover:text-gray-600 sm:right-5 sm:top-5"
        >
          <X size={20} />
        </button>

        <div className="mb-4 flex items-start gap-3 sm:mb-5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-primary/10 text-indigo-primary">
            <Clock size={18} />
          </div>
          <div>
            <h2 className="text-base font-medium text-black-primary sm:text-lg">
              Set Active Hours
            </h2>
            <p className="mt-1 text-xs text-gray-primary sm:text-sm">
              The planner will only suggest study blocks inside this window.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <label className="text-xs font-medium text-black-primary sm:text-sm">
                Start
              </label>
              <input
                type="time"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="w-full rounded-xl border border-[#b1b1b1] px-3 py-2 text-sm text-black-primary focus:border-transparent focus:outline-none focus:ring-2 focus:ring-indigo-primary"
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs font-medium text-black-primary sm:text-sm">
                End
              </label>
              <input
                type="time"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="w-full rounded-xl border border-[#b1b1b1] px-3 py-2 text-sm text-black-primary focus:border-transparent focus:outline-none focus:ring-2 focus:ring-indigo-primary"
                required
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs text-black-primary sm:text-sm">
            <input
              type="checkbox"
              checked={hasBreak}
              onChange={(e) => setHasBreak(e.target.checked)}
              className="h-4 w-4 accent-indigo-primary"
            />
            Add a break (e.g. lunch)
          </label>

          {hasBreak && (
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-medium text-black-primary sm:text-sm">
                  Break start
                </label>
                <input
                  type="time"
                  value={breakStart}
                  onChange={(e) => setBreakStart(e.target.value)}
                  className="w-full rounded-xl border border-[#b1b1b1] px-3 py-2 text-sm text-black-primary focus:border-transparent focus:outline-none focus:ring-2 focus:ring-indigo-primary"
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-medium text-black-primary sm:text-sm">
                  Break end
                </label>
                <input
                  type="time"
                  value={breakEnd}
                  onChange={(e) => setBreakEnd(e.target.value)}
                  className="w-full rounded-xl border border-[#b1b1b1] px-3 py-2 text-sm text-black-primary focus:border-transparent focus:outline-none focus:ring-2 focus:ring-indigo-primary"
                />
              </div>
            </div>
          )}

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="mt-1 flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-primary py-2.5 text-sm text-white transition-colors hover:bg-indigo-500"
          >
            <Save size={16} />
            Save active hours
          </button>
        </form>
      </div>
    </div>
  );
}
