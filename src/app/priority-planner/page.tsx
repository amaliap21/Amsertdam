"use client";

import { Download, CirclePlus, Sparkles, Loader2 } from "lucide-react";
import { useState } from "react";
import ExportModal from "@/components/ui/export-form";
import AddScheduleModal from "@/components/ui/add-schedule-form";
import toast from "react-hot-toast";
import { useStore, type TaskItem } from "@/store/use-store";

type ScheduleType = "Class" | "Task" | "Self Study";
type ScheduleEvent = {
  id: number;
  title: ScheduleType;
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

export default function PriorityPlanner() {
  const tasks = useStore((s) => s.tasks);
  const [events, setEvents] = useState<ScheduleEvent[]>([
    {
      id: 1,
      title: "Class",
      date: "2026-02-14",
      time: "8 AM - 10 AM",
      subject: "Data Structures and Algorithms",
      color: "bg-green-primary",
      bgColor: "bg-[#84E0A31A]",
    },
    {
      id: 2,
      title: "Task",
      date: "2026-02-15",
      time: "10 AM - 12 PM",
      subject: "Operating System Project",
      color: "bg-blue-primary",
      bgColor: "bg-[#587ECE1A]",
    },
    {
      id: 3,
      title: "Self Study",
      date: "2026-02-17",
      time: "2 PM - 3 PM",
      subject: "Computer Network",
      color: "bg-teal-primary",
      bgColor: "bg-[#6EAFBB1A]",
    },
  ]);

  const handleAddSchedule = (data: {
    title: string;
    type: ScheduleType;
    date: string;
    time: string;
  }) => {
    const styles = TYPE_STYLES[data.type];
    setEvents((prev) => [
      ...prev,
      {
        id: prev.length ? Math.max(...prev.map((e) => e.id)) + 1 : 1,
        title: data.type,
        date: data.date,
        time: data.time,
        subject: data.title,
        color: styles.color,
        bgColor: styles.bgColor,
      },
    ]);
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
    const t = toast.loading("AI is building a schedule…");

    try {
      const resp = await fetch("/api/ai/priority-planner/schedule", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tasks: tasks.map((task: TaskItem) => ({
            id: task.id,
            name: task.title,
            course: task.course,
            bucket: task.priority,
            estimatedHours: Number.parseFloat(task.timeEstimate) || undefined,
            deadline: task.date,
          })),
          constraints: {
            startDate: new Date().toISOString().slice(0, 10),
            workingHoursPerDay: 6,
          },
          contextNote: "Plan the most urgent items first and keep the load realistic.",
        }),
      });

      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.error || `Failed (${resp.status})`);
      }

      const json = (await resp.json()) as {
        summary: string;
        warnings?: string[];
        blocks: {
          taskId?: string;
          taskName: string;
          course: string;
          type: ScheduleType;
          date: string;
          startTime: string;
          endTime: string;
          rationale: string;
        }[];
      };

      setEvents((prev) => [
        ...prev,
        ...json.blocks.map((block, index) => ({
          id: prev.length + index + 1,
          title: block.type,
          date: block.date,
          time: `${block.startTime} - ${block.endTime}`,
          subject: `${block.taskName} · ${block.rationale}`,
          color:
            block.type === "Class"
              ? "bg-green-primary"
              : block.type === "Task"
                ? "bg-blue-primary"
                : "bg-teal-primary",
          bgColor:
            block.type === "Class"
              ? "bg-[#84E0A31A]"
              : block.type === "Task"
                ? "bg-[#587ECE1A]"
                : "bg-[#6EAFBB1A]",
        })),
      ]);
      setAiSummary(json.summary);
      if (json.warnings?.length) {
        toast.success(`${json.summary} ${json.warnings[0] ?? ""}`, { id: t });
      } else {
        toast.success("AI schedule generated", { id: t });
      }
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

        {/* cards iteration of events */}
        {getFilteredEvents().map((event) => (
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
              [{event.title}] {event.subject}
            </p>
          </div>
        ))}
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
