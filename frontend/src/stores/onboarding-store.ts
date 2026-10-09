import { create } from 'zustand';
import { api } from '@/lib/api';

// --- localStorage key ---
const LS_ONBOARDING_KEY = 'contentine_onboarding';

// ── Persisted shape ─────────────────────────────────────────

interface OnboardingPersisted {
  step: 1 | 2 | 3 | 4;
  contentTypes: string[];
  connectedPlatforms: string[];
  firstAction: string;
  completed: boolean;
}

// ── State Interface ─────────────────────────────────────────

interface OnboardingState {
  step: 1 | 2 | 3 | 4;
  contentTypes: string[];
  connectedPlatforms: string[];
  firstAction: string;
  isSubmitting: boolean;
  completed: boolean;

  setStep: (step: 1 | 2 | 3 | 4) => void;
  toggleContentType: (type: string) => void;
  addConnectedPlatform: (platform: string) => void;
  setFirstAction: (action: string) => void;
  completeOnboarding: () => Promise<void>;
  reset: () => void;
}

// ── localStorage helpers ────────────────────────────────────

/** Load persisted onboarding state from localStorage. */
function loadFromStorage(): Partial<OnboardingPersisted> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(LS_ONBOARDING_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Partial<OnboardingPersisted>;
  } catch {
    return {};
  }
}

/** Save onboarding state to localStorage. */
function saveToStorage(state: OnboardingPersisted): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LS_ONBOARDING_KEY, JSON.stringify(state));
  } catch {
    // Storage full or unavailable — non-fatal
  }
}

/** Persist current state snapshot from the store. */
function persistState(get: () => OnboardingState): void {
  const { step, contentTypes, connectedPlatforms, firstAction, completed } = get();
  saveToStorage({ step, contentTypes, connectedPlatforms, firstAction, completed });
}

// ── Initial state from localStorage ─────────────────────────

const persisted = loadFromStorage();

// ── Store ───────────────────────────────────────────────────

export const useOnboardingStore = create<OnboardingState>((set, get) => ({
  step: persisted.step ?? 1,
  contentTypes: persisted.contentTypes ?? [],
  connectedPlatforms: persisted.connectedPlatforms ?? [],
  firstAction: persisted.firstAction ?? '',
  isSubmitting: false,
  completed: persisted.completed ?? false,

  /** Navigate to a specific onboarding step. */
  setStep: (step) => {
    set({ step });
    persistState(get);
  },

  /** Toggle a content type in or out of the selection. */
  toggleContentType: (type) => {
    set((s) => ({
      contentTypes: s.contentTypes.includes(type)
        ? s.contentTypes.filter((t) => t !== type)
        : [...s.contentTypes, type],
    }));
    persistState(get);
  },

  /** Record a platform that the user connected during onboarding. */
  addConnectedPlatform: (platform) => {
    set((s) => ({
      connectedPlatforms: s.connectedPlatforms.includes(platform)
        ? s.connectedPlatforms
        : [...s.connectedPlatforms, platform],
    }));
    persistState(get);
  },

  /** Set the user's chosen first action after onboarding. */
  setFirstAction: (action) => {
    set({ firstAction: action });
    persistState(get);
  },

  /** Submit onboarding data and redirect based on the chosen first action. */
  completeOnboarding: async () => {
    const { contentTypes, connectedPlatforms, firstAction } = get();
    set({ isSubmitting: true });

    // Save completed state locally first
    set({ completed: true });
    persistState(get);

    // Try API save in background — non-blocking
    try {
      await api.post('/user/onboarding', {
        content_types: contentTypes,
        connected_platforms: connectedPlatforms,
        first_action: firstAction,
      });
    } catch {
      // API save failed — local state is still persisted, non-fatal
    }

    set({ isSubmitting: false });

    // Redirect based on the user's chosen first action
    const redirectMap: Record<string, string> = {
      create_video: '/editor',
      remix_content: '/remix',
      explore_ideas: '/discover',
      connect_accounts: '/settings?tab=social',
      browse_templates: '/templates',
    };

    const target = redirectMap[firstAction] || '/dashboard';

    if (typeof window !== 'undefined') {
      window.location.href = target;
    }
  },

  /** Reset the onboarding store to its initial state. */
  reset: () => {
    set({
      step: 1,
      contentTypes: [],
      connectedPlatforms: [],
      firstAction: '',
      isSubmitting: false,
      completed: false,
    });
    persistState(get);
  },
}));
