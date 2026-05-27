import { NextResponse } from "next/server";
import { verifyNotificationSignature } from "@/lib/midtrans";
import { addCredits } from "@/lib/ai/credits";
import { getPack } from "@/lib/ai/packs";

export const runtime = "nodejs";

/**
 * Midtrans HTTP notification webhook. Verifies the SHA-512 signature, then
 * on a successful payment grants the purchased credits. Idempotent:
 * addCredits() keys on the Midtrans order_id, so Midtrans's repeated
 * notifications (it sends several across a payment's lifecycle) can't
 * double-credit.
 */
export async function POST(req: Request) {
  const event = await req.json().catch(() => null);
  if (!event) {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }

  // 1. Authenticate the notification.
  if (!verifyNotificationSignature(event)) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  // 2. Only grant on a genuinely successful payment.
  //    - settlement: most methods (QRIS, VA, e-wallet, bank transfer)
  //    - capture + fraud_status accept: credit/debit cards
  const status = String(event.transaction_status ?? "");
  const fraud = String(event.fraud_status ?? "");
  const success =
    status === "settlement" || (status === "capture" && fraud === "accept");
  if (!success) {
    return NextResponse.json({ received: true, ignored: status });
  }

  // 3. Resolve who + how many. Trust the canonical pack for the credit
  //    count (custom_field2 = packId), not a raw number, and cross-check
  //    the amount matches the pack price.
  const userId = String(event.custom_field1 ?? "");
  const packId = String(event.custom_field2 ?? "");
  const pack = getPack(packId);
  const orderId = String(event.order_id ?? "");
  const grossAmount = Math.round(Number(event.gross_amount ?? 0));

  if (!userId || !pack || !orderId) {
    console.error("[billing/webhook] missing fields", { orderId, userId, packId });
    return NextResponse.json({ received: true, skipped: true });
  }
  if (grossAmount !== pack.amountIdr) {
    // Amount doesn't match what this pack should cost — refuse to grant.
    console.error("[billing/webhook] amount mismatch", {
      orderId,
      grossAmount,
      expected: pack.amountIdr,
    });
    return NextResponse.json({ received: true, skipped: "amount_mismatch" });
  }

  try {
    await addCredits(userId, pack.credits, "purchase", `midtrans:${orderId}`);
  } catch (err) {
    // 500 → Midtrans retries; addCredits is idempotent on the ref so safe.
    console.error("[billing/webhook] addCredits failed", err);
    return NextResponse.json({ error: "grant failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
