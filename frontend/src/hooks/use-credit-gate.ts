import { useState } from 'react';
import { useCreditStore } from '@/stores/credit-store';

type GateTier = 'browser' | 'api' | 'byok';

interface GateOptions {
  /** Engine tier that will run the job — decides local vs remote metering. Default browser. */
  tier?: GateTier;
  /** Human label for the model shown in the quote (e.g. "D-ID Live"). */
  modelLabel?: string;
  /** Human label for the provider shown in the quote (e.g. "D-ID"). */
  providerLabel?: string;
}

/** The pre-job quote, shaped to spread straight into <CreditQuote/> and BuyCreditsModal. */
export interface CreditQuoteData {
  featureKey: string;
  tier: GateTier;
  cost: number;
  balance: number;
  isPromo: boolean;
  modelLabel?: string;
  providerLabel?: string;
}

/**
 * Gate for credit-gated features (F-50). `gate()` runs the authoritative server check; when the
 * balance is short it opens the buy modal. `quote` holds the last resolved cost/balance so callers
 * (and the modal) can render a <CreditQuote/> before anything is charged.
 */
export function useCreditGate(featureKey: string, options: GateOptions = {}) {
  const { tier = 'browser', modelLabel, providerLabel } = options;
  const { checkFeature } = useCreditStore();
  const [checking, setChecking] = useState(false);
  const [insufficientCredits, setInsufficientCredits] = useState<{
    cost: number;
    balance: number;
    shortfall: number;
  } | null>(null);
  const [showBuyModal, setShowBuyModal] = useState(false);
  const [quote, setQuote] = useState<CreditQuoteData | null>(null);

  const gate = async (): Promise<boolean> => {
    setChecking(true);
    setInsufficientCredits(null);
    try {
      const result = await checkFeature(featureKey, tier);
      setQuote({
        featureKey,
        tier,
        cost: result.cost,
        balance: result.balance,
        isPromo: result.is_promo,
        modelLabel,
        providerLabel,
      });
      if (result.allowed) return true;
      setInsufficientCredits({
        cost: result.cost,
        balance: result.balance,
        shortfall: result.shortfall ?? result.cost - result.balance,
      });
      setShowBuyModal(true);
      return false;
    } catch {
      return true; // Fail open on network errors (server-side deduct stays authoritative).
    } finally {
      setChecking(false);
    }
  };

  return { gate, checking, insufficientCredits, showBuyModal, setShowBuyModal, quote };
}
