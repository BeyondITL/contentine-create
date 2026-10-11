import { create } from 'zustand';
import { api } from '@/lib/api';
import { localDB } from '@/lib/local-db';

// --- Types ---

export type StockMediaType = 'photo' | 'video' | 'audio';
export type StockSource = 'openverse' | 'pexels' | 'pixabay' | 'freesound' | 'all';

export interface StockItem {
  id: string;
  source: 'openverse' | 'pexels' | 'pixabay' | 'freesound';
  type: StockMediaType;
  title: string;
  preview_url: string;
  download_url: string;
  attribution: string;
  width?: number;
  height?: number;
  duration?: number;
}

/** IndexedDB record wrapping a cached search result set. */
interface StockCacheEntry {
  id: string; // cache key: `${query}|${mediaType}|${source}|${page}`
  query: string;
  mediaType: StockMediaType;
  source: StockSource;
  page: number;
  items: StockItem[];
  total: number;
  cached_at: number;
}

interface StockSearchResponse {
  /** Backend returns `items` (not `results`). */
  items: StockItem[];
  /** Alias — some providers may use `results` key. */
  results?: StockItem[];
  total: number;
  page: number;
  per_page?: number;
  source?: string;
  type?: string;
}

// --- Rate Limit Tracking ---

/** Per-source rate limit configuration. */
const RATE_LIMITS: Record<string, { maxPerHour: number; label: string }> = {
  openverse: { maxPerHour: 100, label: 'Openverse' },
  pexels: { maxPerHour: 200, label: 'Pexels' },
  pixabay: { maxPerHour: 5000, label: 'Pixabay' },
  freesound: { maxPerHour: 2000, label: 'Freesound' },
};

/** Tracks request timestamps per source for rate limit estimation. */
const requestTimestamps: Record<string, number[]> = {
  openverse: [],
  pexels: [],
  pixabay: [],
  freesound: [],
};

/** Record a request for a specific source. */
function recordRequest(source: string): void {
  if (!requestTimestamps[source]) requestTimestamps[source] = [];
  requestTimestamps[source].push(Date.now());
  // Keep only timestamps from the last hour
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  requestTimestamps[source] = requestTimestamps[source].filter((t) => t > oneHourAgo);
}

/** Get current request count in the last hour for a source. */
function getRequestCount(source: string): number {
  if (!requestTimestamps[source]) return 0;
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  requestTimestamps[source] = requestTimestamps[source].filter((t) => t > oneHourAgo);
  return requestTimestamps[source].length;
}

/** Check if a source is approaching its rate limit (>80% usage). */
function isApproachingLimit(source: string): boolean {
  const limit = RATE_LIMITS[source];
  if (!limit) return false;
  return getRequestCount(source) >= limit.maxPerHour * 0.8;
}

/** Build per-source API key error messages. */
function buildApiKeyError(source: string): string {
  switch (source) {
    case 'pexels':
      return 'Pexels API key not configured. Add it in the admin Providers settings.';
    case 'pixabay':
      return 'Pixabay API key not configured. Add it in the admin Providers settings.';
    case 'freesound':
      return 'Freesound API key not configured. Add it in the admin Providers settings.';
    case 'openverse':
      return 'Openverse is temporarily unavailable — please try again in a moment.';
    default:
      return `${source} API key not configured. Add it in the admin Providers settings.`;
  }
}

/** Build a cache key for a given search configuration. */
function buildCacheKey(query: string, mediaType: StockMediaType, source: StockSource, page: number): string {
  return `${query.trim().toLowerCase()}|${mediaType}|${source}|${page}`;
}

/** Cache TTL: 1 hour in milliseconds. */
const CACHE_TTL = 60 * 60 * 1000;

/** Local demo/placeholder stock items — shown when API is unavailable and no cache exists. */
function getDemoResults(query: string, mediaType: StockMediaType): { items: StockItem[]; total: number } {
  const demoPhotos: StockItem[] = [
    { id: 'demo-p1', source: 'pexels', type: 'photo', title: `${query} - Nature scene`, preview_url: 'data:image/svg+xml;charset=UTF-8,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="300"%3E%3Cdefs%3E%3ClinearGradient id="g" x1="0%25" y1="0%25" x2="100%25" y2="100%25"%3E%3Cstop offset="0%25" stop-color="%2300C3FF"/%3E%3Cstop offset="100%25" stop-color="%2335C838"/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect fill="url(%23g)" width="400" height="300"/%3E%3Ctext x="200" y="140" font-family="sans-serif" font-size="16" fill="white" text-anchor="middle"%3EDemo Photo 1%3C/text%3E%3Ctext x="200" y="170" font-family="sans-serif" font-size="12" fill="rgba(255,255,255,0.7)" text-anchor="middle"%3EConnect API keys for real results%3C/text%3E%3C/svg%3E', download_url: '', attribution: 'Demo - Configure API keys for real stock media', width: 400, height: 300 },
    { id: 'demo-p2', source: 'pixabay', type: 'photo', title: `${query} - Urban landscape`, preview_url: 'data:image/svg+xml;charset=UTF-8,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="300"%3E%3Cdefs%3E%3ClinearGradient id="g" x1="0%25" y1="0%25" x2="100%25" y2="100%25"%3E%3Cstop offset="0%25" stop-color="%23F3A6FF"/%3E%3Cstop offset="100%25" stop-color="%2300C3FF"/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect fill="url(%23g)" width="400" height="300"/%3E%3Ctext x="200" y="140" font-family="sans-serif" font-size="16" fill="white" text-anchor="middle"%3EDemo Photo 2%3C/text%3E%3Ctext x="200" y="170" font-family="sans-serif" font-size="12" fill="rgba(255,255,255,0.7)" text-anchor="middle"%3EConnect API keys for real results%3C/text%3E%3C/svg%3E', download_url: '', attribution: 'Demo - Configure API keys for real stock media', width: 400, height: 300 },
    { id: 'demo-p3', source: 'pexels', type: 'photo', title: `${query} - Abstract composition`, preview_url: 'data:image/svg+xml;charset=UTF-8,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="300"%3E%3Cdefs%3E%3ClinearGradient id="g" x1="0%25" y1="0%25" x2="100%25" y2="100%25"%3E%3Cstop offset="0%25" stop-color="%2335C838"/%3E%3Cstop offset="100%25" stop-color="%23F3A6FF"/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect fill="url(%23g)" width="400" height="300"/%3E%3Ctext x="200" y="140" font-family="sans-serif" font-size="16" fill="white" text-anchor="middle"%3EDemo Photo 3%3C/text%3E%3Ctext x="200" y="170" font-family="sans-serif" font-size="12" fill="rgba(255,255,255,0.7)" text-anchor="middle"%3EConnect API keys for real results%3C/text%3E%3C/svg%3E', download_url: '', attribution: 'Demo - Configure API keys for real stock media', width: 400, height: 300 },
    { id: 'demo-p4', source: 'pixabay', type: 'photo', title: `${query} - Professional shot`, preview_url: 'data:image/svg+xml;charset=UTF-8,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="300"%3E%3Cdefs%3E%3ClinearGradient id="g" x1="0%25" y1="0%25" x2="100%25" y2="100%25"%3E%3Cstop offset="0%25" stop-color="%2300A8DB"/%3E%3Cstop offset="100%25" stop-color="%232BAF2E"/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect fill="url(%23g)" width="400" height="300"/%3E%3Ctext x="200" y="140" font-family="sans-serif" font-size="16" fill="white" text-anchor="middle"%3EDemo Photo 4%3C/text%3E%3Ctext x="200" y="170" font-family="sans-serif" font-size="12" fill="rgba(255,255,255,0.7)" text-anchor="middle"%3EConnect API keys for real results%3C/text%3E%3C/svg%3E', download_url: '', attribution: 'Demo - Configure API keys for real stock media', width: 400, height: 300 },
  ];

  const demoVideos: StockItem[] = [
    { id: 'demo-v1', source: 'pexels', type: 'video', title: `${query} - Cinematic footage`, preview_url: 'data:image/svg+xml;charset=UTF-8,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="225"%3E%3Cdefs%3E%3ClinearGradient id="g" x1="0%25" y1="0%25" x2="100%25" y2="100%25"%3E%3Cstop offset="0%25" stop-color="%23171717"/%3E%3Cstop offset="100%25" stop-color="%2300C3FF"/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect fill="url(%23g)" width="400" height="225"/%3E%3Cpolygon points="185,90 185,135 215,112.5" fill="rgba(255,255,255,0.6)"/%3E%3Ctext x="200" y="165" font-family="sans-serif" font-size="12" fill="rgba(255,255,255,0.7)" text-anchor="middle"%3EDemo Video - Connect API%3C/text%3E%3C/svg%3E', download_url: '', attribution: 'Demo - Configure API keys for real stock media', width: 1920, height: 1080, duration: 15 },
    { id: 'demo-v2', source: 'pixabay', type: 'video', title: `${query} - B-roll clip`, preview_url: 'data:image/svg+xml;charset=UTF-8,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="225"%3E%3Cdefs%3E%3ClinearGradient id="g" x1="0%25" y1="0%25" x2="100%25" y2="100%25"%3E%3Cstop offset="0%25" stop-color="%23171717"/%3E%3Cstop offset="100%25" stop-color="%23F3A6FF"/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect fill="url(%23g)" width="400" height="225"/%3E%3Cpolygon points="185,90 185,135 215,112.5" fill="rgba(255,255,255,0.6)"/%3E%3Ctext x="200" y="165" font-family="sans-serif" font-size="12" fill="rgba(255,255,255,0.7)" text-anchor="middle"%3EDemo Video - Connect API%3C/text%3E%3C/svg%3E', download_url: '', attribution: 'Demo - Configure API keys for real stock media', width: 1920, height: 1080, duration: 10 },
    { id: 'demo-v3', source: 'pexels', type: 'video', title: `${query} - Time-lapse`, preview_url: 'data:image/svg+xml;charset=UTF-8,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="225"%3E%3Cdefs%3E%3ClinearGradient id="g" x1="0%25" y1="0%25" x2="100%25" y2="100%25"%3E%3Cstop offset="0%25" stop-color="%23171717"/%3E%3Cstop offset="100%25" stop-color="%2335C838"/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect fill="url(%23g)" width="400" height="225"/%3E%3Cpolygon points="185,90 185,135 215,112.5" fill="rgba(255,255,255,0.6)"/%3E%3Ctext x="200" y="165" font-family="sans-serif" font-size="12" fill="rgba(255,255,255,0.7)" text-anchor="middle"%3EDemo Video - Connect API%3C/text%3E%3C/svg%3E', download_url: '', attribution: 'Demo - Configure API keys for real stock media', width: 1920, height: 1080, duration: 20 },
  ];

  const demoAudio: StockItem[] = [
    { id: 'demo-a1', source: 'freesound', type: 'audio', title: `${query} - Ambient background`, preview_url: '', download_url: '', attribution: 'Demo - Configure Freesound API key for real audio', duration: 30 },
    { id: 'demo-a2', source: 'freesound', type: 'audio', title: `${query} - Sound effect`, preview_url: '', download_url: '', attribution: 'Demo - Configure Freesound API key for real audio', duration: 5 },
    { id: 'demo-a3', source: 'freesound', type: 'audio', title: `${query} - Music loop`, preview_url: '', download_url: '', attribution: 'Demo - Configure Freesound API key for real audio', duration: 60 },
  ];

  // Filter by query relevance (demo items always match since they include the query in title)
  const items = mediaType === 'photo' ? demoPhotos : mediaType === 'video' ? demoVideos : demoAudio;
  return { items, total: items.length };
}

/** Save search results to IndexedDB stock_cache. */
async function cacheResults(
  query: string,
  mediaType: StockMediaType,
  source: StockSource,
  page: number,
  items: StockItem[],
  total: number
): Promise<void> {
  try {
    const key = buildCacheKey(query, mediaType, source, page);
    await localDB.put<StockCacheEntry>('stock_cache', {
      id: key,
      query: query.trim().toLowerCase(),
      mediaType,
      source,
      page,
      items,
      total,
      cached_at: Date.now(),
    });
  } catch {
    // Non-fatal cache write failure
  }
}

/** Retrieve cached search results from IndexedDB. Returns null if not found or expired. */
async function getCachedResults(
  query: string,
  mediaType: StockMediaType,
  source: StockSource,
  page: number
): Promise<{ items: StockItem[]; total: number } | null> {
  try {
    const key = buildCacheKey(query, mediaType, source, page);
    const entry = await localDB.get<StockCacheEntry>('stock_cache', key);
    if (!entry) return null;
    // Check TTL
    if (Date.now() - entry.cached_at > CACHE_TTL) return null;
    return { items: entry.items, total: entry.total };
  } catch {
    return null;
  }
}

// --- Store ---

interface StockState {
  query: string;
  mediaType: StockMediaType;
  source: StockSource;
  results: StockItem[];
  isSearching: boolean;
  page: number;
  totalResults: number;
  searchError: string | null;
  isLoadingMore: boolean;
  /** Per-source warnings (e.g. rate limit approaching). */
  sourceWarnings: string[];
  /** True when results are the offline demo fallback, not live API data. */
  isDemoFallback: boolean;

  // Actions
  setQuery: (query: string) => void;
  setMediaType: (type: StockMediaType) => void;
  setSource: (source: StockSource) => void;
  search: () => Promise<void>;
  loadMore: () => Promise<void>;
  getDownloadUrl: (source: string, id: string) => Promise<string | null>;
  clearResults: () => void;
  clearWarnings: () => void;
}

/** Zustand store for stock media search — tries API first, falls back to IndexedDB cache. */
export const useStockStore = create<StockState>((set, get) => ({
  query: '',
  mediaType: 'photo',
  source: 'all',
  results: [],
  isSearching: false,
  page: 1,
  totalResults: 0,
  searchError: null,
  isLoadingMore: false,
  sourceWarnings: [],
  isDemoFallback: false,

  setQuery: (query) => set({ query }),

  setMediaType: (mediaType) => {
    set({ mediaType, results: [], searchError: null, page: 1, totalResults: 0, sourceWarnings: [], isDemoFallback: false });
    if (get().query.trim()) {
      get().search();
    }
  },

  setSource: (source) => {
    set({ source, results: [], searchError: null, page: 1, totalResults: 0, sourceWarnings: [], isDemoFallback: false });
    if (get().query.trim()) {
      get().search();
    }
  },

  search: async () => {
    const { query, mediaType, source } = get();
    if (!query.trim()) return;

    set({ isSearching: true, searchError: null, page: 1, results: [], totalResults: 0, sourceWarnings: [], isDemoFallback: false });

    // When source is "all", search compatible providers in parallel and merge
    const sourcesToSearch: Array<'openverse' | 'pexels' | 'pixabay' | 'freesound'> =
      source === 'all'
        ? mediaType === 'audio'
          ? ['freesound']
          : mediaType === 'photo'
            ? ['openverse', 'pixabay', 'pexels']
            : ['pexels', 'pixabay'] // video (Openverse is photo-only)
        : [source as 'openverse' | 'pexels' | 'pixabay' | 'freesound'];

    try {
      const fetches = sourcesToSearch.map((src) => {
        // Track rate limits
        recordRequest(src);

        const params = new URLSearchParams({
          q: query.trim(),
          type: mediaType,
          source: src,
          page: '1',
          per_page: source === 'all' ? String(Math.floor(24 / sourcesToSearch.length)) : '24',
        });
        return api
          .get<StockSearchResponse>(`/stock/search?${params.toString()}`)
          .then((res) => ({
            source: src,
            items: res.items || res.results || [],
            total: res.total || 0,
          }))
          .catch((err) => {
            const msg = err instanceof Error ? err.message : '';
            // Detect API key errors and return per-source error message
            const isApiKeyError =
              msg.includes('API key') ||
              msg.includes('No active') ||
              msg.includes('502') ||
              msg.includes('stock provider') ||
              msg.includes('401') ||
              msg.includes('403');
            return {
              source: src,
              items: [] as StockItem[],
              total: 0,
              error: isApiKeyError ? buildApiKeyError(src) : msg,
            };
          });
      });

      const results = await Promise.all(fetches);

      const allItems = results.flatMap((r) => r.items);
      const totalSum = results.reduce((sum, r) => sum + r.total, 0);

      // Collect per-source errors
      const sourceErrors = results
        .filter((r): r is typeof r & { error: string } => 'error' in r && !!r.error)
        .map((r) => r.error);

      // Collect rate limit warnings
      const warnings: string[] = [];
      for (const src of sourcesToSearch) {
        if (isApproachingLimit(src)) {
          const limit = RATE_LIMITS[src];
          const count = getRequestCount(src);
          warnings.push(
            `${limit.label}: approaching rate limit (${count}/${limit.maxPerHour} requests/hour)`
          );
        }
      }

      if (allItems.length === 0 && sourceErrors.length > 0) {
        // All providers failed — try IndexedDB cache fallback
        const cached = await getCachedResults(query, mediaType, source, 1);
        if (cached && cached.items.length > 0) {
          set({
            results: cached.items,
            totalResults: cached.total,
            page: 1,
            isSearching: false,
            sourceWarnings: ['Showing cached results (API unavailable)'],
          });
          return;
        }

        // No cache either — show demo placeholder results
        const demo = getDemoResults(query, mediaType);
        set({
          results: demo.items,
          totalResults: demo.total,
          page: 1,
          isSearching: false,
          isDemoFallback: true,
          sourceWarnings: [
            'Showing demo results (API unavailable). Configure stock media API keys in backend settings for real results.',
            ...sourceErrors,
          ],
        });
        return;
      }

      // Cache successful results in IndexedDB
      cacheResults(query, mediaType, source, 1, allItems, totalSum);

      set({
        results: allItems,
        totalResults: totalSum,
        page: 1,
        isSearching: false,
        sourceWarnings: warnings,
      });
    } catch (err: unknown) {
      // Complete API failure — try IndexedDB cache
      const cached = await getCachedResults(query, mediaType, source, 1);
      if (cached && cached.items.length > 0) {
        set({
          results: cached.items,
          totalResults: cached.total,
          page: 1,
          isSearching: false,
          sourceWarnings: ['Showing cached results (API unavailable)'],
        });
        return;
      }

      // Complete failure — show demo results
      const demo = getDemoResults(query, mediaType);
      set({
        results: demo.items,
        totalResults: demo.total,
        page: 1,
        isSearching: false,
        isDemoFallback: true,
        sourceWarnings: ['Showing demo results (API unavailable). Configure stock media API keys in backend settings for real results.'],
      });
    }
  },

  loadMore: async () => {
    const { query, mediaType, source, page, results, totalResults, isLoadingMore } = get();
    if (!query.trim() || isLoadingMore || results.length >= totalResults) return;

    const nextPage = page + 1;
    set({ isLoadingMore: true });

    // When source is "all", fan out across compatible providers
    const sourcesToSearch: Array<'openverse' | 'pexels' | 'pixabay' | 'freesound'> =
      source === 'all'
        ? mediaType === 'audio'
          ? ['freesound']
          : mediaType === 'photo'
            ? ['openverse', 'pixabay', 'pexels']
            : ['pexels', 'pixabay']
        : [source as 'openverse' | 'pexels' | 'pixabay' | 'freesound'];

    try {
      const fetches = sourcesToSearch.map((src) => {
        recordRequest(src);
        const params = new URLSearchParams({
          q: query.trim(),
          type: mediaType,
          source: src,
          page: nextPage.toString(),
          per_page: source === 'all' ? String(Math.floor(24 / sourcesToSearch.length)) : '24',
        });
        return api
          .get<StockSearchResponse>(`/stock/search?${params.toString()}`)
          .then((res) => ({
            items: res.items || res.results || [],
            total: res.total || 0,
          }))
          .catch(() => ({ items: [] as StockItem[], total: 0 }));
      });

      const responses = await Promise.all(fetches);
      const newItems = responses.flatMap((r) => r.items);
      const newTotal = responses.reduce((sum, r) => sum + r.total, 0);

      // Cache page results
      cacheResults(query, mediaType, source, nextPage, newItems, newTotal);

      // Check rate limit warnings after load more
      const warnings: string[] = [];
      for (const src of sourcesToSearch) {
        if (isApproachingLimit(src)) {
          const limit = RATE_LIMITS[src];
          const count = getRequestCount(src);
          warnings.push(
            `${limit.label}: approaching rate limit (${count}/${limit.maxPerHour} requests/hour)`
          );
        }
      }

      set((s) => ({
        results: [...s.results, ...newItems],
        totalResults: source === 'all' ? newTotal : (responses[0]?.total ?? s.totalResults),
        page: nextPage,
        isLoadingMore: false,
        sourceWarnings: warnings.length > 0 ? warnings : s.sourceWarnings,
      }));
    } catch (err: unknown) {
      // Try cached next page
      const cached = await getCachedResults(query, mediaType, source, nextPage);
      if (cached && cached.items.length > 0) {
        set((s) => ({
          results: [...s.results, ...cached.items],
          totalResults: cached.total,
          page: nextPage,
          isLoadingMore: false,
          sourceWarnings: ['Showing cached results (API unavailable)'],
        }));
        return;
      }

      const message = err instanceof Error ? err.message : 'Failed to load more results';
      set({ searchError: message, isLoadingMore: false });
    }
  },

  getDownloadUrl: async (source, id) => {
    try {
      const res = await api.get<{ download_url?: string; url?: string; attribution?: string }>(
        `/stock/${source}/${id}/download`
      );
      return res.download_url || res.url || null;
    } catch {
      return null;
    }
  },

  clearResults: () => set({ results: [], searchError: null, page: 1, totalResults: 0, sourceWarnings: [], isDemoFallback: false }),

  clearWarnings: () => set({ sourceWarnings: [] }),
}));
