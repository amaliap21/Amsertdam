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
} from "lucide-react";
import { useCurrentUser } from "@/lib/use-current-user";
import { useStore } from "@/store/use-store";
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

/* ================================================================== */

const Navbar: React.FC<NavbarProps> = ({ className = "", onToggleSidebar }) => {
  const router = useRouter();
  const { user } = useCurrentUser();

  /* ---------- profile state ---------- */
  const [profile, setProfile] = useState<Profile | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [editName, setEditName] = useState("");
  const [editMajor, setEditMajor] = useState("");
  const [editSemester, setEditSemester] = useState("");
  const [saving, setSaving] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

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
  // Two refs: desktop and mobile search render side-by-side (each hidden
  // at the other breakpoint). Sharing one ref made `searchRef.current`
  // point to whichever rendered last (mobile), so the outside-click
  // handler thought the desktop dropdown's anchors were "outside" and
  // closed it on mousedown — before the click could navigate.
  const desktopSearchRef = useRef<HTMLDivElement>(null);
  const mobileSearchRef = useRef<HTMLDivElement>(null);

  const tasks = useStore((s) => s.tasks);
  const decks = useStore((s) => s.decks);
  const quizzes = useStore((s) => s.quizzes);
  const coursesCache = useStore((s) => s.coursesCache);

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
      const insideDesktop = desktopSearchRef.current?.contains(target) ?? false;
      const insideMobile = mobileSearchRef.current?.contains(target) ?? false;
      if (!insideDesktop && !insideMobile) {
        setShowResults(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

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
      className={`sticky top-0 z-20 flex w-full items-center gap-2 bg-white px-3 pb-3 sm:px-4 md:px-7.25 ${className}`}
      style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}
    >
      {/* Mobile hamburger, opens the sidebar drawer */}
      <button
        type="button"
        onClick={onToggleSidebar}
        aria-label="Open menu"
        className="lg:hidden flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-black-primary hover:bg-gray-100"
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

      {/* ---- Search bar with instant dropdown ---- */}
      <div ref={desktopSearchRef} className="relative hidden min-w-0 flex-1 max-w-126.25 sm:block">
        <form
          className="flex h-11 md:h-14 items-center gap-3 rounded-[100px] bg-[#F5F5F5] px-4"
          onSubmit={handleSearch}
        >
          <Search size={20} />
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
            className="bg-transparent outline-none w-full"
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

      {/* Mobile search, compact so it can sit between the hamburger and the help/profile area */}
      <div ref={mobileSearchRef} className="relative flex min-w-0 flex-1 sm:hidden">
        <form
          className="flex h-10 w-full items-center gap-2 rounded-full bg-[#F5F5F5] px-3"
          onSubmit={handleSearch}
        >
          <Search size={16} className="shrink-0" />
          <input
            type="text"
            id="search-input-mobile"
            name="search-mobile"
            value={searchValue}
            onChange={(e) => {
              setSearchValue(e.target.value);
              setShowResults(true);
            }}
            onFocus={() => searchValue.trim() && setShowResults(true)}
            placeholder="Search"
            className="w-full bg-transparent text-sm outline-none placeholder:text-gray-primary"
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

      {/* ---- Profile section ---- */}
      <div ref={profileRef} className="relative ml-auto flex items-center gap-2 sm:gap-3 shrink-0">
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
    </nav>
  );
};

export default Navbar;
