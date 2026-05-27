// Credit packs — the single source of truth for what a user can buy.
// Defined server-side so the client can never tamper with price/amount.
// `amountIdr` is what Xendit charges (whole rupiah); `credits` is what we
// grant. With PREMIUM_CREDIT_COST = 1, 1 credit = 1 Claude Opus analysis.

export type CreditPack = {
  id: string;
  label: string;
  credits: number;
  amountIdr: number; // whole rupiah
};

// Priced against Opus's worst-case cost (~$0.045 ≈ Rp720/analysis), after
// Xendit fees (QRIS ~0.7%, no fixed fee). Local IDR pricing keeps it
// affordable for Indonesian students while holding ~55–60% margin.
//
//   pack      price        analyses  cost(IDR)  Xendit~0.7%  net profit   margin
//   starter   Rp 25.000    15        ~Rp10.800  ~Rp175       ~Rp14.000    56%
//   plus      Rp 50.000    35        ~Rp25.200  ~Rp350       ~Rp24.500    49%
//   pro       Rp 100.000   80        ~Rp57.600  ~Rp700       ~Rp41.700    42%
//
// Typical (non-worst-case) Opus cost is ~$0.025 ≈ Rp400/analysis, so real
// margins run higher. Users prepay → you're never cash-negative.
export const CREDIT_PACKS: Record<string, CreditPack> = {
  starter: { id: "starter", label: "15 Opus analyses", credits: 15, amountIdr: 25_000 },
  plus: { id: "plus", label: "35 Opus analyses", credits: 35, amountIdr: 50_000 },
  pro: { id: "pro", label: "80 Opus analyses", credits: 80, amountIdr: 100_000 },
};

export function getPack(id: string): CreditPack | null {
  return CREDIT_PACKS[id] ?? null;
}
