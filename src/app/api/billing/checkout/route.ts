import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/get-user-id";
import { createSnapTransaction, midtransConfigured } from "@/lib/midtrans";
import { getPack } from "@/lib/ai/packs";

export const runtime = "nodejs";

/**
 * Create a Midtrans Snap transaction for a credit pack and return its
 * hosted checkout URL. The browser redirects there; Snap shows QRIS /
 * GoPay / VA / card options. On payment, Midtrans POSTs the notification
 * webhook (see ../webhook) which grants the credits.
 */
export async function POST(req: Request) {
  const auth = await requireUserId();
  if (auth.response) return auth.response;
  const { userId } = auth;

  if (!midtransConfigured()) {
    return NextResponse.json(
      { error: "Payments are not configured yet." },
      { status: 503 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const pack = getPack(String(body.packId ?? ""));
  if (!pack) {
    return NextResponse.json({ error: "Unknown credit pack." }, { status: 400 });
  }

  const origin =
    req.headers.get("origin") ??
    process.env.OPENROUTER_APP_URL ??
    "http://localhost:3000";

  // order_id must be unique and ≤ 50 chars (Midtrans limit), so we use a
  // compact id and carry userId/packId/credits in custom_field1-3 instead.
  const orderId = `rt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  try {
    const snap = await createSnapTransaction({
      orderId,
      amountIdr: pack.amountIdr, // server-defined; client can't change
      itemName: `RealTrack ${pack.label}`,
      finishRedirectUrl: `${origin}/study-companion?purchase=success`,
      // Echoed back in the notification — derived from the server-side pack.
      customField1: userId,
      customField2: pack.id,
      customField3: String(pack.credits),
    });

    return NextResponse.json({ url: snap.redirect_url });
  } catch (err) {
    console.error("[billing/checkout]", err);
    return NextResponse.json(
      { error: "Could not start checkout. Please try again." },
      { status: 500 },
    );
  }
}
