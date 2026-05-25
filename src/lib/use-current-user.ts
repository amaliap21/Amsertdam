"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

export function useCurrentUser() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const supabase = createClient();

    (async () => {
      try {
        // getSession() reads from local storage / cookies and resolves fast
        // (no network call). getUser() would round-trip to validate the JWT,
        // adding 100-300ms, skip it on first paint and rely on onAuthStateChange
        // for any subsequent invalidation.
        const { data: sessionData } = await supabase.auth.getSession();
        if (active) setUser(sessionData.session?.user ?? null);
      } catch {
        if (active) setUser(null);
      } finally {
        if (active) setLoading(false);
      }
    })();

    // Keep `user` in sync with auth state changes (sign-in / sign-out).
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setUser(session?.user ?? null);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { user, loading };
}
