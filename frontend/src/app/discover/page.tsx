'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Lightbulb,
  Search,
  Heart,
  ListFilter,
  RefreshCw,
  AlertTriangle,
  Clock,
  X,
} from 'lucide-react';
import { useDiscoverStore } from '@/stores/discover-store';
import PlatformTabs from '@/components/discover/PlatformTabs';
import IdeaResultCard from '@/components/discover/IdeaResultCard';
import FavouritesList from '@/components/discover/FavouritesList';
import DiscoverSkeleton from '@/components/discover/DiscoverSkeleton';
import EmptyState from '@/components/ui/EmptyState';

/** Discover Ideas page — search platform autocomplete suggestions across 8 platforms. */
export default function DiscoverPage() {
  const {
    query,
    activePlatform,
    results,
    isSearching,
    searchError,
    unavailable,
    unavailableReason,
    recentSearches,
    favourites,
    isFavouritesLoading,
    showFavourites,
    setQuery,
    setActivePlatform,
    search,
    fetchFavourites,
    addFavourite,
    removeFavourite,
    isFavourited,
    toggleShowFavourites,
  } = useDiscoverStore();

  const [showRecent, setShowRecent] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const recentRef = useRef<HTMLDivElement>(null);

  // Set page title
  useEffect(() => {
    document.title = 'Discover Ideas \u2014 Contentine Create';
  }, []);

  // Fetch favourites on mount
  useEffect(() => {
    fetchFavourites().finally(() => setIsInitialLoad(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Close recent dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (recentRef.current && !recentRef.current.contains(e.target as Node)) {
        setShowRecent(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearch = useCallback(() => {
    if (query.trim()) {
      search();
      setShowRecent(false);
    }
  }, [query, search]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleSearch();
      }
    },
    [handleSearch],
  );

  const handleRecentClick = useCallback(
    (term: string) => {
      setQuery(term);
      setShowRecent(false);
      // Trigger search directly via store — query is already set by setQuery above
      useDiscoverStore.getState().search();
    },
    [setQuery],
  );

  const handleUseAsTopic = useCallback((topic: string) => {
    // Navigate to the video creation page with the topic pre-filled
    window.location.href = `/remix?topic=${encodeURIComponent(topic)}`;
  }, []);

  const handleToggleFavourite = useCallback(
    (result: { title: string; source_platform: string; search_volume?: number }) => {
      if (isFavourited(result.title)) {
        const fav = (favourites ?? []).find((f) => f.topic_text === result.title);
        if (fav) removeFavourite(fav.id);
      } else {
        addFavourite(
          result.title,
          result.source_platform as Parameters<typeof addFavourite>[1],
          result.search_volume,
        );
      }
    },
    [isFavourited, favourites, removeFavourite, addFavourite],
  );

  // Show skeleton on initial favourites load
  if (isInitialLoad && isFavouritesLoading) {
    return <DiscoverSkeleton />;
  }

  const safeResults = results ?? [];
  const safeFavourites = favourites ?? [];
  const safeRecentSearches = recentSearches ?? [];

  const hasQuery = query.trim().length > 0;
  const hasResults = safeResults.length > 0;
  const recentToShow = safeRecentSearches.slice(0, 5);

  return (
    <div className="max-w-[1280px] mx-auto animate-fade-in">
      {/* Page header */}
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-0.5">
          <Lightbulb size={20} className="text-primary" />
          <h1 className="text-xl font-semibold text-text dark:text-white tracking-[-0.02em]">
            Discover Ideas
          </h1>
        </div>
        <p className="text-sm text-text-muted">
          Find popular search suggestions and content ideas across 8 platforms
        </p>
      </div>

      {/* Search bar */}
      <div className="relative mb-5" ref={recentRef}>
        <div className="relative">
          <Search
            size={18}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
          />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => recentToShow.length > 0 && setShowRecent(true)}
            onKeyDown={handleKeyDown}
            placeholder="Search any topic..."
            aria-label="Search topics"
            className="
              w-full pl-10 pr-20 py-3 min-h-[52px] md:min-h-[44px]
              rounded-xl border border-black/[0.08] dark:border-white/[0.08]
              bg-white dark:bg-dark-secondary
              text-text dark:text-[#E0E0E0]
              text-[16px] md:text-[13px]
              placeholder:text-text-muted/50
              focus:outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary/30
              transition-all duration-200
            "
          />
          {/* Clear + Search button */}
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {hasQuery && (
              <button
                type="button"
                onClick={() => setQuery('')}
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
              disabled={!hasQuery || isSearching}
              aria-label="Search"
              className="
                flex items-center justify-center px-3 py-1.5
                min-h-[44px] md:min-h-0
                rounded-lg text-[12px] font-semibold
                bg-[#0A0A0A] dark:bg-white text-white dark:text-[#0A0A0A]
                hover:bg-[#1A1A1A] dark:hover:bg-[#E8E8E8]
                disabled:opacity-40 disabled:cursor-not-allowed
                transition-all duration-200 cursor-pointer
                focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none
                active:scale-[0.97]
              "
            >
              {isSearching ? (
                <RefreshCw size={14} className="animate-spin" />
              ) : (
                <Search size={14} />
              )}
            </button>
          </div>
        </div>

        {/* Recent searches dropdown */}
        {showRecent && recentToShow.length > 0 && (
          <div
            className="
              absolute left-0 right-0 top-full mt-1 z-20
              bg-white dark:bg-dark-secondary
              rounded-xl border border-black/[0.06] dark:border-white/[0.06]
              shadow-lg overflow-hidden animate-fade-in
            "
          >
            <div className="px-3 py-2 text-[10px] font-semibold text-text-muted uppercase tracking-wider">
              Recent Searches
            </div>
            {recentToShow.map((term, idx) => (
              <button
                key={`${term}-${idx}`}
                type="button"
                onClick={() => handleRecentClick(term)}
                className="
                  w-full flex items-center gap-2.5 px-3 py-2.5
                  min-h-[44px] md:min-h-0
                  text-left text-[13px] text-text dark:text-[#E0E0E0]
                  hover:bg-surface dark:hover:bg-[#2a2a2a]
                  transition-colors duration-150 cursor-pointer
                  focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none
                "
              >
                <Clock size={13} className="text-text-muted shrink-0" />
                <span className="truncate">{term}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Platform tabs */}
      <div className="mb-5">
        <PlatformTabs active={activePlatform} onChange={setActivePlatform} />
      </div>

      {/* Results / Favourites toggle */}
      <div className="flex items-center gap-1.5 mb-5">
        <button
          type="button"
          onClick={() => showFavourites && toggleShowFavourites()}
          className={`
            inline-flex items-center gap-1.5 px-3 py-2
            min-h-[44px] md:min-h-0
            rounded-lg text-[12px] font-semibold
            transition-all duration-200 cursor-pointer
            focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none
            ${
              !showFavourites
                ? 'bg-[#0A0A0A] dark:bg-white text-white dark:text-[#0A0A0A] shadow-sm'
                : 'bg-surface dark:bg-[#1e1e1e] text-text-secondary dark:text-[#AAA] hover:bg-border-light dark:hover:bg-[#2a2a2a]'
            }
          `}
        >
          <ListFilter size={13} />
          Results
        </button>
        <button
          type="button"
          onClick={() => !showFavourites && toggleShowFavourites()}
          className={`
            inline-flex items-center gap-1.5 px-3 py-2
            min-h-[44px] md:min-h-0
            rounded-lg text-[12px] font-semibold
            transition-all duration-200 cursor-pointer
            focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none
            ${
              showFavourites
                ? 'bg-[#0A0A0A] dark:bg-white text-white dark:text-[#0A0A0A] shadow-sm'
                : 'bg-surface dark:bg-[#1e1e1e] text-text-secondary dark:text-[#AAA] hover:bg-border-light dark:hover:bg-[#2a2a2a]'
            }
          `}
        >
          <Heart size={13} />
          Favourites
          {safeFavourites.length > 0 && (
            <span className="text-[10px] opacity-70 ml-0.5">({safeFavourites.length})</span>
          )}
        </button>
      </div>

      {/* Content area */}
      {showFavourites ? (
        /* ── Favourites view ── */
        <FavouritesList
          favourites={safeFavourites}
          onRemove={removeFavourite}
          onUseAsTopic={handleUseAsTopic}
        />
      ) : (
        /* ── Results view ── */
        <>
          {/* Loading state — skeleton cards */}
          {isSearching && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="bento-card p-4 animate-pulse">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="w-full h-4 bg-black/[0.04] dark:bg-white/[0.06] rounded-md mb-1.5" />
                      <div className="w-3/4 h-4 bg-black/[0.04] dark:bg-white/[0.06] rounded-md" />
                    </div>
                    <div className="w-9 h-9 bg-black/[0.04] dark:bg-white/[0.06] rounded-lg shrink-0" />
                  </div>
                  <div className="w-20 h-5 bg-black/[0.04] dark:bg-white/[0.06] rounded-full mb-2.5" />
                  <div className="w-full h-3 bg-black/[0.04] dark:bg-white/[0.06] rounded-md mb-1" />
                  <div className="w-2/3 h-3 bg-black/[0.04] dark:bg-white/[0.06] rounded-md mb-4" />
                  <div className="flex items-center justify-between">
                    <div className="w-16 h-4 bg-black/[0.04] dark:bg-white/[0.06] rounded-md" />
                    <div className="w-24 h-8 bg-black/[0.04] dark:bg-white/[0.06] rounded-lg" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Error state */}
          {!isSearching && searchError && (
            <div className="max-w-md mx-auto flex flex-col items-center text-center py-16">
              <div className="w-12 h-12 rounded-2xl bg-danger/10 flex items-center justify-center mb-4">
                <AlertTriangle size={24} className="text-danger" />
              </div>
              <h2 className="text-[15px] font-semibold text-text dark:text-white mb-1.5">
                Search failed
              </h2>
              <p className="text-[13px] text-text-muted mb-5 leading-relaxed">
                {searchError}
              </p>
              <button
                type="button"
                onClick={search}
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

          {/* Honest gating — platform has no key-free API (SA-02/F-43). No fabricated data. */}
          {!isSearching && !searchError && unavailable && (
            <EmptyState
              icon={<AlertTriangle size={28} className="text-text-muted" />}
              headline="Not available for this platform"
              description={unavailableReason || 'This platform requires an API key that has not been configured. Try Google, YouTube, or Bing for key-free suggestions.'}
              ctaLabel="Switch to YouTube"
              onCTA={() => setActivePlatform('youtube')}
            />
          )}

          {/* Empty state — no search yet */}
          {!isSearching && !searchError && !unavailable && !hasResults && !hasQuery && (
            <EmptyState
              icon={<Lightbulb size={28} className="text-primary" />}
              headline="Start exploring"
              description="Search for content ideas by entering a topic. Results come from platform search autocomplete (what people are searching for). For AI-powered suggestions, download the LLM model from the Models page."
              ctaLabel="Try a search"
              onCTA={() => inputRef.current?.focus()}
            />
          )}

          {/* Empty state — search returned no results */}
          {!isSearching && !searchError && !unavailable && !hasResults && hasQuery && (
            <EmptyState
              icon={<Search size={28} className="text-text-muted" />}
              headline="No results found"
              description={`No ideas found for "${query}" on this platform. Try a different keyword or switch to another platform.`}
              ctaLabel="Clear search"
              onCTA={() => setQuery('')}
            />
          )}

          {/* Results grid */}
          {!isSearching && !searchError && !unavailable && hasResults && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {safeResults.map((result, idx) => (
                <IdeaResultCard
                  key={`${result.title}-${result.source_platform}-${idx}`}
                  result={result}
                  isFavourited={isFavourited(result.title)}
                  onToggleFavourite={() =>
                    handleToggleFavourite({
                      title: result.title,
                      source_platform: result.source_platform,
                      search_volume: result.search_volume,
                    })
                  }
                  onUseAsTopic={() => handleUseAsTopic(result.title)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
