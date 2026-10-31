'use client';

import { useEffect, useMemo, useCallback, useState } from 'react';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Plus,
  AlertTriangle,
  RefreshCw,
  Link2,
} from 'lucide-react';
import { useScheduleStore } from '@/stores/schedule-store';
import CalendarGrid from '@/components/scheduler/CalendarGrid';
import CalendarSidePanel from '@/components/scheduler/CalendarSidePanel';
import CalendarSkeleton from '@/components/scheduler/CalendarSkeleton';
import PlatformFilter from '@/components/scheduler/PlatformFilter';
import PlatformConnectCard from '@/components/scheduler/PlatformConnectCard';
import EmptyState from '@/components/ui/EmptyState';
import type { Platform } from '@/types';

const ALL_PLATFORMS: Platform[] = ['youtube', 'tiktok', 'instagram', 'facebook', 'linkedin', 'threads', 'twitter'];

/** Format a Date to a month label like "February 2026". */
function formatMonthLabel(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/** Schedule page — monthly calendar with side panel for managing scheduled posts. */
export default function CalendarPage() {
  const {
    posts,
    isLoading,
    fetchError,
    currentMonth,
    selectedDate,
    platformFilter,
    socialAccounts,
    fetchPosts,
    fetchSocialAccounts,
    setSelectedDate,
    setCurrentMonth,
    setPlatformFilter,
    deletePost,
    setSelectedPost,
    publishNow,
    disconnectSocial,
  } = useScheduleStore();

  const [showAccounts, setShowAccounts] = useState(false);

  // Set page title
  useEffect(() => {
    document.title = 'Schedule \u2014 Contentine Create';
  }, []);

  // Fetch data on mount
  useEffect(() => {
    fetchPosts();
    fetchSocialAccounts();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Month navigation
  const goToPreviousMonth = useCallback(() => {
    const prev = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1);
    setCurrentMonth(prev);
  }, [currentMonth, setCurrentMonth]);

  const goToNextMonth = useCallback(() => {
    const next = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
    setCurrentMonth(next);
  }, [currentMonth, setCurrentMonth]);

  const goToToday = useCallback(() => {
    const today = new Date();
    setCurrentMonth(new Date(today.getFullYear(), today.getMonth(), 1));
    const pad = (n: number) => String(n).padStart(2, '0');
    setSelectedDate(`${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`);
  }, [setCurrentMonth, setSelectedDate]);

  // Safe reference to posts array
  const safePosts = useMemo(() => posts ?? [], [posts]);

  // Compute platform counts for the filter pills
  const platformCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const post of safePosts) {
      counts[post.platform] = (counts[post.platform] ?? 0) + 1;
    }
    return counts;
  }, [safePosts]);

  // Filter posts by platform for passing to children
  const filteredPosts = useMemo(() => {
    if (platformFilter === 'all') return safePosts;
    return safePosts.filter((p) => p.platform === platformFilter);
  }, [safePosts, platformFilter]);

  // Check if the calendar is completely empty (no posts at all)
  const isEmptyCalendar = !isLoading && safePosts.length === 0;

  // Handlers
  function handleSchedulePost() {
    // Navigate to video create with pre-selected date
    const dateParam = selectedDate ? `?scheduleDate=${selectedDate}` : '';
    window.location.href = `/video/create${dateParam}`;
  }

  function handleDeletePost(id: number) {
    deletePost(id).catch(() => {});
  }

  function handlePublishNow(post: typeof posts[0]) {
    publishNow(
      post.platform as Platform,
      post.video_id,
      post.title ?? '',
      post.description ?? '',
      post.tags ?? [],
      post.hashtags ?? []
    ).catch(() => {});
  }

  function handleEditPost(post: typeof posts[0]) {
    setSelectedPost(post);
    // Could open a modal — for now just set selection
  }

  function handlePostClick(post: typeof posts[0]) {
    setSelectedPost(post);
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="p-5 lg:p-6">
        <CalendarSkeleton />
      </div>
    );
  }

  // Error state
  if (fetchError) {
    return (
      <div className="p-5 lg:p-6">
        <div className="max-w-md mx-auto flex flex-col items-center text-center py-16">
          <div className="w-12 h-12 rounded-2xl bg-danger/[0.06] flex items-center justify-center mb-4">
            <AlertTriangle className="w-6 h-6 text-danger" />
          </div>
          <h2 className="text-[15px] font-semibold text-text dark:text-white mb-1.5">
            Failed to load schedule
          </h2>
          <p className="text-[13px] text-text-muted mb-5 leading-relaxed">
            {fetchError}
          </p>
          <button
            type="button"
            onClick={() => fetchPosts()}
            className="
              flex items-center gap-2 px-4 py-2.5
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
      </div>
    );
  }

  return (
    <div className="p-5 lg:p-6 max-w-[1280px] mx-auto animate-fade-in">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <CalendarDays size={20} className="text-primary" />
            <h1 className="text-xl font-semibold text-text dark:text-white tracking-[-0.02em]">
              Schedule
            </h1>
          </div>
          <p className="text-sm text-muted">
            {formatMonthLabel(currentMonth)}
          </p>
        </div>

        <button
          type="button"
          onClick={handleSchedulePost}
          className="
            flex items-center gap-2 px-4 py-2.5
            bg-[#0A0A0A] dark:bg-white text-white dark:text-[#0A0A0A]
            rounded-xl text-[13px] font-semibold
            hover:bg-[#1A1A1A] dark:hover:bg-[#E8E8E8]
            active:scale-[0.97] transition-all duration-150 cursor-pointer
            focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none
            self-start sm:self-auto
          "
          style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.15), 0 0 0 0.5px rgba(0,0,0,0.08)' }}
        >
          <Plus size={16} />
          Schedule Post
        </button>
      </div>

      {/* Toolbar: month nav + platform filter */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
        {/* Month navigation */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={goToPreviousMonth}
            aria-label="Previous month"
            className="
              w-11 h-11 md:w-9 md:h-9 flex items-center justify-center rounded-lg
              text-muted hover:text-text dark:hover:text-white
              hover:bg-surface dark:hover:bg-[#252525]
              transition-all duration-150 cursor-pointer
              focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none
            "
          >
            <ChevronLeft size={18} />
          </button>

          <button
            type="button"
            onClick={goToToday}
            className="
              px-3 py-1.5 min-h-[44px] md:min-h-0 rounded-lg text-[12px] font-medium
              text-text dark:text-[#E0E0E0]
              bg-surface dark:bg-[#1e1e1e]
              hover:bg-border-light dark:hover:bg-[#252525]
              transition-all duration-150 cursor-pointer
              focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none
            "
          >
            Today
          </button>

          <button
            type="button"
            onClick={goToNextMonth}
            aria-label="Next month"
            className="
              w-11 h-11 md:w-9 md:h-9 flex items-center justify-center rounded-lg
              text-muted hover:text-text dark:hover:text-white
              hover:bg-surface dark:hover:bg-[#252525]
              transition-all duration-150 cursor-pointer
              focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none
            "
          >
            <ChevronRight size={18} />
          </button>
        </div>

        {/* Platform filter */}
        <PlatformFilter
          activeFilter={platformFilter}
          onChange={setPlatformFilter}
          counts={platformCounts}
          className="flex-1"
        />
      </div>

      {/* Empty state — no posts at all */}
      {isEmptyCalendar && (
        <EmptyState
          icon={<CalendarDays size={28} className="text-primary" />}
          headline="No posts scheduled"
          description="Create your first scheduled post to start publishing content across all your platforms automatically."
          ctaLabel="Schedule Your First Post"
          onCTA={handleSchedulePost}
        />
      )}

      {/* Main area: Calendar + Side panel */}
      {!isEmptyCalendar && (
        <div className="flex flex-col lg:flex-row gap-5">
          {/* Calendar grid — takes 9/12 on desktop */}
          <div className="flex-1 min-w-0">
            <CalendarGrid
              currentMonth={currentMonth}
              posts={safePosts}
              selectedDate={selectedDate}
              platformFilter={platformFilter}
              onSelectDate={setSelectedDate}
            />
          </div>

          {/* Side panel — takes 3/12 on desktop */}
          <div className="w-full lg:w-80 shrink-0">
            <CalendarSidePanel
              selectedDate={selectedDate}
              posts={safePosts}
              platformFilter={platformFilter}
              onSchedulePost={handleSchedulePost}
              onEdit={handleEditPost}
              onDelete={handleDeletePost}
              onPublishNow={handlePublishNow}
              onPostClick={handlePostClick}
            />
          </div>
        </div>
      )}

      {/* Connected Accounts section */}
      <div className="mt-8">
        <button
          type="button"
          onClick={() => setShowAccounts(!showAccounts)}
          className="
            flex items-center gap-2 text-[13px] font-semibold text-text dark:text-[#E0E0E0]
            hover:text-primary transition-colors cursor-pointer min-h-[44px] md:min-h-0
            focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none rounded-lg px-2 py-1.5 md:px-1 md:py-0.5
          "
        >
          <Link2 size={16} className="text-muted" />
          Connected Accounts
          <span className="text-[11px] text-muted font-normal ml-1">
            ({(socialAccounts ?? []).length} of {ALL_PLATFORMS.length})
          </span>
          <ChevronDown
            size={14}
            className={`text-muted transition-transform duration-200 ${showAccounts ? 'rotate-180' : ''}`}
          />
        </button>

        {showAccounts && (
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 animate-fade-in">
            {ALL_PLATFORMS.map((platform) => {
              const account = (socialAccounts ?? []).find((a) => a.platform === platform) ?? null;
              return (
                <PlatformConnectCard
                  key={platform}
                  platform={platform}
                  account={account}
                  onDisconnect={(id) => disconnectSocial(id).catch(() => {})}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
