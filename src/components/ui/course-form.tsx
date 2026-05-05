"use client";
import { X } from "lucide-react";
import React, { useState } from "react";

type CourseFormProps = {
  onSubmit: (course: {
    courseName: string;
    credits: number;
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

export default function CourseForm({ onSubmit, onCancel }: CourseFormProps) {
  const [formData, setFormData] = useState({
    courseName: "",
    credits: 0,
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
          : prev.scheduleEntries.filter((_, entryIndex) => entryIndex !== index),
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const scheduleEntries = formData.scheduleEntries.filter(
      (entry) => entry.day && entry.startTime && entry.endTime,
    );

    if (!scheduleEntries.length) {
      alert("Please add at least one valid schedule day and time.");
      return;
    }

    const newCourse = {
      courseName: formData.courseName,
      credits: formData.credits,
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

    onSubmit(newCourse);
  };

  return (
    <div
      className="fixed inset-0 flex justify-center items-center z-50"
      style={{ background: "rgba(0, 0, 0, 0.64)" }}
    >
      <div className="bg-white rounded-2xl shadow-lg w-125 p-6 relative">
        {/* Close button */}
        <button
          onClick={onCancel}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X size={24} />
        </button>

        {/* Header */}
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-black-primary">
            Add New Course
          </h2>
          <p className="text-sm text-gray-primary mt-1">
            Enter the course detail below
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
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
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-primary focus:border-transparent"
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
              placeholder="0"
              value={formData.credits || ""}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  credits: parseInt(e.target.value) || 0,
                })
              }
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-primary focus:border-transparent appearance-none"
              required
            />
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
              <div key={index} className="grid grid-cols-3 gap-3 items-end">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">
                    Day
                  </label>
                  <select
                    value={entry.day}
                    onChange={(e) => updateScheduleEntry(index, "day", e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-primary focus:border-transparent appearance-none bg-white"
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

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">
                    Start Time
                  </label>
                  <input
                    type="time"
                    value={entry.startTime}
                    onChange={(e) => updateScheduleEntry(index, "startTime", e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-primary focus:border-transparent"
                  />
                </div>

                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-700 mb-2">
                      End Time
                    </label>
                    <input
                      type="time"
                      value={entry.endTime}
                      onChange={(e) => updateScheduleEntry(index, "endTime", e.target.value)}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-primary focus:border-transparent"
                    />
                  </div>
                  {formData.scheduleEntries.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeScheduleEntry(index)}
                      className="h-11 px-3 rounded-lg border border-gray-300 text-gray-500 hover:text-red-500 hover:border-red-300"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            className="w-full mt-6 px-4 py-3 bg-indigo-primary text-white rounded-lg font-medium hover:bg-indigo-500 transition-colors flex items-center justify-center gap-2"
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
            Add Course
          </button>
        </form>
      </div>
    </div>
  );
}
