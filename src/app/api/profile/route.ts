import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getUserId } from '@/lib/get-user-id'
import { createClient } from '@/lib/supabase/server'

// profiles table isn't in the generated Database type, so cast queries.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabaseAdmin as any

export async function GET() {
  try {
    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await db
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (error && error.code === 'PGRST116') {
      // No profile row yet, auto-create from auth metadata.
      const supabase = await createClient()
      const { data: { user } } = await supabase.auth.getUser()
      const meta = user?.user_metadata ?? {}

      const newProfile = {
        id: userId,
        full_name: meta.full_name ?? meta.name ?? user?.email?.split('@')[0] ?? '',
        avatar_url: meta.avatar_url ?? meta.picture ?? null,
        major: null,
        semester: null,
      }
      const { data: created, error: insertErr } = await db
        .from('profiles')
        .insert(newProfile)
        .select()
        .single()
      if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })
      return NextResponse.json(created)
    }

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  try {
    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const updates: Record<string, unknown> = {}
    if (body.full_name !== undefined) updates.full_name = body.full_name
    if (body.major !== undefined) updates.major = body.major
    if (body.semester !== undefined) updates.semester = body.semester
    if (body.avatar_url !== undefined) updates.avatar_url = body.avatar_url
    if (body.country !== undefined) updates.country = body.country ? String(body.country).slice(0, 60) : null
    // Community fields: interests (matching tags) + privacy ("go global").
    if (Array.isArray(body.interests)) {
      updates.interests = body.interests.slice(0, 20).map((t: unknown) => String(t).slice(0, 40))
    }
    if (body.is_public !== undefined) updates.is_public = !!body.is_public

    const { data, error } = await db
      .from('profiles')
      .update(updates)
      .eq('id', userId)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Also sync full_name to auth metadata so navbar picks it up immediately.
    if (body.full_name !== undefined) {
      const supabase = await createClient()
      await supabase.auth.updateUser({ data: { full_name: body.full_name } })
    }

    return NextResponse.json(data)
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
