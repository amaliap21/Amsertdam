// TypeScript port of api/python/priority_analysis.py
// Keep the output shape identical to the Python module so the same client code
// works against either the Vercel Python function or this Next.js fallback.

export const WEIGHT_IMPACT = 0.22;
export const WEIGHT_SKS = 0.08;
export const WEIGHT_URGENCY = 0.30;
export const WEIGHT_GAP = 0.18;
export const WEIGHT_EFFICIENCY = 0.14;
export const WEIGHT_EFFORT = 0.08;

export const HIGH_THRESHOLD = 0.5;
export const MEDIUM_THRESHOLD = 0.3;

export const CRITERIA_KEYS = [
  "grade_impact",
  "sks_score",
  "urgency",
  "gap_factor",
  "efficiency",
  "effort_penalty",
] as const;
export const CRITERIA_WEIGHTS = [
  WEIGHT_IMPACT,
  WEIGHT_SKS,
  WEIGHT_URGENCY,
  WEIGHT_GAP,
  WEIGHT_EFFICIENCY,
  WEIGHT_EFFORT,
];
export const CRITERIA_BENEFIT = [true, true, true, true, true, false];

export const TYPE_MULTIPLIER: Record<string, number> = {
  exam: 1.30,
  project: 1.15,
  quiz: 1.15,
  homework: 0.95,
  generic: 1.00,
};

export interface TaskInput {
  task_id?: string | number;
  task_name?: string;
  task_type?: string;
  grade_weight?: number;
  sks?: number;
  credits?: number;
  estimated_hours?: number;
  deadline_days?: number;
  current_grade?: number;
  passing_grade?: number;
  weekly_capacity_hours?: number;
  confidence?: number;
  [key: string]: unknown;
}

export interface Breakdown {
  grade_impact: number;
  sks_score: number;
  urgency: number;
  gap_factor: number;
  efficiency: number;
  effort_penalty: number;
}

export interface TaskResult {
  task_id: string | number | undefined;
  task_name: string;
  task_type: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  action: string;
  color: "green" | "yellow" | "red" | "gray";
  color_reason: string;
  composite_score: number;
  confidence: number;
  efficiency_ratio: number;
  breakdown: Breakdown;
  details: TaskInput;
  topsis_score?: number;
  priority_basis?: string;
}

function normalize(value: number, min: number, max: number): number {
  if (max === min) return 0.5;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

function urgencyScore(days: number): number {
  if (days <= 0) return 1.0;
  return Math.exp(-0.15 * days);
}

function effortScore(
  estimatedHours: number,
  weeklyCapacity: number,
  deadlineDays: number,
  completionPct: number = 0,
): number {
  // Effort cost as a fraction of the time *available before the deadline*,
  // not as a fraction of a flat weekly budget. Also accounts for partial
  // completion: a 10h task at 80% done only has 2h left.
  if (weeklyCapacity <= 0) return 1.0;
  const completion = Math.max(0, Math.min(100, completionPct));
  const remaining = Math.max(0, estimatedHours * (1 - completion / 100));
  if (remaining <= 0) return 0;

  const dailyCapacity = weeklyCapacity / 7;
  const effectiveDays = Math.max(deadlineDays, 1);
  const available = Math.max(1, dailyCapacity * effectiveDays);
  const ratio = remaining / available;
  if (ratio >= 1) return 1;
  return Math.pow(ratio, 1.2);
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

export interface RawBreakdown extends Breakdown {
  impact: number;
  effort_raw: number;
  gap: number;
  composite: number;
}

export function computeBreakdown(data: TaskInput): RawBreakdown {
  const grade_weight = Number(data.grade_weight ?? 0);
  const sks = Number(data.sks ?? data.credits ?? 0);
  const estimated_hours = Number(data.estimated_hours ?? 1);
  const deadline_days = Number(data.deadline_days ?? 7);
  const current_grade = Number(data.current_grade ?? 0);
  const passing_grade = Number(data.passing_grade ?? 75);
  const weekly_capacity = Number(data.weekly_capacity_hours ?? 40);
  const completion_pct = Number((data as { completion_pct?: number }).completion_pct ?? 0);
  const task_type = String(data.task_type ?? "generic").toLowerCase();

  const multiplier = TYPE_MULTIPLIER[task_type] ?? 1.0;
  const impact = Math.min(1.0, (grade_weight / 100.0) * multiplier);

  const urgency = urgencyScore(deadline_days);
  const sks_score = normalize(sks, 0, 6);

  const gap = passing_grade - current_grade;
  const gap_factor = normalize(gap, -20, 40);

  const effort_raw = effortScore(
    estimated_hours,
    weekly_capacity,
    deadline_days,
    completion_pct,
  );
  const effort_penalty = effort_raw;

  // Time-efficiency = grade-weight earned per hour of remaining work.
  // Direct expression of "same grade in less time should win".
  const remainingHours = Math.max(
    1.0,
    estimated_hours * (1 - Math.max(0, Math.min(100, completion_pct)) / 100),
  );
  const efficiency_raw = grade_weight / remainingHours;
  const efficiency = normalize(efficiency_raw, 0, 25);

  const raw =
    WEIGHT_IMPACT * impact
    + WEIGHT_SKS * sks_score
    + WEIGHT_URGENCY * urgency
    + WEIGHT_GAP * gap_factor
    + WEIGHT_EFFICIENCY * efficiency
    - WEIGHT_EFFORT * effort_penalty;
  const composite = normalize(raw, -0.10, 0.92);

  return {
    grade_impact: impact,
    impact,
    sks_score,
    urgency,
    gap,
    gap_factor,
    efficiency,
    effort_raw,
    effort_penalty,
    composite,
  };
}

export function priorityFromScore(
  score: number,
): { priority: "HIGH" | "MEDIUM" | "LOW"; action: string; color: "green" | "yellow" | "red" } {
  if (score >= HIGH_THRESHOLD) return { priority: "HIGH", action: "Worth your energy, do it fully and on time", color: "green" };
  if (score >= MEDIUM_THRESHOLD) return { priority: "MEDIUM", action: "Helpful but flexible, time-box your effort", color: "yellow" };
  return { priority: "LOW", action: "Safe to minimize, protect your energy for higher-impact work", color: "red" };
}

/**
 * Explainable AI: a plain-language reason for the assigned colour, so the UI
 * can answer "why is this red?" instead of showing an opaque label.
 */
export function colorReason(
  color: "green" | "yellow" | "red" | "gray",
  breakdown: Pick<RawBreakdown, "impact" | "urgency" | "gap_factor" | "effort_penalty">,
): string {
  if (color === "gray") return "You're already passing this course, so this can wait.";
  const drivers: string[] = [];
  if (breakdown.urgency >= 0.6) drivers.push("the deadline is close");
  if (breakdown.impact >= 0.2) drivers.push("it's a big chunk of your grade");
  if (breakdown.gap_factor >= 0.6) drivers.push("you're below the passing threshold here");
  if (breakdown.effort_penalty >= 0.6) drivers.push("it's costly for the time you have left");
  if (color === "green") {
    return drivers.length
      ? `Flagged as high priority because ${drivers.join(" and ")}.`
      : "High priority, it scores well across deadline, grade impact, and effort.";
  }
  if (color === "yellow") {
    return "Moderate priority, it matters, but not enough to crowd out your top tasks.";
  }
  // red / low
  const lowReasons: string[] = [];
  if (breakdown.impact < 0.15) lowReasons.push("it's only a small share of your grade");
  if (breakdown.urgency < 0.4) lowReasons.push("the deadline is still far off");
  if (breakdown.effort_penalty >= 0.6) lowReasons.push("it would cost a lot of time for little return");
  return lowReasons.length
    ? `Safe to minimize because ${lowReasons.join(" and ")}.`
    : "Low impact on your grade, safe to do less and protect your wellbeing.";
}

function calculateConfidence(data: TaskInput): number {
  if (data.confidence != null) {
    const n = Number(data.confidence);
    return Number.isFinite(n) ? clamp01(n) : 0.5;
  }
  const estimated_hours = Number(data.estimated_hours ?? 1);
  const weekly_capacity = Number(data.weekly_capacity_hours ?? 40);
  const deadline_days = Number(data.deadline_days ?? 7);
  const effortRatio = Math.min(1.0, estimated_hours / Math.max(1.0, weekly_capacity));
  const deadlineFactor = deadline_days <= 3 ? 1.0 : deadline_days <= 14 ? 0.95 : 0.9;
  return clamp01(Math.max(0.2, 1.0 - 0.5 * effortRatio) * deadlineFactor);
}

export function analyzeEffortImpact(data: TaskInput): TaskResult {
  const breakdown = computeBreakdown(data);
  const confidence = calculateConfidence(data);

  let { priority, action, color } = priorityFromScore(breakdown.composite) as {
    priority: "HIGH" | "MEDIUM" | "LOW";
    action: string;
    color: "green" | "yellow" | "red" | "gray";
  };

  // Override: already passing
  const current_grade = Number(data.current_grade ?? 0);
  const passing_grade = Number(data.passing_grade ?? 75);
  if (current_grade >= passing_grade) {
    priority = "LOW";
    action = "Already passing, focus your energy elsewhere";
    color = "gray";
  }

  const grade_weight = Number(data.grade_weight ?? 0);
  const estimated_hours = Number(data.estimated_hours ?? 1);
  const efficiency = Math.round((grade_weight / Math.max(1, estimated_hours)) * 100) / 100;

  return {
    task_id: data.task_id as string | number | undefined,
    task_name: String(data.task_name ?? "Task"),
    task_type: String(data.task_type ?? "generic").toLowerCase(),
    priority,
    action,
    color,
    color_reason: colorReason(color, breakdown),
    composite_score: Math.round(breakdown.composite * 1000) / 1000,
    confidence: Math.round(confidence * 100) / 100,
    efficiency_ratio: efficiency,
    breakdown: {
      grade_impact: Math.round(breakdown.impact * 1000) / 1000,
      sks_score: Math.round(breakdown.sks_score * 1000) / 1000,
      urgency: Math.round(breakdown.urgency * 1000) / 1000,
      gap_factor: Math.round(breakdown.gap_factor * 1000) / 1000,
      efficiency: Math.round(breakdown.efficiency * 1000) / 1000,
      effort_penalty: Math.round(breakdown.effort_penalty * 1000) / 1000,
    },
    details: data,
  };
}

export function rankTasksWithTopsis(
  results: TaskResult[],
  tasks: TaskInput[],
): TaskResult[] {
  const rows = results.length;
  const cols = CRITERIA_KEYS.length;
  if (rows === 0) return results;

  const matrix: number[][] = results.map((r) =>
    CRITERIA_KEYS.map((key) => Number((r.breakdown as unknown as Record<string, number>)[key] ?? 0)),
  );

  const denom: number[] = Array(cols).fill(0);
  for (let j = 0; j < cols; j++) {
    let sq = 0;
    for (let i = 0; i < rows; i++) sq += matrix[i][j] ** 2;
    denom[j] = Math.sqrt(sq) || 1.0;
  }

  const weighted: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      weighted[i][j] = (matrix[i][j] / denom[j]) * CRITERIA_WEIGHTS[j];
    }
  }

  const idealPos: number[] = Array(cols).fill(0);
  const idealNeg: number[] = Array(cols).fill(0);
  for (let j = 0; j < cols; j++) {
    const col = weighted.map((row) => row[j]);
    if (CRITERIA_BENEFIT[j]) {
      idealPos[j] = Math.max(...col);
      idealNeg[j] = Math.min(...col);
    } else {
      idealPos[j] = Math.min(...col);
      idealNeg[j] = Math.max(...col);
    }
  }

  const closeness: number[] = Array(rows).fill(0);
  for (let i = 0; i < rows; i++) {
    let dp = 0;
    let dn = 0;
    for (let j = 0; j < cols; j++) {
      dp += (weighted[i][j] - idealPos[j]) ** 2;
      dn += (weighted[i][j] - idealNeg[j]) ** 2;
    }
    dp = Math.sqrt(dp);
    dn = Math.sqrt(dn);
    closeness[i] = dn / ((dp + dn) || 1.0);
  }

  results.forEach((result, i) => {
    const topsis = Math.round(closeness[i] * 10000) / 10000;
    result.topsis_score = topsis;
    result.priority_basis = "topsis";
    const decision = priorityFromScore(topsis);
    result.priority = decision.priority;
    result.action = decision.action;
    result.color = decision.color;
    result.color_reason = colorReason(decision.color, {
      impact: result.breakdown.grade_impact,
      urgency: result.breakdown.urgency,
      gap_factor: result.breakdown.gap_factor,
      effort_penalty: result.breakdown.effort_penalty,
    });

    if (i < tasks.length) {
      const current = Number(tasks[i].current_grade ?? 0);
      const passing = Number(tasks[i].passing_grade ?? 75);
      if (current >= passing) {
        result.priority = "LOW";
        result.action = "Already passing, focus your energy elsewhere";
        result.color = "gray";
        result.color_reason = colorReason("gray", {
          impact: result.breakdown.grade_impact,
          urgency: result.breakdown.urgency,
          gap_factor: result.breakdown.gap_factor,
          effort_penalty: result.breakdown.effort_penalty,
        });
        result.topsis_score = 0.0;
        result.composite_score = 0.0;
      }
    }
  });

  results.sort((a, b) => (b.topsis_score ?? 0) - (a.topsis_score ?? 0));
  return results;
}

export interface BatchInput {
  tasks: TaskInput[];
  method?: string;
}

export interface BatchResult {
  method: "weighted" | "topsis";
  tasks: TaskResult[];
  summary: { high: number; medium: number; low: number };
}

export function buildSummary(results: TaskResult[]) {
  return {
    high: results.filter((r) => r.priority === "HIGH").length,
    medium: results.filter((r) => r.priority === "MEDIUM").length,
    low: results.filter((r) => r.priority === "LOW").length,
  };
}

export function analyzeBatch(data: BatchInput): BatchResult | { error: string } {
  const tasks = data.tasks ?? [];
  if (!tasks.length) return { error: "No tasks provided" };

  const method = String(data.method ?? "weighted").toLowerCase() as "weighted" | "topsis";
  const results = tasks.map((t) => analyzeEffortImpact(t));

  if (method === "topsis") {
    rankTasksWithTopsis(results, tasks);
    return { method: "topsis", tasks: results, summary: buildSummary(results) };
  }

  results.sort((a, b) => b.composite_score - a.composite_score);
  return { method: "weighted", tasks: results, summary: buildSummary(results) };
}
