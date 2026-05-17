import { NextRequest, NextResponse } from "next/server";
import {
  analyzeBatch,
  type TaskInput as AnalysisInput,
  type TaskResult,
} from "@/lib/python-ports/priority-analysis";

// Mirror of api/python/scheduling.py. Produces the same response shape so the
// front-end can use this URL in dev and the Vercel Python function in prod.

// ---------- weights ----------
const EFFECTIVE_W_TOPSIS = 0.52;
const EFFECTIVE_W_COMPOSITE = 0.18;
const EFFECTIVE_W_SKS = 0.10;
const EFFECTIVE_W_URGENCY = 0.14;
const EFFECTIVE_W_GAP = 0.10;
const EFFECTIVE_W_IMPACT = 0.06;
const EFFECTIVE_W_EFFORT_PENALTY = 0.18;

const BUCKET_PRIORITY_SCORE: Record<string, number> = {
  "focus first": 0.75,
  "if you have energy": 0.45,
  "safe to minimize": 0.20,
};

const EFFORT_LABEL_PENALTY: Record<string, number> = {
  low: 0.25,
  medium: 0.55,
  high: 0.80,
};

// ---------- helpers ----------
function clip01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function safeFloat(value: unknown, fallback: number): number {
  if (value == null) return fallback;
  if (typeof value === "string") {
    const cleaned = value.trim().toLowerCase().replace(/hours|hour|h/g, "");
    if (cleaned === "") return fallback;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : fallback;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalize(value: number, min: number, max: number): number {
  if (max === min) return 0.5;
  return clip01((value - min) / (max - min));
}

function deadlineUrgency(days: number): number {
  if (days <= 0) return 1.0;
  return Math.exp(-0.18 * days);
}

function gapScore(current: number, passing: number): number {
  const gap = passing - current;
  if (gap <= 0) return 0;
  return Math.min(1, gap / 30);
}

function taskName(task: Record<string, unknown>): string {
  return (
    (task.name as string | undefined) ??
    (task.task_name as string | undefined) ??
    (task.title as string | undefined) ??
    "Task"
  );
}

function inferTaskType(task: Record<string, unknown>): string {
  const parts = [
    task.task_type, task.course, task.name, task.task_name, task.title, task.description,
  ].filter(Boolean).map((p) => String(p).toLowerCase()).join(" ");
  if (/exam|midterm|final/.test(parts)) return "exam";
  if (parts.includes("quiz")) return "quiz";
  if (parts.includes("project")) return "project";
  if (/homework|assignment|task/.test(parts)) return "homework";
  return "generic";
}

function inferEffortLabel(hours: number): string {
  if (hours <= 2) return "low";
  if (hours <= 5) return "medium";
  return "high";
}

function gradeWeightFromBucket(label: string): number {
  if (label === "focus first") return 25;
  if (label === "if you have energy") return 12;
  if (label === "safe to minimize") return 5;
  return 0;
}

function deriveGradeWeight(task: Record<string, unknown>): number {
  if (task.grade_weight != null) return safeFloat(task.grade_weight, 0);
  const bucketLabel = String(task.priority ?? "").trim().toLowerCase();
  if (bucketLabel) return gradeWeightFromBucket(bucketLabel);
  const t = inferTaskType(task);
  if (t === "exam") return 25;
  if (t === "project") return 15;
  if (t === "quiz") return 10;
  if (t === "homework") return 5;
  return 0;
}

function parseIsoDate(value: unknown): Date | null {
  if (!value) return null;
  const s = String(value).slice(0, 10);
  const d = new Date(s + "T00:00:00");
  return Number.isNaN(d.getTime()) ? null : d;
}

function deriveDeadlineDays(task: Record<string, unknown>, start: Date): number {
  if (task.deadline_days != null) return Math.max(0, safeFloat(task.deadline_days, 7));
  for (const key of ["date", "deadline", "due_date"] as const) {
    const parsed = parseIsoDate(task[key]);
    if (parsed) {
      const diff = Math.round((parsed.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      return Math.max(0, diff);
    }
  }
  return 7;
}

function defaultSksScore(task: Record<string, unknown>): number {
  const sks = safeFloat(task.sks ?? task.credits ?? 0, 0);
  return normalize(sks, 0, 6);
}

function defaultEffortPenalty(task: Record<string, unknown>): number {
  const label = String(task.effort ?? "").trim().toLowerCase();
  if (label in EFFORT_LABEL_PENALTY) return EFFORT_LABEL_PENALTY[label];
  const estimated = safeFloat(task.estimated_hours ?? 1, 1);
  const cap = safeFloat(task.weekly_capacity_hours ?? 40, 40);
  if (cap <= 0) return 1.0;
  return clip01(estimated / cap);
}

function bucketPriorityScore(task: Record<string, unknown>): number | null {
  const label = String(task.priority ?? "").trim().toLowerCase();
  if (!label) return null;
  return BUCKET_PRIORITY_SCORE[label] ?? null;
}

function tierLabel(score: number): "HIGH" | "MEDIUM" | "LOW" {
  if (score >= 0.55) return "HIGH";
  if (score >= 0.30) return "MEDIUM";
  return "LOW";
}

function rankAction(tier: string, task: CanonicalTask): string {
  const days = safeFloat(task.deadline_days, 7);
  const name = taskName(task as unknown as Record<string, unknown>);
  if (tier === "HIGH") {
    if (days <= 2) return `Start ${name} today — deadline is critical.`;
    return `Tackle ${name} first thing — high impact.`;
  }
  if (tier === "MEDIUM") return `Schedule ${name} after HIGH priority tasks.`;
  return `Do ${name} only if time permits.`;
}

function hoursNeeded(task: CanonicalTask): number {
  const hours = safeFloat(task.estimated_hours, 1);
  const completion = Math.max(0, Math.min(100, safeFloat(task.completion_pct, 0)));
  return hours * (1 - completion / 100);
}

interface CanonicalTask {
  task_id: string;
  name: string;
  task_name: string;
  title: string;
  course?: string;
  task_type: string;
  estimated_hours: number;
  deadline_days: number;
  grade_weight: number;
  sks: number;
  current_grade: number;
  passing_grade: number;
  weekly_capacity_hours: number;
  difficulty: string;
  completion_pct: number;
  effort: string;
  priority?: string;
  analysis?: TaskResult;
  _priority_score?: number;
  _tier?: "HIGH" | "MEDIUM" | "LOW";
  _priority_source?: string;
  [key: string]: unknown;
}

function buildCanonicalTask(
  raw: Record<string, unknown>,
  index: number,
  currentGrade: number,
  passingGrade: number,
  dailyHours: number,
  start: Date,
): CanonicalTask {
  const taskId = String(raw.task_id ?? raw.id ?? `task_${index}`);
  const name = taskName(raw);
  const estimated = safeFloat(raw.estimated_hours ?? raw.timeEstimate ?? 1, 1);
  const deadlineDays = deriveDeadlineDays(raw, start);
  const gradeWeight = deriveGradeWeight(raw);
  const sks = safeFloat(raw.sks ?? raw.credits ?? 0, 0);
  const completion = Math.max(0, Math.min(100, safeFloat(raw.completion_pct ?? raw.completion ?? 0, 0)));
  const effortLabel = String(raw.effort ?? "").trim().toLowerCase() || inferEffortLabel(estimated);
  const weeklyCapacity = safeFloat(raw.weekly_capacity_hours ?? dailyHours * 7, dailyHours * 7);
  const taskType = inferTaskType(raw);
  const difficulty =
    String(raw.difficulty ?? "").trim().toLowerCase() || (estimated > 5 ? "hard" : "medium");

  return {
    ...raw,
    task_id: taskId,
    name,
    task_name: name,
    title: String(raw.title ?? name),
    course: raw.course as string | undefined,
    task_type: taskType,
    estimated_hours: estimated,
    deadline_days: deadlineDays,
    grade_weight: gradeWeight,
    sks,
    current_grade: currentGrade,
    passing_grade: passingGrade,
    weekly_capacity_hours: weeklyCapacity,
    difficulty,
    completion_pct: completion,
    effort: effortLabel,
    priority: String(raw.priority ?? "").trim(),
  };
}

function toAnalysisPayload(task: CanonicalTask): AnalysisInput {
  return {
    task_id: task.task_id,
    task_name: task.name,
    task_type: task.task_type,
    grade_weight: task.grade_weight,
    sks: task.sks,
    estimated_hours: task.estimated_hours,
    deadline_days: task.deadline_days,
    current_grade: task.current_grade,
    passing_grade: task.passing_grade,
    weekly_capacity_hours: task.weekly_capacity_hours,
  };
}

function mergeAnalysisResults(
  tasks: CanonicalTask[],
  report: { tasks: TaskResult[] },
): CanonicalTask[] {
  const byId = new Map<string, TaskResult>();
  const byName = new Map<string, TaskResult>();
  for (const item of report.tasks) {
    if (item.task_id != null) byId.set(String(item.task_id), item);
    const detailName = String(item.task_name ?? "").toLowerCase();
    if (!byName.has(detailName)) byName.set(detailName, item);
  }
  return tasks.map((t) => {
    const analysis = byId.get(t.task_id) ?? byName.get(t.name.toLowerCase());
    return { ...t, analysis };
  });
}

function computeHybridScore(
  task: CanonicalTask,
  currentGrade: number,
  passingGrade: number,
): number {
  const analysis = task.analysis ?? ({} as TaskResult);
  const breakdown = analysis.breakdown ?? {
    grade_impact: 0,
    sks_score: 0,
    urgency: 0,
    gap_factor: 0,
    effort_penalty: 0,
  };

  const days = safeFloat(task.deadline_days, 7);
  const completion = Math.max(0, Math.min(100, safeFloat(task.completion_pct, 0)));

  const internalScore = clip01(
    0.3 * deadlineUrgency(days) + 0.2 * (safeFloat(task.grade_weight, 0) / 100),
  );
  const bucketScore = bucketPriorityScore(task as unknown as Record<string, unknown>);

  let topsis = analysis.topsis_score == null ? null : clip01(safeFloat(analysis.topsis_score, 0));
  let composite = analysis.composite_score == null ? null : clip01(safeFloat(analysis.composite_score, 0));

  if (topsis == null) topsis = composite ?? bucketScore ?? internalScore;
  if (composite == null) composite = bucketScore ?? internalScore;

  const urgency = clip01(safeFloat(breakdown.urgency, deadlineUrgency(days)));
  const gapFactor = clip01(safeFloat(breakdown.gap_factor, gapScore(currentGrade, passingGrade)));
  const sksScore = clip01(safeFloat(breakdown.sks_score, defaultSksScore(task as unknown as Record<string, unknown>)));
  const impact = clip01(
    safeFloat(breakdown.grade_impact, safeFloat(task.grade_weight, 0) / 100),
  );
  const effortPenalty = clip01(
    safeFloat(breakdown.effort_penalty, defaultEffortPenalty(task as unknown as Record<string, unknown>)),
  );

  const base =
    EFFECTIVE_W_TOPSIS * topsis
    + EFFECTIVE_W_COMPOSITE * composite
    + EFFECTIVE_W_SKS * sksScore
    + EFFECTIVE_W_URGENCY * urgency
    + EFFECTIVE_W_GAP * gapFactor
    + EFFECTIVE_W_IMPACT * impact;

  const penalty = EFFECTIVE_W_EFFORT_PENALTY * effortPenalty;
  const progressBoost = 0.12 * (1 - completion / 100);
  const deadlineBoost = days <= 2 ? 0.12 : days <= 5 ? 0.08 : days <= 10 ? 0.03 : 0.0;

  let score = clip01(base - penalty + progressBoost + deadlineBoost);

  if (currentGrade >= passingGrade) score = Math.min(score, 0.35);
  if (completion >= 100) return 0.0;

  return Math.round(score * 10000) / 10000;
}

// ---------- session normalization ----------
interface AbsoluteSession { start_dt: Date; end_dt: Date; }
interface DailyTemplate { start_time: { h: number; m: number }; end_time: { h: number; m: number }; }

function parseTimeOnly(value: unknown): { h: number; m: number } | null {
  if (typeof value !== "string") return null;
  const m = value.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return { h, m: min };
}

function parseTimestamp(value: unknown): Date | null {
  if (!value) return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

function normalizeSessions(
  raw: unknown,
): { absolute?: AbsoluteSession[]; templates?: DailyTemplate[] } | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const absolute: AbsoluteSession[] = [];
  const templates: DailyTemplate[] = [];

  for (const item of raw) {
    let rawStart: unknown;
    let rawEnd: unknown;
    if (item && typeof item === "object" && !Array.isArray(item)) {
      const obj = item as Record<string, unknown>;
      rawStart = obj.start_time ?? obj.start ?? obj.from;
      rawEnd = obj.end_time ?? obj.end ?? obj.to;
    } else if (Array.isArray(item) && item.length >= 2) {
      rawStart = item[0];
      rawEnd = item[1];
    }

    const startDt = parseTimestamp(rawStart);
    const endDt = parseTimestamp(rawEnd);
    if (startDt && endDt && endDt > startDt) {
      absolute.push({ start_dt: startDt, end_dt: endDt });
      continue;
    }
    const startT = parseTimeOnly(rawStart);
    const endT = parseTimeOnly(rawEnd);
    if (startT && endT) templates.push({ start_time: startT, end_time: endT });
  }

  if (absolute.length) {
    absolute.sort((a, b) => a.start_dt.getTime() - b.start_dt.getTime());
    return { absolute };
  }
  if (templates.length) return { templates };
  return null;
}

function expandDailyTemplates(
  templates: DailyTemplate[],
  start: Date,
  scoredTasks: CanonicalTask[],
): AbsoluteSession[] {
  const perDayAvailable = templates.reduce((sum, t) => {
    const dur = (t.end_time.h * 60 + t.end_time.m) - (t.start_time.h * 60 + t.start_time.m);
    return sum + Math.max(0, dur / 60);
  }, 0);

  const totalNeeded = scoredTasks.reduce((s, t) => s + hoursNeeded(t), 0);
  if (perDayAvailable <= 0) return [];

  const daysNeededEst = Math.ceil(totalNeeded / perDayAvailable);
  const maxDeadline = scoredTasks.reduce(
    (m, t) => Math.max(m, Math.floor(safeFloat(t.deadline_days, 7))),
    0,
  );
  const horizon = Math.max(14, daysNeededEst + 3, maxDeadline + 1);

  const out: AbsoluteSession[] = [];
  for (let d = 0; d < horizon; d++) {
    const dayDate = new Date(start.getTime() + d * 24 * 60 * 60 * 1000);
    for (const tpl of templates) {
      const startDt = new Date(dayDate);
      startDt.setHours(tpl.start_time.h, tpl.start_time.m, 0, 0);
      const endDt = new Date(dayDate);
      endDt.setHours(tpl.end_time.h, tpl.end_time.m, 0, 0);
      if (endDt > startDt) out.push({ start_dt: startDt, end_dt: endDt });
    }
  }
  return out;
}

// ---------- scheduling ----------
interface ScheduleEntry {
  day: number;
  start_time: string;
  end_time: string;
  task_id?: string;
  task_name: string;
  hours_allocated: number;
  priority_score: number;
  tier: "HIGH" | "MEDIUM" | "LOW";
  priority_source: string;
  analysis_priority?: string;
}

function buildSchedule(
  tasks: CanonicalTask[],
  dailyLimit: number,
  start: Date,
  sessions: AbsoluteSession[] | null,
): ScheduleEntry[] {
  const schedule: ScheduleEntry[] = [];
  let lastEntry: ScheduleEntry | null = null;

  const pushOrMerge = (entry: ScheduleEntry) => {
    if (
      lastEntry &&
      lastEntry.day === entry.day &&
      lastEntry.task_id === entry.task_id &&
      lastEntry.task_name === entry.task_name &&
      lastEntry.end_time === entry.start_time
    ) {
      lastEntry.end_time = entry.end_time;
      lastEntry.hours_allocated = Math.round((lastEntry.hours_allocated + entry.hours_allocated) * 10) / 10;
    } else {
      schedule.push(entry);
      lastEntry = entry;
    }
  };

  const dayNumberOf = (dt: Date) =>
    Math.floor((dt.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;

  if (sessions && sessions.length) {
    const cursors = sessions.map((s) => ({ ...s, cursor: new Date(s.start_dt) }));

    for (const task of tasks) {
      let remaining = hoursNeeded(task);
      const name = task.name;

      while (remaining > 0.05) {
        const session = cursors.find((s) => s.cursor < s.end_dt);
        if (!session) break;

        const available = (session.end_dt.getTime() - session.cursor.getTime()) / (3600 * 1000);
        if (available <= 0) continue;

        const slot = Math.min(1.0, remaining, available);
        const startDt = new Date(session.cursor);
        const endDt = new Date(startDt.getTime() + slot * 3600 * 1000);

        const deadlineDate = new Date(start.getTime() + Math.floor(safeFloat(task.deadline_days, 99)) * 24 * 3600 * 1000);
        if (startDt > deadlineDate) {
          remaining = 0;
          break;
        }

        pushOrMerge({
          day: dayNumberOf(startDt),
          start_time: startDt.toISOString(),
          end_time: endDt.toISOString(),
          task_id: task.task_id,
          task_name: name,
          hours_allocated: Math.round(slot * 10) / 10,
          priority_score: task._priority_score ?? 0,
          tier: task._tier ?? "LOW",
          priority_source: task._priority_source ?? "effective_hybrid",
          analysis_priority: task.analysis?.priority,
        });

        session.cursor = endDt;
        remaining -= slot;
      }
    }
    return schedule;
  }

  // Fallback: daily-limit-based scheduling
  let dayIdx = 0;
  let dayHoursUsed = 0;
  for (const task of tasks) {
    let remaining = hoursNeeded(task);
    while (remaining > 0.05) {
      if (dailyLimit > 0 && dayHoursUsed >= dailyLimit) {
        dayIdx++;
        dayHoursUsed = 0;
      }
      const availableToday = dailyLimit > 0 ? dailyLimit - dayHoursUsed : remaining;
      if (availableToday <= 0) {
        dayIdx++;
        dayHoursUsed = 0;
        continue;
      }
      const slot = Math.min(1.0, remaining, availableToday);
      const currentDate = new Date(start.getTime() + dayIdx * 24 * 3600 * 1000);
      const startDt = new Date(currentDate);
      startDt.setHours(0, 0, 0, 0);
      startDt.setTime(startDt.getTime() + dayHoursUsed * 3600 * 1000);
      const endDt = new Date(startDt.getTime() + slot * 3600 * 1000);

      const deadlineDate = new Date(start.getTime() + Math.floor(safeFloat(task.deadline_days, 99)) * 24 * 3600 * 1000);
      if (currentDate > deadlineDate) break;

      pushOrMerge({
        day: dayIdx + 1,
        start_time: startDt.toISOString(),
        end_time: endDt.toISOString(),
        task_id: task.task_id,
        task_name: task.name,
        hours_allocated: Math.round(slot * 10) / 10,
        priority_score: task._priority_score ?? 0,
        tier: task._tier ?? "LOW",
        priority_source: task._priority_source ?? "effective_hybrid",
        analysis_priority: task.analysis?.priority,
      });

      dayHoursUsed += slot;
      remaining -= slot;
    }
  }

  return schedule;
}

function buildDeadlineWarnings(
  tasks: CanonicalTask[],
  schedule: ScheduleEntry[],
  start: Date,
) {
  const byTask = new Map<string, ScheduleEntry[]>();
  for (const e of schedule) {
    if (!e.task_id) continue;
    if (!byTask.has(e.task_id)) byTask.set(e.task_id, []);
    byTask.get(e.task_id)!.push(e);
  }

  const warnings: Record<string, unknown>[] = [];
  for (const task of tasks) {
    const needed = hoursNeeded(task);
    const days = safeFloat(task.deadline_days, 7);
    const deadlineDate = new Date(start.getTime() + Math.floor(days) * 24 * 3600 * 1000);
    let allocated = 0;
    for (const e of byTask.get(task.task_id) ?? []) {
      const startDt = new Date(e.start_time);
      if (startDt <= deadlineDate) allocated += e.hours_allocated;
    }
    if (allocated + 0.05 < needed) {
      warnings.push({
        task_id: task.task_id,
        task_name: task.name,
        deadline_days: Math.round(days * 10) / 10,
        hours_needed: Math.round(needed * 10) / 10,
        hours_allocated_before_deadline: Math.round(allocated * 10) / 10,
        hours_missing: Math.round(Math.max(0, needed - allocated) * 10) / 10,
        deadline_date: deadlineDate.toISOString().slice(0, 10),
        reason: "Not enough scheduled hours before deadline",
      });
    }
  }
  return warnings;
}

// ---------- entry point ----------
interface RequestBody {
  tasks?: Record<string, unknown>[];
  current_grade?: number;
  passing_grade?: number;
  daily_study_hours?: number;
  start_date?: string;
  analysis_method?: string;
  available_sessions?: unknown;
  sessions?: unknown;
}

export async function POST(req: NextRequest) {
  try {
    const data = (await req.json()) as RequestBody;
    const incomingTasks = data.tasks ?? [];
    if (!incomingTasks.length) {
      return NextResponse.json({ error: "No tasks provided" }, { status: 400 });
    }

    const currentGrade = safeFloat(data.current_grade ?? 0, 0);
    const passingGrade = safeFloat(data.passing_grade ?? 75, 75);
    const dailyHours = safeFloat(data.daily_study_hours ?? 6, 6);
    const methodRaw = String(data.analysis_method ?? "topsis").toLowerCase();
    const analysisMethod = methodRaw === "weighted" ? "weighted" : "topsis";

    let start: Date;
    const parsedStart = data.start_date ? parseIsoDate(data.start_date) : null;
    start = parsedStart ?? (() => {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      return d;
    })();

    const canonical: CanonicalTask[] = incomingTasks.map((raw, i) =>
      buildCanonicalTask(raw, i + 1, currentGrade, passingGrade, dailyHours, start),
    );

    const analysisPayload = canonical.map(toAnalysisPayload);
    const analysisReport = analyzeBatch({ method: analysisMethod, tasks: analysisPayload });
    const reportTasks = "tasks" in analysisReport ? analysisReport.tasks : [];
    const merged = mergeAnalysisResults(canonical, { tasks: reportTasks });

    const scored = merged.map((task) => {
      const score = computeHybridScore(task, currentGrade, passingGrade);
      // The hybrid score sorts tasks for the schedule, but the TIER label is
      // taken straight from priority_analysis so the bucket shown here matches
      // the bucket shown on the task-value page for the same task.
      const analysisPriority = task.analysis?.priority;
      const tier: "HIGH" | "MEDIUM" | "LOW" =
        analysisPriority === "HIGH" ||
        analysisPriority === "MEDIUM" ||
        analysisPriority === "LOW"
          ? analysisPriority
          : tierLabel(score);
      return {
        ...task,
        _priority_score: score,
        _tier: tier,
        _priority_source: "analysis_aligned",
      } as CanonicalTask;
    });
    scored.sort((a, b) => (b._priority_score ?? 0) - (a._priority_score ?? 0));

    const rawSessions = data.available_sessions ?? data.sessions ?? null;
    const normalized = normalizeSessions(rawSessions);
    let sessionsAbs: AbsoluteSession[] | null = null;
    if (normalized?.absolute) sessionsAbs = normalized.absolute;
    else if (normalized?.templates) sessionsAbs = expandDailyTemplates(normalized.templates, start, scored);

    const schedule = buildSchedule(scored, dailyHours, start, sessionsAbs);
    const deadlineWarnings = buildDeadlineWarnings(scored, schedule, start);

    const ranked = scored.map((t, idx) => ({
      rank: idx + 1,
      task_id: t.task_id,
      name: t.name,
      sks: t.sks ?? 0,
      grade_weight: t.grade_weight ?? 0,
      deadline_days: t.deadline_days ?? 0,
      difficulty: t.difficulty ?? "medium",
      estimated_hours: t.estimated_hours ?? 0,
      completion_pct: t.completion_pct ?? 0,
      priority_score: t._priority_score ?? 0,
      tier: t._tier ?? "LOW",
      priority_source: t._priority_source ?? "effective_hybrid",
      action: rankAction(t._tier ?? "LOW", t),
      analysis: {
        task_name: t.analysis?.task_name ?? t.name,
        composite_score: t.analysis?.composite_score ?? null,
      },
    }));

    const totalHours = scored.reduce((s, t) => s + hoursNeeded(t), 0);
    let daysNeeded = 0;
    if (sessionsAbs && sessionsAbs.length) {
      const totalAvailable = sessionsAbs.reduce(
        (sum, s) => sum + (s.end_dt.getTime() - s.start_dt.getTime()) / (3600 * 1000),
        0,
      );
      const spanDays = Math.max(
        1,
        Math.round(
          (sessionsAbs[sessionsAbs.length - 1].end_dt.getTime() - sessionsAbs[0].start_dt.getTime())
          / (24 * 3600 * 1000),
        ) + 1,
      );
      const avgPerDay = totalAvailable / spanDays;
      daysNeeded = avgPerDay > 0 ? Math.ceil(totalHours / avgPerDay) : 0;
    } else {
      daysNeeded = dailyHours > 0 ? Math.ceil(totalHours / dailyHours) : 0;
    }

    const analysisSummaryMinimal = {
      method: analysisMethod,
      tasks: reportTasks.map((item) => ({
        task_id: item.task_id,
        task_name: item.task_name,
        priority: item.priority,
        composite_score: item.composite_score,
      })),
    };

    const result: Record<string, unknown> = {
      analysis: analysisSummaryMinimal,
      analysis_method: analysisMethod,
      ranked_tasks: ranked,
      schedule,
      deadline_warnings: deadlineWarnings,
      summary: {
        total_tasks: ranked.length,
        total_hours_needed: Math.round(totalHours * 10) / 10,
        days_needed: daysNeeded,
        daily_study_hours: dailyHours,
        high_priority: ranked.filter((t) => t.tier === "HIGH").length,
        medium_priority: ranked.filter((t) => t.tier === "MEDIUM").length,
        low_priority: ranked.filter((t) => t.tier === "LOW").length,
        deadline_warnings: deadlineWarnings.length,
      },
    };
    if (sessionsAbs && sessionsAbs.length) {
      result.available_sessions = sessionsAbs.map((s) => ({
        start_time: s.start_dt.toISOString(),
        end_time: s.end_dt.toISOString(),
      }));
    }

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function GET() {
  return NextResponse.json({
    message: "Use POST to generate ranked priorities and schedule.",
    endpoint: "/api/python/scheduling",
    method: "POST",
    example_body: {
      current_grade: 68,
      passing_grade: 75,
      daily_study_hours: 5,
      sessions: [
        { start_time: "09:00", end_time: "12:00" },
        { start_time: "18:00", end_time: "20:00" },
      ],
      tasks: [
        {
          task_id: "task_1",
          task_name: "Mathematics Midterm",
          task_type: "exam",
          sks: 3,
          grade_weight: 25,
          estimated_hours: 10,
          deadline_days: 3,
          difficulty: "hard",
          completion_pct: 10,
          effort: "high",
        },
      ],
    },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
