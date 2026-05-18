import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getUserId } from '@/lib/get-user-id'

export async function GET() {
  try {
    const userId = await getUserId()
    let query = supabaseAdmin.from('flashcard_decks').select('*').order('created_at', { ascending: false })
    if (userId) query = query.eq('user_id', userId)
    const { data, error } = await query
    if (error) {
      if (String(error.message).includes('created_at')) {
        let q2 = supabaseAdmin.from('flashcard_decks').select('*')
        if (userId) q2 = q2.eq('user_id', userId)
        const { data: d2, error: e2 } = await q2
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
    const body = await req.json()
    const payload = {
      title: body.title,
      description: body.description ?? null,
      card_count: Array.isArray(body.cards) ? body.cards.length : body.card_count ?? 0,
      cards: body.cards ?? null,
    }
    const userId = await getUserId()
    const { data, error } = await supabaseAdmin.from('flashcard_decks').insert({ ...payload, ...(userId ? { user_id: userId } : {}) }).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
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
    let del = supabaseAdmin.from('flashcard_decks').delete().eq('id', id)
    if (userId) del = del.eq('user_id', userId)
    const { error } = await del
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
