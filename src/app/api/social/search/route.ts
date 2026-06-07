import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getUserId } from "@/lib/get-user-id";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabaseAdmin as any;

// GET /api/social/search?q= — find people by name.
// Privacy: private users are NOT searchable unless they're already your mutual.
export async function GET(req: NextRequest) {
  try {
    const userId = await getUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
    if (q.length < 1) return NextResponse.json({ results: [] });

    // My connection states in one query.
    const { data: conns } = await db
      .from("connections")
      .select("requester_id, addressee_id, status")
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);
    const state = new Map<string, "mutual" | "incoming" | "outgoing">();
    for (const c of (conns ?? []) as { requester_id: string; addressee_id: string; status: string }[]) {
      const other = c.requester_id === userId ? c.addressee_id : c.requester_id;
      state.set(other, c.status === "accepted" ? "mutual" : c.addressee_id === userId ? "incoming" : "outgoing");
    }

    const { data: people, error } = await db
      .from("profiles")
      .select("id, full_name, avatar_url, is_tutor, is_public, interests")
      .ilike("full_name", `%${q}%`)
      .neq("id", userId)
      .limit(40);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const results = (people ?? [])
      // Private users are hidden unless already a mutual.
      .filter((p: { is_public: boolean | null; id: string }) => p.is_public !== false || state.get(p.id) === "mutual")
      .map((p: { id: string; full_name: string | null; avatar_url: string | null; is_tutor: boolean; interests: string[] | null }) => ({
        id: p.id,
        full_name: p.full_name,
        avatar_url: p.avatar_url,
        is_tutor: p.is_tutor,
        interests: p.interests ?? [],
        connection: state.get(p.id) ?? "none",
      }));

    return NextResponse.json({ results });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
