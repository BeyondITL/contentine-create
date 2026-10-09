import { create } from 'zustand';
import { api } from '@/lib/api';

// ── Types ───────────────────────────────────────────────────

export type ApiKeyScope =
  | 'videos:read'
  | 'videos:write'
  | 'content:read'
  | 'content:write'
  | 'analytics:read'
  | 'publish:write';

export interface ApiKey {
  id: number;
  name: string;
  key_prefix: string;
  scopes: ApiKeyScope[];
  last_used_at: string | null;
  created_at: string;
}

// ── State Interface ─────────────────────────────────────────

interface ApiKeysState {
  keys: ApiKey[];
  isLoading: boolean;
  error: string | null;

  /** Temporarily holds the full secret after creation (shown once). */
  newlyCreatedSecret: string | null;

  fetchKeys: () => Promise<void>;
  createKey: (name: string, scopes: ApiKeyScope[]) => Promise<void>;
  revokeKey: (id: number) => Promise<void>;
  clearNewSecret: () => void;
}

// ── Store ───────────────────────────────────────────────────

export const useApiKeysStore = create<ApiKeysState>((set, get) => ({
  keys: [],
  isLoading: false,
  error: null,
  newlyCreatedSecret: null,

  /** Fetch all API keys for the current user. */
  fetchKeys: async () => {
    set({ isLoading: true, error: null });
    try {
      const { keys } = await api.get<{ keys: ApiKey[] }>('/api/keys');
      set({ keys, error: null });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load API keys.';
      set({ keys: [], error: message });
    } finally {
      set({ isLoading: false });
    }
  },

  /** Create a new API key and store the returned secret for one-time display. */
  createKey: async (name, scopes) => {
    set({ error: null });
    try {
      const { key, secret } = await api.post<{ key: ApiKey; secret: string }>('/api/keys', {
        name,
        scopes,
      });
      set((s) => ({
        keys: [key, ...s.keys],
        newlyCreatedSecret: secret,
      }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create API key.';
      set({ error: message });
      throw err;
    }
  },

  /** Revoke (delete) an API key by id. */
  revokeKey: async (id) => {
    set({ error: null });
    try {
      await api.delete(`/api/keys/${id}`);
      set((s) => ({
        keys: s.keys.filter((k) => k.id !== id),
      }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to revoke API key.';
      set({ error: message });
      throw err;
    }
  },

  /** Clear the one-time secret display. */
  clearNewSecret: () => set({ newlyCreatedSecret: null }),
}));
