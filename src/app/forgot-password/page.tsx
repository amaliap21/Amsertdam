"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { X, Mail } from "lucide-react";
import toast from "react-hot-toast";
import { createClient } from "@/lib/supabase/client";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!EMAIL_RE.test(email.trim())) {
      toast.error("Please enter a valid email address");
      return;
    }
    setLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      // Always show success even on lookup-failure to avoid leaking which
      // emails are registered. Supabase silently no-ops for unknown emails
      // when the project's "Confirm email" setting is on.
      if (error) {
        console.error("forgot-password:", error.message);
      }
      setSent(true);
      toast.success("If that email is registered, a reset link is on its way");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send reset email");
    } finally {
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
          href="/sign-in"
          aria-label="Close"
          className="absolute right-6 top-6 flex h-9 w-9 items-center justify-center rounded-full text-gray-primary transition hover:bg-gray-100 hover:text-black-primary sm:right-10 sm:top-8"
        >
          <X size={20} />
        </Link>

        <div className="mx-auto flex w-full max-w-100 flex-1 flex-col justify-center gap-6 py-12">
          {sent ? (
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-indigo-primary/10 text-indigo-primary">
                <Mail size={28} />
              </div>
              <h1 className="text-2xl font-semibold text-black-primary">
                Check your email
              </h1>
              <p className="text-sm text-gray-primary">
                If an account exists for{" "}
                <span className="font-medium text-black-primary">{email}</span>,
                we&apos;ve sent a password reset link. The link expires in 1
                hour.
              </p>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-left text-xs text-amber-900">
                <p className="font-medium">Don&apos;t see it?</p>
                <ol className="mt-1 list-decimal space-y-1 pl-4">
                  <li>Check <strong>Spam</strong> / <strong>Promotions</strong>.</li>
                  <li>If it&apos;s there, mark <strong>Not spam</strong> so the next one reaches your inbox.</li>
                  <li>Sender is <code>amsertdam@resend.dev</code>.</li>
                </ol>
              </div>
              <Link
                href="/sign-in"
                className="mt-2 w-full rounded-full bg-indigo-primary px-5 py-3 text-center text-sm font-medium text-white transition hover:opacity-90"
              >
                Back to Sign In
              </Link>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-2">
                <h1 className="text-2xl font-semibold text-black-primary">
                  Forgot password?
                </h1>
                <p className="text-sm text-gray-primary">
                  Enter the email you signed up with. We&apos;ll send a link to
                  reset your password.
                </p>
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
                    placeholder="you@example.com"
                    className="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-black-primary placeholder:text-gray-primary focus:border-indigo-primary focus:outline-none focus:ring-2 focus:ring-indigo-primary/20"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-full bg-indigo-primary px-5 py-3 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
                >
                  {loading ? "Sending…" : "Send reset link"}
                </button>
              </form>

              <p className="text-center text-sm text-gray-primary">
                Remembered it?{" "}
                <Link
                  href="/sign-in"
                  className="font-medium text-indigo-primary hover:opacity-80"
                >
                  Back to Sign In
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
