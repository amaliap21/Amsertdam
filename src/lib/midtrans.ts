// Minimal Midtrans client over the Snap REST API (no SDK dependency).
// Snap = one hosted checkout page supporting QRIS, GoPay/ShopeePay,
// virtual accounts, cards, and retail outlets.

import { createHash } from "crypto";

function isProduction(): boolean {
  return process.env.MIDTRANS_IS_PRODUCTION === "true";
}

function snapBase(): string {
  return isProduction()
    ? "https://app.midtrans.com"
    : "https://app.sandbox.midtrans.com";
}

export function midtransConfigured(): boolean {
  return Boolean(process.env.MIDTRANS_SERVER_KEY);
}

function authHeader(): string {
  // Midtrans uses HTTP Basic auth: base64("<serverKey>:") — trailing colon.
  const token = Buffer.from(`${process.env.MIDTRANS_SERVER_KEY}:`).toString("base64");
  return `Basic ${token}`;
}

export type CreateSnapParams = {
  orderId: string; // unique per attempt; used for idempotency
  amountIdr: number; // whole rupiah
  itemName: string;
  payerEmail?: string;
  finishRedirectUrl: string;
  // Echoed back verbatim in the notification webhook.
  customField1: string; // userId
  customField2: string; // packId
  customField3: string; // credits
};

export type SnapResult = { token: string; redirect_url: string };

export async function createSnapTransaction(p: CreateSnapParams): Promise<SnapResult> {
  const resp = await fetch(`${snapBase()}/snap/v1/transactions`, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      transaction_details: {
        order_id: p.orderId,
        gross_amount: p.amountIdr, // integer for IDR
      },
      item_details: [
        {
          id: p.customField2,
          price: p.amountIdr,
          quantity: 1,
          name: p.itemName.slice(0, 50), // Midtrans caps item name at 50 chars
        },
      ],
      customer_details: p.payerEmail ? { email: p.payerEmail } : undefined,
      custom_field1: p.customField1,
      custom_field2: p.customField2,
      custom_field3: p.customField3,
      callbacks: { finish: p.finishRedirectUrl },
      // Auto-expire unpaid transactions after 60 minutes.
      expiry: { unit: "minutes", duration: 60 },
    }),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`Midtrans Snap create failed (${resp.status}): ${body.slice(0, 200)}`);
  }
  return (await resp.json()) as SnapResult;
}

/**
 * Verify a Midtrans HTTP notification signature.
 * signature_key = SHA512(order_id + status_code + gross_amount + serverKey)
 * where gross_amount is the exact string Midtrans sent (e.g. "25000.00").
 */
export function verifyNotificationSignature(payload: {
  order_id?: string;
  status_code?: string;
  gross_amount?: string;
  signature_key?: string;
}): boolean {
  const serverKey = process.env.MIDTRANS_SERVER_KEY;
  if (!serverKey || !payload.signature_key) return false;
  const expected = createHash("sha512")
    .update(
      `${payload.order_id ?? ""}${payload.status_code ?? ""}${payload.gross_amount ?? ""}${serverKey}`,
    )
    .digest("hex");
  // Length check first, then full compare.
  return (
    expected.length === payload.signature_key.length &&
    expected === payload.signature_key
  );
}
