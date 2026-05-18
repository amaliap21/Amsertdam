import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getUserId } from '@/lib/get-user-id'

type TaskPayload = {
  course?: string
  date?: string
  estimatedHours?: number | null
  priority?: string
  description?: string
  effort?: string
}

function encodeTitle(title: string, payload: TaskPayload) {
  return `${title}|||${JSON.stringify(payload)}`
}

function decodeTitle(rawTitle: string): { title: string; payload: TaskPayload } {
  if (typeof rawTitle !== 'string') return { title: '', payload: {} }
  const sep = rawTitle.indexOf('|||')
  if (sep === -1) return { title: rawTitle, payload: {} }
  const title = rawTitle.slice(0, sep)
  const tail = rawTitle.slice(sep + 3)
  try {
    const parsed = JSON.parse(tail)
    return { title, payload: parsed && typeof parsed === 'object' ? parsed : {} }
  } catch {
    return { title, payload: {} }
  }
}

function hoursToDisplay(h: unknown): string {
  if (typeof h !== 'number' || !Number.isFinite(h)) return '—'
  return `${h}h`
}

function shapeForClient(row: Record<string, unknown>) {
  const rawTitle = typeof row.title === 'string' ? row.title : ''
  const { title, payload } = decodeTitle(rawTitle)
  return {
    id: row.id as string,
    title,
    course: payload.course ?? (typeof row.course === 'string' ? row.course : 'General'),
    date: payload.date ?? (row.date != null ? String(row.date) : '—'),
    timeEstimate:
      payload.estimatedHours != null
        ? hoursToDisplay(payload.estimatedHours)
        : row.estimated_hours != null
          ? hoursToDisplay(row.estimated_hours)
          : '—',
    priority:
      payload.priority ??
      (typeof row.priority === 'string' ? row.priority : 'If You Have Energy'),
    description:
      payload.description ?? (typeof row.description === 'string' ? row.description : ''),
    effort: payload.effort ?? (typeof row.effort === 'string' ? row.effort : 'medium effort'),
  }
}

export async function GET() {
  try {
    const userId = await getUserId()
    let query = supabaseAdmin.from('tasks').select('*').order('created_at', { ascending: false })
    if (userId) query = query.eq('user_id', userId)
    const { data, error } = await query

    if (error) {
      if (
        String(error.message).includes('created_at') ||
        String(error.message).includes('schema cache')
      ) {
        let q2 = supabaseAdmin.from('tasks').select('*')
        if (userId) q2 = q2.eq('user_id', userId)
        const { data: d2, error: e2 } = await q2
        if (e2) return NextResponse.json({ error: e2.message }, { status: 500 })
        return NextResponse.json((d2 ?? []).map(shapeForClient))
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json((data ?? []).map(shapeForClient))
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    if (!body.title) {
      return NextResponse.json({ error: 'Missing title' }, { status: 400 })
    }

    const payload: TaskPayload = {
      course: body.course,
      date: body.date,
      estimatedHours:
        body.estimatedHours == null ? null : Number(body.estimatedHours),
      priority: body.priority,
      description: body.description,
      effort: body.effort,
    }

    const userId = await getUserId()
    const { data, error } = await supabaseAdmin
      .from('tasks')
      .insert({ title: encodeTitle(String(body.title), payload), ...(userId ? { user_id: userId } : {}) })
      .select()
      .single()

    if (error) {
      if (String(error.message).includes('schema cache')) {
        return NextResponse.json(
          {
            error:
              'Supabase schema cache needs refresh. Go to your Supabase project Settings → API → Schema and click "Refresh schema cache"',
            details: error.message,
          },
          { status: 500 },
        )
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(shapeForClient(data as Record<string, unknown>))
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    const userId = await getUserId()
    let del = supabaseAdmin.from('tasks').delete().eq('id', id)
    if (userId) del = del.eq('user_id', userId)
    const { error } = await del
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  try {
    const userId = await getUserId()
    const body = await req.json()
    if (!body.id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    let readQ = supabaseAdmin.from('tasks').select('*').eq('id', body.id)
    if (userId) readQ = readQ.eq('user_id', userId)
    const { data: existing, error: readErr } = await readQ.single()
    if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 })

    const { title: currentTitle, payload: currentPayload } = decodeTitle(
      (existing as { title?: string })?.title ?? '',
    )

    const nextPayload: TaskPayload = { ...currentPayload }
    if (body.course !== undefined) nextPayload.course = body.course
    if (body.date !== undefined) nextPayload.date = body.date
    if (body.estimatedHours !== undefined) nextPayload.estimatedHours = body.estimatedHours
    if (body.priority !== undefined) nextPayload.priority = body.priority
    if (body.description !== undefined) nextPayload.description = body.description
    if (body.effort !== undefined) nextPayload.effort = body.effort

    const nextTitle = body.title !== undefined ? String(body.title) : currentTitle

    let upQ = supabaseAdmin
      .from('tasks')
      .update({ title: encodeTitle(nextTitle, nextPayload) })
      .eq('id', body.id)
    if (userId) upQ = upQ.eq('user_id', userId)
    const { data, error } = await upQ.select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(shapeForClient(data as Record<string, unknown>))
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
