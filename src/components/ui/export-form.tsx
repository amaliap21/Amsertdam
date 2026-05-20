"use client";

import { useState } from "react";
import { X } from "lucide-react";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

type Event = {
  date: string;
  time: string;
  title: string;
  subject: string;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  events: Event[];
};

export default function ExportModal({ isOpen, onClose, events }: Props) {
  const [startDate, setStartDate] = useState(new Date().toString());
  const [endDate, setEndDate] = useState("");
  const [format, setFormat] = useState("pdf");

  if (!isOpen) return null;

  const exportToExcel = (filtered: Event[]) => {
    const data = filtered.map((event) => ({
      Date: new Date(event.date).toLocaleDateString("en-US"),
      Time: event.time,
      Type: event.title,
      Subject: event.subject,
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);

    // Styling column width
    worksheet["!cols"] = [{ wch: 15 }, { wch: 20 }, { wch: 15 }, { wch: 40 }];

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

    // TABLE
    let y = 35;

    doc.setFont("helvetica", "bold");
    doc.text("Date", 10, y);
    doc.text("Time", 40, y);
    doc.text("Type", 80, y);
    doc.text("Subject", 120, y);

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

      doc.text(date, 10, y);
      doc.text(event.time, 40, y);
      doc.text(event.title, 80, y);

      const split = doc.splitTextToSize(event.subject, 70);
      doc.text(split, 120, y);

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
    (startDate && endDate && new Date(startDate) > new Date(endDate)),
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

        <h2 className="text-base sm:text-lg font-semibold mb-1 sm:mb-2 pr-8">Export Schedule</h2>
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
