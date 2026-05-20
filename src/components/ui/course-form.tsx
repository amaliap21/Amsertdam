"use client";
import { X, Trash2 } from "lucide-react";
import React, { useState } from "react";

type CourseFormProps = {
  onSubmit: (course: {
    courseName: string;
    credits: number;
    threshold: number | null;
    scheduleEntries: { day: string; startTime: string; endTime: string }[];
    typeTracking: string;
    assessments?: {
      name: string;
      weight: number;
      score?: number;
      date?: string;
    }[];
    passingRequirement?: string;
    requirements?: {
      name: string;
      score: number;
    }[];
  }) => void;
  onCancel: () => void;
};

function diffHours(start: string, end: string): number {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return 0;
  return (eh * 60 + em - (sh * 60 + sm)) / 60;
}

export default function CourseForm({ onSubmit, onCancel }: CourseFormProps) {
  // Lock the submit button after first click so a rapid second click can't
  // produce a duplicate POST. The parent unmounts this form on success, so
  // we only need to handle the "click → in-flight" window.
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    courseName: "",
    credits: 0,
    threshold: "" as number | "",
    scheduleEntries: [{ day: "", startTime: "", endTime: "" }],
  });

  const updateScheduleEntry = (
    index: number,
    field: "day" | "startTime" | "endTime",
    value: string,
  ) => {
    setFormData((prev) => ({
      ...prev,
      scheduleEntries: prev.scheduleEntries.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, [field]: value } : entry,
      ),
    }));
  };

  const addScheduleEntry = () => {
    setFormData((prev) => ({
      ...prev,
      scheduleEntries: [
        ...prev.scheduleEntries,
        { day: "", startTime: "", endTime: "" },
      ],
    }));
  };

  const removeScheduleEntry = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      scheduleEntries:
        prev.scheduleEntries.length === 1
          ? prev.scheduleEntries
          : prev.scheduleEntries.filter(
              (_, entryIndex) => entryIndex !== index,
            ),
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (formData.credits < 0) {
      alert("Credits cannot be negative.");
      return;
    }

    const scheduleEntries = formData.scheduleEntries.filter(
      (entry) => entry.day && entry.startTime && entry.endTime,
    );

    if (!scheduleEntries.length) {
      alert("Please add at least one valid schedule day and time.");
      return;
    }

    for (const entry of scheduleEntries) {
      if (entry.startTime >= entry.endTime) {
        alert(
          `Schedule on ${entry.day}: start time (${entry.startTime}) must be earlier than end time (${entry.endTime}).`,
        );
        return;
      }
    }

    const totalHours = scheduleEntries.reduce(
      (sum, e) => sum + diffHours(e.startTime, e.endTime),
      0,
    );
    if (Math.abs(totalHours - formData.credits) > 0.01) {
      alert(
        `Schedule hours (${totalHours}h) must equal Credits (${formData.credits}). Adjust your schedule or credits so they match.`,
      );
      return;
    }

    const threshold =
      formData.threshold === "" ? null : Number(formData.threshold);
    if (threshold !== null && (threshold < 0 || threshold > 100)) {
      alert("Pass Threshold must be between 0 and 100.");
      return;
    }

    const newCourse = {
      courseName: formData.courseName,
      credits: formData.credits,
      threshold,
      typeTracking: "On Track",
      scheduleEntries,
      passingRequirement: "",
      assessments: [] as {
        name: string;
        weight: number;
        score?: number;
        date?: string;
      }[],
      requirements: [] as {
        name: string;
        score: number;
      }[],
    };

    setIsSubmitting(true);
    onSubmit(newCourse);
  };

  return (
    <div
      className="fixed inset-0 flex items-end justify-center p-2 sm:items-center sm:p-4 z-50"
      style={{ background: "rgba(0, 0, 0, 0.64)" }}
    >
      <div className="relative w-[calc(100vw-0.5rem)] max-w-[20.5rem] max-h-[90dvh] overflow-y-auto rounded-2xl bg-white px-2.5 pb-2.5 pt-9 shadow-xl sm:w-full sm:max-w-lg sm:px-6 sm:pb-6 sm:pt-6">
        {/* Close button */}
        <button
          onClick={onCancel}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X size={24} />
        </button>

        {/* Header */}
        <div className="mb-5 sm:mb-6">
          <h2 className="text-lg font-semibold text-black-primary sm:text-xl">
            Add New Course
          </h2>
          <p className="text-sm text-gray-primary mt-1">
            Enter the course detail below
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
          {/* Course Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Course Name<span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="e.g., Calculus I"
              value={formData.courseName}
              onChange={(e) =>
                setFormData({ ...formData, courseName: e.target.value })
              }
              className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-primary focus:border-transparent sm:px-4"
              required
            />
          </div>

          {/* Credits */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Credits<span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              min={0}
              placeholder="0"
              value={formData.credits || ""}
              onChange={(e) => {
                const parsed = parseInt(e.target.value);
                const safe = Number.isNaN(parsed) ? 0 : Math.max(0, parsed);
                setFormData({ ...formData, credits: safe });
              }}
              className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-primary focus:border-transparent appearance-none sm:px-4"
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              1 credit = 1 hour. Total schedule hours must match this value.
            </p>
          </div>

          {/* Pass Threshold */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Pass Threshold<span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              min={0}
              max={100}
              placeholder="e.g., 75"
              value={formData.threshold}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  threshold:
                    e.target.value === "" ? "" : Number(e.target.value),
                })
              }
              className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-primary focus:border-transparent appearance-none sm:px-4"
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              Minimum grade (0–100) needed to pass this course.
            </p>
          </div>

          {/* Schedule Entries */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-gray-700">
                Schedule<span className="text-red-500">*</span>
              </label>
              <button
                type="button"
                onClick={addScheduleEntry}
                className="text-sm text-indigo-primary hover:text-indigo-500"
              >
                + Add another time
              </button>
            </div>

            {formData.scheduleEntries.map((entry, index) => (
              <div
                key={index}
                className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-2"
              >
                <div className="grid grid-cols-1 gap-3 flex-1 min-w-0 sm:grid-cols-3">
                  <div className="min-w-0">
                    <label className="block text-xs font-medium text-gray-700 mb-2">
                      Day
                    </label>
                    <select
                      value={entry.day}
                      onChange={(e) =>
                        updateScheduleEntry(index, "day", e.target.value)
                      }
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-primary focus:border-transparent appearance-none bg-white"
                    >
                      <option value="">Select day</option>
                      <option value="Monday">Monday</option>
                      <option value="Tuesday">Tuesday</option>
                      <option value="Wednesday">Wednesday</option>
                      <option value="Thursday">Thursday</option>
                      <option value="Friday">Friday</option>
                      <option value="Saturday">Saturday</option>
                      <option value="Sunday">Sunday</option>
                    </select>
                  </div>

                  <div className="min-w-0 w-full">
                    <label className="block text-xs font-medium text-gray-700 mb-2">
                      Start Time
                    </label>

                    <input
                      type="time"
                      value={entry.startTime}
                      onChange={(e) =>
                        updateScheduleEntry(index, "startTime", e.target.value)
                      }
                      className="
                        w-full
                        min-w-0
                        max-w-full
                        px-2 sm:px-3
                        py-2.5
                        border border-gray-300
                        rounded-lg
                        text-base sm:text-sm
                        focus:outline-none
                        focus:ring-2
                        focus:ring-indigo-primary
                        focus:border-transparent
                        overflow-hidden
                      "
                      style={{
                        WebkitAppearance: "none",
                      }}
                    />
                  </div>

                  <div className="min-w-0 w-full">
                    <label className="block text-xs font-medium text-gray-700 mb-2">
                      End Time
                    </label>

                    <input
                      type="time"
                      value={entry.endTime}
                      onChange={(e) =>
                        updateScheduleEntry(index, "endTime", e.target.value)
                      }
                      className="
                        w-full
                        min-w-0
                        max-w-full
                        px-2 sm:px-3
                        py-2.5
                        border border-gray-300
                        rounded-lg
                        text-base sm:text-sm
                        focus:outline-none
                        focus:ring-2
                        focus:ring-indigo-primary
                        focus:border-transparent
                        overflow-hidden
                      "
                      style={{
                        WebkitAppearance: "none",
                      }}
                    />
                  </div>
                </div>

                {formData.scheduleEntries.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeScheduleEntry(index)}
                    title="Remove this time"
                    aria-label="Remove this time"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-300 text-gray-500 hover:text-red-500 hover:border-red-300 sm:h-11 sm:w-11"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-primary px-4 py-3 font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <circle
                cx="10"
                cy="10"
                r="9"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <path
                d="M10 6V14M6 10H14"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
            {isSubmitting ? "Adding…" : "Add Course"}
          </button>
        </form>
      </div>
    </div>
  );
}
