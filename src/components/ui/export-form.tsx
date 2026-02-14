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
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 w-[400px] relative">
        <button onClick={onClose} className="absolute right-4 top-4">
          <X size={18} />
        </button>

        <h2 className="text-lg font-semibold mb-2">Export Schedule</h2>
        <p className="text-sm text-gray-500 mb-4">
          Choose the date range and format
        </p>

        {/* Start Date */}
        <input
          type="date"
          className="w-full border rounded-lg p-2 mb-3"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
        />

        {/* End Date */}
        <input
          type="date"
          className="w-full border rounded-lg p-2 mb-3"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
        />

        {/* Format */}
        <select
          className="w-full border rounded-lg p-2 mb-4"
          value={format}
          onChange={(e) => setFormat(e.target.value)}
        >
          <option value="pdf">PDF (.pdf)</option>
          <option value="excel">Excel (.xlsx)</option>
        </select>

        <button
          onClick={handleDownload}
          disabled={isInvalid}
          className="w-full bg-indigo-primary text-white py-2 rounded-lg disabled:opacity-50"
        >
          Download {format === "excel" ? "Excel" : "PDF"}
        </button>
      </div>
    </div>
  );
}
