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
 * Atomically spend `amount` credits via the Postgres function. Returns the
 * new balance, or null when the user can't afford the full amount (no
 * partial spend; the row lock makes it safe against double-spend races).
 */
export async function spendCredit(
  userId: string,
  amount = 1,
): Promise<number | null> {
  const { data, error } = await admin.rpc("spend_ai_credit", {
    p_user_id: userId,
    p_amount: amount,
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
