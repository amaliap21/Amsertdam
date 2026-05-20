"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createTour, isTourCompleted } from "@/lib/tour";

declare global {
  interface Window {
    __startTour?: () => void;
    __openSidebar?: () => void;
    __closeSidebar?: () => void;
  }
}

/**
 * Onboarding tour bootstrapper.
 *
 * - Auto-starts the tour the first time a logged-in user lands on /dashboard
 *   (tracked in localStorage under "realtrack-tour-status").
 * - Exposes a global `window.__startTour()` so the navbar `?` button can
 *   restart the tour without re-importing Shepherd everywhere.
 */
export default function TourBootstrap() {
  const router = useRouter();
  const pathname = usePathname();
  const autoStartedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    // Manual trigger from the navbar button.
    window.__startTour = async () => {
      const tour = await createTour(router);
      if (cancelled) return;
      tour.start();
    };

    // Auto-start once on first /dashboard visit for new users.
    if (
      !autoStartedRef.current &&
      pathname === "/dashboard" &&
      !isTourCompleted()
    ) {
      autoStartedRef.current = true;
      (async () => {
        const tour = await createTour(router);
        if (cancelled) return;
        // Small delay so the dashboard finishes its first paint before the
        // overlay drops in.
        setTimeout(() => tour.start(), 350);
      })();
    }

    return () => {
      cancelled = true;
      delete window.__startTour;
    };
  }, [pathname, router]);

  return null;
}
