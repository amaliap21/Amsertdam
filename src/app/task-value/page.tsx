"use client";

import { CircleAlert, CircleHelp, CircleCheck, Calendar, Clock, CirclePlus } from "lucide-react";
import { useState } from "react";
import Image from "next/image";
import AddTaskModal from "@/components/ui/task-form";
import toast from "react-hot-toast";

type TaskPriority = "Focus First" | "If You Have Energy" | "Safe to Minimize";

type Task = {
  id: string;
  title: string;
  course: string;
  date: string;
  timeEstimate: string;
  priority: TaskPriority;
  description: string;
  effort: string;
};

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

  const handleAddTask = (task: {
    taskName: string;
    description: string;
    deadline: string;
  }) => {
    // TODO: Implement task creation logic
    // * For now, print to console to debug
    console.log("New task:", task);
    toast.success("Task added successfully!");
  };

  const priorityCards: PriorityCard[] = [
    {
      priority: "Focus First",
      icon: <CircleAlert size={20} />,
      gradient: "linear-gradient(288deg, rgba(229, 61, 61, 0.20) 34.38%, rgba(245, 150, 56, 0.20) 95.91%)",
      textColor: "#E53D3D",
      iconColor: "#E53D3D",
      taskCount: 1,
      description: "High impact, worth your effort.",
      image: "/red-task.svg",
    },
    {
      priority: "If You Have Energy",
      icon: <CircleHelp size={20} />,
      gradient: "linear-gradient(288deg, rgba(223, 229, 61, 0.20) 34.38%, rgba(223, 245, 56, 0.20) 95.91%)",
      textColor: "#E5B03D",
      iconColor: "#E5B03D",
      taskCount: 1,
      description: "Helpful but this task is not critical.",
      image: "/yellow-task.svg",
    },
    {
      priority: "Safe to Minimize",
      icon: <CircleCheck size={20} />,
      gradient: "linear-gradient(288deg, var(--Green, rgba(132, 224, 163, 0.20)) 34.38%, var(--Teal, rgba(110, 175, 187, 0.20)) 95.91%)",
      textColor: "#73C58F",
      iconColor: "#73C58F",
      taskCount: 1,
      description: "Low impact, safe to do less.",
      image: "/green-task.svg",
    },
  ];

  const tasks: Task[] = [
    {
      id: "1",
      title: "Operating System Project",
      course: "Operating System",
      date: "Feb 5",
      timeEstimate: "8h",
      priority: "Focus First",
      description: "This task carries meaningful weight toward your grade. Putting effort here is a good investment for your peace of mind.",
      effort: "high effort",
    },
    {
      id: "2",
      title: "Probability and Statistics Problem Set",
      course: "Probability and Statistics",
      date: "Feb 10",
      timeEstimate: "2h",
      priority: "If You Have Energy",
      description: "This task carries meaningful weight toward your grade. Putting effort here is a good investment for your peace of mind.",
      effort: "medium effort",
    },
    {
      id: "3",
      title: "Database Task",
      course: "Database",
      date: "Feb 10",
      timeEstimate: "12h",
      priority: "Safe to Minimize",
      description: "This task carries meaningful weight toward your grade. Putting effort here is a good investment for your peace of mind.",
      effort: "high effort",
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

  const getPriorityIcon = (priority: TaskPriority) => {
    switch (priority) {
      case "Focus First":
        return <CircleAlert size={16} className="text-[#E53D3D]" />;
      case "If You Have Energy":
        return <CircleHelp size={16} className="text-[#E5B03D]" />;
      case "Safe to Minimize":
        return <CircleCheck size={16} className="text-[#73C58F]" />;
      default:
        return null;
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
    <div className="min-h-screen bg-white px-14.75 py-11.5">
      {/* Header */}
      <div className="flex justify-between items-start mb-8">
        <div>
          <h1 className="text-[28px] font-semibold text-black-primary mb-2">
            Task Value
          </h1>
          <p className="text-gray-primary">
            Helping you allocate effort sustainably while protecting your wellbeing
          </p>
        </div>
        <button
          onClick={() => setShowAddTaskModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-primary text-white rounded-lg hover:bg-indigo-600 transition-colors"
        >
          <CirclePlus size={18} />
          Add Task
        </button>
      </div>

      {/* What to Work on First Section */}
      <div className="mb-8 bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="text-[20px] font-semibold text-black-primary mb-5">
          What to Work on First?
        </h2>
        <div className="flex flex-row gap-6">
          {priorityCards.map((card) => (
            <div
              key={card.priority}
              className="flex-col gap-2.5 px-4 pt-4 rounded-lg w-1/3"
              style={{
                background: card.gradient,
              }}
            >
              <div className="flex flex-row justify-between items-center">
                <h1 className="text-sm text-black-primary font-medium">
                  {card.priority}
                </h1>
                <div style={{ color: card.iconColor }}>{card.icon}</div>
              </div>

              <div className="flex flex-row">
                <Image
                  src={card.image}
                  alt={`${card.priority} Tasks`}
                  width={185}
                  height={87}
                  className="w-46.25 h-21.75"
                />
                <div>
                  <h1 className="text-sm">
                    <span
                      className="text-xl"
                      style={{ color: card.textColor }}
                    >
                      {card.taskCount}
                    </span>{" "}
                    task
                  </h1>
                  <p className="text-xs text-gray-primary">{card.description}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Info Message */}
      <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-4 mb-8">
        <p className="text-sm text-gray-700">
          <span className="font-medium">It's okay to let go.</span> One task can be minimized or skipped without affecting your ability to pass. Protecting your energy is a valid choice.
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
          These are worth your energy. Completing them helps you feel more secure and in control.
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
                  <p className="text-sm text-gray-primary mb-2">{task.course}</p>
                  <div className="flex items-center gap-1.5 text-sm text-gray-600">
                    <Calendar size={14} />
                    <span>{task.date}</span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-medium border ${getPriorityBadgeStyles(
                      task.priority
                    )}`}
                  >
                    {task.priority}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Clock size={16} />
                    <span className="text-base font-semibold text-black-primary">{task.timeEstimate}</span>
                  </div>
                  <span className="text-sm text-gray-500">{task.effort}</span>
                </div>
              </div>
              <div className="mt-3">
                <div className={`${getBackgroundColor(task.priority)} rounded-lg p-3`}>
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
          These tasks matter, but you have flexibility. It's okay to scale back if you're tired.
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
                  <p className="text-sm text-gray-primary mb-2">{task.course}</p>
                  <div className="flex items-center gap-1.5 text-sm text-gray-600">
                    <Calendar size={14} />
                    <span>{task.date}</span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-medium border ${getPriorityBadgeStyles(
                      task.priority
                    )}`}
                  >
                    {task.priority}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Clock size={16} />
                    <span className="text-base font-semibold text-black-primary">{task.timeEstimate}</span>
                  </div>
                  <span className="text-sm text-gray-500">{task.effort}</span>
                </div>
              </div>
              <div className="mt-3">
                <div className={`${getBackgroundColor(task.priority)} rounded-lg p-3`}>
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
          These tasks have low impact on your grade. Protecting your wellbeing here is a reasonable choice.
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
                  <p className="text-sm text-gray-primary mb-2">{task.course}</p>
                  <div className="flex items-center gap-1.5 text-sm text-gray-600">
                    <Calendar size={14} />
                    <span>{task.date}</span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-medium border ${getPriorityBadgeStyles(
                      task.priority
                    )}`}
                  >
                    {task.priority}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Clock size={16} />
                    <span className="text-base font-semibold text-black-primary">{task.timeEstimate}</span>
                  </div>
                  <span className="text-sm text-gray-500">{task.effort}</span>
                </div>
              </div>
              <div className="mt-3">
                <div className={`${getBackgroundColor(task.priority)} rounded-lg p-3`}>
                  <p className="text-sm text-gray-700">{task.description}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Add Task Modal */}
      <AddTaskModal
        isOpen={showAddTaskModal}
        onClose={() => setShowAddTaskModal(false)}
        onSubmit={handleAddTask}
      />
    </div>
  );
}
