import { create } from 'zustand';
import { api } from '@/lib/api';

// ── Types ───────────────────────────────────────────────────

export type WebhookEvent =
  | 'video.completed'
  | 'video.failed'
  | 'publish.success'
  | 'publish.failed'
  | 'remix.completed'
  | 'schedule.published'
  | 'team.member_joined';

export interface Webhook {
  id: number;
  url: string;
  events: WebhookEvent[];
  secret?: string;
  is_active: boolean;
  last_triggered_at: string | null;
  failure_count: number;
  created_at: string;
}

export interface WebhookTestResult {
  success: boolean;
  status_code: number | null;
  response_time_ms: number | null;
  error: string | null;
}

// ── State Interface ─────────────────────────────────────────

interface WebhooksState {
  webhooks: Webhook[];
  isLoading: boolean;
  error: string | null;
  testResult: WebhookTestResult | null;
  testingId: number | null;

  fetchWebhooks: () => Promise<void>;
  createWebhook: (url: string, events: WebhookEvent[]) => Promise<void>;
  updateWebhook: (id: number, data: Partial<Pick<Webhook, 'url' | 'events' | 'is_active'>>) => Promise<void>;
  deleteWebhook: (id: number) => Promise<void>;
  testWebhook: (id: number) => Promise<void>;
  clearTestResult: () => void;
}

// ── Store ───────────────────────────────────────────────────

export const useWebhooksStore = create<WebhooksState>((set, get) => ({
  webhooks: [],
  isLoading: false,
  error: null,
  testResult: null,
  testingId: null,

  /** Fetch all webhooks for the current user. */
  fetchWebhooks: async () => {
    set({ isLoading: true, error: null });
    try {
      const { webhooks } = await api.get<{ webhooks: Webhook[] }>('/api/webhooks');
      set({ webhooks, error: null });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load webhooks.';
      set({ webhooks: [], error: message });
    } finally {
      set({ isLoading: false });
    }
  },

  /** Create a new webhook endpoint. */
  createWebhook: async (url, events) => {
    set({ error: null });
    try {
      const { webhook } = await api.post<{ webhook: Webhook }>('/api/webhooks', {
        url,
        events,
      });
      set((s) => ({
        webhooks: [webhook, ...s.webhooks],
      }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create webhook.';
      set({ error: message });
      throw err;
    }
  },

  /** Update an existing webhook. */
  updateWebhook: async (id, data) => {
    set({ error: null });
    try {
      const { webhook } = await api.put<{ webhook: Webhook }>(`/api/webhooks/${id}`, data);
      set((s) => ({
        webhooks: s.webhooks.map((w) => (w.id === id ? { ...w, ...webhook } : w)),
      }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update webhook.';
      set({ error: message });
      throw err;
    }
  },

  /** Delete a webhook by id. */
  deleteWebhook: async (id) => {
    set({ error: null });
    try {
      await api.delete(`/api/webhooks/${id}`);
      set((s) => ({
        webhooks: s.webhooks.filter((w) => w.id !== id),
      }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to delete webhook.';
      set({ error: message });
      throw err;
    }
  },

  /** Send a test ping to a webhook endpoint. */
  testWebhook: async (id) => {
    set({ testResult: null, testingId: id });
    try {
      const { result } = await api.post<{ result: WebhookTestResult }>(`/api/webhooks/${id}/test`);
      set({ testResult: result, testingId: null });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Test request failed.';
      set({
        testResult: { success: false, status_code: null, response_time_ms: null, error: message },
        testingId: null,
      });
    }
  },

  /** Clear the test result banner. */
  clearTestResult: () => set({ testResult: null }),
}));
