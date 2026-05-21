"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

const STORAGE_KEY = "realtrack-storage";
const LAST_USER_KEY = "realtrack-last-user-id";
const RELOAD_GUARD_KEY = "realtrack-auth-sync-last-reload";
// Don't reload more than once per this window — protects against
// Supabase emitting back-to-back SIGNED_IN events on token refresh,
// which would otherwise put the tab in an infinite refresh loop.
const RELOAD_MIN_INTERVAL_MS = 30_000;

/** True iff we have NOT reloaded within the throttle window. */
function canReload(): boolean {
  try {
    const raw = sessionStorage.getItem(RELOAD_GUARD_KEY);
    if (!raw) return true;
    const last = Number(raw);
    if (!Number.isFinite(last)) return true;
    return Date.now() - last > RELOAD_MIN_INTERVAL_MS;
  } catch {
    return true;
  }
}

function markReloaded(): void {
  try {
    sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

/**
 * Wipe the persisted Zustand store and reload when the signed-in user
 * identity changes (sign-out, switch accounts, or session expired and
 * a different user signed in).
 *
 * Without this, user A's cached tasks/decks/quizzes/courses stay in
 * localStorage and get rehydrated on user B's first paint before the
 * API calls return fresh data, the visible "data leak" the user
 * reported.
 */
export default function AuthSync() {
  const ranOnce = useRef(false);

  useEffect(() => {
    if (ranOnce.current) return;
    ranOnce.current = true;

    const supabase = createClient();

    // 1. Reconcile on mount: if the stored last-user-id doesn't match the
    //    current session, the previous user's persisted data is stale.
    (async () => {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (error) {
          // "Invalid Refresh Token: Refresh Token Not Found" lands here.
          // Treat as signed-out and clear the stale session so the SDK
          // stops re-attempting the refresh on every page load.
          const msg = String(error.message ?? "");
          if (/refresh token|invalid|jwt/i.test(msg)) {
            await supabase.auth
              .signOut({ scope: "local" })
              .catch(() => undefined);
            localStorage.removeItem(STORAGE_KEY);
            localStorage.removeItem(LAST_USER_KEY);
          }
          return;
        }
        const currentId = data.user?.id ?? null;
        const lastId = localStorage.getItem(LAST_USER_KEY);
        if (currentId !== lastId) {
          localStorage.removeItem(STORAGE_KEY);
          if (currentId) localStorage.setItem(LAST_USER_KEY, currentId);
          else localStorage.removeItem(LAST_USER_KEY);
          // Hard reload so the in-memory Zustand state is rebuilt from a
          // blank persisted slot. Throttled, so a Supabase quirk that
          // re-fires this branch can never trap the user in a loop.
          if (lastId !== null && canReload()) {
            markReloaded();
            window.location.reload();
          }
        }
      } catch {
        // If auth lookup fails, leave state alone, we'd rather show stale
        // data briefly than wipe an authenticated user's cache on a
        // transient network error.
      }
    })();

    // 2. Listen for live auth changes (sign-in, sign-out, token refresh
    //    that swaps the user).
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      const currentId = session?.user?.id ?? null;
      const lastId = localStorage.getItem(LAST_USER_KEY);

      if (event === "SIGNED_OUT") {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(LAST_USER_KEY);
        return;
      }

      // Only act on REAL sign-ins with a known user. SIGNED_IN with a
      // null session, or with the same user we already have, should be
      // a no-op — those are token-refresh / re-emitted events that used
      // to put the tab into a refresh loop.
      if (
        event === "SIGNED_IN" &&
        currentId &&
        currentId !== lastId
      ) {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.setItem(LAST_USER_KEY, currentId);
        // Only reload when SWITCHING accounts (lastId was a different
        // real user). On a fresh sign-in (lastId === null) there's no
        // stale data to wipe, and reloading here races with the
        // /sign-in page's `router.push("/dashboard")` — the reload
        // kills the in-flight navigation and the user lands back on
        // /sign-in, having to click "Sign In" a second time.
        if (lastId !== null && canReload()) {
          markReloaded();
          window.location.reload();
        }
      }
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  return null;
}
