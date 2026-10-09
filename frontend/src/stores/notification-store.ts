import { create } from 'zustand';
import { api } from '@/lib/api';
import { localDB } from '@/lib/local-db';
import type { Notification } from '@/types';

// ── State Interface ──────────────────────────────────────────

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  isLoading: boolean;
  error: string | null;
  lastPollAt: string | null;

  fetchNotifications: () => Promise<void>;
  markRead: (id: number) => Promise<void>;
  markAllRead: () => Promise<void>;
  poll: () => Promise<void>;
  clearError: () => void;
}

// ── Store ────────────────────────────────────────────────────

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  isLoading: false,
  error: null,
  lastPollAt: null,

  /** Fetch all notifications — try API, fallback to IndexedDB. */
  fetchNotifications: async () => {
    set({ isLoading: true, error: null });
    try {
      const { notifications } = await api.get<{ notifications: Notification[] }>('/notifications');

      // Cache to IndexedDB
      try {
        await localDB.clear('notifications');
        for (const n of notifications) {
          await localDB.put<Notification>('notifications', n);
        }
      } catch {
        // Cache write failure is non-critical
      }

      set({
        notifications,
        unreadCount: notifications.filter((n) => !n.is_read).length,
        lastPollAt: new Date().toISOString(),
        error: null,
      });
    } catch {
      // Fallback: IndexedDB
      try {
        const local = await localDB.getAll<Notification>('notifications');
        const sorted = local.sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        set({
          notifications: sorted,
          unreadCount: sorted.filter((n) => !n.is_read).length,
          lastPollAt: new Date().toISOString(),
          error: null,
        });
      } catch {
        set({ error: 'Failed to load notifications.' });
      }
    } finally {
      set({ isLoading: false });
    }
  },

  /** Mark a single notification as read — local first. */
  markRead: async (id) => {
    // Optimistic local update
    set((s) => ({
      notifications: s.notifications.map((n) => (n.id === id ? { ...n, is_read: true } : n)),
      unreadCount: Math.max(0, s.unreadCount - 1),
    }));

    // Persist to IndexedDB
    try {
      const existing = await localDB.get<Notification>('notifications', id);
      if (existing) {
        await localDB.put<Notification>('notifications', { ...existing, is_read: true });
      }
    } catch {
      // non-critical
    }

    // API in background
    try {
      await api.put(`/notifications/${id}`, { is_read: true });
    } catch {
      // Keep local state — already persisted to IndexedDB
    }
  },

  /** Mark all notifications as read — local first. */
  markAllRead: async () => {
    const prev = get().notifications;

    // Optimistic local update
    const updated = prev.map((n) => ({ ...n, is_read: true }));
    set({ notifications: updated, unreadCount: 0 });

    // Persist to IndexedDB
    try {
      for (const n of updated) {
        await localDB.put<Notification>('notifications', n);
      }
    } catch {
      // non-critical
    }

    // API in background
    try {
      await api.put('/notifications/mark-all-read');
    } catch {
      // Keep local state — already persisted to IndexedDB
    }
  },

  /** Poll for new notifications since the last poll timestamp. */
  poll: async () => {
    const { lastPollAt } = get();
    try {
      const params = lastPollAt ? `?since=${encodeURIComponent(lastPollAt)}` : '';
      const { notifications: newNotifications } = await api.get<{ notifications: Notification[] }>(
        `/notifications/poll${params}`
      );

      if (newNotifications && newNotifications.length > 0) {
        // Cache new notifications locally
        try {
          for (const n of newNotifications) {
            await localDB.put<Notification>('notifications', n);
          }
        } catch {
          // non-critical
        }

        set((s) => {
          const existingIds = new Set(s.notifications.map((n) => n.id));
          const unique = newNotifications.filter((n) => !existingIds.has(n.id));
          const merged = [...unique, ...s.notifications];
          return {
            notifications: merged,
            unreadCount: merged.filter((n) => !n.is_read).length,
            lastPollAt: new Date().toISOString(),
          };
        });
      } else {
        set({ lastPollAt: new Date().toISOString() });
      }
    } catch {
      // Polling failures are silent — next poll will retry
    }
  },

  /** Clear the current error message. */
  clearError: () => set({ error: null }),
}));

// ── Exported helper: add a local notification from other stores ──

/** Add a notification to IndexedDB and update the store. */
export async function addLocalNotification(
  title: string,
  body: string,
  type: string = 'info',
): Promise<void> {
  const notification: Notification = {
    id: Date.now(),
    user_id: 0,
    type: type as Notification['type'],
    title,
    body,
    is_read: false,
    related_type: null,
    related_id: null,
    created_at: new Date().toISOString(),
  };

  try {
    await localDB.put<Notification>('notifications', notification);
  } catch {
    // IndexedDB write failure is non-critical
  }

  // Update store state
  const current = useNotificationStore.getState().notifications;
  useNotificationStore.setState({
    notifications: [notification, ...current],
    unreadCount: useNotificationStore.getState().unreadCount + 1,
  });
}
