"use client";

import { X, CirclePlus, Check } from "lucide-react";
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

const HOUR_OPTIONS = [0.5, 1, 1.5, 2, 3, 4, 5, 6, 8];

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
  const [estimatedHours, setEstimatedHours] = useState<string>(
    initialTask?.estimatedHours ?? "",
  );

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
    onSubmit({
      taskName,
      course: courseName,
      description: descParts.join(" • "),
      deadline,
      estimatedHours: estimatedHours ? Number(estimatedHours) : undefined,
    });
    // Don't clear in edit mode, the parent closes the modal on success.
    if (!isEditMode) {
      setTaskName("");
      setCourseName("");
      setAssessmentName("");
      setItemName("");
      setDeadline("");
      setEstimatedHours("");
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

          {/* Estimated hours (dropdown) */}
          <div>
            <label className="mb-1 block text-[11px] font-medium text-black-primary sm:mb-2 sm:text-sm">
              Estimated Hours
            </label>
            <select
              value={estimatedHours}
              onChange={(e) => setEstimatedHours(e.target.value)}
              className="w-full rounded-xl border border-gray-300 bg-white px-2.5 py-2 text-[13px] text-black-primary focus:border-transparent focus:outline-none focus:ring-2 focus:ring-indigo-primary sm:px-4 sm:py-3 sm:text-sm"
            >
              <option value="">Not sure</option>
              {HOUR_OPTIONS.map((h) => (
                <option key={h} value={h}>
                  {h} hour{h === 1 ? "" : "s"}
                </option>
              ))}
            </select>
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
