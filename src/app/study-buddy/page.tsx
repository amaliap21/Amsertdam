"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Users,
  Sparkles,
  Loader2,
  Video,
  HandHeart,
  GraduationCap,
  HeartHandshake,
} from "lucide-react";
import toast from "react-hot-toast";
import { useStore } from "@/store/use-store";

/**
 * Study Buddy — the engine-routed social slice.
 *
 * Differentiator vs. a generic study network: matches are driven by
 * RealTrack's own grade/priority data (who's strong where you're weak, who's
 * struggling in the same course this week), not by a follow graph. We run the
 * REAL /api/study-matching engine on the user's REAL courses against a pool of
 * peers. (The peer pool here is seeded demo data — a live cohort is the
 * documented next step; the matching logic and your own profile are real.)
 */

type CourseLite = { course: string; current_grade: number };

type Match = {
  user_id?: string;
  name: string;
  match_score: number;
  match_type: string;
  reasons: string[];
  shared_courses: string[];
  breakdown: {
    complement: number;
    shared_struggle: number;
    schedule: number;
    goal_alignment: number;
  };
};

type MatchResponse = {
  matches: Match[];
  summary: { evaluated: number; matched: number; best: string | null; headline: string };
};

const SLOTS = [
  "mon-am", "mon-pm", "tue-am", "tue-pm", "wed-am", "wed-pm",
  "thu-am", "thu-pm", "fri-am", "fri-pm", "sat-am", "sun-pm",
] as const;

// Seeded peer cohort. In production this is a live, opt-in query over other
// RealTrack students; the matching engine and the user's own profile are real.
const DEMO_CANDIDATES = [
  {
    user_id: "p1", name: "Budi", target_grade: 85, availability: ["mon-pm", "wed-pm", "tue-am"],
    courses: [
      { course: "Operating Systems", current_grade: 88 },
      { course: "Databases", current_grade: 61 },
    ],
  },
  {
    user_id: "p2", name: "Citra", target_grade: 80, availability: ["wed-pm", "sat-am", "fri-pm"],
    courses: [
      { course: "Operating Systems", current_grade: 59 },
      { course: "Databases", current_grade: 64 },
    ],
  },
  {
    user_id: "p3", name: "Dimas", target_grade: 82, availability: ["thu-pm", "sat-am"],
    courses: [
      { course: "Data Structures", current_grade: 90 },
      { course: "Computer Networks", current_grade: 68 },
    ],
  },
  {
    user_id: "p4", name: "Eka", target_grade: 78, availability: ["mon-pm", "fri-pm", "sun-pm"],
    courses: [
      { course: "Databases", current_grade: 86 },
      { course: "Operating Systems", current_grade: 72 },
    ],
  },
];

const matchIcon = (type: string) => {
  if (type.startsWith("Mentor")) return <GraduationCap size={16} />;
  if (type.startsWith("Mentee")) return <HandHeart size={16} />;
  if (type.startsWith("Study partner")) return <HeartHandshake size={16} />;
  return <Users size={16} />;
};

export default function StudyBuddyPage() {
  const coursesCache = useStore((s) => s.coursesCache);
  const fetchInitial = useStore((s) => s.fetchInitial);

  const [availability, setAvailability] = useState<string[]>(["mon-pm", "wed-pm", "sat-am"]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<MatchResponse | null>(null);

  useEffect(() => {
    fetchInitial().catch(() => {});
  }, [fetchInitial]);

  // Derive my courses + current grade from saved courses (same logic the rest
  // of the app uses: weighted average over scored assessments).
  const myCourses = useMemo<CourseLite[]>(() => {
    type RawAssessment = { weight?: number; score?: number | null };
    type Cached = {
      title?: string;
      course_payload?: { assessments?: RawAssessment[] };
      assessments?: RawAssessment[];
    };
    const list = Array.isArray(coursesCache) ? (coursesCache as Cached[]) : [];
    const out: CourseLite[] = [];
    for (const co of list) {
      if (!co.title) continue;
      const assessments = co.course_payload?.assessments ?? co.assessments ?? [];
      let w = 0;
      let ws = 0;
      for (const a of assessments) {
        const weight = Number(a.weight);
        if (Number.isFinite(weight) && weight > 0 && a.score != null && Number.isFinite(Number(a.score))) {
          w += weight;
          ws += Number(a.score) * weight;
        }
      }
      out.push({ course: co.title, current_grade: w > 0 ? Math.round(ws / w) : 75 });
    }
    return out;
  }, [coursesCache]);

  const usingDemoCourses = myCourses.length === 0;
  const effectiveCourses: CourseLite[] = usingDemoCourses
    ? [
        { course: "Operating Systems", current_grade: 61 },
        { course: "Data Structures", current_grade: 84 },
        { course: "Databases", current_grade: 66 },
      ]
    : myCourses;

  const toggleSlot = (slot: string) =>
    setAvailability((prev) =>
      prev.includes(slot) ? prev.filter((s) => s !== slot) : [...prev, slot],
    );

  const findMatches = async () => {
    setLoading(true);
    try {
      const resp = await fetch("/api/study-matching", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          me: { name: "You", target_grade: 82, availability, courses: effectiveCourses },
          candidates: DEMO_CANDIDATES,
          limit: 5,
        }),
      });
      if (!resp.ok) throw new Error(`Failed (${resp.status})`);
      setResult((await resp.json()) as MatchResponse);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't find matches");
    } finally {
      setLoading(false);
    }
  };

  const startRoom = (name: string) => {
    // Keep collaboration free + zero-setup: open a fresh Google Meet room.
    // (No Zoom/Google OAuth plumbing — that's deliberately out of MVP scope.)
    window.open("https://meet.new", "_blank", "noopener,noreferrer");
    toast.success(`Focus room opened — share the link with ${name}.`);
  };

  return (
    <div className="min-h-dvh bg-white px-4 sm:px-6 md:px-10 lg:px-14.75 py-6 md:py-11.5">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="mb-2 text-[28px] font-semibold text-black-primary">Study Buddy</h1>
          <p className="max-w-2xl text-gray-primary">
            Matched by what you&apos;re working on — not by followers. We pair you with
            peers who are strong where you&apos;re stuck, or behind on the same course this week.
          </p>
        </div>
        <button
          onClick={findMatches}
          disabled={loading}
          className="flex items-center justify-center gap-2 rounded-lg bg-indigo-primary px-4 py-2.5 text-white transition-colors hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
          Find my study buddies
        </button>
      </div>

      {usingDemoCourses && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          No saved courses yet — showing matches against sample courses. Add courses in
          Passing Target to match on your real grades.
        </div>
      )}

      {/* Availability picker */}
      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5">
        <p className="mb-3 text-sm font-medium text-black-primary">When are you free to study?</p>
        <div className="flex flex-wrap gap-2">
          {SLOTS.map((slot) => {
            const active = availability.includes(slot);
            return (
              <button
                key={slot}
                onClick={() => toggleSlot(slot)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium capitalize transition ${
                  active
                    ? "border-indigo-primary bg-indigo-primary/10 text-indigo-primary"
                    : "border-gray-200 text-gray-primary hover:border-indigo-primary/40"
                }`}
              >
                {slot.replace("-", " ")}
              </button>
            );
          })}
        </div>
      </div>

      {/* Headline */}
      {result && (
        <div className="mb-6 rounded-xl border border-indigo-100 bg-indigo-50 p-4">
          <p className="text-sm font-medium text-indigo-primary">{result.summary.headline}</p>
          <p className="mt-1 text-xs text-gray-600">
            Evaluated {result.summary.evaluated} peers · {result.summary.matched} relevant match(es).
          </p>
        </div>
      )}

      {/* Matches */}
      {result && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {result.matches.map((m) => (
            <div key={m.user_id ?? m.name} className="flex flex-col rounded-2xl border border-gray-200 bg-white p-5">
              <div className="mb-3 flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-indigo-primary/10 text-base font-semibold text-indigo-primary">
                    {m.name.charAt(0)}
                  </div>
                  <div>
                    <p className="font-semibold text-black-primary">{m.name}</p>
                    <span className="inline-flex items-center gap-1 text-xs text-gray-primary">
                      {matchIcon(m.match_type)} {m.match_type}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold text-indigo-primary">{Math.round(m.match_score)}</p>
                  <p className="text-[10px] uppercase tracking-wide text-gray-400">match</p>
                </div>
              </div>

              <ul className="mb-4 flex flex-1 flex-col gap-1.5">
                {m.reasons.map((r, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-primary" />
                    {r}
                  </li>
                ))}
              </ul>

              <button
                onClick={() => startRoom(m.name)}
                className="flex items-center justify-center gap-2 rounded-lg border border-indigo-primary px-3 py-2 text-sm font-medium text-indigo-primary transition hover:bg-indigo-primary/5"
              >
                <Video size={15} /> Start focus room
              </button>
            </div>
          ))}
        </div>
      )}

      {!result && !loading && (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-10 text-center">
          <Users size={32} className="mx-auto mb-3 text-gray-400" />
          <p className="text-gray-primary">
            Pick your free slots above and hit <span className="font-medium">Find my study buddies</span>.
          </p>
        </div>
      )}

      {/* Roadmap note — honest about what's MVP vs. next */}
      <p className="mt-8 text-xs text-gray-400">
        Roadmap: opt-in live cohort, in-app material sharing, and 1-click scheduled sessions.
        Matching stays engine-driven; sharing stays free to keep the network growing.
      </p>
    </div>
  );
}
