import { create } from 'zustand';
import type {
  AnalyticsRange,
  AnalyticsSummary,
  DailyAnalytics,
  VideoAnalytics,
  PlatformAnalytics,
  AnalyticsAlert,
  AnalyticsMetric,
} from '@/types';
import { api } from '@/lib/api';
import { localDB } from '@/lib/local-db';

// ── State Interface ──────────────────────────────────────────

interface AnalyticsState {
  // Filters
  range: AnalyticsRange;
  platform: string;

  // Data
  summary: AnalyticsSummary | null;
  daily: DailyAnalytics[];
  perVideo: VideoAnalytics[];
  platformBreakdown: PlatformAnalytics[];
  alerts: AnalyticsAlert[];

  // UI
  isLoading: boolean;
  error: string | null;

  // Actions
  setRange: (range: AnalyticsRange) => void;
  setPlatform: (platform: string) => void;
  fetchAnalytics: () => Promise<void>;
  fetchAlerts: () => Promise<void>;
  createAlert: (metric: AnalyticsMetric, threshold: number) => Promise<AnalyticsAlert>;
  updateAlert: (id: number, data: Partial<Pick<AnalyticsAlert, 'metric' | 'threshold' | 'is_active'>>) => Promise<void>;
  deleteAlert: (id: number) => Promise<void>;
  exportData: (format: 'csv' | 'html') => Promise<void>;
}

/** Compute analytics from local video data when backend is unavailable. */
async function computeLocalAnalytics(): Promise<{
  summary: AnalyticsSummary;
  daily: DailyAnalytics[];
  perVideo: VideoAnalytics[];
  platformBreakdown: PlatformAnalytics[];
}> {
  const totalVideos = await localDB.count('videos');
  const allVideos = await localDB.getAll<{
    id: number;
    title?: string;
    status?: string;
    platform?: string;
    created_at?: string;
  }>('videos');

  const published = allVideos.filter((v) => v.status === 'published');

  // Build daily chart from creation dates
  const dailyMap = new Map<string, DailyAnalytics>();
  for (const video of allVideos) {
    const date = video.created_at ? video.created_at.slice(0, 10) : new Date().toISOString().slice(0, 10);
    if (!dailyMap.has(date)) {
      dailyMap.set(date, { date, views: 0, likes: 0, comments: 0, shares: 0 });
    }
    const entry = dailyMap.get(date)!;
    entry.views += 1;
  }
  const daily = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));

  // Platform breakdown from published videos
  const platformMap = new Map<string, PlatformAnalytics>();
  for (const video of published) {
    const plat = video.platform || 'local';
    if (!platformMap.has(plat)) {
      platformMap.set(plat, { platform: plat, views: 0, likes: 0, comments: 0, shares: 0 });
    }
    platformMap.get(plat)!.views += 1;
  }
  const platformBreakdown = Array.from(platformMap.values());

  const topPlatform = platformBreakdown.length > 0
    ? platformBreakdown.reduce((a, b) => (a.views >= b.views ? a : b)).platform
    : 'none';

  const summary: AnalyticsSummary = {
    total_views: totalVideos,
    total_likes: 0,
    total_comments: 0,
    total_shares: 0,
    avg_ctr: 0,
    top_platform: topPlatform,
    best_video_id: allVideos.length > 0 ? allVideos[0].id : null,
  };

  const perVideo: VideoAnalytics[] = allVideos.slice(0, 20).map((v) => ({
    video_id: v.id,
    title: v.title || `Video #${v.id}`,
    platform: v.platform || 'local',
    views: 0,
    likes: 0,
    comments: 0,
    shares: 0,
    ctr: 0,
  }));

  return { summary, daily, perVideo, platformBreakdown };
}

// ── Store ────────────────────────────────────────────────────

export const useAnalyticsStore = create<AnalyticsState>((set, get) => ({
  range: '30d',
  platform: 'all',
  summary: null,
  daily: [],
  perVideo: [],
  platformBreakdown: [],
  alerts: [],
  isLoading: false,
  error: null,

  setRange: (range) => {
    set({ range });
    get().fetchAnalytics();
  },

  setPlatform: (platform) => {
    set({ platform });
    get().fetchAnalytics();
  },

  fetchAnalytics: async () => {
    const { range, platform } = get();
    set({ isLoading: true, error: null });
    try {
      const params = new URLSearchParams({ range });
      if (platform !== 'all') params.append('platform', platform);

      const data = await api.get<{
        summary: AnalyticsSummary;
        daily: DailyAnalytics[];
        per_video: VideoAnalytics[];
        platform_breakdown: PlatformAnalytics[];
      }>(`/analytics?${params.toString()}`);

      // Cache the snapshot locally
      try {
        await localDB.put('analytics_snapshots', {
          id: 1,
          summary: data?.summary ?? null,
          daily: Array.isArray(data?.daily) ? data.daily : [],
          perVideo: Array.isArray(data?.per_video) ? data.per_video : [],
          platformBreakdown: Array.isArray(data?.platform_breakdown) ? data.platform_breakdown : [],
          fetched_at: new Date().toISOString(),
        });
      } catch {
        // IndexedDB cache write failure is non-critical
      }

      set({
        summary: data?.summary ?? null,
        daily: Array.isArray(data?.daily) ? data.daily : [],
        perVideo: Array.isArray(data?.per_video) ? data.per_video : [],
        platformBreakdown: Array.isArray(data?.platform_breakdown) ? data.platform_breakdown : [],
        error: null,
      });
    } catch {
      // Fallback: compute from local video data
      try {
        const local = await computeLocalAnalytics();
        set({
          summary: local.summary,
          daily: local.daily,
          perVideo: local.perVideo,
          platformBreakdown: local.platformBreakdown,
          error: null,
        });
      } catch {
        set({
          summary: null,
          daily: [],
          perVideo: [],
          platformBreakdown: [],
          error: 'Analytics unavailable offline.',
        });
      }
    } finally {
      set({ isLoading: false });
    }
  },

  fetchAlerts: async () => {
    try {
      const data = await api.get<{ alerts: AnalyticsAlert[] }>('/analytics/alerts');
      set({ alerts: Array.isArray(data?.alerts) ? data.alerts : [] });
    } catch {
      // Fallback: empty array when offline
      set({ alerts: [] });
    }
  },

  createAlert: async (metric, threshold) => {
    const alert: AnalyticsAlert = {
      id: Date.now(),
      metric,
      threshold,
      is_active: true,
      last_triggered_at: null,
      created_at: new Date().toISOString(),
    };

    // Local first
    set((s) => ({ alerts: [...(s.alerts ?? []), alert] }));

    // API in background
    try {
      const res = await api.post<{ alert: AnalyticsAlert }>('/analytics/alerts', {
        metric,
        threshold,
      });
      if (res?.alert) {
        // Replace the temp local alert with the server one
        set((s) => ({
          alerts: s.alerts.map((a) => (a.id === alert.id ? res.alert : a)),
        }));
        return res.alert;
      }
    } catch {
      // Keep local version
    }
    return alert;
  },

  updateAlert: async (id, data) => {
    // Local first
    set((s) => ({
      alerts: s.alerts.map((a) => (a.id === id ? { ...a, ...data } : a)),
    }));

    // API in background
    try {
      await api.put(`/analytics/alerts/${id}`, data);
    } catch {
      // Keep local state
    }
  },

  deleteAlert: async (id) => {
    // Local first
    set((s) => ({
      alerts: s.alerts.filter((a) => a.id !== id),
    }));

    // API in background
    try {
      await api.delete(`/analytics/alerts/${id}`);
    } catch {
      // Already removed locally
    }
  },

  exportData: async (format) => {
    const { range, platform } = get();
    const params = new URLSearchParams({ range, format });
    if (platform !== 'all') params.append('platform', platform);

    try {
      const blob = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || '/api'}/analytics/export?${params.toString()}`,
        { headers: { 'Content-Type': 'application/json' } }
      ).then((r) => r.blob());

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `contentine-analytics-${range}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // Silently fail — toast would be handled at component level
    }
  },
}));
