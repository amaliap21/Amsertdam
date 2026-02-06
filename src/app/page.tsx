import Dashboard from "@/app/dashboard/page";
import { Metadata } from "next";


export default function Home() {
  return (
    <main className="flex relative min-h-screen flex-col overflow-hidden items-center justify-center gap-20 p-10 sm:px-20 md:px-24 lg:py-24 2xl:py-40 lg:px-20 2xl:px-32 bg-custom-blue z-0">
      <Dashboard />
    </main>
  );
}

export const metadata: Metadata = {
  title: "Student Wellbeing & Outcome Optimization",
  description:
    "Track your progress at a human pace",
  generator: "Next.js",
  keywords: ["Next.js", "React", "Productivity", "Student Wellbeing"],
  applicationName: "Realrack",
  category: "Productivity",
};
