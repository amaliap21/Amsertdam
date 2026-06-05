import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getUserId } from "@/lib/get-user-id";
import { getMutualIds } from "@/lib/social";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabaseAdmin as any;

// GET /api/social/sessions — upcoming "study with me/us" sessions with host + join state.
export async function GET() {
  try {
    const userId = await getUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: sessions, error } = await db
      .from("study_sessions")
      .select("id, host_id, title, course, description, scheduled_at, meet_url, capacity, participant_count, status, audience, created_at")
      .order("scheduled_at", { ascending: true, nullsFirst: false })
      .limit(80);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Mutuals-only sessions are visible to the host and the host's mutuals.
    const mutuals = await getMutualIds(db, userId);
    const list = (sessions ?? []).filter(
      (s: { audience?: string; host_id: string }) =>
        s.audience !== "mutuals" || s.host_id === userId || mutuals.has(s.host_id),
    );
    const hostIds = [...new Set(list.map((s: { host_id: string }) => s.host_id))];
    const ids = list.map((s: { id: string }) => s.id);

    const { data: hosts } = hostIds.length
      ? await db.from("profiles").select("id, full_name, avatar_url, rating_avg, is_tutor").in("id", hostIds)
      : { data: [] };
    const hostMap = new Map((hosts ?? []).map((p: { id: string }) => [p.id, p]));

    const { data: myJoins } = ids.length
      ? await db.from("session_participants").select("session_id").eq("user_id", userId).in("session_id", ids)
      : { data: [] };
    const joinedSet = new Set((myJoins ?? []).map((j: { session_id: string }) => j.session_id));

    const enriched = list.map((s: Record<string, unknown>) => ({
      ...s,
      host: hostMap.get(s.host_id as string) ?? null,
      joined: joinedSet.has(s.id as string),
      is_host: s.host_id === userId,
    }));

    return NextResponse.json({ sessions: enriched });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// POST /api/social/sessions — host a session. Defaults to a fresh Google Meet room.
export async function POST(req: Request) {
  try {
    const userId = await getUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    const title = String(body.title ?? "").trim();
    if (title.length < 3) return NextResponse.json({ error: "Title is too short" }, { status: 400 });

    // The host brings their own room — we don't auto-generate a link (meet.new
    // would hand every joiner a *different* room). Require a real, shareable URL.
    const meetUrl = String(body.meet_url ?? "").trim();
    if (!/^https?:\/\/.+/i.test(meetUrl)) {
      return NextResponse.json({ error: "Add your meeting link (Google Meet, Zoom, etc.)" }, { status: 400 });
    }

    // Audience rule: a public ("go global") host can only run GLOBAL sessions.
    // A private host may choose 'mutuals' (default) or 'global'.
    const { data: me } = await db.from("profiles").select("is_public").eq("id", userId).maybeSingle();
    const isPublic = me?.is_public !== false;
    const requested = body.audience === "mutuals" ? "mutuals" : "global";
    const audience = isPublic ? "global" : requested;

    const capacity = Math.max(2, Math.min(50, Number(body.capacity) || 8));
    const row = {
      host_id: userId,
      title: title.slice(0, 160),
      course: body.course ? String(body.course).slice(0, 120) : null,
      description: body.description ? String(body.description).slice(0, 1000) : null,
      scheduled_at: body.scheduled_at ? new Date(body.scheduled_at).toISOString() : null,
      meet_url: meetUrl.slice(0, 500),
      capacity,
      audience,
    };
    const { data, error } = await db.from("study_sessions").insert(row).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Host auto-joins their own session.
    await db.from("session_participants").insert({ session_id: data.id, user_id: userId });
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
