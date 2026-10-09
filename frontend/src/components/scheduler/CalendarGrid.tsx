'use client';

import { useMemo, useState, useEffect } from 'react';
import type { ScheduledPostWithVideo, Platform } from '@/types';
import CalendarCell from './CalendarCell';

interface CalendarGridProps {
  /** Currently displayed month. */
  currentMonth: Date;
  /** All posts for the current month. */
  posts: ScheduledPostWithVideo[];
  /** Currently selected date (YYYY-MM-DD) or null. */
  selectedDate: string | null;
  /** Active platform filter. */
  platformFilter: Platform | 'all';
  /** Callback when a date is selected. */
  onSelectDate: (date: string) => void;
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_LABELS_SHORT = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** Pad number to 2 digits. */
function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Format a Date to YYYY-MM-DD. */
function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Build a 6-week (42-cell) or 5-week (35-cell) grid for a given month. */
function buildCalendarDays(year: number, month: number): Date[] {
  const firstDay = new Date(year, month, 1);
  // Get day of week — shift so Monday=0
  let startDow = firstDay.getDay() - 1;
  if (startDow < 0) startDow = 6; // Sunday becomes 6

  const days: Date[] = [];

  // Fill previous month trailing days
  for (let i = startDow - 1; i >= 0; i--) {
    const d = new Date(year, month, 1);
    d.setDate(d.getDate() - i - 1);
    days.push(d);
  }

  // Fill current month
  const lastDate = new Date(year, month + 1, 0).getDate();
  for (let d = 1; d <= lastDate; d++) {
    days.push(new Date(year, month, d));
  }

  // Fill next month leading days to reach 35 or 42
  const target = days.length <= 35 ? 35 : 42;
  const nextStart = lastDate + 1;
  for (let i = 0; days.length < target; i++) {
    days.push(new Date(year, month + 1, i + 1));
  }

  return days;
}

/** Monthly calendar grid with 7 columns (Mon-Sun). Responsive: compact week view on mobile. */
export default function CalendarGrid({
  currentMonth,
  posts,
  selectedDate,
  platformFilter,
  onSelectDate,
}: CalendarGridProps) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const todayStr = toDateStr(new Date());

  // Build the full month grid of dates
  const allDays = useMemo(() => buildCalendarDays(year, month), [year, month]);

  // Group posts by date string, applying platform filter
  const postsByDate = useMemo(() => {
    const map: Record<string, ScheduledPostWithVideo[]> = {};
    for (const post of posts) {
      if (platformFilter !== 'all' && post.platform !== platformFilter) continue;
      const key = post.scheduled_at.slice(0, 10);
      if (!map[key]) map[key] = [];
      map[key].push(post);
    }
    return map;
  }, [posts, platformFilter]);

  // In mobile mode, show the week that contains the selected date (or today)
  const mobileWeekDays = useMemo(() => {
    if (!isMobile) return allDays;
    const target = selectedDate || todayStr;
    const targetIdx = allDays.findIndex((d) => toDateStr(d) === target);
    if (targetIdx === -1) return allDays.slice(0, 7);
    const weekStart = Math.floor(targetIdx / 7) * 7;
    return allDays.slice(weekStart, weekStart + 7);
  }, [isMobile, allDays, selectedDate, todayStr]);

  const displayDays = isMobile ? mobileWeekDays : allDays;
  const labels = isMobile ? DAY_LABELS_SHORT : DAY_LABELS;

  return (
    <div className="bg-white dark:bg-[#1e1e1e] rounded-xl border border-border-light dark:border-[#333] p-2 sm:p-3 md:p-4">
      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 gap-0.5 sm:gap-1 mb-1">
        {labels.map((label, i) => (
          <div
            key={i}
            className="text-center py-1.5 text-[10px] sm:text-[11px] font-semibold text-muted uppercase tracking-wider select-none"
          >
            {label}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
        {displayDays.map((date) => {
          const dateStr = toDateStr(date);
          const isOutside = date.getMonth() !== month;
          const dayPosts = postsByDate[dateStr] ?? [];

          return (
            <CalendarCell
              key={dateStr}
              day={date.getDate()}
              dateStr={dateStr}
              posts={dayPosts}
              isSelected={selectedDate === dateStr}
              isToday={dateStr === todayStr}
              isOutsideMonth={isOutside}
              onSelect={onSelectDate}
            />
          );
        })}
      </div>

      {/* Mobile week navigation hint */}
      {isMobile && (
        <p className="text-[10px] text-muted text-center mt-2 select-none">
          Tap a date to see scheduled posts
        </p>
      )}
    </div>
  );
}
