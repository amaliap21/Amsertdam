"use client";
import { CircleAlert, CircleQuestionMark, CircleCheck } from "lucide-react";
import Image from "next/image";
import { useState, useEffect, useMemo } from "react";
import { useStore } from "@/store/use-store";
import { useCurrentUser } from "@/lib/use-current-user";
import { parseTaskDate, extractAssessmentName } from "@/lib/task-date";

type Tasks = {
  cardColor: string;
  type: string;
  icon: React.ReactNode;
  image: string;
  taskCount: number;
  taskCountColor: string;
  text: string;
};

type Courses = {
  courseName: string;
  credits: number;
  fromTime: number;
  toTime: number;
  typeTracking: string;
  threshold: string;
};

export default function Dashboard() {
  const { user } = useCurrentUser();
  const fetchInitial = useStore((s) => s.fetchInitial)
  const storeTasks = useStore((s) => s.tasks)
  const coursesCache = useStore((s) => s.coursesCache)

  // Derive courseItems from the persisted store cache. This renders instantly
  // on mount (from localStorage), then updates when the background fetch lands.
  const courseItems: Courses[] = useMemo(() => {
    if (!Array.isArray(coursesCache)) return []
    type CachedCourse = {
      title?: string
      course_payload?: {
        credits?: number
        threshold?: number | null
        typeTracking?: string
        scheduleEntries?: Array<{ day?: string; startTime?: string; endTime?: string }>
      }
    }
    return (coursesCache as CachedCourse[]).map((co) => {
      const payload = co.course_payload ?? {}
      const credits = Number(payload.credits) || 0
      const schedule = Array.isArray(payload.scheduleEntries) ? payload.scheduleEntries : []
      const toMin = (t?: string) => {
        if (!t || typeof t !== 'string' || !t.includes(':')) return null
        const [h, m] = t.split(':').map(Number)
        if (!Number.isFinite(h) || !Number.isFinite(m)) return null
        return h * 60 + m
      }
      let totalHours = 0
      for (const s of schedule) {
        const a = toMin(s.startTime)
        const b = toMin(s.endTime)
        if (a != null && b != null && b > a) totalHours += (b - a) / 60
      }
      const fromTime = totalHours > 0 ? Math.round(totalHours) : credits
      const toTime = fromTime
      const threshold = payload.threshold != null ? String(payload.threshold) : '—'
      const typeTracking = payload.typeTracking ?? 'On Track'
      return {
        courseName: co.title ?? 'Untitled',
        credits,
        fromTime,
        toTime,
        typeTracking,
        threshold,
      }
    })
  }, [coursesCache])

  const taskItems: Tasks[] = useMemo(() => {
    const counts: Record<string, number> = {
      "Focus First": 0,
      "If You Have Energy": 0,
      "Safe to Minimize": 0,
    }
    for (const t of storeTasks) {
      const key = t.priority ?? "If You Have Energy"
      counts[key] = (counts[key] ?? 0) + 1
    }
    return [
      {
        cardColor:
          "linear-gradient(288deg, rgba(229, 61, 61, 0.20) 34.38%, rgba(245, 150, 56, 0.20) 95.91%)",
        type: "Focus First",
        icon: <CircleAlert size={20} className="text-[#E53D3D]" />,
        image: "red-task.svg",
        taskCount: counts["Focus First"],
        taskCountColor: "#E53D3D",
        text: "High impact, worth your effort.",
      },
      {
        cardColor:
          "linear-gradient(288deg, rgba(223, 229, 61, 0.20) 34.38%, rgba(223, 245, 56, 0.20) 95.91%)",
        type: "If You Have Energy",
        icon: <CircleQuestionMark size={20} className="text-[#E5B03D]" />,
        image: "yellow-task.svg",
        taskCount: counts["If You Have Energy"],
        taskCountColor: "#E5B03D",
        text: "Helpful but this task is not critical.",
      },
      {
        cardColor:
          "linear-gradient(288deg, var(--Green, rgba(132, 224, 163, 0.20)) 34.38%, var(--Teal, rgba(110, 175, 187, 0.20)) 95.91%)",
        type: "Safe to Minimize",
        icon: <CircleCheck size={20} className="text-[#73C58F]" />,
        image: "green-task.svg",
        taskCount: counts["Safe to Minimize"],
        taskCountColor: "#73C58F",
        text: "Low impact, safe to do less.",
      },
    ]
  }, [storeTasks])

  useEffect(() => {
    // fetchInitial now batches tasks + flashcards + quizzes + courses in a
    // single parallel round-trip and is coalesced across mounts.
    fetchInitial().catch(() => {})
  }, [fetchInitial])

  const [currentDate, setCurrentDate] = useState(new Date(2026, 0, 8));
  const [selectedDay, setSelectedDay] = useState<number | null>(8);

  const events = storeTasks.slice(0, 5).map((t, i) => {
    const assessment = extractAssessmentName(t.description);
    return {
      id: i + 1,
      time: t.timeEstimate ? `${t.timeEstimate} • ${t.date}` : t.date,
      title: `[${assessment ?? "Task"}] ${t.title}`,
      color:
        t.priority === "Focus First"
          ? "bg-red-500"
          : t.priority === "If You Have Energy"
            ? "bg-yellow-500"
            : "bg-green-primary",
    };
  });

  // Map: "YYYY-MM-DD" -> set of priority dot colors (max 3: red/yellow/green).
  const priorityDotsByIso = useMemo(() => {
    const map = new Map<string, Set<"red" | "yellow" | "green">>();
    for (const task of storeTasks) {
      const { isoDate } = parseTaskDate(task.date);
      if (!isoDate) continue;
      const color =
        task.priority === "Focus First"
          ? "red"
          : task.priority === "If You Have Energy"
            ? "yellow"
            : "green";
      if (!map.has(isoDate)) map.set(isoDate, new Set());
      map.get(isoDate)!.add(color);
    }
    return map;
  }, [storeTasks]);

  const dotColorClass = (c: "red" | "yellow" | "green") =>
    c === "red" ? "bg-red-500" : c === "yellow" ? "bg-yellow-500" : "bg-green-primary";

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthName = currentDate.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const daysOfWeek = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  const calendarDays = [];

  const adjustedFirstDay = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;
  for (let i = 0; i < adjustedFirstDay; i++) {
    calendarDays.push(null);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    calendarDays.push(day);
  }

  const previousMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
    setSelectedDay(null);
  };

  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
    setSelectedDay(null);
  };

  return (
    <div className="flex flex-row justify-between gap-23 px-14.75 py-11.5">
      {/* Overviews */}
      <div className="flex flex-col gap-10 w-168.75">
        {/* Greetings */}
        <div className="flex flex-col gap-3">
          <h1 className="text-[28px] font-semibold text-black-primary">
            Hello, {user?.user_metadata?.full_name?.split(" ")[0] ?? user?.email?.split("@")[0] ?? "there"}!
          </h1>
          <p className="text-gray-primary">
            You&apos;re on track to pass your courses, without needing to
            overwork
          </p>
        </div>

        {/* Tasks Overview */}
        <div>
          <div className="flex flex-row justify-between items-center mb-5">
            <h1 className="text-[20px] font-semibold text-black-primary">
              Tasks Overview
            </h1>
            <a
              href="/task-value"
              className="text-indigo-primary underline font-medium text-sm"
            >
              See Tasks
            </a>
          </div>
          <div className="flex flex-row gap-6">
            {taskItems.map((item, index) => (
              <div
                key={index}
                className="flex-col gap-2.5 pt-4 rounded-lg w-1/3"
                style={{
                  background: item.cardColor,
                }}
              >
                <div className="flex flex-row justify-between items-center px-4">
                  <h1 className="text-sm text-black-primary font-medium ">
                    {item.type}
                  </h1>
                  {item.icon}
                </div>

                <div className="flex flex-row gap-1">
                  <Image
                    src={item.image}
                    alt={`${item.type} Tasks Graph`}
                    width={105}
                    height={87}
                    className="w-auto h-auto"
                  />
                  <div>
                    <h1 className="text-sm">
                      <span
                        className="text-xl"
                        style={{ color: item.taskCountColor }}
                      >
                        {item.taskCount}
                      </span>{" "}
                      task
                    </h1>
                    <p className="text-xs text-gray-primary">{item.text}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Courses Overview */}
        <div className="flex flex-col gap-8">
          <div className="flex flex-row justify-between items-center">
            <h1 className="text-[20px] font-semibold text-black-primary">
              Courses Overview
            </h1>
            <a
              href="/passing-target"
              className="text-indigo-primary underline font-medium text-sm"
            >
              See Courses
            </a>
          </div>

          <div className="flex flex-col gap-6">
            {courseItems.map((item, index) => (
              <div
                key={index}
                className="flex flex-row justify-between items-center bg-white p-4 rounded-lg shadow-md"
              >
                <div className="flex flex-col gap-1">
                  <div className="flex flex-row gap-3 items-center text-black-primary font-medium">
                    <h1>{item.courseName}</h1>
                    <div
                      className="py-1 px-3 text-xs font-semibold"
                      style={{
                        borderRadius: "100px",
                        border:
                          item.typeTracking === "On Track"
                            ? "1px solid rgba(115, 197, 143, 0.20)"
                            : item.typeTracking === "At Risk"
                              ? "1px solid rgba(229, 61, 61, 0.20)"
                              : "1px solid rgba(197, 178, 115, 0.20)",
                        background:
                          item.typeTracking === "On Track"
                            ? "rgba(132, 224, 163, 0.20)"
                            : item.typeTracking === "At Risk"
                              ? "rgba(229, 61, 61, 0.20)"
                              : "rgba(224, 216, 132, 0.20)",
                      }}
                    >
                      {item.typeTracking}
                    </div>
                  </div>

                  <p className="text-gray-primary text-sm">
                    {item.credits} credits • {item.fromTime}-{item.toTime}{" "}
                    hours/week
                  </p>
                </div>

                <div>
                  <p className="text-xs text-gray-primary">Pass Threshold</p>
                  <p className="text-right text-2xl font-medium">
                    {item.threshold}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Calendar */}
      <div className="max-w-md bg-white w-1/2">
        {/* Header Section */}
        <div className="flex flex-col gap-3 mb-10">
          <h1 className="text-2xl font-semibold text-gray-800">
            Want to memorize better?
          </h1>
          <a
            href="/flashcards"
            className="bg-indigo-600 text-white rounded-lg px-4 py-3 font-medium hover:bg-indigo-700 transition-colors text-center"
          >
            Create flashcards with AI
          </a>
        </div>

        {/* Priority Planner Section */}
        <div className="flex flex-row justify-between items-center mb-6">
          <h2 className="text-xl font-semibold text-gray-900">
            Priority Planner
          </h2>
          <a
            href="/priority-planner"
            className="text-indigo-600 underline font-medium text-sm hover:text-indigo-700"
          >
            See Planner
          </a>
        </div>

        {/* Month Navigation */}
        <div className="flex items-center justify-between mb-8">
          <h3 className="text-lg font-medium text-gray-900">{monthName}</h3>
          <div className="flex gap-2">
            <button
              onClick={previousMonth}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="Previous month"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
            <button
              onClick={nextMonth}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="Next month"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Calendar Grid */}
        <div className="mb-8">
          {/* Day headers */}
          <div className="grid grid-cols-7 gap-9 mb-2">
            {daysOfWeek.map((day) => (
              <div
                key={day}
                className="text-center text-sm font-medium text-gray-600 py-2"
              >
                {day}
              </div>
            ))}
          </div>

          {/* Calendar days */}
          <div className="grid grid-cols-7 gap-9">
            {calendarDays.map((day, index) => {
              const iso =
                day != null
                  ? `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
                  : "";
              const dotSet = iso ? priorityDotsByIso.get(iso) : undefined;
              // Order red → yellow → green for visual consistency, cap at 3.
              const dots: Array<"red" | "yellow" | "green"> = dotSet
                ? (["red", "yellow", "green"] as const).filter((c) => dotSet.has(c))
                : [];
              return (
                <div
                  key={index}
                  className="aspect-square flex flex-col items-center justify-center"
                >
                  {day && (
                    <>
                      <div className="flex gap-0.5 h-1.5 mb-0.5">
                        {dots.map((c) => (
                          <span
                            key={c}
                            className={`block w-1.5 h-1.5 rounded-full ${dotColorClass(c)}`}
                          />
                        ))}
                      </div>
                      <button
                        onClick={() => setSelectedDay(day)}
                        className={`w-full flex-1 flex items-center justify-center rounded-full text-sm font-medium transition-colors ${
                          day === selectedDay
                            ? "bg-indigo-600 text-white"
                            : "text-gray-900 hover:bg-gray-100"
                        }`}
                      >
                        {day}
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Events List */}
        <div className="space-y-4">
          {events.length === 0 ? (
            <p className="text-sm text-gray-primary">
              No tasks yet. Add tasks in Task Value to see them here.
            </p>
          ) : (
            events.map((event) => (
              <div key={event.id} className="flex items-start gap-3">
                <div className={`w-2 h-2 rounded-full mt-1 ${event.color}`}></div>
                <div className="flex-1">
                  <p className="text-xs text-gray-600 mb-1">{event.time}</p>
                  <p className="text-sm font-medium text-gray-900">
                    {event.title}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
