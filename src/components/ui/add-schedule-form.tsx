"use client";

import { useEffect, useMemo, useState } from "react";
import { X, ChevronDown, Lock } from "lucide-react";
import toast from "react-hot-toast";
import { useStore } from "@/store/use-store";

// Maps "Monday".."Sunday" to JS getDay() (0=Sun..6=Sat).
const DAY_INDEX: Record<string, number> = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
};

// "Monday" + a reference start date → ISO date of the first occurrence
// of that weekday on/after the reference date.
function firstOccurrenceISO(day: string, fromIso?: string): string {
  const target = DAY_INDEX[day];
  if (target === undefined) return "";
  const base = fromIso ? new Date(`${fromIso}T00:00:00`) : new Date();
  base.setHours(0, 0, 0, 0);
  const diff = (target - base.getDay() + 7) % 7;
  base.setDate(base.getDate() + diff);
  const y = base.getFullYear();
  const m = String(base.getMonth() + 1).padStart(2, "0");
  const d = String(base.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

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

export type RepeatFrequency = "none" | "daily" | "weekly" | "monthly";

export type ScheduleInitial = {
  title: string;
  type: ScheduleType;
  date: string;
  time: string;
  /** Recurrence frequency. Defaults to "weekly" for Class type, "none"
   *  otherwise — but the user can override either way. */
  repeatFreq?: RepeatFrequency;
  /** Inclusive end date for recurrence. */
  repeatUntil?: string;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onAdd?: (data: {
    title: string;
    type: ScheduleType;
    date: string;
    time: string;
    /** When set to anything other than "none", the planner expands this
     *  into one event per day / week / month from `date` up to and
     *  including `repeatUntil`. */
    repeatFreq?: RepeatFrequency;
    repeatUntil?: string;
  }) => void;
  /** When provided, the modal opens in "edit" mode pre-filled with these values. */
  initial?: ScheduleInitial | null;
};

const REPEAT_OPTIONS: { value: RepeatFrequency; label: string }[] = [
  { value: "none", label: "Doesn't repeat" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

const TYPES = [
  { value: "Class", color: "bg-green-primary" },
  { value: "Task", color: "bg-blue-primary" },
  { value: "Self Study", color: "bg-teal-primary" },
] as const;

type ScheduleType = (typeof TYPES)[number]["value"];

type CachedCourse = {
  title?: string;
  course_payload?: {
    scheduleEntries?: Array<{
      day?: string;
      startTime?: string;
      endTime?: string;
    }>;
  };
};

export default function AddScheduleModal({ isOpen, onClose, onAdd, initial }: Props) {
  if (!isOpen) return null;
  const resetKey = [
    initial?.title ?? "",
    initial?.type ?? "",
    initial?.date ?? "",
    initial?.time ?? "",
    initial?.repeatFreq ?? "",
    initial?.repeatUntil ?? "",
  ].join("|");

  return (
    <AddScheduleModalInner
      key={resetKey}
      isOpen={isOpen}
      onClose={onClose}
      onAdd={onAdd}
      initial={initial}
    />
  );
}

function AddScheduleModalInner({ isOpen, onClose, onAdd, initial }: Props) {
  const isEdit = !!initial;
  const [title, setTitle] = useState(initial?.title ?? "");
  const [type, setType] = useState<ScheduleType>(initial?.type ?? "Class");
  const [date, setDate] = useState(initial?.date ?? "");
  const initialRange = initial ? splitTimeRange(initial.time) : { start: "", end: "" };
  const [startTime, setStartTime] = useState(initialRange.start);
  const [endTime, setEndTime] = useState(initialRange.end);

  // Course picker: only appears when type === "Class". When the chosen
  // course has a schedule defined in Passing Target, the date + time
  // become "locked" to that schedule — the user can't change them since
  // the working time for a class is already fixed.
  const coursesCache = useStore((s) => s.coursesCache);
  const fetchCourses = useStore((s) => s.fetchCourses);
  const [courseName, setCourseName] = useState("");
  const [scheduleIdx, setScheduleIdx] = useState<number>(-1);

  // Pull a fresh course list the first time the modal opens so the
  // dropdown reflects what's in Passing Target.
  useEffect(() => {
    if (isOpen) fetchCourses().catch(() => undefined);
  }, [isOpen, fetchCourses]);

  const courses = useMemo(() => {
    if (!Array.isArray(coursesCache)) return [];
    return (coursesCache as CachedCourse[])
      .map((c) => ({
        title: c.title ?? "Untitled",
        scheduleEntries: (c.course_payload?.scheduleEntries ?? []).filter(
          (e) =>
            typeof e?.day === "string" &&
            typeof e?.startTime === "string" &&
            typeof e?.endTime === "string",
        ),
      }))
      .filter((c) => c.title && c.title !== "Untitled");
  }, [coursesCache]);

  const selectedCourse = useMemo(
    () => courses.find((c) => c.title === courseName) ?? null,
    [courses, courseName],
  );
  const resolvedScheduleIdx = useMemo(() => {
    if (!selectedCourse) return -1;
    if (scheduleIdx >= 0) return scheduleIdx;
    return selectedCourse.scheduleEntries.length > 0 ? 0 : -1;
  }, [selectedCourse, scheduleIdx]);
  const selectedSchedule =
    selectedCourse && resolvedScheduleIdx >= 0
      ? selectedCourse.scheduleEntries[resolvedScheduleIdx]
      : null;
  // The date + time are locked when the user has selected a course
  // schedule. Conceptually, "this class meets every Monday 10–12" is the
  // course's reality — the planner can't move it.
  const lockedFromSchedule = !!selectedSchedule;
  // Recurrence: frequency + end date. Class type defaults to weekly
  // because that's the natural cadence; everything else defaults to no
  // recurrence, but the user can override either way.
  const [repeatFreq, setRepeatFreq] = useState<RepeatFrequency>(
    initial?.repeatFreq ?? (initial?.type === "Class" ? "weekly" : "none"),
  );
  const [repeatUntil, setRepeatUntil] = useState(initial?.repeatUntil ?? "");
  const [typeOpen, setTypeOpen] = useState(false);

  const effectiveDate = lockedFromSchedule && selectedSchedule?.day
    ? firstOccurrenceISO(selectedSchedule.day, date || undefined)
    : date;
  const effectiveStartTime = lockedFromSchedule
    ? selectedSchedule?.startTime ?? startTime
    : startTime;
  const effectiveEndTime = lockedFromSchedule
    ? selectedSchedule?.endTime ?? endTime
    : endTime;

  const handleTypeChange = (nextType: ScheduleType) => {
    setType(nextType);
    if (nextType === "Class" && repeatFreq === "none") {
      setRepeatFreq("weekly");
    }
    if (nextType !== "Class") {
      setCourseName("");
      setScheduleIdx(-1);
    }
  };

  const handleCourseChange = (nextCourse: string) => {
    setCourseName(nextCourse);
    const course = courses.find((c) => c.title === nextCourse) ?? null;
    if (course && course.scheduleEntries.length > 0) {
      setScheduleIdx(0);
      return;
    }
    setScheduleIdx(-1);
  };

  const repeats = repeatFreq !== "none";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !type || !effectiveDate || !effectiveStartTime || !effectiveEndTime) {
      toast.error("Please fill in all required fields");
      return;
    }
    if (effectiveStartTime >= effectiveEndTime) {
      toast.error("End time must be after start time");
      return;
    }
    if (repeats) {
      if (!repeatUntil) {
        toast.error("Pick a 'Repeat until' date for the recurring schedule");
        return;
      }
      if (repeatUntil < effectiveDate) {
        toast.error("'Repeat until' must be on or after the start date");
        return;
      }
    }
    // Build the same "1 PM - 3 PM" range string the planner already parses
    // via parseTimeRange, so this stays compatible with existing events.
    const time = `${formatTime12(effectiveStartTime)} - ${formatTime12(effectiveEndTime)}`;
    onAdd?.({
      title,
      type,
      date: effectiveDate,
      time,
      repeatFreq: repeats ? repeatFreq : undefined,
      repeatUntil: repeats ? repeatUntil : undefined,
    });
    toast.success(isEdit ? "Schedule updated" : "Schedule added");
    if (!isEdit) {
      setTitle("");
      setType("Class");
      setDate("");
      setStartTime("");
      setEndTime("");
      setRepeatFreq("weekly");
      setRepeatUntil("");
      setCourseName("");
      setScheduleIdx(-1);
    }
    onClose();
  };

  const selectedColor =
    TYPES.find((t) => t.value === type)?.color ?? "bg-gray-300";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <form
        onSubmit={handleSubmit}
        className="relative w-full max-w-lg max-h-[90dvh] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl sm:p-9"
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
                        handleTypeChange(t.value);
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

          {/* Course picker — only for Class type. When a course has a
              determined schedule in Passing Target, picking the course
              + its schedule entry locks the date/time fields to that
              session. Without a schedule, the user can pick any time. */}
          {type === "Class" && (
            <div className="flex flex-col gap-2">
              <label
                htmlFor="schedule-course"
                className="text-sm font-medium text-black-primary"
              >
                Course
              </label>
              <select
                id="schedule-course"
                value={courseName}
                onChange={(e) => handleCourseChange(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-indigo-primary"
              >
                <option value="">
                  {courses.length === 0
                    ? "No courses yet, add one in Passing Target"
                    : "Pick a course (or leave blank for a custom class)"}
                </option>
                {courses.map((c) => (
                  <option key={c.title} value={c.title}>
                    {c.title}
                  </option>
                ))}
              </select>

              {/* When the chosen course has more than one weekly slot
                  (e.g. Mon 10–12 AND Wed 14–16), let the user pick
                  which session this entry maps to. */}
              {selectedCourse && selectedCourse.scheduleEntries.length > 0 && (
                <>
                  <label
                    htmlFor="schedule-course-slot"
                    className="text-xs font-medium text-gray-primary"
                  >
                    Class session
                  </label>
                  <select
                    id="schedule-course-slot"
                    value={String(resolvedScheduleIdx)}
                    onChange={(e) => setScheduleIdx(Number(e.target.value))}
                    className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-indigo-primary"
                  >
                    {selectedCourse.scheduleEntries.map((s, i) => (
                      <option key={i} value={i}>
                        {s.day} · {s.startTime}–{s.endTime}
                      </option>
                    ))}
                  </select>
                </>
              )}
              {selectedCourse &&
                selectedCourse.scheduleEntries.length === 0 && (
                  <p className="text-[11px] text-amber-700">
                    This course doesn&apos;t have a schedule in Passing
                    Target, pick the date and time manually below.
                  </p>
                )}
            </div>
          )}

          <div className="flex flex-col gap-2 min-w-0">
            <label
              htmlFor="schedule-date"
              className="flex items-center gap-1 text-sm font-medium text-black-primary"
            >
              {repeats ? "Start date*" : "Date*"}
              {lockedFromSchedule && (
                <Lock size={12} className="text-gray-500" />
              )}
            </label>
            <input
              id="schedule-date"
              type="date"
              value={effectiveDate}
              onChange={(e) => setDate(e.target.value)}
              disabled={lockedFromSchedule}
              className="w-full min-w-0 max-w-full rounded-lg border border-gray-200 px-3 sm:px-4 py-2.5 text-base sm:text-sm outline-none focus:border-indigo-primary disabled:bg-gray-50 disabled:text-gray-600 disabled:cursor-not-allowed"
              style={{ WebkitAppearance: "none" }}
            />
            {lockedFromSchedule && (
              <p className="text-[11px] text-gray-primary">
                Locked to {selectedSchedule?.day ?? "this day"}, this course&apos;s
                schedule is set in Passing Target.
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
            <div className="flex flex-col gap-2 min-w-0">
              <label
                htmlFor="schedule-start-time"
                className="flex items-center gap-1 text-sm font-medium text-black-primary"
              >
                Start Time*
                {lockedFromSchedule && (
                  <Lock size={12} className="text-gray-500" />
                )}
              </label>
              <input
                id="schedule-start-time"
                type="time"
                value={effectiveStartTime}
                onChange={(e) => setStartTime(e.target.value)}
                disabled={lockedFromSchedule}
                className="w-full min-w-0 max-w-full rounded-lg border border-gray-200 px-2 sm:px-3 py-2.5 text-base sm:text-sm outline-none focus:border-indigo-primary disabled:bg-gray-50 disabled:text-gray-600 disabled:cursor-not-allowed"
                style={{ WebkitAppearance: "none" }}
              />
            </div>

            <div className="flex flex-col gap-2 min-w-0">
              <label
                htmlFor="schedule-end-time"
                className="flex items-center gap-1 text-sm font-medium text-black-primary"
              >
                End Time*
                {lockedFromSchedule && (
                  <Lock size={12} className="text-gray-500" />
                )}
              </label>
              <input
                id="schedule-end-time"
                type="time"
                value={effectiveEndTime}
                onChange={(e) => setEndTime(e.target.value)}
                disabled={lockedFromSchedule}
                className="w-full min-w-0 max-w-full rounded-lg border border-gray-200 px-2 sm:px-3 py-2.5 text-base sm:text-sm outline-none focus:border-indigo-primary disabled:bg-gray-50 disabled:text-gray-600 disabled:cursor-not-allowed"
                style={{ WebkitAppearance: "none" }}
              />
            </div>
          </div>

          {/* Recurrence frequency — available for any type, defaults to
              weekly for Class. When set to anything other than "Doesn't
              repeat", the Repeat-until date field appears below it. */}
          <div className="flex flex-col gap-2 min-w-0">
            <label
              htmlFor="schedule-repeat-freq"
              className="text-sm font-medium text-black-primary"
            >
              Repeat
            </label>
            <select
              id="schedule-repeat-freq"
              value={repeatFreq}
              onChange={(e) =>
                setRepeatFreq(e.target.value as RepeatFrequency)
              }
              className="w-full min-w-0 max-w-full rounded-lg border border-gray-200 bg-white px-3 sm:px-4 py-2.5 text-base sm:text-sm outline-none focus:border-indigo-primary"
            >
              {REPEAT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          {repeats && (
            <div className="flex flex-col gap-2 min-w-0">
              <label
                htmlFor="schedule-repeat-until"
                className="text-sm font-medium text-black-primary"
              >
                Repeat until*
              </label>
              <input
                id="schedule-repeat-until"
                type="date"
                value={repeatUntil}
                min={effectiveDate || undefined}
                onChange={(e) => setRepeatUntil(e.target.value)}
                className="w-full min-w-0 max-w-full rounded-lg border border-gray-200 px-3 sm:px-4 py-2.5 text-base sm:text-sm outline-none focus:border-indigo-primary"
                style={{ WebkitAppearance: "none" }}
              />
              <p className="text-[11px] text-gray-primary">
                {repeatFreq === "daily"
                  ? "An event is created for every day from the start date through this date."
                  : repeatFreq === "weekly"
                    ? "An event is created every week on the same weekday from the start date through this date."
                    : "An event is created every month on the same day from the start date through this date."}
              </p>
            </div>
          )}
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
