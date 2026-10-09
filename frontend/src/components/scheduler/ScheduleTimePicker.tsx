'use client';

import { useState, useMemo, useCallback } from 'react';
import { Calendar, Clock, Zap, AlertCircle } from 'lucide-react';

interface ScheduleTimePickerProps {
  value: string; // ISO string or empty
  onChange: (iso: string) => void;
  error?: string;
  timezone?: string;
  className?: string;
}

/** Generates time options in 15-minute increments for dropdown. */
function generateTimeOptions(): { label: string; value: string }[] {
  const options: { label: string; value: string }[] = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 15) {
      const hh = String(h).padStart(2, '0');
      const mm = String(m).padStart(2, '0');
      const ampm = h >= 12 ? 'PM' : 'AM';
      const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
      options.push({
        label: `${displayH}:${mm} ${ampm}`,
        value: `${hh}:${mm}`,
      });
    }
  }
  return options;
}

const TIME_OPTIONS = generateTimeOptions();

/** Date and time picker with 15-min increments, timezone display, and "Now" button. */
export default function ScheduleTimePicker({
  value,
  onChange,
  error,
  timezone,
  className = '',
}: ScheduleTimePickerProps) {
  const displayTimezone = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

  // Parse value into date and time parts
  const { dateStr, timeStr } = useMemo(() => {
    if (!value) return { dateStr: '', timeStr: '' };
    try {
      const d = new Date(value);
      if (isNaN(d.getTime())) return { dateStr: '', timeStr: '' };
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const hh = String(d.getHours()).padStart(2, '0');
      const min = String(d.getMinutes()).padStart(2, '0');
      return { dateStr: `${yyyy}-${mm}-${dd}`, timeStr: `${hh}:${min}` };
    } catch {
      return { dateStr: '', timeStr: '' };
    }
  }, [value]);

  const composeISO = useCallback(
    (newDate: string, newTime: string) => {
      if (!newDate || !newTime) return;
      const [hh, mm] = newTime.split(':');
      const iso = `${newDate}T${hh}:${mm}:00`;
      onChange(iso);
    },
    [onChange]
  );

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDate = e.target.value;
    composeISO(newDate, timeStr || '09:00');
  };

  const handleTimeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newTime = e.target.value;
    composeISO(dateStr || todayStr(), newTime);
  };

  const handleNow = () => {
    const now = new Date();
    // Round up to the next 15-minute mark
    const minutes = now.getMinutes();
    const remainder = minutes % 15;
    if (remainder > 0) {
      now.setMinutes(minutes + (15 - remainder));
    }
    now.setSeconds(0);
    now.setMilliseconds(0);
    // If rounding pushed us to next hour, that's handled automatically
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    onChange(`${yyyy}-${mm}-${dd}T${hh}:${min}:00`);
  };

  // Today as YYYY-MM-DD for min attribute
  const minDate = todayStr();

  return (
    <div className={className}>
      <label className="block text-[12px] font-medium text-text dark:text-[#E0E0E0] mb-1.5">
        Schedule Date & Time
      </label>

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        {/* Date input */}
        <div className="relative flex-1">
          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted/50 pointer-events-none" />
          <input
            type="date"
            value={dateStr}
            min={minDate}
            onChange={handleDateChange}
            className="w-full pl-9 pr-3 py-2.5 min-h-[44px] text-[16px] md:text-[13px] rounded-xl bg-white dark:bg-dark-secondary text-text dark:text-[#E0E0E0] border border-black/[0.08] dark:border-white/[0.08] focus:outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary/30 transition-all duration-200"
          />
        </div>

        {/* Time dropdown */}
        <div className="relative flex-1">
          <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted/50 pointer-events-none" />
          <select
            value={timeStr}
            onChange={handleTimeChange}
            className="w-full pl-9 pr-3 py-2.5 min-h-[44px] text-[16px] md:text-[13px] rounded-xl bg-white dark:bg-dark-secondary text-text dark:text-[#E0E0E0] border border-black/[0.08] dark:border-white/[0.08] focus:outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary/30 transition-all duration-200 appearance-none cursor-pointer"
          >
            <option value="" disabled>
              Select time
            </option>
            {TIME_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Now quick button */}
        <button
          type="button"
          onClick={handleNow}
          className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 min-h-[44px] min-w-[44px] rounded-xl text-[12px] font-semibold text-primary hover:bg-primary/[0.06] dark:hover:bg-primary/[0.12] border border-primary/20 transition-all duration-150 cursor-pointer shrink-0 focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
        >
          <Zap className="w-3.5 h-3.5" />
          Now
        </button>
      </div>

      {/* Bottom row: timezone + error */}
      <div className="flex items-center justify-between mt-1.5">
        {error ? (
          <p className="flex items-center gap-1 text-[11px] text-danger">
            <AlertCircle className="w-3 h-3" />
            {error}
          </p>
        ) : (
          <span className="text-[10px] text-text-muted/50">
            Timezone: {displayTimezone}
          </span>
        )}
      </div>
    </div>
  );
}

/** Returns today in YYYY-MM-DD format. */
function todayStr(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
