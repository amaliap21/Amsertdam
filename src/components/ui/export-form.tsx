"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

type Event = {
  date: string;
  time: string;
  title: string;
  subject: string;
  /** Optional urgency tag — Priority Planner passes "HIGH" / "MEDIUM" /
   *  "LOW" via the underlying ScheduleEvent. Falls back to derived-from-
   *  title when missing. */
  urgency?: string;
};

// Lightweight slice of a TaskItem — only the fields the urgency lookup needs.
type TaskRef = {
  title: string;
  priority: string;
};

type Urgency = "HIGH" | "MEDIUM" | "LOW";

function priorityToUrgency(priority: string): Urgency | "" {
  if (priority === "Focus First") return "HIGH";
  if (priority === "If You Have Energy") return "MEDIUM";
  if (priority === "Safe to Minimize") return "LOW";
  return "";
}

// Decide what urgency label to show for an event in the export. The rules
// follow the user's brief: Class entries don't carry an urgency, and Task
// entries take their urgency from the underlying task's value bucket
// (Focus First / If You Have Energy / Safe to Minimize → HIGH / MEDIUM /
// LOW). AI-generated work blocks embed the tier directly in the subject
// ("Essay · HIGH (3h)") so we read that first.
function urgencyOf(
  ev: Event,
  taskPriorityByName?: Map<string, Urgency>
): string {
  if (ev.urgency) {
    const u = ev.urgency.toUpperCase();
    if (u === "HIGH" || u === "MEDIUM" || u === "LOW") return u;
  }
  const type = (ev.title ?? "").toLowerCase();

  // Class events have no urgency, full stop.
  if (type.includes("class")) return "";

  if (type.includes("task")) {
    // AI events: subject ends with "· HIGH/MEDIUM/LOW (Xh)".
    const m = ev.subject?.match(/·\s*(HIGH|MEDIUM|LOW)\s*\(/i);
    if (m) return m[1].toUpperCase();

    // Manual Task entries — try matching the user-typed subject against a
    // task by title so the right priority bucket carries over.
    if (taskPriorityByName && ev.subject) {
      const subject = ev.subject.trim();
      const exact = taskPriorityByName.get(subject);
      if (exact) return exact;
      // AI-style subjects have "Name · Course" — try the part before "·".
      const beforeBullet = subject.split("·")[0]?.trim();
      if (beforeBullet) {
        const partial = taskPriorityByName.get(beforeBullet);
        if (partial) return partial;
      }
      // Final fallback: substring match on any task title.
      const lower = subject.toLowerCase();
      for (const [name, pri] of taskPriorityByName) {
        if (name && lower.includes(name.toLowerCase())) return pri;
      }
    }
    return "-";
  }

  // Self Study and anything else: no urgency.
  return "";
}

// "2026-05-23" → "Saturday".
function weekdayOf(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { weekday: "long" });
}

type Props = {
  isOpen: boolean;
  onClose: () => void;
  events: Event[];
  /** Tasks from the Task Value store, used to look up urgency for manual
   *  Task entries that don't already embed a tier in their subject. */
  tasks?: TaskRef[];
};

export default function ExportModal({ isOpen, onClose, events, tasks }: Props) {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [format, setFormat] = useState("pdf");

  // Index tasks by title once so urgencyOf can do constant-time lookups
  // while iterating events.
  const taskPriorityByName = useMemo(() => {
    const map = new Map<string, Urgency>();
    if (tasks) {
      for (const t of tasks) {
        const u = priorityToUrgency(t.priority);
        if (u && t.title) map.set(t.title, u);
      }
    }
    return map;
  }, [tasks]);

  if (!isOpen) return null;

  const exportToExcel = (filtered: Event[]) => {
    const data = filtered.map((event) => ({
      Date: new Date(event.date).toLocaleDateString("en-US"),
      Day: weekdayOf(event.date),
      Time: event.time,
      Type: event.title,
      Subject: event.subject,
      Urgency: urgencyOf(event, taskPriorityByName),
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);

    // Date, Day, Time, Type, Subject, Urgency
    worksheet["!cols"] = [
      { wch: 14 },
      { wch: 12 },
      { wch: 18 },
      { wch: 14 },
      { wch: 38 },
      { wch: 10 },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Schedule");

    const excelBuffer = XLSX.write(workbook, {
      bookType: "xlsx",
      type: "array",
    });

    const fileData = new Blob([excelBuffer], {
      type: "application/octet-stream",
    });

    saveAs(fileData, "study-schedule.xlsx");
  };

  const handleDownload = async () => {
    const filtered = filterEvents();

    if (!filtered) return;

    if (format === "excel") {
      exportToExcel(filtered);
      return;
    }

    // ===== PDF =====
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF();

    // HEADER
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("Study Schedule", 105, 15, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);

    const rangeText =
      startDate && endDate ? `from ${startDate} to ${endDate}` : "All Dates";

    doc.text(`Range: ${rangeText}`, 105, 22, { align: "center" });

    doc.line(10, 25, 200, 25);

    // TABLE — columns: Date | Day | Time | Type | Subject | Urgency
    let y = 35;

    doc.setFont("helvetica", "bold");
    doc.text("Date", 10, y);
    doc.text("Day", 38, y);
    doc.text("Time", 60, y);
    doc.text("Type", 90, y);
    doc.text("Subject", 115, y);
    doc.text("Urgency", 180, y);

    y += 5;
    doc.line(10, y, 200, y);
    y += 7;

    doc.setFont("helvetica", "normal");

    filtered.forEach((event) => {
      if (y > 270) {
        doc.addPage();
        y = 20;
      }

      const date = new Date(event.date).toLocaleDateString("en-US");
      const day = weekdayOf(event.date);

      doc.text(date, 10, y);
      doc.text(day, 38, y);
      doc.text(event.time, 60, y);
      doc.text(event.title, 90, y);

      const split = doc.splitTextToSize(event.subject, 60);
      doc.text(split, 115, y);
      doc.text(urgencyOf(event, taskPriorityByName), 180, y);

      y += Math.max(7, split.length * 5);
    });

    doc.save("study-schedule.pdf");
  };

  const filterEvents = () => {
    // kalau kosong semua → return semua
    if (!startDate && !endDate) return events;

    // kalau cuma salah satu → invalid
    if ((startDate && !endDate) || (!startDate && endDate)) {
      alert("Please select both start and end date");
      return null;
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    return events.filter((event) => {
      const d = new Date(event.date);
      return d >= start && d <= end;
    });
  };

  const isInvalid = Boolean(
    (startDate && !endDate) ||
      (!startDate && endDate) ||
      (startDate && endDate && new Date(startDate) > new Date(endDate))
  );

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-3 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl p-5 sm:p-6 w-full max-w-[22rem] sm:max-w-md max-h-[90dvh] overflow-y-auto relative my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 sm:right-4 sm:top-4 flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          aria-label="Close"
        >
          <X size={18} />
        </button>

        <h2 className="text-base sm:text-lg font-semibold mb-1 sm:mb-2 pr-8">
          Export Schedule
        </h2>
        <p className="text-xs sm:text-sm text-gray-500 mb-4">
          Choose the date range and format
        </p>

        {/* Start Date */}
        <label
          htmlFor="export-start-date"
          className="block text-xs font-medium text-gray-700 mb-1.5"
        >
          Start date
        </label>
        <input
          id="export-start-date"
          type="date"
          className="w-full border border-gray-300 rounded-lg px-3 py-2.5 mb-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-primary"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
        />

        {/* End Date */}
        <label
          htmlFor="export-end-date"
          className="block text-xs font-medium text-gray-700 mb-1.5"
        >
          End date
        </label>
        <input
          id="export-end-date"
          type="date"
          className="w-full border border-gray-300 rounded-lg px-3 py-2.5 mb-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-primary"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
        />

        {/* Format */}
        <label
          htmlFor="export-format"
          className="block text-xs font-medium text-gray-700 mb-1.5"
        >
          Format
        </label>
        <select
          id="export-format"
          className="w-full border border-gray-300 bg-white rounded-lg px-3 py-2.5 mb-5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-primary"
          value={format}
          onChange={(e) => setFormat(e.target.value)}
        >
          <option value="pdf">PDF (.pdf)</option>
          <option value="excel">Excel (.xlsx)</option>
        </select>

        <button
          type="button"
          onClick={handleDownload}
          disabled={isInvalid}
          className="w-full bg-indigo-primary text-white py-2.5 rounded-lg text-sm font-medium hover:bg-indigo-500 transition disabled:opacity-50"
        >
          Download {format === "excel" ? "Excel" : "PDF"}
        </button>
      </div>
    </div>
  );
}
