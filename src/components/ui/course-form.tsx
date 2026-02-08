"use client";
import { X } from "lucide-react";
import React, { useState } from "react";

type CourseFormProps = {
  onSubmit: (course: {
    courseName: string;
    credits: number;
    fromTime: number;
    toTime: number;
    typeTracking: string;
    threshold: number;
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
    scheduleDay: "",
    time: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const newCourse = {
      courseName: formData.courseName,
      credits: formData.credits,
      fromTime: parseInt(formData.time.split(":")[0]) || 0,
      toTime: (parseInt(formData.time.split(":")[0]) || 0) + 2,
      typeTracking: "On Track",
      threshold: 0,
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

          {/* Schedule Day and Time */}
          <div className="grid grid-cols-2 gap-4">
            {/* Schedule Day */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Schedule Day<span className="text-red-500">*</span>
              </label>
              <select
                value={formData.scheduleDay}
                onChange={(e) =>
                  setFormData({ ...formData, scheduleDay: e.target.value })
                }
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-primary focus:border-transparent appearance-none bg-white"
                required
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

            {/* Time */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Time<span className="text-red-500">*</span>
              </label>
              <input
                type="time"
                placeholder="e.g., 12:30"
                value={formData.time}
                onChange={(e) =>
                  setFormData({ ...formData, time: e.target.value })
                }
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-primary focus:border-transparent"
                required
              />
            </div>
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
