'use client';

import { useEffect, useMemo } from 'react';
import {
  Coins,
  Cpu,
  Cloud,
  ShieldCheck,
  AlertTriangle,
  Sparkles,
} from 'lucide-react';
import { useCreditStore } from '@/stores/credit-store';

/** Tier of the engine that will run the job. `browser` = on-device (never metered). */
export type QuoteTier = 'browser' | 'api' | 'byok';

interface CreditQuoteProps {
  /** Feature being quoted (matches feature_credit_config.feature_key). */
  featureKey: string;
  /** Which engine tier will run — decides local vs remote and metering. */
  tier: QuoteTier;
  /** Authoritative credit cost from the server (0 = free/promo). */
  cost: number;
  /** User's current credit balance. */
  balance: number;
  /** Server flagged this as a promo (cost waived). */
  isPromo: boolean;
  /** Human label for the model, e.g. "Kokoro-82M" or "D-ID Live". */
  modelLabel?: string;
  /** Human label for the provider, e.g. "On-device" or "D-ID". */
  providerLabel?: string;
  className?: string;
}

/** Lowest cents-per-credit across active packs (best-value pack). null when unknown. */
function bestCentsPerCredit(packs: { credits: number; price_cents: number }[]): number | null {
  const rates = packs
    .filter((p) => p.credits > 0 && p.price_cents > 0)
    .map((p) => p.price_cents / p.credits);
  if (rates.length === 0) return null;
  return Math.min(...rates);
}

/** Format a credit count as its cash equivalent, or null when no rate is known. */
function cashEquivalent(credits: number, centsPerCredit: number | null): string | null {
  if (centsPerCredit === null) return null;
  const dollars = (credits * centsPerCredit) / 100;
  return `$${dollars.toFixed(2)}`;
}

/**
 * Pre-job billing quote (F-50). Presentational: the caller passes the server-resolved
 * cost/balance/is_promo. Shows model + provider, a local/remote badge, the cost in credits
 * and cash, and the refund policy — so nothing is ever charged without disclosure first.
 */
export default function CreditQuote({
  featureKey,
  tier,
  cost,
  balance,
  isPromo,
  modelLabel,
  providerLabel,
  className = '',
}: CreditQuoteProps) {
  const { packs, fetchPacks } = useCreditStore();

  // Packs power the cash-equivalent; fetch once if we don't have them yet.
  useEffect(() => {
    if (packs.length === 0) fetchPacks();
  }, [packs.length, fetchPacks]);

  const centsPerCredit = useMemo(() => bestCentsPerCredit(packs), [packs]);

  const isLocal = tier === 'browser';
  const isFree = isPromo || cost === 0;
  const insufficient = !isFree && balance < cost;
  const costCash = cashEquivalent(cost, centsPerCredit);
  const afterBalance = isFree ? balance : Math.max(0, balance - cost);

  return (
    <div
      className={`rounded-xl border border-border dark:border-white/10 bg-surface dark:bg-[#2a2a2a] p-4 animate-fade-in ${className}`}
    >
      {/* Header: model + provider, with a local/remote badge */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wide text-text-muted mb-0.5">Cost estimate</p>
          <p className="text-[13px] font-semibold text-text dark:text-white truncate">
            {modelLabel || featureKey}
          </p>
          {providerLabel && (
            <p className="text-[11px] text-text-muted truncate">via {providerLabel}</p>
          )}
        </div>
        {isLocal ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-secondary/10 text-secondary shrink-0">
            <Cpu size={11} />
            On-device
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-accent/10 text-accent shrink-0">
            <Cloud size={11} />
            Cloud
          </span>
        )}
      </div>

      {/* Cost line */}
      <div className="flex items-end justify-between gap-3 mb-3">
        <div>
          {isFree ? (
            <span className="inline-flex items-center gap-1.5 text-[20px] font-bold text-secondary leading-none">
              <Sparkles size={16} />
              Free
            </span>
          ) : (
            <div className="flex items-baseline gap-1.5">
              <span className="inline-flex items-center gap-1 text-[22px] font-bold text-text dark:text-white leading-none">
                <Coins size={16} className="text-primary" />
                {cost.toLocaleString()}
              </span>
              <span className="text-[12px] text-text-muted">
                credit{cost === 1 ? '' : 's'}
                {costCash && <> · {costCash}</>}
              </span>
            </div>
          )}
          <p className="text-[11px] text-text-muted mt-1">
            {isLocal
              ? 'Runs in your browser — no credits are used.'
              : isFree
                ? 'Waived by the current launch promotion.'
                : 'Metered because this runs on a hosted model.'}
          </p>
        </div>
      </div>

      {/* Balance context */}
      {!isFree && (
        <div className="flex items-center justify-between text-[11.5px] text-text-muted border-t border-border dark:border-white/10 pt-2.5 mb-2.5">
          <span>Balance: {balance.toLocaleString()}</span>
          <span>After this job: {afterBalance.toLocaleString()}</span>
        </div>
      )}

      {/* Insufficient warning */}
      {insufficient && (
        <div className="flex items-start gap-2 text-[11.5px] text-warning bg-warning/[0.08] rounded-lg px-2.5 py-2 mb-2.5">
          <AlertTriangle size={13} className="shrink-0 mt-0.5" />
          <span>
            You need {(cost - balance).toLocaleString()} more credit
            {cost - balance === 1 ? '' : 's'} to run this. Top up to continue.
          </span>
        </div>
      )}

      {/* Refund policy */}
      <div className="flex items-center gap-1.5 text-[11px] text-text-muted">
        <ShieldCheck size={12} className="text-secondary shrink-0" />
        <span>Failed jobs are auto-refunded to your balance.</span>
      </div>
    </div>
  );
}
