"use client";
import Image from "next/image";
import React from "react";
import { Search } from "lucide-react";

interface NavbarProps {
  className?: string;
}

const Navbar: React.FC<NavbarProps> = (className) => {
  return (
    <nav
      className={`flex justify-between items-center w-full bg-cyan-light ${className} pt-5 px-7.25`}
    >
      <section>
        <Image
          src="/logo.svg"
          alt="RealTrack Logo"
          width={187}
          height={64}
          className="w-full"
        />
      </section>

      {/* search bar */}
      <div className="flex items-center gap-4 bg-[#F5F5F5] rounded-[100px] px-3 py-5 w-126.25 h-5">
        <Search size={20} />
        <input
          type="text"
          placeholder="Search courses, credits, flashcards"
          className="bg-transparent outline-none w-full"
        />
      </div>

      <div className="flex items-center gap-4">
        <div className="flex flex-col">
          <span className="text-base text-[#303030] font-medium">
            Adinda Putri
          </span>
          <span className="text-[14px] text-[#6B6B6B] font-normal">
            Computer Science
          </span>
        </div>
        <Image
          src="/"
          alt="Profile Picture"
          width={48}
          height={48}
          className="rounded-full w-13 h-13 bg-blue-900"
        />
      </div>
    </nav>
  );
};

export default Navbar;
