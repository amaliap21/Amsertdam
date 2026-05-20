"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { X, Eye, EyeOff } from "lucide-react";
import toast from "react-hot-toast";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // When the user clicks the reset link in their email, Supabase JS picks
  // up the recovery session automatically. Wait for that PASSWORD_RECOVERY
  // (or existing session) before showing the form, so we don't try to
  // updateUser without an auth context.
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) {
        setReady(true);
      }
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) {
        setReady(true);
        setError(null);
      }
    });
    // If after 3 seconds we still have no session, the link was probably
    // invalid or expired.
    const timer = setTimeout(() => {
      if (!cancelled && !ready) {
        setError(
          "This reset link is invalid or has expired. Request a new one from the Forgot password page.",
        );
      }
    }, 3000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      sub.subscription.unsubscribe();
    };
  }, [ready]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      const supabase = createClient();
      const { error: upErr } = await supabase.auth.updateUser({ password });
      if (upErr) throw upErr;
      toast.success("Password updated. Please sign in.");
      // Sign the recovery session out so the next sign-in is clean.
      await supabase.auth.signOut().catch(() => undefined);
      router.push("/sign-in");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update password",
      );
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
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-semibold text-black-primary">
              Set a new password
            </h1>
            <p className="text-sm text-gray-primary">
              Choose a password you haven&apos;t used here before. At least 8
              characters.
            </p>
          </div>

          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
              <div className="mt-3">
                <Link
                  href="/forgot-password"
                  className="font-medium text-indigo-primary hover:underline"
                >
                  Request a new link
                </Link>
              </div>
            </div>
          ) : !ready ? (
            <p className="text-sm text-gray-primary">Verifying your reset link…</p>
          ) : (
            <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
              <div className="flex flex-col gap-2">
                <label
                  htmlFor="password"
                  className="text-sm font-medium text-black-primary"
                >
                  New password<span className="text-indigo-primary">*</span>
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 pr-11 text-sm text-black-primary focus:border-indigo-primary focus:outline-none focus:ring-2 focus:ring-indigo-primary/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-gray-primary"
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
                  Confirm new password
                  <span className="text-indigo-primary">*</span>
                </label>
                <div className="relative">
                  <input
                    id="confirm-password"
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 pr-11 text-sm text-black-primary focus:border-indigo-primary focus:outline-none focus:ring-2 focus:ring-indigo-primary/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((v) => !v)}
                    aria-label={
                      showConfirmPassword ? "Hide password" : "Show password"
                    }
                    className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-gray-primary"
                  >
                    {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="mt-2 w-full rounded-full bg-indigo-primary px-5 py-3 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
              >
                {loading ? "Updating…" : "Update password"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
