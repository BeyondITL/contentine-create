'use client';

import { useEffect, useMemo, useState } from 'react';
import { Coins, Plus, ShieldCheck } from 'lucide-react';
import { useCreditStore } from '@/stores/credit-store';
import SpendLedger from '@/components/credits/SpendLedger';
import BuyCreditsModal from '@/components/credits/BuyCreditsModal';

/** Lowest cents-per-credit across active packs (best-value pack). null when unknown. */
function bestCentsPerCredit(packs: { credits: number; price_cents: number }[]): number | null {
  const rates = packs
    .filter((p) => p.credits > 0 && p.price_cents > 0)
    .map((p) => p.price_cents / p.credits);
  return rates.length ? Math.min(...rates) : null;
}

/**
 * Billing & usage page (F-50): the user's credit balance and a full itemized spend ledger,
 * so every credit charged and every auto-refund is visible and reconcilable.
 */
export default function BillingPage() {
  const { balance, packs, fetchBalance, fetchPacks } = useCreditStore();
  const [buyOpen, setBuyOpen] = useState(false);

  useEffect(() => {
    fetchBalance();
    if (packs.length === 0) fetchPacks();
  }, [fetchBalance, fetchPacks, packs.length]);

  const centsPerCredit = useMemo(() => bestCentsPerCredit(packs), [packs]);
  const balanceCash =
    centsPerCredit !== null ? `$${((balance * centsPerCredit) / 100).toFixed(2)}` : null;

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-6 space-y-5 animate-fade-in">
      <div>
        <h1 className="text-[20px] font-bold text-text dark:text-white">Billing &amp; usage</h1>
        <p className="text-[12.5px] text-text-muted mt-0.5">
          Your credit balance and a full record of every charge and refund.
        </p>
      </div>

      {/* Balance card */}
      <div className="bento-card p-4 md:p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-text-muted mb-1">
              Credit balance
            </p>
            <div className="flex items-baseline gap-2">
              <span className="inline-flex items-center gap-1.5 text-[28px] font-bold text-text dark:text-white leading-none">
                <Coins size={22} className="text-primary" />
                {balance.toLocaleString()}
              </span>
              {balanceCash && (
                <span className="text-[12px] text-text-muted">≈ {balanceCash}</span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setBuyOpen(true)}
            className="btn-primary flex items-center gap-2 min-h-[44px] md:min-h-0 cursor-pointer"
          >
            <Plus size={15} />
            Get credits
          </button>
        </div>

        <div className="flex items-center gap-1.5 text-[11px] text-text-muted mt-3 pt-3 border-t border-border dark:border-white/10">
          <ShieldCheck size={12} className="text-secondary shrink-0" />
          <span>
            On-device generation is never metered. Only hosted models spend credits, and failed
            jobs are auto-refunded.
          </span>
        </div>
      </div>

      {/* Itemized ledger */}
      <SpendLedger />

      <BuyCreditsModal isOpen={buyOpen} onClose={() => setBuyOpen(false)} />
    </div>
  );
}
