"use client";

import { X, CirclePlus } from "lucide-react";
import { useEffect, useState } from "react";

type CourseLite = {
  id?: string;
  courseName: string;
  assessments?: {
    name: string;
    items?: { name: string }[];
  }[];
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
};

const HOUR_OPTIONS = [0.5, 1, 1.5, 2, 3, 4, 5, 6, 8];

export default function AddTaskModal({
  isOpen,
  onClose,
  onSubmit,
}: AddTaskModalProps) {
  const [taskName, setTaskName] = useState("");
  const [courseName, setCourseName] = useState("");
  const [assessmentName, setAssessmentName] = useState("");
  const [itemName, setItemName] = useState("");
  const [deadline, setDeadline] = useState("");
  const [estimatedHours, setEstimatedHours] = useState<string>("");

  const [courses, setCourses] = useState<CourseLite[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    (async () => {
      try {
        const r = await fetch("/api/courses");
        if (!r.ok) return;
        const data = await r.json();
        if (!Array.isArray(data)) return;
        const mapped: CourseLite[] = data.map((c: any) => {
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
    setTaskName("");
    setCourseName("");
    setAssessmentName("");
    setItemName("");
    setDeadline("");
    setEstimatedHours("");
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 flex justify-center items-center z-50"
      style={{ background: "rgba(0, 0, 0, 0.5)" }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-8 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-6 right-6 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X size={24} />
        </button>

        <div className="mb-6">
          <h2 className="text-2xl font-semibold text-black-primary mb-1">
            Add New Task
          </h2>
          <p className="text-sm text-gray-primary">
            Link this task to a course, assessment, and item.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Task Name (only manual input) */}
          <div>
            <label className="block text-sm font-medium text-black-primary mb-2">
              Task Name<span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="e.g., Draft section 3"
              value={taskName}
              onChange={(e) => setTaskName(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-primary focus:border-transparent text-black-primary placeholder:text-gray-400"
              required
            />
          </div>

          {/* Course */}
          <div>
            <label className="block text-sm font-medium text-black-primary mb-2">
              Course Name<span className="text-red-500">*</span>
            </label>
            <select
              value={courseName}
              onChange={(e) => {
                setCourseName(e.target.value);
                setAssessmentName("");
                setItemName("");
              }}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-primary focus:border-transparent text-black-primary bg-white"
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
                No courses yet — add one in Passing Target first.
              </p>
            )}
          </div>

          {/* Assessment */}
          <div>
            <label className="block text-sm font-medium text-black-primary mb-2">
              Assessment Name<span className="text-red-500">*</span>
            </label>
            <select
              value={assessmentName}
              onChange={(e) => {
                setAssessmentName(e.target.value);
                setItemName("");
              }}
              disabled={!courseName}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-primary focus:border-transparent text-black-primary bg-white disabled:bg-gray-50 disabled:text-gray-400"
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
            <label className="block text-sm font-medium text-black-primary mb-2">
              Item Name
            </label>
            <select
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              disabled={!assessmentName || items.length === 0}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-primary focus:border-transparent text-black-primary bg-white disabled:bg-gray-50 disabled:text-gray-400"
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
          <div>
            <label className="block text-sm font-medium text-black-primary mb-2">
              Deadline<span className="text-red-500">*</span>
            </label>
            <input
              type="datetime-local"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-primary focus:border-transparent text-black-primary"
              required
            />
          </div>

          {/* Estimated hours (dropdown) */}
          <div>
            <label className="block text-sm font-medium text-black-primary mb-2">
              Estimated Hours
            </label>
            <select
              value={estimatedHours}
              onChange={(e) => setEstimatedHours(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-primary focus:border-transparent text-black-primary bg-white"
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
            className="w-full flex items-center justify-center gap-2 px-4 py-4 bg-indigo-primary text-white rounded-xl hover:bg-indigo-600 transition-colors font-medium"
          >
            <CirclePlus size={20} />
            Add Task
          </button>
        </form>
      </div>
    </div>
  );
}
