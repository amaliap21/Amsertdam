import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** Read the logged-in user's ID from session cookies. Returns null when not authenticated. */
export async function getUserId(): Promise<string | null> {
  try {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()
    return session?.user?.id ?? null
  } catch {
    return null
  }
}

/**
 * Require an authenticated user. Returns `{ userId }` on success, or
 * `{ response }` (a 401) when no session is present.
 *
 * Every API route that touches user-scoped data MUST use this, falling
 * through to unfiltered queries when `userId` is null was the root cause
 * of the cross-account data leak.
 */
export async function requireUserId(): Promise<
  { userId: string; response?: never } | { userId?: never; response: NextResponse }
> {
  const userId = await getUserId()
  if (!userId) {
    return {
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    }
  }
  return { userId }
}
