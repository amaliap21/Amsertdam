// Task dates are stored as real ISO timestamps (e.g. "2026-11-20T23:22:00.000Z").
// Legacy entries written before this change were year-less display strings like
// "May 17, 11:22 PM" — we still parse those for backwards compatibility, but
// the active write path no longer produces them.

export function toLocalIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseTaskDate(
  raw: string,
): { isoDate: string; clock: { h: number; m: number } | null } {
  const empty = { isoDate: "", clock: null as { h: number; m: number } | null };
  if (!raw || raw === "-") return empty;

  // Modern path: a real Date string with a year (ISO, RFC, or any
  // toLocaleString output that includes the year).
  if (/\b\d{4}\b/.test(raw)) {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) {
      return { isoDate: toLocalIsoDate(d), clock: { h: d.getHours(), m: d.getMinutes() } };
    }
  }

  // Legacy fallback: year-less display strings written by an older client.
  // Use current year only as a best-effort guess so the row still renders.
  const currentYear = new Date().getFullYear();
  const candidates = [
    raw.replace(/^([A-Za-z]+ \d+),\s*/, `$1 ${currentYear} `),
    raw.replace(/^([A-Za-z]+ \d+)\s+/, `$1 ${currentYear} `),
    `${raw} ${currentYear}`,
  ];
  for (const candidate of candidates) {
    const d = new Date(candidate);
    if (!Number.isNaN(d.getTime()) && d.getFullYear() === currentYear) {
      return { isoDate: toLocalIsoDate(d), clock: { h: d.getHours(), m: d.getMinutes() } };
    }
  }
  return empty;
}

// Format any stored task.date (ISO or legacy display string) into the
// short human-readable form used across the UI ("Nov 20, 11:22 PM").
// Returns the raw string unchanged when it can't be parsed (e.g. "—").
export function formatTaskDate(raw: string): string {
  if (!raw || raw === "-") return raw || "-";
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) {
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }
  return raw;
}

// Extract the assessment name from a task description in the form
// "Assessment: <name> • Item: <name>" (any of the segments may be absent).
export function extractAssessmentName(description: string): string | null {
  if (!description) return null;
  // Stop at a bullet (`•`) OR a newline, otherwise the AI's action text on
  // the next line would get swallowed into the name (e.g. it would return
  // "Tugas Do it fully and on time" instead of "Tugas").
  const match = description.match(/Assessment:\s*([^\n•]+)/i);
  if (!match) return null;
  const name = match[1].trim();
  return name || null;
}

export function extractItemName(description: string): string | null {
  if (!description) return null;
  const match = description.match(/Item:\s*([^\n•]+)/i);
  if (!match) return null;
  const name = match[1].trim();
  return name || null;
}
