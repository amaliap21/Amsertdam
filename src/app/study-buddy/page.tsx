"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Users,
  Sparkles,
  Loader2,
  Video,
  HandHeart,
  GraduationCap,
  HeartHandshake,
} from "lucide-react";
import Link from "next/link";
import toast from "react-hot-toast";

/**
 * Study Buddy — engine-routed peer matching over REAL public profiles.
 *
 * Matches are computed by /api/study-buddy from each student's actual courses
 * (who's strong where you're weak, who's behind on the same course) plus shared
 * interests — only against users who turned on "Go global" in their profile.
 */

type Match = {
  user_id: string;
  name: string;
  avatar_url: string | null;
  is_tutor: boolean;
  match_score: number;
  match_type: string;
  reasons: string[];
  shared_courses: string[];
  shared_interests: string[];
};

type MatchResponse = {
  matches: Match[];
  summary: {
    evaluated: number;
    matched: number;
    my_courses: number;
    my_public: boolean;
    headline: string;
  };
};

const matchIcon = (type: string) => {
  if (type.startsWith("Mentor")) return <GraduationCap size={16} />;
  if (type.startsWith("Mentee")) return <HandHeart size={16} />;
  if (type.startsWith("Study partner")) return <HeartHandshake size={16} />;
  return <Users size={16} />;
};

export default function StudyBuddyPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<MatchResponse | null>(null);

  const findMatches = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await fetch("/api/study-buddy");
      const j = await resp.json();
      if (!resp.ok) throw new Error(j.error || `Failed (${resp.status})`);
      setResult(j as MatchResponse);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't find matches");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    findMatches();
  }, [findMatches]);

  const startRoom = (name: string) => {
    // Ad-hoc room: you open it and share the link with your match.
    window.open("https://meet.new", "_blank", "noopener,noreferrer");
    toast.success(`Room opened — copy the link and share it with ${name}.`);
  };

  return (
    <div className="min-h-dvh bg-white px-4 sm:px-6 md:px-10 lg:px-14.75 py-6 md:py-11.5">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="mb-2 text-[28px] font-semibold text-black-primary">Study Buddy</h1>
          <p className="max-w-2xl text-gray-primary">
            Matched by what you&apos;re working on — not by followers. We pair you with real
            peers who are strong where you&apos;re stuck, behind on the same course, or share your
            interests.
          </p>
        </div>
        <button
          onClick={findMatches}
          disabled={loading}
          className="flex items-center justify-center gap-2 rounded-lg bg-indigo-primary px-4 py-2.5 text-white transition-colors hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
          Refresh matches
        </button>
      </div>

      {result && !result.summary.my_public && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Your profile is private, so others can&apos;t match with you.{" "}
          <span className="font-medium">Turn on “Go global” in your profile</span> to be discoverable.
        </div>
      )}
      {result && result.summary.my_courses === 0 && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Add your courses in{" "}
          <Link href="/passing-target" className="font-semibold underline">Passing Target</Link>{" "}
          so we can match you on what you&apos;re actually studying.
        </div>
      )}

      {result && (
        <div className="mb-6 rounded-xl border border-indigo-100 bg-indigo-50 p-4">
          <p className="text-sm font-medium text-indigo-primary">{result.summary.headline}</p>
          <p className="mt-1 text-xs text-gray-600">
            Evaluated {result.summary.evaluated} public peer(s) · {result.summary.matched} relevant match(es).
          </p>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <Loader2 className="animate-spin" />
        </div>
      )}

      {result && !loading && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {result.matches.map((m) => (
            <div key={m.user_id} className="flex flex-col rounded-2xl border border-gray-200 bg-white p-5">
              <div className="mb-3 flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-indigo-primary/10 text-base font-semibold text-indigo-primary">
                    {m.name.charAt(0)}
                  </div>
                  <div>
                    <p className="flex items-center gap-1.5 font-semibold text-black-primary">
                      {m.name}
                      {m.is_tutor && <span className="rounded-full bg-indigo-primary/10 px-1.5 text-[10px] text-indigo-primary">Tutor</span>}
                    </p>
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
          {!result.matches.length && (
            <div className="md:col-span-2 rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-10 text-center text-gray-primary">
              No matches yet — they appear as more classmates add courses and go global.
            </div>
          )}
        </div>
      )}

      <p className="mt-8 text-xs text-gray-400">
        Only students who enabled “Go global” are matched. Sharing stays free; matching stays
        engine-driven by your real courses and interests.
      </p>
    </div>
  );
}
