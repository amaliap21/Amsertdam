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
