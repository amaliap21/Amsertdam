// Shared helpers for the community/social layer (server-side, service role).

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Set of user ids the given user is mutuals with (accepted connection, either direction). */
export async function getMutualIds(db: any, userId: string): Promise<Set<string>> {
  const { data } = await db
    .from("connections")
    .select("requester_id, addressee_id")
    .eq("status", "accepted")
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);
  const set = new Set<string>();
  for (const c of (data ?? []) as { requester_id: string; addressee_id: string }[]) {
    set.add(c.requester_id === userId ? c.addressee_id : c.requester_id);
  }
  return set;
}

/** The connection state between me and another user, for rendering buttons. */
export async function connectionState(
  db: any,
  me: string,
  other: string,
): Promise<"none" | "mutual" | "incoming" | "outgoing"> {
  const { data } = await db
    .from("connections")
    .select("requester_id, addressee_id, status")
    .or(
      `and(requester_id.eq.${me},addressee_id.eq.${other}),and(requester_id.eq.${other},addressee_id.eq.${me})`,
    )
    .maybeSingle();
  if (!data) return "none";
  if (data.status === "accepted") return "mutual";
  return data.requester_id === me ? "outgoing" : "incoming";
}
