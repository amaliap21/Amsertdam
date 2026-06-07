"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Sprout, Flame, Check, Plus, X, Sparkles, Trash2, Loader2 } from "lucide-react";

/**
 * Kaizen floating tracker.
 *
 * A small icon pinned to the corner of the app. Click to expand a panel that
 * tracks your daily "1% better" micro-goals and progress, with a streak that
 * rewards consistency over intensity (fits RealTrack's anti-burnout stance).
 *
 * The "Suggest a goal" button uses a custom, deterministic algorithm (no LLM
 * cost): it reads your real tasks, at-risk courses, and flashcard decks and
 * proposes the most useful tiny next step.
 */

type Goal = { id: string; text: string; done: boolean };
type KaizenState = { date: string; goals: Goal[]; streak: number; lastCompleted: string };

const KEY = "realtrack-kaizen-v2";
const POS_KEY = "realtrack-kaizen-pos-v1";
const BTN = 56; // h-14 / w-14
const EDGE = 12; // keep this far from the viewport edges
const today = () => new Date().toISOString().slice(0, 10);

type Pos = { x: number; y: number };

const clampPos = (p: Pos): Pos => {
  if (typeof window === "undefined") return p;
  const maxX = window.innerWidth - BTN - EDGE;
  const maxY = window.innerHeight - BTN - EDGE;
  return {
    x: Math.min(Math.max(p.x, EDGE), Math.max(EDGE, maxX)),
    y: Math.min(Math.max(p.y, EDGE), Math.max(EDGE, maxY)),
  };
};

const defaultPos = (): Pos => ({
  x: (typeof window === "undefined" ? 1024 : window.innerWidth) - BTN - 20,
  y: (typeof window === "undefined" ? 768 : window.innerHeight) - BTN - 20,
});

function loadPos(): Pos {
  if (typeof window === "undefined") return defaultPos();
  try {
    const raw = JSON.parse(localStorage.getItem(POS_KEY) || "null");
    if (raw && typeof raw.x === "number" && typeof raw.y === "number") {
      return clampPos(raw);
    }
  } catch {
    /* ignore */
  }
  return defaultPos();
}
const yesterday = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
};

function load(): KaizenState {
  const fallback: KaizenState = { date: today(), goals: [], streak: 0, lastCompleted: "" };
  if (typeof window === "undefined") return fallback;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "{}") as Partial<KaizenState>;
    const t = today();
    // New day: clear goals/done, keep the streak (and reset it if a day was missed).
    if (raw.date !== t) {
      const keepStreak = raw.lastCompleted === yesterday() ? raw.streak ?? 0 : 0;
      return { date: t, goals: [], streak: keepStreak, lastCompleted: raw.lastCompleted ?? "" };
    }
    return { date: t, goals: raw.goals ?? [], streak: raw.streak ?? 0, lastCompleted: raw.lastCompleted ?? "" };
  } catch {
    return fallback;
  }
}

export default function KaizenFab() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<KaizenState>({ date: today(), goals: [], streak: 0, lastCompleted: "" });
  const [draft, setDraft] = useState("");
  // AI suggestions are fetched in a batch and consumed one per click.
  const [pool, setPool] = useState<string[]>([]);
  const [suggesting, setSuggesting] = useState(false);

  // Free-drag position. `pos` is null until mounted (SSR-safe); once set, the
  // FAB is anchored by its top-left corner and the user can drag it anywhere.
  const [pos, setPos] = useState<Pos | null>(null);
  const [dragging, setDragging] = useState(false);
  // Drag bookkeeping kept in a ref so the window listeners always see fresh
  // values without re-subscribing. `moved` lets us tell a drag from a click.
  const drag = useRef({ startX: 0, startY: 0, origX: 0, origY: 0, moved: false });

  useEffect(() => { setState(load()); setPos(loadPos()); }, []);

  // Re-clamp if the window resizes so the FAB never strands off-screen.
  useEffect(() => {
    const onResize = () => setPos((p) => (p ? clampPos(p) : p));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // While dragging, track the pointer on the window so the drag continues even
  // if the cursor leaves the small button.
  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => {
      const dx = e.clientX - drag.current.startX;
      const dy = e.clientY - drag.current.startY;
      if (Math.abs(dx) + Math.abs(dy) > 4) drag.current.moved = true;
      setPos(clampPos({ x: drag.current.origX + dx, y: drag.current.origY + dy }));
    };
    const onUp = () => {
      setDragging(false);
      // A press that didn't move is a click: toggle the panel.
      if (!drag.current.moved) {
        setOpen((v) => !v);
      } else {
        setPos((p) => {
          if (p) {
            try { localStorage.setItem(POS_KEY, JSON.stringify(p)); } catch { /* ignore */ }
          }
          return p;
        });
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [dragging]);

  const onHandleDown = (e: React.PointerEvent) => {
    if (!pos) return;
    e.preventDefault();
    drag.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y, moved: false };
    setDragging(true);
  };

  const persist = (next: KaizenState) => {
    setState(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
  };

  const doneCount = state.goals.filter((g) => g.done).length;
  const total = state.goals.length;
  const pct = total ? Math.round((doneCount / total) * 100) : 0;

  const addGoal = (text: string) => {
    const t = text.trim();
    if (!t) return;
    persist({ ...state, goals: [...state.goals, { id: `g_${Date.now()}`, text: t, done: false }] });
    setDraft("");
  };

  const toggle = (id: string) => {
    const goals = state.goals.map((g) => (g.id === id ? { ...g, done: !g.done } : g));
    const anyDoneNow = goals.some((g) => g.done);
    const wasAnyDone = state.goals.some((g) => g.done);
    let streak = state.streak;
    let lastCompleted = state.lastCompleted;
    // First completion of the day bumps the streak; clearing the last one undoes it.
    if (anyDoneNow && !wasAnyDone) {
      streak = state.lastCompleted === yesterday() ? state.streak + 1 : 1;
      lastCompleted = today();
    } else if (!anyDoneNow && wasAnyDone) {
      streak = Math.max(0, state.streak - 1);
      lastCompleted = "";
    }
    persist({ ...state, goals, streak, lastCompleted });
  };

  const remove = (id: string) => persist({ ...state, goals: state.goals.filter((g) => g.id !== id) });

  // AI-suggested goals, derived from the user's tasks, flashcard decks, and
  // quizzes (Passing Target, Study Companion, and Community are excluded).
  // We fetch a batch and add one unused suggestion per click.
  const suggest = async () => {
    const have = new Set(state.goals.map((g) => g.text.toLowerCase()));
    let next = pool.find((s) => !have.has(s.toLowerCase()));
    if (!next) {
      setSuggesting(true);
      try {
        const r = await fetch("/api/ai/kaizen");
        const j = await r.json();
        const list: string[] = Array.isArray(j.goals) ? j.goals : [];
        setPool(list);
        next = list.find((s) => !have.has(s.toLowerCase())) ?? list[0];
      } catch {
        /* leave next undefined; nothing added */
      } finally {
        setSuggesting(false);
      }
    }
    if (next) addGoal(next);
  };

  // The chat page has its own fixed bottom input bar, so skip the FAB there.
  if (pathname?.includes("/study-companion/") && pathname.endsWith("/chat")) return null;

  // Anchor the whole widget by the button's top-left corner once we have a
  // position; before mount, fall back to the bottom-right corner.
  const containerStyle: React.CSSProperties = pos
    ? { left: pos.x, top: pos.y }
    : { right: 20, bottom: 20 };
  // Open the panel toward whichever side has room, based on the button's place
  // in the viewport, so it never spills off-screen wherever you drag it.
  const vw = typeof window !== "undefined" ? window.innerWidth : 1024;
  const vh = typeof window !== "undefined" ? window.innerHeight : 768;
  const openUp = pos ? pos.y > vh / 2 : true;
  const alignRight = pos ? pos.x > vw / 2 : true;
  const panelStyle: React.CSSProperties = {
    ...(openUp ? { bottom: BTN + 12 } : { top: BTN + 12 }),
    ...(alignRight ? { right: 0 } : { left: 0 }),
  };

  return (
    <div className="fixed z-40" style={containerStyle}>
      <div className="relative" style={{ width: BTN, height: BTN }}>
      {open && (
        <div className="absolute w-[min(92vw,22rem)] overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-xl" style={panelStyle}>
          {/* Header with progress */}
          <div className="bg-emerald-50 p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2 text-emerald-700">
                <Sprout size={18} />
                <span className="text-sm font-semibold">Kaizen, 1% better today</span>
              </div>
              {state.streak > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                  <Flame size={12} /> {state.streak}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-white">
                <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
              </div>
              <span className="text-xs font-medium text-emerald-700">{doneCount}/{total}</span>
            </div>
          </div>

          {/* Goals */}
          <div className="max-h-64 overflow-y-auto p-3">
            {state.goals.length === 0 && (
              <p className="px-1 py-4 text-center text-sm text-gray-400">No goals yet. Add one or let us suggest a tiny next step.</p>
            )}
            <ul className="flex flex-col gap-1.5">
              {state.goals.map((g) => (
                <li key={g.id} className="flex items-center gap-2 rounded-lg border border-gray-100 p-2">
                  <button onClick={() => toggle(g.id)} className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${g.done ? "border-emerald-600 bg-emerald-600 text-white" : "border-gray-300"}`}>
                    {g.done && <Check size={13} />}
                  </button>
                  <span className={`flex-1 text-sm ${g.done ? "text-gray-400 line-through" : "text-black-primary"}`}>{g.text}</span>
                  <button onClick={() => remove(g.id)} className="text-gray-300 hover:text-red-500"><Trash2 size={14} /></button>
                </li>
              ))}
            </ul>
          </div>

          {/* Add + suggest */}
          <div className="border-t border-gray-100 p-3">
            <div className="mb-2 flex gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addGoal(draft); }}
                placeholder="Add a small goal"
                className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-emerald-400"
              />
              <button onClick={() => addGoal(draft)} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-white hover:bg-emerald-700"><Plus size={16} /></button>
            </div>
            <button onClick={suggest} disabled={suggesting} className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-emerald-600 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50">
              {suggesting ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />} {suggesting ? "Thinking" : "Suggest a goal"}
            </button>
          </div>
        </div>
      )}

      {/* Floating toggle + drag handle. Press and move to reposition anywhere,
          press without moving to open/close. */}
      <button
        onPointerDown={onHandleDown}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
        aria-label="Kaizen goals, drag to move"
        title="Drag to move, click to open"
        data-tour="kaizen-fab"
        style={{ touchAction: "none", cursor: dragging ? "grabbing" : "grab" }}
        className={`relative flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg transition hover:bg-emerald-700 ${dragging ? "scale-105 ring-2 ring-emerald-300" : ""}`}
      >
        {open ? <X size={22} /> : <Sprout size={24} />}
        {!open && total > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1 text-[11px] font-bold text-white">
            {doneCount}/{total}
          </span>
        )}
      </button>
      </div>
    </div>
  );
}
