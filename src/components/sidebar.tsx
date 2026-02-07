"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { LogOut, House, Crosshair, BookOpen, Calendar } from "lucide-react";
import HamburgerIcon from "@/components/icons/hamburger-icon";
import FlashcardsIcon from "@/components/icons/flashcards-icon";

type MenuItem = {
  label: string;
  href: string;
  icon: React.ReactNode;
};

export default function Sidebar({ className }: { className?: string }) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(true);

  const menuItems: MenuItem[] = [
    {
      label: "Dashboard",
      href: "/dashboard",
      icon: <House size={18} />,
    },
    {
      label: "Passing Target",
      href: "/passing-target",
      icon: <Crosshair size={18} />,
    },
    {
      label: "Task Value",
      href: "/task-value",
      icon: <BookOpen size={18} />,
    },
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
  ];

  return (
    <aside
      className={`${
        isOpen ? "w-64" : "w-16"
      } min-h-screen bg-[#3d42e50d] text-white flex flex-col justify-between pl-4 py-6 shrink-0 transition-all duration-300 ${className}`}
    >
      {/* TOP */}
      <div>
        {/* LOGO & COLLAPSE */}
        <div className="flex items-center justify-between mb-10 px-2">
          <button
            className="cursor-pointer rounded"
            onClick={() => setIsOpen(!isOpen)}
          >
            <HamburgerIcon size={20} className="stroke-black-primary" />
          </button>
        </div>

        {/* MENU */}
        <nav className="space-y-2">
          {menuItems.map((item) => {
            const isActive = pathname === item.href;

            return (
              <Link
                key={item.label}
                href={item.href}
                className={`relative flex items-center gap-3 px-2 py-3 rounded-md transition font-inter
                  ${
                    isActive
                      ? "text-indigo-primary stroke-indigo-primary"
                      : "text-black-primary stroke-black-primary hover:text-indigo-primary hover:stroke-indigo-primary"
                  }
                `}
              >
                {item.icon}
                {isOpen && (
                  <span className="text-sm font-medium">{item.label}</span>
                )}
                {isActive && (
                  <span className="absolute right-0 top-0 h-full w-1 bg-indigo-primary rounded-tr-md rounded-br-md"></span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* BOTTOM */}
      <div className="space-y-6">
        {/* LOGOUT */}
        <button
          className="flex items-center gap-3 w-full px-2 text-black-primary hover:text-indigo-primary rounded-md transition cursor-pointer"
          onClick={() => {
            localStorage.clear();
            window.location.href = "/login";
          }}
        >
          <LogOut size={18} />
          {isOpen && (
            <span className="font-inter text-sm font-medium">Logout</span>
          )}
        </button>
      </div>
    </aside>
  );
}
