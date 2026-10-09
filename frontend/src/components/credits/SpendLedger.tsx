'use client';

import { useEffect, useMemo } from 'react';
import {
  Coins,
  ArrowUpRight,
  ArrowDownRight,
  RotateCcw,
  Gift,
  Sparkles,
  Receipt,
  Loader2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useCreditStore } from '@/stores/credit-store';

type TxnType = 'purchase' | 'deduction' | 'refund' | 'admin_grant' | 'promo';

/** Visual treatment per transaction type. */
const TYPE_META: Record<TxnType, { icon: LucideIcon; label: string; tone: string }> = {
  purchase: { icon: ArrowUpRight, label: 'Top-up', tone: 'text-primary' },
  deduction: { icon: ArrowDownRight, label: 'Usage', tone: 'text-danger' },
  refund: { icon: RotateCcw, label: 'Refund', tone: 'text-secondary' },
  admin_grant: { icon: Gift, label: 'Grant', tone: 'text-accent' },
  promo: { icon: Sparkles, label: 'Promo', tone: 'text-accent' },
};

/** Lowest cents-per-credit across active packs, for cash equivalents. null when unknown. */
function bestCentsPerCredit(packs: { credits: number; price_cents: number }[]): number | null {
  const rates = packs
    .filter((p) => p.credits > 0 && p.price_cents > 0)
    .map((p) => p.price_cents / p.credits);
  return rates.length ? Math.min(...rates) : null;
}

/** Turn an ISO timestamp into a compact local string. */
function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Itemized spend ledger (F-50). Every credit movement is a row: what it was for, when,
 * which model/feature, the credit delta, and the running balance afterward. Refunds are
 * called out visually so the auto-refund trail is legible.
 */
export default function SpendLedger({ className = '' }: { className?: string }) {
  const { transactions, loading, packs, fetchTransactions, fetchPacks } = useCreditStore();

  useEffect(() => {
    fetchTransactions();
    if (packs.length === 0) fetchPacks();
  }, [fetchTransactions, fetchPacks, packs.length]);

  const centsPerCredit = useMemo(() => bestCentsPerCredit(packs), [packs]);

  return (
    <div className={`bento-card p-4 md:p-5 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Receipt size={16} className="text-primary" />
          <h2 className="text-[14px] font-semibold text-text dark:text-white">Spend history</h2>
        </div>
        <button
          type="button"
          onClick={() => fetchTransactions()}
          disabled={loading}
          className="text-[11px] text-text-muted hover:text-text dark:hover:text-white disabled:opacity-50 transition-colors flex items-center gap-1"
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
          Refresh
        </button>
      </div>

      {/* Loading state */}
      {loading && transactions.length === 0 && (
        <div className="space-y-2" aria-hidden="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-14 rounded-xl bg-surface dark:bg-[#2a2a2a] animate-pulse"
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && transactions.length === 0 && (
        <div className="flex flex-col items-center justify-center text-center py-10">
          <div className="w-11 h-11 rounded-full bg-primary/[0.06] flex items-center justify-center mb-3">
            <Coins size={18} className="text-primary" />
          </div>
          <p className="text-[13px] font-medium text-text dark:text-white">No transactions yet</p>
          <p className="text-[11.5px] text-text-muted mt-1 max-w-xs">
            Credit top-ups, usage, and refunds will appear here once you run a metered job.
          </p>
        </div>
      )}

      {/* Rows */}
      {transactions.length > 0 && (
        <ul className="space-y-1.5">
          {transactions.map((txn) => {
            const meta = TYPE_META[(txn.type as TxnType)] ?? TYPE_META.deduction;
            const Icon = meta.icon;
            const isRefund = txn.type === 'refund';
            const positive = txn.amount >= 0;
            const cash =
              centsPerCredit !== null
                ? `$${((Math.abs(txn.amount) * centsPerCredit) / 100).toFixed(2)}`
                : null;
            const what = txn.description || txn.feature_key || meta.label;

            return (
              <li
                key={txn.id}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors ${
                  isRefund
                    ? 'bg-secondary/[0.05] border border-secondary/20'
                    : 'bg-surface dark:bg-[#2a2a2a] border border-transparent'
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-white dark:bg-black/20 ${meta.tone}`}
                >
                  <Icon size={15} />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] font-medium text-text dark:text-white truncate">
                    {what}
                  </p>
                  <div className="flex items-center gap-1.5 text-[11px] text-text-muted">
                    <span>{meta.label}</span>
                    {txn.feature_key && txn.feature_key !== what && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="truncate">{txn.feature_key}</span>
                      </>
                    )}
                    <span aria-hidden="true">·</span>
                    <span className="whitespace-nowrap">{formatWhen(txn.created_at)}</span>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <p
                    className={`text-[13px] font-semibold tabular-nums ${
                      positive ? 'text-secondary' : 'text-text dark:text-white'
                    }`}
                  >
                    {positive ? '+' : ''}
                    {txn.amount.toLocaleString()}
                  </p>
                  <p className="text-[10.5px] text-text-muted tabular-nums">
                    {cash && <span>{cash} · </span>}
                    bal {txn.balance_after.toLocaleString()}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
