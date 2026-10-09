'use client';

import { useEffect, useState } from 'react';
import { ExternalLink, Cpu } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { useCreditStore } from '@/stores/credit-store';
import CreditQuote from '@/components/credits/CreditQuote';
import type { CreditQuoteData } from '@/hooks/use-credit-gate';

interface BuyCreditsModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Info about the insufficient credits situation. */
  insufficientInfo?: {
    cost: number;
    balance: number;
    shortfall: number;
  } | null;
  /** Optional pre-job quote (F-50) — shows exactly what the top-up is for. */
  quote?: CreditQuoteData | null;
}

/** Modal for purchasing credit packs when a user has insufficient credits. */
export default function BuyCreditsModal({ isOpen, onClose, insufficientInfo, quote }: BuyCreditsModalProps) {
  const { packs, fetchPacks, purchasePack } = useCreditStore();
  const [purchasing, setPurchasing] = useState<number | null>(null);

  useEffect(() => {
    if (isOpen && packs.length === 0) fetchPacks();
  }, [isOpen, packs.length, fetchPacks]);

  const handlePurchase = async (packId: number) => {
    setPurchasing(packId);
    try {
      const url = await purchasePack(packId);
      if (url) window.location.href = url;
    } finally {
      setPurchasing(null);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Get More Credits">
      <div className="space-y-5">
        {/* Pre-job quote (F-50) — model, tier, honest cost + refund policy */}
        {quote ? (
          <CreditQuote
            featureKey={quote.featureKey}
            tier={quote.tier}
            cost={quote.cost}
            balance={quote.balance}
            isPromo={quote.isPromo}
            modelLabel={quote.modelLabel}
            providerLabel={quote.providerLabel}
          />
        ) : (
          insufficientInfo && (
            <div className="bg-warning/10 border border-warning/20 rounded-xl p-4">
              <p className="text-sm font-medium text-dark dark:text-white mb-1">
                Not enough credits
              </p>
              <p className="text-xs text-dark/60 dark:text-white/60">
                This feature costs <strong>{insufficientInfo.cost}</strong> credits.
                You have <strong>{insufficientInfo.balance}</strong>.
                You need <strong>{insufficientInfo.shortfall}</strong> more.
              </p>
            </div>
          )
        )}

        {/* On-device is always free — hosted AI (D-ID, cloud voices) is metered (C-02). */}
        <div className="bg-secondary/[0.06] rounded-xl p-4 flex items-start gap-3">
          <Cpu className="w-5 h-5 text-secondary shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-dark dark:text-white">On-device creation is unlimited</p>
            <p className="text-xs text-dark/60 dark:text-white/60">
              Browser-native generation never uses credits. Credits apply only to hosted AI like
              real avatars and cloud voices.
            </p>
          </div>
        </div>

        {/* Pack list */}
        <div className="space-y-3">
          {packs.map((pack) => {
            const meetsNeed = insufficientInfo
              ? pack.credits >= insufficientInfo.shortfall
              : true;

            return (
              <div
                key={pack.id}
                className={`border rounded-xl p-4 flex items-center justify-between transition-all ${
                  pack.is_featured
                    ? 'border-primary bg-primary/[0.03] dark:bg-primary/[0.05]'
                    : 'border-border dark:border-white/10'
                } ${meetsNeed && insufficientInfo ? 'ring-1 ring-secondary/30' : ''}`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-dark dark:text-white">{pack.name}</span>
                    {meetsNeed && insufficientInfo && (
                      <span className="text-[10px] font-medium text-secondary bg-secondary/10 px-1.5 py-0.5 rounded-full">
                        Covers this feature
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-dark/60 dark:text-white/60">
                    {pack.credits.toLocaleString()} credits · ${(pack.price_cents / 100).toFixed(2)}
                  </p>
                </div>
                <button
                  onClick={() => handlePurchase(pack.id)}
                  disabled={purchasing === pack.id}
                  className="px-3 py-1.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-hover disabled:opacity-50 transition-colors flex items-center gap-1.5"
                >
                  {purchasing === pack.id ? (
                    <span className="animate-pulse">...</span>
                  ) : (
                    <>Buy <ExternalLink className="w-3 h-3" /></>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
