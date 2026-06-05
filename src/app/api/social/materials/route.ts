import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getUserId } from "@/lib/get-user-id";
import { getMutualIds } from "@/lib/social";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabaseAdmin as any;

// GET — materials shared WITH me, plus what I've shared.
export async function GET() {
  try {
    const userId = await getUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: received } = await db
      .from("resource_shares")
      .select("id, owner_id, kind, ref_id, title, url, note, created_at")
      .eq("recipient_id", userId)
      .order("created_at", { ascending: false })
      .limit(60);
    const { data: sent } = await db
      .from("resource_shares")
      .select("id, recipient_id, kind, ref_id, title, url, note, created_at")
      .eq("owner_id", userId)
      .order("created_at", { ascending: false })
      .limit(60);

    const partyIds = [
      ...new Set([
        ...(received ?? []).map((r: { owner_id: string }) => r.owner_id),
        ...(sent ?? []).map((r: { recipient_id: string }) => r.recipient_id),
      ]),
    ];
    const { data: profs } = partyIds.length
      ? await db.from("profiles").select("id, full_name, avatar_url").in("id", partyIds)
      : { data: [] };
    const pmap = new Map((profs ?? []).map((p: { id: string }) => [p.id, p]));

    return NextResponse.json({
      received: (received ?? []).map((r: Record<string, unknown>) => ({ ...r, from: pmap.get(r.owner_id as string) ?? null })),
      sent: (sent ?? []).map((r: Record<string, unknown>) => ({ ...r, to: pmap.get(r.recipient_id as string) ?? null })),
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// POST { recipient_id, kind, ref_id?, title, url?, note? } — share with a mutual.
export async function POST(req: Request) {
  try {
    const userId = await getUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    const { recipient_id, kind, ref_id, title, url, note } = body;

    if (!recipient_id || typeof recipient_id !== "string" || recipient_id === userId) {
      return NextResponse.json({ error: "Pick a mutual to share with" }, { status: 400 });
    }
    if (!["quiz", "flashcard", "material"].includes(kind)) {
      return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
    }
    if (!title || String(title).trim().length < 2) {
      return NextResponse.json({ error: "Missing title" }, { status: 400 });
    }
    if (kind === "material" && !/^https?:\/\/.+/i.test(String(url ?? ""))) {
      return NextResponse.json({ error: "Add a link to the material (e.g. a PDF URL)" }, { status: 400 });
    }

    // Sharing is mutuals-only.
    const mutuals = await getMutualIds(db, userId);
    if (!mutuals.has(recipient_id)) {
      return NextResponse.json({ error: "You can only share with your mutuals" }, { status: 403 });
    }

    const row = {
      owner_id: userId,
      recipient_id,
      kind,
      ref_id: kind === "material" ? null : ref_id ?? null,
      title: String(title).slice(0, 200),
      url: kind === "material" ? String(url).slice(0, 800) : null,
      note: note ? String(note).slice(0, 500) : null,
    };
    const { data, error } = await db.from("resource_shares").insert(row).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
