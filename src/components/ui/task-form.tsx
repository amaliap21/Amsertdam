"use client";

import { X, CirclePlus, Check, ChevronUp, ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";

type CourseLite = {
  id?: string;
  courseName: string;
  assessments?: {
    name: string;
    items?: { name: string }[];
  }[];
};

export type TaskFormInitial = {
  taskName: string;
  course: string;
  assessment: string;
  item: string;
  /** YYYY-MM-DDTHH:MM (datetime-local format) */
  deadline: string;
  estimatedHours: string;
};

type AddTaskModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (task: {
    taskName: string;
    description: string;
    deadline: string;
    estimatedHours?: number | null;
    course: string;
  }) => void;
  /** When provided, the modal opens in "edit" mode pre-filled with these values. */
  initialTask?: TaskFormInitial | null;
};

// Convert a decimal-hour string ("0.5", "2") into separate HH/MM parts so
// the stopwatch-style inputs can show editable hour and minute fields.
function splitHours(raw: string | undefined): { h: number; m: number } {
  const decimal = raw ? parseFloat(raw) : NaN;
  if (!Number.isFinite(decimal) || decimal <= 0) return { h: 0, m: 0 };
  const h = Math.floor(decimal);
  const m = Math.round((decimal - h) * 60);
  // Carry minutes=60 (e.g. 1.999h → 2h0m) back into hours.
  if (m === 60) return { h: h + 1, m: 0 };
  return { h, m };
}

export default function AddTaskModal({
  isOpen,
  onClose,
  onSubmit,
  initialTask,
}: AddTaskModalProps) {
  const isEditMode = !!initialTask;
  // Seed values come from `initialTask` once on mount. The parent is expected
  // to pass a stable `key` (or to mount the modal only when `isOpen` is true)
  // so a different task always gets a fresh component instance, that way we
  // don't need a setState-in-effect to reset the form between opens.
  const [taskName, setTaskName] = useState(initialTask?.taskName ?? "");
  const [courseName, setCourseName] = useState(initialTask?.course ?? "");
  const [assessmentName, setAssessmentName] = useState(
    initialTask?.assessment ?? "",
  );
  const [itemName, setItemName] = useState(initialTask?.item ?? "");
  const [deadline, setDeadline] = useState(initialTask?.deadline ?? "");
  const seedHM = splitHours(initialTask?.estimatedHours);
  const [hoursPart, setHoursPart] = useState<number>(seedHM.h);
  const [minutesPart, setMinutesPart] = useState<number>(seedHM.m);

  const clampHours = (n: number) => Math.max(0, Math.min(99, Math.floor(n)));
  const clampMinutes = (n: number) => Math.max(0, Math.min(59, Math.floor(n)));

  const [courses, setCourses] = useState<CourseLite[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    (async () => {
      try {
        const r = await fetch("/api/courses");
        if (!r.ok) return;
        const data = await r.json();
        if (!Array.isArray(data)) return;
        type RawCourse = {
          id?: string;
          title?: string;
          course_payload?: {
            title?: string;
            assessments?: CourseLite["assessments"];
          };
          assessments?: CourseLite["assessments"];
        };
        const mapped: CourseLite[] = (data as RawCourse[]).map((c) => {
          const payload = c.course_payload ?? {};
          return {
            id: c.id,
            courseName: c.title ?? payload.title ?? "Untitled",
            assessments: Array.isArray(payload.assessments)
              ? payload.assessments
              : Array.isArray(c.assessments)
                ? c.assessments
                : [],
          };
        });
        setCourses(mapped);
      } catch {}
    })();
  }, [isOpen]);

  const currentCourse = courses.find((c) => c.courseName === courseName);
  const assessments = currentCourse?.assessments ?? [];
  const currentAssessment = assessments.find((a) => a.name === assessmentName);
  const items = currentAssessment?.items ?? [];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskName || !courseName || !assessmentName || !deadline) return;
    const descParts: string[] = [`Assessment: ${assessmentName}`];
    if (itemName) descParts.push(`Item: ${itemName}`);
    // Combine the stopwatch HH/MM back into decimal hours. Treat 0h 0m as
    // "Not sure" (undefined) so it matches the previous dropdown's empty
    // option behavior.
    const decimalHours = hoursPart + minutesPart / 60;
    const roundedHours = Math.round(decimalHours * 100) / 100;
    onSubmit({
      taskName,
      course: courseName,
      description: descParts.join(" • "),
      deadline,
      estimatedHours: roundedHours > 0 ? roundedHours : undefined,
    });
    // Don't clear in edit mode, the parent closes the modal on success.
    if (!isEditMode) {
      setTaskName("");
      setCourseName("");
      setAssessmentName("");
      setItemName("");
      setDeadline("");
      setHoursPart(0);
      setMinutesPart(0);
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-1 sm:p-4"
      style={{ background: "rgba(0, 0, 0, 0.5)" }}
      onClick={onClose}
    >
      <div
        className="relative w-[calc(100vw-0.5rem)] max-w-[20.5rem] max-h-[90dvh] overflow-y-auto rounded-2xl bg-white px-2.5 pb-2.5 pt-9 shadow-xl sm:w-full sm:max-w-lg sm:px-6 sm:pb-6 sm:pt-6"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-2.5 top-2.5 text-gray-400 transition-colors hover:text-gray-600 sm:right-6 sm:top-6"
        >
          <X size={18} />
        </button>

        <div className="mb-3 sm:mb-6">
          <h2 className="mb-1 text-xs font-semibold text-black-primary sm:text-2xl">
            {isEditMode ? "Edit Task" : "Add New Task"}
          </h2>
          <p className="text-[11px] leading-tight text-gray-primary sm:text-sm">
            {isEditMode
              ? "Update this task's details below."
              : "Link this task to a course, assessment, and item."}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-5">
          {/* Task Name (only manual input) */}
          <div>
            <label className="mb-1 block text-[11px] font-medium text-black-primary sm:mb-2 sm:text-sm">
              Task Name<span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="e.g., Draft section 3"
              value={taskName}
              onChange={(e) => setTaskName(e.target.value)}
              className="w-full rounded-xl border border-gray-300 px-2.5 py-2 text-[13px] text-black-primary placeholder:text-gray-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-indigo-primary sm:px-4 sm:py-3 sm:text-sm"
              required
            />
          </div>

          {/* Course */}
          <div>
            <label className="mb-1 block text-[11px] font-medium text-black-primary sm:mb-2 sm:text-sm">
              Course Name<span className="text-red-500">*</span>
            </label>
            <select
              value={courseName}
              onChange={(e) => {
                setCourseName(e.target.value);
                setAssessmentName("");
                setItemName("");
              }}
              className="w-full rounded-xl border border-gray-300 bg-white px-2.5 py-2 text-[13px] text-black-primary focus:border-transparent focus:outline-none focus:ring-2 focus:ring-indigo-primary sm:px-4 sm:py-3 sm:text-sm"
              required
            >
              <option value="">Select course</option>
              {courses.map((c) => (
                <option key={c.id ?? c.courseName} value={c.courseName}>
                  {c.courseName}
                </option>
              ))}
            </select>
            {courses.length === 0 && (
              <p className="text-xs text-gray-500 mt-1">
                No courses yet, add one in Passing Target first.
              </p>
            )}
          </div>

          {/* Assessment */}
          <div>
            <label className="mb-1 block text-[11px] font-medium text-black-primary sm:mb-2 sm:text-sm">
              Assessment Name<span className="text-red-500">*</span>
            </label>
            <select
              value={assessmentName}
              onChange={(e) => {
                setAssessmentName(e.target.value);
                setItemName("");
              }}
              disabled={!courseName}
              className="w-full rounded-xl border border-gray-300 bg-white px-2.5 py-2 text-[13px] text-black-primary focus:border-transparent focus:outline-none focus:ring-2 focus:ring-indigo-primary disabled:bg-gray-50 disabled:text-gray-400 sm:px-4 sm:py-3 sm:text-sm"
              required
            >
              <option value="">
                {courseName ? "Select assessment" : "Select a course first"}
              </option>
              {assessments.map((a) => (
                <option key={a.name} value={a.name}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          {/* Item */}
          <div>
            <label className="mb-1 block text-[11px] font-medium text-black-primary sm:mb-2 sm:text-sm">
              Item Name
            </label>
            <select
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              disabled={!assessmentName || items.length === 0}
              className="w-full rounded-xl border border-gray-300 bg-white px-2.5 py-2 text-[13px] text-black-primary focus:border-transparent focus:outline-none focus:ring-2 focus:ring-indigo-primary disabled:bg-gray-50 disabled:text-gray-400 sm:px-4 sm:py-3 sm:text-sm"
            >
              <option value="">
                {!assessmentName
                  ? "Select an assessment first"
                  : items.length === 0
                    ? "No items for this assessment"
                    : "Select item (optional)"}
              </option>
              {items.map((it) => (
                <option key={it.name} value={it.name}>
                  {it.name}
                </option>
              ))}
            </select>
          </div>

          {/* Deadline (datetime picker) */}
          <div className="w-full min-w-0">
            <label className="mb-1 block text-[11px] font-medium text-black-primary sm:mb-2 sm:text-sm">
              Deadline<span className="text-red-500">*</span>
            </label>

            <input
              type="datetime-local"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="
                w-full
                min-w-0
                max-w-full
                rounded-xl
                border border-gray-300
                px-2 py-2
                text-[12px] sm:text-sm
                text-black-primary
                focus:border-transparent
                focus:outline-none
                focus:ring-2
                focus:ring-indigo-primary
                sm:px-4 sm:py-3
                overflow-hidden
              "
              style={{
                WebkitAppearance: "none",
              }}
              required
            />
          </div>

          {/* Estimated hours — stopwatch-style HH:MM editor. Each part is
              freely editable: type a number, use the chevron buttons, or
              the keyboard arrow keys. 0h 0m is treated as "Not sure". */}
          <div>
            <label className="mb-1 block text-[11px] font-medium text-black-primary sm:mb-2 sm:text-sm">
              Estimated Hours
            </label>
            <div className="flex items-center justify-center gap-2 sm:gap-3 rounded-xl border border-gray-300 bg-white px-2 py-2 sm:py-3">
              {/* Hours */}
              <div className="flex flex-col items-center gap-0.5">
                <button
                  type="button"
                  aria-label="Increment hours"
                  onClick={() => setHoursPart((h) => clampHours(h + 1))}
                  className="flex h-6 w-6 items-center justify-center rounded-md text-gray-primary hover:bg-gray-100 hover:text-indigo-primary"
                >
                  <ChevronUp size={16} />
                </button>
                <input
                  type="number"
                  min={0}
                  max={99}
                  value={hoursPart}
                  onChange={(e) => {
                    const v = e.target.value;
                    setHoursPart(v === "" ? 0 : clampHours(Number(v)));
                  }}
                  onBlur={(e) =>
                    setHoursPart(clampHours(Number(e.target.value) || 0))
                  }
                  aria-label="Hours"
                  className="w-14 sm:w-16 rounded-md border border-gray-200 bg-white py-1.5 text-center font-mono text-lg font-semibold text-black-primary tabular-nums focus:border-transparent focus:outline-none focus:ring-2 focus:ring-indigo-primary [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <button
                  type="button"
                  aria-label="Decrement hours"
                  onClick={() => setHoursPart((h) => clampHours(h - 1))}
                  className="flex h-6 w-6 items-center justify-center rounded-md text-gray-primary hover:bg-gray-100 hover:text-indigo-primary"
                >
                  <ChevronDown size={16} />
                </button>
                <span className="mt-0.5 text-[10px] uppercase tracking-wide text-gray-primary">
                  Hours
                </span>
              </div>

              <span className="text-2xl font-bold text-gray-400 -mt-4 select-none">
                :
              </span>

              {/* Minutes */}
              <div className="flex flex-col items-center gap-0.5">
                <button
                  type="button"
                  aria-label="Increment minutes"
                  onClick={() =>
                    setMinutesPart((m) => {
                      if (m >= 59) {
                        // Carry into the hour like a real stopwatch.
                        setHoursPart((h) => clampHours(h + 1));
                        return 0;
                      }
                      return clampMinutes(m + 1);
                    })
                  }
                  className="flex h-6 w-6 items-center justify-center rounded-md text-gray-primary hover:bg-gray-100 hover:text-indigo-primary"
                >
                  <ChevronUp size={16} />
                </button>
                <input
                  type="number"
                  min={0}
                  max={59}
                  value={minutesPart}
                  onChange={(e) => {
                    const v = e.target.value;
                    setMinutesPart(v === "" ? 0 : clampMinutes(Number(v)));
                  }}
                  onBlur={(e) =>
                    setMinutesPart(clampMinutes(Number(e.target.value) || 0))
                  }
                  aria-label="Minutes"
                  className="w-14 sm:w-16 rounded-md border border-gray-200 bg-white py-1.5 text-center font-mono text-lg font-semibold text-black-primary tabular-nums focus:border-transparent focus:outline-none focus:ring-2 focus:ring-indigo-primary [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <button
                  type="button"
                  aria-label="Decrement minutes"
                  onClick={() =>
                    setMinutesPart((m) => {
                      if (m <= 0) {
                        // Borrow from hours when there's an hour to borrow.
                        if (hoursPart > 0) {
                          setHoursPart((h) => clampHours(h - 1));
                          return 59;
                        }
                        return 0;
                      }
                      return clampMinutes(m - 1);
                    })
                  }
                  className="flex h-6 w-6 items-center justify-center rounded-md text-gray-primary hover:bg-gray-100 hover:text-indigo-primary"
                >
                  <ChevronDown size={16} />
                </button>
                <span className="mt-0.5 text-[10px] uppercase tracking-wide text-gray-primary">
                  Minutes
                </span>
              </div>
            </div>
            <p className="mt-1 text-[10px] text-gray-primary sm:text-xs">
              Leave at 0:00 if you&rsquo;re not sure.
            </p>
          </div>

          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-primary px-4 py-2.5 text-xs font-medium text-white transition-colors hover:bg-indigo-600 sm:py-4 sm:text-base"
          >
            {isEditMode ? <Check size={20} /> : <CirclePlus size={20} />}
            {isEditMode ? "Save Changes" : "Add Task"}
          </button>
        </form>
      </div>
    </div>
  );
}
