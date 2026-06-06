"use client";

import { useEffect, useState } from "react";
import { Sprout, Flame, Check } from "lucide-react";

/**
 * Kaizen card: one small improvement a day.
 *
 * Kaizen is the practice of tiny, continuous improvement. Each day the student
 * sets one small "1% better" goal and checks it off. A streak rewards
 * consistency over intensity, which fits RealTrack's anti-burnout stance.
 *
 * Stored locally (per device) so it needs no backend.
 */

type KaizenState = { date: string; goal: string; done: boolean; streak: number; lastDone: string };

const KEY = "realtrack-kaizen";
const today = () => new Date().toISOString().slice(0, 10);

function load(): KaizenState {
  if (typeof window === "undefined") return { date: today(), goal: "", done: false, streak: 0, lastDone: "" };
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "{}") as Partial<KaizenState>;
    const t = today();
    // New day resets the goal/done, but keeps the streak.
    if (raw.date !== t) return { date: t, goal: "", done: false, streak: raw.streak ?? 0, lastDone: raw.lastDone ?? "" };
    return { date: t, goal: raw.goal ?? "", done: raw.done ?? false, streak: raw.streak ?? 0, lastDone: raw.lastDone ?? "" };
  } catch {
    return { date: today(), goal: "", done: false, streak: 0, lastDone: "" };
  }
}

function yesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

export default function KaizenCard() {
  const [state, setState] = useState<KaizenState>(() => ({ date: today(), goal: "", done: false, streak: 0, lastDone: "" }));
  const [draft, setDraft] = useState("");

  // Hydration-safe: render defaults on the server, then load the persisted
  // state from localStorage once on the client.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const s = load();
    setState(s);
    setDraft(s.goal);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const persist = (next: KaizenState) => {
    setState(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
  };

  const saveGoal = () => {
    const goal = draft.trim();
    if (!goal) return;
    persist({ ...state, goal });
  };

  const toggleDone = () => {
    if (!state.goal) return;
    if (!state.done) {
      // Completing today: bump the streak (continue if yesterday was done).
      const streak = state.lastDone === yesterday() ? state.streak + 1 : 1;
      persist({ ...state, done: true, streak, lastDone: today() });
    } else {
      // Undo today's completion.
      const streak = Math.max(0, state.streak - 1);
      persist({ ...state, done: false, streak, lastDone: state.lastDone === today() ? "" : state.lastDone });
    }
  };

  return (
    <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-5">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-emerald-700">
          <Sprout size={18} />
          <span className="text-sm font-semibold">Kaizen, get 1% better today</span>
        </div>
        {state.streak > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">
            <Flame size={13} /> {state.streak} day streak
          </span>
        )}
      </div>

      {!state.goal ? (
        <div className="flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") saveGoal(); }}
            placeholder="One small improvement, for example review 5 cards"
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-400"
          />
          <button onClick={saveGoal} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">Set</button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <p className={`text-sm ${state.done ? "text-gray-400 line-through" : "text-black-primary"}`}>{state.goal}</p>
          <button
            onClick={toggleDone}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${state.done ? "bg-emerald-600 text-white" : "border border-emerald-600 text-emerald-700 hover:bg-emerald-50"}`}
          >
            <Check size={15} /> {state.done ? "Done today" : "Mark done"}
          </button>
        </div>
      )}
      {state.goal && (
        <button onClick={() => { persist({ ...state, goal: "", done: false }); setDraft(""); }} className="mt-2 text-xs text-emerald-700 hover:underline">
          Change today&apos;s goal
        </button>
      )}
    </div>
  );
}
