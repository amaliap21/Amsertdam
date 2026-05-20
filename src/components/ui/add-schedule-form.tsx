"use client";

import { useEffect, useState } from "react";
import { X, ChevronDown } from "lucide-react";
import toast from "react-hot-toast";

// Convert a 24-hour "HH:MM" time to a 12-hour display ("1 PM" / "1:30 PM")
// so the combined range matches the format the planner expects.
function formatTime12(hhmm: string): string {
  if (!hhmm) return "";
  const [hStr, mStr] = hhmm.split(":");
  const h = Number(hStr);
  const m = Number(mStr);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour12} ${period}` : `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

// Convert a 12-hour fragment ("1 PM" / "1:30 PM" / "13:00") back to "HH:MM"
// for the native <input type="time"> control.
function parseTime24(raw: string): string {
  if (!raw) return "";
  const m = raw.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!m) return "";
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  const ampm = m[3]?.toUpperCase();
  if (ampm === "PM" && h < 12) h += 12;
  if (ampm === "AM" && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

// Split a stored "1 PM - 3 PM" range into start/end 24-hour values.
function splitTimeRange(range: string): { start: string; end: string } {
  if (!range) return { start: "", end: "" };
  const parts = range.split(/\s*[-–]\s*/);
  if (parts.length !== 2) return { start: "", end: "" };
  return { start: parseTime24(parts[0]), end: parseTime24(parts[1]) };
}

export type ScheduleInitial = {
  title: string;
  type: ScheduleType;
  date: string;
  time: string;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onAdd?: (data: {
    title: string;
    type: ScheduleType;
    date: string;
    time: string;
  }) => void;
  /** When provided, the modal opens in "edit" mode pre-filled with these values. */
  initial?: ScheduleInitial | null;
};

const TYPES = [
  { value: "Class", color: "bg-green-primary" },
  { value: "Task", color: "bg-blue-primary" },
  { value: "Self Study", color: "bg-teal-primary" },
] as const;

type ScheduleType = (typeof TYPES)[number]["value"];

export default function AddScheduleModal({ isOpen, onClose, onAdd, initial }: Props) {
  const isEdit = !!initial;
  const [title, setTitle] = useState(initial?.title ?? "");
  const [type, setType] = useState<ScheduleType>(initial?.type ?? "Class");
  const [date, setDate] = useState(initial?.date ?? "");
  const initialRange = initial ? splitTimeRange(initial.time) : { start: "", end: "" };
  const [startTime, setStartTime] = useState(initialRange.start);
  const [endTime, setEndTime] = useState(initialRange.end);
  const [typeOpen, setTypeOpen] = useState(false);

  // Resync inputs when the parent swaps `initial` in-place (e.g. user clicks
  // Edit on a different schedule without remounting the modal).
  useEffect(() => {
    if (!isOpen) return;
    setTitle(initial?.title ?? "");
    setType(initial?.type ?? "Class");
    setDate(initial?.date ?? "");
    const r = initial ? splitTimeRange(initial.time) : { start: "", end: "" };
    setStartTime(r.start);
    setEndTime(r.end);
    setTypeOpen(false);
  }, [isOpen, initial]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !type || !date || !startTime || !endTime) {
      toast.error("Please fill in all required fields");
      return;
    }
    if (startTime >= endTime) {
      toast.error("End time must be after start time");
      return;
    }
    // Build the same "1 PM - 3 PM" range string the planner already parses
    // via parseTimeRange, so this stays compatible with existing events.
    const time = `${formatTime12(startTime)} - ${formatTime12(endTime)}`;
    onAdd?.({ title, type, date, time });
    toast.success(isEdit ? "Schedule updated" : "Schedule added");
    if (!isEdit) {
      setTitle("");
      setType("Class");
      setDate("");
      setStartTime("");
      setEndTime("");
    }
    onClose();
  };

  const selectedColor =
    TYPES.find((t) => t.value === type)?.color ?? "bg-gray-300";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <form
        onSubmit={handleSubmit}
        className="relative w-[calc(100vw-0.5rem)] max-w-[20.5rem] max-h-[90dvh] overflow-y-auto rounded-2xl bg-white px-2.5 pb-2.5 pt-9 shadow-xl sm:w-full sm:max-w-lg sm:px-6 sm:pb-6 sm:pt-6"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-6 top-6 text-gray-500 hover:text-black-primary"
          aria-label="Close"
        >
          <X size={20} />
        </button>

        <div className="mb-6 flex flex-col gap-1">
          <h2 className="text-[24px] font-semibold text-black-primary">
            {isEdit ? "Edit Schedule" : "Add Schedule"}
          </h2>
          <p className="text-sm text-gray-primary">
            {isEdit ? "Update this schedule's details" : "Add your own schedule here"}
          </p>
        </div>

        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-black-primary">
              Title*
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Computer Network Study"
              className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-indigo-primary"
            />
          </div>

          <div className="relative flex flex-col gap-2">
            <label className="text-sm font-medium text-black-primary">
              Type*
            </label>
            <button
              type="button"
              onClick={() => setTypeOpen((v) => !v)}
              className="flex w-full items-center justify-between rounded-lg border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-indigo-primary"
            >
              <span className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${selectedColor}`} />
                {type}
              </span>
              <ChevronDown size={16} className="text-gray-500" />
            </button>
            {typeOpen && (
              <ul className="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
                {TYPES.map((t) => (
                  <li key={t.value}>
                    <button
                      type="button"
                      onClick={() => {
                        setType(t.value);
                        setTypeOpen(false);
                      }}
                      className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-gray-50"
                    >
                      <span className={`h-2.5 w-2.5 rounded-full ${t.color}`} />
                      {t.value}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex flex-col gap-2 min-w-0">
            <label
              htmlFor="schedule-date"
              className="text-sm font-medium text-black-primary"
            >
              Date*
            </label>
            <input
              id="schedule-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full min-w-0 max-w-full rounded-lg border border-gray-200 px-3 sm:px-4 py-2.5 text-base sm:text-sm outline-none focus:border-indigo-primary"
              style={{ WebkitAppearance: "none" }}
            />
          </div>

          <div className="grid grid-cols-2 gap-4 sm:gap-5">
            <div className="flex flex-col gap-2 min-w-0">
              <label
                htmlFor="schedule-start-time"
                className="text-sm font-medium text-black-primary"
              >
                Start Time*
              </label>
              <input
                id="schedule-start-time"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full min-w-0 max-w-full rounded-lg border border-gray-200 px-2 sm:px-3 py-2.5 text-base sm:text-sm outline-none focus:border-indigo-primary"
                style={{ WebkitAppearance: "none" }}
              />
            </div>

            <div className="flex flex-col gap-2 min-w-0">
              <label
                htmlFor="schedule-end-time"
                className="text-sm font-medium text-black-primary"
              >
                End Time*
              </label>
              <input
                id="schedule-end-time"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full min-w-0 max-w-full rounded-lg border border-gray-200 px-2 sm:px-3 py-2.5 text-base sm:text-sm outline-none focus:border-indigo-primary"
                style={{ WebkitAppearance: "none" }}
              />
            </div>
          </div>
        </div>

        <button
          type="submit"
          className="mt-8 w-full rounded-lg bg-indigo-primary py-2.5 text-sm font-medium text-white transition hover:opacity-90"
        >
          {isEdit ? "Save Changes" : "Add Schedule"}
        </button>
      </form>
    </div>
  );
}
