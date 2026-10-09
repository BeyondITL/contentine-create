import { create } from 'zustand';
import { api } from '@/lib/api';
import { localDB } from '@/lib/local-db';
import type { IdeaPlatform, IdeaSearchResult, FavouriteTopic } from '@/types';

/** Platform display names for LLM prompt context. */
const PLATFORM_LABELS: Record<IdeaPlatform, string> = {
  google: 'Google Search',
  youtube: 'YouTube',
  bing: 'Bing',
  tiktok: 'TikTok',
  instagram: 'Instagram',
  twitter: 'X / Twitter',
  pinterest: 'Pinterest',
  quora: 'Quora',
};

/**
 * Browser-native fallback: generate topic ideas via browserEngineManager
 * (Gemini Nano or WebLLM) when the backend API is unavailable.
 */
async function generateIdeasWithBrowserEngine(
  query: string,
  platform: IdeaPlatform,
): Promise<IdeaSearchResult[]> {
  const { browserEngineManager } = await import('@/engine/browser-engine-manager');
  const textEngine = await browserEngineManager.getTextEngine();

  const platformName = PLATFORM_LABELS[platform] || platform;

  const systemPrompt = `You are a content strategist specializing in trending topic discovery. You return only valid JSON with no extra text.`;

  const userPrompt = `Generate 10 trending content ideas for "${query}" on ${platformName}.
Return ONLY a JSON array (no markdown, no code fences, no extra text):
[{"title": "Topic title", "description": "Brief 1-sentence description of why this is trending or useful", "source_platform": "${platform}"}]`;

  const result = await textEngine.generate(systemPrompt, userPrompt, {
    temperature: 0.8,
    maxTokens: 1500,
  });

  // Extract JSON from the response (handle possible markdown code fences)
  let jsonStr = result.trim();
  const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    jsonStr = fenceMatch[1].trim();
  }

  try {
    const parsed = JSON.parse(jsonStr);
    if (Array.isArray(parsed)) {
      return parsed.map((item: Record<string, unknown>) => ({
        title: String(item.title || ''),
        description: String(item.description || ''),
        source_platform: platform,
        search_volume: undefined,
      }));
    }
  } catch {
    // If JSON parsing fails, return the raw text as a single result
  }

  return [{ title: result.slice(0, 200), description: '', source_platform: platform }];
}

interface DiscoverState {
  // Search state
  query: string;
  activePlatform: IdeaPlatform;
  results: IdeaSearchResult[];
  isSearching: boolean;
  searchError: string | null;
  // Honest gating (SA-02/F-43): true when the selected platform has no key-free
  // public API and the operator hasn't provisioned a key — the backend returns
  // { unavailable: true, reason } rather than fabricated results.
  unavailable: boolean;
  unavailableReason: string | null;
  recentSearches: string[];

  // Favourites
  favourites: FavouriteTopic[];
  isFavouritesLoading: boolean;
  showFavourites: boolean;

  // Actions
  setQuery: (query: string) => void;
  setActivePlatform: (platform: IdeaPlatform) => void;
  search: () => Promise<void>;
  fetchFavourites: () => Promise<void>;
  addFavourite: (topic: string, platform: IdeaPlatform, volume?: number) => Promise<void>;
  removeFavourite: (id: number) => Promise<void>;
  isFavourited: (topic: string) => boolean;
  toggleShowFavourites: () => void;
  clearResults: () => void;
}

export const useDiscoverStore = create<DiscoverState>((set, get) => ({
  query: '',
  activePlatform: 'youtube',
  results: [],
  isSearching: false,
  searchError: null,
  unavailable: false,
  unavailableReason: null,
  recentSearches: [],

  favourites: [],
  isFavouritesLoading: false,
  showFavourites: false,

  setQuery: (query) => set({ query }),

  setActivePlatform: (platform) => {
    set({ activePlatform: platform, results: [], searchError: null, unavailable: false, unavailableReason: null });
    // Auto-search if there's a query
    if (get().query.trim()) {
      get().search();
    }
  },

  search: async () => {
    const { query, activePlatform } = get();
    if (!query.trim()) return;

    set({ isSearching: true, searchError: null, unavailable: false, unavailableReason: null });

    // Add to recent searches (deduped, max 10)
    const recent = get().recentSearches.filter((s) => s !== query.trim());
    recent.unshift(query.trim());
    if (recent.length > 10) recent.pop();

    try {
      // Primary path: backend API. Real key-free autocomplete for google/youtube/bing;
      // for platforms without a key-free API the backend returns unavailable + reason
      // (never fabricated results).
      const res = await api.post<{ results: IdeaSearchResult[]; cached: boolean; unavailable?: boolean; reason?: string }>('/ideas/search', {
        query: query.trim(),
        platform: activePlatform,
      });
      if (res.unavailable) {
        set({
          results: [],
          unavailable: true,
          unavailableReason: res.reason || 'This platform requires an API key that has not been configured.',
          recentSearches: recent,
          isSearching: false,
        });
        return;
      }
      set({ results: res.results || [], recentSearches: recent, isSearching: false });
    } catch (apiErr: unknown) {
      // Fallback: browser-native AI (Gemini Nano or WebLLM) for topic suggestions
      try {
        const ideas = await generateIdeasWithBrowserEngine(query.trim(), activePlatform);
        set({ results: ideas, recentSearches: recent, isSearching: false });
      } catch (llmErr: unknown) {
        // Both paths failed — show a helpful error
        const apiMsg = apiErr instanceof Error ? apiErr.message : '';
        const llmMsg = llmErr instanceof Error ? llmErr.message : '';

        let errorMessage: string;
        if (llmMsg.includes('still loading')) {
          errorMessage = llmMsg;
        } else if (llmMsg.includes('No browser text engine') || llmMsg.includes('No compatible model') || llmMsg.includes('GPU')) {
          errorMessage =
            'Backend search unavailable and no browser AI engine detected. Check your API configuration, or use Chrome 137+ (Gemini Nano) or a WebGPU-capable browser.';
        } else {
          errorMessage = apiMsg || 'Search failed. Check your network connection and try again.';
        }

        set({ searchError: errorMessage, recentSearches: recent, isSearching: false });
      }
    }
  },

  /** Fetch favourites — try API, fallback to IndexedDB. */
  fetchFavourites: async () => {
    set({ isFavouritesLoading: true });
    try {
      const res = await api.get<{ favourites: FavouriteTopic[] }>('/ideas/favourites');
      const favourites = res.favourites || [];

      // Cache to IndexedDB
      try {
        await localDB.clear('favourites');
        for (const f of favourites) {
          await localDB.put<FavouriteTopic>('favourites', f);
        }
      } catch {
        // Cache write failure is non-critical
      }

      set({ favourites, isFavouritesLoading: false });
    } catch {
      // Fallback: IndexedDB
      try {
        const local = await localDB.getAll<FavouriteTopic>('favourites');
        const sorted = local.sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        set({ favourites: sorted, isFavouritesLoading: false });
      } catch {
        set({ favourites: [], isFavouritesLoading: false });
      }
    }
  },

  /** Save a favourite — local first, API in background. */
  addFavourite: async (topic, platform, volume) => {
    const favourite: FavouriteTopic = {
      id: Date.now(),
      user_id: 0,
      topic_text: topic,
      source_platform: platform,
      search_volume: volume ?? null,
      created_at: new Date().toISOString(),
    };

    // Local first
    try {
      await localDB.put<FavouriteTopic>('favourites', favourite);
    } catch {
      // non-critical
    }
    set((s) => ({ favourites: [favourite, ...s.favourites] }));

    // API in background
    try {
      const res = await api.post<FavouriteTopic>('/ideas/favourites', {
        topic_text: topic,
        source_platform: platform,
        search_volume: volume ?? null,
      });
      if (res && res.id) {
        // Replace local with server version
        try {
          await localDB.delete('favourites', favourite.id);
          await localDB.put<FavouriteTopic>('favourites', res);
        } catch {
          // non-critical
        }
        set((s) => ({
          favourites: s.favourites.map((f) => (f.id === favourite.id ? res : f)),
        }));
      }
    } catch {
      // Keep local version — might be duplicate or offline
    }
  },

  /** Remove a favourite — local first, API in background. */
  removeFavourite: async (id) => {
    // Local first
    set((s) => ({ favourites: s.favourites.filter((f) => f.id !== id) }));
    try {
      await localDB.delete('favourites', id);
    } catch {
      // non-critical
    }

    // API in background
    try {
      await api.delete(`/ideas/favourites/${id}`);
    } catch {
      // Already removed locally
    }
  },

  isFavourited: (topic) => {
    return get().favourites.some((f) => f.topic_text === topic);
  },

  toggleShowFavourites: () => set((s) => ({ showFavourites: !s.showFavourites })),

  clearResults: () => set({ results: [], searchError: null, unavailable: false, unavailableReason: null }),
}));
