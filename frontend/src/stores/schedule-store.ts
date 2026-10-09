import { create } from 'zustand';
import type {
  ScheduledPost,
  ScheduledPostWithVideo,
  SocialAccount,
  CTATemplate,
  CalendarDay,
  Platform,
  PostStatus,
  VideoType,
  BulkScheduleRow,
} from '@/types';
import { api } from '@/lib/api';
import { localDB } from '@/lib/local-db';

// ── Helpers ──────────────────────────────────────────────────

/** Group flat posts into CalendarDay[] keyed by YYYY-MM-DD. */
function groupByDate(posts: ScheduledPostWithVideo[]): CalendarDay[] {
  const map = new Map<string, ScheduledPostWithVideo[]>();
  for (const post of posts) {
    const date = post.scheduled_at.slice(0, 10); // YYYY-MM-DD
    if (!map.has(date)) map.set(date, []);
    map.get(date)!.push(post);
  }
  return Array.from(map.entries())
    .map(([date, posts]) => ({ date, posts }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Return first and last day of a month as ISO date strings. */
function monthBounds(date: Date): { dateFrom: string; dateTo: string } {
  const y = date.getFullYear();
  const m = date.getMonth();
  const last = new Date(y, m + 1, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    dateFrom: `${y}-${pad(m + 1)}-01`,
    dateTo: `${y}-${pad(m + 1)}-${pad(last.getDate())}`,
  };
}

// ── State Interface ──────────────────────────────────────────

interface ScheduleState {
  // Data
  posts: ScheduledPostWithVideo[];
  calendarDays: CalendarDay[];
  socialAccounts: SocialAccount[];
  ctaTemplates: CTATemplate[];

  // UI
  isLoading: boolean;
  fetchError: string | null;
  selectedDate: string | null;
  selectedPost: ScheduledPostWithVideo | null;
  currentMonth: Date;
  platformFilter: Platform | 'all';
  statusFilter: PostStatus | 'all';

  // Fetch
  fetchPosts: (month?: Date) => Promise<void>;
  fetchSocialAccounts: () => Promise<void>;
  fetchCTATemplates: () => Promise<void>;

  // Post CRUD
  createPost: (data: Omit<ScheduledPost, 'id' | 'status' | 'published_url' | 'error_message'>) => Promise<ScheduledPostWithVideo>;
  updatePost: (id: number, data: Partial<ScheduledPost>) => Promise<void>;
  deletePost: (id: number) => Promise<void>;
  reschedulePost: (id: number, newDate: string) => Promise<void>;

  // Publishing
  publishNow: (
    platform: Platform,
    videoId: number,
    title: string,
    description: string,
    tags: string[],
    hashtags: string[],
    ctaTemplateId?: number
  ) => Promise<void>;

  // Bulk
  bulkSchedule: (rows: BulkScheduleRow[]) => Promise<void>;

  // CTA Templates
  createCTATemplate: (data: Pick<CTATemplate, 'name' | 'cta_text' | 'links' | 'is_default'>) => Promise<CTATemplate>;
  updateCTATemplate: (id: number, data: Partial<CTATemplate>) => Promise<void>;
  deleteCTATemplate: (id: number) => Promise<void>;

  // Social accounts
  disconnectSocial: (id: number) => Promise<void>;

  // UI setters
  setSelectedDate: (date: string | null) => void;
  setSelectedPost: (post: ScheduledPostWithVideo | null) => void;
  setCurrentMonth: (date: Date) => void;
  setPlatformFilter: (platform: Platform | 'all') => void;
  setStatusFilter: (status: PostStatus | 'all') => void;
}

// ── Store ────────────────────────────────────────────────────

export const useScheduleStore = create<ScheduleState>((set, get) => ({
  posts: [],
  calendarDays: [],
  socialAccounts: [],
  ctaTemplates: [],
  isLoading: false,
  fetchError: null,
  selectedDate: null,
  selectedPost: null,
  currentMonth: new Date(),
  platformFilter: 'all',
  statusFilter: 'all',

  // ── Fetch ────────────────────────────────────────────────

  fetchPosts: async (month) => {
    const target = month || get().currentMonth;
    const { dateFrom, dateTo } = monthBounds(target);
    set({ isLoading: true, fetchError: null });
    try {
      const data = await api.get<{ posts: ScheduledPostWithVideo[] }>(
        `/schedule?date_from=${dateFrom}&date_to=${dateTo}`
      );
      const posts = Array.isArray(data?.posts) ? data.posts : [];
      const calendarDays = groupByDate(posts);
      set({ posts, calendarDays, fetchError: null });
      // Sync to local
      for (const p of posts) await localDB.put('scheduled_posts', p);
    } catch (err: unknown) {
      // Fallback to localDB
      try {
        const allPosts = await localDB.getAll<ScheduledPostWithVideo>('scheduled_posts');
        // Filter to current month range
        const posts = allPosts.filter((p) => {
          const d = p.scheduled_at?.slice(0, 10);
          return d && d >= dateFrom && d <= dateTo;
        });
        const calendarDays = groupByDate(posts);
        set({ posts, calendarDays, fetchError: null });
      } catch {
        const message = err instanceof Error ? err.message : 'Failed to load scheduled posts. Please try again.';
        set({ posts: [], calendarDays: [], fetchError: message });
      }
    } finally {
      set({ isLoading: false });
    }
  },

  fetchSocialAccounts: async () => {
    try {
      const data = await api.get<{ accounts: SocialAccount[] }>('/social-accounts');
      const accounts = Array.isArray(data?.accounts) ? data.accounts : [];
      set({ socialAccounts: accounts });
      // Sync to local
      for (const a of accounts) await localDB.put('social_accounts', a);
    } catch {
      // Fallback to localDB
      try {
        const accounts = await localDB.getAll<SocialAccount>('social_accounts');
        set({ socialAccounts: accounts });
      } catch {
        set({ socialAccounts: [] });
      }
    }
  },

  fetchCTATemplates: async () => {
    try {
      const data = await api.get<{ templates: CTATemplate[] }>('/cta-templates');
      set({ ctaTemplates: Array.isArray(data?.templates) ? data.templates : [] });
    } catch {
      set({ ctaTemplates: [] });
    }
  },

  // ── Post CRUD ────────────────────────────────────────────

  createPost: async (data) => {
    const post = {
      ...data,
      id: Date.now(),
      status: 'pending' as PostStatus,
      published_url: null,
      error_message: null,
      created_at: new Date().toISOString(),
      video_title: '',
      video_thumbnail: null,
      video_type: 'faceless' as VideoType,
    } as ScheduledPostWithVideo;
    const saved = await localDB.put<ScheduledPostWithVideo>('scheduled_posts', post);
    set((s) => {
      const posts = [saved, ...(s.posts ?? [])];
      return { posts, calendarDays: groupByDate(posts) };
    });
    // Sync to backend in background
    api.post<{ post: ScheduledPostWithVideo }>('/schedule', data)
      .then((res) => {
        if (res?.post) {
          localDB.put('scheduled_posts', res.post).catch(() => {});
          set((s) => {
            const posts = s.posts.map((p) => (p.id === saved.id ? res.post : p));
            return { posts, calendarDays: groupByDate(posts) };
          });
        }
      })
      .catch(() => {});
    return saved;
  },

  updatePost: async (id, data) => {
    const existing = await localDB.get<ScheduledPostWithVideo>('scheduled_posts', id);
    if (existing) {
      await localDB.put('scheduled_posts', { ...existing, ...data });
    }
    set((s) => {
      const posts = s.posts.map((p) => (p.id === id ? { ...p, ...data } : p));
      return {
        posts,
        calendarDays: groupByDate(posts),
        selectedPost: s.selectedPost?.id === id ? { ...s.selectedPost, ...data } : s.selectedPost,
      };
    });
    // Sync to backend in background
    api.put(`/schedule/${id}`, data).catch(() => {});
  },

  deletePost: async (id) => {
    await localDB.delete('scheduled_posts', id);
    set((s) => {
      const posts = s.posts.filter((p) => p.id !== id);
      return {
        posts,
        calendarDays: groupByDate(posts),
        selectedPost: s.selectedPost?.id === id ? null : s.selectedPost,
      };
    });
    // Sync to backend in background
    api.delete(`/schedule/${id}`).catch(() => {});
  },

  reschedulePost: async (id, newDate) => {
    const existing = await localDB.get<ScheduledPostWithVideo>('scheduled_posts', id);
    if (existing) {
      await localDB.put('scheduled_posts', { ...existing, scheduled_at: newDate });
    }
    set((s) => {
      const posts = s.posts.map((p) =>
        p.id === id ? { ...p, scheduled_at: newDate } : p
      );
      return {
        posts,
        calendarDays: groupByDate(posts),
        selectedPost: s.selectedPost?.id === id
          ? { ...s.selectedPost, scheduled_at: newDate }
          : s.selectedPost,
      };
    });
    // Sync to backend in background
    api.put(`/schedule/${id}`, { scheduled_at: newDate }).catch(() => {});
  },

  // ── Publishing ───────────────────────────────────────────

  publishNow: async (platform, videoId, title, description, tags, hashtags, ctaTemplateId) => {
    const { socialAccounts } = get();
    const account = socialAccounts.find((a) => a.platform === platform);

    // Check if the platform is connected
    if (!account) {
      const platformLabel = platform.charAt(0).toUpperCase() + platform.slice(1);
      throw new Error(`Connect ${platformLabel} first. Go to Settings \u2192 Integrations to link your account.`);
    }

    // Check if the token has expired
    if (account.token_expires_at) {
      const expiry = new Date(account.token_expires_at).getTime();
      if (expiry < Date.now()) {
        const platformLabel = platform.charAt(0).toUpperCase() + platform.slice(1);
        throw new Error(`Your ${platformLabel} token has expired. Reconnect in Settings \u2192 Integrations.`);
      }
    }

    try {
      const res = await api.post<{ post: ScheduledPostWithVideo }>(`/publish/${platform}`, {
        video_id: videoId,
        title,
        description,
        tags,
        hashtags,
        cta_template_id: ctaTemplateId,
      });
      const post = res?.post;
      if (post) {
        await localDB.put('scheduled_posts', post).catch(() => {});
        set((s) => {
          const posts = [post, ...(s.posts ?? [])];
          return { posts, calendarDays: groupByDate(posts) };
        });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Publishing failed.';
      // Surface specific backend error about missing API keys
      if (message.toLowerCase().includes('not configured') || message.toLowerCase().includes('api key')) {
        const platformLabel = platform.charAt(0).toUpperCase() + platform.slice(1);
        throw new Error(`Configure ${platformLabel} API credentials in Admin \u2192 System Keys`);
      }
      throw err;
    }
  },

  // ── Bulk Schedule ────────────────────────────────────────

  bulkSchedule: async (rows) => {
    // One batch call to the real bulk endpoint, which records a bulk_jobs row and
    // fans the rows out into scheduled_posts server-side (SA-09 / F-45). The server
    // returns the created posts plus any per-row errors — no client-side fan-out.
    const res = await api.post<{
      job: { id: number; total_count: number; completed_count: number; status: string };
      posts: ScheduledPostWithVideo[];
      errors: { row: number; error: string }[];
    }>('/schedule/bulk', {
      rows: rows.map((row) => ({
        video_id: row.video_id,
        platform: row.platform,
        scheduled_at: row.scheduled_at,
        title: row.title,
        description: row.description,
        tags: row.tags,
        hashtags: row.hashtags,
      })),
    });

    const newPosts: ScheduledPostWithVideo[] = res?.posts ?? [];

    if (newPosts.length > 0) {
      // Sync to local
      for (const p of newPosts) await localDB.put('scheduled_posts', p).catch(() => {});
      set((s) => {
        const posts = [...newPosts, ...s.posts];
        return { posts, calendarDays: groupByDate(posts) };
      });
    }
  },

  // ── CTA Templates ───────────────────────────────────────

  createCTATemplate: async (data) => {
    const res = await api.post<{ template: CTATemplate }>('/cta-templates', data);
    const template = res?.template;
    if (!template) throw new Error('Failed to create CTA template');
    set((s) => ({ ctaTemplates: [...(s.ctaTemplates ?? []), template] }));
    return template;
  },

  updateCTATemplate: async (id, data) => {
    await api.put(`/cta-templates/${id}`, data);
    set((s) => ({
      ctaTemplates: s.ctaTemplates.map((t) => (t.id === id ? { ...t, ...data } : t)),
    }));
  },

  deleteCTATemplate: async (id) => {
    await api.delete(`/cta-templates/${id}`);
    set((s) => ({
      ctaTemplates: s.ctaTemplates.filter((t) => t.id !== id),
    }));
  },

  // ── Social Accounts ─────────────────────────────────────

  disconnectSocial: async (id) => {
    await localDB.delete('social_accounts', id);
    set((s) => ({
      socialAccounts: s.socialAccounts.filter((a) => a.id !== id),
    }));
    // Sync to backend in background
    api.delete(`/social-accounts/${id}`).catch(() => {});
  },

  // ── UI Setters ──────────────────────────────────────────

  setSelectedDate: (date) => set({ selectedDate: date }),

  setSelectedPost: (post) => set({ selectedPost: post }),

  setCurrentMonth: (date) => {
    set({ currentMonth: date });
    get().fetchPosts(date);
  },

  setPlatformFilter: (platform) => set({ platformFilter: platform }),

  setStatusFilter: (status) => set({ statusFilter: status }),
}));
