import { supabaseAdmin } from "@/lib/supabase/admin";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const admin = supabaseAdmin as any;

/** Current premium-credit balance for a user (0 if none). */
export async function getCredits(userId: string): Promise<number> {
  const { data } = await admin
    .from("ai_credit_balances")
    .select("balance")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.balance ?? 0;
}

/**
 * Atomically spend one credit via the Postgres function. Returns the new
 * balance, or null when the user has no credits (no partial spend; the row
 * lock makes it safe against double-spend races).
 *
 * IMPORTANT: the deployed `spend_ai_credit` takes ONLY `p_user_id` and always
 * deducts a single credit. We must NOT pass `p_amount` — the (uuid, int)
 * overload from migration 010 was never applied to prod, so passing it makes
 * PostgREST fail to resolve the function (PGRST202) and the whole premium
 * request 500s with "Unknown error". Calling with just `p_user_id` also
 * resolves correctly against the migration's (uuid, int default 1) version,
 * so this is safe whether or not the DB is later reconciled (see
 * migration 011). Premium cost is always 1 today; guard against any future
 * caller assuming multi-credit spends work here.
 */
export async function spendCredit(
  userId: string,
  amount = 1,
): Promise<number | null> {
  if (amount !== 1) {
    throw new Error(
      `spendCredit: the deployed spend_ai_credit RPC only supports single-credit spends (got amount=${amount}).`,
    );
  }
  const { data, error } = await admin.rpc("spend_ai_credit", {
    p_user_id: userId,
  });
  if (error) throw error;
  const balance = Number(data);
  return balance < 0 ? null : balance;
}

/** Refund `amount` credits (e.g. the premium AI call failed). Best-effort. */
export async function refundCredit(userId: string, amount = 1): Promise<void> {
  await admin
    .rpc("add_ai_credits", {
      p_user_id: userId,
      p_amount: amount,
      p_reason: "refund",
      p_ref: null,
    })
    .catch(() => undefined);
}

/**
 * Grant credits (purchase / admin grant). Idempotent on `ref` — pass the
 * Stripe checkout-session id so a retried webhook can't double-credit.
 */
export async function addCredits(
  userId: string,
  amount: number,
  reason: "purchase" | "grant" | "refund",
  ref?: string,
): Promise<number> {
  const { data, error } = await admin.rpc("add_ai_credits", {
    p_user_id: userId,
    p_amount: amount,
    p_reason: reason,
    p_ref: ref ?? null,
  });
  if (error) throw error;
  return Number(data);
}
