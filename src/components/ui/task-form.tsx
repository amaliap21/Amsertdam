"use client";

import { X, Calendar, CirclePlus } from "lucide-react";
import { useState } from "react";

type AddTaskModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (task: {
    taskName: string;
    description: string;
    deadline: string;
  }) => void;
};

export default function AddTaskModal({
  isOpen,
  onClose,
  onSubmit,
}: AddTaskModalProps) {
  const [formData, setFormData] = useState({
    taskName: "",
    description: "",
    deadline: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
    setFormData({ taskName: "", description: "", deadline: "" });
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
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-6 right-6 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X size={24} />
        </button>

        {/* Header */}
        <div className="mb-8">
          <h2 className="text-2xl font-semibold text-black-primary mb-2">
            Add New Task
          </h2>
          <p className="text-sm text-gray-primary">
            AI will estimate effort based on your description
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Task Name */}
          <div>
            <label className="block text-sm font-medium text-black-primary mb-3">
              Task Name
            </label>
            <input
              type="text"
              placeholder="e.g., Complete assignment 3"
              value={formData.taskName}
              onChange={(e) =>
                setFormData({ ...formData, taskName: e.target.value })
              }
              className="w-full px-4 py-3.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-primary focus:border-transparent text-black-primary placeholder:text-gray-400"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-black-primary mb-3">
              Description
            </label>
            <textarea
              placeholder="Describe the task. AI will estimate time and effort from this."
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              className="w-full px-4 py-3.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-primary focus:border-transparent text-black-primary placeholder:text-gray-400 resize-none"
              rows={4}
              required
            />
          </div>

          {/* Deadline */}
          <div>
            <label className="block text-sm font-medium text-black-primary mb-3">
              Deadline
            </label>
            <div className="relative">
              <Calendar
                size={20}
                className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400"
              />
              <input
                type="date"
                value={formData.deadline}
                onChange={(e) =>
                  setFormData({ ...formData, deadline: e.target.value })
                }
                className="w-full pl-12 pr-4 py-3.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-primary focus:border-transparent text-black-primary placeholder:text-gray-400"
                placeholder="Pick a date"
                required
              />
            </div>
          </div>

          {/* Submit Button */}
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
