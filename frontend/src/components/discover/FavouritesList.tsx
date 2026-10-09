'use client';

import { useState } from 'react';
import { Trash2, ArrowRight, Heart, Clock } from 'lucide-react';
import type { FavouriteTopic } from '@/types';
import { PLATFORMS } from '@/components/discover/PlatformTabs';
import { formatDistanceToNow } from 'date-fns';

interface FavouritesListProps {
  favourites: FavouriteTopic[];
  onRemove: (id: number) => void;
  onUseAsTopic: (topic: string) => void;
}

/** Format large numbers with K/M suffix for compact display. */
function formatVolume(volume: number): string {
  if (volume >= 1_000_000) return `${(volume / 1_000_000).toFixed(1)}M`;
  if (volume >= 1_000) return `${(volume / 1_000).toFixed(0)}K`;
  return `${volume}`;
}

/** List of favourite topics with remove and use-as-topic actions. */
export default function FavouritesList({ favourites, onRemove, onUseAsTopic }: FavouritesListProps) {
  const [confirmingId, setConfirmingId] = useState<number | null>(null);

  if (favourites.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 md:py-16 text-center">
        <div className="w-14 h-14 rounded-2xl bg-accent/[0.06] flex items-center justify-center mb-4">
          <Heart size={28} className="text-accent" />
        </div>
        <h3 className="text-[16px] md:text-[15px] font-semibold text-text dark:text-[#E0E0E0] mb-1">
          No favourites yet
        </h3>
        <p className="text-[12px] text-text-muted max-w-[280px] md:max-w-[320px] leading-relaxed">
          Search for topics and save the ones you love. Your favourites will appear here for quick access.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {favourites.map((fav) => {
        const platform = PLATFORMS.find((p) => p.id === fav.source_platform);
        const PlatformIcon = platform?.icon;
        const isConfirming = confirmingId === fav.id;

        return (
          <div
            key={fav.id}
            className="bento-card p-4 flex items-center gap-3"
          >
            {/* Topic info */}
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-text dark:text-[#E0E0E0] truncate mb-1">
                {fav.topic_text}
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                {platform && PlatformIcon && (
                  <span
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold"
                    style={{
                      backgroundColor: `${platform.color}12`,
                      color: platform.color,
                    }}
                  >
                    <PlatformIcon size={9} />
                    {platform.label}
                  </span>
                )}
                {fav.search_volume != null && fav.search_volume > 0 && (
                  <span className="text-[10px] text-text-muted dark:text-[#888]">
                    {formatVolume(fav.search_volume)} searches
                  </span>
                )}
                <span className="inline-flex items-center gap-0.5 text-[10px] text-text-muted dark:text-[#777]">
                  <Clock size={9} />
                  {formatDistanceToNow(new Date(fav.created_at), { addSuffix: true })}
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => onUseAsTopic(fav.topic_text)}
                aria-label={`Use "${fav.topic_text}" as video topic`}
                className="
                  inline-flex items-center gap-1 px-2.5 py-1.5
                  min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0
                  rounded-lg text-[11px] font-semibold
                  text-primary hover:bg-primary/[0.06] dark:hover:bg-primary/[0.08]
                  transition-all duration-200 cursor-pointer
                  focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none
                  active:scale-[0.97]
                "
              >
                <span className="hidden sm:inline">Use as topic</span>
                <ArrowRight size={12} />
              </button>

              {isConfirming ? (
                <button
                  type="button"
                  onClick={() => {
                    onRemove(fav.id);
                    setConfirmingId(null);
                  }}
                  className="
                    inline-flex items-center gap-1 px-2.5 py-1.5
                    min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0
                    rounded-lg text-[11px] font-semibold
                    text-danger bg-danger/[0.06] hover:bg-danger/[0.12]
                    transition-all duration-200 cursor-pointer
                    focus-visible:ring-2 focus-visible:ring-danger/40 focus-visible:outline-none
                    active:scale-[0.97]
                  "
                  onBlur={() => setConfirmingId(null)}
                >
                  Confirm
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingId(fav.id)}
                  aria-label={`Remove "${fav.topic_text}" from favourites`}
                  className="
                    flex items-center justify-center
                    min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0
                    w-9 h-9 rounded-lg
                    text-text-muted hover:text-danger hover:bg-danger/[0.06]
                    transition-all duration-200 cursor-pointer
                    focus-visible:ring-2 focus-visible:ring-danger/40 focus-visible:outline-none
                    active:scale-[0.92]
                  "
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
