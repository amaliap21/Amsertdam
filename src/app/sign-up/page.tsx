"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Chrome, Eye, EyeOff, X } from "lucide-react";
import Image from "next/image";
import toast from "react-hot-toast";
import { createClient } from "@/lib/supabase/client";

// Basic shape check (matches the server's regex). Real validation still
// happens in the API route; this only stops obviously bad addresses from
// triggering a network round-trip.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function SignUpPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Read from the form DOM (handles autofill that skips React's
    // onChange). Falls back to React state if a name attribute is missing.
    const fd = new FormData(e.currentTarget);
    const submittedEmail = String(fd.get("email") ?? email).trim();
    const submittedPassword = String(fd.get("password") ?? password);
    const submittedConfirm = String(
      fd.get("confirm-password") ?? confirmPassword,
    );
    if (!EMAIL_RE.test(submittedEmail)) {
      toast.error("Please enter a valid email address");
      return;
    }
    if (submittedPassword !== submittedConfirm) {
      toast.error("Passwords do not match");
      return;
    }
    if (submittedPassword.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (!agreed) {
      toast.error("You must accept the Terms and Privacy Policy");
      return;
    }
    setLoading(true);
    try {
      // Email confirmation flow: the server creates the account WITHOUT
      // auto-confirming and Supabase emails a verification link. We do NOT
      // sign the user in here — they have to click the email link first,
      // which lands them on /auth/callback and from there /dashboard.
      const resp = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: submittedEmail,
          password: submittedPassword,
          agreedToTerms: true,
          origin: window.location.origin,
        }),
      });
      const body = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(body.error || `Sign-up failed (${resp.status})`);
      }

      toast.success("Check your email to verify your account");
      router.push(`/check-email?email=${encodeURIComponent(submittedEmail)}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign up failed");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setLoading(true);
    try {
      // Flag the onboarding tour before redirecting through Google.
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
          sizes="(min-width: 1024px) 38vw, 100vw"
          priority
        />
      </div>

      <div className="relative flex w-full flex-1 flex-col px-6 py-8 sm:px-12 lg:w-[38%] lg:px-16">
        <Link
          href="/"
          aria-label="Close"
          className="absolute right-6 top-6 flex h-9 w-9 items-center justify-center rounded-full text-gray-primary transition hover:bg-gray-100 hover:text-black-primary sm:right-10 sm:top-8"
        >
          <X size={20} />
        </Link>

        <div className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center gap-8 py-12">
          <div className="flex items-center gap-8 text-base font-medium">
            <div className="relative">
              <span className="text-black-primary">Sign Up</span>
              <span className="absolute -bottom-2 left-0 h-[2px] w-full rounded-full bg-indigo-primary" />
            </div>
            <Link
              href="/sign-in"
              className="text-gray-primary transition hover:text-black-primary"
            >
              Sign In
            </Link>
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
                name="email"
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
                  name="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Please enter your password"
                  autoComplete="new-password"
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
            </div>

            <div className="flex flex-col gap-2">
              <label
                htmlFor="confirm-password"
                className="text-sm font-medium text-black-primary"
              >
                Confirm Password<span className="text-indigo-primary">*</span>
              </label>
              <div className="relative">
                <input
                  id="confirm-password"
                  name="confirm-password"
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Please confirm your password"
                  autoComplete="new-password"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  className="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 pr-11 text-base text-black-primary placeholder:text-gray-primary focus:border-indigo-primary focus:outline-none focus:ring-2 focus:ring-indigo-primary/20"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  aria-label={
                    showConfirmPassword ? "Hide password" : "Show password"
                  }
                  className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-gray-primary transition hover:text-black-primary"
                >
                  {showConfirmPassword ? (
                    <EyeOff size={18} />
                  ) : (
                    <Eye size={18} />
                  )}
                </button>
              </div>
            </div>

            <p className="-mt-2 text-xs text-gray-primary">
              At least 8 characters.
            </p>

            <label className="flex items-start gap-2 text-sm text-gray-primary">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-indigo-primary"
              />
              <span>
                I have read and agree to the{" "}
                <Link
                  href="/terms"
                  target="_blank"
                  className="font-medium text-indigo-primary hover:underline"
                >
                  Terms of Service
                </Link>{" "}
                and{" "}
                <Link
                  href="/privacy"
                  target="_blank"
                  className="font-medium text-indigo-primary hover:underline"
                >
                  Privacy Policy
                </Link>
                . I understand my email is collected for account access and
                will not be sold.
              </span>
            </label>

            <button
              type="submit"
              disabled={loading || !agreed}
              className="mt-2 w-full rounded-full bg-indigo-primary px-5 py-3 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? "Signing up…" : "Sign Up"}
            </button>
          </form>

          <p className="text-center text-sm text-gray-primary">
            Already have an account?{" "}
            <Link
              href="/sign-in"
              className="font-medium text-indigo-primary hover:opacity-80"
            >
              Sign In
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
