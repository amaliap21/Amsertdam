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
 * Atomically spend `amount` credits via a Postgres function. Returns the new
 * balance, or null when the user can't afford the whole amount (no partial
 * spend; the row lock makes it safe against double-spend races).
 *
 * Two RPCs, by design:
 *  - amount === 1 → `spend_ai_credit(p_user_id)`. This is the prod-proven
 *    single-arg path. We must NOT pass `p_amount` to it — the (uuid, int)
 *    overload from migration 010 drifted out of prod, so passing it makes
 *    PostgREST fail to resolve the function (PGRST202) and the request 500s
 *    with "Unknown error" (see migration 011).
 *  - amount > 1 → `spend_ai_credits(p_user_id, p_amount)` (migration 012), a
 *    DISTINCT, unambiguous function used for per-card/question billing where
 *    one generation job spends one credit per item produced.
 */
export async function spendCredit(
  userId: string,
  amount = 1,
): Promise<number | null> {
  const { data, error } =
    amount <= 1
      ? await admin.rpc("spend_ai_credit", { p_user_id: userId })
      : await admin.rpc("spend_ai_credits", {
          p_user_id: userId,
          p_amount: amount,
        });
  if (error) throw error;
  const balance = Number(data);
  return balance < 0 ? null : balance;
}

/** Refund `amount` credits (e.g. the premium AI call failed). Best-effort. */
/** Refund `amount` credits (e.g. the premium AI call failed). Best-effort. */
export async function refundCredit(userId: string, amount = 1): Promise<void> {
  try {
    const { error } = await admin.rpc("add_ai_credits", {
      p_user_id: userId,
      p_amount: amount,
      p_reason: "refund",
      p_ref: null,
    });
    
    if (error) {
      console.error("Refund failed via PostgREST error:", error);
    }
  } catch (err) {
    // Menangkap error network atau error eksekusi tak terduga lainnya
    console.error("Refund network error:", err);
  }
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
