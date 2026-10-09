'use client';

import { Eye, Heart, MessageCircle, Globe } from 'lucide-react';
import type { AnalyticsSummary } from '@/types';

/** Format large numbers to human-readable (1.2K, 45.3K, 1.2M). */
function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

/** Format CTR as percentage. */
function formatCTR(ctr: number): string {
  return `${ctr.toFixed(1)}%`;
}

interface StatsRowProps {
  summary: AnalyticsSummary;
}

/** Row of 4 KPI stat cards for the analytics dashboard. */
export default function StatsRow({ summary }: StatsRowProps) {
  const stats = [
    {
      label: 'Total Views',
      value: formatNumber(summary.total_views),
      icon: Eye,
      iconColor: 'text-primary',
      iconBg: 'bg-primary/[0.06]',
    },
    {
      label: 'Total Likes',
      value: formatNumber(summary.total_likes),
      icon: Heart,
      iconColor: 'text-danger',
      iconBg: 'bg-danger/[0.06]',
    },
    {
      label: 'Engagement Rate',
      value: formatCTR(summary.avg_ctr),
      icon: MessageCircle,
      iconColor: 'text-secondary',
      iconBg: 'bg-secondary/[0.06]',
    },
    {
      label: 'Top Platform',
      value: summary.top_platform || 'N/A',
      icon: Globe,
      iconColor: 'text-accent',
      iconBg: 'bg-accent/[0.06]',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {stats.map((stat) => (
        <div key={stat.label} className="bento-card p-4 md:p-5">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl ${stat.iconBg} flex items-center justify-center shrink-0`}>
              <stat.icon size={18} className={stat.iconColor} />
            </div>
            <div className="min-w-0">
              <p className="text-lg md:text-xl font-bold text-text dark:text-white truncate">
                {stat.value}
              </p>
              <p className="text-[11px] md:text-[12px] text-text-muted truncate">
                {stat.label}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
