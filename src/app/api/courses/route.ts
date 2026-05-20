import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireUserId } from '@/lib/get-user-id'
import type { Database } from '@/types/database'

type CourseRow = Database['public']['Tables']['courses']['Row']
type CourseUpdate = Database['public']['Tables']['courses']['Update']

function encodeCourseTitle(title: string, payload: Record<string, unknown>) {
  return `${title}|||${JSON.stringify(payload)}`
}

function decodeCourseTitle(rawTitle: string) {
  const separator = rawTitle.indexOf('|||')
  if (separator === -1) return { title: rawTitle, payload: {} as Record<string, unknown> }

  const title = rawTitle.slice(0, separator)
  const encodedPayload = rawTitle.slice(separator + 3)

  try {
    const payload = JSON.parse(encodedPayload)
    return { title, payload: payload && typeof payload === 'object' ? payload : {} }
  } catch {
    return { title, payload: {} as Record<string, unknown> }
  }
}

export async function GET() {
  try {
    const auth = await requireUserId()
    if (auth.response) return auth.response
    const { userId } = auth

    const { data, error } = await supabaseAdmin
      .from('courses')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (error) {
      if (String(error.message).includes('created_at') || String(error.message).includes('schema cache')) {
        const { data: fallbackData, error: fallbackError } = await supabaseAdmin
          .from('courses')
          .select('*')
          .eq('user_id', userId)
        if (fallbackError) return NextResponse.json({ error: fallbackError.message }, { status: 500 })
        return NextResponse.json(
          (fallbackData ?? []).map((row) => {
            const decoded = decodeCourseTitle((row as { title: string }).title)
            return { ...row, title: decoded.title, course_payload: decoded.payload }
          }),
        )
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(
      (data ?? []).map((row) => {
        const decoded = decodeCourseTitle((row as { title: string }).title)
        return { ...row, title: decoded.title, course_payload: decoded.payload }
      }),
    )
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireUserId()
    if (auth.response) return auth.response
    const { userId } = auth

    const body = await req.json()
    const payload = {
      title: encodeCourseTitle(body.title, {
        courseDescription: body.description ?? null,
        credits: body.credits ?? 0,
        threshold: body.threshold ?? null,
        scheduleEntries: body.scheduleEntries ?? [],
        assessments: body.assessments ?? [],
        typeTracking: body.typeTracking ?? 'On Track',
        passingRequirement: body.passingRequirement ?? '',
        requirements: body.requirements ?? [],
      }),
    }
    const { data, error } = await supabaseAdmin
      .from('courses')
      .insert({ ...payload, user_id: userId })
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const row = data as CourseRow
    const decoded = decodeCourseTitle(row.title)
    return NextResponse.json({ ...row, title: decoded.title, course_payload: decoded.payload })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  try {
    const auth = await requireUserId()
    if (auth.response) return auth.response
    const { userId } = auth

    const body = await req.json()
    if (!body.id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const payload: CourseUpdate = {}
    if (body.title !== undefined) {
      payload.title = encodeCourseTitle(body.title, {
        courseDescription: body.description ?? null,
        credits: body.credits ?? 0,
        threshold: body.threshold ?? null,
        scheduleEntries: body.scheduleEntries ?? [],
        assessments: body.assessments ?? [],
        typeTracking: body.typeTracking ?? 'On Track',
        passingRequirement: body.passingRequirement ?? '',
        requirements: body.requirements ?? [],
      })
    }

    const { data, error } = await supabaseAdmin
      .from('courses')
      .update(payload)
      .eq('id', body.id)
      .eq('user_id', userId)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const row = data as CourseRow
    const decoded = decodeCourseTitle(row.title)
    return NextResponse.json({ ...row, title: decoded.title, course_payload: decoded.payload })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = await requireUserId()
    if (auth.response) return auth.response
    const { userId } = auth

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    const { error } = await supabaseAdmin
      .from('courses')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
