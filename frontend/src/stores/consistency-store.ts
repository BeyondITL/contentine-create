import { create } from 'zustand';
import { api } from '@/lib/api';

// ── State Interface ─────────────────────────────────────────

interface ConsistencyState {
  /** Map of "YYYY-MM-DD" → post count for the selected year. */
  data: Record<string, number>;
  currentStreak: number;
  bestStreak: number;
  totalPublished: number;
  year: number;
  isLoading: boolean;
  error: string | null;

  setYear: (year: number) => void;
  fetchConsistency: () => Promise<void>;
}

// ── Store ───────────────────────────────────────────────────

export const useConsistencyStore = create<ConsistencyState>((set, get) => ({
  data: {},
  currentStreak: 0,
  bestStreak: 0,
  totalPublished: 0,
  year: new Date().getFullYear(),
  isLoading: false,
  error: null,

  /** Set the year and re-fetch consistency data. */
  setYear: (year) => {
    set({ year });
    get().fetchConsistency();
  },

  /** Fetch the consistency heatmap data for the selected year. */
  fetchConsistency: async () => {
    const { year } = get();
    set({ isLoading: true, error: null });
    try {
      const response = await api.get<{
        data: Record<string, number>;
        current_streak: number;
        best_streak: number;
        total_published: number;
      }>(`/api/analytics/consistency?year=${year}`);

      set({
        data: response.data,
        currentStreak: response.current_streak,
        bestStreak: response.best_streak,
        totalPublished: response.total_published,
        error: null,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load consistency data.';
      set({
        data: {},
        currentStreak: 0,
        bestStreak: 0,
        totalPublished: 0,
        error: message,
      });
    } finally {
      set({ isLoading: false });
    }
  },
}));
