'use client';

import { useMemo } from 'react';
import { CalendarPlus, CalendarOff } from 'lucide-react';
import type { ScheduledPostWithVideo, Platform } from '@/types';
import ScheduleCard from './ScheduleCard';
import EmptyState from '@/components/ui/EmptyState';

interface CalendarSidePanelProps {
  /** Currently selected date (YYYY-MM-DD) or null. */
  selectedDate: string | null;
  /** All posts for the month. */
  posts: ScheduledPostWithVideo[];
  /** Active platform filter. */
  platformFilter: Platform | 'all';
  /** Called when "Schedule a post" CTA is clicked. */
  onSchedulePost: () => void;
  /** Called when edit is requested on a post. */
  onEdit: (post: ScheduledPostWithVideo) => void;
  /** Called when delete is confirmed on a post. */
  onDelete: (id: number) => void;
  /** Called when "Publish Now" is clicked. */
  onPublishNow: (post: ScheduledPostWithVideo) => void;
  /** Called when a post card is clicked (detail view). */
  onPostClick: (post: ScheduledPostWithVideo) => void;
}

/** Format a YYYY-MM-DD date string to a friendly label like "Friday, February 28, 2026". */
function formatDateLabel(dateStr: string): string {
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

/** Side panel showing posts for the selected date with action buttons. */
export default function CalendarSidePanel({
  selectedDate,
  posts,
  platformFilter,
  onSchedulePost,
  onEdit,
  onDelete,
  onPublishNow,
  onPostClick,
}: CalendarSidePanelProps) {
  // Filter posts to the selected date and platform
  const dayPosts = useMemo(() => {
    if (!selectedDate) return [];
    return posts
      .filter((p) => {
        const matchesDate = p.scheduled_at.slice(0, 10) === selectedDate;
        const matchesPlatform = platformFilter === 'all' || p.platform === platformFilter;
        return matchesDate && matchesPlatform;
      })
      .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  }, [posts, selectedDate, platformFilter]);

  // No date selected state
  if (!selectedDate) {
    return (
      <div className="bg-white dark:bg-[#1e1e1e] rounded-xl border border-border-light dark:border-[#333] p-5">
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <div className="w-12 h-12 rounded-xl bg-primary/[0.06] flex items-center justify-center mb-3">
            <CalendarPlus size={24} className="text-primary" />
          </div>
          <p className="text-[13px] font-medium text-text dark:text-[#E0E0E0] mb-1">
            Select a date
          </p>
          <p className="text-[11px] text-muted max-w-[200px]">
            Click on any day in the calendar to see scheduled posts
          </p>
        </div>
      </div>
    );
  }

  const dateLabel = formatDateLabel(selectedDate);

  return (
    <div className="bg-white dark:bg-[#1e1e1e] rounded-xl border border-border-light dark:border-[#333] p-3 sm:p-4">
      {/* Header */}
      <h3 className="text-[14px] font-semibold text-text dark:text-[#E0E0E0] mb-1 leading-tight">
        {dateLabel}
      </h3>
      <p className="text-[11px] text-muted mb-4">
        {dayPosts.length === 0
          ? 'No posts scheduled'
          : `${dayPosts.length} post${dayPosts.length !== 1 ? 's' : ''} scheduled`}
      </p>

      {/* Posts list */}
      {dayPosts.length > 0 ? (
        <div className="space-y-2.5 mb-4 max-h-[420px] overflow-y-auto pr-1 -mx-1 px-1">
          {dayPosts.map((post) => (
            <ScheduleCard
              key={post.id}
              post={post}
              onEdit={onEdit}
              onDelete={onDelete}
              onPublishNow={onPublishNow}
              onClick={onPostClick}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center py-8 text-center">
          <div className="w-10 h-10 rounded-xl bg-surface dark:bg-[#252525] flex items-center justify-center mb-3">
            <CalendarOff size={20} className="text-muted" />
          </div>
          <p className="text-[12px] text-muted mb-1">No posts on this day</p>
          <p className="text-[11px] text-muted/60 max-w-[200px]">
            Schedule a post to keep your content calendar full
          </p>
        </div>
      )}

      {/* Schedule CTA */}
      <button
        type="button"
        onClick={onSchedulePost}
        className="
          w-full flex items-center justify-center gap-2 px-4 py-3 sm:py-2.5 min-h-[44px]
          bg-[#0A0A0A] dark:bg-white text-white dark:text-[#0A0A0A]
          rounded-xl text-[13px] font-semibold
          hover:bg-[#1A1A1A] dark:hover:bg-[#E8E8E8]
          active:scale-[0.98] transition-all duration-150 cursor-pointer
          focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none
        "
        style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.15), 0 0 0 0.5px rgba(0,0,0,0.08)' }}
      >
        <CalendarPlus size={15} />
        Schedule a post
      </button>
    </div>
  );
}
