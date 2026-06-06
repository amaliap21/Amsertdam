import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireUserId } from '@/lib/get-user-id'

export async function GET() {
  try {
    const auth = await requireUserId()
    if (auth.response) return auth.response
    const { userId } = auth

    const { data, error } = await supabaseAdmin
      .from('quizzes')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
    if (error) {
      if (String(error.message).includes('created_at')) {
        const { data: d2, error: e2 } = await supabaseAdmin
          .from('quizzes')
          .select('*')
          .eq('user_id', userId)
        if (e2) return NextResponse.json({ error: e2.message }, { status: 500 })
        return NextResponse.json(d2)
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json(data)
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
      title: body.title,
      course: body.course ?? null,
      source: body.source ?? null,
      questions: body.questions ?? null,
      image_url: body.imageDataUrl ?? body.image_url ?? null,
      image_regions: body.imageRegions ?? body.image_regions ?? null,
      generated_basic: body.basic ?? body.generated_basic ?? false,
      user_id: userId,
    }
    const { data, error } = await supabaseAdmin.from('quizzes').insert(payload).select().single()
    if (error) {
      // If migrations 019/020/021 (image_url, image_regions, generated_basic)
      // aren't applied yet, retry with only the core columns so quizzes still save.
      if (/image_url|image_regions|generated_basic|column|schema cache/i.test(String(error.message))) {
        const rest = {
          title: payload.title,
          course: payload.course,
          source: payload.source,
          questions: payload.questions,
          user_id: payload.user_id,
        }
        const retry = await supabaseAdmin.from('quizzes').insert(rest).select().single()
        if (retry.error) return NextResponse.json({ error: retry.error.message }, { status: 500 })
        return NextResponse.json(retry.data)
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
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
      .from('quizzes')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
