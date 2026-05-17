"use client";

import { Download, CirclePlus, Sparkles, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import ExportModal from "@/components/ui/export-form";
import AddScheduleModal from "@/components/ui/add-schedule-form";
import toast from "react-hot-toast";
import { useStore, type TaskItem } from "@/store/use-store";
import {
  parseTaskDate as parseTaskDateShared,
  toLocalIsoDate as toLocalIsoDateShared,
  extractAssessmentName,
} from "@/lib/task-date";

type ScheduleType = "Class" | "Task" | "Self Study";
type ScheduleEvent = {
  id: number;
  title: ScheduleType;
  /** Optional override for the bracket label shown to the user (e.g. assessment name). */
  label?: string;
  date: string;
  time: string;
  subject: string;
  color: string;
  bgColor: string;
};

const TYPE_STYLES: Record<ScheduleType, { color: string; bgColor: string }> = {
  Class: { color: "bg-green-primary", bgColor: "bg-[#84E0A31A]" },
  Task: { color: "bg-blue-primary", bgColor: "bg-[#587ECE1A]" },
  "Self Study": { color: "bg-teal-primary", bgColor: "bg-[#6EAFBB1A]" },
};

const toLocalIsoDate = toLocalIsoDateShared;
const parseTaskDate = parseTaskDateShared;

function fmtClock(h: number, m: number): string {
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

// Parse "8 AM - 10 AM" / "8:30 AM - 10:00 AM" / "08:00 - 10:00" → minutes-of-day.
function parseTimeRange(raw: string): { start: number; end: number } | null {
  if (!raw) return null;
  const match = raw.match(
    /^\s*(\d{1,2}(?::\d{2})?\s*(?:AM|PM)?)\s*[-–]\s*(\d{1,2}(?::\d{2})?\s*(?:AM|PM)?)\s*$/i,
  );
  if (!match) return null;
  const start = parseClock(match[1]);
  const end = parseClock(match[2]);
  if (start == null || end == null) return null;
  return { start, end };
}

function parseClock(raw: string): number | null {
  const m = raw.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  const ampm = m[3]?.toUpperCase();
  if (ampm === "PM" && h < 12) h += 12;
  if (ampm === "AM" && h === 12) h = 0;
  return h * 60 + min;
}

function eventsOverlap(a: ScheduleEvent, b: ScheduleEvent): boolean {
  if (a.date !== b.date) return false;
  const ar = parseTimeRange(a.time);
  const br = parseTimeRange(b.time);
  if (!ar || !br) return false;
  return ar.start < br.end && br.start < ar.end;
}

export default function PriorityPlanner() {
  const tasks = useStore((s) => s.tasks);
  const fetchInitial = useStore((s) => s.fetchInitial);
  const plannerEvents = useStore((s) => s.plannerEvents);
  const setPlannerEvents = useStore((s) => s.setPlannerEvents);
  const hiddenTaskEventIds = useStore((s) => s.hiddenTaskEventIds);
  const setHiddenTaskEventIds = useStore((s) => s.setHiddenTaskEventIds);

  const extraEvents = plannerEvents as ScheduleEvent[];
  const setExtraEvents = (
    updater: ScheduleEvent[] | ((prev: ScheduleEvent[]) => ScheduleEvent[]),
  ) => {
    const next = typeof updater === "function" ? updater(extraEvents) : updater;
    setPlannerEvents(next);
  };
  const hiddenTaskIds = useMemo(
    () => new Set(hiddenTaskEventIds),
    [hiddenTaskEventIds],
  );
  const setHiddenTaskIds = (
    updater: Set<number> | ((prev: Set<number>) => Set<number>),
  ) => {
    const next =
      typeof updater === "function" ? updater(hiddenTaskIds) : updater;
    setHiddenTaskEventIds(Array.from(next));
  };

  useEffect(() => {
    fetchInitial().catch(() => {});
  }, [fetchInitial]);

  const taskEvents: ScheduleEvent[] = useMemo(() => {
    return tasks
      .map((task, idx): ScheduleEvent | null => {
        const parsed = parseTaskDate(task.date);
        if (!parsed.isoDate) return null;

        const estimate = parseFloat(task.timeEstimate) || 1;
        const startH = parsed.clock?.h ?? 9;
        const startM = parsed.clock?.m ?? 0;
        const totalMin = startH * 60 + startM;
        const endMin = totalMin + Math.round(estimate * 60);
        const endH = Math.floor(endMin / 60) % 24;
        const endMM = endMin % 60;
        const time = parsed.clock
          ? `${fmtClock(startH, startM)} - ${fmtClock(endH, endMM)}`
          : (task.timeEstimate ?? "—");

        const styles =
          task.priority === "Focus First"
            ? { color: "bg-red-500", bgColor: "bg-[#FFEDED]" }
            : task.priority === "If You Have Energy"
              ? { color: "bg-yellow-500", bgColor: "bg-[#FFFBED]" }
              : { color: "bg-green-primary", bgColor: "bg-[#84E0A31A]" };

        const assessmentName = extractAssessmentName(task.description);
        return {
          id: 100000 + idx,
          title: assessmentName as ScheduleType,
          label: assessmentName ?? undefined,
          date: parsed.isoDate,
          time,
          subject: `${task.course}`,
          color: styles.color,
          bgColor: styles.bgColor,
        };
      })
      .filter(
        (e): e is ScheduleEvent => e !== null && !hiddenTaskIds.has(e.id),
      );
  }, [tasks, hiddenTaskIds]);

  const events: ScheduleEvent[] = [...taskEvents, ...extraEvents];

  // Add a new event, dropping any existing event that overlaps it on the same day.
  const addEventReplacingOverlaps = (incoming: ScheduleEvent) => {
    // Hide any task-derived event that conflicts.
    const conflictingTaskIds = taskEvents
      .filter((te) => eventsOverlap(te, incoming))
      .map((te) => te.id);
    if (conflictingTaskIds.length) {
      setHiddenTaskIds((prev) => {
        const next = new Set(prev);
        for (const id of conflictingTaskIds) next.add(id);
        return next;
      });
    }
    setExtraEvents((prev) => {
      const filtered = prev.filter(
        (existing) => !eventsOverlap(existing, incoming),
      );
      return [...filtered, incoming];
    });
  };

  const handleAddSchedule = (data: {
    title: string;
    type: ScheduleType;
    date: string;
    time: string;
  }) => {
    const styles = TYPE_STYLES[data.type];
    addEventReplacingOverlaps({
      id: Date.now(),
      title: data.type,
      date: data.date,
      time: data.time,
      subject: data.title,
      color: styles.color,
      bgColor: styles.bgColor,
    });
  };

  const [aiLoading, setAiLoading] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);

  const handleAiSchedule = async () => {
    if (aiLoading) return;
    if (!tasks.length) {
      toast.error("Add or prioritize tasks first");
      return;
    }

    setAiLoading(true);
    const t = toast.loading("Building your study schedule…");

    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const startDateIso = today.toISOString().slice(0, 10);

      const parseDeadlineDays = (dateStr: string): number => {
        // task.date is "May 28, 10:22 PM" — no year. V8 defaults that to
        // 2001, so use the shared parser which injects the current year.
        const { isoDate } = parseTaskDate(dateStr);
        if (!isoDate) return 7;
        const candidate = new Date(`${isoDate}T00:00:00`);
        if (Number.isNaN(candidate.getTime())) return 7;
        const diff = Math.round(
          (candidate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
        );
        return Math.max(0, diff);
      };

      const resp = await fetch("/api/python/scheduling", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          current_grade: 68,
          passing_grade: 75,
          daily_study_hours: 6,
          start_date: startDateIso,
          analysis_method: "topsis",
          sessions: [
            { start_time: "09:00", end_time: "12:00" },
            { start_time: "13:00", end_time: "17:00" },
          ],
          tasks: tasks.map((task: TaskItem) => ({
            task_id: task.id,
            task_name: task.title,
            course: task.course,
            priority: task.priority,
            estimated_hours: Number.parseFloat(task.timeEstimate) || 2,
            deadline_days: parseDeadlineDays(task.date),
            completion_pct: 0,
          })),
        }),
      });

      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.error || `Failed (${resp.status})`);
      }

      const json = (await resp.json()) as {
        analysis_method: string;
        ranked_tasks: {
          rank: number;
          name: string;
          tier: string;
          priority_score: number;
          action: string;
        }[];
        schedule: {
          day: number;
          start_time: string;
          end_time: string;
          task_id?: string;
          task_name: string;
          hours_allocated: number;
          tier: "HIGH" | "MEDIUM" | "LOW";
          analysis_priority?: string;
        }[];
        deadline_warnings: {
          task_name: string;
          hours_missing: number;
          deadline_date: string;
        }[];
        summary: {
          total_tasks: number;
          total_hours_needed: number;
          days_needed: number;
          high_priority: number;
          medium_priority: number;
          low_priority: number;
        };
      };

      const fmtTime = (iso: string) => {
        const d = new Date(iso);
        return d.toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
        });
      };

      // Each AI block replaces any existing schedule it overlaps.
      json.schedule.forEach((block, index) => {
        addEventReplacingOverlaps({
          id: Date.now() + index,
          title: "Task" as ScheduleType,
          date: toLocalIsoDate(new Date(block.start_time)),
          time: `${fmtTime(block.start_time)} - ${fmtTime(block.end_time)}`,
          subject: `${block.task_name} · ${block.tier} (${block.hours_allocated}h)`,
          color: "bg-blue-primary",
          bgColor: "bg-[#587ECE1A]",
        });
      });

      const taskWord = json.summary.total_tasks === 1 ? "task" : "tasks";
      const dayWord = json.summary.days_needed === 1 ? "day" : "days";
      const warningNote = json.deadline_warnings.length
        ? ` ⚠️ ${json.deadline_warnings.length} ${
            json.deadline_warnings.length === 1 ? "task" : "tasks"
          } may miss deadlines.`
        : "";
      setAiSummary(
        `Scheduled ${json.summary.total_tasks} ${taskWord} across ${json.summary.days_needed} ${dayWord} ` +
          `(${json.summary.total_hours_needed}h). ` +
          `${json.summary.high_priority} HIGH · ${json.summary.medium_priority} MEDIUM · ${json.summary.low_priority} LOW.${warningNote}`,
      );
      toast.success("Schedule generated", { id: t });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed", { id: t });
    } finally {
      setAiLoading(false);
    }
  };

  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<number>(new Date().getDate());

  const [selected, setSelected] = useState<"Day" | "Week" | "Month">("Day");

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthName = currentDate.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const calendarDays = [];

  const adjustedFirstDay = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;
  for (let i = 0; i < adjustedFirstDay; i++) {
    calendarDays.push(null);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    calendarDays.push(day);
  }

  const previousDay = () => {
    const newDate = new Date(year, month, selectedDay - 1);
    setCurrentDate(newDate);
    setSelectedDay(newDate.getDate());
  };

  const nextDay = () => {
    const newDate = new Date(year, month, selectedDay + 1);
    setCurrentDate(newDate);
    setSelectedDay(newDate.getDate());
  };

  const previousWeek = () => {
    const newDate = new Date(year, month, selectedDay - 7);
    setCurrentDate(newDate);
    setSelectedDay(newDate.getDate());
  };

  const nextWeek = () => {
    const newDate = new Date(year, month, selectedDay + 7);
    setCurrentDate(newDate);
    setSelectedDay(newDate.getDate());
  };

  const previousMonth = () => {
    const newDate = new Date(year, month - 1, 1);
    setCurrentDate(newDate);
    setSelectedDay(1);
  };

  const nextMonth = () => {
    const newDate = new Date(year, month + 1, 1);
    setCurrentDate(newDate);
    setSelectedDay(1);
  };

  const getFilteredEvents = () => {
    const selectedDate = new Date(year, month, selectedDay);

    return events.filter((event) => {
      const eventDate = new Date(event.date);

      // DAY
      if (selected === "Day") {
        return eventDate.toDateString() === selectedDate.toDateString();
      }

      // WEEK
      if (selected === "Week") {
        const startOfWeek = new Date(selectedDate);
        startOfWeek.setDate(selectedDate.getDate() - selectedDate.getDay());

        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);

        return eventDate >= startOfWeek && eventDate <= endOfWeek;
      }

      // MONTH
      if (selected === "Month") {
        return (
          eventDate.getMonth() === month && eventDate.getFullYear() === year
        );
      }

      return false;
    });
  };

  const dayName =
    selected.toLowerCase() === "day"
      ? currentDate.toLocaleDateString("en-US", { weekday: "long" })
      : selected.toLowerCase() === "week"
        ? currentDate.toLocaleDateString("en-US", { weekday: "long" })
        : selected.toLowerCase() === "month"
          ? currentDate.toLocaleDateString("en-US", { weekday: "long" })
          : "";

  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isAddScheduleOpen, setIsAddScheduleOpen] = useState(false);

  return (
    <div className="flex flex-col gap-9 px-14.75 py-11.5 w-full">
      {/* Header */}
      <div className="flex flex-row justify-between items-center">
        <div className="flex flex-col">
          <h1 className="text-[28px] font-semibold text-black-primary">
            Priority Planner
          </h1>
          <p className="text-gray-primary font-medium text-sm">
            Plan your week with realistic time blocks
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleAiSchedule}
            disabled={aiLoading || !tasks.length}
            className="flex flex-row gap-2 px-3 py-2 rounded-lg border border-indigo-primary text-indigo-primary items-center cursor-pointer hover:bg-indigo-primary/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {aiLoading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Sparkles size={16} />
            )}
            Plan with AI
          </button>
          <button
            onClick={() => setIsAddScheduleOpen(true)}
            className="flex flex-row gap-2 px-3 py-2 rounded-lg bg-indigo-primary text-white items-center cursor-pointer hover:bg-indigo-500 transition-colors"
          >
            <CirclePlus size={16} />
            Add Schedule
          </button>
        </div>
      </div>

      {aiSummary && (
        <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-gray-700">
          <span className="font-medium text-indigo-primary">AI summary:</span>{" "}
          {aiSummary}
        </div>
      )}

      {/* Content */}
      <div className="flex flex-col gap-6">
        <div className="flex flex-row justify-between items-end">
          {/* repetition day/week/month */}
          <div className="flex flex-row gap-18 p-2 bg-[#3D42E51A] rounded-xl">
            {["Day", "Week", "Month"].map((label) => (
              <button
                key={label}
                className={`px-5 py-1.5 rounded-lg cursor-pointer ${
                  selected === label ? "bg-white" : ""
                }`}
                onClick={() => setSelected(label as "Day" | "Week" | "Month")}
              >
                {label}
              </button>
            ))}
          </div>

          {/* types */}
          <div className="flex flex-row gap-9">
            {getFilteredEvents().map((event) => (
              <div key={event.id} className="flex flex-row items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${event.color}`}></div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">
                    {event.title}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* dates */}
          {/* Month Navigation */}
          <div className="flex items-end justify-between">
            <button
              onClick={
                selected === "Day"
                  ? previousDay
                  : selected === "Week"
                    ? previousWeek
                    : previousMonth
              }
              className="px-2 py-1 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="Previous"
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
            <h3 className="text-lg font-medium text-gray-900">{monthName}</h3>
            <button
              onClick={
                selected === "Day"
                  ? nextDay
                  : selected === "Week"
                    ? nextWeek
                    : nextMonth
              }
              className="px-2 py-1 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="Next"
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
      </div>

      <div
        className="flex flex-col p-7 items-start self-stretch gap-5"
        style={{
          borderRadius: "16px",
          border: "1px solid rgba(204, 204, 204, 0.75)",
        }}
      >
        <h1>
          {dayName}, {selectedDay} {monthName}
        </h1>

        {/* Events for the selected date */}
        {getFilteredEvents().length === 0 ? (
          <p className="text-sm text-gray-primary italic">
            No events on this day.
          </p>
        ) : (
          getFilteredEvents().map((event) => (
            <div
              key={event.id}
              className={`flex flex-col gap-2 px-5 py-3 w-full rounded-lg ${event.bgColor}`}
            >
              <div className="flex flex-row justify-start items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${event.color}`}></div>
                <p className="text-sm font-semibold text-black-primary">
                  {event.time}
                </p>
              </div>
              <p className="text-sm font-medium text-gray-primary">
                [{event.label ?? event.title}] {event.subject}
              </p>
            </div>
          ))
        )}
      </div>

      {/* All upcoming events grouped by date — always visible regardless of the day filter above */}
      <div
        className="flex flex-col p-7 items-start self-stretch gap-5"
        style={{
          borderRadius: "16px",
          border: "1px solid rgba(204, 204, 204, 0.75)",
        }}
      >
        <h1 className="text-base font-semibold">All schedules</h1>

        {events.length === 0 ? (
          <p className="text-sm text-gray-primary italic">
            No schedules yet. Add tasks in Task Value, click &ldquo;Plan with
            AI&rdquo;, or use &ldquo;Add Schedule&rdquo; to start.
          </p>
        ) : (
          (() => {
            const sorted = [...events].sort((a, b) => {
              if (a.date !== b.date) return a.date.localeCompare(b.date);
              const ra = parseTimeRange(a.time);
              const rb = parseTimeRange(b.time);
              const sa = ra?.start ?? Number.MAX_SAFE_INTEGER;
              const sb = rb?.start ?? Number.MAX_SAFE_INTEGER;
              return sa - sb;
            });
            const groups = new Map<string, ScheduleEvent[]>();
            for (const e of sorted) {
              if (!groups.has(e.date)) groups.set(e.date, []);
              groups.get(e.date)!.push(e);
            }
            return Array.from(groups.entries()).map(([date, items]) => {
              const d = new Date(`${date}T00:00:00`);
              const label = d.toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric",
              });
              return (
                <div key={date} className="flex flex-col gap-2 w-full">
                  <p className="text-sm font-semibold text-black-primary">
                    {label}
                  </p>
                  {items.map((event) => (
                    <div
                      key={event.id}
                      className={`flex flex-col gap-2 px-5 py-3 w-full rounded-lg ${event.bgColor}`}
                    >
                      <div className="flex flex-row justify-start items-center gap-3">
                        <div
                          className={`w-3 h-3 rounded-full ${event.color}`}
                        ></div>
                        <p className="text-sm font-semibold text-black-primary">
                          {event.time}
                        </p>
                      </div>
                      <p className="text-sm font-medium text-gray-primary">
                        [{event.label ?? event.title}] {event.subject}
                      </p>
                    </div>
                  ))}
                </div>
              );
            });
          })()
        )}
      </div>

      <div className="flex justify-center">
        <button
          onClick={() => setIsExportOpen(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 text-black-primary hover:bg-gray-50 transition-colors"
        >
          <Download size={18} />
          Export
        </button>
      </div>

      <ExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        events={events}
      />

      <AddScheduleModal
        isOpen={isAddScheduleOpen}
        onClose={() => setIsAddScheduleOpen(false)}
        onAdd={handleAddSchedule}
      />
    </div>
  );
}
