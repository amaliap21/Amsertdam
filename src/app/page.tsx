"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  AlertCircle,
  GraduationCap,
  MessageCircle,
} from "lucide-react";

export default function LandingPage() {
  return (
    <div className="bg-white min-h-dvh overflow-x-hidden">
      <header className="pt-6 px-4 sm:px-6">
        <div className="mx-auto flex w-full max-w-310 flex-col gap-4 rounded-3xl bg-indigo-primary/5 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:rounded-full sm:px-6 sm:py-2">
          <Link href="/" className="block mx-auto sm:mx-0">
            <Image
              src="/logo.svg"
              alt="RealTrack"
              width={152}
              height={53}
              className="w-auto md:h-10"
              priority
            />
          </Link>
          <div className="flex items-center justify-between gap-4 sm:gap-8">
            <Link
              href="/sign-in"
              className="text-sm font-medium text-indigo-primary hover:opacity-80"
            >
              Sign In
            </Link>
            <Link
              href="/sign-up"
              className="rounded-full bg-indigo-primary px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-90"
            >
              Sign Up
            </Link>
          </div>
        </div>
      </header>

      <section className="px-4 sm:px-6 pt-20 sm:pt-28 lg:pt-32 pb-20 sm:pb-24">
        <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-10 sm:gap-13 text-center">
          <div className="flex flex-col gap-5">
            <h1 className="text-[34px] sm:text-[44px] lg:text-[48px] font-semibold leading-tight text-black">
              Feeling overwhelmed by assignments, deadlines, and exams?
            </h1>
            <p className="text-[18px] sm:text-[20px] leading-7 sm:leading-7.5 text-gray-primary">
              RealTrack helps you understand what really matters in your
              studies, so you can focus your energy, manage your workload, and
              stay on track toward graduation.
            </p>
          </div>
          <Link
            href="/sign-up"
            className="inline-flex items-center gap-2.5 rounded-full bg-indigo-primary px-6 py-3 text-base font-medium text-white transition hover:opacity-90"
          >
            Sign Up for Free
            <ArrowRight size={20} />
          </Link>
        </div>
      </section>

      <section className="bg-indigo-primary/5 px-4 sm:px-6 py-16 sm:py-20">
        <div className="mx-auto flex w-full max-w-245 flex-col items-center gap-14 sm:gap-20">
          <h2 className="text-center text-[24px] sm:text-[28px] font-medium text-black-primary">
            Everything to help you learn better, one step at a time
          </h2>

          <div className="grid w-full grid-cols-1 gap-10 md:grid-cols-2 lg:grid-cols-3">
            <FeatureCard
              color="bg-[#763ed8]"
              title="Passing Target"
              description="Know exactly what score you need on each part to reach your goal."
            >
              <PassingTargetPreview />
            </FeatureCard>

            <FeatureCard
              color="bg-[#d83e3e]"
              title="Task Value"
              description="Get a little help deciding which tasks matter most right now."
            >
              <TaskValuePreview />
            </FeatureCard>

            <FeatureCard
              color="bg-[#423ed8]"
              title="Priority Planner"
              description="Plan your week in a simple and realistic way that works for you."
            >
              <PriorityPlannerPreview />
            </FeatureCard>

            <FeatureCard
              color="bg-[#3ed8be]"
              title="Flashcards"
              description="Practice step by step with helpful hints along the way."
            >
              <FlashcardsPreview />
            </FeatureCard>

            <FeatureCard
              color="bg-[#ce58b4]"
              title="Quiz Lab"
              description="Create practice questions from your materials and learn as you go."
            >
              <QuizLabPreview />
            </FeatureCard>

            <FeatureCard
              color="bg-[#d8743e]"
              title="Study Companion"
              description="Get gentle guidance, corrections, and support while you learn."
            >
              <StudyCompanionPreview />
            </FeatureCard>
          </div>
        </div>
      </section>

      <footer className="flex flex-col items-center gap-3 py-10 text-center">
        <div className="flex items-center gap-4 text-sm">
          <Link href="/terms" className="text-gray-primary hover:text-indigo-primary hover:underline">
            Terms of Service
          </Link>
          <span className="text-gray-300">·</span>
          <Link href="/privacy" className="text-gray-primary hover:text-indigo-primary hover:underline">
            Privacy Policy
          </Link>
          <span className="text-gray-300">·</span>
          <Link href="/terms#refunds" className="text-gray-primary hover:text-indigo-primary hover:underline">
            Refund Policy
          </Link>
        </div>
        <p className="text-base text-[#5d5d5d]">© 2026 RealTrack</p>
      </footer>
    </div>
  );
}

function FeatureCard({
  color,
  title,
  description,
  children,
}: {
  color: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`${color} relative h-87.75 w-full overflow-hidden rounded-2xl`}
    >
      <div className="flex flex-col items-center gap-2 px-5 pt-6 pb-2 text-center text-white">
        <h3 className="text-xl font-semibold">{title}</h3>
        <p className="text-xs leading-snug">{description}</p>
      </div>
      <div className="absolute inset-x-0 bottom-0 top-27">{children}</div>
    </div>
  );
}

function PassingTargetPreview() {
  const courses: {
    name: string;
    credits: string;
    status: "On Track" | "Worth Reviewing";
  }[] = [
    {
      name: "Data Structures and Algorithms",
      credits: "4 credits • 10–11 hrs/week",
      status: "On Track",
    },
    {
      name: "Operating System",
      credits: "3 credits • 8–9 hrs/week",
      status: "Worth Reviewing",
    },
    {
      name: "Computer Network",
      credits: "2 credits • 8–9 hrs/week",
      status: "On Track",
    },
    {
      name: "Database",
      credits: "3 credits • 6–7 hrs/week",
      status: "Worth Reviewing",
    },
  ];

  return (
    <div className="absolute right-0 bottom-0 w-64 rounded-tl-xl rounded-br-2xl bg-white p-3 shadow-lg">
      <div className="flex flex-col gap-2">
        {courses.map((c) => (
          <div
            key={c.name}
            className="flex items-center justify-between rounded-md border border-gray-100 px-2 py-1.5"
          >
            <div className="min-w-0 flex-1 pr-2">
              <p className="truncate text-[10px] font-medium text-black-primary">
                {c.name}
              </p>
              <p className="truncate text-[8px] text-gray-primary">
                {c.credits}
              </p>
            </div>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[8px] font-semibold ${
                c.status === "On Track"
                  ? "bg-green-100 text-green-700"
                  : "bg-yellow-100 text-yellow-700"
              }`}
            >
              {c.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TaskValuePreview() {
  return (
    <div className="relative h-full w-full">
      <div className="absolute left-1/2 top-4.5 h-29.5 w-52.75 -translate-x-1/2 -rotate-5 rounded-lg bg-white/95" />
      <div className="absolute left-1/2 top-2.5 h-32.75 w-56.5 -translate-x-1/2 rotate-3 rounded-lg bg-white/95" />
      <div className="absolute left-1/2 top-5 flex h-31 w-60.75 -translate-x-1/2 flex-col justify-end rounded-lg bg-white px-4 pb-3 pt-2 shadow-md">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-medium text-black-primary">
            Focus First
          </span>
          <AlertCircle size={16} className="text-[#e53d3d]" />
        </div>
        <div className="mt-2 flex items-end gap-2">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-[#ffd9c2] to-[#ff9a76] text-2xl">
            <span role="img" aria-label="student">
              👧
            </span>
          </div>
          <div className="flex flex-col">
            <p className="leading-none">
              <span className="text-[20px] font-normal text-[#e53d3d]">1</span>
              <span className="ml-1 text-[12px] text-black-primary">task</span>
            </p>
            <p className="mt-1 text-[10px] text-gray-primary">
              High impact, worth your effort.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function PriorityPlannerPreview() {
  return (
    <div className="absolute left-5.5 right-5.5 top-1 rounded-tl-xl rounded-br-2xl bg-white shadow-lg">
      <div className="flex items-center gap-1 border-b border-gray-100 p-2">
        <span className="rounded-md bg-indigo-primary/10 px-3 py-1 text-[10px] font-medium text-indigo-primary">
          Day
        </span>
        <span className="rounded-md px-3 py-1 text-[10px] font-medium text-gray-primary">
          Week
        </span>
      </div>
      <div className="px-3 py-2">
        <p className="text-[11px] font-semibold text-black-primary">
          Thursday, January 8
        </p>
        <div className="mt-2 flex flex-col gap-1.5">
          <ScheduleRow
            dot="bg-green-500"
            time="8 AM – 10 AM"
            label="[Class] Data Structures and Algorithms"
          />
          <ScheduleRow
            dot="bg-indigo-primary"
            time="10 AM – 12 PM"
            label="[Task] Operating System Project"
          />
          <ScheduleRow dot="bg-gray-300" time="2 PM – 3 PM" label="" />
          <ScheduleRow dot="bg-gray-300" time="3 PM – 4 PM" label="" />
        </div>
      </div>
    </div>
  );
}

function ScheduleRow({
  dot,
  time,
  label,
}: {
  dot: string;
  time: string;
  label: string;
}) {
  return (
    <div className="flex items-start gap-1.5">
      <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
      <div className="flex flex-col">
        <span className="text-[8px] text-gray-primary">{time}</span>
        {label && (
          <span className="text-[9px] font-medium text-black-primary">
            {label}
          </span>
        )}
      </div>
    </div>
  );
}

function FlashcardsPreview() {
  return (
    <div className="relative h-full w-full">
      <div className="absolute left-1/2 top-10 h-39.25 w-60 -translate-x-1/2 rounded-lg bg-[#ecf0f3]" />
      <div className="absolute left-1/2 top-6 flex h-38.5 w-58 -translate-x-1/2 -rotate-7 flex-col items-center justify-center gap-3 rounded-lg bg-white p-5 shadow-md">
        <p className="text-center text-[11px] font-medium text-black-primary">
          A value-column that uniquely identifies each record is called a ___.
        </p>
        <div className="h-px w-full bg-gray-200" />
        <p className="text-[9px] text-gray-primary">Tap to reveal answer</p>
        <GraduationCap size={20} className="text-[#3ed8be]" />
      </div>
    </div>
  );
}

function QuizLabPreview() {
  return (
    <div className="absolute left-5.5 right-5.5 top-1 rounded-tl-xl rounded-br-2xl bg-white p-3 shadow-lg">
      <p className="text-[11px] font-semibold text-black-primary">
        Algorithms Midterm Practice
      </p>
      <p className="mt-0.5 text-[8px] text-gray-primary">
        Algorithms & Data Structures · 3 questions
      </p>
      <div className="mt-3 rounded-md border border-gray-100 p-2">
        <p className="text-[10px] font-medium text-black-primary">
          1. What&apos;s the complexity of binary search?
        </p>
        <ul className="mt-1.5 flex flex-col gap-1 text-[9px] text-gray-primary">
          <li>A. O(n)</li>
          <li>B. O(log n)</li>
          <li>C. O(n²)</li>
          <li>D. O(1)</li>
        </ul>
      </div>
      <p className="mt-2 text-[10px] font-medium text-black-primary">
        2. Which of these data structures uses…
      </p>
    </div>
  );
}

function StudyCompanionPreview() {
  return (
    <div className="relative h-full w-full">
      <ChatCard
        className="absolute left-1/2 top-12 w-67.25 -translate-x-1/2 opacity-100"
        primary
      />
      <ChatCard className="absolute left-1/2 top-28 w-61.25 -translate-x-1/2 opacity-95" />
      <ChatCard
        className="absolute left-1/2 top-42 w-56.5 -translate-x-1/2 opacity-70"
        muted
      />
    </div>
  );
}

function ChatCard({
  className,
  primary,
  muted,
}: {
  className?: string;
  primary?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-2 rounded-xl bg-white p-2.5 shadow-md ${className ?? ""}`}
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="truncate text-[10px] font-semibold text-black-primary">
          Database Midterm Practice
        </p>
        <p className="truncate text-[8px] text-gray-primary">Database System</p>
        {primary && (
          <span className="mt-1 w-fit rounded-full bg-indigo-primary/10 px-1.5 py-0.5 text-[7px] font-medium text-indigo-primary">
            Not started
          </span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <button className="rounded-md border border-gray-200 px-2 py-1 text-[8px] font-medium text-gray-primary">
          Review
        </button>
        <button
          className={`flex items-center gap-1 rounded-md px-2 py-1 text-[8px] font-medium text-white ${
            muted ? "bg-indigo-primary/60" : "bg-indigo-primary"
          }`}
        >
          <MessageCircle size={10} />
          Chat with AI
        </button>
      </div>
    </div>
  );
}
