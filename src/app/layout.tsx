"use client";
import "./globals.css";
import React, { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { QueryProvider } from "@/providers/query-provider";
import Navbar from "@/components/navbar";
import Sidebar from "@/components/sidebar";
import AuthSync from "@/components/auth-sync";
import TourBootstrap from "@/components/tour-bootstrap";
import { useCurrentUser } from "@/lib/use-current-user";
import { Inter } from "next/font/google";
import { Toaster } from "react-hot-toast";

const inter = Inter({
  subsets: ["latin"],
  weight: ["100", "200", "300", "400", "500", "600", "700", "800", "900"],
  display: "swap",
});

const PUBLIC_PATHS = new Set([
  "/",
  "/sign-in",
  "/sign-up",
  "/check-email",
  "/forgot-password",
  "/reset-password",
  "/terms",
  "/privacy",
]);

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname();
  const { user, loading: authLoading } = useCurrentUser();
  // Strip dashboard chrome (sidebar/navbar) when the visitor is anonymous,
  // even if they land on an unknown URL that 404s. The middleware already
  // redirects unauthed users away from protected paths, but this is a
  // defense-in-depth so a logged-out viewer never sees app shell.
  const isPublicRoute =
    PUBLIC_PATHS.has(pathname) || (!authLoading && !user);

  // Sidebar state lifted here so the navbar can toggle it on mobile.
  // Keep the first render deterministic for SSR, then reconcile after mount.
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Open on desktop and keep closed on mobile after hydration, then update
  // again on route changes so the drawer doesn't linger across pages.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const shouldOpen = !window.matchMedia("(max-width: 1023px)").matches;
    const frame = window.requestAnimationFrame(() => {
      setSidebarOpen(shouldOpen);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pathname]);

  // Expose a global opener so the onboarding tour (running outside React)
  // can pop the mobile drawer before highlighting sidebar items.
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.__openSidebar = () => setSidebarOpen(true);
    window.__closeSidebar = () => setSidebarOpen(false);
    return () => {
      delete window.__openSidebar;
      delete window.__closeSidebar;
    };
  }, []);

  return (
    <html lang="en">
      <head>
        {/* iOS: prevent pinch-zoom drift after focusing inputs, and let the
            visual viewport resize when the on-screen keyboard appears so
            taps stay aligned with their boxes. */}
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover, interactive-widget=resizes-content"
        />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />

        {/* Branding: RealTrack logo as the favicon + link-preview image,
            replacing the default Next/Vercel mark. The favicon itself comes
            from src/app/icon.png (Next icon convention); these tags cover
            social/link previews (Open Graph + Twitter) and an explicit
            icon link as a belt-and-suspenders. */}
        <title>RealTrack</title>
        <meta
          name="description"
          content="RealTrack, study planning, flashcards, quizzes, and an AI study companion that reviews your answers."
        />
        <link rel="icon" href="/logo.png" type="image/png" />
        <link rel="apple-touch-icon" href="/logo.png" />
        <meta property="og:title" content="RealTrack" />
        <meta
          property="og:description"
          content="Study planning, flashcards, quizzes, and an AI study companion."
        />
        <meta property="og:image" content="/logo.png" />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content="RealTrack" />
        <meta
          name="twitter:description"
          content="Study planning, flashcards, quizzes, and an AI study companion."
        />
        <meta name="twitter:image" content="/logo.png" />
      </head>
      <body className={`${inter.className} antialiased relative`}>
        <AuthSync />
        <TourBootstrap />
        <Toaster />
        <QueryProvider>
          {isPublicRoute ? (
            children
          ) : (
            <div className="flex min-h-dvh relative">
              {/* Mobile backdrop, only renders + blocks taps when sidebar is open on small screens */}
              {sidebarOpen && (
                <div
                  className="lg:hidden fixed inset-0 bg-black/40 z-30"
                  onClick={() => setSidebarOpen(false)}
                  aria-hidden
                />
              )}
              <Sidebar
                isOpen={sidebarOpen}
                onToggle={() => setSidebarOpen((v) => !v)}
              />
              <div className="flex-1 flex flex-col min-w-0">
                <Navbar
                  className="w-full"
                  onToggleSidebar={() => setSidebarOpen((v) => !v)}
                />
                <main className="flex-1">{children}</main>
              </div>
            </div>
          )}
        </QueryProvider>
      </body>
    </html>
  );
}
