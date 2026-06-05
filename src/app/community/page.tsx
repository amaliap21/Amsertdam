"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Star,
  Users,
  UserPlus,
  UserCheck,
  Heart,
  PenLine,
  Video,
  CalendarPlus,
  Loader2,
  GraduationCap,
  BookOpenText,
} from "lucide-react";
import toast from "react-hot-toast";

/**
 * Community — RealTrack's social layer.
 * Tutors with star ratings + followers, peer articles, and tutor-led
 * "study with me/us" sessions. Backed by /api/social/*.
 */

type Tutor = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  headline: string | null;
  tutor_subjects: string[] | null;
  follower_count: number;
  rating_avg: number;
  rating_count: number;
  recommend_count: number;
  sessions_hosted: number;
  reputation: number;
  is_following: boolean;
  is_me: boolean;
};

type Article = {
  id: string;
  title: string;
  excerpt: string;
  body: string;
  course: string | null;
  tags: string[] | null;
  like_count: number;
  liked: boolean;
  is_mine: boolean;
  created_at: string;
  author: { full_name: string | null; avatar_url: string | null; is_tutor: boolean } | null;
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
  joined: boolean;
  is_host: boolean;
  host: { full_name: string | null; rating_avg: number } | null;
};

type Tab = "tutors" | "articles" | "sessions";

const Stars = ({ value, onPick }: { value: number; onPick?: (n: number) => void }) => (
  <span className="inline-flex items-center gap-0.5">
    {[1, 2, 3, 4, 5].map((n) => (
      <button
        key={n}
        type="button"
        disabled={!onPick}
        onClick={() => onPick?.(n)}
        className={onPick ? "cursor-pointer" : "cursor-default"}
        aria-label={`${n} star`}
      >
        <Star
          size={15}
          className={n <= Math.round(value) ? "fill-amber-400 text-amber-400" : "text-gray-300"}
        />
      </button>
    ))}
  </span>
);

export default function CommunityPage() {
  const [tab, setTab] = useState<Tab>("tutors");
  const [loading, setLoading] = useState(false);

  const [tutors, setTutors] = useState<Tutor[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);

  const load = useCallback(async (which: Tab) => {
    setLoading(true);
    try {
      const url =
        which === "tutors" ? "/api/social/tutors" : which === "articles" ? "/api/social/articles" : "/api/social/sessions";
      const r = await fetch(url);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Failed to load");
      if (which === "tutors") setTutors(j.tutors ?? []);
      if (which === "articles") setArticles(j.articles ?? []);
      if (which === "sessions") setSessions(j.sessions ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(tab);
  }, [tab, load]);

  // ---- actions ----
  const toggleFollow = async (t: Tutor) => {
    setTutors((prev) =>
      prev.map((x) =>
        x.id === t.id
          ? { ...x, is_following: !x.is_following, follower_count: x.follower_count + (x.is_following ? -1 : 1) }
          : x,
      ),
    );
    try {
      const r = await fetch("/api/social/follow", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ target_id: t.id }),
      });
      if (!r.ok) throw new Error();
    } catch {
      toast.error("Couldn't update follow");
      load("tutors");
    }
  };

  const rateTutor = async (t: Tutor, stars: number) => {
    try {
      const r = await fetch("/api/social/ratings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tutor_id: t.id, stars }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Failed");
      toast.success(`Rated ${t.full_name ?? "tutor"} ${stars}★`);
      setTutors((prev) =>
        prev.map((x) => (x.id === t.id ? { ...x, rating_avg: j.rating_avg ?? x.rating_avg, rating_count: j.rating_count ?? x.rating_count } : x)),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to rate");
    }
  };

  const becomeTutor = async () => {
    const headline = prompt("Your tutor headline (e.g. 'OS & Databases — I explain with diagrams')");
    if (headline === null) return;
    const subjects = prompt("Subjects you tutor (comma-separated)") ?? "";
    try {
      const r = await fetch("/api/social/tutors", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ is_tutor: true, headline, tutor_subjects: subjects.split(",").map((s) => s.trim()).filter(Boolean) }),
      });
      if (!r.ok) throw new Error();
      toast.success("You're now a tutor — host a session to start earning stars.");
      load("tutors");
    } catch {
      toast.error("Couldn't update tutor profile");
    }
  };

  const toggleLike = async (a: Article) => {
    setArticles((prev) =>
      prev.map((x) => (x.id === a.id ? { ...x, liked: !x.liked, like_count: x.like_count + (x.liked ? -1 : 1) } : x)),
    );
    try {
      const r = await fetch("/api/social/articles/like", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ article_id: a.id }),
      });
      if (!r.ok) throw new Error();
    } catch {
      load("articles");
    }
  };

  const joinSession = async (s: Session) => {
    try {
      const r = await fetch("/api/social/sessions/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ session_id: s.id }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Failed");
      load("sessions");
      if (j.joined && s.meet_url) window.open(s.meet_url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  return (
    <div className="min-h-dvh bg-white px-4 sm:px-6 md:px-10 lg:px-14.75 py-6 md:py-11.5">
      <div className="mb-6">
        <h1 className="mb-2 text-[28px] font-semibold text-black-primary">Community</h1>
        <p className="max-w-2xl text-gray-primary">
          Learn with others — find rated tutors, join &quot;study with me&quot; sessions, and read
          articles peers have written. The more you help, the more stars and followers you earn.
        </p>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-2 border-b border-gray-200">
        {([
          ["tutors", "Tutors", <Users key="t" size={16} />],
          ["articles", "Articles", <BookOpenText key="a" size={16} />],
          ["sessions", "Sessions", <Video key="s" size={16} />],
        ] as [Tab, string, React.ReactNode][]).map(([key, label, icon]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition ${
              tab === key
                ? "border-indigo-primary text-indigo-primary"
                : "border-transparent text-gray-primary hover:text-indigo-primary"
            }`}
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

      {/* TUTORS */}
      {!loading && tab === "tutors" && (
        <div>
          <div className="mb-4 flex justify-end">
            <button
              onClick={becomeTutor}
              className="flex items-center gap-2 rounded-lg bg-indigo-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-600"
            >
              <GraduationCap size={16} /> Become a tutor
            </button>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {tutors.map((t) => (
              <div key={t.id} className="rounded-2xl border border-gray-200 bg-white p-5">
                <div className="mb-2 flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-indigo-primary/10 font-semibold text-indigo-primary">
                      {(t.full_name ?? "?").charAt(0)}
                    </div>
                    <div>
                      <p className="font-semibold text-black-primary">{t.full_name ?? "Student"}</p>
                      <p className="text-xs text-gray-primary">{t.headline ?? "Tutor"}</p>
                    </div>
                  </div>
                  <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">
                    ★ {Number(t.rating_avg).toFixed(1)}
                  </span>
                </div>

                <div className="mb-3 flex flex-wrap gap-1.5">
                  {(t.tutor_subjects ?? []).slice(0, 4).map((s) => (
                    <span key={s} className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600">{s}</span>
                  ))}
                </div>

                <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                  <span>{t.follower_count} followers</span>
                  <span>{t.rating_count} ratings</span>
                  <span className="text-indigo-primary">👍 {t.recommend_count} recommend</span>
                  <span>{t.sessions_hosted} sessions</span>
                </div>

                <div className="flex items-center justify-between">
                  {!t.is_me ? (
                    <>
                      <button
                        onClick={() => toggleFollow(t)}
                        className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
                          t.is_following
                            ? "border-gray-200 text-gray-500"
                            : "border-indigo-primary text-indigo-primary hover:bg-indigo-primary/5"
                        }`}
                      >
                        {t.is_following ? <UserCheck size={15} /> : <UserPlus size={15} />}
                        {t.is_following ? "Following" : "Follow"}
                      </button>
                      <span className="flex items-center gap-1 text-xs text-gray-400">
                        Rate: <Stars value={0} onPick={(n) => rateTutor(t, n)} />
                      </span>
                    </>
                  ) : (
                    <span className="text-xs text-gray-400">This is you</span>
                  )}
                </div>
              </div>
            ))}
          </div>
          {!tutors.length && <Empty label="No tutors yet — be the first to teach." />}
        </div>
      )}

      {/* ARTICLES */}
      {!loading && tab === "articles" && (
        <div>
          <ArticleComposer onPublished={() => load("articles")} />
          <div className="mt-4 flex flex-col gap-4">
            {articles.map((a) => (
              <article key={a.id} className="rounded-2xl border border-gray-200 bg-white p-5">
                <div className="mb-1 flex items-center gap-2 text-xs text-gray-500">
                  <span className="font-medium text-black-primary">{a.author?.full_name ?? "Student"}</span>
                  {a.author?.is_tutor && <span className="rounded-full bg-indigo-primary/10 px-1.5 text-[10px] text-indigo-primary">Tutor</span>}
                  {a.course && <span>· {a.course}</span>}
                </div>
                <h3 className="mb-1 text-lg font-semibold text-black-primary">{a.title}</h3>
                <p className="mb-3 text-sm text-gray-700">{a.excerpt}{a.body.length > 220 ? "…" : ""}</p>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => toggleLike(a)}
                    className={`flex items-center gap-1.5 text-sm ${a.liked ? "text-red-500" : "text-gray-400 hover:text-red-500"}`}
                  >
                    <Heart size={15} className={a.liked ? "fill-red-500" : ""} /> {a.like_count}
                  </button>
                  {(a.tags ?? []).slice(0, 3).map((tg) => (
                    <span key={tg} className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-500">#{tg}</span>
                  ))}
                </div>
              </article>
            ))}
          </div>
          {!articles.length && <Empty label="No articles yet — share what you've learned." />}
        </div>
      )}

      {/* SESSIONS */}
      {!loading && tab === "sessions" && (
        <div>
          <SessionComposer onCreated={() => load("sessions")} />
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            {sessions.map((s) => (
              <div key={s.id} className="rounded-2xl border border-gray-200 bg-white p-5">
                <div className="mb-1 flex items-center justify-between">
                  <h3 className="font-semibold text-black-primary">{s.title}</h3>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${s.status === "full" ? "bg-red-50 text-red-600" : "bg-green-50 text-green-700"}`}>
                    {s.participant_count}/{s.capacity}
                  </span>
                </div>
                <p className="mb-1 text-xs text-gray-500">
                  Hosted by {s.host?.full_name ?? "Student"}
                  {s.host?.rating_avg ? ` · ★ ${Number(s.host.rating_avg).toFixed(1)}` : ""}
                  {s.course ? ` · ${s.course}` : ""}
                </p>
                {s.scheduled_at && (
                  <p className="mb-2 text-xs font-medium text-indigo-primary">
                    📅 {new Date(s.scheduled_at).toLocaleString(undefined, {
                      weekday: "short", day: "numeric", month: "short",
                      hour: "2-digit", minute: "2-digit",
                    })}
                  </p>
                )}
                {s.description && <p className="mb-3 text-sm text-gray-700">{s.description}</p>}
                <button
                  onClick={() => joinSession(s)}
                  disabled={s.status === "full" && !s.joined}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:opacity-50 ${
                    s.joined ? "border border-gray-200 text-gray-600" : "bg-indigo-primary text-white hover:bg-indigo-600"
                  }`}
                >
                  <Video size={15} /> {s.is_host ? "Open room" : s.joined ? "Joined — open" : "Join session"}
                </button>

                {/* Rate the host after attending (joined, not the host yourself) */}
                {s.joined && !s.is_host && (
                  <RateHost hostId={s.host_id} hostName={s.host?.full_name ?? "host"} sessionId={s.id} />
                )}
              </div>
            ))}
          </div>
          {!sessions.length && <Empty label="No sessions yet — host a 'study with me' room." />}
        </div>
      )}
    </div>
  );
}

function RateHost({ hostId, hostName, sessionId }: { hostId: string; hostName: string; sessionId: string }) {
  const [stars, setStars] = useState(0);
  const [recommend, setRecommend] = useState(false);
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async (n: number, rec: boolean) => {
    setSaving(true);
    try {
      const r = await fetch("/api/social/ratings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tutor_id: hostId, stars: n, recommend: rec, session_id: sessionId }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Failed");
      setDone(true);
      toast.success(`Thanks — you rated ${hostName} ${n}★${rec ? " and recommended them" : ""}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to rate");
    } finally {
      setSaving(false);
    }
  };

  if (done) {
    return <p className="mt-3 text-xs text-green-600">✓ Rated {stars}★{recommend ? " · recommended" : ""}</p>;
  }
  return (
    <div className="mt-3 rounded-lg border border-gray-100 bg-gray-50 p-3">
      <p className="mb-1.5 text-xs font-medium text-gray-600">Rate {hostName} after the session</p>
      <div className="flex items-center gap-3">
        <span className="inline-flex items-center gap-0.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" disabled={saving} onClick={() => setStars(n)} aria-label={`${n} star`}>
              <Star size={16} className={n <= stars ? "fill-amber-400 text-amber-400" : "text-gray-300"} />
            </button>
          ))}
        </span>
        <label className="flex items-center gap-1.5 text-xs text-gray-600">
          <input type="checkbox" checked={recommend} onChange={(e) => setRecommend(e.target.checked)} className="accent-indigo-primary" />
          Recommend
        </label>
        <button
          type="button"
          disabled={saving || stars === 0}
          onClick={() => submit(stars, recommend)}
          className="ml-auto rounded-lg bg-indigo-primary px-3 py-1 text-xs font-medium text-white hover:bg-indigo-600 disabled:opacity-50"
        >
          Submit
        </button>
      </div>
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-10 text-center text-gray-primary">
      {label}
    </div>
  );
}

function ArticleComposer({ onPublished }: { onPublished: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [course, setCourse] = useState("");
  const [saving, setSaving] = useState(false);

  const publish = async () => {
    setSaving(true);
    try {
      const r = await fetch("/api/social/articles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, body, course: course || undefined }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Failed");
      toast.success("Article published");
      setTitle("");
      setBody("");
      setCourse("");
      setOpen(false);
      onPublished();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to publish");
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="flex items-center gap-2 rounded-lg bg-indigo-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-600">
        <PenLine size={16} /> Write an article
      </button>
    );
  }
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5">
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="mb-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-primary" />
      <input value={course} onChange={(e) => setCourse(e.target.value)} placeholder="Course (optional)" className="mb-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-primary" />
      <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Share what you learned…" rows={5} className="mb-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-primary" />
      <div className="flex gap-2">
        <button onClick={publish} disabled={saving} className="flex items-center gap-2 rounded-lg bg-indigo-primary px-4 py-2 text-sm font-medium text-white hover:bg-indigo-600 disabled:opacity-50">
          {saving ? <Loader2 size={15} className="animate-spin" /> : <PenLine size={15} />} Publish
        </button>
        <button onClick={() => setOpen(false)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600">Cancel</button>
      </div>
    </div>
  );
}

function SessionComposer({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [course, setCourse] = useState("");
  const [when, setWhen] = useState("");
  const [capacity, setCapacity] = useState("8");
  const [meetUrl, setMeetUrl] = useState("");
  const [saving, setSaving] = useState(false);

  // Human-readable echo of the chosen day, date and time so the host can
  // confirm it at a glance before creating.
  const whenLabel = when
    ? new Date(when).toLocaleString(undefined, {
        weekday: "long", day: "numeric", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit",
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
        body: JSON.stringify({ title, course: course || undefined, scheduled_at: when || undefined, capacity: Number(capacity), meet_url: meetUrl.trim() }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Failed");
      toast.success("Session created");
      setTitle(""); setCourse(""); setWhen(""); setMeetUrl(""); setOpen(false);
      onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="flex items-center gap-2 rounded-lg bg-indigo-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-600">
        <CalendarPlus size={16} /> Host &quot;study with me&quot;
      </button>
    );
  }
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5">
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Session title (e.g. OS Exam Cram)" className="mb-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-primary" />
      <div className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input value={course} onChange={(e) => setCourse(e.target.value)} placeholder="Course" className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-primary" />
        <input type="number" min={2} max={50} value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder="Capacity" className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-primary" />
      </div>
      {/* When — day, date & time */}
      <label className="mb-1 block text-xs font-medium text-gray-primary">When (day, date &amp; time)</label>
      <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="mb-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-primary" />
      {whenLabel && <p className="mb-2 text-xs text-indigo-primary">📅 {whenLabel}</p>}
      {/* Host's own room link */}
      <label className="mb-1 block text-xs font-medium text-gray-primary">Meeting link (you host the room)</label>
      <input value={meetUrl} onChange={(e) => setMeetUrl(e.target.value)} placeholder="https://meet.google.com/…  or  https://zoom.us/j/…" className="mb-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-primary" />
      <div className="flex gap-2">
        <button onClick={create} disabled={saving} className="flex items-center gap-2 rounded-lg bg-indigo-primary px-4 py-2 text-sm font-medium text-white hover:bg-indigo-600 disabled:opacity-50">
          {saving ? <Loader2 size={15} className="animate-spin" /> : <CalendarPlus size={15} />} Create
        </button>
        <button onClick={() => setOpen(false)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600">Cancel</button>
      </div>
    </div>
  );
}
