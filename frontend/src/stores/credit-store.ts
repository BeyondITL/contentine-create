import { create } from 'zustand';
import { api } from '@/lib/api';

// --- localStorage keys ---
const LS_BALANCE_KEY = 'contentine_credits';
const LS_TRANSACTIONS_KEY = 'contentine_transactions';
const DEFAULT_BALANCE = 1000;

interface FeatureCheck {
  allowed: boolean;
  cost: number;
  balance: number;
  is_promo: boolean;
  shortfall?: number;
}

interface CreditPack {
  id: number;
  name: string;
  credits: number;
  price_cents: number;
  badge_label: string;
  badge_color: string;
  is_featured: boolean;
}

interface CreditTransaction {
  id: number;
  type: string;
  amount: number;
  balance_after: number;
  feature_key: string | null;
  description: string;
  created_at: string;
}

interface CreditState {
  balance: number;
  transactions: CreditTransaction[];
  packs: CreditPack[];
  loading: boolean;
  fetchBalance: () => Promise<void>;
  fetchTransactions: () => Promise<void>;
  fetchPacks: () => Promise<void>;
  checkFeature: (featureKey: string, tier?: 'browser' | 'api' | 'byok') => Promise<FeatureCheck>;
  refundJob: (referenceId: string, reason?: string) => Promise<number | null>;
  purchasePack: (packId: number) => Promise<string>;
  setBalance: (balance: number) => void;
}

/** Read balance from localStorage with fallback. */
function getLocalBalance(): number {
  if (typeof window === 'undefined') return DEFAULT_BALANCE;
  try {
    const raw = localStorage.getItem(LS_BALANCE_KEY);
    if (raw === null) return DEFAULT_BALANCE;
    const val = Number(raw);
    return Number.isFinite(val) ? val : DEFAULT_BALANCE;
  } catch {
    return DEFAULT_BALANCE;
  }
}

/** Persist balance to localStorage. */
function saveLocalBalance(balance: number): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LS_BALANCE_KEY, String(balance));
  } catch {
    // Storage full or unavailable — non-fatal
  }
}

/** Read transactions from localStorage. */
function getLocalTransactions(): CreditTransaction[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LS_TRANSACTIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Persist transactions to localStorage. */
function saveLocalTransactions(transactions: CreditTransaction[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LS_TRANSACTIONS_KEY, JSON.stringify(transactions));
  } catch {
    // Storage full or unavailable — non-fatal
  }
}

/** Zustand store for credits — localStorage-first, no credits system means unlimited. */
export const useCreditStore = create<CreditState>((set) => ({
  balance: getLocalBalance(),
  transactions: getLocalTransactions(),
  packs: [],
  loading: false,

  fetchBalance: async () => {
    try {
      const data = await api.get('/credits/balance');
      const balance = data?.balance ?? DEFAULT_BALANCE;
      set({ balance });
      saveLocalBalance(balance);
    } catch {
      // API failed — use localStorage fallback
      const local = getLocalBalance();
      set({ balance: local });
    }
  },

  fetchTransactions: async () => {
    try {
      set({ loading: true });
      const data = await api.get('/credits/transactions');
      const transactions = Array.isArray(data?.transactions) ? data.transactions : [];
      set({ transactions, loading: false });
      saveLocalTransactions(transactions);
    } catch {
      // API failed — use localStorage fallback
      const local = getLocalTransactions();
      set({ transactions: local, loading: false });
    }
  },

  fetchPacks: async () => {
    try {
      const data = await api.get('/credits/packs');
      set({ packs: Array.isArray(data?.packs) ? data.packs : [] });
    } catch {
      set({ packs: [] });
    }
  },

  checkFeature: async (featureKey: string, tier: 'browser' | 'api' | 'byok' = 'browser') => {
    // Authoritative metering lives server-side (CreditService.canUseFeature). Browser-native
    // features are configured at cost 0 → allowed:true (Law L2 "unlimited"); system-API / D-ID
    // paths carry a real cost and can be refused here (C-02). We honor the server verdict rather
    // than pretending everything is free.
    try {
      const data = await api.post<FeatureCheck>('/credits/check', { feature_key: featureKey, tier });
      if (data && typeof data.allowed === 'boolean') {
        set({ balance: data.balance });
        saveLocalBalance(data.balance);
        return {
          allowed: data.allowed,
          cost: data.cost ?? 0,
          balance: data.balance ?? getLocalBalance(),
          is_promo: data.is_promo ?? false,
          shortfall: data.shortfall,
        };
      }
      // Malformed response — fail open (the server-side deduct at action time is authoritative).
      return { allowed: true, cost: 0, balance: getLocalBalance(), is_promo: false };
    } catch {
      // Server unreachable — fail open for UX; deduct-time server check still gates the real spend.
      return { allowed: true, cost: 0, balance: getLocalBalance(), is_promo: false };
    }
  },

  refundJob: async (referenceId: string, reason?: string) => {
    // Called when a metered job fails after credits were deducted (F-50 auto-refund).
    // Idempotent server-side; browser-native jobs (never deducted) return refunded:false.
    try {
      const data = await api.post<{ refunded: boolean; amount: number; balance?: number }>(
        '/credits/refund',
        { reference_id: referenceId, reason },
      );
      if (data?.refunded && typeof data.balance === 'number') {
        set({ balance: data.balance });
        saveLocalBalance(data.balance);
        return data.amount;
      }
      return null;
    } catch {
      return null;
    }
  },

  purchasePack: async (packId: number) => {
    const data = await api.post('/credits/purchase', { pack_id: packId });
    return data?.checkout_url || '';
  },

  setBalance: (balance: number) => {
    set({ balance });
    saveLocalBalance(balance);
  },
}));
