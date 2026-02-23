"use client";
import { CirclePlus, PencilLine, Check } from "lucide-react";
import { useState } from "react";
import CourseForm from "@/components/ui/course-form";
import AssessmentForm from "@/components/ui/assessment-form";
import ItemForm from "@/components/ui/item-form";

type SubItem = {
  name: string;
  weight: number;
  score?: number;
  date?: string;
  isEditing?: boolean;
};

type Assessment = {
  name: string;
  weight: number;
  score?: number;
  date?: string;
  isEditing?: boolean;
  items?: SubItem[];
};

type ThresholdResult = {
  current_grade: number;
  passing_grade: number;
  gap: number;
  requirements: { name: string; weight: number; min_score: number; is_feasible: boolean }[];
  status: string;
  safety_margin: number;
  is_feasible: boolean;
  message: string;
};

type Courses = {
  courseName: string;
  credits: number;
  fromTime: number;
  toTime: number;
  typeTracking: string;
  threshold: number;
  passingGrade?: number;
  assessments?: Assessment[];
  passingRequirement?: string;
  requirements?: {
    name: string;
    score: number;
  }[];
  thresholdResult?: ThresholdResult;
  isCalculating?: boolean;
};

// Flatten sub-items into a single effective score for an assessment
function effectiveScore(a: Assessment): number | undefined {
  if (a.items && a.items.length > 0) {
    const totalWeight = a.items.reduce((s, i) => s + i.weight, 0);
    const allGraded = a.items.every((i) => i.score !== undefined);
    if (!allGraded || totalWeight === 0) return undefined;
    return a.items.reduce((s, i) => s + i.weight * (i.score ?? 0), 0) / totalWeight;
  }
  return a.score;
}

async function callGraduationAPI(
  assessments: Assessment[],
  passingGrade: number,
): Promise<ThresholdResult | null> {
  const payload = {
    passing_grade: passingGrade,
    assessments: assessments.map((a) => {
      const score = effectiveScore(a);
      return score !== undefined
        ? { name: a.name, weight: a.weight, score }
        : { name: a.name, weight: a.weight };
    }),
  };

  const totalWeight = assessments.reduce((s, a) => s + a.weight, 0);
  if (Math.abs(totalWeight - 100) > 0.5) return null; // weights must sum to 100

  const res = await fetch("/api/python/graduation_threshold", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (data.error) return null;
  return data as ThresholdResult;
}

export default function PassingTarget() {
  const [expandedCourses, setExpandedCourses] = useState<number[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [addingAssessmentToCourse, setAddingAssessmentToCourse] = useState<number | null>(null);
  const [addingItemTo, setAddingItemTo] = useState<{ courseIndex: number; assessIdx: number } | null>(null);
  const [courseItems, setCourseItems] = useState<Courses[]>([
    {
      courseName: "Introduction to Computer Science",
      credits: 4,
      fromTime: 10,
      toTime: 11,
      typeTracking: "On Track",
      threshold: 76.3,
      passingRequirement:
        "To pass this course, you need at least 85.9 on Project, 62.3 on Midterm Exam, and 80.7 on Final Exam",
      assessments: [
        {
          name: "Project",
          weight: 30,
          items: [
            {
              name: "Tucil 1",
              weight: 15,
              score: 80,
              date: "February, 15th 2025",
            },
            {
              name: "Tucil 2",
              weight: 15,
              score: 70,
              date: "March, 20th 2025",
            },
          ],
        },
        {
          name: "Midterm Exam",
          weight: 35,
          score: 75,
          date: "March, 10th 2025",
        },
        { name: "Final Exam", weight: 35, date: "May. 25th 2025" },
      ],
      requirements: [
        { name: "Project", score: 85.9 },
        { name: "Midterm Exam", score: 62.3 },
        { name: "Final Exam", score: 80.7 },
      ],
    },
    {
      courseName: "Data Structures and Algorithms",
      credits: 3,
      fromTime: 8,
      toTime: 10,
      typeTracking: "On Track",
      threshold: 75.5,
      passingRequirement: "To pass this course, you need at least 75.5 overall",
      assessments: [
        { name: "Assignments", weight: 20, score: 85 },
        { name: "Midterm", weight: 30, score: 72 },
        { name: "Final Exam", weight: 50 },
      ],
      requirements: [
        { name: "Assignments", score: 75.5 },
        { name: "Midterm", score: 75.5 },
        { name: "Final Exam", score: 75.5 },
      ],
    },
    {
      courseName: "Database Management Systems",
      credits: 3,
      fromTime: 9,
      toTime: 11,
      typeTracking: "Worth Reviewing",
      threshold: 78.0,
      passingRequirement: "To pass this course, you need at least 78.0 overall",
      assessments: [
        { name: "Labs", weight: 25, score: 80 },
        { name: "Midterm", weight: 35, score: 68 },
        { name: "Final Project", weight: 40 },
      ],
      requirements: [
        { name: "Labs", score: 78.0 },
        { name: "Midterm", score: 78.0 },
        { name: "Final Project", score: 78.0 },
      ],
    },
    {
      courseName: "Operating Systems",
      credits: 4,
      fromTime: 11,
      toTime: 13,
      typeTracking: "On Track",
      threshold: 82.3,
      passingRequirement: "To pass this course, you need at least 82.3 overall",
      assessments: [
        { name: "Assignments", weight: 30, score: 88 },
        { name: "Midterm", weight: 30, score: 79 },
        { name: "Final Exam", weight: 40 },
      ],
      requirements: [
        { name: "Assignments", score: 82.3 },
        { name: "Midterm", score: 82.3 },
        { name: "Final Exam", score: 82.3 },
      ],
    },
    {
      courseName: "Computer Networks",
      credits: 3,
      fromTime: 14,
      toTime: 16,
      typeTracking: "Worth Reviewing",
      threshold: 75.53,
      passingRequirement:
        "To pass this course, you need at least 75.5 on Labs, 75.6 on Quizzes, and 75.5 on Final Project",
      assessments: [
        { name: "Labs", weight: 20, score: 75 },
        { name: "Quizzes", weight: 20, score: 70 },
        { name: "Final Project", weight: 60 },
      ],
      requirements: [
        { name: "Labs", score: 75.5 },
        { name: "Quizzes", score: 75.6 },
        { name: "Final Project", score: 75.5 },
      ],
    },
  ]);

  // Call the Python API and update a course's threshold result
  const triggerCompute = async (index: number, courses: Courses[]) => {
    const course = courses[index];
    if (!course.assessments?.length) return;

    setCourseItems((prev) =>
      prev.map((c, i) => (i === index ? { ...c, isCalculating: true } : c)),
    );

    const result = await callGraduationAPI(
      course.assessments,
      course.passingGrade ?? 75,
    );

    setCourseItems((prev) =>
      prev.map((c, i) => {
        if (i !== index) return c;
        if (!result) return { ...c, isCalculating: false };
        return {
          ...c,
          isCalculating: false,
          typeTracking: result.status,
          passingRequirement: result.message,
          thresholdResult: result,
          requirements: result.requirements.map((r) => ({
            name: r.name,
            score: r.min_score,
          })),
        };
      }),
    );
  };

  const toggleCourse = (index: number) => {
    setExpandedCourses((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index],
    );
  };

  const handleAddCourse = (newCourse: Courses) => {
    const updated = [...courseItems, { ...newCourse }];
    setCourseItems(updated);
    setShowForm(false);
  };

  const handleAddAssessment = (
    courseIndex: number,
    assessment: { name: string; weight: number; score?: number; date?: string },
  ) => {
    setCourseItems((prev) => {
      const updated = prev.map((course, i) =>
        i !== courseIndex
          ? course
          : {
              ...course,
              assessments: [...(course.assessments || []), assessment],
            },
      );
      triggerCompute(courseIndex, updated);
      return updated;
    });
    setAddingAssessmentToCourse(null);
  };

  const handleAddItem = (
    courseIndex: number,
    assessIdx: number,
    item: { name: string; weight: number; score?: number; date?: string },
  ) => {
    setCourseItems((prev) => {
      const updated = prev.map((course, ci) =>
        ci !== courseIndex
          ? course
          : {
              ...course,
              assessments: course.assessments?.map((assessment, ai) =>
                ai !== assessIdx
                  ? assessment
                  : {
                      ...assessment,
                      items: [...(assessment.items || []), item],
                    },
              ),
            },
      );
      triggerCompute(courseIndex, updated);
      return updated;
    });
    setAddingItemTo(null);
  };

  const renderPassingRequirement = (course: Courses) => {
    if (!course.passingRequirement) return null;

    const details = course.requirements;

    if (!details || !details.length) {
      return <>{course.passingRequirement}</>;
    }

    const parts: React.ReactNode[] = [];

    if (details.every((req) => req.score === details[0].score)) {
      parts.push("To pass this course, you need at least ");
      parts.push(
        <span key="overall-score" className="font-semibold text-indigo-primary">
          {details[0].score}
        </span>,
      );
      parts.push(" overall");
      return <>{parts}</>;
    }

    parts.push("To pass this course, you need at least ");

    details.forEach((req, index) => {
      parts.push(
        <span
          key={`score-${index}`}
          className="font-semibold text-indigo-primary"
        >
          {req.score}{" "}
        </span>,
      );
      parts.push("on ");
      parts.push(
        <span
          key={`name-${index}`}
          className="font-semibold text-black-primary"
        >
          {req.name}
        </span>,
      );

      if (index < details.length - 1) {
        if (details.length === 2) {
          parts.push(" and ");
        } else if (index < details.length - 2) {
          parts.push(", ");
        } else {
          parts.push(", and ");
        }
      }
    });

    return <>{parts}</>;
  };

  const renderScoreField = (
    value: number | undefined,
    isEditing: boolean | undefined,
    onScoreChange: (val: number | undefined) => void,
    onEditToggle: (editing: boolean) => void,
    courseIndex: number,
  ) => {
    if (isEditing) {
      return (
        <>
          <input
            type="number"
            value={value ?? ""}
            onChange={(e) => {
              const parsed = parseFloat(e.target.value);
              onScoreChange(isNaN(parsed) ? undefined : parsed);
            }}
            className="border border-gray-300 rounded px-2 py-1 text-sm w-24"
          />
          <button
            onClick={() => {
              onEditToggle(false);
              // Recompute after score is saved; use a tiny delay so state settles
              setTimeout(() => {
                setCourseItems((prev) => {
                  triggerCompute(courseIndex, prev);
                  return prev;
                });
              }, 50);
            }}
            className="text-indigo-primary hover:text-indigo-500 transition-colors"
          >
            <Check size={20} />
          </button>
        </>
      );
    }
    return (
      <>
        <p className="text-sm text-gray-primary">
          Score:{" "}
          <span className="font-semibold text-base text-black-primary">
            {value !== undefined ? value : "-"}
          </span>
        </p>
        <PencilLine
          size={20}
          className="text-indigo-primary cursor-pointer hover:text-indigo-500 transition-colors"
          onClick={() => onEditToggle(true)}
        />
      </>
    );
  };

  return (
    <div className="px-14.75 py-11.5 w-full">
      {/* Courses Overview */}
      <div className="flex flex-col gap-8">
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
            onClick={() => setShowForm(true)}
            className="flex flex-row gap-2 px-3 py-2 rounded-lg bg-indigo-primary text-white items-center cursor-pointer hover:bg-indigo-500 transition-colors"
          >
            <CirclePlus size={16} />
            Add Course
          </button>
        </div>

        <div className="flex flex-col gap-6">
          {courseItems.map((item, index) => (
            <div
              key={index}
              className="flex flex-col bg-white rounded-lg shadow-md overflow-hidden"
            >
              {/* Course Header */}
              <div
                className="flex flex-row justify-between items-center px-6 py-4 cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => toggleCourse(index)}
              >
                <div className="flex flex-col gap-1">
                  <div className="flex flex-row gap-3 items-center text-black-primary font-medium">
                    <h1>{item.courseName}</h1>
                    <div
                      className="py-1 px-3 text-xs font-semibold"
                      style={{
                        borderRadius: "100px",
                        border:
                          item.typeTracking === "On Track"
                            ? "1px solid rgba(115, 197, 143, 0.20)"
                            : item.typeTracking === "At Risk"
                            ? "1px solid rgba(197, 115, 115, 0.20)"
                            : "1px solid rgba(197, 178, 115, 0.20)",
                        background:
                          item.typeTracking === "On Track"
                            ? "rgba(132, 224, 163, 0.20)"
                            : item.typeTracking === "At Risk"
                            ? "rgba(224, 132, 132, 0.20)"
                            : "rgba(224, 216, 132, 0.20)",
                      }}
                    >
                      {item.typeTracking}
                    </div>
                  </div>

                  <p className="text-gray-primary text-sm">
                    {item.credits} credits • {item.fromTime}–{item.toTime}{" "}
                    hours/week
                  </p>
                </div>

                <div className="flex flex-row gap-4 items-center">
                  {item.isCalculating ? (
                    <div className="flex flex-col items-end gap-1">
                      <p className="text-xs text-gray-primary">Calculating…</p>
                      <div className="w-6 h-6 border-2 border-indigo-primary border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : (
                    <div className="flex flex-row gap-5 items-end">
                      {item.thresholdResult && (
                        <div>
                          <p className="text-xs text-gray-primary text-right">Current Grade</p>
                          <p className="text-right text-2xl font-medium text-gray-500">
                            {item.thresholdResult.current_grade}
                          </p>
                        </div>
                      )}
                      <div>
                        <p className="text-xs text-gray-primary text-right">
                          Pass Threshold
                        </p>
                        <p className="text-right text-2xl font-medium">
                          {item.passingGrade ?? item.threshold}
                        </p>
                      </div>
                    </div>
                  )}

                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 20 20"
                    fill="none"
                    className={`transition-transform duration-300 ${
                      expandedCourses.includes(index) ? "rotate-180" : ""
                    }`}
                  >
                    <path
                      d="M15.8334 7.5L10.0001 12.5L4.16675 7.5"
                      stroke="#1C274C"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              </div>

              {/* Expanded Content */}
              {expandedCourses.includes(index) && (
                <div className="flex flex-col gap-5 px-6 pt-1 pb-5">
                  {/* Passing requirement banner */}
                  {item.passingRequirement && (
                    <div
                      className="text-sm text-[#5D5D5D] px-6 py-4 rounded-xl flex flex-col gap-1"
                      style={{
                        background: item.thresholdResult?.is_feasible === false
                          ? "rgba(229, 61, 61, 0.08)"
                          : "rgba(61, 66, 229, 0.10)",
                      }}
                    >
                      <p>{renderPassingRequirement(item)}</p>
                      {item.thresholdResult && (
                        <p className="text-xs text-gray-primary mt-1">
                          Current grade:{" "}
                          <span className="font-semibold text-black-primary">
                            {item.thresholdResult.current_grade}
                          </span>
                          {item.thresholdResult.gap > 0 && (
                            <> — gap of{" "}
                              <span className="font-semibold text-black-primary">
                                {item.thresholdResult.gap}
                              </span>{" "}
                              points to passing
                            </>
                          )}
                          {!item.thresholdResult.is_feasible && (
                            <span className="ml-2 text-red-500 font-semibold">
                              ⚠ Target may not be achievable
                            </span>
                          )}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Assessment Breakdown header */}
                  <div className="flex flex-row justify-between items-center">
                    <h3 className="text-base text-black-primary">
                      Assessment Breakdown
                    </h3>
                    <button
                      className="flex items-center gap-3 text-indigo-primary text-base font-medium cursor-pointer hover:underline"
                      onClick={() => setAddingAssessmentToCourse(index)}
                    >
                      <CirclePlus size={20} />
                      Add Assessment
                    </button>
                  </div>

                  {/* Assessments list */}
                  <div className="flex flex-col gap-5">
                    {item.assessments?.map((assessment, assessIdx) => {
                      const hasSubItems =
                        assessment.items && assessment.items.length > 0;

                      return (
                        <div key={assessIdx} className="flex flex-col gap-5">
                          {/* Assessment row */}
                          <div className="flex flex-row justify-between items-center">
                            <div className="flex flex-col gap-2">
                              {/* Name + weight */}
                              <div className="flex flex-row gap-1 items-end">
                                <p className="font-medium text-base text-black-primary">
                                  {assessment.name}
                                </p>
                                <span className="text-sm text-gray-primary">
                                  ({assessment.weight}%)
                                </span>
                              </div>

                              {/* Score — only when no sub-items */}
                              {!hasSubItems && (
                                <div className="flex flex-row gap-1 items-center">
                                  {renderScoreField(
                                    assessment.score,
                                    assessment.isEditing,
                                    (val) =>
                                      setCourseItems((prev) => {
                                        const updated = [...prev];
                                        updated[index].assessments![
                                          assessIdx
                                        ].score = val;
                                        return updated;
                                      }),
                                    (editing) =>
                                      setCourseItems((prev) => {
                                        const updated = [...prev];
                                        updated[index].assessments![
                                          assessIdx
                                        ].isEditing = editing;
                                        return updated;
                                      }),
                                    index,
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Right: Add Item + date (when no sub-items) */}
                            <div className="flex flex-col items-end gap-1">
                              <button
                                className="flex items-center gap-3 text-indigo-primary text-base font-medium cursor-pointer hover:underline"
                                onClick={() => setAddingItemTo({ courseIndex: index, assessIdx })}
                              >
                                <CirclePlus size={20} />
                                Add Item
                              </button>
                              {!hasSubItems && assessment.date && (
                                <p className="text-sm text-gray-primary text-right">
                                  {assessment.date}
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Sub-items */}
                          {assessment.items?.map((subItem, subIdx) => (
                            <div
                              key={subIdx}
                              className="flex flex-row justify-between items-center ml-6"
                            >
                              <div className="flex flex-col gap-2">
                                <div className="flex flex-row gap-1 items-end">
                                  <p className="font-medium text-base text-black-primary">
                                    {subItem.name}
                                  </p>
                                  <span className="text-sm text-gray-primary">
                                    ({subItem.weight}/{assessment.weight}%)
                                  </span>
                                </div>
                                <div className="flex flex-row gap-1 items-center">
                                  {renderScoreField(
                                    subItem.score,
                                    subItem.isEditing,
                                    (val) =>
                                      setCourseItems((prev) => {
                                        const updated = [...prev];
                                        updated[index].assessments![
                                          assessIdx
                                        ].items![subIdx].score = val;
                                        return updated;
                                      }),
                                    (editing) =>
                                      setCourseItems((prev) => {
                                        const updated = [...prev];
                                        updated[index].assessments![
                                          assessIdx
                                        ].items![subIdx].isEditing = editing;
                                        return updated;
                                      }),
                                    index,
                                  )}
                                </div>
                              </div>

                              {subItem.date && (
                                <p className="text-sm text-gray-primary text-right">
                                  {subItem.date}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Add Course Modal */}
      {showForm && (
        <CourseForm
          onSubmit={handleAddCourse}
          onCancel={() => setShowForm(false)}
        />
      )}

      {/* Add Assessment Modal */}
      {addingAssessmentToCourse !== null && (
        <AssessmentForm
          onSubmit={(assessment) =>
            handleAddAssessment(addingAssessmentToCourse, assessment)
          }
          onCancel={() => setAddingAssessmentToCourse(null)}
        />
      )}

      {/* Add Item Modal */}
      {addingItemTo !== null && (() => {
        const assessment =
          courseItems[addingItemTo.courseIndex]?.assessments?.[addingItemTo.assessIdx];
        if (!assessment) return null;
        return (
          <ItemForm
            assessmentName={assessment.name}
            assessmentWeight={assessment.weight}
            onSubmit={(item) =>
              handleAddItem(addingItemTo.courseIndex, addingItemTo.assessIdx, item)
            }
            onCancel={() => setAddingItemTo(null)}
          />
        );
      })()}
    </div>
  );
}
