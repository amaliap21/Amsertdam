import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getUserId } from "@/lib/get-user-id";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabaseAdmin as any;

// POST /api/social/sessions/join { session_id } — toggle join/leave (respects capacity).
export async function POST(req: Request) {
  try {
    const userId = await getUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { session_id } = await req.json();
    if (!session_id || typeof session_id !== "string") {
      return NextResponse.json({ error: "Missing session_id" }, { status: 400 });
    }

    const { data: existing } = await db
      .from("session_participants")
      .select("session_id")
      .eq("session_id", session_id)
      .eq("user_id", userId)
      .maybeSingle();

    if (existing) {
      const { error } = await db.from("session_participants").delete().eq("session_id", session_id).eq("user_id", userId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ joined: false });
    }

    // Capacity check before joining.
    const { data: session } = await db
      .from("study_sessions")
      .select("capacity, participant_count")
      .eq("id", session_id)
      .single();
    if (session && Number(session.participant_count) >= Number(session.capacity)) {
      return NextResponse.json({ error: "This session is full" }, { status: 409 });
    }

    const { error } = await db.from("session_participants").insert({ session_id, user_id: userId });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ joined: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
