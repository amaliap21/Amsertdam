import Dashboard from "@/app/dashboard/page";
import { Metadata } from "next";

export default function Home() {
  return (
    <main className="flex relative min-h-screen flex-col overflow-hidden items-center justify-center gap-20 bg-custom-blue z-0">
      <Dashboard />
    </main>
  );
}

export const metadata: Metadata = {
  title: "Student Wellbeing & Outcome Optimization",
  description: "Track your progress at a human pace",
  generator: "Next.js",
  keywords: ["Next.js", "React", "Productivity", "Student Wellbeing"],
  applicationName: "Realrack",
  category: "Productivity",
};
