"use client";

import { Download } from "lucide-react";
import { useState } from "react";
import ExportModal from "@/components/ui/export-form";

export default function PriorityPlanner() {
  const events = [
    {
      id: 1,
      title: "Class",
      date: "2026-02-14",
      time: "8 AM - 10 AM",
      subject: "Data Structures and Algorithms",
      color: "bg-green-primary",
      bgColor: "bg-[#84E0A31A]",
    },
    {
      id: 2,
      title: "Task",
      date: "2026-02-15",
      time: "10 AM - 12 PM",
      subject: "Operating System Project",
      color: "bg-blue-primary",
      bgColor: "bg-[#587ECE1A]",
    },
    {
      id: 3,
      title: "Self Study",
      date: "2026-02-17",
      time: "2 PM - 3 PM",
      subject: "Computer Network",
      color: "bg-teal-primary",
      bgColor: "bg-[#6EAFBB1A]",
    },
  ];

  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<number>(new Date().getDate());

  const [selected, setSelected] = useState<"Day" | "Week" | "Month">("Day");

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthName = currentDate.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const calendarDays = [];

  const adjustedFirstDay = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;
  for (let i = 0; i < adjustedFirstDay; i++) {
    calendarDays.push(null);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    calendarDays.push(day);
  }

  const previousDay = () => {
    const newDate = new Date(year, month, selectedDay - 1);
    setCurrentDate(newDate);
    setSelectedDay(newDate.getDate());
  };

  const nextDay = () => {
    const newDate = new Date(year, month, selectedDay + 1);
    setCurrentDate(newDate);
    setSelectedDay(newDate.getDate());
  };

  const previousWeek = () => {
    const newDate = new Date(year, month, selectedDay - 7);
    setCurrentDate(newDate);
    setSelectedDay(newDate.getDate());
  };

  const nextWeek = () => {
    const newDate = new Date(year, month, selectedDay + 7);
    setCurrentDate(newDate);
    setSelectedDay(newDate.getDate());
  };

  const previousMonth = () => {
    const newDate = new Date(year, month - 1, 1);
    setCurrentDate(newDate);
    setSelectedDay(1);
  };

  const nextMonth = () => {
    const newDate = new Date(year, month + 1, 1);
    setCurrentDate(newDate);
    setSelectedDay(1);
  };

  const getFilteredEvents = () => {
    const selectedDate = new Date(year, month, selectedDay);

    return events.filter((event) => {
      const eventDate = new Date(event.date);

      // DAY
      if (selected === "Day") {
        return eventDate.toDateString() === selectedDate.toDateString();
      }

      // WEEK
      if (selected === "Week") {
        const startOfWeek = new Date(selectedDate);
        startOfWeek.setDate(selectedDate.getDate() - selectedDate.getDay());

        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);

        return eventDate >= startOfWeek && eventDate <= endOfWeek;
      }

      // MONTH
      if (selected === "Month") {
        return (
          eventDate.getMonth() === month && eventDate.getFullYear() === year
        );
      }

      return false;
    });
  };

  const dayName =
    selected.toLowerCase() === "day"
      ? currentDate.toLocaleDateString("en-US", { weekday: "long" })
      : selected.toLowerCase() === "week"
        ? currentDate.toLocaleDateString("en-US", { weekday: "long" })
        : selected.toLowerCase() === "month"
          ? currentDate.toLocaleDateString("en-US", { weekday: "long" })
          : "";

  const [isExportOpen, setIsExportOpen] = useState(false);

  return (
    <div className="flex flex-col gap-9 px-14.75 py-11.5 w-full">
      {/* Header */}
      <div className="flex flex-row justify-between items-center">
        <div className="flex flex-col">
          <h1 className="text-[20px] font-semibold text-black-primary">
            Passing Target
          </h1>
          <p className="text-gray-primary font-medium text-sm">
            Understanding the minimum you need to pass each course
          </p>
        </div>

        <button
          onClick={() => setIsExportOpen(true)}
          className="flex flex-row gap-2 px-3 py-2 rounded-lg bg-indigo-primary text-white items-center cursor-pointer hover:bg-indigo-500 transition-colors"
        >
          <Download size={16} />
          Export
        </button>
      </div>

      {/* Content */}
      <div className="flex flex-col gap-6">
        <div className="flex flex-row justify-between items-end">
          {/* repetition day/week/month */}
          <div className="flex flex-row gap-18 p-2 bg-[#3D42E51A] rounded-xl">
            {["Day", "Week", "Month"].map((label) => (
              <button
                key={label}
                className={`px-5 py-1.5 rounded-lg cursor-pointer ${
                  selected === label ? "bg-white" : ""
                }`}
                onClick={() => setSelected(label as "Day" | "Week" | "Month")}
              >
                {label}
              </button>
            ))}
          </div>

          {/* types */}
          <div className="flex flex-row gap-9">
            {getFilteredEvents().map((event) => (
              <div key={event.id} className="flex flex-row items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${event.color}`}></div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">
                    {event.title}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* dates */}
          {/* Month Navigation */}
          <div className="flex items-end justify-between">
            <button
              onClick={
                selected === "Day"
                  ? previousDay
                  : selected === "Week"
                    ? previousWeek
                    : previousMonth
              }
              className="px-2 py-1 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="Previous"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
            <h3 className="text-lg font-medium text-gray-900">{monthName}</h3>
            <button
              onClick={
                selected === "Day"
                  ? nextDay
                  : selected === "Week"
                    ? nextWeek
                    : nextMonth
              }
              className="px-2 py-1 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="Next"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <div
        className="flex flex-col p-7 items-start self-stretch gap-5"
        style={{
          borderRadius: "16px",
          border: "1px solid rgba(204, 204, 204, 0.75)",
        }}
      >
        <h1>
          {dayName}, {selectedDay} {monthName}
        </h1>

        {/* cards iteration of events */}
        {getFilteredEvents().map((event) => (
          <div
            key={event.id}
            className={`flex flex-col gap-2 px-5 py-3 w-full rounded-lg ${event.bgColor}`}
          >
            <div className="flex flex-row justify-start items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${event.color}`}></div>
              <p className="text-sm font-semibold text-black-primary">
                {event.time}
              </p>
            </div>
            <p className="text-sm font-medium text-gray-primary">
              [{event.title}] {event.subject}
            </p>
          </div>
        ))}
      </div>

      <ExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        events={events}
      />
    </div>
  );
}
