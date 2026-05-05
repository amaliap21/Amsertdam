"use client";

import { useState } from "react";
import { X, Calendar as CalendarIcon, ChevronDown } from "lucide-react";
import toast from "react-hot-toast";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onAdd?: (data: {
    title: string;
    type: ScheduleType;
    date: string;
    time: string;
  }) => void;
};

const TYPES = [
  { value: "Class", color: "bg-green-primary" },
  { value: "Task", color: "bg-blue-primary" },
  { value: "Self Study", color: "bg-teal-primary" },
] as const;

type ScheduleType = (typeof TYPES)[number]["value"];

export default function AddScheduleModal({ isOpen, onClose, onAdd }: Props) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<ScheduleType>("Class");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [typeOpen, setTypeOpen] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !type || !date || !time) {
      toast.error("Please fill in all required fields");
      return;
    }
    onAdd?.({ title, type, date, time });
    toast.success("Schedule added");
    setTitle("");
    setType("Class");
    setDate("");
    setTime("");
    onClose();
  };

  const selectedColor = TYPES.find((t) => t.value === type)?.color ?? "bg-gray-300";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <form
        onSubmit={handleSubmit}
        className="relative w-full max-w-[511px] rounded-2xl bg-white p-9 shadow-xl"
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
            Add Schedule
          </h2>
          <p className="text-sm text-gray-primary">
            Add your own schedule here
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

          <div className="grid grid-cols-2 gap-5">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-black-primary">
                Date*
              </label>
              <div className="relative">
                <CalendarIcon
                  size={18}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
                />
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-indigo-primary"
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-black-primary">
                Time*
              </label>
              <input
                type="text"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                placeholder="e.g., 1 PM - 3 PM"
                className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-indigo-primary"
              />
            </div>
          </div>
        </div>

        <button
          type="submit"
          className="mt-8 w-full rounded-lg bg-indigo-primary py-2.5 text-sm font-medium text-white transition hover:opacity-90"
        >
          Add Schedule
        </button>
      </form>
    </div>
  );
}
