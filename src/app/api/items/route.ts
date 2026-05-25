import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireUserId } from '@/lib/get-user-id'

export async function GET() {
  const auth = await requireUserId()
  if (auth.response) return auth.response
  const { userId } = auth

  const { data, error } = await supabaseAdmin
    .from('items')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: Request) {
  try {
    const auth = await requireUserId()
    if (auth.response) return auth.response
    const { userId } = auth

    const body = await req.json()

    // Verify the assessment belongs to the authenticated user
    if (body.assessment_id) {
      const { data: assessment } = await supabaseAdmin
        .from('assessments')
        .select('id')
        .eq('id', body.assessment_id)
        .eq('user_id', userId)
        .single()
      if (!assessment) {
        return NextResponse.json({ error: 'Assessment not found or not owned by you' }, { status: 403 })
      }
    }

    const payload = { title: body.title, description: body.description ?? null, assessment_id: body.assessment_id, user_id: userId }
    const { data, error } = await supabaseAdmin.from('items').insert(payload).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
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
      .from('items')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
