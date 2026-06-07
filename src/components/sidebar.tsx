"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  LogOut,
  House,
  Crosshair,
  BookOpen,
  Calendar,
  BookOpenCheck,
  MessagesSquare,
  Globe,
  X,
} from "lucide-react";
import FlashcardsIcon from "@/components/icons/flashcards-icon";
import { createClient } from "@/lib/supabase/client";

type MenuItem = {
  label: string;
  href: string;
  icon: React.ReactNode;
};

type SidebarProps = {
  className?: string;
  // Controlled from the layout so the navbar's mobile hamburger can toggle it.
  isOpen: boolean;
  onToggle: () => void;
};

export default function Sidebar({ className, isOpen, onToggle }: SidebarProps) {
  const pathname = usePathname();

  const menuItems: MenuItem[] = [
    { label: "Dashboard", href: "/dashboard", icon: <House size={18} /> },
    {
      label: "Passing Target",
      href: "/passing-target",
      icon: <Crosshair size={18} />,
    },
    { label: "Task Value", href: "/task-value", icon: <BookOpen size={18} /> },
    {
      label: "Priority Planner",
      href: "/priority-planner",
      icon: <Calendar size={18} />,
    },
    {
      label: "Flashcards",
      href: "/flashcards",
      icon: <FlashcardsIcon size={18} />,
    },
    { label: "Quiz Lab", href: "/quiz-lab", icon: <BookOpenCheck size={18} /> },
    {
      label: "Study Companion",
      href: "/study-companion",
      icon: <MessagesSquare size={18} />,
    },
    {
      label: "Community",
      href: "/community",
      icon: <Globe size={18} />,
    },
  ];

  return (
    <aside
      className={`
        ${isOpen ? "translate-x-0" : "-translate-x-full"}
        lg:translate-x-0
        fixed lg:sticky lg:top-0 inset-y-0 left-0 z-40
        w-[82vw] max-w-80 lg:w-64
        h-dvh bg-white border-r border-gray-200 shadow-xl lg:shadow-none
        shrink-0 transition-transform duration-300
        ${className ?? ""}
      `}
    >
      <div
        className="flex h-full flex-col px-4 py-5 lg:px-5"
        style={{ paddingTop: "max(1.25rem, env(safe-area-inset-top))" }}
      >
        <div className="mb-6 flex items-center justify-between gap-3">
          <Link href="/dashboard" className="flex items-center gap-2 lg:hidden">
            <Image
              src="/logo.svg"
              alt="RealTrack"
              width={152}
              height={53}
              className="h-10 w-auto"
              priority
            />
          </Link>

          <button
            className="flex h-9 w-9 items-center justify-center rounded-full text-black-primary hover:bg-gray-100 lg:hidden"
            onClick={onToggle}
            aria-label={isOpen ? "Close sidebar" : "Open sidebar"}
          >
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 space-y-2 overflow-y-auto">
          {menuItems.map((item) => {
            const isActive = pathname === item.href;

            return (
              <Link
                key={item.label}
                href={item.href}
                className={`relative flex items-center gap-3 rounded-xl px-3 py-3 font-inter transition
                  ${
                    isActive
                      ? "text-indigo-primary stroke-indigo-primary bg-indigo-primary/5"
                      : "text-black-primary stroke-black-primary hover:text-indigo-primary hover:stroke-indigo-primary hover:bg-gray-50"
                  }
                `}
              >
                {item.icon}
                <span className="text-sm font-medium">{item.label}</span>
                {isActive && (
                  <span className="absolute right-0 top-0 h-full w-1 rounded-tr-xl rounded-br-xl bg-indigo-primary" />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="mt-6">
          <button
            className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-black-primary transition hover:bg-gray-50 hover:text-indigo-primary"
            onClick={async () => {
              try {
                const supabase = createClient();
                await supabase.auth.signOut();
              } catch {}
              try {
                localStorage.removeItem("realtrack-storage");
              } catch {}
              window.location.href = "/sign-in";
            }}
          >
            <LogOut size={18} />
            <span className="font-inter text-sm font-medium">Logout</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
