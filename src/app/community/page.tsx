"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Star,
  Users,
  UserPlus,
  UserCheck,
  Clock,
  Video,
  CalendarPlus,
  Loader2,
  GraduationCap,
  BookOpenText,
  Search,
  Share2,
  Globe,
  Lock,
  Check,
  PencilLine,
  X,
} from "lucide-react";
import toast from "react-hot-toast";

/**
 * Community and RealTrack's social layer (Study Buddy now lives here too).
 * Tabs: Buddies (engine matching) · People (mutual requests) · Tutors ·
 * Sessions (audience-scoped) · Articles · Shared (materials between mutuals).
 */

type Tab = "people" | "tutors" | "shared";

type Buddy = {
  user_id: string;
  name: string;
  is_tutor: boolean;
  match_score: number;
  match_type: string;
  reasons: string[];
  shared_courses: string[];
  shared_interests: string[];
};
type Person = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  is_tutor: boolean;
  interests: string[];
  connection: "none" | "mutual" | "incoming" | "outgoing";
};
type MiniProfile = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
};
type Tutor = {
  id: string;
  full_name: string | null;
  headline: string | null;
  tutor_subjects: string[] | null;
  follower_count: number;
  rating_avg: number;
  rating_count: number;
  recommend_count: number;
  sessions_hosted: number;
  is_following: boolean;
  is_me: boolean;
};
type Session = {
  id: string;
  host_id: string;
  title: string;
  course: string | null;
  description: string | null;
  scheduled_at: string | null;
  meet_url: string | null;
  capacity: number;
  participant_count: number;
  status: string;
  audience?: string;
  joined: boolean;
  is_host: boolean;
  host: { full_name: string | null; rating_avg: number } | null;
};
type Share = {
  id: string;
  kind: string;
  title: string;
  url: string | null;
  note: string | null;
  created_at: string;
  from?: MiniProfile | null;
  to?: MiniProfile | null;
};

export default function CommunityPage() {
  const [tab, setTab] = useState<Tab>("people");
  const [loading, setLoading] = useState(false);
  const [isPublic, setIsPublic] = useState(false);
  const [isTutor, setIsTutor] = useState(false);
  const [myTutor, setMyTutor] = useState<{
    headline: string;
    subjects: string[];
    rating: number;
  }>({ headline: "", subjects: [], rating: 0 });

  const [buddies, setBuddies] = useState<{
    matches: Buddy[];
    headline: string;
    my_public: boolean;
    my_courses: number;
  } | null>(null);
  const [people, setPeople] = useState<{
    mutuals: MiniProfile[];
    incoming: MiniProfile[];
    outgoing: MiniProfile[];
  }>({ mutuals: [], incoming: [], outgoing: [] });
  const [searchResults, setSearchResults] = useState<Person[]>([]);
  const [query, setQuery] = useState("");
  const [tutors, setTutors] = useState<Tutor[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const [shares, setShares] = useState<{ received: Share[]; sent: Share[] }>({
    received: [],
    sent: [],
  });

  const refreshMe = useCallback(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((p) => {
        setIsPublic(p?.is_public === true);
        setIsTutor(p?.is_tutor === true);
        setMyTutor({
          headline: p?.headline ?? "",
          subjects: Array.isArray(p?.tutor_subjects) ? p.tutor_subjects : [],
          rating: Number(p?.rating_avg ?? 0),
        });
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    refreshMe();
  }, [refreshMe]);

  const load = useCallback(async (which: Tab) => {
    setLoading(true);
    try {
      if (which === "people") {
        const [b, c] = await Promise.all([
          fetch("/api/study-buddy").then((r) => r.json()),
          fetch("/api/social/connections").then((r) => r.json()),
        ]);
        setBuddies({
          matches: b.matches ?? [],
          headline: b.summary?.headline ?? "",
          my_public: b.summary?.my_public ?? true,
          my_courses: b.summary?.my_courses ?? 0,
        });
        setPeople(c);
      } else if (which === "tutors") {
        // Tutors tab also hosts sessions now.
        const [t, s] = await Promise.all([
          fetch("/api/social/tutors").then((r) => r.json()),
          fetch("/api/social/sessions").then((r) => r.json()),
        ]);
        setTutors(t.tutors ?? []);
        setSessions(s.sessions ?? []);
      } else if (which === "shared") {
        const [m, c] = await Promise.all([
          fetch("/api/social/materials").then((r) => r.json()),
          fetch("/api/social/connections").then((r) => r.json()),
        ]);
        setShares(m);
        setPeople(c); // populate mutuals for the share recipient picker
      }
    } catch {
      toast.error("Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(tab);
  }, [tab, load]);

  const mutualIdSet = useMemo(
    () => new Set(people.mutuals.map((m) => m.id)),
    [people.mutuals],
  );

  const visibleBuddyMatches = useMemo(
    () => (buddies?.matches ?? []).filter((m) => !mutualIdSet.has(m.user_id)),
    [buddies, mutualIdSet],
  );

  // ---- People / connections ----
  const runSearch = async (q: string) => {
    setQuery(q);
    if (q.trim().length < 1) {
      setSearchResults([]);
      return;
    }
    try {
      const j = await (
        await fetch(`/api/social/search?q=${encodeURIComponent(q.trim())}`)
      ).json();
      setSearchResults(j.results ?? []);
    } catch {
      /* ignore */
    }
  };
  const requestMutual = async (id: string) => {
    try {
      const j = await (
        await fetch("/api/social/connections", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ target_id: id }),
        })
      ).json();
      toast.success(
        j.status === "mutual" ? "You're now mutuals" : "Request sent",
      );
      setSearchResults((prev) =>
        prev.map((p) => (p.id === id ? { ...p, connection: j.status } : p)),
      );
      load("people");
    } catch {
      toast.error("Failed");
    }
  };
  const respond = async (
    requester_id: string,
    action: "accept" | "decline",
  ) => {
    await fetch("/api/social/connections", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ requester_id, action }),
    });
    load("people");
  };
  const removeConn = async (target_id: string) => {
    await fetch("/api/social/connections", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ target_id }),
    });
    load("people");
  };

  // ---- tutors ----
  const toggleFollow = async (t: Tutor) => {
    setTutors((prev) =>
      prev.map((x) =>
        x.id === t.id
          ? {
              ...x,
              is_following: !x.is_following,
              follower_count: x.follower_count + (x.is_following ? -1 : 1),
            }
          : x,
      ),
    );
    try {
      await fetch("/api/social/follow", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ target_id: t.id }),
      });
    } catch {
      load("tutors");
    }
  };
  const saveTutorProfile = async (headline: string, subjects: string[]) => {
    try {
      await fetch("/api/social/tutors", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          is_tutor: true,
          headline,
          tutor_subjects: subjects,
        }),
      });
      setIsTutor(true);
      setMyTutor((m) => ({ ...m, headline, subjects }));
      toast.success("Tutor profile saved");
      refreshMe();
      load("tutors");
    } catch {
      toast.error("Failed");
    }
  };
  const stopTutoring = async () => {
    try {
      await fetch("/api/social/tutors", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ is_tutor: false }),
      });
      setIsTutor(false);
      setMyTutor({ headline: "", subjects: [], rating: 0 });
      toast.success("You are no longer a tutor, your meetings were cancelled");
      refreshMe();
      load("tutors");
    } catch {
      toast.error("Failed");
    }
  };
  const saveShared = async (shareId: string) => {
    try {
      const r = await fetch("/api/social/materials/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ share_id: shareId }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Failed");
      toast.success(
        j.kind === "quiz" ? "Saved to Quiz Lab" : "Saved to Flashcards",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };
  const clearSharedHistory = async () => {
    const ok = window.confirm("Clear shared history for sent and received items");
    if (!ok) return;
    try {
      const r = await fetch("/api/social/materials", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scope: "all" }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Failed");
      setShares({ received: [], sent: [] });
      toast.success("Shared history cleared");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  // ---- sessions ----
  const joinSession = async (s: Session) => {
    try {
      const j = await (
        await fetch("/api/social/sessions/join", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ session_id: s.id }),
        })
      ).json();
      if (j.error) throw new Error(j.error);
      load("tutors");
      if (j.joined && s.meet_url)
        window.open(s.meet_url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };
  const deleteSession = async (s: Session) => {
    if (!s.is_host) return;
    const ok = window.confirm("Delete this meeting? This removes the session for everyone.");
    if (!ok) return;
    setDeletingSessionId(s.id);
    try {
      const r = await fetch("/api/social/sessions", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ session_id: s.id }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Failed");
      toast.success("Meeting deleted");
      load("tutors");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setDeletingSessionId(null);
    }
  };

  return (
    <div className="min-h-dvh bg-white px-4 sm:px-6 md:px-10 lg:px-14.75 py-6 md:py-11.5">
      <div className="mb-6">
        <h1 className="mb-2 text-[28px] font-semibold text-black-primary">
          Community
        </h1>
        <p className="max-w-2xl text-gray-primary">
          Find study buddies and tutors, connect with mutuals, join &quot;study
          with me&quot; sessions, and share materials. The more you help, the
          more stars and followers you earn.
        </p>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-gray-200">
        {(
          [
            ["people", "People", <Users key="p" size={15} />],
            [
              "tutors",
              "Tutors & Sessions",
              <GraduationCap key="t" size={15} />,
            ],
            ["shared", "Shared", <Share2 key="sh" size={15} />],
          ] as [Tab, string, React.ReactNode][]
        ).map(([key, label, icon]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex shrink-0 items-center gap-1.5 border-b-2 px-3.5 py-2.5 text-sm font-medium transition ${tab === key ? "border-indigo-primary text-indigo-primary" : "border-transparent text-gray-primary hover:text-indigo-primary"}`}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <Loader2 className="animate-spin" />
        </div>
      )}

      {/* PEOPLE (search + connections + suggested study buddies) */}
      {!loading && tab === "people" && (
        <div className="flex flex-col gap-6">
          {/* Suggested study buddies from engine matches */}
          <div>
            <h2 className="mb-2 text-sm font-semibold text-black-primary">
              Suggested study buddies
            </h2>
            {buddies && !buddies.my_public && (
              <Banner>
                Your profile is private. Others cannot match with you. Turn on
                “Go global” in your profile to be discoverable.
              </Banner>
            )}
            {buddies && buddies.my_courses === 0 && (
              <Banner>
                Add your courses in Passing Target so we can match you on what
                you study.
              </Banner>
            )}
            {buddies && visibleBuddyMatches.length > 0 && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {visibleBuddyMatches.map((m) => (
                  <div
                    key={m.user_id}
                    className="flex flex-col rounded-2xl border border-gray-200 bg-white p-5"
                  >
                    <div className="mb-3 flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <Avatar name={m.name} />
                        <div>
                          <p className="flex items-center gap-1.5 font-semibold text-black-primary">
                            {m.name}
                            {m.is_tutor && <Tag>Tutor</Tag>}
                          </p>
                          <span className="text-xs text-gray-primary">
                            {m.match_type}
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-semibold text-indigo-primary">
                          {Math.round(m.match_score)}
                        </p>
                        <p className="text-[10px] uppercase text-gray-400">
                          match
                        </p>
                      </div>
                    </div>
                    <ul className="mb-4 flex flex-1 flex-col gap-1.5">
                      {m.reasons.map((r, i) => (
                        <li
                          key={i}
                          className="flex items-start gap-2 text-sm text-gray-700"
                        >
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-primary" />
                          {r}
                        </li>
                      ))}
                    </ul>
                    <button
                      onClick={() => requestMutual(m.user_id)}
                      className="flex items-center justify-center gap-2 rounded-lg border border-indigo-primary px-3 py-2 text-sm font-medium text-indigo-primary transition hover:bg-indigo-primary/5"
                    >
                      <UserPlus size={15} /> Request mutual
                    </button>
                  </div>
                ))}
              </div>
            )}
            {buddies && !visibleBuddyMatches.length && (
              <p className="text-sm text-gray-400">
                No new matches yet. They appear as classmates go global and add
                courses.
              </p>
            )}
          </div>

          {/* Find people */}
          <div>
            <div className="mb-3 flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2">
              <Search size={16} className="text-gray-400" />
              <input
                value={query}
                onChange={(e) => runSearch(e.target.value)}
                placeholder="Search people by name…"
                className="w-full text-sm outline-none"
              />
            </div>
            <div className="flex flex-col gap-2">
              {searchResults.map((p) => (
                <PersonRow
                  key={p.id}
                  name={p.full_name}
                  avatar={p.avatar_url}
                  subtitle={
                    p.is_tutor
                      ? "Tutor"
                      : p.interests.slice(0, 3).join(" · ") || "Student"
                  }
                  action={
                    p.connection === "mutual" ? (
                      <Pill tone="muted">
                        <UserCheck size={14} /> Mutual
                      </Pill>
                    ) : p.connection === "outgoing" ? (
                      <Pill tone="muted">
                        <Clock size={14} /> Requested
                      </Pill>
                    ) : p.connection === "incoming" ? (
                      <button
                        onClick={() => respond(p.id, "accept")}
                        className="rounded-lg bg-indigo-primary px-3 py-1.5 text-xs font-medium text-white"
                      >
                        Accept
                      </button>
                    ) : (
                      <button
                        onClick={() => requestMutual(p.id)}
                        className="flex items-center gap-1 rounded-lg border border-indigo-primary px-3 py-1.5 text-xs font-medium text-indigo-primary hover:bg-indigo-primary/5"
                      >
                        <UserPlus size={14} /> Request
                      </button>
                    )
                  }
                />
              ))}
              {query && !searchResults.length && (
                <p className="text-sm text-gray-400">
                  No matches (private profiles don&apos;t appear in search).
                </p>
              )}
            </div>
          </div>

          {people.incoming.length > 0 && (
            <Section title={`Requests (${people.incoming.length})`}>
              {people.incoming.map((p) => (
                <PersonRow
                  key={p.id}
                  name={p.full_name}
                  avatar={p.avatar_url}
                  subtitle="wants to be your mutual"
                  action={
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => respond(p.id, "accept")}
                        className="flex items-center gap-1 rounded-lg bg-indigo-primary px-2.5 py-1.5 text-xs font-medium text-white"
                      >
                        <Check size={14} /> Accept
                      </button>
                      <button
                        onClick={() => respond(p.id, "decline")}
                        className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-600"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  }
                />
              ))}
            </Section>
          )}

          <Section title={`Mutuals (${people.mutuals.length})`}>
            {people.mutuals.map((p) => (
              <PersonRow
                key={p.id}
                name={p.full_name}
                avatar={p.avatar_url}
                subtitle="Mutual"
                action={
                  <button
                    onClick={() => removeConn(p.id)}
                    className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-500"
                  >
                    Remove
                  </button>
                }
              />
            ))}
            {!people.mutuals.length && (
              <p className="text-sm text-gray-400">
                No mutuals yet. Search and send requests above.
              </p>
            )}
          </Section>

          {people.outgoing.length > 0 && (
            <Section title={`Pending sent (${people.outgoing.length})`}>
              {people.outgoing.map((p) => (
                <PersonRow
                  key={p.id}
                  name={p.full_name}
                  avatar={p.avatar_url}
                  subtitle="request pending"
                  action={
                    <button
                      onClick={() => removeConn(p.id)}
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-500"
                    >
                      Cancel
                    </button>
                  }
                />
              ))}
            </Section>
          )}
        </div>
      )}

      {/* TUTORS & SESSIONS */}
      {!loading && tab === "tutors" && (
        <div className="flex flex-col gap-8">
          {/* 1. Your tutor profile (your own card lives here, not in the directory) */}
          <div>
            <h2 className="mb-3 text-sm font-semibold text-black-primary">
              Your tutor profile
            </h2>
            <TutorProfileCard
              isTutor={isTutor}
              headline={myTutor.headline}
              subjects={myTutor.subjects}
              rating={myTutor.rating}
              onSave={saveTutorProfile}
              onStop={stopTutoring}
            />
          </div>

          {/* 2. Meetings */}
          <div>
            <h2 className="mb-3 text-sm font-semibold text-black-primary">
              Meetings
            </h2>
            {isTutor && (
              <div className="mb-4">
                <SessionComposer
                  isPublic={isPublic}
                  onCreated={() => load("tutors")}
                />
              </div>
            )}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {sessions.map((s) => (
                <div
                  key={s.id}
                  className="rounded-2xl border border-gray-200 bg-white p-5"
                >
                  <div className="mb-1 flex items-center justify-between">
                    <h3 className="font-semibold text-black-primary">
                      {s.title}
                    </h3>
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${s.status === "full" ? "bg-red-50 text-red-600" : "bg-green-50 text-green-700"}`}
                      >
                        {s.participant_count}/{s.capacity}
                      </span>
                      {s.is_host && (
                        <button
                          type="button"
                          onClick={() => deleteSession(s)}
                          disabled={deletingSessionId === s.id}
                          title="Delete meeting"
                          className="flex h-7 w-7 items-center justify-center rounded-full border border-gray-200 text-gray-500 hover:text-red-500 disabled:opacity-50"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="mb-1 flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
                    <span>
                      Host {s.host?.full_name ?? "Student"}
                      {s.host?.rating_avg
                        ? ` · ★ ${Number(s.host.rating_avg).toFixed(1)}`
                        : ""}
                    </span>
                    {s.audience === "mutuals" ? (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-gray-100 px-1.5 text-[10px] text-gray-600">
                        <Lock size={10} /> Mutuals
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-indigo-50 px-1.5 text-[10px] text-indigo-primary">
                        <Globe size={10} /> Global
                      </span>
                    )}
                    {s.course && <span>· {s.course}</span>}
                  </p>
                  {s.scheduled_at && (
                    <p className="mb-2 text-xs font-medium text-indigo-primary">
                      📅{" "}
                      {new Date(s.scheduled_at).toLocaleString(undefined, {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  )}
                  {s.description && (
                    <p className="mb-3 text-sm text-gray-700">
                      {s.description}
                    </p>
                  )}
                  <button
                    onClick={() => joinSession(s)}
                    disabled={s.status === "full" && !s.joined}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:opacity-50 ${s.joined ? "border border-gray-200 text-gray-600" : "bg-indigo-primary text-white hover:bg-indigo-600"}`}
                  >
                    <Video size={15} />{" "}
                    {s.is_host
                      ? "Open room"
                      : s.joined
                        ? "Joined, open room"
                        : "Join session"}
                  </button>
                  {s.joined && !s.is_host && (
                    <RateHost
                      hostId={s.host_id}
                      hostName={s.host?.full_name ?? "host"}
                      sessionId={s.id}
                    />
                  )}
                </div>
              ))}
              {!sessions.length && (
                <Empty label="No meetings yet. A tutor can host the first one." />
              )}
            </div>
          </div>

          {/* 3. Tutor directory (everyone except you) */}
          <div>
            <h2 className="mb-3 text-sm font-semibold text-black-primary">
              Tutors
            </h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {tutors
                .filter((t) => !t.is_me)
                .map((t) => (
                  <div
                    key={t.id}
                    className="rounded-2xl border border-gray-200 bg-white p-5"
                  >
                    <div className="mb-2 flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <Avatar name={t.full_name ?? "?"} />
                        <div>
                          <p className="font-semibold text-black-primary">
                            {t.full_name ?? "Student"}
                          </p>
                          <p className="text-xs text-gray-primary">
                            {t.headline ?? "Tutor"}
                          </p>
                        </div>
                      </div>
                      <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">
                        ★ {Number(t.rating_avg).toFixed(1)}
                      </span>
                    </div>
                    <div className="mb-3 flex flex-wrap gap-1.5">
                      {(t.tutor_subjects ?? []).slice(0, 4).map((s) => (
                        <span
                          key={s}
                          className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                    <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                      <span>{t.follower_count} followers</span>
                      <span>{t.rating_count} ratings</span>
                      <span className="text-indigo-primary">
                        👍 {t.recommend_count} recommend
                      </span>
                      <span>{t.sessions_hosted} sessions</span>
                    </div>
                    <button
                      onClick={() => toggleFollow(t)}
                      className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition ${t.is_following ? "border-gray-200 text-gray-500" : "border-indigo-primary text-indigo-primary hover:bg-indigo-primary/5"}`}
                    >
                      {t.is_following ? (
                        <UserCheck size={15} />
                      ) : (
                        <UserPlus size={15} />
                      )}
                      {t.is_following ? "Following" : "Follow"}
                    </button>
                    <p className="mt-2 text-[11px] text-gray-400">
                      Rate this tutor after joining one of their sessions.
                    </p>
                  </div>
                ))}
              {!tutors.filter((t) => !t.is_me).length && (
                <Empty label="No other tutors yet. Be the first to teach." />
              )}
            </div>
          </div>
        </div>
      )}

      {/* SHARED MATERIALS */}
      {!loading && tab === "shared" && (
        <div>
          <ShareComposer
            mutuals={people.mutuals}
            onShared={() => load("shared")}
          />
          {(shares.received.length > 0 || shares.sent.length > 0) && (
            <button
              type="button"
              onClick={clearSharedHistory}
              className="mb-4 rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600"
            >
              Clear shared history
            </button>
          )}
          <Section title={`Shared with you (${shares.received.length})`}>
            {shares.received.map((r) => (
              <ShareRow
                key={r.id}
                share={r}
                who={r.from?.full_name ?? "Someone"}
                dir="from"
                onSave={saveShared}
              />
            ))}
            {!shares.received.length && (
              <p className="text-sm text-gray-400">
                Nothing shared with you yet.
              </p>
            )}
          </Section>
          {shares.sent.length > 0 && (
            <Section title={`You shared (${shares.sent.length})`}>
              {shares.sent.map((r) => (
                <ShareRow
                  key={r.id}
                  share={r}
                  who={r.to?.full_name ?? "a mutual"}
                  dir="to"
                />
              ))}
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------------- small presentational helpers ---------------- */
function Avatar({ name }: { name: string }) {
  return (
    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-indigo-primary/10 text-base font-semibold text-indigo-primary">
      {name.charAt(0)}
    </div>
  );
}
function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-indigo-primary/10 px-1.5 text-[10px] text-indigo-primary">
      {children}
    </span>
  );
}
function Pill({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "muted";
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium ${tone === "muted" ? "bg-gray-100 text-gray-500" : ""}`}
    >
      {children}
    </span>
  );
}
function Banner({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
      {children}
    </div>
  );
}
function Empty({ label }: { label: string }) {
  return (
    <div className="col-span-full rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-10 text-center text-gray-primary">
      {label}
    </div>
  );
}
function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="mb-2 text-sm font-semibold text-black-primary">{title}</h2>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}
function PersonRow({
  name,
  subtitle,
  action,
}: {
  name: string | null;
  avatar?: string | null;
  subtitle: string;
  action: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3">
      <Avatar name={name ?? "?"} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-black-primary">
          {name ?? "Student"}
        </p>
        <p className="truncate text-xs text-gray-primary">{subtitle}</p>
      </div>
      {action}
    </div>
  );
}
function ShareRow({
  share,
  who,
  dir,
  onSave,
}: {
  share: Share;
  who: string;
  dir: "from" | "to";
  onSave?: (id: string) => void;
}) {
  const icon =
    share.kind === "quiz" ? (
      <BookOpenText size={15} />
    ) : share.kind === "flashcard" ? (
      <Star size={15} />
    ) : (
      <Share2 size={15} />
    );
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-primary/10 text-indigo-primary">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-black-primary">
          {share.title}
        </p>
        <p className="truncate text-xs text-gray-primary">
          {share.kind === "material" ? "PDF / link" : share.kind} ·{" "}
          {dir === "from" ? `from ${who}` : `to ${who}`}
          {share.note ? ` · ${share.note}` : ""}
        </p>
      </div>
      {share.kind === "material" && share.url && (
        <a
          href={share.url}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 rounded-lg border border-indigo-primary px-3 py-1.5 text-xs font-medium text-indigo-primary"
        >
          Open
        </a>
      )}
      {dir === "from" && share.kind !== "material" && onSave && (
        <button
          onClick={() => onSave(share.id)}
          className="shrink-0 rounded-lg bg-indigo-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-600"
        >
          Save to my library
        </button>
      )}
    </div>
  );
}

/* ---------------- RateHost (fixed: colours on click + recommend toggle) ---------------- */
function RateHost({
  hostId,
  hostName,
  sessionId,
}: {
  hostId: string;
  hostName: string;
  sessionId: string;
}) {
  const [stars, setStars] = useState(0);
  const [hover, setHover] = useState(0);
  const [recommend, setRecommend] = useState(false);
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (stars === 0) {
      toast.error("Pick a star rating first");
      return;
    }
    setSaving(true);
    try {
      const r = await fetch("/api/social/ratings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tutor_id: hostId,
          stars,
          recommend,
          session_id: sessionId,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Failed");
      setDone(true);
      toast.success(
        `Thanks. You rated ${hostName} ${stars}★${recommend ? " and recommended them" : ""}`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  if (done)
    return (
      <p className="mt-3 text-xs text-green-600">
        ✓ Rated {stars}★{recommend ? " · recommended" : ""}
      </p>
    );
  return (
    <div className="mt-3 rounded-lg border border-gray-100 bg-gray-50 p-3">
      <p className="mb-1.5 text-xs font-medium text-gray-600">
        Rate {hostName} after the session
      </p>
      <div
        className="mb-2 flex items-center gap-1"
        onMouseLeave={() => setHover(0)}
      >
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            disabled={saving}
            onMouseEnter={() => setHover(n)}
            onClick={() => setStars(n)}
            aria-label={`${n} star`}
            className="p-0.5"
          >
            <Star
              size={20}
              className={
                n <= (hover || stars)
                  ? "fill-amber-400 text-amber-400"
                  : "text-gray-300"
              }
            />
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setRecommend((v) => !v)}
          className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${recommend ? "border-indigo-primary bg-indigo-primary/10 text-indigo-primary" : "border-gray-200 text-gray-500"}`}
        >
          {recommend ? (
            <Check size={14} />
          ) : (
            <span className="text-base leading-none">👍</span>
          )}{" "}
          {recommend ? "Recommended" : "Recommend"}
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={submit}
          className="rounded-lg bg-indigo-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-600 disabled:opacity-50"
        >
          Submit
        </button>
      </div>
    </div>
  );
}

/* ---------------- tutor profile card (become / edit / undo) ---------------- */
const SUBJECT_SUGGEST = [
  "OS",
  "OOP",
  "Math",
  "Data Structures",
  "Algorithms",
  "Databases",
  "Computer Networks",
  "Web Dev",
  "Machine Learning",
  "Statistics",
];

function TutorProfileCard({
  isTutor,
  headline,
  subjects,
  rating,
  onSave,
  onStop,
}: {
  isTutor: boolean;
  headline: string;
  subjects: string[];
  rating: number;
  onSave: (headline: string, subjects: string[]) => void;
  onStop: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [h, setH] = useState(headline);
  const [subs, setSubs] = useState<string[]>(subjects);
  const [custom, setCustom] = useState("");
  const [saving, setSaving] = useState(false);

  // Load current values into the form, then open it (avoids syncing in an effect).
  const startEdit = () => {
    setH(headline);
    setSubs(subjects);
    setCustom("");
    setEditing(true);
  };

  const addCustom = () => {
    const v = custom.trim();
    if (v && !subs.some((s) => s.toLowerCase() === v.toLowerCase()))
      setSubs((p) => [...p, v]);
    setCustom("");
  };

  const submit = async () => {
    if (!h.trim()) {
      toast.error("Add a short headline");
      return;
    }
    setSaving(true);
    await onSave(h.trim(), subs);
    setSaving(false);
    setEditing(false);
  };

  // Not a tutor yet, and not editing: call to action.
  if (!isTutor && !editing) {
    return (
      <div className="flex flex-col items-start gap-2 rounded-2xl border border-gray-200 bg-gray-50 p-5">
        <p className="text-sm text-gray-primary">
          Only tutors can host &quot;study with me&quot; sessions and earn
          stars.
        </p>
        <button
          onClick={startEdit}
          className="flex items-center gap-2 rounded-lg bg-indigo-primary px-4 py-2 text-sm font-medium text-white hover:bg-indigo-600"
        >
          <GraduationCap size={15} /> Become a tutor
        </button>
      </div>
    );
  }

  // Editing form: current subjects are removable, suggestions are addable, plus free text.
  if (editing) {
    const suggestions = SUBJECT_SUGGEST.filter(
      (s) => !subs.some((x) => x.toLowerCase() === s.toLowerCase()),
    );
    return (
      <div className="rounded-2xl border border-indigo-100 bg-white p-5">
        <label className="mb-1 block text-xs font-medium text-gray-primary">
          Headline
        </label>
        <input
          value={h}
          onChange={(e) => setH(e.target.value)}
          placeholder="e.g. OS and Databases, I explain with diagrams"
          className="mb-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-primary"
        />
        <label className="mb-1 block text-xs font-medium text-gray-primary">
          Subjects you tutor
        </label>
        {subs.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {subs.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSubs((p) => p.filter((x) => x !== s))}
                className="inline-flex items-center gap-1 rounded-full border border-indigo-primary bg-indigo-primary/10 px-2.5 py-1 text-[11px] font-medium text-indigo-primary"
              >
                {s} <X size={11} />
              </button>
            ))}
          </div>
        )}
        <div className="mb-2 flex gap-2">
          <input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCustom();
              }
            }}
            placeholder="Add your own subject, then press Enter"
            className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-indigo-primary"
          />
          <button
            type="button"
            onClick={addCustom}
            className="rounded-lg border border-indigo-primary px-3 py-1.5 text-xs font-medium text-indigo-primary"
          >
            Add
          </button>
        </div>
        {suggestions.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSubs((p) => [...p, s])}
                className="rounded-full border border-gray-200 px-2.5 py-1 text-[11px] font-medium text-gray-500 hover:border-indigo-primary/40"
              >
                + {s}
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <button
            onClick={submit}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-indigo-primary px-4 py-2 text-sm font-medium text-white hover:bg-indigo-600 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Check size={15} />
            )}{" "}
            Save
          </button>
          <button
            onClick={() => {
              setEditing(false);
              setCustom("");
            }}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // Tutor profile card (view): rating star and an edit icon at the top right.
  return (
    <>
      <div className="rounded-2xl border border-indigo-100 bg-white p-5">
        <div className="mb-2 flex items-start justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-primary/10 text-indigo-primary">
              <GraduationCap size={18} />
            </span>
            <div>
              <p className="text-sm font-semibold text-black-primary">
                You are a tutor
              </p>
              <p className="text-xs text-gray-primary">
                {headline || "No headline yet"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">
              ★ {Number(rating).toFixed(1)}
            </span>
            <button
              onClick={startEdit}
              title="Edit your tutor profile"
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-indigo-primary text-indigo-primary hover:bg-indigo-primary/5"
            >
              <PencilLine size={14} />
            </button>
          </div>
        </div>
        {subjects.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {subjects.map((s) => (
              <span
                key={s}
                className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600"
              >
                {s}
              </span>
            ))}
          </div>
        )}
        <button
          onClick={() => setConfirming(true)}
          className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-red-500"
        >
          <X size={14} /> Stop tutoring
        </button>
      </div>
      {confirming && (
        <StopTutoringConfirm
          headline={headline}
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            onStop();
          }}
        />
      )}
    </>
  );
}

// GitHub style destructive confirmation. You must retype your headline.
function StopTutoringConfirm({
  headline,
  onCancel,
  onConfirm,
}: {
  headline: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const phrase = headline.trim() || "stop tutoring";
  const [typed, setTyped] = useState("");
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-2 text-lg font-semibold text-red-600">
          Stop tutoring?
        </h3>
        <p className="mb-4 text-sm text-gray-700">
          Are you sure? You are going to delete your meeting too. Your tutor
          profile will be reset and this cannot be undone.
        </p>
        <p className="mb-1 text-xs text-gray-primary">
          To confirm, type your headline again:{" "}
          <span className="font-semibold text-black-primary">{phrase}</span>
        </p>
        <input
          autoFocus
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          className="mb-4 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-400"
        />
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={typed.trim() !== phrase}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Stop tutoring and cancel meetings
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- composers ---------------- */
function SessionComposer({
  isPublic,
  onCreated,
}: {
  isPublic: boolean;
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [course, setCourse] = useState("");
  const [when, setWhen] = useState("");
  const [capacity, setCapacity] = useState("");
  const [meetUrl, setMeetUrl] = useState("");
  const [audience, setAudience] = useState<"global" | "mutuals">("global");
  const [saving, setSaving] = useState(false);
  const whenLabel = when
    ? new Date(when).toLocaleString(undefined, {
        weekday: "long",
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";
  const create = async () => {
    if (!/^https?:\/\/.+/i.test(meetUrl.trim())) {
      toast.error("Paste your meeting link (Google Meet, Zoom, etc.)");
      return;
    }
    setSaving(true);
    try {
      const r = await fetch("/api/social/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title,
          course: course || undefined,
          scheduled_at: when || undefined,
          capacity: Number(capacity),
          meet_url: meetUrl.trim(),
          audience: isPublic ? "global" : audience,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Failed");
      toast.success("Session created");
      setTitle("");
      setCourse("");
      setWhen("");
      setMeetUrl("");
      setOpen(false);
      onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  };
  if (!open)
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-lg bg-indigo-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-600"
      >
        <CalendarPlus size={16} /> Host &quot;study with me&quot;
      </button>
    );
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Session title (e.g. OS Exam Cram)"
        className="mb-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-primary"
      />
      <div className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input
          value={course}
          onChange={(e) => setCourse(e.target.value)}
          placeholder="Course"
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-primary"
        />
        <input
          type="number"
          min={2}
          max={50}
          value={capacity}
          onChange={(e) => setCapacity(e.target.value)}
          placeholder="Capacity"
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-primary"
        />
      </div>
      <label className="mb-1 block text-xs font-medium text-gray-primary">
        When (day, date &amp; time)
      </label>
      <input
        type="datetime-local"
        value={when}
        onChange={(e) => setWhen(e.target.value)}
        className="mb-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-primary"
      />
      {whenLabel && (
        <p className="mb-2 text-xs text-indigo-primary">📅 {whenLabel}</p>
      )}
      <label className="mb-1 block text-xs font-medium text-gray-primary">
        Meeting link (you host the room)
      </label>
      <input
        value={meetUrl}
        onChange={(e) => setMeetUrl(e.target.value)}
        placeholder="https://meet.google.com/…  or  https://zoom.us/j/…"
        className="mb-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-primary"
      />
      {/* Audience only private hosts may restrict to mutuals */}
      {isPublic ? (
        <p className="mb-3 inline-flex items-center gap-1 rounded-lg bg-indigo-50 px-2.5 py-1.5 text-xs text-indigo-primary">
          <Globe size={13} /> Global session. Anyone can join. You are a public
          profile.
        </p>
      ) : (
        <div className="mb-3 flex gap-2">
          {(["mutuals", "global"] as const).map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setAudience(a)}
              className={`flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-medium ${audience === a ? "border-indigo-primary bg-indigo-primary/10 text-indigo-primary" : "border-gray-200 text-gray-500"}`}
            >
              {a === "mutuals" ? <Lock size={13} /> : <Globe size={13} />}{" "}
              {a === "mutuals" ? "Mutuals only" : "Global"}
            </button>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <button
          onClick={create}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-indigo-primary px-4 py-2 text-sm font-medium text-white hover:bg-indigo-600 disabled:opacity-50"
        >
          {saving ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <CalendarPlus size={15} />
          )}{" "}
          Create
        </button>
        <button
          onClick={() => setOpen(false)}
          className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function ShareComposer({
  mutuals,
  onShared,
}: {
  mutuals: MiniProfile[];
  onShared: () => void;
}) {
  const MAX_PDF_SIZE = 50 * 1024 * 1024;
  const [open, setOpen] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [mutualOptions, setMutualOptions] = useState<MiniProfile[]>(mutuals);
  const [deckOptions, setDeckOptions] = useState<{ id: string; title: string }[]>([]);
  const [quizOptions, setQuizOptions] = useState<{ id: string; title: string }[]>([]);
  const [recipients, setRecipients] = useState<string[]>([]);
  const [kind, setKind] = useState<"quiz" | "flashcard" | "material">(
    "material",
  );
  const [refId, setRefId] = useState("");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadShareOptions = async () => {
    setLoadingOptions(true);
    try {
      const [cResp, fResp, qResp] = await Promise.all([
        fetch("/api/social/connections"),
        fetch("/api/flashcards"),
        fetch("/api/quizzes"),
      ]);
      const cJson = cResp.ok ? await cResp.json() : null;
      const fJson = fResp.ok ? await fResp.json() : null;
      const qJson = qResp.ok ? await qResp.json() : null;

      if (cResp.ok) {
        setMutualOptions(Array.isArray(cJson?.mutuals) ? cJson.mutuals : []);
      } else {
        toast.error(cJson?.error || "Failed to load mutuals");
      }
      if (fResp.ok) {
        const decks = Array.isArray(fJson) ? fJson : [];
        setDeckOptions(
          decks.map((d: { id: string; title: string }) => ({ id: d.id, title: d.title })),
        );
      } else {
        toast.error(fJson?.error || "Failed to load flashcards");
      }
      if (qResp.ok) {
        const quizzes = Array.isArray(qJson) ? qJson : [];
        setQuizOptions(
          quizzes.map((q: { id: string; title: string }) => ({ id: q.id, title: q.title })),
        );
      } else {
        toast.error(qJson?.error || "Failed to load quizzes");
      }
    } catch {
      toast.error("Failed to load share options");
    } finally {
      setLoadingOptions(false);
    }
  };

  const resources = useMemo(() => {
    if (kind === "quiz") return quizOptions;
    if (kind === "flashcard") return deckOptions;
    return [];
  }, [kind, quizOptions, deckOptions]);

  const acceptFile = (next: File | null) => {
    if (!next) return;
    const isPdf =
      next.type === "application/pdf" ||
      next.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      toast.error("Please upload a PDF file");
      return;
    }
    if (next.size > MAX_PDF_SIZE) {
      toast.error("File exceeds the 50 MB limit");
      return;
    }
    setFile(next);
    if (!title.trim()) {
      setTitle(next.name.replace(/\.pdf$/i, ""));
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0] ?? null;
    acceptFile(picked);
  };

  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setDragging(false);
    const picked = e.dataTransfer.files?.[0] ?? null;
    acceptFile(picked);
  };

  const openComposer = () => {
    setOpen(true);
    void loadShareOptions();
  };

  const toggleRecipient = (id: string) =>
    setRecipients((p) =>
      p.includes(id) ? p.filter((x) => x !== id) : [...p, id],
    );

  const share = async () => {
    if (!recipients.length) {
      toast.error("Pick at least one mutual to share with");
      return;
    }
    if (kind !== "material" && !refId) {
      toast.error(
        `Pick a ${kind === "quiz" ? "quiz package" : "card deck"} to share`,
      );
      return;
    }
    if (kind === "material") {
      if (!title.trim()) {
        toast.error("Add a title for this link");
        return;
      }
      if (!file && !/^https?:\/\/.+/i.test(url.trim())) {
        toast.error("Add a valid link that starts with https:// or upload a PDF");
        return;
      }
    }
    const finalTitle =
      kind === "material"
        ? title.trim()
        : (resources.find((r) => r.id === refId)?.title ?? "");
    if (!finalTitle.trim()) {
      toast.error("Pick a valid title to share");
      return;
    }
    setSaving(true);
    try {
      const r = file && kind === "material"
        ? await fetch("/api/social/materials", {
            method: "POST",
            body: (() => {
              const fd = new FormData();
              fd.append("recipient_ids", JSON.stringify(recipients));
              fd.append("kind", "material");
              fd.append("title", finalTitle);
              fd.append("file", file);
              return fd;
            })(),
          })
        : await fetch("/api/social/materials", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              recipient_ids: recipients,
              kind,
              ref_id: kind === "material" ? undefined : refId,
              title: finalTitle,
              url: kind === "material" ? url : undefined,
            }),
          });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Failed");
      toast.success(`Shared with ${j.shared ?? recipients.length} mutual(s)`);
      setOpen(false);
      setTitle("");
      setUrl("");
      setFile(null);
      setRefId("");
      setRecipients([]);
      onShared();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  if (!open)
    return (
      <button
        onClick={openComposer}
        className="mb-4 flex items-center gap-2 rounded-lg bg-indigo-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-600"
      >
        <Share2 size={16} /> Share with mutuals
      </button>
    );
  return (
    <div className="mb-4 rounded-2xl border border-gray-200 bg-white p-5">
      {/* What to share: a card deck, a quiz package, or a PDF link */}
      <label className="mb-1 block text-xs font-medium text-gray-primary">
        What do you want to share?
      </label>
      <div className="mb-3 flex flex-wrap gap-2">
        {(
          [
            ["flashcard", "Card deck"],
            ["quiz", "Quiz package"],
            ["material", "PDF or link"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              setKind(k);
              setRefId("");
              if (k !== "material") {
                setFile(null);
                setUrl("");
              }
            }}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${kind === k ? "border-indigo-primary bg-indigo-primary/10 text-indigo-primary" : "border-gray-200 text-gray-500"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {kind === "material" ? (
        <>
          <label className="mb-1 block text-xs font-medium text-gray-primary">
            Upload PDF
          </label>
          <label
            htmlFor="share-pdf"
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            className={`mb-2 flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed px-3 py-4 text-xs text-gray-500 ${dragging ? "border-indigo-primary bg-indigo-primary/5" : "border-gray-300"}`}
          >
            <span className="font-medium text-gray-700">
              {file ? file.name : "Drop a PDF here or click to upload"}
            </span>
            <span className="text-[11px] text-gray-400">PDF only, up to 50 MB</span>
            <input
              id="share-pdf"
              type="file"
              accept="application/pdf"
              onChange={handleFileChange}
              className="hidden"
            />
          </label>
          {file && (
            <button
              type="button"
              onClick={() => setFile(null)}
              className="mb-2 w-fit rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600"
            >
              Clear file
            </button>
          )}
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title, for example OS Summary Notes"
            className="mb-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-primary"
          />
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={file ? "Link is optional when a PDF is uploaded" : "Link to your PDF or material, starting with https://"}
            disabled={!!file}
            className="mb-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-primary disabled:bg-gray-100"
          />
        </>
      ) : (
        <select
          value={refId}
          onChange={(e) => setRefId(e.target.value)}
          className="mb-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-primary"
        >
          <option value="">
            {resources.length
              ? `Select a ${kind === "quiz" ? "quiz package" : "card deck"}`
              : `You have no ${kind === "quiz" ? "quizzes" : "decks"} yet`}
          </option>
          {resources.map((r) => (
            <option key={r.id} value={r.id}>
              {r.title}
            </option>
          ))}
        </select>
      )}

      {/* Who to share with: pick one or more mutuals */}
      <label className="mb-1 block text-xs font-medium text-gray-primary">
        Share with (click to select one or more mutuals)
      </label>
      {loadingOptions && !mutualOptions.length ? (
        <p className="mb-3 text-sm text-gray-400">Loading mutuals</p>
      ) : mutualOptions.length ? (
        <div className="mb-3 flex max-h-40 flex-col gap-1 overflow-y-auto rounded-lg border border-gray-200 p-2">
          {mutualOptions.map((m) => {
            const on = recipients.includes(m.id);
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => toggleRecipient(m.id)}
                className={`flex items-center justify-between rounded-md px-2 py-1.5 text-sm ${on ? "bg-indigo-primary/10 text-indigo-primary" : "text-gray-700 hover:bg-gray-50"}`}
              >
                <span>{m.full_name ?? "Student"}</span>
                {on && <Check size={15} />}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="mb-3 text-sm text-gray-400">
          No mutuals yet. Connect with people first in the People tab.
        </p>
      )}

      <div className="flex gap-2">
        <button
          onClick={share}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-indigo-primary px-4 py-2 text-sm font-medium text-white hover:bg-indigo-600 disabled:opacity-50"
        >
          {saving ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <Share2 size={15} />
          )}{" "}
          Share{recipients.length ? ` with ${recipients.length}` : ""}
        </button>
        <button
          onClick={() => setOpen(false)}
          className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
