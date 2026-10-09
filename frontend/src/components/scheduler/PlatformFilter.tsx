'use client';

import {
  Youtube,
  Music2,
  Instagram,
  Facebook,
  Linkedin,
  AtSign,
  Twitter,
} from 'lucide-react';
import type { Platform } from '@/types';
import type { ReactNode } from 'react';
import Tooltip from '@/components/ui/Tooltip';

/** Platform metadata for consistent icon/label/color mapping. */
export const PLATFORM_COLORS: Record<Platform, string> = {
  youtube: '#FF0000',
  tiktok: '#25F4EE',
  instagram: '#E1306C',
  facebook: '#1877F2',
  linkedin: '#0A66C2',
  threads: '#555555',
  twitter: '#1DA1F2',
};

export const PLATFORM_ICONS: Record<Platform, ReactNode> = {
  youtube: <Youtube size={14} />,
  tiktok: <Music2 size={14} />,
  instagram: <Instagram size={14} />,
  facebook: <Facebook size={14} />,
  linkedin: <Linkedin size={14} />,
  threads: <AtSign size={14} />,
  twitter: <Twitter size={14} />,
};

export const PLATFORM_LABELS: Record<Platform, string> = {
  youtube: 'YouTube',
  tiktok: 'TikTok',
  instagram: 'Instagram',
  facebook: 'Facebook',
  linkedin: 'LinkedIn',
  threads: 'Threads',
  twitter: 'Twitter',
};

const ALL_PLATFORMS: Platform[] = [
  'youtube',
  'tiktok',
  'instagram',
  'facebook',
  'linkedin',
  'threads',
  'twitter',
];

interface PlatformFilterProps {
  activeFilter: Platform | 'all';
  onChange: (platform: Platform | 'all') => void;
  /** Post counts by platform, used to show badges. */
  counts?: Record<string, number>;
  className?: string;
}

/** Horizontal pill filter for platform selection with icons and counts. */
export default function PlatformFilter({
  activeFilter,
  onChange,
  counts,
  className = '',
}: PlatformFilterProps) {
  const totalCount = counts
    ? Object.values(counts).reduce((sum, n) => sum + n, 0)
    : 0;

  return (
    <div
      className={`flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 -mx-1 px-1 scrollbar-hide ${className}`}
      role="tablist"
      aria-label="Filter by platform"
    >
      {/* All pill */}
      <button
        type="button"
        role="tab"
        aria-selected={activeFilter === 'all'}
        onClick={() => onChange('all')}
        className={`
          shrink-0 flex items-center gap-1.5 px-3 py-1.5 min-h-[44px] md:min-h-0 text-xs font-medium rounded-full
          transition-all duration-150 cursor-pointer
          focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none
          ${
            activeFilter === 'all'
              ? 'bg-[#0A0A0A] dark:bg-white text-white dark:text-[#0A0A0A]'
              : 'bg-surface dark:bg-[#1e1e1e] text-muted hover:text-text dark:hover:text-white'
          }
        `}
      >
        All
        {totalCount > 0 && (
          <span
            className={`
              text-[10px] font-semibold px-1.5 py-0.5 rounded-full leading-none
              ${
                activeFilter === 'all'
                  ? 'bg-white/20 dark:bg-black/20'
                  : 'bg-black/[0.06] dark:bg-white/[0.08]'
              }
            `}
          >
            {totalCount}
          </span>
        )}
      </button>

      {ALL_PLATFORMS.map((platform) => {
        const isActive = activeFilter === platform;
        const count = counts?.[platform] ?? 0;

        return (
          <Tooltip key={platform} content={PLATFORM_LABELS[platform]}>
            <button
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onChange(platform)}
              className={`
                shrink-0 flex items-center gap-1.5 px-3 py-1.5 min-h-[44px] md:min-h-0 text-xs font-medium rounded-full
                transition-all duration-150 cursor-pointer
                focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none
                ${
                  isActive
                    ? 'text-white shadow-sm'
                    : 'bg-surface dark:bg-[#1e1e1e] text-muted hover:text-text dark:hover:text-white'
                }
              `}
              style={
                isActive
                  ? { backgroundColor: PLATFORM_COLORS[platform] }
                  : undefined
              }
            >
              <span
                className="flex items-center"
                style={
                  !isActive
                    ? { color: PLATFORM_COLORS[platform] }
                    : undefined
                }
              >
                {PLATFORM_ICONS[platform]}
              </span>
              <span className="hidden sm:inline">
                {PLATFORM_LABELS[platform]}
              </span>
              {count > 0 && (
                <span
                  className={`
                    text-[10px] font-semibold px-1.5 py-0.5 rounded-full leading-none
                    ${
                      isActive
                        ? 'bg-white/25'
                        : 'bg-black/[0.06] dark:bg-white/[0.08]'
                    }
                  `}
                >
                  {count}
                </span>
              )}
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}
