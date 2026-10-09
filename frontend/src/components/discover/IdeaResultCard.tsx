'use client';

import { Heart, ArrowRight } from 'lucide-react';
import type { IdeaSearchResult } from '@/types';
import { PLATFORMS } from '@/components/discover/PlatformTabs';

interface IdeaResultCardProps {
  result: IdeaSearchResult;
  isFavourited: boolean;
  onToggleFavourite: () => void;
  onUseAsTopic: () => void;
}

/** Format large numbers with K/M suffix for compact display. */
function formatVolume(volume: number): string {
  if (volume >= 1_000_000) return `${(volume / 1_000_000).toFixed(1)}M searches`;
  if (volume >= 1_000) return `${(volume / 1_000).toFixed(0)}K searches`;
  return `${volume} searches`;
}

/** A single search result card for Discover Ideas. */
export default function IdeaResultCard({
  result,
  isFavourited,
  onToggleFavourite,
  onUseAsTopic,
}: IdeaResultCardProps) {
  const platform = PLATFORMS.find((p) => p.id === result.source_platform);
  const PlatformIcon = platform?.icon;

  return (
    <div className="bento-card p-4 flex flex-col gap-2.5 group">
      {/* Top: title + favourite */}
      <div className="flex items-start gap-2">
        <h3 className="flex-1 min-w-0 text-[13px] font-semibold text-text dark:text-[#E0E0E0] leading-snug line-clamp-2">
          {result.title}
        </h3>
        <button
          type="button"
          onClick={onToggleFavourite}
          aria-label={isFavourited ? 'Remove from favourites' : 'Add to favourites'}
          className={`
            shrink-0 flex items-center justify-center
            w-9 h-9 min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0
            rounded-lg transition-all duration-200 cursor-pointer
            focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none
            active:scale-[0.92]
            ${
              isFavourited
                ? 'text-accent bg-accent/[0.08] hover:bg-accent/[0.14]'
                : 'text-text-muted hover:text-accent hover:bg-accent/[0.06] dark:hover:bg-accent/[0.08]'
            }
          `}
        >
          <Heart size={16} fill={isFavourited ? 'currentColor' : 'none'} />
        </button>
      </div>

      {/* Platform badge + volume */}
      <div className="flex items-center gap-2 flex-wrap">
        {platform && PlatformIcon && (
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold"
            style={{
              backgroundColor: `${platform.color}12`,
              color: platform.color,
            }}
          >
            <PlatformIcon size={10} />
            {platform.label}
          </span>
        )}
        {result.search_volume != null && result.search_volume > 0 && (
          <span className="text-[10px] font-medium text-text-muted dark:text-[#888]">
            {formatVolume(result.search_volume)}
          </span>
        )}
      </div>

      {/* Description */}
      {result.description && (
        <p className="text-[11px] text-text-muted dark:text-[#888] leading-relaxed line-clamp-2">
          {result.description}
        </p>
      )}

      {/* Action row */}
      <div className="flex items-center justify-end mt-auto pt-1">
        <button
          type="button"
          onClick={onUseAsTopic}
          className="
            inline-flex items-center gap-1.5 px-3 py-1.5
            min-h-[44px] md:min-h-0
            rounded-lg text-[11px] font-semibold
            text-primary hover:bg-primary/[0.06] dark:hover:bg-primary/[0.08]
            transition-all duration-200 cursor-pointer
            focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none
            active:scale-[0.97]
          "
        >
          Use as topic
          <ArrowRight size={12} />
        </button>
      </div>
    </div>
  );
}
