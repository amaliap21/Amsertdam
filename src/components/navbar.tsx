"use client";
import Image from "next/image";
import Link from "next/link";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Pencil,
  X,
  Loader2,
  BookOpen,
  Sparkles,
  NotebookText,
  CheckSquare,
  HelpCircle,
  Menu,
  Bell,
  Zap,
} from "lucide-react";
import { useCurrentUser } from "@/lib/use-current-user";
import { useStore } from "@/store/use-store";
import { useAiUsageOnMount } from "@/lib/use-ai-analyze";
import BuyCreditsModal from "@/components/ui/buy-credits-modal";
import { parseTaskDate, toLocalIsoDate } from "@/lib/task-date";
import toast from "react-hot-toast";

interface NavbarProps {
  className?: string;
  /** Toggles the layout-level sidebar drawer. Used by the mobile hamburger. */
  onToggleSidebar?: () => void;
}

/* ------------------------------------------------------------------ */
/*  Profile types                                                      */
/* ------------------------------------------------------------------ */
type Profile = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  major: string | null;
  semester: number | null;
};

/* ------------------------------------------------------------------ */
/*  Instant-search result type                                         */
/* ------------------------------------------------------------------ */
type QuickResult = {
  id: string;
  type: "Course" | "Flashcard" | "Quiz" | "Task";
  title: string;
  subtitle: string;
  href: string;
};

const TYPE_ICON: Record<string, React.ReactNode> = {
  Course: <BookOpen size={14} />,
  Flashcard: <Sparkles size={14} />,
  Quiz: <NotebookText size={14} />,
  Task: <CheckSquare size={14} />,
};

function includesQ(value: string | undefined | null, q: string) {
  return (value ?? "").toLowerCase().includes(q);
}

const REMINDER_MORNING_HOUR = 9;
const REMINDER_MORNING_MIN = 0;
const REMINDER_WINDOW_MS = 60 * 1000;
const REMINDER_CHECK_MS = 30 * 1000;
const REMINDER_HISTORY_KEY = "realtrack-reminder-history";

function parseClock(raw: string): { h: number; m: number } | null {
  const match = raw.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!match) return null;
  let h = Number(match[1]);
  const m = match[2] ? Number(match[2]) : 0;
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  const ampm = match[3]?.toUpperCase();
  if (ampm === "PM" && h < 12) h += 12;
  if (ampm === "AM" && h === 12) h = 0;
  if (!ampm && h >= 24) return null;
  return { h, m };
}

function parseTimeRangeStart(raw: string): { h: number; m: number } | null {
  if (!raw) return null;
  if (/all\s*day/i.test(raw)) return null;
  const match = raw.match(/^\s*([^–-]+)\s*[–-]/);
  if (!match) return null;
  return parseClock(match[1]);
}

function dateAtLocalMorning(isoDate: string, dayOffset = 0): Date | null {
  const parts = isoDate.split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
  const [y, m, d] = parts;
  return new Date(y, m - 1, d + dayOffset, REMINDER_MORNING_HOUR, REMINDER_MORNING_MIN, 0, 0);
}

function loadReminderHistory(): Record<string, number> {
  try {
    const raw = localStorage.getItem(REMINDER_HISTORY_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, number>;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed;
  } catch {
    return {};
  }
}

function saveReminderHistory(map: Record<string, number>) {
  localStorage.setItem(REMINDER_HISTORY_KEY, JSON.stringify(map));
}

/* ================================================================== */

const Navbar: React.FC<NavbarProps> = ({ className = "", onToggleSidebar }) => {
  const router = useRouter();
  const { user } = useCurrentUser();

  /* ---------- AI usage (free + premium credits) ---------- */
  // Lives in the navbar so the counters sit beside the search bar and bell on
  // every page, and stay in sync from one global store pool.
  const { remaining, credits } = useAiUsageOnMount();
  const [buyOpen, setBuyOpen] = useState(false);

  /* ---------- profile state ---------- */
  const [profile, setProfile] = useState<Profile | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [editName, setEditName] = useState("");
  const [editMajor, setEditMajor] = useState("");
  const [editSemester, setEditSemester] = useState("");
  const [saving, setSaving] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const [showNotifications, setShowNotifications] = useState(false);

  // Fetch profile on mount (auto-creates if missing via API).
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const r = await fetch("/api/profile");
        if (r.ok) {
          const p: Profile = await r.json();
          setProfile(p);
          setEditName(p.full_name ?? "");
          setEditMajor(p.major ?? "");
          setEditSemester(p.semester != null ? String(p.semester) : "");
        }
      } catch {
        /* ignore */
      }
    })();
  }, [user]);

  // Close profile dropdown on outside click.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        profileRef.current &&
        !profileRef.current.contains(e.target as Node)
      ) {
        setShowProfile(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const saveProfile = async () => {
    setSaving(true);
    try {
      const r = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          full_name: editName.trim() || null,
          major: editMajor.trim() || null,
          semester: editSemester ? Number(editSemester) : null,
        }),
      });
      if (r.ok) {
        const p: Profile = await r.json();
        setProfile(p);
        toast.success("Profile updated");
        setShowProfile(false);
      } else {
        toast.error("Failed to save profile");
      }
    } catch {
      toast.error("Failed to save profile");
    } finally {
      setSaving(false);
    }
  };

  /* ---------- display values ---------- */
  const displayName =
    profile?.full_name ??
    user?.user_metadata?.full_name ??
    user?.email ??
    "Your profile";
  const displayEmail = user?.email ?? "Signed in";
  const avatarUrl =
    profile?.avatar_url ?? user?.user_metadata?.avatar_url ?? null;
  const initials = useMemo(() => {
    const source = String(displayName || "U");
    return source
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "U")
      .join("");
  }, [displayName]);

  /* ---------- instant search ---------- */
  const [searchValue, setSearchValue] = useState("");
  const [showResults, setShowResults] = useState(false);
  // One search element, made responsive via CSS (full-width second row on
  // mobile, inline on sm+), so a single ref drives the outside-click handler.
  const searchRef = useRef<HTMLDivElement>(null);

  const tasks = useStore((s) => s.tasks);
  const decks = useStore((s) => s.decks);
  const quizzes = useStore((s) => s.quizzes);
  const coursesCache = useStore((s) => s.coursesCache);
  const plannerEvents = useStore((s) => s.plannerEvents);
  const notificationEnabled = useStore((s) => s.notificationEnabled);
  const setNotificationEnabled = useStore((s) => s.setNotificationEnabled);

  const quickResults: QuickResult[] = useMemo(() => {
    const q = searchValue.trim().toLowerCase();
    if (!q) return [];
    const out: QuickResult[] = [];
    const MAX = 8;

    for (const c of coursesCache as Array<{
      id?: string;
      title?: string;
      description?: string;
      credits?: number;
    }>) {
      if (out.length >= MAX) break;
      if (includesQ(c.title, q) || includesQ(c.description, q)) {
        out.push({
          id: String(c.id),
          type: "Course",
          title: String(c.title ?? "Untitled"),
          subtitle: `${c.credits ?? "?"} credits`,
          href: "/passing-target",
        });
      }
    }
    for (const d of decks) {
      if (out.length >= MAX) break;
      if (includesQ(d.title, q) || includesQ(d.description, q)) {
        out.push({
          id: d.id,
          type: "Flashcard",
          title: d.title,
          subtitle: `${d.cardCount} cards`,
          href: `/flashcards/${d.id}/review`,
        });
      }
    }
    for (const qz of quizzes) {
      if (out.length >= MAX) break;
      if (
        includesQ(qz.title, q) ||
        includesQ(qz.course, q) ||
        includesQ(qz.source, q)
      ) {
        out.push({
          id: qz.id,
          type: "Quiz",
          title: qz.title,
          subtitle: `${qz.questions.length} questions`,
          href: `/quiz-lab/${qz.id}/preview`,
        });
      }
    }
    for (const t of tasks) {
      if (out.length >= MAX) break;
      if (
        includesQ(t.title, q) ||
        includesQ(t.course, q) ||
        includesQ(t.description, q)
      ) {
        out.push({
          id: t.id,
          type: "Task",
          title: t.title,
          subtitle: `${t.course} · ${t.priority}`,
          href: "/task-value",
        });
      }
    }
    return out;
  }, [searchValue, coursesCache, decks, quizzes, tasks]);

  // Close search dropdown on outside click.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!(searchRef.current?.contains(target) ?? false)) {
        setShowResults(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (notificationsRef.current?.contains(target)) return;
      setShowNotifications(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  type ReminderTarget = {
    key: string;
    title: string;
    start: Date;
    hasTime: boolean;
  };

  const reminderTargets: ReminderTarget[] = useMemo(() => {
    const out: ReminderTarget[] = [];
    for (const task of tasks) {
      const { isoDate, clock } = parseTaskDate(task.date);
      if (!isoDate) continue;
      if (clock) {
        const start = new Date(`${isoDate}T00:00:00`);
        start.setHours(clock.h, clock.m, 0, 0);
        out.push({
          key: `task:${task.id}`,
          title: `${task.title}${task.course ? ` · ${task.course}` : ""}`,
          start,
          hasTime: true,
        });
      } else {
        const morning = dateAtLocalMorning(isoDate);
        if (!morning) continue;
        out.push({
          key: `task:${task.id}`,
          title: `${task.title}${task.course ? ` · ${task.course}` : ""}`,
          start: morning,
          hasTime: false,
        });
      }
    }
    for (const ev of plannerEvents) {
      if (!ev?.date) continue;
      const startClock = parseTimeRangeStart(ev.time || "");
      if (startClock) {
        const start = new Date(`${ev.date}T00:00:00`);
        start.setHours(startClock.h, startClock.m, 0, 0);
        out.push({
          key: `planner:${ev.id}`,
          title: `${ev.label ?? ev.subject}`,
          start,
          hasTime: true,
        });
      } else {
        const morning = dateAtLocalMorning(ev.date);
        if (!morning) continue;
        out.push({
          key: `planner:${ev.id}`,
          title: `${ev.label ?? ev.subject}`,
          start: morning,
          hasTime: false,
        });
      }
    }
    return out;
  }, [tasks, plannerEvents]);

  useEffect(() => {
    if (!notificationEnabled) return;
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) return;
    if (Notification.permission !== "granted") return;

    const checkReminders = () => {
      const now = new Date();
      const history = loadReminderHistory();
      const cutoff = now.getTime() - 7 * 24 * 60 * 60 * 1000;
      let mutated = false;

      for (const [key, ts] of Object.entries(history)) {
        if (ts < cutoff) {
          delete history[key];
          mutated = true;
        }
      }

      for (const target of reminderTargets) {
        const reminders: Array<{ id: string; time: Date; kind: "day-before" | "short" | "day-of" }> = [];
        if (target.hasTime) {
          reminders.push({
            id: `${target.key}:day-before`,
            time: new Date(target.start.getTime() - 24 * 60 * 60 * 1000),
            kind: "day-before",
          });
          reminders.push({
            id: `${target.key}:short`,
            time: new Date(target.start.getTime() - 30 * 60 * 1000),
            kind: "short",
          });
        } else {
          const iso = toLocalIsoDate(target.start);
          reminders.push({
            id: `${target.key}:day-before`,
            time: dateAtLocalMorning(iso, -1) ?? target.start,
            kind: "day-before",
          });
          reminders.push({
            id: `${target.key}:day-of`,
            time: dateAtLocalMorning(iso, 0) ?? target.start,
            kind: "day-of",
          });
        }

        for (const reminder of reminders) {
          const ts = reminder.time.getTime();
          if (Number.isNaN(ts)) continue;
          if (now.getTime() < ts || now.getTime() - ts > REMINDER_WINDOW_MS) continue;
          if (history[reminder.id]) continue;

          let body = "";
          if (reminder.kind === "short") {
            body = `${target.title} starts at ${target.start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}.`;
          } else if (reminder.kind === "day-before") {
            body = `${target.title} is coming tomorrow.`;
            if (target.hasTime) {
              body = `${target.title} starts tomorrow at ${target.start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}.`;
            }
          } else {
            body = `${target.title} is scheduled for today.`;
          }

          new Notification("Study reminder", { body });
          history[reminder.id] = now.getTime();
          mutated = true;
        }
      }

      if (mutated) saveReminderHistory(history);
    };

    checkReminders();
    const handle = window.setInterval(checkReminders, REMINDER_CHECK_MS);
    return () => window.clearInterval(handle);
  }, [notificationEnabled, reminderTargets]);

  const handleSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setShowResults(false);
      const next = searchValue.trim();
      router.push(next ? `/search?q=${encodeURIComponent(next)}` : "/search");
    },
    [searchValue, router],
  );

  return (
    <nav
      className={`sticky top-0 z-20 flex w-full flex-wrap items-center gap-x-2 gap-y-2 bg-white px-3 pb-3 sm:flex-nowrap sm:px-4 md:px-7.25 ${className}`}
      style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}
    >
      {/* Mobile hamburger, opens the sidebar drawer */}
      <button
        type="button"
        onClick={onToggleSidebar}
        aria-label="Open menu"
        className="order-1 lg:hidden flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-black-primary hover:bg-gray-100 sm:order-none"
      >
        <Menu size={22} />
      </button>

      <section className="hidden shrink-0 items-center justify-center lg:flex">
        <Image
          src="/logo.svg"
          alt="RealTrack Logo"
          width={187}
          height={64}
          className="h-10 w-auto md:h-16"
          loading="eager"
        />
      </section>

      {/* ---- Search bar with instant dropdown ----
          One element, made responsive: on mobile it's `order-last w-full` so
          flex-wrap drops it onto its own row below the controls; on sm+ it sits
          inline and grows (flex-1). */}
      <div
        ref={searchRef}
        className="relative order-last w-full min-w-0 sm:order-none sm:w-auto sm:flex-1 sm:max-w-126.25"
      >
        <form
          className="flex h-11 md:h-14 items-center gap-3 rounded-[100px] bg-[#F5F5F5] px-4"
          onSubmit={handleSearch}
        >
          <Search size={20} className="shrink-0" />
          <input
            type="text"
            id="search-input"
            name="search"
            value={searchValue}
            onChange={(e) => {
              setSearchValue(e.target.value);
              setShowResults(true);
            }}
            onFocus={() => searchValue.trim() && setShowResults(true)}
            placeholder="Search courses, tasks, flashcards, quizzes"
            className="w-full bg-transparent outline-none"
            autoComplete="off"
          />
        </form>

        {showResults && searchValue.trim() && (
          <div className="absolute top-full left-0 right-0 mt-2 z-50 rounded-2xl border border-gray-200 bg-white shadow-lg max-h-96 overflow-y-auto">
            {quickResults.length === 0 ? (
              <div className="p-4 text-sm text-gray-primary text-center">
                No matches, press Enter for full search
              </div>
            ) : (
              <div className="py-2">
                {quickResults.map((r) => (
                  <Link
                    key={`${r.type}-${r.id}`}
                    href={r.href}
                    onClick={() => setShowResults(false)}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-indigo-primary/5 transition-colors"
                  >
                    <span className="text-indigo-primary">
                      {TYPE_ICON[r.type]}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-black-primary truncate">
                        {r.title}
                      </p>
                      <p className="text-xs text-gray-primary truncate">
                        {r.subtitle}
                      </p>
                    </div>
                    <span className="text-[10px] uppercase tracking-wider text-gray-400 shrink-0">
                      {r.type}
                    </span>
                  </Link>
                ))}
                <button
                  type="button"
                  onClick={handleSearch as unknown as React.MouseEventHandler}
                  className="w-full px-4 py-2 text-xs text-indigo-primary hover:bg-indigo-primary/5 border-t border-gray-100"
                >
                  View all results
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ---- AI usage + buy credits ---- */}
      {/* Now that search drops to its own row on mobile, there's room to show
          the full "free today" / "premium credits" labels and the "Buy credits"
          button at every breakpoint. */}
      <div
        data-tour="ai-credits"
        className="order-3 w-full flex items-center justify-center gap-2 sm:order-none sm:w-auto sm:ml-auto sm:shrink-0 sm:justify-end"
      >
        <span className="inline-flex flex-1 sm:flex-none items-center justify-center whitespace-nowrap rounded-full bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 sm:py-1.5 sm:text-xs">
          {remaining ?? "…"} free today
        </span>
        <span className="flex flex-1 sm:flex-none items-center justify-center gap-1 whitespace-nowrap rounded-full bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-primary sm:py-1.5 sm:text-xs">
          <Zap size={12} className="shrink-0" />
          {credits ?? "…"} premium credits
        </span>
        <button
          type="button"
          data-tour="buy-credits"
          onClick={() => setBuyOpen(true)}
          className="flex-1 sm:flex-none whitespace-nowrap rounded-lg bg-indigo-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-600 sm:px-3 sm:py-1.5 sm:text-xs"
        >
          Buy credits
        </button>
      </div>

      {/* ---- Profile section ---- */}
      {/* order-2 + ml-auto keeps the bell/help/avatar on the top-right row on
          mobile (next to the hamburger); reset on sm+ so it sits inline. */}
      <div
        ref={profileRef}
        className="order-2 ml-auto relative flex items-center gap-2 shrink-0 sm:order-none sm:ml-0 sm:gap-3"
      >
        <div ref={notificationsRef} className="relative">
          <button
            type="button"
            aria-label="Notifications"
            onClick={() => setShowNotifications((v) => !v)}
            className="flex h-10 w-10 items-center justify-center rounded-full text-gray-primary transition hover:bg-gray-100 hover:text-indigo-primary"
          >
            <Bell size={20} />
            {notificationEnabled && (
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-emerald-500" />
            )}
          </button>

          {showNotifications && (
            <div className="absolute right-0 top-full mt-2 z-50 w-[calc(100vw-1.5rem)] max-w-72 rounded-2xl border border-gray-200 bg-white p-4 shadow-lg">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-black-primary">Notifications</p>
                <span className="text-[10px] uppercase tracking-wider text-gray-400">
                  Client only
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-black-primary">Study reminders</p>
                  <p className="text-xs text-gray-primary">1 day + 30 min before</p>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    if (typeof window === "undefined") return;
                    if (!("Notification" in window)) {
                      toast.error("Notifications aren't supported in this browser.");
                      return;
                    }
                    if (!notificationEnabled) {
                      let permission = Notification.permission;
                      if (permission !== "granted") {
                        permission = await Notification.requestPermission();
                      }
                      if (permission !== "granted") {
                        toast.error("Notification permission denied.");
                        setNotificationEnabled(false);
                        return;
                      }
                      setNotificationEnabled(true);
                      toast.success("Notifications enabled");
                    } else {
                      setNotificationEnabled(false);
                      toast("Notifications muted");
                    }
                  }}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${notificationEnabled ? "bg-emerald-500" : "bg-gray-300"
                    }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${notificationEnabled ? "translate-x-5" : "translate-x-1"
                      }`}
                  />
                </button>
              </div>
              <p className="mt-3 text-[11px] text-gray-500">
                Reminders use your device time and only fire while the app is open.
              </p>
            </div>
          )}
        </div>

        <button
          type="button"
          title="Replay the onboarding tour"
          aria-label="Replay the onboarding tour"
          onClick={() => {
            window.__startTour?.();
          }}
          className="flex h-10 w-10 items-center justify-center rounded-full text-gray-primary transition hover:bg-gray-100 hover:text-indigo-primary"
        >
          <HelpCircle size={20} />
        </button>

        <button
          type="button"
          onClick={() => {
            setShowProfile((v) => !v);
            if (profile) {
              setEditName(profile.full_name ?? "");
              setEditMajor(profile.major ?? "");
              setEditSemester(
                profile.semester != null ? String(profile.semester) : "",
              );
            }
          }}
          className="flex items-center gap-2 sm:gap-3 cursor-pointer"
        >
          {/* Name + email, hide on mobile to save horizontal space */}
          <div className="hidden md:flex flex-col text-right">
            <span className="font-medium text-black-primary">
              {displayName}
            </span>
            <span className="text-[14px] text-gray-primary">
              {displayEmail}
            </span>
          </div>
          <div className="relative flex h-10 w-10 md:h-13 md:w-13 shrink-0 items-center justify-center rounded-full border-2 border-gray-500 bg-indigo-primary text-sm font-semibold text-white overflow-hidden">
            {avatarUrl ? (
              <Image
                src={avatarUrl}
                alt="Avatar"
                fill
                className="object-cover"
                sizes="52px"
              />
            ) : (
              initials || "U"
            )}
          </div>
          <span className="absolute bottom-0 right-0 flex h-4 w-4 items-center justify-center rounded-full bg-white shadow border border-gray-300">
            <Pencil size={10} className="text-gray-600" />
          </span>
        </button>

        {/* Profile edit dropdown */}
        {showProfile && (
          <div className="absolute top-full right-0 mt-2 z-50 w-80 rounded-2xl border border-gray-200 bg-white p-5 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-black-primary">Edit Profile</h3>
              <button
                type="button"
                onClick={() => setShowProfile(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-indigo-primary text-white font-semibold overflow-hidden">
                {avatarUrl ? (
                  <Image
                    src={avatarUrl}
                    alt=""
                    width={48}
                    height={48}
                    className="object-cover w-full h-full"
                  />
                ) : (
                  initials
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-black-primary truncate">
                  {displayName}
                </p>
                <p className="text-xs text-gray-primary truncate">
                  {displayEmail}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-primary mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-black-primary focus:outline-none focus:ring-2 focus:ring-indigo-primary"
                  placeholder="Your name"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-primary mb-1">
                  Major
                </label>
                <input
                  type="text"
                  value={editMajor}
                  onChange={(e) => setEditMajor(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-black-primary focus:outline-none focus:ring-2 focus:ring-indigo-primary"
                  placeholder="e.g. Computer Science"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-primary mb-1">
                  Semester
                </label>
                <input
                  type="number"
                  min={1}
                  max={14}
                  value={editSemester}
                  onChange={(e) => setEditSemester(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-black-primary focus:outline-none focus:ring-2 focus:ring-indigo-primary"
                  placeholder="e.g. 3"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={saveProfile}
              disabled={saving}
              className="mt-4 w-full flex items-center justify-center gap-2 rounded-lg bg-indigo-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-600 transition-colors disabled:opacity-60"
            >
              {saving ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Saving…
                </>
              ) : (
                "Save Changes"
              )}
            </button>
          </div>
        )}
      </div>

      <BuyCreditsModal isOpen={buyOpen} onClose={() => setBuyOpen(false)} />
    </nav>
  );
};

export default Navbar;
