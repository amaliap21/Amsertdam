"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

const STORAGE_KEY = "realtrack-storage";
const LAST_USER_KEY = "realtrack-last-user-id";

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
        const { data } = await supabase.auth.getUser();
        const currentId = data.user?.id ?? null;
        const lastId = localStorage.getItem(LAST_USER_KEY);
        if (currentId !== lastId) {
          localStorage.removeItem(STORAGE_KEY);
          if (currentId) localStorage.setItem(LAST_USER_KEY, currentId);
          else localStorage.removeItem(LAST_USER_KEY);
          // Hard reload so the in-memory Zustand state is rebuilt from a
          // blank persisted slot (rather than re-using whatever was already
          // loaded into memory before the reconcile).
          if (lastId !== null) window.location.reload();
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

      if (event === "SIGNED_IN" && currentId !== lastId) {
        localStorage.removeItem(STORAGE_KEY);
        if (currentId) localStorage.setItem(LAST_USER_KEY, currentId);
        // Reload so the new user starts from a clean store.
        window.location.reload();
      }
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  return null;
}
