'use client';

import type { Platform, ScheduledPostWithVideo } from '@/types';
import { PLATFORM_COLORS } from './PlatformFilter';
import Tooltip from '@/components/ui/Tooltip';

interface CalendarCellProps {
  /** Day number (1-31). */
  day: number;
  /** Full date string YYYY-MM-DD. */
  dateStr: string;
  /** Posts scheduled on this day. */
  posts: ScheduledPostWithVideo[];
  /** Whether this cell is the currently selected date. */
  isSelected: boolean;
  /** Whether this cell represents today's date. */
  isToday: boolean;
  /** Whether this cell is outside the displayed month. */
  isOutsideMonth: boolean;
  /** Click handler for selecting a date. */
  onSelect: (date: string) => void;
}

/** Individual day cell in the calendar grid with post dots and visual states. */
export default function CalendarCell({
  day,
  dateStr,
  posts,
  isSelected,
  isToday,
  isOutsideMonth,
  onSelect,
}: CalendarCellProps) {
  const maxDots = 3;
  const visiblePosts = posts.slice(0, maxDots);
  const overflowCount = posts.length - maxDots;

  return (
    <button
      type="button"
      onClick={() => onSelect(dateStr)}
      aria-label={`${dateStr}${posts.length > 0 ? `, ${posts.length} post${posts.length !== 1 ? 's' : ''} scheduled` : ''}`}
      aria-pressed={isSelected}
      className={`
        relative flex flex-col items-start p-1.5 sm:p-2 rounded-lg text-left
        transition-all duration-150 cursor-pointer group min-h-[44px] sm:min-h-[72px]
        focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none
        ${isOutsideMonth ? 'opacity-30' : ''}
        ${
          isSelected
            ? 'bg-primary/[0.08] dark:bg-primary/[0.12] ring-1 ring-primary/30'
            : 'hover:bg-surface dark:hover:bg-[#252525]'
        }
      `}
    >
      {/* Day number */}
      <span
        className={`
          text-[11px] sm:text-[13px] font-medium leading-none mb-1
          ${
            isToday
              ? 'w-6 h-6 flex items-center justify-center rounded-full bg-primary text-white font-semibold'
              : isSelected
                ? 'text-primary font-semibold'
                : isOutsideMonth
                  ? 'text-muted'
                  : 'text-text dark:text-[#E0E0E0]'
          }
        `}
      >
        {day}
      </span>

      {/* Post dots */}
      {posts.length > 0 && (
        <div className="flex items-center gap-[3px] mt-auto">
          {visiblePosts.map((post, i) => (
            <Tooltip key={post.id ?? i} content={`${post.video_title ?? post.title ?? 'Untitled'}`}>
              <span
                className="w-2.5 h-2.5 sm:w-2 sm:h-2 rounded-full shrink-0 transition-transform group-hover:scale-110"
                style={{
                  backgroundColor: PLATFORM_COLORS[post.platform as Platform] ?? '#8B949E',
                }}
              />
            </Tooltip>
          ))}
          {overflowCount > 0 && (
            <span className="text-[9px] font-semibold text-muted leading-none ml-0.5">
              +{overflowCount}
            </span>
          )}
        </div>
      )}
    </button>
  );
}
