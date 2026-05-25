"use client";

import type { ReactNode } from "react";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { BookOpen, Sparkles, CheckSquare, NotebookText } from "lucide-react";

type SearchRecord = {
  id: string;
  type: string;
  title: string;
  subtitle: string;
  href?: string;
};

// Loose row types matching the API responses. All fields optional because
// the JSON shapes evolve over time and we want the search page to be
// resilient to missing/extra columns.
type RawCourse = {
  id?: string | number;
  title?: string;
  description?: string;
  credits?: number;
};
type RawCard = {
  front?: string;
  back?: string;
  question?: string;
  answer?: string;
};
type RawDeck = {
  id?: string | number;
  title?: string;
  description?: string;
  card_count?: number;
  cardCount?: number;
  cards?: RawCard[];
};
type RawQuizOption = { text?: string };
type RawQuizQuestion = {
  prompt?: string;
  options?: RawQuizOption[];
};
type RawQuiz = {
  id?: string | number;
  title?: string;
  course?: string;
  source?: string;
  questions?: RawQuizQuestion[];
};
type RawTask = {
  id?: string | number;
  title?: string;
  course?: string;
  description?: string;
  priority?: string;
};

function includesQuery(value: string | undefined, query: string) {
  return (value ?? "").toLowerCase().includes(query.toLowerCase());
}

// Next.js 16 requires components that call useSearchParams() to be wrapped
// in a Suspense boundary so the rest of the route can stream / prerender.
export default function SearchPage() {
  return (
    <Suspense fallback={<SearchFallback />}>
      <SearchInner />
    </Suspense>
  );
}

function SearchFallback() {
  return (
    <div className="min-h-dvh bg-white px-4 sm:px-6 md:px-10 lg:px-14.75 py-6 md:py-11.5">
      <p className="text-sm text-gray-primary">Loading search…</p>
    </div>
  );
}

function SearchInner() {
  const searchParams = useSearchParams();
  const query = (searchParams.get("q") ?? "").trim();
  const [loading, setLoading] = useState(true);
  const [results, setResults] = useState<{
    courses: SearchRecord[];
    flashcards: SearchRecord[];
    quizzes: SearchRecord[];
    tasks: SearchRecord[];
  }>({ courses: [], flashcards: [], quizzes: [], tasks: [] });

  useEffect(() => {
    let active = true;

    (async () => {
      setLoading(true);
      try {
        const [coursesResp, decksResp, quizzesResp, tasksResp] = await Promise.all([
          fetch("/api/courses"),
          fetch("/api/flashcards"),
          fetch("/api/quizzes"),
          fetch("/api/tasks"),
        ]);

        const [courses, decks, quizzes, tasks] = await Promise.all([
          coursesResp.ok ? coursesResp.json() : Promise.resolve([]),
          decksResp.ok ? decksResp.json() : Promise.resolve([]),
          quizzesResp.ok ? quizzesResp.json() : Promise.resolve([]),
          tasksResp.ok ? tasksResp.json() : Promise.resolve([]),
        ]);

        if (!active) return;

        const normalizedQuery = query.toLowerCase();
        const filteredCourses = ((Array.isArray(courses) ? courses : []) as RawCourse[])
          .filter((course) => {
            if (!normalizedQuery) return true;
            return (
              includesQuery(course?.title, normalizedQuery) ||
              includesQuery(course?.description, normalizedQuery)
            );
          })
          .map((course) => ({
            id: String(course.id),
            type: "Course",
            title: String(course.title ?? "Untitled course"),
            subtitle: `${course.credits ?? "?"} credits`,
            href: "/passing-target",
          }));

        const filteredDecks = ((Array.isArray(decks) ? decks : []) as RawDeck[])
          .filter((deck) => {
            if (!normalizedQuery) return true;
            const cardText = Array.isArray(deck?.cards)
              ? deck.cards
                  .flatMap((card: RawCard) => [card?.front, card?.back, card?.question, card?.answer])
                  .join(" ")
              : "";
            return (
              includesQuery(deck?.title, normalizedQuery) ||
              includesQuery(deck?.description, normalizedQuery) ||
              includesQuery(cardText, normalizedQuery)
            );
          })
          .map((deck) => ({
            id: String(deck.id),
            type: "Flashcards",
            title: String(deck.title ?? "Untitled deck"),
            subtitle: `${deck.card_count ?? deck.cardCount ?? deck.cards?.length ?? 0} cards`,
            href: `/flashcards/${deck.id}/review`,
          }));

        const filteredQuizzes = ((Array.isArray(quizzes) ? quizzes : []) as RawQuiz[])
          .filter((quiz) => {
            if (!normalizedQuery) return true;
            const questionText = Array.isArray(quiz?.questions)
              ? quiz.questions
                  .flatMap((question: RawQuizQuestion) => [
                    question?.prompt,
                    ...(question?.options ?? []).map((option: RawQuizOption) => option?.text),
                  ])
                  .join(" ")
              : "";
            return (
              includesQuery(quiz?.title, normalizedQuery) ||
              includesQuery(quiz?.course, normalizedQuery) ||
              includesQuery(quiz?.source, normalizedQuery) ||
              includesQuery(questionText, normalizedQuery)
            );
          })
          .map((quiz) => ({
            id: String(quiz.id),
            type: "Quiz",
            title: String(quiz.title ?? "Untitled quiz"),
            subtitle: `${quiz.questions?.length ?? 0} questions`,
            href: `/quiz-lab/${quiz.id}/preview`,
          }));

        const filteredTasks = ((Array.isArray(tasks) ? tasks : []) as RawTask[])
          .filter((task) => {
            if (!normalizedQuery) return true;
            return (
              includesQuery(task?.title, normalizedQuery) ||
              includesQuery(task?.course, normalizedQuery) ||
              includesQuery(task?.description, normalizedQuery) ||
              includesQuery(task?.priority, normalizedQuery)
            );
          })
          .map((task) => ({
            id: String(task.id),
            type: "Task",
            title: String(task.title ?? "Untitled task"),
            subtitle: `${task.course ?? "No course"} • ${task.priority ?? "Unsorted"}`,
            href: "/task-value",
          }));

        setResults({
          courses: filteredCourses,
          flashcards: filteredDecks,
          quizzes: filteredQuizzes,
          tasks: filteredTasks,
        });
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [query]);

  const totalResults = useMemo(
    () =>
      results.courses.length +
      results.flashcards.length +
      results.quizzes.length +
      results.tasks.length,
    [results],
  );

  return (
    <div className="min-h-dvh bg-white px-4 sm:px-6 md:px-10 lg:px-14.75 py-6 md:py-11.5">
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-[28px] font-semibold text-black-primary">Search</h1>
          <p className="text-sm sm:text-base text-gray-primary break-words">
            {query ? `Results for “${query}”` : "Search across your courses, tasks, flashcards, and quizzes."}
          </p>
        </div>
        <div className="self-start rounded-full bg-indigo-primary/10 px-4 py-2 text-sm font-medium text-indigo-primary whitespace-nowrap">
          {loading ? "Searching…" : `${totalResults} results`}
        </div>
      </div>

      {!query ? (
        <div className="rounded-2xl border border-dashed border-gray-300 p-10 text-center text-gray-primary">
          Use the search bar in the navbar to find study content.
        </div>
      ) : loading ? (
        <div className="rounded-2xl border border-gray-200 p-10 text-center text-gray-primary">
          Loading results…
        </div>
      ) : totalResults === 0 ? (
        <div className="rounded-2xl border border-gray-200 p-10 text-center text-gray-primary">
          No matches found.
        </div>
      ) : (
        <div className="grid gap-8">
          <SearchSection title="Courses" icon={<BookOpen size={18} />} items={results.courses} />
          <SearchSection title="Flashcards" icon={<Sparkles size={18} />} items={results.flashcards} />
          <SearchSection title="Quizzes" icon={<NotebookText size={18} />} items={results.quizzes} />
          <SearchSection title="Tasks" icon={<CheckSquare size={18} />} items={results.tasks} />
        </div>
      )}
    </div>
  );
}

function SearchSection({
  title,
  icon,
  items,
}: {
  title: string;
  icon: ReactNode;
  items: SearchRecord[];
}) {
  if (items.length === 0) return null;

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <header className="mb-4 flex items-center gap-2 text-black-primary">
        <span className="text-indigo-primary">{icon}</span>
        <h2 className="text-lg font-semibold">{title}</h2>
        <span className="ml-auto text-sm text-gray-primary">{items.length}</span>
      </header>
      <div className="grid gap-3 md:grid-cols-2">
        {items.map((item) => (
          <a
            key={`${title}-${item.id}`}
            href={item.href ?? "#"}
            className="rounded-xl border border-gray-100 p-4 transition hover:border-indigo-primary/30 hover:bg-indigo-primary/5"
          >
            <p className="text-sm font-medium text-black-primary">{item.title}</p>
            <p className="mt-1 text-sm text-gray-primary">{item.subtitle}</p>
          </a>
        ))}
      </div>
    </section>
  );
}
