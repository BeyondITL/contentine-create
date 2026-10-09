'use client';

import { Activity } from 'lucide-react';
import type { ActivityLogEntry } from '@/types';

/** Format timestamp to relative or short date. */
function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

interface ActivityFeedProps {
  activities: ActivityLogEntry[];
}

/** Timeline of recent team activity. */
export default function ActivityFeed({ activities }: ActivityFeedProps) {
  if (!activities.length) {
    return (
      <div className="bento-card p-5 flex flex-col items-center justify-center py-10 text-center">
        <div className="w-10 h-10 rounded-xl bg-primary/[0.06] flex items-center justify-center mb-3">
          <Activity size={18} className="text-primary" />
        </div>
        <p className="text-[13px] font-medium text-text dark:text-[#E0E0E0] mb-1">
          No activity yet
        </p>
        <p className="text-[11px] text-text-muted max-w-[240px]">
          Team activity will show up here as members create and publish content.
        </p>
      </div>
    );
  }

  return (
    <div className="bento-card overflow-hidden">
      <div className="px-4 md:px-5 py-3 border-b border-black/[0.04] dark:border-white/[0.04]">
        <h3 className="text-[13px] font-semibold text-text dark:text-[#E0E0E0]">
          Recent Activity
        </h3>
      </div>

      <ul className="divide-y divide-black/[0.03] dark:divide-white/[0.03] max-h-[400px] overflow-y-auto">
        {activities.map((entry) => (
          <li
            key={entry.id}
            className="flex items-start gap-3 px-4 md:px-5 py-3"
          >
            {/* Timeline dot */}
            <div className="mt-1.5 w-2 h-2 rounded-full bg-primary/40 shrink-0" />

            {/* Content */}
            <div className="flex-1 min-w-0">
              <p className="text-[12px] text-text dark:text-[#E0E0E0] leading-relaxed">
                <span className="font-semibold">{entry.user_name}</span>{' '}
                <span className="text-text-muted">{entry.action}</span>
                {entry.target_type && (
                  <span className="text-text-muted"> on {entry.target_type}</span>
                )}
              </p>
              <p className="text-[10px] text-text-muted mt-0.5">
                {formatTime(entry.created_at)}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
