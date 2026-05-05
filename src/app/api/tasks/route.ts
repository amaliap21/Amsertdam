import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin.from('tasks').select('*').order('created_at', { ascending: false })
    if (error) {
      // If the column doesn't exist (migration not applied), retry without ordering
      if (String(error.message).includes('created_at')) {
        const { data: d2, error: e2 } = await supabaseAdmin.from('tasks').select('*')
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
    if (!body.title) return NextResponse.json({ error: 'Missing title' }, { status: 400 })
    
    // Known Supabase issue: schema cache may be stale. Try inserting minimal record first.
    const { data, error } = await supabaseAdmin
      .from('tasks')
      .insert({ title: body.title })
      .select()
      .single()
    
    if (error && String(error.message).includes('schema cache')) {
      return NextResponse.json({ 
        error: 'Supabase schema cache needs refresh. Go to your Supabase project Settings → API → Schema and click "Refresh schema cache"',
        details: error.message 
      }, { status: 500 })
    }
    
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
    const { error } = await supabaseAdmin.from('tasks').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json()
    if (!body.id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    const updates: Record<string, unknown> = {}
    if (body.title !== undefined) updates.title = body.title
    if (body.course !== undefined) updates.course = body.course
    if (body.date !== undefined) updates.date = body.date ? new Date(body.date) : null
    if (body.estimatedHours !== undefined) updates.estimated_hours = body.estimatedHours
    if (body.priority !== undefined) updates.priority = body.priority
    if (body.description !== undefined) updates.description = body.description
    if (body.effort !== undefined) updates.effort = body.effort

    const { data, error } = await supabaseAdmin.from('tasks').update(updates).eq('id', body.id).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
