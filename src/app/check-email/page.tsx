"use client";

import Link from "next/link";
import Image from "next/image";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Mail, X } from "lucide-react";

export default function CheckEmailPage() {
  return (
    <Suspense fallback={<Shell />}>
      <CheckEmailInner />
    </Suspense>
  );
}

function CheckEmailInner() {
  const params = useSearchParams();
  const email = params.get("email") ?? "";
  return <Shell email={email} />;
}

function Shell({ email }: { email?: string }) {
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

        <div className="mx-auto flex w-full max-w-100 flex-1 flex-col justify-center gap-6 py-12 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-indigo-primary/10 text-indigo-primary">
            <Mail size={28} />
          </div>
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-semibold text-black-primary">
              Verify your email
            </h1>
            <p className="text-sm text-gray-primary">
              We&apos;ve sent a verification link to{" "}
              {email ? (
                <span className="font-medium text-black-primary">{email}</span>
              ) : (
                "your inbox"
              )}
              . Click it to activate your account.
            </p>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-left text-xs text-amber-900">
              <p className="font-medium">Can&apos;t find the email?</p>
              <ol className="mt-1 list-decimal space-y-1 pl-4">
                <li>Check your <strong>Spam</strong> or <strong>Promotions</strong> folder.</li>
                <li>
                  If it&apos;s there, mark it <strong>Not spam</strong> — next
                  emails from RealTrack will arrive in your inbox.
                </li>
                <li>Wait 1–2 minutes — delivery can be slow.</li>
                <li>The sender is <code>amsertdam@resend.dev</code>.</li>
              </ol>
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <Link
              href="/sign-in"
              className="w-full rounded-full bg-indigo-primary px-5 py-3 text-sm font-medium text-white transition hover:opacity-90"
            >
              Back to Sign In
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
