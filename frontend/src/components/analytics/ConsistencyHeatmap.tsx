'use client';

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import {
  Flame,
  Trophy,
  CalendarDays,
  ChevronDown,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import { useConsistencyStore } from '@/stores/consistency-store';
import Skeleton from '@/components/ui/Skeleton';
import EmptyState from '@/components/ui/EmptyState';

// ── Constants ────────────────────────────────────────────────

const CELL_SIZE = 13;
const CELL_GAP = 3;
const CELL_RADIUS = 2;
const DAY_LABEL_WIDTH = 28;
const MONTH_LABEL_HEIGHT = 16;

const DAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', ''];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Map post count to a color tier for the heatmap. */
function getColor(count: number, isDark: boolean): string {
  if (count === 0) return isDark ? '#2a2a2a' : '#ebedf0';
  if (count === 1) return isDark ? '#0e4429' : '#9be9a8';
  if (count === 2) return isDark ? '#006d32' : '#40c463';
  if (count <= 4) return isDark ? '#26a641' : '#30a14e';
  return isDark ? '#39d353' : '#216e39'; // 5+, brand green territory
}

/** Get all dates for a given year organized into a 52-53 week grid. */
function getYearGrid(year: number): { date: string; dayOfWeek: number; weekIndex: number }[] {
  const cells: { date: string; dayOfWeek: number; weekIndex: number }[] = [];
  const startDate = new Date(year, 0, 1);
  const endDate = new Date(year, 11, 31);

  // Adjust start to the Sunday of the week containing Jan 1
  const startDay = startDate.getDay(); // 0=Sun, 6=Sat
  const gridStart = new Date(startDate);
  gridStart.setDate(gridStart.getDate() - startDay);

  let current = new Date(gridStart);
  let weekIndex = 0;

  while (current <= endDate || current.getDay() !== 0) {
    const dateStr = current.toISOString().split('T')[0];
    const dayOfWeek = current.getDay(); // 0=Sun, 6=Sat

    // Only include dates within the target year for data lookup
    cells.push({ date: dateStr, dayOfWeek, weekIndex });

    current.setDate(current.getDate() + 1);
    if (current.getDay() === 0) weekIndex++;

    // Safety: don't go beyond 54 weeks
    if (weekIndex > 53) break;
  }

  return cells;
}

/** Determine which month labels to show and their x positions. */
function getMonthLabels(year: number, cells: { date: string; weekIndex: number }[]): { label: string; x: number }[] {
  const labels: { label: string; x: number }[] = [];
  const seen = new Set<number>();

  for (const cell of cells) {
    const d = new Date(cell.date + 'T00:00:00');
    if (d.getFullYear() !== year) continue;
    const month = d.getMonth();
    if (!seen.has(month) && d.getDate() <= 7) {
      seen.add(month);
      labels.push({
        label: MONTH_NAMES[month],
        x: DAY_LABEL_WIDTH + cell.weekIndex * (CELL_SIZE + CELL_GAP),
      });
    }
  }

  return labels;
}

/** Consistency Heatmap — GitHub-style 52-week contribution grid. */
export default function ConsistencyHeatmap() {
  const {
    data,
    currentStreak,
    bestStreak,
    totalPublished,
    year,
    isLoading,
    error,
    setYear,
    fetchConsistency,
  } = useConsistencyStore();

  const [showYearDropdown, setShowYearDropdown] = useState(false);
  const [tooltipData, setTooltipData] = useState<{ x: number; y: number; date: string; count: number } | null>(null);
  const [isDark, setIsDark] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch data on mount
  useEffect(() => {
    fetchConsistency();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Detect dark mode
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const checkDark = () => {
      setIsDark(document.documentElement.classList.contains('dark') || mq.matches);
    };
    checkDark();

    const observer = new MutationObserver(checkDark);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    mq.addEventListener('change', checkDark);

    return () => {
      observer.disconnect();
      mq.removeEventListener('change', checkDark);
    };
  }, []);

  // Close year dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowYearDropdown(false);
      }
    }
    if (showYearDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showYearDropdown]);

  // Compute grid cells
  const cells = useMemo(() => getYearGrid(year), [year]);
  const monthLabels = useMemo(() => getMonthLabels(year, cells), [year, cells]);
  const totalWeeks = useMemo(() => {
    if (cells.length === 0) return 0;
    return cells[cells.length - 1].weekIndex + 1;
  }, [cells]);

  const svgWidth = DAY_LABEL_WIDTH + totalWeeks * (CELL_SIZE + CELL_GAP);
  const svgHeight = MONTH_LABEL_HEIGHT + 7 * (CELL_SIZE + CELL_GAP);

  /** Handle cell hover for tooltip. */
  const handleCellHover = useCallback(
    (e: React.MouseEvent<SVGRectElement>, date: string, count: number) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const containerRect = scrollRef.current?.getBoundingClientRect();
      if (!containerRect) return;
      setTooltipData({
        x: rect.left - containerRect.left + rect.width / 2,
        y: rect.top - containerRect.top - 8,
        date,
        count,
      });
    },
    []
  );

  const handleCellLeave = useCallback(() => {
    setTooltipData(null);
  }, []);

  /** Format tooltip date. */
  function formatTooltipDate(dateStr: string): string {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  }

  // Available years for the dropdown
  const currentYear = new Date().getFullYear();
  const availableYears = Array.from({ length: 5 }, (_, i) => currentYear - i);

  return (
    <div className="bento-card p-4 md:p-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-[14px] font-semibold text-text dark:text-white flex items-center gap-2">
            <CalendarDays size={16} className="text-secondary" />
            Publishing Consistency
          </h3>
          <p className="text-[11px] text-text-muted mt-0.5">
            Track your content publishing streak over time
          </p>
        </div>

        {/* Year selector */}
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setShowYearDropdown(!showYearDropdown)}
            className="flex items-center gap-1.5 px-3 py-1.5 min-h-[44px] md:min-h-0 rounded-lg border border-black/[0.08] dark:border-white/[0.08] text-[12px] font-medium text-text dark:text-[#E0E0E0] hover:border-black/[0.15] dark:hover:border-white/[0.15] transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
          >
            {year}
            <ChevronDown size={13} className={`transition-transform ${showYearDropdown ? 'rotate-180' : ''}`} />
          </button>
          {showYearDropdown && (
            <div className="absolute right-0 top-full mt-1 z-20 bg-white dark:bg-dark-secondary border border-black/[0.06] dark:border-white/[0.06] rounded-xl shadow-lg py-1 min-w-[100px] animate-[fadeIn_150ms_ease-out]">
              {availableYears.map((y) => (
                <button
                  key={y}
                  type="button"
                  onClick={() => {
                    setYear(y);
                    setShowYearDropdown(false);
                  }}
                  className={`
                    w-full text-left px-3 py-2 min-h-[44px] md:min-h-0 text-[12px] font-medium cursor-pointer transition-colors
                    focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none
                    ${y === year
                      ? 'text-primary bg-primary/[0.06]'
                      : 'text-text dark:text-[#E0E0E0] hover:bg-black/[0.03] dark:hover:bg-white/[0.04]'
                    }
                  `}
                >
                  {y}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Streak stats */}
      {!isLoading && !error && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="flex items-center gap-2.5 p-3 rounded-xl bg-black/[0.02] dark:bg-white/[0.03]">
            <div className="w-8 h-8 rounded-lg bg-warning/10 flex items-center justify-center shrink-0">
              <Flame size={16} className="text-warning" />
            </div>
            <div>
              <p className="text-[16px] font-bold text-text dark:text-white leading-none">
                {currentStreak}
              </p>
              <p className="text-[10px] text-text-muted mt-0.5">Current streak</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 p-3 rounded-xl bg-black/[0.02] dark:bg-white/[0.03]">
            <div className="w-8 h-8 rounded-lg bg-secondary/10 flex items-center justify-center shrink-0">
              <Trophy size={16} className="text-secondary" />
            </div>
            <div>
              <p className="text-[16px] font-bold text-text dark:text-white leading-none">
                {bestStreak}
              </p>
              <p className="text-[10px] text-text-muted mt-0.5">Best streak</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 p-3 rounded-xl bg-black/[0.02] dark:bg-white/[0.03]">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <CalendarDays size={16} className="text-primary" />
            </div>
            <div>
              <p className="text-[16px] font-bold text-text dark:text-white leading-none">
                {totalPublished}
              </p>
              <p className="text-[10px] text-text-muted mt-0.5">Total published</p>
            </div>
          </div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="flex flex-col items-center justify-center py-8">
          <div className="flex items-center gap-2 text-[12px] text-danger bg-danger/[0.06] rounded-lg px-3 py-2.5 mb-4">
            <AlertTriangle size={13} className="shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={fetchConsistency}
            className="flex items-center gap-2 text-[12px] font-medium text-primary hover:text-primary-hover cursor-pointer transition-colors min-h-[44px] md:min-h-0"
          >
            <RefreshCw size={13} />
            Try again
          </button>
        </div>
      )}

      {/* Loading skeleton */}
      {isLoading && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-2.5 p-3 rounded-xl bg-black/[0.02] dark:bg-white/[0.03]">
                <Skeleton className="w-8 h-8 rounded-lg" />
                <div>
                  <Skeleton className="w-8 h-5 rounded-md mb-1" />
                  <Skeleton className="w-16 h-3 rounded-md" />
                </div>
              </div>
            ))}
          </div>
          <Skeleton className="w-full h-[120px] rounded-xl" />
        </div>
      )}

      {/* Heatmap grid */}
      {!isLoading && !error && (
        <>
          {/* Empty state when no data at all */}
          {totalPublished === 0 ? (
            <EmptyState
              icon={<CalendarDays size={24} className="text-secondary" />}
              headline="No publishing activity yet"
              description="Start publishing content to build your consistency streak and watch this heatmap light up."
              ctaLabel="Create Your First Video"
              ctaHref="/video/create"
            />
          ) : (
            <div className="relative" ref={scrollRef}>
              {/* Scrollable container for mobile */}
              <div className="overflow-x-auto -mx-4 md:mx-0 px-4 md:px-0 pb-2">
                <svg
                  ref={svgRef}
                  width={svgWidth}
                  height={svgHeight}
                  viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                  className="block"
                  role="img"
                  aria-label={`Publishing consistency heatmap for ${year}`}
                >
                  {/* Month labels */}
                  {monthLabels.map(({ label, x }) => (
                    <text
                      key={label}
                      x={x}
                      y={12}
                      className="fill-text-muted"
                      fontSize={10}
                      fontFamily="Inter, sans-serif"
                    >
                      {label}
                    </text>
                  ))}

                  {/* Day labels */}
                  {DAY_LABELS.map((label, i) => (
                    label && (
                      <text
                        key={`day-${i}`}
                        x={0}
                        y={MONTH_LABEL_HEIGHT + i * (CELL_SIZE + CELL_GAP) + CELL_SIZE - 2}
                        className="fill-text-muted"
                        fontSize={10}
                        fontFamily="Inter, sans-serif"
                      >
                        {label}
                      </text>
                    )
                  ))}

                  {/* Grid cells */}
                  {cells.map((cell) => {
                    const isInYear = cell.date.startsWith(String(year));
                    const count = isInYear ? (data[cell.date] || 0) : 0;
                    const x = DAY_LABEL_WIDTH + cell.weekIndex * (CELL_SIZE + CELL_GAP);
                    const y = MONTH_LABEL_HEIGHT + cell.dayOfWeek * (CELL_SIZE + CELL_GAP);

                    return (
                      <rect
                        key={cell.date}
                        x={x}
                        y={y}
                        width={CELL_SIZE}
                        height={CELL_SIZE}
                        rx={CELL_RADIUS}
                        ry={CELL_RADIUS}
                        fill={isInYear ? getColor(count, isDark) : 'transparent'}
                        className="transition-colors duration-100"
                        onMouseEnter={(e) => isInYear && handleCellHover(e, cell.date, count)}
                        onMouseLeave={handleCellLeave}
                        role="gridcell"
                        aria-label={isInYear ? `${cell.date}: ${count} post${count !== 1 ? 's' : ''}` : undefined}
                      />
                    );
                  })}
                </svg>
              </div>

              {/* Tooltip */}
              {tooltipData && (
                <div
                  className="absolute z-30 pointer-events-none bg-[#1A1A1A] text-white px-2.5 py-1.5 rounded-lg text-[11px] font-medium shadow-lg whitespace-nowrap animate-[fadeIn_100ms_ease-out]"
                  style={{
                    left: tooltipData.x,
                    top: tooltipData.y,
                    transform: 'translate(-50%, -100%)',
                  }}
                >
                  <span className="font-semibold">
                    {tooltipData.count} post{tooltipData.count !== 1 ? 's' : ''}
                  </span>
                  {' on '}
                  {formatTooltipDate(tooltipData.date)}
                </div>
              )}

              {/* Color legend */}
              <div className="flex items-center justify-end gap-1.5 mt-2 text-[10px] text-text-muted">
                <span>Less</span>
                {[0, 1, 2, 3, 5].map((count) => (
                  <div
                    key={count}
                    className="w-[11px] h-[11px] rounded-sm"
                    style={{ backgroundColor: getColor(count, isDark) }}
                  />
                ))}
                <span>More</span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
