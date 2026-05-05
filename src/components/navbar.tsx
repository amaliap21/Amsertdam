"use client";
import Image from "next/image";
import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { useCurrentUser } from "@/lib/use-current-user";

interface NavbarProps {
  className?: string;
}

const Navbar: React.FC<NavbarProps> = ({ className = "" }) => {
  const router = useRouter();
  const { user } = useCurrentUser();
  const [searchValue, setSearchValue] = useState("");

  const profileName = user?.user_metadata?.full_name ?? user?.email ?? "Your profile";
  const profileSubtitle = user?.email ?? "Signed in";
  const initials = useMemo(() => {
    const source = String(profileName || "U");
    return source
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "U")
      .join("");
  }, [profileName]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const next = searchValue.trim();
    router.push(next ? `/search?q=${encodeURIComponent(next)}` : "/search");
  };

  return (
    <nav
      className={`flex w-full items-center justify-between bg-cyan-light pt-5 px-7.25 ${className}`}
    >
      <section>
        <Image
          src="/logo.svg"
          alt="RealTrack Logo"
          width={187}
          height={64}
          className="w-full"
          loading="eager"
        />
      </section>

      <form
        className="flex h-14 w-126.25 items-center gap-4 rounded-[100px] bg-[#F5F5F5] px-4"
        onSubmit={handleSearch}
      >
        <Search size={20} />
        <input
          type="text"
          id="search-input"
          name="search"
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
          placeholder="Search courses, tasks, flashcards, quizzes"
          className="bg-transparent outline-none w-full"
        />
      </form>

      <div className="flex items-center gap-4">
        <div className="flex flex-col">
          <span className="font-medium text-black-primary">{profileName}</span>
          <span className="text-[14px] text-gray-primary">{profileSubtitle}</span>
        </div>
        <div className="flex h-13 w-13 items-center justify-center rounded-full border-2 border-gray-500 bg-indigo-primary text-sm font-semibold text-white">
          {initials || "U"}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
