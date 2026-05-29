"use client";

import {
  Download,
  CirclePlus,
  Sparkles,
  Loader2,
  PencilLine,
  Trash2,
  Clock,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import ExportModal from "@/components/ui/export-form";
import AddScheduleModal, {
  type ScheduleInitial,
} from "@/components/ui/add-schedule-form";
import ActiveHoursForm from "@/components/ui/active-hours-form";
import toast from "react-hot-toast";
import { useStore, type TaskItem, type GanttBlock } from "@/store/use-store";
import {
  parseTaskDate as parseTaskDateShared,
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

const PRIORITY_STYLES: Record<string, { color: string; bgColor: string }> = {
  "Focus First": { color: "bg-red-500", bgColor: "bg-red-50" },
  "If You Have Energy": { color: "bg-amber-500", bgColor: "bg-amber-50" },
  "Safe to Minimize": { color: "bg-green-primary", bgColor: "bg-green-50" },
};

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

  const extraEvents = plannerEvents as ScheduleEvent[];
  const setExtraEvents = (
    updater: ScheduleEvent[] | ((prev: ScheduleEvent[]) => ScheduleEvent[]),
  ) => {
    const next = typeof updater === "function" ? updater(extraEvents) : updater;
    setPlannerEvents(next);
  };

  useEffect(() => {
    fetchInitial().catch(() => {});
  }, [fetchInitial]);

  // Derive events from tasks in the Task Value store.
  const taskEvents: ScheduleEvent[] = useMemo(() => {
    const result: ScheduleEvent[] = [];
    for (const task of tasks) {
      const { isoDate, clock } = parseTaskDate(task.date);
      if (!isoDate) continue;
      const pStyle = PRIORITY_STYLES[task.priority] ?? TYPE_STYLES.Task;
      const timeStr = clock ? fmtClock(clock.h, clock.m) : "All Day";
      const assessmentName = extractAssessmentName(task.description);
      result.push({
        id: Number(task.id) || Math.abs(hashStr(task.id)),
        title: "Task",
        label: assessmentName || task.title,
        date: isoDate,
        time: timeStr,
        subject: `${task.title}${task.course ? ` · ${task.course}` : ""}`,
        color: pStyle.color,
        bgColor: pStyle.bgColor,
      });
    }
    return result;
  }, [tasks]);

  // Priority Planner is a "when to work" view, not a "when things are
  // due" view. Task Value already owns the deadline list — showing the
  // same task-derived deadlines here was just noise.
  //
  // The planner therefore shows only:
  //   - manual entries the user added via "Add Schedule"
  //   - recommended work blocks from "Plan with AI"
  // both of which live in extraEvents. We still filter out any extra
  // event whose id happens to collide with a task id (legacy data).
  const events: ScheduleEvent[] = useMemo(() => {
    const taskIds = new Set(taskEvents.map((e) => e.id));
    return extraEvents.filter((e) => !taskIds.has(e.id));
  }, [taskEvents, extraEvents]);

  // Add a new event, dropping any existing event that overlaps it on the same day.
  const addEventReplacingOverlaps = (incoming: ScheduleEvent) => {
    setExtraEvents((prev) => {
      const filtered = prev.filter(
        (existing) => !eventsOverlap(existing, incoming),
      );
      return [...filtered, incoming];
    });
  };

  // The event being edited (if any). When set, the AddScheduleModal opens
  // pre-filled with this event's values and the submit path updates it in
  // place rather than adding a new entry.
  const [editingEvent, setEditingEvent] = useState<ScheduleEvent | null>(null);

  const handleAddSchedule = (data: {
    title: string;
    type: ScheduleType;
    date: string;
    time: string;
    repeatFreq?: "none" | "daily" | "weekly" | "monthly";
    repeatUntil?: string;
  }) => {
    const styles = TYPE_STYLES[data.type];
    if (editingEvent) {
      // Editing a recurring schedule only touches the picked occurrence
      // — other dates were saved as independent events at create time.
      setExtraEvents((prev) =>
        prev.map((e) =>
          e.id === editingEvent.id
            ? {
                ...e,
                title: data.type,
                date: data.date,
                time: data.time,
                subject: data.title,
                color: styles.color,
                bgColor: styles.bgColor,
              }
            : e,
        ),
      );
      setEditingEvent(null);
      return;
    }
    // Recurring → expand into one event per interval.
    if (data.repeatFreq && data.repeatFreq !== "none" && data.repeatUntil) {
      const startDate = new Date(`${data.date}T00:00:00`);
      const endDate = new Date(`${data.repeatUntil}T00:00:00`);
      if (
        Number.isNaN(startDate.getTime()) ||
        Number.isNaN(endDate.getTime()) ||
        endDate < startDate
      ) {
        return;
      }
      // Safety cap so a daily recurrence over a multi-year range can't
      // accidentally explode into thousands of events.
      const MAX_OCCURRENCES = 366;
      const occurrences: ScheduleEvent[] = [];
      const cursor = new Date(startDate);
      const baseId = Date.now();
      let i = 0;
      while (cursor <= endDate && i < MAX_OCCURRENCES) {
        const iso = `${cursor.getFullYear()}-${String(
          cursor.getMonth() + 1,
        ).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
        occurrences.push({
          id: baseId + i,
          title: data.type,
          date: iso,
          time: data.time,
          subject: data.title,
          color: styles.color,
          bgColor: styles.bgColor,
        });
        if (data.repeatFreq === "daily") {
          cursor.setDate(cursor.getDate() + 1);
        } else if (data.repeatFreq === "weekly") {
          cursor.setDate(cursor.getDate() + 7);
        } else {
          // Monthly — preserve day-of-month. setMonth handles month-end
          // overflow by rolling forward (e.g. Jan 31 + 1 month = Mar 3),
          // which is fine for a study planner.
          cursor.setMonth(cursor.getMonth() + 1);
        }
        i++;
      }
      if (occurrences.length === 0) return;
      setExtraEvents((prev) => {
        // Drop any pre-existing event that overlaps any new occurrence
        // — same "replace overlaps" rule the single-event path uses.
        const filtered = prev.filter(
          (existing) => !occurrences.some((o) => eventsOverlap(existing, o)),
        );
        return [...filtered, ...occurrences];
      });
      const cadence =
        data.repeatFreq === "daily"
          ? "daily"
          : data.repeatFreq === "weekly"
            ? "weekly"
            : "monthly";
      toast.success(
        `Added ${occurrences.length} ${cadence} occurrence${
          occurrences.length === 1 ? "" : "s"
        }`,
      );
      return;
    }
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

  // Is this event one the user added manually (vs derived from a Task Value
  // task)? Manual events live in `extraEvents` and are editable / deletable
  // from here; task-derived events must be managed from Task Value.
  const taskEventIds = useMemo(
    () => new Set(taskEvents.map((e) => e.id)),
    [taskEvents],
  );
  const isManualEvent = (e: ScheduleEvent) => !taskEventIds.has(e.id);

  const handleDeleteEvent = (event: ScheduleEvent) => {
    if (!isManualEvent(event)) return;
    if (!confirm("Delete this schedule?")) return;
    setExtraEvents((prev) => prev.filter((e) => e.id !== event.id));
    toast.success("Schedule deleted");
  };

  const handleEditEvent = (event: ScheduleEvent) => {
    if (!isManualEvent(event)) return;
    setEditingEvent(event);
    setIsAddScheduleOpen(true);
  };

  const editingInitial: ScheduleInitial | null = editingEvent
    ? {
        title: editingEvent.subject,
        type: editingEvent.title,
        date: editingEvent.date,
        time: editingEvent.time,
      }
    : null;

  const [aiLoading, setAiLoading] = useState(false);
  const [isActiveHoursOpen, setIsActiveHoursOpen] = useState(false);
  // AI summary + Gantt data are persisted in the store so the chart
  // doesn't vanish when the user refreshes the page.
  const aiSummary = useStore((s) => s.aiSummary);
  const setAiSummary = useStore((s) => s.setAiSummary);
  const ganttData = useStore((s) => s.ganttData);
  const setGanttData = useStore((s) => s.setGanttData);
  const activeHours = useStore((s) => s.activeHours);
  const setActiveHours = useStore((s) => s.setActiveHours);

  const handleAiSchedule = async () => {
    if (aiLoading) return;
    if (!tasks.length) {
      toast.error("Add or prioritize tasks first");
      return;
    }

    setAiLoading(true);
    const t = toast.loading("Building your study schedule…");

    try {
      // Push the planning start to tomorrow when today's active window
      // has already closed — otherwise the algorithm allocates tasks into
      // past slots that get filtered out client-side, and tight-deadline
      // tasks lose so many slots they end up with zero recommended blocks
      // ("assignment not determined"). The cutoff comes from the user's
      // configured active hours.
      const now = new Date();
      const [endH, endM] = activeHours.end.split(":").map(Number);
      const sessionsEndMinutes = endH * 60 + (endM || 0);
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      const planStart = new Date(now);
      planStart.setHours(0, 0, 0, 0);
      if (nowMinutes >= sessionsEndMinutes) {
        planStart.setDate(planStart.getDate() + 1);
      }
      const startDateIso = `${planStart.getFullYear()}-${String(
        planStart.getMonth() + 1,
      ).padStart(2, "0")}-${String(planStart.getDate()).padStart(2, "0")}`;

      const parseDeadlineDays = (dateStr: string): number => {
        const { isoDate } = parseTaskDate(dateStr);
        if (!isoDate) return 7;
        const candidate = new Date(`${isoDate}T00:00:00`);
        if (Number.isNaN(candidate.getTime())) return 7;
        const diff = Math.round(
          (candidate.getTime() - planStart.getTime()) / (1000 * 60 * 60 * 24),
        );
        return Math.max(0, diff);
      };

      // Translate user-chosen priority (Task Value bucket) into the
      // grade_weight the Python scoring uses, plus a tier we can override
      // client-side. Trusting the user's bucket beats letting the Python
      // analyzer re-score from incomplete inputs (which made every task
      // land in the MEDIUM band).

      const gradeWeightFromPriority = (
        priority: TaskItem["priority"],
      ): number =>
        priority === "Focus First"
          ? 25
          : priority === "If You Have Energy"
            ? 12
            : 5;

      // Build session windows from the user's configured active hours.
      // If they set a break, split the day into two windows around it;
      // otherwise send one continuous window. The Python scheduler can
      // consume either shape.
      const sessions: { start_time: string; end_time: string }[] = [];
      if (activeHours.breakStart && activeHours.breakEnd) {
        sessions.push({
          start_time: activeHours.start,
          end_time: activeHours.breakStart,
        });
        sessions.push({
          start_time: activeHours.breakEnd,
          end_time: activeHours.end,
        });
      } else {
        sessions.push({
          start_time: activeHours.start,
          end_time: activeHours.end,
        });
      }

      // Daily study budget = total available hours from the session windows.
      const dailyStudyHours = sessions.reduce((acc, s) => {
        const [sh, sm] = s.start_time.split(":").map(Number);
        const [eh, em] = s.end_time.split(":").map(Number);
        return acc + ((eh * 60 + (em || 0)) - (sh * 60 + (sm || 0))) / 60;
      }, 0);

      const resp = await fetch("/api/python/scheduling", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          current_grade: 68,
          passing_grade: 75,
          daily_study_hours: dailyStudyHours,
          start_date: startDateIso,
          analysis_method: "topsis",
          sessions,
          tasks: tasks.map((task: TaskItem) => ({
            task_id: task.id,
            task_name: task.title,
            course: task.course,
            priority: task.priority,
            // Help the Python scorer pick the right tier band by feeding
            // it a grade_weight derived from the user's bucket choice.
            grade_weight: gradeWeightFromPriority(task.priority),
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

      // Store schedule data for the Gantt chart.
      setGanttData(
        json.schedule.map((block) => ({
          task_name: block.task_name,
          start_time: block.start_time,
          end_time: block.end_time,
          hours_allocated: block.hours_allocated,
          tier: block.tier,
        })),
      );

      // ALSO add the schedule blocks as planner events so the user sees
      // "work on X — Tue 9-11 AM" in the day/week/month views, not just
      // the task deadlines. This is the actual answer to "when should I
      // work on each assignment".
      //
      // Tier comes straight from the scheduling API's JSON
      // ("HIGH" | "MEDIUM" | "LOW") per api/python/scheduling.py — no
      // client-side override against Task Value buckets. The Python scorer
      // already factors in the user's priority, grade weight, and deadline,
      // so the planner shows exactly what the API returned.
      type PythonTier = "HIGH" | "MEDIUM" | "LOW";
      const tierToStyle = (tier: PythonTier) =>
        tier === "HIGH"
          ? PRIORITY_STYLES["Focus First"]
          : tier === "MEDIUM"
            ? PRIORITY_STYLES["If You Have Energy"]
            : PRIORITY_STYLES["Safe to Minimize"];

      const isoDate = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
          2,
          "0",
        )}-${String(d.getDate()).padStart(2, "0")}`;

      // Any block before today is useless advice — defensive guard in
      // addition to the planStart adjustment above.
      const todayMidnight = new Date();
      todayMidnight.setHours(0, 0, 0, 0);

      // Defensive normaliser: trust the API tier as-is; if it ever drifts
      // outside the documented enum, fall back to MEDIUM so the planner
      // doesn't crash on a stylesheet lookup.
      const normalizeTier = (raw: string | undefined): PythonTier => {
        if (raw === "HIGH" || raw === "MEDIUM" || raw === "LOW") return raw;
        return "MEDIUM";
      };

      const baseAiId = Date.now();
      const aiEvents: ScheduleEvent[] = [];
      const scheduledTaskNames = new Set<string>();
      let droppedPast = 0;
      json.schedule.forEach((block, i) => {
        const start = new Date(block.start_time);
        const end = new Date(block.end_time);
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()))
          return;
        const blockDay = new Date(
          start.getFullYear(),
          start.getMonth(),
          start.getDate(),
        );
        if (blockDay < todayMidnight) {
          droppedPast++;
          return;
        }
        const tier = normalizeTier(block.tier);
        const style = tierToStyle(tier);
        scheduledTaskNames.add(block.task_name);
        aiEvents.push({
          id: baseAiId + i + 1,
          title: "Task",
          label: `Work on ${block.task_name}`,
          date: isoDate(start),
          time: `${fmtClock(start.getHours(), start.getMinutes())} - ${fmtClock(
            end.getHours(),
            end.getMinutes(),
          )}`,
          subject: `${block.task_name} · ${tier} (${block.hours_allocated}h)`,
          color: style.color,
          bgColor: style.bgColor,
        });
      });
      if (droppedPast > 0) {
        console.info(
          `[plan-with-ai] dropped ${droppedPast} block(s) scheduled before today`,
        );
      }

      // Surface tasks that ended up with zero scheduled blocks. Usually
      // this means the deadline was too close to allocate hours within
      // available sessions — the user needs to know rather than wonder
      // why their assignment isn't on the plan.
      const unscheduled = tasks.filter((t) => !scheduledTaskNames.has(t.title));
      if (unscheduled.length > 0) {
        toast.error(
          `Couldn't fit ${unscheduled.length} task${
            unscheduled.length === 1 ? "" : "s"
          } into the plan: ${unscheduled
            .map((t) => t.title)
            .join(
              ", ",
            )}. Their deadlines may be too close, or estimated hours too high for the available sessions.`,
          { duration: 8000 },
        );
      }

      // Replace any AI events from a previous run so a re-plan doesn't
      // stack new blocks on top of old ones. We detect them via the
      // "· HIGH/MEDIUM/LOW (Xh)" subject suffix — the format above.
      const aiPattern = /·\s*(?:HIGH|MEDIUM|LOW)\s*\(\d/;
      setExtraEvents((prev) => [
        ...prev.filter((e) => !aiPattern.test(e.subject)),
        ...aiEvents,
      ]);

      const taskWord = json.summary.total_tasks === 1 ? "task" : "tasks";
      const dayWord = json.summary.days_needed === 1 ? "day" : "days";
      const warningNote = json.deadline_warnings.length
        ? ` Warning: ${json.deadline_warnings.length} ${
            json.deadline_warnings.length === 1 ? "task" : "tasks"
          } may miss deadlines.`
        : "";
      setAiSummary(
        `Recommended ${json.summary.total_tasks} ${taskWord} across ${json.summary.days_needed} ${dayWord} ` +
          `(${json.summary.total_hours_needed}h working time). ` +
          `${json.summary.high_priority} HIGH, ${json.summary.medium_priority} MEDIUM, ${json.summary.low_priority} LOW.${warningNote}`,
      );
      toast.success(
        aiEvents.length > 0
          ? `Added ${aiEvents.length} recommended work block${
              aiEvents.length === 1 ? "" : "s"
            }`
          : "Schedule generated",
        { id: t },
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed", { id: t });
    } finally {
      setAiLoading(false);
    }
  };

  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<number>(new Date().getDate());

  // Default to "Week" so a newly-added task with a future deadline is
  // visible immediately instead of being hidden behind today's empty Day view.
  const [selected, setSelected] = useState<"Day" | "Week" | "Month">("Week");

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthName = currentDate.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
  const selectedDate = new Date(year, month, selectedDay);

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
    return events.filter((event) => {
      // Parse as local midnight to avoid UTC off-by-one in negative-UTC zones
      const [ey, em, ed] = event.date.split("-").map(Number);
      const eventDate = new Date(ey, em - 1, ed);

      // DAY
      if (selected === "Day") {
        return eventDate.toDateString() === selectedDate.toDateString();
      }

      // WEEK (Monday-first, matching the calendar grid)
      if (selected === "Week") {
        const dow = selectedDate.getDay();
        const mondayOffset = dow === 0 ? 6 : dow - 1;
        const startOfWeek = new Date(selectedDate);
        startOfWeek.setDate(selectedDate.getDate() - mondayOffset);

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
    <div className="flex w-full flex-col gap-9 px-4 sm:px-6 md:px-10 lg:px-14.75 py-6 md:py-11.5">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col">
          <h1 className="text-[28px] font-semibold text-black-primary">
            Priority Planner
          </h1>
          <p className="text-gray-primary font-medium text-sm">
            Plan your week with realistic time blocks
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center self-auto">
          <button
            onClick={() => setIsActiveHoursOpen(true)}
            title={
              activeHours.breakStart && activeHours.breakEnd
                ? `Active hours: ${activeHours.start}–${activeHours.breakStart}, ${activeHours.breakEnd}–${activeHours.end}`
                : `Active hours: ${activeHours.start}–${activeHours.end}`
            }
            className="flex flex-row items-center justify-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-black-primary cursor-pointer transition-colors hover:bg-gray-50"
          >
            <Clock size={16} />
            <span>
              {activeHours.start}–{activeHours.end}
            </span>
          </button>
          <button
            data-tour="plan-with-ai"
            onClick={handleAiSchedule}
            disabled={aiLoading || !tasks.length}
            className="flex flex-row items-center justify-center gap-2 rounded-lg border border-indigo-primary px-3 py-2 text-indigo-primary cursor-pointer transition-colors hover:bg-indigo-primary/5 disabled:cursor-not-allowed disabled:opacity-50"
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
            className="flex flex-row items-center justify-center gap-2 rounded-lg bg-indigo-primary px-3 py-2 text-white cursor-pointer transition-colors hover:bg-indigo-500"
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
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          {/* repetition day/week/month */}
          <div className="flex flex-wrap gap-3 p-2 bg-[#3D42E51A] rounded-xl">
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
          <div className="flex flex-wrap gap-4 xl:gap-9">
            {getFilteredEvents().map((event) => (
              <div key={event.id} className="flex flex-row items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${event.color}`}></div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">
                    {event.label ?? event.title}
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
        className="flex flex-col p-4 sm:p-7 items-start self-stretch gap-5 overflow-x-hidden"
        style={{
          borderRadius: "16px",
          border: "1px solid rgba(204, 204, 204, 0.75)",
        }}
      >
        <h1>
          {selected === "Day" && (
            <>
              {dayName}, {selectedDay} {monthName}
            </>
          )}
          {selected === "Week" &&
            (() => {
              const dow = new Date(year, month, selectedDay).getDay();
              const mondayOffset = dow === 0 ? 6 : dow - 1;
              const weekStart = new Date(
                year,
                month,
                selectedDay - mondayOffset,
              );
              const weekEnd = new Date(
                year,
                month,
                selectedDay - mondayOffset + 6,
              );
              return (
                <>
                  {weekStart.toLocaleDateString("en-US", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                  })}
                  {" — "}
                  {weekEnd.toLocaleDateString("en-US", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                  })}
                </>
              );
            })()}
          {selected === "Month" && (
            <>
              {new Date(year, month, 1).toLocaleDateString("en-US", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
              {" — "}
              {new Date(year, month + 1, 0).toLocaleDateString("en-US", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </>
          )}
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
              <div className="flex flex-row justify-between items-start gap-3">
                <div className="flex flex-row items-center gap-3 min-w-0">
                  <div
                    className={`w-3 h-3 rounded-full shrink-0 ${event.color}`}
                  ></div>
                  <p className="text-sm font-semibold text-black-primary">
                    {event.time}
                  </p>
                </div>
                {isManualEvent(event) && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      title="Edit schedule"
                      onClick={() => handleEditEvent(event)}
                      className="text-indigo-primary hover:text-indigo-600"
                    >
                      <PencilLine size={16} />
                    </button>
                    <button
                      type="button"
                      title="Delete schedule"
                      onClick={() => handleDeleteEvent(event)}
                      className="text-red-500 hover:text-red-600"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                )}
              </div>
              <p className="text-sm font-medium text-gray-primary wrap-break-word">
                [{event.label ?? event.title}] {event.subject}
              </p>
            </div>
          ))
        )}
      </div>

      {/* All upcoming events grouped by date, always visible regardless of the day filter above */}
      <div
        className="flex flex-col p-4 sm:p-7 items-start self-stretch gap-5 overflow-x-hidden"
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
                      <div className="flex flex-row justify-between items-start gap-3">
                        <div className="flex flex-row items-center gap-3 min-w-0">
                          <div
                            className={`w-3 h-3 rounded-full shrink-0 ${event.color}`}
                          ></div>
                          <p className="text-sm font-semibold text-black-primary">
                            {event.time}
                          </p>
                        </div>
                        {isManualEvent(event) && (
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              title="Edit schedule"
                              onClick={() => handleEditEvent(event)}
                              className="text-indigo-primary hover:text-indigo-600"
                            >
                              <PencilLine size={16} />
                            </button>
                            <button
                              type="button"
                              title="Delete schedule"
                              onClick={() => handleDeleteEvent(event)}
                              className="text-red-500 hover:text-red-600"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        )}
                      </div>
                      <p className="text-sm font-medium text-gray-primary wrap-break-word">
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

      {/* Gantt chart, calendar-based, shown after AI schedule generation */}
      {ganttData && ganttData.length > 0 && (
        <GanttChart
          data={ganttData}
          viewMode={selected}
          anchorDate={selectedDate}
        />
      )}

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
        tasks={tasks}
      />

      <AddScheduleModal
        isOpen={isAddScheduleOpen}
        onClose={() => {
          setIsAddScheduleOpen(false);
          setEditingEvent(null);
        }}
        onAdd={handleAddSchedule}
        initial={editingInitial}
      />

      {isActiveHoursOpen && (
        <ActiveHoursForm
          initial={activeHours}
          onSubmit={(hours) => {
            setActiveHours(hours);
            setIsActiveHoursOpen(false);
            toast.success("Active hours updated");
          }}
          onCancel={() => setIsActiveHoursOpen(false)}
        />
      )}
    </div>
  );
}

// Simple string hash for stable task IDs.
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h;
}

// ─── Gantt Chart Component ───────────────────────────────────────────────────

type GanttView = "Day" | "Week" | "Month";

const TIER_COLORS: Record<string, string> = {
  HIGH: "#ef4444",
  MEDIUM: "#f59e0b",
  LOW: "#22c55e",
};

const TIER_LABELS: Record<string, string> = {
  HIGH: "High priority",
  MEDIUM: "Medium priority",
  LOW: "Low priority",
};

function GanttChart({
  data,
  viewMode,
  anchorDate,
}: {
  data: GanttBlock[];
  viewMode: GanttView;
  anchorDate: Date;
}) {
  const anchor = new Date(anchorDate);
  anchor.setHours(0, 0, 0, 0);

  const rangeStart = new Date(anchor);
  const rangeEnd = new Date(anchor);
  if (viewMode === "Day") {
    rangeEnd.setHours(23, 59, 59, 999);
  } else if (viewMode === "Week") {
    const dow = anchor.getDay();
    const mondayOffset = dow === 0 ? 6 : dow - 1;
    rangeStart.setDate(anchor.getDate() - mondayOffset);
    rangeStart.setHours(0, 0, 0, 0);
    rangeEnd.setTime(rangeStart.getTime());
    rangeEnd.setDate(rangeStart.getDate() + 6);
    rangeEnd.setHours(23, 59, 59, 999);
  } else {
    rangeStart.setDate(1);
    rangeStart.setHours(0, 0, 0, 0);
    rangeEnd.setMonth(rangeStart.getMonth() + 1, 0);
    rangeEnd.setHours(23, 59, 59, 999);
  }

  const totalMs = rangeEnd.getTime() - rangeStart.getTime();
  if (totalMs <= 0) return null;

  const clampToRange = (start: Date, end: Date) => {
    const s = new Date(Math.max(start.getTime(), rangeStart.getTime()));
    const e = new Date(Math.min(end.getTime(), rangeEnd.getTime()));
    return { start: s, end: e };
  };

  const taskMap = new Map<
    string,
    {
      segments: { start: Date; end: Date; tier: string; hours: number }[];
      minStart: Date;
      maxEnd: Date;
      totalH: number;
      tierRank: number;
    }
  >();

  const tierRank = (tier: string) =>
    tier === "HIGH" ? 3 : tier === "MEDIUM" ? 2 : tier === "LOW" ? 1 : 0;

  for (const block of data) {
    const s = new Date(block.start_time);
    const e = new Date(block.end_time);
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) continue;
    if (e < rangeStart || s > rangeEnd) continue;
    const { start, end } = clampToRange(s, e);
    const name = block.task_name || "Task";
    const entry = taskMap.get(name);
    const blockTier = block.tier ?? "MEDIUM";
    const segment = {
      start,
      end,
      tier: blockTier,
      hours: block.hours_allocated ?? 0,
    };
    if (!entry) {
      taskMap.set(name, {
        segments: [segment],
        minStart: start,
        maxEnd: end,
        totalH: segment.hours,
        tierRank: tierRank(blockTier),
      });
    } else {
      entry.segments.push(segment);
      if (start < entry.minStart) entry.minStart = start;
      if (end > entry.maxEnd) entry.maxEnd = end;
      entry.totalH += segment.hours;
      entry.tierRank = Math.max(entry.tierRank, tierRank(blockTier));
    }
  }

  if (!taskMap.size) return null;

  const taskOrder = Array.from(taskMap.entries())
    .sort((a, b) => a[1].minStart.getTime() - b[1].minStart.getTime())
    .map(([name]) => name);

  const getTierByRank = (rank: number) =>
    rank >= 3 ? "HIGH" : rank === 2 ? "MEDIUM" : "LOW";

  const rows = taskOrder.map((name) => {
    const info = taskMap.get(name)!;
    if (viewMode === "Month") {
      return {
        name,
        segments: [
          {
            start: info.minStart,
            end: info.maxEnd,
            tier: getTierByRank(info.tierRank),
            hours: info.totalH,
          },
        ],
        totalH: info.totalH,
      };
    }
    return {
      name,
      segments: info.segments,
      totalH: info.totalH,
    };
  });

  const formatHour = (h: number) => {
    const period = h >= 12 ? "PM" : "AM";
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    return `${hour12} ${period}`;
  };

  const dayCount =
    Math.floor((rangeEnd.getTime() - rangeStart.getTime()) / 86400000) + 1;

  const ticks: { label: string; leftPct: number; widthPct: number }[] = [];
  if (viewMode === "Day") {
    const step = 3;
    for (let h = 0; h <= 24; h += step) {
      const tick = new Date(rangeStart);
      tick.setHours(h, 0, 0, 0);
      const leftPct = ((tick.getTime() - rangeStart.getTime()) / totalMs) * 100;
      ticks.push({
        label: h < 24 ? formatHour(h) : "",
        leftPct,
        widthPct: (step / 24) * 100,
      });
    }
  } else {
    const labelStep =
      viewMode === "Month" ? (dayCount > 21 ? 3 : dayCount > 14 ? 2 : 1) : 1;
    for (let i = 0; i < dayCount; i++) {
      const tick = new Date(rangeStart);
      tick.setDate(rangeStart.getDate() + i);
      const leftPct = ((tick.getTime() - rangeStart.getTime()) / totalMs) * 100;
      const label =
        i % labelStep === 0
          ? tick.toLocaleDateString("en-US", {
              weekday: viewMode === "Week" ? "short" : undefined,
              month: "short",
              day: "numeric",
            })
          : "";
      ticks.push({
        label,
        leftPct,
        widthPct: 100 / dayCount,
      });
    }
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayPct = ((today.getTime() - rangeStart.getTime()) / totalMs) * 100;
  const showToday = todayPct >= 0 && todayPct <= 100;
  const todayLabel = today.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

  const rowH = 36;
  const minChartWidth =
    viewMode === "Day" ? 520 : viewMode === "Week" ? 680 : 760;

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-[rgba(204,204,204,0.75)] p-5 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-base font-semibold">Study Schedule</h1>
          <p className="text-xs text-gray-500">
            {viewMode} view · {dayCount} day{dayCount === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-600">
          {(["HIGH", "MEDIUM", "LOW"] as const).map((tier) => (
            <div key={tier} className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: TIER_COLORS[tier] }}
              />
              <span>{TIER_LABELS[tier]}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="w-full overflow-x-auto">
        <div className="flex min-w-[320px]" style={{ minWidth: minChartWidth }}>
          <div className="shrink-0 pr-3 flex flex-col justify-end w-[120px] sm:w-[160px]">
            <div style={{ height: 28 }} />
            {rows.map((row) => (
              <div
                key={row.name}
                className="flex items-center text-xs font-medium text-gray-700 truncate"
                style={{ height: rowH }}
                title={row.name}
              >
                {row.name}
              </div>
            ))}
            {showToday && <div style={{ height: 20 }} />}
          </div>

          <div className="flex-1 min-w-0 relative">
            <div className="relative mb-4" style={{ height: 28 }}>
              {ticks.map((t, i) =>
                t.label ? (
                  <span
                    key={i}
                    className="absolute text-[10px] sm:text-xs font-semibold text-gray-600 text-center"
                    style={{
                      left: `${t.leftPct}%`,
                      width: `${t.widthPct}%`,
                      top: 4,
                    }}
                  >
                    {t.label}
                  </span>
                ) : null,
              )}
            </div>

            <div
              className="relative w-full bg-gray-50 border border-gray-200 rounded-lg overflow-hidden"
              style={{ height: rows.length * rowH }}
            >
              {ticks.map((t, i) => (
                <div
                  key={i}
                  className="absolute top-0 bottom-0 border-l border-gray-200"
                  style={{ left: `${t.leftPct}%` }}
                />
              ))}

              {rows.map((_, i) => (
                <div
                  key={i}
                  className="absolute left-0 right-0 border-b border-gray-100"
                  style={{ top: (i + 1) * rowH }}
                />
              ))}

              {showToday && (
                <div
                  className="absolute top-0 bottom-0 z-10 pointer-events-none"
                  style={{
                    left: `${todayPct}%`,
                    borderLeft: "2px dashed #3b82f6",
                  }}
                />
              )}

              {rows.map((row, i) =>
                row.segments.map((seg, idx) => {
                  const barLeft =
                    ((seg.start.getTime() - rangeStart.getTime()) / totalMs) *
                    100;
                  const barWidth =
                    ((seg.end.getTime() - seg.start.getTime()) / totalMs) * 100;
                  const color = TIER_COLORS[seg.tier] ?? "#9ca3af";
                  return (
                    <div
                      key={`${row.name}-${idx}`}
                      className="absolute flex items-center"
                      style={{
                        top: i * rowH + 6,
                        left: `${barLeft}%`,
                        width: `${Math.max(barWidth, 1)}%`,
                        height: rowH - 12,
                      }}
                      title={`${row.name}: ${seg.hours}h (${seg.tier})`}
                    >
                      <div
                        className="w-full h-full rounded-full"
                        style={{ backgroundColor: color }}
                      />
                    </div>
                  );
                }),
              )}
            </div>

            {showToday && (
              <div
                className="relative pointer-events-none"
                style={{ height: 20 }}
              >
                <span
                  className="absolute -translate-x-1/2 text-[10px] font-bold text-blue-500 whitespace-nowrap leading-none px-1 py-0.5 bg-white rounded shadow-sm border border-blue-100"
                  style={{ left: `${todayPct}%`, top: 4 }}
                >
                  Now · {todayLabel}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
