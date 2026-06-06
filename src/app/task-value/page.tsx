"use client";

import {
  CircleAlert,
  CircleHelp,
  CircleCheck,
  Calendar,
  Clock,
  CirclePlus,
  Sparkles,
  Loader2,
  PencilLine,
} from "lucide-react";
import { useState, useEffect } from "react";
import { Trash2 } from "lucide-react";
import Image from "next/image";
import AddTaskModal, { type TaskFormInitial } from "@/components/ui/task-form";
import toast from "react-hot-toast";
import { useStore, type TaskPriority, type TaskItem } from "@/store/use-store";
import ColorLegend from "@/components/ui/color-legend";
import {
  parseTaskDate,
  formatTaskDate,
  extractAssessmentName,
  extractItemName,
} from "@/lib/task-date";

type PriorityCard = {
  priority: TaskPriority;
  icon: React.ReactNode;
  gradient: string;
  textColor: string;
  taskCount: number;
  description: string;
  image: string;
  iconColor: string;
};

export default function TaskValue() {
  const [showAddTaskModal, setShowAddTaskModal] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskItem | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const tasks = useStore((s) => s.tasks);
  const setTasks = useStore((s) => s.setTasks);
  const addTask = useStore((s) => s.addTask);
  const removeTask = useStore((s) => s.removeTask);
  // Real inputs for the priority analysis (instead of hardcoded constants):
  // course grades/weights come from the saved courses, and study capacity
  // comes from the user's Active Hours setting.
  const coursesCache = useStore((s) => s.coursesCache);
  const activeHours = useStore((s) => s.activeHours);

  // Build the datetime-local string ("YYYY-MM-DDTHH:MM") from a task's stored
  // display date ("May 17, 11:22 PM") using the shared parser.
  const buildInitialFromTask = (task: TaskItem): TaskFormInitial => {
    const parsed = parseTaskDate(task.date);
    let deadline = "";
    if (parsed.isoDate && parsed.clock) {
      const hh = String(parsed.clock.h).padStart(2, "0");
      const mm = String(parsed.clock.m).padStart(2, "0");
      deadline = `${parsed.isoDate}T${hh}:${mm}`;
    }
    const hours = parseFloat(task.timeEstimate);
    return {
      taskName: task.title,
      course: task.course,
      assessment: extractAssessmentName(task.description) ?? "",
      item: extractItemName(task.description) ?? "",
      deadline,
      estimatedHours: Number.isFinite(hours) ? String(hours) : "",
    };
  };

  const handleEditSubmit = async (data: {
    taskName: string;
    description: string;
    deadline: string;
    estimatedHours?: number | null;
    course: string;
  }) => {
    if (!editingTask) return;
    // Persist the real ISO timestamp so the year is never lost. Display
    // formatting happens at render time via formatTaskDate().
    const newDate = data.deadline
      ? new Date(data.deadline).toISOString()
      : "Not set";
    const newTimeEstimate = data.estimatedHours
      ? `${data.estimatedHours}h`
      : "Not set";
    // Preserve any AI-advice trailing line that was previously appended below
    // the assessment metadata so we don't overwrite useful prioritization context.
    const previousAdvice = (editingTask.description ?? "")
      .split("\n")
      .slice(1)
      .join("\n")
      .trim();
    const description = previousAdvice
      ? `${data.description}\n${previousAdvice}`
      : data.description;

    const updated: TaskItem = {
      ...editingTask,
      title: data.taskName,
      course: data.course || "General",
      date: newDate,
      timeEstimate: newTimeEstimate,
      description,
    };

    setTasks(tasks.map((t) => (t.id === editingTask.id ? updated : t)));
    setEditingTask(null);
    toast.success("Task updated");

    try {
      await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: updated.id,
          title: updated.title,
          course: updated.course,
          date: updated.date,
          estimatedHours: data.estimatedHours ?? null,
          description: updated.description,
        }),
      });
    } catch {
      toast.error("Couldn't save to server, change kept locally");
    }
  };

  const handleAddTask = async (task: {
    taskName: string;
    description: string;
    deadline: string;
    estimatedHours?: number | null;
    course: string;
  }) => {
    await addTask({
      title: task.taskName,
      course: task.course || "General",
      // Store the real ISO timestamp; the year would otherwise be stripped
      // by the short en-US format and have to be guessed at parse time.
      date: task.deadline ? new Date(task.deadline).toISOString() : "Not set",
      timeEstimate: task.estimatedHours ? `${task.estimatedHours}h` : "Not set",
      priority: "If You Have Energy",
      description: task.description,
      effort: "medium effort",
    });
    toast.success("Task added");
  };

  const handleAiPrioritize = async () => {
    if (aiLoading) return;
    // With a single task, TOPSIS has nothing to rank it against and the
    // Python service always returns "LOW" (the safest default for a
    // singleton). That makes the UI feel broken — the user sees their
    // only task labelled "Safe to Minimize" even when it's clearly the
    // one thing they're working on. Promote it to Focus First by default.
    if (tasks.length === 1) {
      const only = tasks[0];
      const original = only.description ?? "";
      const metaMatch = original.match(/^(Assessment:[^\n]*)/i);
      const meta = metaMatch ? metaMatch[1] : "";
      const advice =
        "Only task on your plate, treat it as your top priority and finish on time.";
      const newDescription = meta ? `${meta}\n${advice}` : advice;
      setTasks([
        { ...only, priority: "Focus First", description: newDescription },
      ]);
      try {
        await fetch("/api/tasks", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            id: only.id,
            priority: "Focus First",
            description: newDescription,
          }),
        });
      } catch {
        /* persistence is best-effort; UI already updated */
      }
      setAiSummary("1 task, defaulted to Focus First.");
      toast.success("Task prioritized");
      return;
    }
    setAiLoading(true);
    const t = toast.loading("Analyzing your tasks…");
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const parseDeadlineDays = (dateStr: string): number => {
        // The stored display string ("May 28, 10:22 PM") has no year, and
        // V8 defaults to 2001 when parsing such strings. Use the shared
        // parser which injects the current year so the diff is correct.
        const { isoDate } = parseTaskDate(dateStr);
        if (!isoDate) return 7;
        const candidate = new Date(`${isoDate}T00:00:00`);
        if (Number.isNaN(candidate.getTime())) return 7;
        const diff = Math.round(
          (candidate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
        );
        return Math.max(0, diff);
      };

      const inferTaskType = (title: string, course: string): string => {
        const blob = `${title} ${course}`.toLowerCase();
        if (/exam|midterm|final/.test(blob)) return "exam";
        if (blob.includes("quiz")) return "quiz";
        if (blob.includes("project")) return "project";
        if (/homework|assignment/.test(blob)) return "homework";
        return "generic";
      };

      // Build a per-course lookup from the saved courses so each task's
      // grade_weight / current_grade / passing_grade reflect REAL data
      // instead of fixed constants.
      type RawAssessment = { name?: string; weight?: number; score?: number };
      type CachedCourse = {
        title?: string;
        course_payload?: {
          threshold?: number | null;
          credits?: number | null;
          assessments?: RawAssessment[];
        };
        threshold?: number | null;
        credits?: number | null;
        assessments?: RawAssessment[];
      };
      const normName = (s: string) => s.trim().toLowerCase();

      type CourseInfo = {
        passingGrade: number;
        currentGrade: number | null;
        credits: number;
        assessments: RawAssessment[];
      };
      const courseByName = new Map<string, CourseInfo>();
      const courseList = Array.isArray(coursesCache)
        ? (coursesCache as CachedCourse[])
        : [];
      for (const co of courseList) {
        const payload = co.course_payload ?? {};
        const assessments = Array.isArray(payload.assessments)
          ? payload.assessments
          : Array.isArray(co.assessments)
            ? co.assessments
            : [];
        const thresholdRaw =
          payload.threshold != null ? payload.threshold : co.threshold;
        const passingGrade = Number(thresholdRaw);
        const creditsRaw =
          payload.credits != null ? payload.credits : co.credits;
        const credits = Number(creditsRaw);
        // Current grade = weighted average over assessments that already have
        // a score. Null when nothing is graded yet (we fall back to passing
        // grade so an ungraded course contributes no artificial grade gap).
        let scoredWeight = 0;
        let weightedScore = 0;
        for (const a of assessments) {
          const w = Number(a.weight);
          const s = a.score;
          if (Number.isFinite(w) && w > 0 && s != null && Number.isFinite(Number(s))) {
            scoredWeight += w;
            weightedScore += Number(s) * w;
          }
        }
        const currentGrade =
          scoredWeight > 0 ? weightedScore / 100 : null;
        if (co.title) {
          courseByName.set(normName(co.title), {
            passingGrade: Number.isFinite(passingGrade) ? passingGrade : 75,
            currentGrade,
            credits: Number.isFinite(credits) ? credits : 0,
            assessments,
          });
        }
      }

      // Resolve the grade weight for a specific task from its course's
      // assessment list (the task's assessment name lives in its description).
      const gradeWeightForTask = (task: TaskItem, info?: CourseInfo): number => {
        if (!info || !info.assessments.length) return 15;
        const assessmentName = extractAssessmentName(task.description);
        if (assessmentName) {
          const match = info.assessments.find(
            (a) => a.name && normName(a.name) === normName(assessmentName),
          );
          if (match && Number.isFinite(Number(match.weight))) {
            return Number(match.weight);
          }
        }
        // No specific match — use the average assessment weight as a proxy.
        const weights = info.assessments
          .map((a) => Number(a.weight))
          .filter((w) => Number.isFinite(w) && w > 0);
        if (weights.length) {
          return weights.reduce((sum, w) => sum + w, 0) / weights.length;
        }
        return 15;
      };

      // Weekly study capacity from the user's Active Hours window (daily
      // available hours minus break, × 7). Falls back to 30 if unset.
      const toMin = (t?: string | null): number | null => {
        if (!t || typeof t !== "string" || !t.includes(":")) return null;
        const [h, m] = t.split(":").map(Number);
        if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
        return h * 60 + m;
      };
      const dailyMinutes = (() => {
        const start = toMin(activeHours?.start);
        const end = toMin(activeHours?.end);
        if (start == null || end == null || end <= start) return null;
        let mins = end - start;
        const bStart = toMin(activeHours?.breakStart);
        const bEnd = toMin(activeHours?.breakEnd);
        if (bStart != null && bEnd != null && bEnd > bStart) {
          mins -= bEnd - bStart;
        }
        return Math.max(0, mins);
      })();
      const weeklyCapacityHours =
        dailyMinutes != null && dailyMinutes > 0
          ? Math.round((dailyMinutes / 60) * 7)
          : 30;

      const resp = await fetch("/api/python/priority_analysis", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          method: "topsis",
          tasks: tasks.map((task) => {
            const info = courseByName.get(normName(task.course));
            const passingGrade = info?.passingGrade ?? 75;
            // Ungraded course → use passing grade so the grade gap is neutral.
            const currentGrade = info?.currentGrade ?? passingGrade;
            return {
              task_id: task.id,
              task_name: task.title,
              task_type: inferTaskType(task.title, task.course),
              // SKS (course credits) — read by the Python's SKS-load
              // criterion. Matches the `sks` field in priority_analysis.py's
              // expected task JSON.
              sks: info?.credits ?? 0,
              grade_weight: gradeWeightForTask(task, info),
              estimated_hours: parseFloat(task.timeEstimate) || 2,
              deadline_days: parseDeadlineDays(task.date),
              current_grade: currentGrade,
              passing_grade: passingGrade,
              weekly_capacity_hours: weeklyCapacityHours,
            };
          }),
        }),
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.error || `Failed (${resp.status})`);
      }
      const json = (await resp.json()) as {
        method: string;
        tasks: {
          task_id?: string;
          task_name: string;
          priority: "HIGH" | "MEDIUM" | "LOW";
          action: string;
          composite_score: number;
          topsis_score?: number;
          breakdown: {
            grade_impact: number;
            urgency: number;
            gap_factor: number;
            effort_penalty: number;
          };
        }[];
        summary: { high: number; medium: number; low: number };
      };

      const bucketFor = (priority: "HIGH" | "MEDIUM" | "LOW"): TaskPriority => {
        if (priority === "HIGH") return "Focus First";
        if (priority === "MEDIUM") return "If You Have Energy";
        return "Safe to Minimize";
      };
      const effortFor = (penalty: number): string => {
        if (penalty >= 0.6) return "high effort";
        if (penalty >= 0.3) return "medium effort";
        return "low effort";
      };

      const updated = tasks.map((task) => {
        const ai = json.tasks.find(
          (p) => p.task_id === task.id || p.task_name === task.title,
        );
        if (!ai) return task;
        // Preserve the original "Assessment: X • Item: Y" line so the bracket
        // label keeps working after prioritization. Append the AI advice below.
        const original = task.description ?? "";
        const metaMatch = original.match(/^(Assessment:[^\n]*)/i);
        const meta = metaMatch ? metaMatch[1] : "";
        const newDescription = meta ? `${meta}\n${ai.action}` : ai.action;
        return {
          ...task,
          priority: bucketFor(ai.priority),
          description: newDescription,
          effort: effortFor(ai.breakdown.effort_penalty),
        };
      });
      setTasks(updated);

      // Persist the new priorities so they survive a refresh.
      await Promise.all(
        updated.map((task, idx) => {
          if (task === tasks[idx]) return Promise.resolve();
          return fetch("/api/tasks", {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              id: task.id,
              priority: task.priority,
              description: task.description,
              effort: task.effort,
            }),
          }).catch(() => undefined);
        }),
      );
      setAiSummary(
        `Analyzed ${json.tasks.length} tasks via ${json.method.toUpperCase()}, ` +
          `${json.summary.high} high, ${json.summary.medium} medium, ${json.summary.low} low priority.`,
      );
      toast.success("Tasks reprioritized", { id: t });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed", { id: t });
    } finally {
      setAiLoading(false);
    }
  };

  const priorityCards: PriorityCard[] = [
    {
      priority: "Focus First",
      icon: <CircleAlert size={20} />,
      gradient:
        "linear-gradient(288deg, rgba(229, 61, 61, 0.20) 34.38%, rgba(245, 150, 56, 0.20) 95.91%)",
      textColor: "#E53D3D",
      iconColor: "#E53D3D",
      taskCount: 1,
      description: "High impact, worth your effort.",
      image: "/red-task.svg",
    },
    {
      priority: "If You Have Energy",
      icon: <CircleHelp size={20} />,
      gradient:
        "linear-gradient(288deg, rgba(223, 229, 61, 0.20) 34.38%, rgba(223, 245, 56, 0.20) 95.91%)",
      textColor: "#E5B03D",
      iconColor: "#E5B03D",
      taskCount: 1,
      description: "Helpful but this task is not critical.",
      image: "/yellow-task.svg",
    },
    {
      priority: "Safe to Minimize",
      icon: <CircleCheck size={20} />,
      gradient:
        "linear-gradient(288deg, var(--Green, rgba(132, 224, 163, 0.20)) 34.38%, var(--Teal, rgba(110, 175, 187, 0.20)) 95.91%)",
      textColor: "#73C58F",
      iconColor: "#73C58F",
      taskCount: 1,
      description: "Low impact, safe to do less.",
      image: "/green-task.svg",
    },
  ];

  const getTasksByPriority = (priority: TaskPriority) => {
    return tasks.filter((task) => task.priority === priority);
  };

  const getPriorityBadgeStyles = (priority: TaskPriority) => {
    switch (priority) {
      case "Focus First":
        return "bg-red-50 text-[#E53D3D] border-red-200";
      case "If You Have Energy":
        return "bg-yellow-50 text-[#E5B03D] border-yellow-200";
      case "Safe to Minimize":
        return "bg-green-50 text-[#73C58F] border-green-200";
      default:
        return "";
    }
  };

  const getBackgroundColor = (priority: TaskPriority) => {
    switch (priority) {
      case "Focus First":
        return "bg-red-50";
      case "If You Have Energy":
        return "bg-yellow-50";
      case "Safe to Minimize":
        return "bg-green-50";
      default:
        return "bg-gray-50";
    }
  };

  return (
    <div className="min-h-dvh bg-white px-4 sm:px-6 md:px-10 lg:px-14.75 py-6 md:py-11.5">
      {/* Header */}
      <div className="mb-8 flex flex-col lg:items-center gap-4 lg:flex-row lg:justify-between">
        <div>
          <h1 className="text-[28px] font-semibold text-black-primary mb-2">
            Task Value
          </h1>
          <p className="text-gray-primary">
            Helping you allocate effort sustainably while protecting your
            wellbeing
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center self-auto">
          <button
            onClick={handleAiPrioritize}
            disabled={aiLoading || tasks.length === 0}
            className="flex items-center justify-center gap-2 rounded-lg border border-indigo-primary px-4 py-2.5 text-indigo-primary transition-colors hover:bg-indigo-primary/5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {aiLoading ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <Sparkles size={18} />
            )}
            Ask AI to Prioritize
          </button>
          <button
            data-tour="add-task"
            onClick={() => setShowAddTaskModal(true)}
            className="flex items-center justify-center gap-2 rounded-lg bg-indigo-primary px-4 py-2.5 text-white transition-colors hover:bg-indigo-600"
          >
            <CirclePlus size={18} />
            Add Task
          </button>
        </div>
      </div>

      {aiSummary && (
        <div className="mb-8 rounded-xl border border-indigo-100 bg-indigo-50 p-4">
          <p className="mb-1 text-sm font-medium text-indigo-primary">
            AI summary
          </p>
          <p className="text-sm text-gray-700">{aiSummary}</p>
        </div>
      )}

      {/* What to Work on First Section */}
      <div className="mb-8 bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="text-[20px] font-semibold text-black-primary mb-5">
          What to Work on First?
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {priorityCards.map((card) => (
            <div
              key={card.priority}
              className="flex w-full min-w-0 flex-col gap-3 rounded-2xl px-4 py-4"
              style={{
                background: card.gradient,
              }}
            >
              {/* Header: title left, status icon right */}
              <div className="flex flex-row justify-between items-center">
                <h1 className="text-sm font-semibold text-black-primary">
                  {card.priority}
                </h1>
                <div style={{ color: card.iconColor }}>{card.icon}</div>
              </div>

              {/* Body: illustration on the left, metric + description on the right */}
              <div className="flex flex-row items-center gap-3">
                <Image
                  src={card.image}
                  alt={`${card.priority} Tasks`}
                  width={88}
                  height={73}
                  className="shrink-0"
                  style={{ width: "88px", height: "auto" }}
                />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <p className="text-sm leading-tight text-black-primary">
                    <span
                      className="text-2xl font-semibold leading-none"
                      style={{ color: card.textColor }}
                    >
                      {getTasksByPriority(card.priority).length}
                    </span>{" "}
                    task
                  </p>
                  {/* Locked to two lines so all three cards line up. */}
                  <p className="text-xs leading-snug text-gray-primary break-words line-clamp-2 min-h-[2rem]">
                    {card.description}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Explainable colors — make the red/yellow/green system self-evident */}
      <ColorLegend variant="priority" className="mb-8" />

      {/* Info Message */}
      <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-4 mb-8">
        <p className="text-sm text-gray-700">
          <span className="font-medium">It&apos;s okay to let go.</span> One
          task can be minimized without affecting your ability to pass.
          Protecting your energy is a valid choice.
        </p>
      </div>

      {/* Focus First Section */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-3">
          <CircleAlert size={18} className="text-[#E53D3D]" />
          <h2 className="text-lg font-semibold text-black-primary">
            Focus First
          </h2>
        </div>
        <p className="text-sm text-gray-primary mb-4">
          These are worth your energy. Completing them helps you feel more
          secure and in control.
        </p>
        <div className="space-y-3">
          {getTasksByPriority("Focus First").map((task) => (
            <div
              key={task.id}
              className="bg-white border border-gray-200 rounded-xl p-5"
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <h3 className="text-base font-semibold text-black-primary mb-1">
                    {task.title}
                  </h3>
                  <p className="text-sm text-gray-primary mb-2">
                    {task.course}
                  </p>
                  <div className="flex items-center gap-1.5 text-sm text-gray-600">
                    <Calendar size={14} />
                    <span>{formatTaskDate(task.date)}</span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-medium border ${getPriorityBadgeStyles(
                      task.priority,
                    )}`}
                  >
                    {task.priority}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Clock size={16} />
                    <span className="text-base font-semibold text-black-primary">
                      {task.timeEstimate}
                    </span>
                  </div>
                  <span className="text-sm text-gray-500">{task.effort}</span>
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      title="Edit task"
                      onClick={() => setEditingTask(task)}
                      className="text-indigo-primary hover:text-indigo-600"
                    >
                      <PencilLine size={16} />
                    </button>
                    <button
                      title="Delete task"
                      onClick={async () => {
                        if (!confirm("Delete this task?")) return;
                        await removeTask(task.id);
                      }}
                      className="text-red-500 hover:text-red-600"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
              <div className="mt-3">
                <div
                  className={`${getBackgroundColor(task.priority)} rounded-lg p-3`}
                >
                  <p className="text-sm text-gray-700">{task.description}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* If You Have Energy Section */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-3">
          <CircleHelp size={18} className="text-[#E5B03D]" />
          <h2 className="text-lg font-semibold text-black-primary">
            If You Have Energy
          </h2>
        </div>
        <p className="text-sm text-gray-primary mb-4">
          These tasks matter, but you have flexibility. It&apos;s okay to scale
          back if you&apos;re tired.
        </p>
        <div className="space-y-3">
          {getTasksByPriority("If You Have Energy").map((task) => (
            <div
              key={task.id}
              className="bg-white border border-gray-200 rounded-xl p-5"
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <h3 className="text-base font-semibold text-black-primary mb-1">
                    {task.title}
                  </h3>
                  <p className="text-sm text-gray-primary mb-2">
                    {task.course}
                  </p>
                  <div className="flex items-center gap-1.5 text-sm text-gray-600">
                    <Calendar size={14} />
                    <span>{formatTaskDate(task.date)}</span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-medium border ${getPriorityBadgeStyles(
                      task.priority,
                    )}`}
                  >
                    {task.priority}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Clock size={16} />
                    <span className="text-base font-semibold text-black-primary">
                      {task.timeEstimate}
                    </span>
                  </div>
                  <span className="text-sm text-gray-500">{task.effort}</span>
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      title="Edit task"
                      onClick={() => setEditingTask(task)}
                      className="text-indigo-primary hover:text-indigo-600"
                    >
                      <PencilLine size={16} />
                    </button>
                    <button
                      title="Delete task"
                      onClick={async () => {
                        if (!confirm("Delete this task?")) return;
                        await removeTask(task.id);
                      }}
                      className="text-red-500 hover:text-red-600"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
              <div className="mt-3">
                <div
                  className={`${getBackgroundColor(task.priority)} rounded-lg p-3`}
                >
                  <p className="text-sm text-gray-700">{task.description}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Safe to Minimize Section */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-3">
          <CircleCheck size={18} className="text-[#73C58F]" />
          <h2 className="text-lg font-semibold text-black-primary">
            Safe to Minimize
          </h2>
        </div>
        <p className="text-sm text-gray-primary mb-4">
          These tasks have low impact on your grade. Protecting your wellbeing
          here is a reasonable choice.
        </p>
        <div className="space-y-3">
          {getTasksByPriority("Safe to Minimize").map((task) => (
            <div
              key={task.id}
              className="bg-white border border-gray-200 rounded-xl p-5"
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <h3 className="text-base font-semibold text-black-primary mb-1">
                    {task.title}
                  </h3>
                  <p className="text-sm text-gray-primary mb-2">
                    {task.course}
                  </p>
                  <div className="flex items-center gap-1.5 text-sm text-gray-600">
                    <Calendar size={14} />
                    <span>{formatTaskDate(task.date)}</span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-medium border ${getPriorityBadgeStyles(
                      task.priority,
                    )}`}
                  >
                    {task.priority}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Clock size={16} />
                    <span className="text-base font-semibold text-black-primary">
                      {task.timeEstimate}
                    </span>
                  </div>
                  <span className="text-sm text-gray-500">{task.effort}</span>
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      title="Edit task"
                      onClick={() => setEditingTask(task)}
                      className="text-indigo-primary hover:text-indigo-600"
                    >
                      <PencilLine size={16} />
                    </button>
                    <button
                      title="Delete task"
                      onClick={async () => {
                        if (!confirm("Delete this task?")) return;
                        await removeTask(task.id);
                      }}
                      className="text-red-500 hover:text-red-600"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
              <div className="mt-3">
                <div
                  className={`${getBackgroundColor(task.priority)} rounded-lg p-3`}
                >
                  <p className="text-sm text-gray-700">{task.description}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Add Task Modal, only mounted while open, so its useState
          initializers run with fresh `initialTask` each time. */}
      {showAddTaskModal && (
        <AddTaskModal
          isOpen={showAddTaskModal}
          onClose={() => setShowAddTaskModal(false)}
          onSubmit={handleAddTask}
        />
      )}
      {/* Edit Task Modal, keyed by the task id so picking a different task
          remounts the form with the new pre-filled values. */}
      {editingTask && (
        <AddTaskModal
          key={editingTask.id}
          isOpen
          onClose={() => setEditingTask(null)}
          onSubmit={handleEditSubmit}
          initialTask={buildInitialFromTask(editingTask)}
        />
      )}
      <InitWrapper />
    </div>
  );
}

function InitWrapper() {
  const fetchInitial = useStore((s) => s.fetchInitial);
  useEffect(() => {
    fetchInitial().catch(() => {});
  }, [fetchInitial]);
  return null;
}
