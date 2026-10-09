import { create } from 'zustand';
import { api } from '@/lib/api';
import { localDB } from '@/lib/local-db';
import type {
  MarketplaceListing,
  MarketplacePurchase,
  MarketplaceReview,
  MarketplaceCategory,
  MarketplaceSort,
} from '@/types';

interface ConnectStatus {
  connected: boolean;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
}

// The UI uses friendly plural category / sort tokens; the API (and DB enums) use the
// canonical singular forms. Translate at the boundary so browse-by-category and price
// sorts actually reach the server instead of 400-ing or silently falling back to popular.
const CATEGORY_TO_API: Record<string, string> = {
  templates: 'template',
  prompts: 'prompt_pack',
  voices: 'voice_preset',
  styles: 'style_preset',
};

const SORT_TO_API: Record<string, string> = {
  popular: 'popular',
  newest: 'newest',
  price_asc: 'price_low',
  price_desc: 'price_high',
};

interface MarketplaceState {
  /* Browse */
  listings: MarketplaceListing[];
  selectedListing: MarketplaceListing | null;
  reviews: MarketplaceReview[];
  category: MarketplaceCategory | null;
  sort: MarketplaceSort;
  searchQuery: string;
  page: number;
  total: number;
  isLoading: boolean;
  error: string | null;

  /* My content */
  myListings: MarketplaceListing[];
  myPurchases: MarketplacePurchase[];
  isMyListingsLoading: boolean;
  isMyPurchasesLoading: boolean;
  myListingsError: string | null;
  myPurchasesError: string | null;

  /* Seller payout status */
  connectStatus: ConnectStatus | null;

  /* Detail */
  isDetailLoading: boolean;
  isReviewsLoading: boolean;
  isPurchasing: boolean;
  isSubmittingReview: boolean;

  /* Actions — browse */
  fetchListings: () => Promise<void>;
  fetchListing: (id: number) => Promise<void>;
  setCategory: (category: MarketplaceCategory | null) => void;
  setSort: (sort: MarketplaceSort) => void;
  setSearchQuery: (query: string) => void;
  setPage: (page: number) => void;

  /* Actions — seller */
  createListing: (data: Partial<MarketplaceListing>) => Promise<MarketplaceListing | null>;
  updateListing: (id: number, data: Partial<MarketplaceListing>) => Promise<void>;
  fetchMyListings: () => Promise<void>;
  connectStripe: () => Promise<{ url: string } | null>;
  fetchConnectStatus: () => Promise<void>;

  /* Actions — buyer */
  purchaseListing: (listingId: number) => Promise<boolean>;
  fetchMyPurchases: () => Promise<void>;

  /* Actions — reviews */
  reviewListing: (listingId: number, rating: number, reviewText: string) => Promise<boolean>;
  fetchReviews: (listingId: number) => Promise<void>;

  /* Helpers */
  isPurchased: (listingId: number) => boolean;
  clearError: () => void;
}

/** Persist listings array into IndexedDB marketplace_listings store (read-cache for offline browse). */
async function persistListings(listings: MarketplaceListing[]): Promise<void> {
  try {
    for (const listing of listings) {
      await localDB.put<MarketplaceListing>('marketplace_listings', listing);
    }
  } catch {
    // IndexedDB write failure is non-fatal
  }
}

/** Persist purchases array into IndexedDB marketplace_purchases store. */
async function persistPurchases(purchases: MarketplacePurchase[]): Promise<void> {
  try {
    for (const p of purchases) {
      await localDB.put<MarketplacePurchase>('marketplace_purchases', p);
    }
  } catch {
    // IndexedDB write failure is non-fatal
  }
}

/** Zustand store for the Creator Marketplace. Reads cache offline; mutations require the server. */
export const useMarketplaceStore = create<MarketplaceState>((set, get) => ({
  listings: [],
  selectedListing: null,
  reviews: [],
  category: null,
  sort: 'popular',
  searchQuery: '',
  page: 1,
  total: 0,
  isLoading: false,
  error: null,

  myListings: [],
  myPurchases: [],
  isMyListingsLoading: false,
  isMyPurchasesLoading: false,
  myListingsError: null,
  myPurchasesError: null,

  connectStatus: null,

  isDetailLoading: false,
  isReviewsLoading: false,
  isPurchasing: false,
  isSubmittingReview: false,

  /* ── Browse ── */

  fetchListings: async () => {
    const { category, sort, searchQuery, page } = get();
    set({ isLoading: true, error: null });
    try {
      const params = new URLSearchParams();
      if (category) params.set('category', CATEGORY_TO_API[category] ?? category);
      params.set('sort', SORT_TO_API[sort] ?? 'popular');
      params.set('page', String(page));
      params.set('limit', '20');
      if (searchQuery.trim()) params.set('q', searchQuery.trim());

      const res = await api.get<{ listings: MarketplaceListing[]; total: number }>(
        `/marketplace?${params.toString()}`
      );
      const listings = Array.isArray(res?.listings) ? res.listings : [];
      set({ listings, total: res?.total ?? 0, isLoading: false });

      // Refresh the offline read-cache in the background.
      persistListings(listings);
    } catch {
      // API unreachable — serve the real cached catalog for offline browse only.
      // No fabricated seed data: an empty cache shows an honest empty marketplace.
      try {
        const cached = await localDB.getAll<MarketplaceListing>('marketplace_listings');
        let filtered = cached.filter((l) => l.status === 'active');
        if (category) {
          filtered = filtered.filter((l) => l.category === category);
        }
        if (searchQuery.trim()) {
          const q = searchQuery.trim().toLowerCase();
          filtered = filtered.filter(
            (l) =>
              l.title.toLowerCase().includes(q) ||
              (l.description ?? '').toLowerCase().includes(q)
          );
        }

        if (sort === 'popular') {
          filtered.sort((a, b) => b.downloads - a.downloads);
        } else if (sort === 'newest') {
          filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        } else if (sort === 'price_asc') {
          filtered.sort((a, b) => a.price_cents - b.price_cents);
        } else if (sort === 'price_desc') {
          filtered.sort((a, b) => b.price_cents - a.price_cents);
        }

        const start = (page - 1) * 20;
        const paged = filtered.slice(start, start + 20);
        set({ listings: paged, total: filtered.length, isLoading: false });
      } catch {
        set({ error: 'Failed to load marketplace', isLoading: false });
      }
    }
  },

  fetchListing: async (id) => {
    set({ isDetailLoading: true, error: null, selectedListing: null, reviews: [] });
    try {
      const res = await api.get<{ listing: MarketplaceListing; reviews: MarketplaceReview[] }>(
        `/marketplace/${id}`
      );
      const listing = res?.listing ?? null;
      set({
        selectedListing: listing,
        reviews: Array.isArray(res?.reviews) ? res.reviews : [],
        isDetailLoading: false,
      });
      if (listing) {
        localDB.put<MarketplaceListing>('marketplace_listings', listing).catch(() => {});
      }
    } catch {
      // Offline read-cache fallback for the listing body (reviews require the server).
      try {
        const cached = await localDB.get<MarketplaceListing>('marketplace_listings', id);
        set({ selectedListing: cached ?? null, reviews: [], isDetailLoading: false });
      } catch {
        set({ error: 'Failed to load listing', isDetailLoading: false });
      }
    }
  },

  setCategory: (category) => {
    set({ category, page: 1 });
    get().fetchListings();
  },

  setSort: (sort) => {
    set({ sort, page: 1 });
    get().fetchListings();
  },

  setSearchQuery: (query) => set({ searchQuery: query }),

  setPage: (page) => {
    set({ page });
    get().fetchListings();
  },

  /* ── Seller ── */

  createListing: async (data) => {
    try {
      // Translate the UI category token to the API/DB enum before sending.
      const payload =
        data.category && CATEGORY_TO_API[data.category]
          ? { ...data, category: CATEGORY_TO_API[data.category] as MarketplaceCategory }
          : data;
      const res = await api.post<{ listing: MarketplaceListing }>('/marketplace', payload);
      const listing = res?.listing ?? null;
      if (!listing) {
        set({ myListingsError: 'Failed to create listing' });
        return null;
      }
      set((s) => ({ myListings: [listing, ...(s.myListings ?? [])], myListingsError: null }));
      localDB.put<MarketplaceListing>('marketplace_listings', listing).catch(() => {});
      return listing;
    } catch (e) {
      // Surface the failure — no silent local-only "success".
      const message = e instanceof Error ? e.message : 'Failed to create listing';
      set({ myListingsError: message });
      return null;
    }
  },

  updateListing: async (id, data) => {
    try {
      const res = await api.put<{ listing: MarketplaceListing }>(`/marketplace/${id}`, data);
      const updated = res?.listing;
      if (!updated) return;
      set((s) => ({
        myListings: s.myListings.map((l) => (l.id === id ? { ...l, ...updated } : l)),
        selectedListing:
          s.selectedListing?.id === id ? { ...s.selectedListing, ...updated } : s.selectedListing,
      }));
      localDB.put<MarketplaceListing>('marketplace_listings', updated).catch(() => {});
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to update listing';
      set({ myListingsError: message });
    }
  },

  fetchMyListings: async () => {
    set({ isMyListingsLoading: true, myListingsError: null });
    try {
      const res = await api.get<{ listings: MarketplaceListing[] }>('/marketplace/my-listings');
      const listings = Array.isArray(res?.listings) ? res.listings : [];
      set({ myListings: listings, isMyListingsLoading: false });
      persistListings(listings);
    } catch (e) {
      // Seller inventory is authoritative on the server — surface the error, do not fabricate.
      const message = e instanceof Error ? e.message : 'Failed to load your listings';
      set({ isMyListingsLoading: false, myListingsError: message });
    }
  },

  connectStripe: async () => {
    try {
      const res = await api.post<{ url: string }>('/marketplace/connect');
      return res?.url ? { url: res.url } : null;
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to start Stripe onboarding';
      set({ myListingsError: message });
      return null;
    }
  },

  fetchConnectStatus: async () => {
    try {
      const res = await api.get<ConnectStatus>('/marketplace/connect/status');
      if (res) set({ connectStatus: res });
    } catch {
      set({ connectStatus: { connected: false, charges_enabled: false, payouts_enabled: false, details_submitted: false } });
    }
  },

  /* ── Buyer ── */

  purchaseListing: async (listingId) => {
    set({ isPurchasing: true, error: null });
    try {
      const res = await api.post<{ checkout_url?: string; purchase?: MarketplacePurchase; free?: boolean }>(
        `/marketplace/${listingId}/purchase`
      );

      // Paid listing: redirect to hosted Stripe Checkout (COEP-safe, no embedded Elements).
      if (res?.checkout_url) {
        if (typeof window !== 'undefined') {
          window.location.href = res.checkout_url;
        }
        set({ isPurchasing: false });
        return true;
      }

      // Free listing: server recorded the purchase — reflect it locally.
      if (res?.purchase) {
        await localDB.put<MarketplacePurchase>('marketplace_purchases', res.purchase).catch(() => {});
        set((s) => ({
          myPurchases: [res.purchase as MarketplacePurchase, ...(s.myPurchases ?? [])],
          listings: s.listings.map((l) => (l.id === listingId ? { ...l, downloads: l.downloads + 1 } : l)),
          selectedListing:
            s.selectedListing?.id === listingId
              ? { ...s.selectedListing, downloads: s.selectedListing.downloads + 1 }
              : s.selectedListing,
          isPurchasing: false,
        }));
        return true;
      }

      set({ isPurchasing: false, error: 'Purchase could not be completed' });
      return false;
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Purchase failed';
      set({ isPurchasing: false, error: message });
      return false;
    }
  },

  fetchMyPurchases: async () => {
    set({ isMyPurchasesLoading: true, myPurchasesError: null });
    try {
      const res = await api.get<{ purchases: MarketplacePurchase[] }>('/marketplace/my-purchases');
      const purchases = Array.isArray(res?.purchases) ? res.purchases : [];
      set({ myPurchases: purchases, isMyPurchasesLoading: false });
      persistPurchases(purchases);
    } catch {
      // Purchases can be read from cache offline (entitlement records), but flag staleness.
      try {
        const cached = await localDB.getAll<MarketplacePurchase>('marketplace_purchases');
        set({
          myPurchases: cached,
          isMyPurchasesLoading: false,
          myPurchasesError: cached.length ? null : 'Failed to load your purchases',
        });
      } catch {
        set({ isMyPurchasesLoading: false, myPurchasesError: 'Failed to load your purchases' });
      }
    }
  },

  /* ── Reviews ── */

  reviewListing: async (listingId, rating, reviewText) => {
    set({ isSubmittingReview: true, error: null });
    try {
      const res = await api.post<{ review: MarketplaceReview }>(`/marketplace/${listingId}/review`, {
        rating,
        review_text: reviewText,
      });
      const review = res?.review;
      if (!review) {
        set({ isSubmittingReview: false, error: 'Failed to submit review' });
        return false;
      }
      set((s) => ({
        reviews: [review, ...(s.reviews ?? [])],
        selectedListing: s.selectedListing
          ? {
              ...s.selectedListing,
              rating_count: s.selectedListing.rating_count + 1,
              rating_avg:
                (s.selectedListing.rating_avg * s.selectedListing.rating_count + rating) /
                (s.selectedListing.rating_count + 1),
            }
          : null,
        isSubmittingReview: false,
      }));
      return true;
    } catch (e) {
      // Reviews require a verified purchase server-side; a failure is real (e.g. 403 not purchased).
      const message = e instanceof Error ? e.message : 'Failed to submit review';
      set({ isSubmittingReview: false, error: message });
      return false;
    }
  },

  fetchReviews: async (listingId) => {
    set({ isReviewsLoading: true });
    try {
      const res = await api.get<{ reviews: MarketplaceReview[] }>(`/marketplace/${listingId}/reviews`);
      set({ reviews: Array.isArray(res?.reviews) ? res.reviews : [], isReviewsLoading: false });
    } catch {
      set({ isReviewsLoading: false });
    }
  },

  /* ── Helpers ── */

  isPurchased: (listingId) => {
    return get().myPurchases.some((p) => p.listing_id === listingId);
  },

  clearError: () => set({ error: null, myListingsError: null, myPurchasesError: null }),
}));
