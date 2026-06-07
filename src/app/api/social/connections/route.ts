import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getUserId } from "@/lib/get-user-id";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabaseAdmin as any;

async function profilesByIds(ids: string[]) {
  if (!ids.length) return new Map<string, { id: string; full_name: string | null; avatar_url: string | null }>();
  const { data } = await db.from("profiles").select("id, full_name, avatar_url").in("id", ids);
  return new Map((data ?? []).map((p: { id: string }) => [p.id, p]));
}

// GET — my mutuals + incoming requests + outgoing requests.
export async function GET() {
  try {
    const userId = await getUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: rows } = await db
      .from("connections")
      .select("requester_id, addressee_id, status, created_at")
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);

    const list = (rows ?? []) as { requester_id: string; addressee_id: string; status: string }[];
    const mutualIds: string[] = [];
    const incomingIds: string[] = [];
    const outgoingIds: string[] = [];
    for (const c of list) {
      const other = c.requester_id === userId ? c.addressee_id : c.requester_id;
      if (c.status === "accepted") mutualIds.push(other);
      else if (c.addressee_id === userId) incomingIds.push(other);
      else outgoingIds.push(other);
    }
    const profiles = await profilesByIds([...mutualIds, ...incomingIds, ...outgoingIds]);
    const map = (ids: string[]) => ids.map((id) => profiles.get(id) ?? { id, full_name: "Student", avatar_url: null });

    return NextResponse.json({
      mutuals: map(mutualIds),
      incoming: map(incomingIds),
      outgoing: map(outgoingIds),
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// POST { target_id } — send a mutual request. If the target already requested
// me, this accepts it (we become mutuals).
export async function POST(req: Request) {
  try {
    const userId = await getUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { target_id } = await req.json();
    if (!target_id || typeof target_id !== "string" || target_id === userId) {
      return NextResponse.json({ error: "Invalid target" }, { status: 400 });
    }

    // Existing connection either direction?
    const { data: existing } = await db
      .from("connections")
      .select("requester_id, addressee_id, status")
      .or(`and(requester_id.eq.${userId},addressee_id.eq.${target_id}),and(requester_id.eq.${target_id},addressee_id.eq.${userId})`)
      .maybeSingle();

    if (existing) {
      if (existing.status === "accepted") return NextResponse.json({ status: "mutual" });
      // A pending request the OTHER person sent me -> accept it.
      if (existing.addressee_id === userId) {
        await db.from("connections").update({ status: "accepted", updated_at: new Date().toISOString() })
          .eq("requester_id", target_id).eq("addressee_id", userId);
        return NextResponse.json({ status: "mutual" });
      }
      return NextResponse.json({ status: "outgoing" }); // already pending from me
    }

    const { error } = await db.from("connections").insert({ requester_id: userId, addressee_id: target_id, status: "pending" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ status: "outgoing" });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// PATCH { requester_id, action: 'accept' | 'decline' } — respond to an incoming request.
export async function PATCH(req: Request) {
  try {
    const userId = await getUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { requester_id, action } = await req.json();
    if (!requester_id || typeof requester_id !== "string") {
      return NextResponse.json({ error: "Missing requester_id" }, { status: 400 });
    }
    if (action === "accept") {
      const { error } = await db.from("connections").update({ status: "accepted", updated_at: new Date().toISOString() })
        .eq("requester_id", requester_id).eq("addressee_id", userId).eq("status", "pending");
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ status: "mutual" });
    }
    // decline / remove
    const { error } = await db.from("connections").delete()
      .eq("requester_id", requester_id).eq("addressee_id", userId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ status: "none" });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// DELETE { target_id } — cancel an outgoing request or unfriend a mutual.
export async function DELETE(req: Request) {
  try {
    const userId = await getUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { target_id } = await req.json();
    if (!target_id || typeof target_id !== "string") {
      return NextResponse.json({ error: "Missing target_id" }, { status: 400 });
    }
    const { error } = await db.from("connections").delete()
      .or(`and(requester_id.eq.${userId},addressee_id.eq.${target_id}),and(requester_id.eq.${target_id},addressee_id.eq.${userId})`);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ status: "none" });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
