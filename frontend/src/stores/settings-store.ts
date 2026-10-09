import { create } from 'zustand';
import { api } from '@/lib/api';
import { localDB } from '@/lib/local-db';
import type { UserProfile, UserPreferences, UserUsage, PlanInfo, PlanTier } from '@/types';

// ── Static fallback plans when API is unreachable ──

const FALLBACK_PLANS: PlanInfo[] = [
  {
    id: 'starter',
    name: 'Starter',
    price: 19,
    features: ['Unlimited videos', '5 social accounts', 'AI Writer', 'Basic analytics'],
    recommended: false,
  },
  {
    id: 'professional',
    name: 'Professional',
    price: 49,
    features: [
      'Everything in Starter',
      'Unlimited social accounts',
      'Content Remix Hub',
      'Advanced analytics',
      'Priority support',
    ],
    recommended: true,
  },
  {
    id: 'business',
    name: 'Business',
    price: 99,
    features: [
      'Everything in Professional',
      'Team collaboration',
      '5 team members',
      'Custom branding',
      'API access',
    ],
    recommended: false,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 249,
    features: [
      'Everything in Business',
      'Unlimited team members',
      'Dedicated support',
      'Custom integrations',
      'SLA guarantee',
    ],
    recommended: false,
  },
];

// ── Default settings created when nothing exists locally or remotely ──

interface LocalSettings {
  id: number;
  theme: string;
  language: string;
  notifications_enabled: boolean;
}

const DEFAULT_SETTINGS: LocalSettings = {
  id: 1,
  theme: 'system',
  language: 'en',
  notifications_enabled: true,
};

// ── State Interface ──────────────────────────────────────────

interface SettingsState {
  profile: UserProfile | null;
  usage: UserUsage | null;
  plans: PlanInfo[];
  activeTab: string;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  localSettings: LocalSettings;

  setActiveTab: (tab: string) => void;
  fetchProfile: () => Promise<void>;
  updateProfile: (data: Partial<UserProfile>) => Promise<void>;
  fetchUsage: () => Promise<void>;
  fetchPlans: () => Promise<void>;
  fetchSettings: () => Promise<void>;
  updateSettings: (data: Partial<LocalSettings>) => Promise<void>;
  createCheckoutSession: (plan: string) => Promise<string>;
  createPortalSession: () => Promise<string>;
  deleteAccount: () => Promise<void>;
}

// ── Store ────────────────────────────────────────────────────

export const useSettingsStore = create<SettingsState>((set, get) => ({
  profile: null,
  usage: null,
  plans: FALLBACK_PLANS,
  activeTab: 'profile',
  isLoading: false,
  isSaving: false,
  error: null,
  localSettings: DEFAULT_SETTINGS,

  setActiveTab: (tab) => set({ activeTab: tab }),

  /** Fetch the current user's profile — try API, fallback IndexedDB. */
  fetchProfile: async () => {
    set({ isLoading: true, error: null });
    try {
      const { profile } = await api.get<{ profile: UserProfile }>('/user/profile');

      // Cache to IndexedDB settings store
      if (profile) {
        try {
          await localDB.put('settings', {
            ...get().localSettings,
            id: 1,
            _profile: profile,
          });
        } catch {
          // non-critical
        }
      }

      set({ profile, error: null });
    } catch {
      // Fallback: try IndexedDB
      try {
        const local = await localDB.get<LocalSettings & { _profile?: UserProfile }>('settings', 1);
        if (local?._profile) {
          set({ profile: local._profile, error: null });
        } else {
          set({ error: 'Profile unavailable offline.' });
        }
      } catch {
        set({ error: 'Failed to load profile.' });
      }
    } finally {
      set({ isLoading: false });
    }
  },

  /** Update the current user's profile — local first, API background. */
  updateProfile: async (data) => {
    set({ isSaving: true, error: null });

    const prev = get().profile;
    const updated = prev ? { ...prev, ...data } : null;

    // Optimistic update
    if (updated) {
      set({ profile: updated });

      // Persist to IndexedDB
      try {
        const local = await localDB.get<LocalSettings & { _profile?: UserProfile }>('settings', 1);
        await localDB.put('settings', {
          ...(local || DEFAULT_SETTINGS),
          id: 1,
          _profile: updated,
        });
      } catch {
        // non-critical
      }
    }

    // API in background
    try {
      const { profile } = await api.put<{ profile: UserProfile }>('/user/profile', data);
      if (profile) {
        set({ profile, error: null });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save profile.';
      set({ error: message });
      // Keep local optimistic state — do not revert
    } finally {
      set({ isSaving: false });
    }
  },

  /** Fetch current usage stats (videos created, storage, etc.). */
  fetchUsage: async () => {
    set({ isLoading: true, error: null });
    try {
      const { usage } = await api.get<{ usage: UserUsage }>('/user/usage');
      set({ usage, error: null });
    } catch {
      // Compute basic usage from local data
      try {
        const videoCount = await localDB.count('videos');
        const postCount = await localDB.count('scheduled_posts');
        set({
          usage: {
            videos_created: videoCount,
            posts_scheduled: postCount,
            posts_published: 0,
            storage_used_mb: 0,
            plan_tier: 'free' as PlanTier,
            trial_ends_at: null,
            trial_videos_used: videoCount,
          },
          error: null,
        });
      } catch {
        set({ error: 'Failed to load usage data.' });
      }
    } finally {
      set({ isLoading: false });
    }
  },

  /** Fetch available plans from Stripe, fall back to static list. */
  fetchPlans: async () => {
    try {
      const { plans } = await api.get<{ plans: PlanInfo[] }>('/stripe/plans');
      if (plans && plans.length > 0) {
        set({ plans });
      }
    } catch {
      // Keep the static fallback plans already in state
      set({ plans: FALLBACK_PLANS });
    }
  },

  /** Fetch local settings from IndexedDB — try API first, fallback local. */
  fetchSettings: async () => {
    set({ isLoading: true, error: null });
    try {
      // Try API first (future endpoint)
      const data = await api.get<{ settings: LocalSettings }>('/user/settings');
      if (data?.settings) {
        const settings = { ...DEFAULT_SETTINGS, ...data.settings, id: 1 };
        set({ localSettings: settings, error: null });

        // Cache locally
        try {
          await localDB.put<LocalSettings>('settings', settings);
        } catch {
          // non-critical
        }
      }
    } catch {
      // Fallback: IndexedDB
      try {
        const local = await localDB.get<LocalSettings>('settings', 1);
        if (local) {
          set({ localSettings: local, error: null });
        } else {
          // Create defaults
          await localDB.put<LocalSettings>('settings', DEFAULT_SETTINGS);
          set({ localSettings: DEFAULT_SETTINGS, error: null });
        }
      } catch {
        set({ localSettings: DEFAULT_SETTINGS, error: null });
      }
    } finally {
      set({ isLoading: false });
    }
  },

  /** Update local settings — save local first, API in background. */
  updateSettings: async (data) => {
    const current = get().localSettings;
    const updated = { ...current, ...data, id: 1 };

    // Local first
    set({ localSettings: updated });
    try {
      await localDB.put<LocalSettings>('settings', updated);
    } catch {
      // non-critical
    }

    // API in background
    try {
      await api.put('/user/settings', updated);
    } catch {
      // Keep local state
    }
  },

  /** Create a Stripe Checkout session and return the redirect URL. */
  createCheckoutSession: async (plan) => {
    set({ isLoading: true, error: null });
    try {
      const { url } = await api.post<{ url: string }>('/stripe/checkout', { plan });
      return url;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to start checkout.';
      set({ error: message });
      throw err;
    } finally {
      set({ isLoading: false });
    }
  },

  /** Create a Stripe Customer Portal session and return the redirect URL. */
  createPortalSession: async () => {
    set({ isLoading: true, error: null });
    try {
      const { url } = await api.post<{ url: string }>('/stripe/portal');
      return url;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to open billing portal.';
      set({ error: message });
      throw err;
    } finally {
      set({ isLoading: false });
    }
  },

  /** Permanently delete the user's account and clear all local state. */
  deleteAccount: async () => {
    set({ isLoading: true, error: null });
    try {
      await api.delete('/user/account');

      // Clear local data
      try {
        await localDB.clear('settings');
      } catch {
        // non-critical
      }

      set({
        profile: null,
        usage: null,
        plans: FALLBACK_PLANS,
        activeTab: 'profile',
        isLoading: false,
        isSaving: false,
        error: null,
        localSettings: DEFAULT_SETTINGS,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to delete account.';
      set({ error: message, isLoading: false });
      throw err;
    }
  },
}));
