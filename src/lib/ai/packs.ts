// Credit packs — the single source of truth for what a user can buy.
// Defined server-side so the client can never tamper with price/amount.
// `amountIdr` is what Midtrans charges (whole rupiah); `credits` is what we
// grant. 1 credit = 1 premium unit: one generated flashcard / quiz question,
// or one Claude analysis / chat reply.

export type CreditPack = {
  id: string;
  label: string;
  credits: number;
  amountIdr: number; // whole rupiah
};

// Each pack budgets ~40% of its price to model cost and sells the rest as
// margin. Credits are priced so the budget covers worst-case Opus usage.
//
//   pack      price        budget(40%)  credits
//   starter   Rp 25.000    Rp 10.000    6
//   basic     Rp 50.000    Rp 20.000    12
//   standard  Rp 100.000   Rp 40.000    24
//   pro       Rp 200.000   Rp 80.000    49
//   premium   Rp 500.000   Rp 200.000   123
//
// Users prepay → you're never cash-negative.
export const CREDIT_PACKS: Record<string, CreditPack> = {
  starter: { id: "starter", label: "Starter", credits: 6, amountIdr: 25_000 },
  basic: { id: "basic", label: "Basic", credits: 12, amountIdr: 50_000 },
  standard: { id: "standard", label: "Standard", credits: 24, amountIdr: 100_000 },
  pro: { id: "pro", label: "Pro", credits: 49, amountIdr: 200_000 },
  premium: { id: "premium", label: "Premium", credits: 123, amountIdr: 500_000 },
};

export function getPack(id: string): CreditPack | null {
  return CREDIT_PACKS[id] ?? null;
}
