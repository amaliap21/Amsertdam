import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getUserId } from "@/lib/get-user-id";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabaseAdmin as any;

// POST /api/social/follow { target_id } — toggle follow/unfollow.
export async function POST(req: Request) {
  try {
    const userId = await getUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { target_id } = await req.json();
    if (!target_id || typeof target_id !== "string") {
      return NextResponse.json({ error: "Missing target_id" }, { status: 400 });
    }
    if (target_id === userId) {
      return NextResponse.json({ error: "You can't follow yourself" }, { status: 400 });
    }

    const { data: existing } = await db
      .from("follows")
      .select("follower_id")
      .eq("follower_id", userId)
      .eq("following_id", target_id)
      .maybeSingle();

    if (existing) {
      const { error } = await db.from("follows").delete().eq("follower_id", userId).eq("following_id", target_id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ following: false });
    }
    const { error } = await db.from("follows").insert({ follower_id: userId, following_id: target_id });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ following: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
