"use client";

import { useState } from "react";
import { X, Sparkles, Loader2, Check } from "lucide-react";
import toast from "react-hot-toast";
import { CREDIT_PACKS } from "@/lib/ai/packs";

function formatIdr(amount: number): string {
  return "Rp " + amount.toLocaleString("id-ID");
}

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

export default function BuyCreditsModal({ isOpen, onClose }: Props) {
  // Stable display order from the server-defined packs.
  const packs = Object.values(CREDIT_PACKS);
  const [selected, setSelected] = useState<string>(packs[1]?.id ?? packs[0]?.id);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const checkout = async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ packId: selected }),
      });
      const data = await r.json();
      if (!r.ok || !data.url) {
        toast.error(data.error ?? "Could not start checkout.");
        setLoading(false);
        return;
      }
      // Redirect to Midtrans Snap. We don't reset loading — the page navigates.
      window.location.href = data.url;
    } catch {
      toast.error("Network error. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-4 overflow-y-auto"
      onClick={loading ? undefined : onClose}
    >
      <div
        className="relative w-full max-w-md rounded-2xl bg-white p-5 sm:p-6 my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          disabled={loading}
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50"
          aria-label="Close"
        >
          <X size={18} />
        </button>

        <div className="mb-1 flex items-center gap-2">
          <Sparkles size={18} className="text-indigo-primary" />
          <h2 className="text-lg font-semibold text-black-primary">
            Buy Premium Credits
          </h2>
        </div>
        <p className="mb-5 text-sm text-gray-primary">
          Premium analyses use Claude Opus for deeper, more accurate feedback.
          1 credit = 1 premium analysis. Pay with QRIS, GoPay, VA, or card.
        </p>

        <div className="flex flex-col gap-3">
          {packs.map((pack) => {
            const active = selected === pack.id;
            const perAnalysis = Math.round(pack.amountIdr / pack.credits);
            return (
              <button
                key={pack.id}
                type="button"
                onClick={() => setSelected(pack.id)}
                className={`flex items-center justify-between rounded-xl border px-4 py-3 text-left transition ${
                  active
                    ? "border-indigo-primary bg-indigo-primary/5 ring-1 ring-indigo-primary"
                    : "border-gray-200 hover:border-indigo-primary/40"
                }`}
              >
                <div className="min-w-0">
                  <p className="font-medium text-black-primary">{pack.label}</p>
                  <p className="text-xs text-gray-primary">
                    {formatIdr(perAnalysis)} per analysis
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-semibold text-black-primary">
                    {formatIdr(pack.amountIdr)}
                  </span>
                  {active && (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-primary text-white">
                      <Check size={12} />
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={checkout}
          disabled={loading || !selected}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-primary py-2.5 text-sm font-medium text-white transition hover:bg-indigo-600 disabled:opacity-60"
        >
          {loading ? (
            <>
              <Loader2 size={16} className="animate-spin" /> Redirecting…
            </>
          ) : (
            "Continue to payment"
          )}
        </button>
        <p className="mt-3 text-center text-[11px] text-gray-primary">
          Secure checkout via Midtrans (QRIS, e-wallet, VA, card). Credits are
          added automatically once payment is confirmed. By purchasing you
          agree to our{" "}
          <a
            href="/terms#payments"
            target="_blank"
            className="text-indigo-primary hover:underline"
          >
            Terms
          </a>{" "}
          and{" "}
          <a
            href="/terms#refunds"
            target="_blank"
            className="text-indigo-primary hover:underline"
          >
            Refund Policy
          </a>
          .
        </p>
      </div>
    </div>
  );
}
