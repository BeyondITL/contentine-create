'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Store,
  Search,
  X,
  SlidersHorizontal,
  ChevronDown,
  Package,
  MessageSquare,
  Mic2,
  Palette,
  AlertTriangle,
  RefreshCw,
  ShoppingBag,
  ListFilter,
  CreditCard,
  CheckCircle2,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import { useMarketplaceStore } from '@/stores/marketplace-store';
import MarketplaceListingCard from '@/components/marketplace/MarketplaceListingCard';
import MarketplaceSkeleton from '@/components/marketplace/MarketplaceSkeleton';
import ListingDetail from '@/components/marketplace/ListingDetail';
import EmptyState from '@/components/ui/EmptyState';
import type { MarketplaceCategory, MarketplaceSort } from '@/types';

/* ── Category tabs config ── */
const CATEGORIES: { id: MarketplaceCategory | null; label: string; icon: typeof Store }[] = [
  { id: null, label: 'All', icon: Store },
  { id: 'templates', label: 'Templates', icon: Package },
  { id: 'prompts', label: 'Prompts', icon: MessageSquare },
  { id: 'voices', label: 'Voices', icon: Mic2 },
  { id: 'styles', label: 'Styles', icon: Palette },
];

/* ── Sort options ── */
const SORT_OPTIONS: { value: MarketplaceSort; label: string }[] = [
  { value: 'popular', label: 'Popular' },
  { value: 'newest', label: 'Newest' },
  { value: 'price_asc', label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
];

/* ── Tab type for My Content ── */
type PageTab = 'browse' | 'my_listings' | 'my_purchases';

/** Creator Marketplace page — browse, buy, and sell templates, prompts, voices, and styles. */
export default function MarketplacePage() {
  const {
    listings,
    category,
    sort,
    searchQuery,
    page,
    total,
    isLoading,
    error,
    myListings,
    myPurchases,
    isMyListingsLoading,
    isMyPurchasesLoading,
    fetchListings,
    setCategory,
    setSort,
    setSearchQuery,
    setPage,
    fetchMyListings,
    fetchMyPurchases,
    fetchListing,
    purchaseListing,
    isPurchased,
    clearError,
    selectedListing,
    connectStatus,
    connectStripe,
    fetchConnectStatus,
  } = useMarketplaceStore();

  const [activeTab, setActiveTab] = useState<PageTab>('browse');
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const sortRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Set page title
  useEffect(() => {
    document.title = 'Creator Marketplace \u2014 Contentine Create';
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchListings().finally(() => setIsInitialLoad(false));
    fetchMyPurchases();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Close sort dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) {
        setShowSortDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearch = useCallback(() => {
    setPage(1);
    fetchListings();
  }, [setPage, fetchListings]);

  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleSearch();
    },
    [handleSearch],
  );

  const handleTabChange = useCallback(
    (tab: PageTab) => {
      setActiveTab(tab);
      if (tab === 'my_listings') {
        fetchMyListings();
        fetchConnectStatus();
      }
      if (tab === 'my_purchases') fetchMyPurchases();
    },
    [fetchMyListings, fetchMyPurchases, fetchConnectStatus],
  );

  // After the Stripe Connect onboarding redirect (?connect=return), refresh payout status.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('connect') === 'return' || params.get('connect') === 'refresh') {
      setActiveTab('my_listings');
      fetchMyListings();
      fetchConnectStatus();
    }
  }, [fetchMyListings, fetchConnectStatus]);

  const [isConnecting, setIsConnecting] = useState(false);
  const handleConnectPayouts = useCallback(async () => {
    setIsConnecting(true);
    const res = await connectStripe();
    if (res?.url && typeof window !== 'undefined') {
      window.location.href = res.url;
    } else {
      setIsConnecting(false);
    }
  }, [connectStripe]);

  const handleSelectListing = useCallback(
    (id: number) => {
      fetchListing(id);
      setShowDetail(true);
    },
    [fetchListing],
  );

  const handleBackFromDetail = useCallback(() => {
    setShowDetail(false);
    clearError();
  }, [clearError]);

  const handleBuy = useCallback(
    async (listingId: number) => {
      await purchaseListing(listingId);
    },
    [purchaseListing],
  );

  const currentSortLabel = SORT_OPTIONS.find((o) => o.value === sort)?.label ?? 'Popular';
  const totalPages = Math.ceil(total / 20);

  // Show skeleton during initial load
  if (isInitialLoad && isLoading) {
    return (
      <div className="animate-fade-in">
        <MarketplaceSkeleton />
      </div>
    );
  }

  // Detail view
  if (showDetail) {
    return (
      <div className="animate-fade-in">
        <ListingDetail onBack={handleBackFromDetail} />
      </div>
    );
  }

  return (
    <div className="max-w-[1280px] mx-auto animate-fade-in">
      {/* ── Hero banner ── */}
      <div className="rounded-2xl bg-[#0A0A0A] dark:bg-[#111] p-6 md:p-8 mb-6 relative overflow-hidden">
        {/* Background gradient accent */}
        <div
          className="absolute inset-0 opacity-[0.06] pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse 80% 60% at 70% 20%, #00C3FF, transparent), radial-gradient(ellipse 60% 40% at 30% 80%, #F3A6FF, transparent)',
          }}
        />
        <div className="relative">
          <div className="flex items-center gap-2 mb-1.5">
            <Store size={20} className="text-primary" />
            <h1 className="text-xl md:text-2xl font-bold text-white tracking-[-0.02em]">
              Creator Marketplace
            </h1>
          </div>
          <p className="text-[13px] md:text-[14px] text-white/50 max-w-lg">
            Buy and sell templates, prompts, voice presets, and styles created by the Contentine Create community.
          </p>
        </div>
      </div>

      {/* ── Page tabs (Browse / My Listings / My Purchases) ── */}
      <div className="flex items-center gap-1.5 mb-5">
        {(
          [
            { id: 'browse', label: 'Browse', icon: Store },
            { id: 'my_listings', label: 'My Listings', icon: ListFilter },
            { id: 'my_purchases', label: 'Purchases', icon: ShoppingBag },
          ] as const
        ).map((tab) => {
          const TabIcon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleTabChange(tab.id)}
              className={`
                inline-flex items-center gap-1.5 px-3 py-2
                min-h-[44px] md:min-h-0
                rounded-lg text-[12px] font-semibold
                transition-all duration-200 cursor-pointer
                focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none
                ${
                  activeTab === tab.id
                    ? 'bg-[#0A0A0A] dark:bg-white text-white dark:text-[#0A0A0A] shadow-sm'
                    : 'bg-surface dark:bg-[#1e1e1e] text-text-secondary dark:text-[#AAA] hover:bg-border-light dark:hover:bg-[#2a2a2a]'
                }
              `}
            >
              <TabIcon size={13} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ── Browse tab ── */}
      {activeTab === 'browse' && (
        <>
          {/* Search + Category tabs + Sort */}
          <div className="flex flex-col gap-3 mb-5">
            {/* Search input */}
            <div className="relative">
              <Search
                size={16}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
              />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Search marketplace..."
                aria-label="Search marketplace"
                className="
                  w-full pl-10 pr-16 py-2.5 min-h-[44px] md:min-h-[40px]
                  rounded-xl border border-black/[0.08] dark:border-white/[0.08]
                  bg-white dark:bg-dark-secondary
                  text-text dark:text-[#E0E0E0]
                  text-[14px] md:text-[13px]
                  placeholder:text-text-muted/50
                  focus:outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary/30
                  transition-all duration-200
                "
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => { setSearchQuery(''); handleSearch(); }}
                    aria-label="Clear search"
                    className="
                      flex items-center justify-center w-8 h-8
                      min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0
                      rounded-lg text-text-muted hover:text-text dark:hover:text-white
                      hover:bg-surface dark:hover:bg-[#333]
                      transition-all duration-200 cursor-pointer
                      focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none
                    "
                  >
                    <X size={14} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleSearch}
                  aria-label="Search"
                  className="
                    flex items-center justify-center px-3 py-1.5
                    min-h-[44px] md:min-h-0
                    rounded-lg text-[12px] font-semibold
                    bg-[#0A0A0A] dark:bg-white text-white dark:text-[#0A0A0A]
                    hover:bg-[#1A1A1A] dark:hover:bg-[#E8E8E8]
                    transition-all duration-200 cursor-pointer
                    focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none
                    active:scale-[0.97]
                  "
                >
                  <Search size={14} />
                </button>
              </div>
            </div>

            {/* Category tabs + Sort */}
            <div className="flex flex-col md:flex-row items-start md:items-center gap-3">
              {/* Category pills */}
              <div className="flex gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0 scrollbar-hide">
                {CATEGORIES.map((cat) => {
                  const CatIcon = cat.icon;
                  const isActive = category === cat.id;
                  return (
                    <button
                      key={cat.id ?? 'all'}
                      type="button"
                      onClick={() => setCategory(cat.id)}
                      className={`
                        inline-flex items-center gap-1.5 px-3 py-1.5
                        min-h-[44px] md:min-h-[32px]
                        rounded-full text-[12px] font-semibold whitespace-nowrap shrink-0
                        transition-all duration-200 cursor-pointer
                        focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none
                        ${
                          isActive
                            ? 'bg-primary/10 text-primary dark:bg-primary/15 dark:text-primary'
                            : 'bg-surface dark:bg-[#1e1e1e] text-text-secondary dark:text-[#AAA] hover:bg-border-light dark:hover:bg-[#2a2a2a]'
                        }
                      `}
                    >
                      <CatIcon size={12} />
                      {cat.label}
                    </button>
                  );
                })}
              </div>

              {/* Sort dropdown */}
              <div className="relative md:ml-auto" ref={sortRef}>
                <button
                  type="button"
                  onClick={() => setShowSortDropdown(!showSortDropdown)}
                  className="
                    inline-flex items-center gap-1.5 px-3 py-1.5
                    min-h-[44px] md:min-h-[32px]
                    rounded-lg text-[12px] font-medium
                    bg-white dark:bg-dark-secondary text-text dark:text-[#E0E0E0]
                    border border-black/[0.08] dark:border-white/[0.08]
                    hover:border-black/[0.15] dark:hover:border-white/[0.15]
                    transition-all duration-200 cursor-pointer
                    focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none
                  "
                >
                  <SlidersHorizontal size={12} />
                  {currentSortLabel}
                  <ChevronDown size={12} className={`transition-transform ${showSortDropdown ? 'rotate-180' : ''}`} />
                </button>

                {showSortDropdown && (
                  <div
                    className="
                      absolute right-0 top-full mt-1 z-20
                      bg-white dark:bg-dark-secondary
                      rounded-xl border border-black/[0.06] dark:border-white/[0.06]
                      shadow-lg overflow-hidden animate-fade-in min-w-[180px]
                    "
                  >
                    {SORT_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          setSort(opt.value);
                          setShowSortDropdown(false);
                        }}
                        className={`
                          w-full text-left px-3.5 py-2.5
                          min-h-[44px] md:min-h-0
                          text-[13px] transition-colors duration-150 cursor-pointer
                          focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none
                          ${
                            sort === opt.value
                              ? 'text-primary font-semibold bg-primary/[0.04]'
                              : 'text-text dark:text-[#E0E0E0] hover:bg-surface dark:hover:bg-[#2a2a2a]'
                          }
                        `}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Loading state */}
          {isLoading && !isInitialLoad && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-2xl border border-black/[0.05] dark:border-white/[0.05] overflow-hidden bg-white dark:bg-dark-secondary animate-pulse"
                >
                  <div className="w-full aspect-video bg-black/[0.04] dark:bg-white/[0.06]" />
                  <div className="p-3.5">
                    <div className="w-3/4 h-4 bg-black/[0.04] dark:bg-white/[0.06] rounded-md mb-2" />
                    <div className="flex items-center justify-between mb-3">
                      <div className="w-16 h-3 bg-black/[0.04] dark:bg-white/[0.06] rounded-md" />
                      <div className="w-10 h-3 bg-black/[0.04] dark:bg-white/[0.06] rounded-md" />
                    </div>
                    <div className="w-full h-9 bg-black/[0.04] dark:bg-white/[0.06] rounded-xl" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Error state */}
          {!isLoading && error && (
            <div className="max-w-md mx-auto flex flex-col items-center text-center py-16">
              <div className="w-12 h-12 rounded-2xl bg-danger/10 flex items-center justify-center mb-4">
                <AlertTriangle size={24} className="text-danger" />
              </div>
              <h2 className="text-[15px] font-semibold text-text dark:text-white mb-1.5">
                Something went wrong
              </h2>
              <p className="text-[13px] text-text-muted mb-5 leading-relaxed">{error}</p>
              <button
                type="button"
                onClick={() => { clearError(); fetchListings(); }}
                className="
                  flex items-center gap-2 px-4 py-2.5
                  min-h-[44px] md:min-h-0
                  bg-primary text-white rounded-xl text-[13px] font-semibold
                  hover:bg-primary-hover active:scale-[0.97]
                  transition-all duration-150 cursor-pointer
                  focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none
                "
              >
                <RefreshCw size={14} />
                Retry
              </button>
            </div>
          )}

          {/* Empty state */}
          {!isLoading && !error && (listings ?? []).length === 0 && (
            <EmptyState
              icon={<Store size={28} className="text-primary" />}
              headline={searchQuery ? 'No results found' : 'Marketplace is empty'}
              description={
                searchQuery
                  ? `No listings match "${searchQuery}". Try a different search or browse all categories.`
                  : 'Be the first to list a template, prompt, voice preset, or style for the community.'
              }
              ctaLabel={searchQuery ? 'Clear search' : 'Browse all'}
              onCTA={() => {
                if (searchQuery) {
                  setSearchQuery('');
                  handleSearch();
                } else {
                  searchInputRef.current?.focus();
                }
              }}
            />
          )}

          {/* Populated grid */}
          {!isLoading && !error && (listings ?? []).length > 0 && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {(listings ?? []).map((listing) => (
                  <MarketplaceListingCard
                    key={listing.id}
                    listing={listing}
                    isPurchased={isPurchased(listing.id)}
                    onSelect={() => handleSelectListing(listing.id)}
                    onBuy={() => handleBuy(listing.id)}
                  />
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-8">
                  <button
                    type="button"
                    onClick={() => setPage(page - 1)}
                    disabled={page <= 1}
                    className="
                      px-3 py-2 min-h-[44px] md:min-h-0
                      rounded-lg text-[12px] font-semibold
                      bg-white dark:bg-dark-secondary text-text dark:text-[#E0E0E0]
                      border border-black/[0.08] dark:border-white/[0.08]
                      hover:border-black/[0.15] dark:hover:border-white/[0.15]
                      disabled:opacity-40 disabled:cursor-not-allowed
                      transition-all duration-200 cursor-pointer
                      focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none
                    "
                  >
                    Previous
                  </button>
                  <span className="text-[12px] text-text-muted px-2">
                    Page {page} of {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPage(page + 1)}
                    disabled={page >= totalPages}
                    className="
                      px-3 py-2 min-h-[44px] md:min-h-0
                      rounded-lg text-[12px] font-semibold
                      bg-white dark:bg-dark-secondary text-text dark:text-[#E0E0E0]
                      border border-black/[0.08] dark:border-white/[0.08]
                      hover:border-black/[0.15] dark:hover:border-white/[0.15]
                      disabled:opacity-40 disabled:cursor-not-allowed
                      transition-all duration-200 cursor-pointer
                      focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none
                    "
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ── My Listings tab ── */}
      {activeTab === 'my_listings' && (
        <>
          {/* Seller payout status (Stripe Connect) */}
          {connectStatus && connectStatus.charges_enabled ? (
            <div className="flex items-center gap-2.5 mb-5 px-4 py-3 rounded-xl bg-secondary/10 text-secondary">
              <CheckCircle2 size={18} className="shrink-0" />
              <span className="text-[13px] font-medium">
                Payouts active — you can sell paid listings.
                {connectStatus.payouts_enabled ? '' : ' Payouts pending verification.'}
              </span>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5 px-4 py-3.5 rounded-xl border border-primary/20 bg-primary/[0.04]">
              <div className="flex items-start gap-2.5 flex-1">
                <CreditCard size={18} className="text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-[13px] font-semibold text-text dark:text-white">
                    {connectStatus?.connected ? 'Finish payout setup' : 'Connect a payout account'}
                  </p>
                  <p className="text-[12px] text-text-muted mt-0.5">
                    {connectStatus?.connected
                      ? 'Complete Stripe onboarding to start receiving payouts from paid sales.'
                      : 'Set up Stripe Connect to list paid assets and get paid. Free listings work without it.'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleConnectPayouts}
                disabled={isConnecting}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg text-[13px] font-medium bg-primary text-white hover:bg-primary/90 transition-colors disabled:opacity-60 shrink-0"
              >
                {isConnecting ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <ExternalLink size={15} />
                )}
                {connectStatus?.connected ? 'Continue setup' : 'Connect Stripe'}
              </button>
            </div>
          )}

          {isMyListingsLoading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-2xl border border-black/[0.05] dark:border-white/[0.05] overflow-hidden bg-white dark:bg-dark-secondary animate-pulse"
                >
                  <div className="w-full aspect-video bg-black/[0.04] dark:bg-white/[0.06]" />
                  <div className="p-3.5">
                    <div className="w-3/4 h-4 bg-black/[0.04] dark:bg-white/[0.06] rounded-md mb-2" />
                    <div className="w-1/2 h-3 bg-black/[0.04] dark:bg-white/[0.06] rounded-md mb-3" />
                    <div className="w-full h-9 bg-black/[0.04] dark:bg-white/[0.06] rounded-xl" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {!isMyListingsLoading && (myListings ?? []).length === 0 && (
            <EmptyState
              icon={<Package size={28} className="text-primary" />}
              headline="No listings yet"
              description="Share your creative assets with the community. List templates, prompts, voice presets, or styles to earn revenue."
              ctaLabel="Create your first listing"
              onCTA={() => {
                /* Future: open create listing modal */
              }}
            />
          )}

          {!isMyListingsLoading && (myListings ?? []).length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {(myListings ?? []).map((listing) => (
                <MarketplaceListingCard
                  key={listing.id}
                  listing={listing}
                  isPurchased={false}
                  onSelect={() => handleSelectListing(listing.id)}
                  onBuy={() => {}}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── My Purchases tab ── */}
      {activeTab === 'my_purchases' && (
        <>
          {isMyPurchasesLoading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-2xl border border-black/[0.05] dark:border-white/[0.05] overflow-hidden bg-white dark:bg-dark-secondary animate-pulse"
                >
                  <div className="w-full aspect-video bg-black/[0.04] dark:bg-white/[0.06]" />
                  <div className="p-3.5">
                    <div className="w-3/4 h-4 bg-black/[0.04] dark:bg-white/[0.06] rounded-md mb-2" />
                    <div className="w-1/2 h-3 bg-black/[0.04] dark:bg-white/[0.06] rounded-md mb-3" />
                    <div className="w-full h-9 bg-black/[0.04] dark:bg-white/[0.06] rounded-xl" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {!isMyPurchasesLoading && (myPurchases ?? []).length === 0 && (
            <EmptyState
              icon={<ShoppingBag size={28} className="text-primary" />}
              headline="No purchases yet"
              description="Browse the marketplace to find templates, prompts, and more from fellow creators."
              ctaLabel="Browse marketplace"
              onCTA={() => setActiveTab('browse')}
            />
          )}

          {!isMyPurchasesLoading && (myPurchases ?? []).length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {(myPurchases ?? []).map((purchase) =>
                purchase.listing ? (
                  <MarketplaceListingCard
                    key={purchase.id}
                    listing={purchase.listing}
                    isPurchased={true}
                    onSelect={() => handleSelectListing(purchase.listing_id)}
                    onBuy={() => {}}
                  />
                ) : null,
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
