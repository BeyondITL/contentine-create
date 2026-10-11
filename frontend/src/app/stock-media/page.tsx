'use client';

import { useEffect, useRef, useCallback } from 'react';
import {
  Image as ImageIcon,
  Search,
  X,
  RefreshCw,
  AlertTriangle,
  Camera,
  Video,
  Music,
  Loader2,
  Clock,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useStockStore } from '@/stores/stock-store';
import { useEditorStore } from '@/stores/editor-store';
import type { StockMediaType, StockSource, StockItem } from '@/stores/stock-store';
import StockMediaGrid from '@/components/stock/StockMediaGrid';
import StockSkeleton from '@/components/stock/StockSkeleton';
import EmptyState from '@/components/ui/EmptyState';

/** Media type tab definitions. */
const MEDIA_TYPES: { id: StockMediaType; label: string; icon: typeof Camera }[] = [
  { id: 'photo', label: 'Photos', icon: Camera },
  { id: 'video', label: 'Videos', icon: Video },
  { id: 'audio', label: 'Audio', icon: Music },
];

/** Source filter options. */
const SOURCES: { id: StockSource; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'openverse', label: 'Openverse' },
  { id: 'pexels', label: 'Pexels' },
  { id: 'pixabay', label: 'Pixabay' },
  { id: 'freesound', label: 'Freesound' },
];

/** Stock Media page -- search and browse free stock photos, videos, and audio. */
export default function StockMediaPage() {
  const {
    query,
    mediaType,
    source,
    results,
    isSearching,
    page,
    totalResults,
    searchError,
    isLoadingMore,
    sourceWarnings,
    isDemoFallback,
    setQuery,
    setMediaType,
    setSource,
    search,
    loadMore,
    getDownloadUrl,
    clearResults,
    clearWarnings,
  } = useStockStore();

  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Set page title
  useEffect(() => {
    document.title = 'Stock Media \u2014 Contentine Create';
  }, []);

  const handleSearch = useCallback(() => {
    if (query.trim()) {
      search();
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

  const handleAddToVideo = useCallback(
    (item: StockItem) => {
      // Push the selection straight into the (in-memory) editor store, then do a
      // CLIENT-SIDE navigation. A full-page `window.location` reload wiped that
      // store, which is why the old flow flickered to an empty Script step.
      const editor = useEditorStore.getState();
      const mediaUrl = item.preview_url || item.download_url;

      if (item.type === 'audio') {
        // Audio becomes the project's background music track (set on the Style step).
        editor.setMusicUrl(item.download_url || item.preview_url);
        editor.setStep(4);
        router.push('/video/create');
        return;
      }

      // Photo / video poster attaches to a scene as its visual.
      const scenes = editor.scenes ?? [];
      const firstEmpty =
        scenes.length === 1 && !scenes[0].narration.trim() && !scenes[0].image_url;
      if (firstEmpty) {
        editor.updateScene(scenes[0].id, {
          image_url: mediaUrl,
          visual_prompt: item.title || scenes[0].visual_prompt,
        });
      } else {
        editor.addScene();
        const updated = useEditorStore.getState().scenes;
        const added = updated[updated.length - 1];
        editor.updateScene(added.id, {
          image_url: mediaUrl,
          visual_prompt: item.title || '',
        });
      }
      editor.setStep(2);
      router.push('/video/create');
    },
    [router],
  );

  const handleDownload = useCallback(
    async (item: StockItem) => {
      const url = await getDownloadUrl(item.source, item.id);
      if (url) {
        const link = document.createElement('a');
        link.href = url;
        link.download = item.title || 'stock-media';
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    },
    [getDownloadUrl],
  );

  const safeResults = results ?? [];
  const safeWarnings = sourceWarnings ?? [];

  const hasQuery = query.trim().length > 0;
  const hasResults = safeResults.length > 0;
  const canLoadMore = hasResults && safeResults.length < totalResults;

  return (
    <div className="max-w-[1280px] mx-auto animate-fade-in">
      {/* Page header */}
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-0.5">
          <ImageIcon size={20} className="text-primary" />
          <h1 className="text-xl font-semibold text-text dark:text-white tracking-[-0.02em]">
            Stock Media
          </h1>
        </div>
        <p className="text-sm text-text-muted">
          Search millions of free stock photos, videos, and audio clips
        </p>
      </div>

      {/* Search bar */}
      <div className="relative mb-5">
        <Search
          size={18}
          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
        />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search stock media..."
          aria-label="Search stock media"
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
              onClick={() => {
                setQuery('');
                clearResults();
              }}
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

      {/* Media type tabs */}
      <div className="flex items-center gap-1.5 mb-5 overflow-x-auto scrollbar-hide">
        {MEDIA_TYPES.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setMediaType(id)}
            className={`
              inline-flex items-center gap-1.5 px-3.5 py-2.5
              min-h-[44px] md:min-h-0
              rounded-xl text-[12px] font-semibold whitespace-nowrap shrink-0
              transition-all duration-200 cursor-pointer
              focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none
              active:scale-[0.97]
              ${
                mediaType === id
                  ? 'bg-[#0A0A0A] dark:bg-white text-white dark:text-[#0A0A0A] shadow-sm'
                  : 'bg-surface dark:bg-[#1e1e1e] text-text-secondary dark:text-[#AAA] hover:bg-border-light dark:hover:bg-[#2a2a2a]'
              }
            `}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* Source filter */}
      <div className="flex items-center gap-1.5 mb-5 overflow-x-auto scrollbar-hide">
        {SOURCES.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setSource(id)}
            className={`
              inline-flex items-center px-3 py-2
              min-h-[44px] md:min-h-0
              rounded-lg text-[11px] font-semibold whitespace-nowrap shrink-0
              transition-all duration-200 cursor-pointer
              focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none
              active:scale-[0.97]
              ${
                source === id
                  ? 'bg-primary/[0.08] text-primary dark:bg-primary/[0.12] dark:text-primary'
                  : 'bg-transparent text-text-muted hover:bg-surface dark:hover:bg-[#1e1e1e] hover:text-text dark:hover:text-[#CCC]'
              }
            `}
          >
            {label}
          </button>
        ))}

        {/* Results count */}
        {hasResults && !isSearching && (
          <span className="ml-auto text-[11px] text-text-muted dark:text-[#777] whitespace-nowrap shrink-0">
            {totalResults.toLocaleString()} result{totalResults !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* ── Rate limit warnings ── */}
      {safeWarnings.length > 0 && (
        <div className="flex items-start gap-3 p-3 rounded-xl bg-warning/[0.06] border border-warning/20 mb-5">
          <Clock size={16} className="text-warning mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-[12px] font-semibold text-text dark:text-white mb-0.5">
              Rate limit warning
            </p>
            {safeWarnings.map((w, i) => (
              <p key={i} className="text-[11px] text-text-muted leading-relaxed">{w}</p>
            ))}
          </div>
          <button
            type="button"
            onClick={clearWarnings}
            aria-label="Dismiss warnings"
            className="text-text-muted hover:text-text dark:hover:text-white transition-colors p-1 cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── Content area ── */}

      {/* Loading state -- skeleton cards */}
      {isSearching && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="bento-card overflow-hidden animate-pulse">
              <div className="w-full aspect-[4/3] bg-black/[0.04] dark:bg-white/[0.06]" />
              <div className="p-3.5">
                <div className="w-3/4 h-4 bg-black/[0.04] dark:bg-white/[0.06] rounded-md mb-2" />
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-16 h-5 bg-black/[0.04] dark:bg-white/[0.06] rounded-full" />
                  <div className="w-24 h-3 bg-black/[0.04] dark:bg-white/[0.06] rounded-md" />
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-8 bg-black/[0.04] dark:bg-white/[0.06] rounded-lg" />
                  <div className="w-9 h-8 bg-black/[0.04] dark:bg-white/[0.06] rounded-lg" />
                </div>
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
          <div className="text-[13px] text-text-muted mb-5 leading-relaxed space-y-1">
            {searchError.split('\n').map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
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

      {/* Empty state -- no search yet */}
      {!isSearching && !searchError && !hasResults && !hasQuery && (
        <EmptyState
          icon={<ImageIcon size={28} className="text-primary" />}
          headline="Search millions of free media"
          description="Find the perfect stock photos, videos, and audio clips for your next video. All assets are free to use commercially."
          ctaLabel="Start searching"
          onCTA={() => inputRef.current?.focus()}
        />
      )}

      {/* Empty state -- search returned no results */}
      {!isSearching && !searchError && !hasResults && hasQuery && (
        <EmptyState
          icon={<Search size={28} className="text-text-muted" />}
          headline="No results found"
          description={`No ${mediaType === 'photo' ? 'photos' : mediaType === 'video' ? 'videos' : 'audio clips'} found for "${query}". Try a different keyword or switch to another source.`}
          ctaLabel="Clear search"
          onCTA={() => {
            setQuery('');
            clearResults();
          }}
        />
      )}

      {/* Results grid */}
      {!isSearching && !searchError && hasResults && (
        <>
          {/* Demo fallback label — shown when API is offline and items are placeholder data */}
          {isDemoFallback && (
            <div className="flex items-center gap-2 px-3 py-2 mb-4 rounded-lg bg-black/[0.03] dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.06]">
              <AlertTriangle size={13} className="text-warning shrink-0" />
              <span className="text-[11px] font-medium text-text-muted dark:text-[#888]">
                demo items — offline
              </span>
            </div>
          )}
          <StockMediaGrid
            items={safeResults}
            onAddToVideo={handleAddToVideo}
            onDownload={handleDownload}
          />

          {/* Load more */}
          {canLoadMore && (
            <div className="flex justify-center mt-8 mb-4">
              <button
                type="button"
                onClick={loadMore}
                disabled={isLoadingMore}
                className="
                  inline-flex items-center gap-2 px-6 py-3
                  min-h-[44px] md:min-h-0
                  rounded-xl text-[13px] font-semibold
                  bg-surface dark:bg-[#1e1e1e]
                  text-text dark:text-[#E0E0E0]
                  border border-black/[0.06] dark:border-white/[0.06]
                  hover:bg-border-light dark:hover:bg-[#2a2a2a]
                  disabled:opacity-50 disabled:cursor-not-allowed
                  active:scale-[0.97]
                  transition-all duration-200 cursor-pointer
                  focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none
                "
              >
                {isLoadingMore ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Loading...
                  </>
                ) : (
                  <>
                    Load more
                    <span className="text-[11px] text-text-muted font-normal">
                      ({safeResults.length} of {totalResults.toLocaleString()})
                    </span>
                  </>
                )}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
