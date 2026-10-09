import { create } from 'zustand';
import { api } from '@/lib/api';

// ── Types ────────────────────────────────────────────────────

interface ByokKey {
  service: string;
  label: string;
  is_active: boolean;
  last_used_at: string | null;
  last_error: string | null;
  created_at: string;
}

interface ByokState {
  keys: ByokKey[];
  isLoading: boolean;
  error: string | null;
  fetchKeys: () => Promise<void>;
  addKey: (service: string, apiKey: string, label?: string) => Promise<{ success: boolean; error?: string; masked?: string }>;
  removeKey: (service: string) => Promise<void>;
  testKey: (service: string) => Promise<{ success: boolean; message: string }>;
}

// ── Store ────────────────────────────────────────────────────

/** Zustand store for managing user BYOK (Bring Your Own Key) API keys. */
export const useByokStore = create<ByokState>((set, get) => ({
  keys: [],
  isLoading: false,
  error: null,

  /** Fetch all BYOK keys for the current user. */
  fetchKeys: async () => {
    set({ isLoading: true, error: null });
    try {
      const data = await api.get<{ keys: ByokKey[] }>('/user/keys');
      set({ keys: data.keys ?? [], error: null });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load API keys.';
      set({ error: message });
    } finally {
      set({ isLoading: false });
    }
  },

  /** Add a new BYOK key for a given service. */
  addKey: async (service, apiKey, label) => {
    set({ error: null });
    try {
      const data = await api.post<{ success: boolean; masked?: string; error?: string }>(
        '/user/keys',
        { service, api_key: apiKey, label }
      );
      if (data.success) {
        // Re-fetch to get the updated list from the server
        await get().fetchKeys();
      }
      return data;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to add API key.';
      set({ error: message });
      return { success: false, error: message };
    }
  },

  /** Remove a BYOK key for a given service. */
  removeKey: async (service) => {
    set({ error: null });
    try {
      await api.delete(`/user/keys/${encodeURIComponent(service)}`);
      // Optimistically remove from local state
      set((state) => ({
        keys: state.keys.filter((k) => k.service !== service),
      }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to remove API key.';
      set({ error: message });
      throw err;
    }
  },

  /** Test a BYOK key to verify it works. */
  testKey: async (service) => {
    set({ error: null });
    try {
      const data = await api.get<{ success: boolean; message: string }>(
        `/user/keys/test/${encodeURIComponent(service)}`
      );
      // Refresh keys to pick up any updated last_used_at or last_error
      await get().fetchKeys();
      return data;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Key test failed.';
      return { success: false, message };
    }
  },
}));
