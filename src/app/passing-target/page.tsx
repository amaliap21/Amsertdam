"use client";
import { CirclePlus, PencilLine } from "lucide-react";
import { useState } from "react";

type Tasks = {
  cardColor: string;
  type: string;
  icon: React.ReactNode;
  image: string;
  taskCount: number;
  taskCountColor: string;
  text: string;
};

type Courses = {
  courseName: string;
  credits: number;
  fromTime: number;
  toTime: number;
  typeTracking: string;
  threshold: string;
  assessments?: {
    name: string;
    weight: number;
    score?: number;
    date?: string;
  }[];
  passingRequirement?: string;
};

export default function PassingTarget() {
  const [expandedCourses, setExpandedCourses] = useState<number[]>([]);

  const courseItems: Courses[] = [
    {
      courseName: "Introduction to Computer Science",
      credits: 4,
      fromTime: 10,
      toTime: 11,
      typeTracking: "On Track",
      threshold: "80.7",
      passingRequirement:
        "To pass this course, you need at least 85.9 on Project (20%) and 62.3 on Midterm Exam (35%)",
      assessments: [
        { name: "Project", weight: 30, score: 80, date: "Feb 15" },
        { name: "Midterm Exam", weight: 35, score: 75, date: "Mar 10" },
        { name: "Final Exam", weight: 35, date: "May 25" },
      ],
    },
    {
      courseName: "Data Structures and Algorithms",
      credits: 3,
      fromTime: 8,
      toTime: 10,
      typeTracking: "On Track",
      threshold: "75.5",
      passingRequirement: "To pass this course, you need at least 75.5 overall",
      assessments: [
        { name: "Assignments", weight: 20, score: 85 },
        { name: "Midterm", weight: 30, score: 72 },
        { name: "Final Exam", weight: 50 },
      ],
    },
    {
      courseName: "Database Management Systems",
      credits: 3,
      fromTime: 9,
      toTime: 11,
      typeTracking: "Worth Reviewing",
      threshold: "78.0",
      passingRequirement: "To pass this course, you need at least 78.0 overall",
      assessments: [
        { name: "Labs", weight: 25, score: 80 },
        { name: "Midterm", weight: 35, score: 68 },
        { name: "Final Project", weight: 40 },
      ],
    },
    {
      courseName: "Operating Systems",
      credits: 4,
      fromTime: 11,
      toTime: 13,
      typeTracking: "On Track",
      threshold: "82.3",
      passingRequirement: "To pass this course, you need at least 82.3 overall",
      assessments: [
        { name: "Assignments", weight: 30, score: 88 },
        { name: "Midterm", weight: 30, score: 79 },
        { name: "Final Exam", weight: 40 },
      ],
    },
    {
      courseName: "Computer Networks",
      credits: 3,
      fromTime: 14,
      toTime: 16,
      typeTracking: "Worth Reviewing",
      threshold: "77.8",
      passingRequirement: "To pass this course, you need at least 77.8 overall",
      assessments: [
        { name: "Labs", weight: 20, score: 75 },
        { name: "Quizzes", weight: 20, score: 70 },
        { name: "Final Project", weight: 60 },
      ],
    },
  ];

  const toggleCourse = (index: number) => {
    setExpandedCourses((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]
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

          <button className="flex flex-row gap-2 px-3 py-2 rounded-lg bg-indigo-primary text-white items-center">
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
                className="flex flex-row justify-between items-center p-4 cursor-pointer hover:bg-gray-50 transition-colors"
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
                            : "1px solid rgba(197, 178, 115, 0.20)",
                        background:
                          item.typeTracking === "On Track"
                            ? "rgba(132, 224, 163, 0.20)"
                            : "rgba(224, 216, 132, 0.20)",
                      }}
                    >
                      {item.typeTracking}
                    </div>
                  </div>

                  <p className="text-gray-primary text-sm">
                    {item.credits} credits • {item.fromTime}-{item.toTime}{" "}
                    hours/week
                  </p>
                </div>

                <div className="flex flex-row gap-4 items-center">
                  <div>
                    <p className="text-xs text-gray-primary">Pass Threshold</p>
                    <p className="text-right text-2xl font-medium">
                      {item.threshold}
                    </p>
                  </div>

                  {/* arrow - rotates when expanded */}
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
                <div className="px-4 pb-4 pt-2 border-t border-gray-200">
                  {item.passingRequirement && (
                    <p
                      className="text-sm text-gray-700 mb-4 p-3"
                      style={{
                        borderRadius: "12px",
                        background: "rgba(61, 66, 229, 0.10)",
                      }}
                    >
                      {item.passingRequirement}
                    </p>
                  )}

                  <h3 className="font-semibold text-sm mb-3">
                    Assessment Breakdown
                  </h3>

                  <div className="flex flex-col gap-3">
                    {item.assessments?.map((assessment, assessIdx) => (
                      <div
                        key={assessIdx}
                        className="flex flex-row justify-between items-center bg-white p-3 rounded"
                      >
                        <div className="flex flex-col gap-2">
                          <div className="flex flex-row gap-2 items-center">
                            <p className="font-medium text-sm">
                              {assessment.name}
                            </p>
                            <span className="text-xs text-gray-500">
                              ({assessment.weight}%)
                            </span>
                          </div>

                          <div>
                            <div className="flex flex-row gap-2 items-center">
                              <p className="text-gray-primary">
                                Score:{" "}
                                <span className="text-black-primary">
                                  {assessment.score !== undefined
                                    ? assessment.score
                                    : "-"}
                                </span>
                              </p>

                              <PencilLine
                                size={20}
                                className="text-indigo-primary"
                              />
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-col justify-center gap-2 items-end">
                          <button className="flex items-center gap-3 text-indigo-primary text-sm font-medium">
                            <CirclePlus size={16} />
                            Add Item
                          </button>

                          {assessment.date && (
                            <p className="text-xs text-gray-500">
                              {assessment.date}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
