"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Chrome, Eye, EyeOff, X } from "lucide-react";
import Image from "next/image";
import toast from "react-hot-toast";
import { createClient } from "@/lib/supabase/client";

// Whitelist for the post-login redirect. We only follow a relative path that
// starts with a single "/" — never "//" (protocol-relative) or "http(s)://".
// Without this an attacker could craft /sign-in?next=https://evil.example
// and trick the user into landing off-site after sign-in.
function safeNext(raw: string | null): string {
  if (!raw) return "/dashboard";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/dashboard";
  return raw;
}

export default function SignInPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = safeNext(searchParams.get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
      toast.success("Welcome back");
      // Signal tour-bootstrap to launch the onboarding the moment the
      // dashboard mounts — survives the AuthSync hard-reload because
      // it's stored in sessionStorage, not React state.
      try {
        sessionStorage.setItem("realtrack-pending-tour", "1");
      } catch {
        /* ignore */
      }
      router.push(nextPath);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setLoading(true);
    try {
      // Set the pending-tour flag BEFORE the OAuth redirect so it's
      // already in sessionStorage by the time we land back on /dashboard.
      try {
        sessionStorage.setItem("realtrack-pending-tour", "1");
      } catch {
        /* ignore */
      }
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) throw error;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Google sign-in failed");
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-dvh w-full bg-white">
      <div className="relative hidden w-1/2 overflow-hidden lg:block">
        <Image
          src="/laptop-sign.jpg"
          alt="RealTrack"
          fill
          className="object-cover"
          sizes="(min-width: 1024px) 50vw, 100vw"
          priority
        />
      </div>

      <div className="relative flex w-full flex-1 flex-col px-6 py-8 sm:px-12 lg:w-1/2 lg:px-16">
        <Link
          href="/"
          aria-label="Close"
          className="absolute right-6 top-6 flex h-9 w-9 items-center justify-center rounded-full text-gray-primary transition hover:bg-gray-100 hover:text-black-primary sm:right-10 sm:top-8"
        >
          <X size={20} />
        </Link>

        <div className="mx-auto flex w-full max-w-100 flex-1 flex-col justify-center gap-8 py-12">
          <div className="flex items-center gap-8 text-base font-medium">
            <Link
              href="/sign-up"
              className="text-gray-primary transition hover:text-black-primary"
            >
              Sign Up
            </Link>
            <div className="relative">
              <span className="text-black-primary">Sign In</span>
              <span className="absolute -bottom-2 left-0 h-0.5 w-full rounded-full bg-indigo-primary" />
            </div>
          </div>

          <button
            type="button"
            onClick={handleGoogle}
            disabled={loading}
            className="flex w-full items-center justify-center gap-3 rounded-full border border-gray-200 bg-white px-5 py-3 text-sm font-medium text-black-primary transition hover:bg-gray-50 disabled:opacity-60"
          >
            <Chrome size={18} className="text-indigo-primary" />
            Continue with Google
          </button>

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-gray-200" />
            <span className="text-xs text-gray-primary">or</span>
            <div className="h-px flex-1 bg-gray-200" />
          </div>

          <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
            <div className="flex flex-col gap-2">
              <label
                htmlFor="email"
                className="text-sm font-medium text-black-primary"
              >
                Email<span className="text-indigo-primary">*</span>
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Please enter your email"
                autoComplete="email"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                inputMode="email"
                className="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 text-base text-black-primary placeholder:text-gray-primary focus:border-indigo-primary focus:outline-none focus:ring-2 focus:ring-indigo-primary/20"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label
                htmlFor="password"
                className="text-sm font-medium text-black-primary"
              >
                Password<span className="text-indigo-primary">*</span>
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Please enter your password"
                  autoComplete="current-password"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  className="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 pr-11 text-base text-black-primary placeholder:text-gray-primary focus:border-indigo-primary focus:outline-none focus:ring-2 focus:ring-indigo-primary/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-gray-primary transition hover:text-black-primary"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <div className="flex justify-end">
                <Link
                  href="/forgot-password"
                  className="text-xs font-medium text-indigo-primary hover:opacity-80"
                >
                  Forgot Password?
                </Link>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-2 w-full rounded-full bg-indigo-primary px-5 py-3 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
            >
              {loading ? "Signing in…" : "Sign In"}
            </button>
          </form>

          <p className="text-center text-sm text-gray-primary">
            Don&apos;t have an account?{" "}
            <Link
              href="/sign-up"
              className="font-medium text-indigo-primary hover:opacity-80"
            >
              Sign Up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
