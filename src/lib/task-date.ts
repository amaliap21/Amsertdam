// Shared parser for task.date strings produced by toLocaleString("en-US", {
// month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) —
// e.g. "May 17, 11:22 PM". Must inject current year ourselves: V8's
// Date constructor defaults to 2001 when no year is present.

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
  if (!raw || raw === "—") return empty;

  if (/\b\d{4}\b/.test(raw)) {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) {
      return { isoDate: toLocalIsoDate(d), clock: { h: d.getHours(), m: d.getMinutes() } };
    }
  }

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

// Extract the assessment name from a task description in the form
// "Assessment: <name> • Item: <name>" (any of the segments may be absent).
export function extractAssessmentName(description: string): string | null {
  if (!description) return null;
  // Stop at a bullet (`•`) OR a newline — otherwise the AI's action text on
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
