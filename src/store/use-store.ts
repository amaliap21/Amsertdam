import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

export type GeneratedFlashcard = { front: string; back: string };

export type ImageOcrRegion = {
  bbox: [number, number, number, number];
  char: string;
  confidence: number;
};

export type FlashcardDeck = {
  id: string;
  title: string;
  description: string;
  cardCount: number;
  cards: { id: string; question: string; answer: string }[];
  createdAt: string;
  /** When set, this deck is an OCR cover-and-reveal image deck. */
  imageMode?: {
    imageDataUrl: string;
    width: number;
    height: number;
    regions: ImageOcrRegion[];
  };
};

export type GeneratedQuizQuestion = {
  id: string;
  prompt: string;
  options: { letter: "A" | "B" | "C" | "D"; text: string }[];
  correctAnswer: "A" | "B" | "C" | "D";
};

export type GeneratedQuiz = {
  id: string;
  title: string;
  course: string;
  source: string;
  questions: GeneratedQuizQuestion[];
  createdAt: string;
};

export type TaskPriority =
  | "Focus First"
  | "If You Have Energy"
  | "Safe to Minimize";

export type TaskItem = {
  id: string;
  title: string;
  course: string;
  date: string;
  timeEstimate: string;
  priority: TaskPriority;
  description: string;
  effort: string;
};

export type PlannerEventType = "Class" | "Task" | "Self Study";

export type PlannerEvent = {
  id: number;
  title: PlannerEventType;
  /** Optional bracket-label override (e.g. assessment name from a task). */
  label?: string;
  date: string; // YYYY-MM-DD (local)
  time: string; // "8:00 AM - 10:00 AM"
  subject: string;
  color: string;
  bgColor: string;
};

export type GanttBlock = {
  task_name: string;
  start_time: string;
  end_time: string;
  hours_allocated: number;
  tier: "HIGH" | "MEDIUM" | "LOW";
};

// Mirrors AnalysisResult from @/lib/ai/prompt (kept local so the store
// doesn't pull in server-side AI code).
export type AiAnalysis = {
  verdict: "correct" | "partially_correct" | "incorrect";
  score: number;
  feedback: string;
  mistakes: string[];
  concept: string;
};

export type QuizAttempt = {
  id: string;
  quizId: string;
  quizTitle: string;
  course: string;
  correct: number;
  total: number;
  answers: Record<string, "A" | "B" | "C" | "D">;
  completedAt: string;
};

interface AppState {
  decks: FlashcardDeck[];
  setDecks: (d: FlashcardDeck[]) => void;
  addDeck: (
    data:
      | { deckName: string; cards: GeneratedFlashcard[] }
      | {
          deckName: string;
          kind: "image";
          imageDataUrl: string;
          width: number;
          height: number;
          regions: ImageOcrRegion[];
        },
  ) => string;

  quizzes: GeneratedQuiz[];
  setQuizzes: (q: GeneratedQuiz[]) => void;
  addQuiz: (
    data: Omit<GeneratedQuiz, "id" | "createdAt"> & { id?: string },
  ) => Promise<string>;

  tasks: TaskItem[];
  addTask: (task: Omit<TaskItem, "id"> & { id?: string }) => Promise<string>;
  removeTask: (id: string) => Promise<void>;
  removeDeck: (id: string) => Promise<void>;
  removeQuiz: (id: string) => Promise<void>;
  setTasks: (tasks: TaskItem[]) => void;

  plannerEvents: PlannerEvent[];
  setPlannerEvents: (events: PlannerEvent[]) => void;
  hiddenTaskEventIds: number[];
  setHiddenTaskEventIds: (ids: number[]) => void;

  // Gantt chart + AI summary live in the store so the "Plan with AI"
  // results survive page refreshes. Without persistence the chart blanks
  // out whenever the user navigates away and back.
  ganttData: GanttBlock[] | null;
  setGanttData: (data: GanttBlock[] | null) => void;
  aiSummary: string | null;
  setAiSummary: (summary: string | null) => void;

  // Persisted AI answer analyses, keyed by `${quizId}:${questionId}` so the
  // graded feedback on the Study Companion review page survives a refresh.
  aiAnalyses: Record<string, AiAnalysis>;
  setAiAnalysis: (key: string, analysis: AiAnalysis) => void;

  // Shared AI usage counters so every Analyze button shows the SAME daily
  // free count / premium balance (they're one global pool). Fetched fresh
  // on mount; persisted only to avoid a flash of "…" before that lands.
  aiRemaining: number | null;
  aiCredits: number | null;
  setAiUsage: (usage: { remaining?: number; credits?: number }) => void;

  // Cached courses for fast first paint on the dashboard. Persisted so the
  // courses overview doesn't blank out between navigations / refreshes.
  coursesCache: unknown[];
  setCoursesCache: (courses: unknown[]) => void;
  fetchCourses: () => Promise<void>;

  attempts: QuizAttempt[];
  recordAttempt: (
    attempt: Omit<QuizAttempt, "id" | "completedAt"> & {
      id?: string;
      completedAt?: string;
    },
  ) => string;
  removeAttempt: (id: string) => void;

  fetchInitial: () => Promise<void>;
}

function uid(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export const useStore = create<AppState>()(
  devtools(
    persist(
      (set, get) => ({
        decks: [],
        addDeck: (data) => {
          const id = uid("deck");
          // Image-mode (OCR cover-and-reveal). The image payload is encoded in
          // a single sentinel "card" so we can reuse the existing flashcards
          // endpoint and schema without a migration.
          if ("kind" in data && data.kind === "image") {
            const { deckName, imageDataUrl, width, height, regions } = data;
            const sentinelCard = {
              front: "__image_mode__",
              back: JSON.stringify({ imageDataUrl, width, height, regions }),
            };
            (async () => {
              try {
                const resp = await fetch("/api/flashcards", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({
                    title: deckName,
                    description: `OCR · ${regions.length} characters detected`,
                    cards: [sentinelCard],
                  }),
                });
                if (resp.ok) {
                  const body = await resp.json();
                  set((state) => ({
                    decks: [
                      ...state.decks,
                      {
                        id: body.id,
                        title: body.title,
                        description: body.description,
                        cardCount: regions.length,
                        cards: [],
                        createdAt: body.created_at,
                        imageMode: { imageDataUrl, width, height, regions },
                      },
                    ],
                  }));
                  return;
                }
              } catch {
                /* fall through to local */
              }
              set((state) => ({
                decks: [
                  ...state.decks,
                  {
                    id,
                    title: deckName,
                    description: `OCR · ${regions.length} characters detected`,
                    cardCount: regions.length,
                    cards: [],
                    createdAt: new Date().toISOString(),
                    imageMode: { imageDataUrl, width, height, regions },
                  },
                ],
              }));
            })();
            return id;
          }
          // Text-mode (Claude-generated cards from a PDF).
          // TS can't narrow off the `"kind" in data` check above on its own,
          // so assert the text-mode shape here.
          const { deckName, cards } = data as {
            deckName: string;
            cards: GeneratedFlashcard[];
          };
          (async () => {
            try {
              const resp = await fetch("/api/flashcards", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  title: deckName,
                  description: `${cards.length} flashcards generated by AI`,
                  cards: cards.map((c) => ({ front: c.front, back: c.back })),
                }),
              });
              if (resp.ok) {
                const body = await resp.json();
                set((state) => ({
                  decks: [
                    ...state.decks,
                    {
                      id: body.id,
                      title: body.title,
                      description: body.description,
                      cardCount: body.card_count,
                      cards: ((body.cards || []) as Array<{
                        front?: string;
                        back?: string;
                        question?: string;
                        answer?: string;
                      }>).map((c, i: number) => ({
                        id: `${body.id}_${i}`,
                        question: c.front ?? c.question ?? "",
                        answer: c.back ?? c.answer ?? "",
                      })),
                      createdAt: body.created_at,
                    },
                  ],
                }));
                return;
              }
            } catch {
              /* fall through */
            }
            set((state) => ({
              decks: [
                ...state.decks,
                {
                  id,
                  title: deckName,
                  description: `${cards.length} flashcards generated by AI`,
                  cardCount: cards.length,
                  cards: cards.map((c, i) => ({
                    id: `${id}_${i}`,
                    question: c.front,
                    answer: c.back,
                  })),
                  createdAt: new Date().toISOString(),
                },
              ],
            }));
          })();
          return id;
        },

        quizzes: [],
        setQuizzes: (q) => set({ quizzes: q }),
        addQuiz: async (data) => {
          const id = data.id ?? uid("quiz");
          try {
            const resp = await fetch('/api/quizzes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: data.title, course: data.course, source: data.source, questions: data.questions }) })
            if (resp.ok) {
              const body = await resp.json()
              set((state) => ({ quizzes: [...state.quizzes, {
                id: body.id,
                title: body.title,
                course: body.course,
                source: body.source,
                questions: body.questions,
                createdAt: body.created_at,
              }] }))
              return body.id
            }
          } catch {
            // fallback local
            set((state) => ({ quizzes: [...state.quizzes, { id, title: data.title, course: data.course, source: data.source, questions: data.questions, createdAt: new Date().toISOString() }] }))
          }
          return id
        },

        tasks: [],
        attempts: [],
        recordAttempt: (attempt) => {
          const id = attempt.id ?? uid("attempt");
          set((state) => {
            const filtered = state.attempts.filter((a) => a.quizId !== attempt.quizId);
            return {
              attempts: [
                {
                  id,
                  quizId: attempt.quizId,
                  quizTitle: attempt.quizTitle,
                  course: attempt.course,
                  correct: attempt.correct,
                  total: attempt.total,
                  answers: attempt.answers,
                  completedAt: attempt.completedAt ?? new Date().toISOString(),
                },
                ...filtered,
              ],
            };
          });
          return id;
        },
        removeAttempt: (id) => {
          set((state) => ({ attempts: state.attempts.filter((a) => a.id !== id) }));
        },
        setDecks: (d) => set({ decks: d }),
        addTask: async (task) => {
          const id = task.id ?? uid('task')
          const localTask = { id, title: task.title, course: task.course, date: task.date, timeEstimate: task.timeEstimate, priority: task.priority, description: task.description, effort: task.effort }
          try {
            const resp = await fetch('/api/tasks', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: task.title, course: task.course, date: task.date, estimatedHours: task.timeEstimate ? Number(String(task.timeEstimate).replace('h','')) : null, priority: task.priority, description: task.description, effort: task.effort }) })
            if (resp.ok) {
              const body = await resp.json()
              set((state) => ({ tasks: [ body, ...state.tasks ] }))
              return body.id
            }
          } catch {
            // network error — fallback local
          }
          set((state) => ({ tasks: [ localTask, ...state.tasks ] }))
          return id
        },
        removeTask: async (id) => {
          try {
            await fetch(`/api/tasks?id=${id}`, { method: 'DELETE' })
            set((state) => ({ tasks: state.tasks.filter(t => t.id !== id) }))
          } catch {
            set((state) => ({ tasks: state.tasks.filter(t => t.id !== id) }))
          }
        },
        removeDeck: async (id) => {
          try { await fetch(`/api/flashcards?id=${id}`, { method: 'DELETE' }) } catch {}
          set((state) => ({ decks: state.decks.filter(d => d.id !== id) }))
        },
        removeQuiz: async (id) => {
          try { await fetch(`/api/quizzes?id=${id}`, { method: 'DELETE' }) } catch {}
          // Cascade-delete attempts that belong to this quiz so its Study
          // Companion entry disappears automatically. Study Companion is
          // strictly a live mirror of "quizzes you can still take", once
          // the quiz is gone, the review/chat for it should be gone too.
          set((state) => ({
            quizzes: state.quizzes.filter((q) => q.id !== id),
            attempts: state.attempts.filter((a) => a.quizId !== id),
          }))
        },
        setTasks: (tasks) => set({ tasks }),
        plannerEvents: [],
        setPlannerEvents: (plannerEvents) => set({ plannerEvents }),
        hiddenTaskEventIds: [],
        setHiddenTaskEventIds: (hiddenTaskEventIds) => set({ hiddenTaskEventIds }),
        ganttData: null,
        setGanttData: (ganttData) => set({ ganttData }),
        aiAnalyses: {},
        setAiAnalysis: (key, analysis) =>
          set((state) => ({
            aiAnalyses: { ...state.aiAnalyses, [key]: analysis },
          })),
        aiRemaining: null,
        aiCredits: null,
        setAiUsage: ({ remaining, credits }) =>
          set((state) => ({
            aiRemaining: remaining ?? state.aiRemaining,
            aiCredits: credits ?? state.aiCredits,
          })),
        aiSummary: null,
        setAiSummary: (aiSummary) => set({ aiSummary }),
        coursesCache: [],
        setCoursesCache: (coursesCache) => set({ coursesCache }),
        fetchCourses: async () => {
          const w = globalThis as unknown as { __realtrackCoursesFetch?: Promise<void> }
          if (w.__realtrackCoursesFetch) return w.__realtrackCoursesFetch
          const run = (async () => {
            try {
              const r = await fetch('/api/courses')
              if (!r.ok) return
              const data = await r.json()
              if (Array.isArray(data)) set({ coursesCache: data })
            } catch {
              // ignore
            } finally {
              setTimeout(() => { delete w.__realtrackCoursesFetch }, 2000)
            }
          })()
          w.__realtrackCoursesFetch = run
          return run
        },
        fetchInitial: async () => {
          // Coalesce concurrent calls so multiple page mounts share one fetch.
          const w = globalThis as unknown as { __realtrackInitialFetch?: Promise<void> }
          if (w.__realtrackInitialFetch) return w.__realtrackInitialFetch
          const run = (async () => {
            try {
              const [tResp, fResp, qResp, cResp] = await Promise.all([
                fetch('/api/tasks'),
                fetch('/api/flashcards'),
                fetch('/api/quizzes'),
                fetch('/api/courses'),
              ])
              const [tasks, decks, quizzes, courses] = await Promise.all([
                tResp.ok ? tResp.json() : Promise.resolve(null),
                fResp.ok ? fResp.json() : Promise.resolve(null),
                qResp.ok ? qResp.json() : Promise.resolve(null),
                cResp.ok ? cResp.json() : Promise.resolve(null),
              ])
              // Never overwrite local data with empty API results, protects
              // against transient API failures, missing env vars, etc.
              const cur = get()
              const next: Partial<AppState> = {}
              if (Array.isArray(tasks) && (tasks.length > 0 || cur.tasks.length === 0)) next.tasks = tasks
              if (Array.isArray(decks) && (decks.length > 0 || cur.decks.length === 0)) {
                type RawDeck = {
                  id: string
                  title: string
                  description?: string | null
                  card_count?: number
                  created_at: string
                  cards?: Array<{ front?: string; back?: string }>
                }
                type ImagePayload = {
                  imageDataUrl: string
                  width: number
                  height: number
                  regions: ImageOcrRegion[]
                }
                next.decks = (decks as RawDeck[]).map((d) => {
                  // Image-mode decks store their payload in a single sentinel card.
                  const cards = Array.isArray(d.cards) ? d.cards : []
                  const sentinel = cards.find((c) => c?.front === "__image_mode__")
                  if (sentinel) {
                    try {
                      const payload = JSON.parse(sentinel.back ?? "") as ImagePayload
                      return {
                        id: d.id,
                        title: d.title,
                        description: d.description ?? "",
                        cardCount: Array.isArray(payload.regions) ? payload.regions.length : 0,
                        cards: [] as FlashcardDeck["cards"],
                        createdAt: d.created_at,
                        imageMode: {
                          imageDataUrl: payload.imageDataUrl,
                          width: payload.width,
                          height: payload.height,
                          regions: payload.regions || [],
                        },
                      }
                    } catch {
                      /* fall through to text rendering */
                    }
                  }
                  return {
                    id: d.id,
                    title: d.title,
                    description: d.description ?? "",
                    cardCount: d.card_count ?? 0,
                    cards: cards.map((c, i) => ({ id: `${d.id}_${i}`, question: c.front ?? "", answer: c.back ?? "" })),
                    createdAt: d.created_at,
                  }
                })
              }
              if (Array.isArray(quizzes) && (quizzes.length > 0 || cur.quizzes.length === 0)) {
                type RawQuiz = {
                  id: string
                  title: string
                  course: string
                  source: string
                  questions?: GeneratedQuiz["questions"]
                  created_at: string
                }
                next.quizzes = (quizzes as RawQuiz[]).map((q) => ({
                  id: q.id,
                  title: q.title,
                  course: q.course,
                  source: q.source,
                  questions: q.questions || [],
                  createdAt: q.created_at,
                }))
              }
              if (Array.isArray(courses) && (courses.length > 0 || cur.coursesCache.length === 0)) next.coursesCache = courses
              if (Object.keys(next).length) set(next)
            } catch {
              // ignore
            } finally {
              // Allow a fresh fetch after a short cooldown so navigation between
              // pages doesn't refetch on every mount but data is never too stale.
              setTimeout(() => { delete w.__realtrackInitialFetch }, 2000)
            }
          })()
          w.__realtrackInitialFetch = run
          return run
        },
      }),
      {
        name: "realtrack-storage",
        // Bump this whenever the persisted shape changes incompatibly so
        // existing localStorage state runs through `migrate`.
        version: 2,
        migrate: (persisted: unknown, fromVersion: number) => {
          const state = (persisted ?? {}) as Partial<AppState>;
          // v1 → v2: wipe Study Companion history. Attempts are now strictly
          // tied to live quizzes, so stale attempts (whose quiz is gone)
          // would be orphaned. Cleanest fix is to drop them all once.
          if (fromVersion < 2) {
            return { ...state, attempts: [] };
          }
          return state;
        },
      },
    ),
  ),
);
