'use client';

import { useState, useMemo, Fragment } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown, MessageSquare, ChevronDown } from 'lucide-react';
import type { VideoAnalytics } from '@/types';
import VideoComments from '@/components/comments/VideoComments';

/** Format large numbers. */
function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

/** Capitalize first letter. */
function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

type SortKey = 'title' | 'platform' | 'views' | 'likes' | 'comments' | 'shares' | 'ctr';
type SortDir = 'asc' | 'desc';

interface VideoTableProps {
  data: VideoAnalytics[];
}

/** Sortable table of per-video metrics. */
export default function VideoTable({ data }: VideoTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('views');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const sorted = useMemo(() => {
    return [...data].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDir === 'asc'
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }
      return sortDir === 'asc'
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number);
    });
  }, [data, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ArrowUpDown size={12} className="text-text-muted/50" />;
    return sortDir === 'asc'
      ? <ArrowUp size={12} className="text-primary" />
      : <ArrowDown size={12} className="text-primary" />;
  }

  const columns: { key: SortKey; label: string; align?: string }[] = [
    { key: 'title', label: 'Video' },
    { key: 'platform', label: 'Platform' },
    { key: 'views', label: 'Views', align: 'text-right' },
    { key: 'likes', label: 'Likes', align: 'text-right' },
    { key: 'comments', label: 'Comments', align: 'text-right' },
    { key: 'shares', label: 'Shares', align: 'text-right' },
    { key: 'ctr', label: 'CTR', align: 'text-right' },
  ];

  if (!data.length) {
    return (
      <div className="bento-card p-5 flex items-center justify-center h-[120px]">
        <p className="text-[13px] text-text-muted">No video performance data available</p>
      </div>
    );
  }

  return (
    <div className="bento-card overflow-hidden">
      <div className="px-4 md:px-5 py-3 border-b border-black/[0.04] dark:border-white/[0.04]">
        <h3 className="text-[13px] font-semibold text-text dark:text-[#E0E0E0]">
          Video Performance
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead>
            <tr className="border-b border-black/[0.04] dark:border-white/[0.04]">
              {columns.map((col) => (
                <th key={col.key} className={`px-4 py-2.5 ${col.align || 'text-left'}`}>
                  <button
                    type="button"
                    onClick={() => handleSort(col.key)}
                    className={`
                      inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider
                      text-text-muted hover:text-text dark:hover:text-white transition-colors
                      cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded
                    `}
                  >
                    {col.label}
                    <SortIcon col={col.key} />
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((video) => {
              const rowKey = `${video.video_id}-${video.platform}`;
              const isExpanded = expandedKey === rowKey;
              return (
                <Fragment key={rowKey}>
                  <tr
                    className="border-b border-black/[0.02] dark:border-white/[0.02] last:border-0 hover:bg-surface/50 dark:hover:bg-white/[0.02] transition-colors"
                  >
                    <td className="px-4 py-3">
                      <p className="text-[13px] font-medium text-text dark:text-[#E0E0E0] truncate max-w-[200px]">
                        {video.title}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="badge-info text-[10px]">{cap(video.platform)}</span>
                    </td>
                    <td className="px-4 py-3 text-right text-[13px] text-text dark:text-[#E0E0E0] tabular-nums">
                      {fmt(video.views)}
                    </td>
                    <td className="px-4 py-3 text-right text-[13px] text-text dark:text-[#E0E0E0] tabular-nums">
                      {fmt(video.likes)}
                    </td>
                    <td className="px-4 py-3 text-right text-[13px] text-text dark:text-[#E0E0E0] tabular-nums">
                      <button
                        type="button"
                        onClick={() => setExpandedKey(isExpanded ? null : rowKey)}
                        aria-expanded={isExpanded}
                        aria-label={`${isExpanded ? 'Hide' : 'Show'} comments for ${video.title}`}
                        className="inline-flex items-center gap-1 tabular-nums text-text dark:text-[#E0E0E0] hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded"
                      >
                        <MessageSquare size={12} className="text-text-muted" />
                        {fmt(video.comments)}
                        <ChevronDown size={12} className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right text-[13px] text-text dark:text-[#E0E0E0] tabular-nums">
                      {fmt(video.shares)}
                    </td>
                    <td className="px-4 py-3 text-right text-[13px] font-medium text-text dark:text-[#E0E0E0] tabular-nums">
                      {video.ctr.toFixed(1)}%
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="bg-surface/40 dark:bg-white/[0.015]">
                      <td colSpan={columns.length} className="px-4 py-3">
                        <VideoComments videoId={video.video_id} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
