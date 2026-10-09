'use client';

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from 'recharts';
import type { PlatformAnalytics } from '@/types';

/** Platform brand colors. */
const PLATFORM_COLORS: Record<string, string> = {
  youtube: '#FF0000',
  tiktok: '#000000',
  instagram: '#E1306C',
  facebook: '#1877F2',
  linkedin: '#0A66C2',
  threads: '#000000',
  twitter: '#1DA1F2',
};

/** Format Y-axis values. */
function formatValue(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(0)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
  return value.toString();
}

/** Capitalize first letter. */
function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

interface PlatformBreakdownProps {
  data: PlatformAnalytics[];
}

/** Custom tooltip for platform breakdown. */
function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: PlatformAnalytics; value: number }> }) {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0].payload;

  return (
    <div className="bg-white dark:bg-dark-secondary border border-black/[0.06] dark:border-white/[0.06] rounded-xl px-3 py-2 shadow-lg">
      <p className="text-[12px] font-semibold text-text dark:text-white mb-1">
        {capitalize(d.platform)}
      </p>
      <div className="space-y-0.5 text-[11px] text-text-muted">
        <p>Views: {d.views.toLocaleString()}</p>
        <p>Likes: {d.likes.toLocaleString()}</p>
        <p>Comments: {d.comments.toLocaleString()}</p>
        <p>Shares: {d.shares.toLocaleString()}</p>
      </div>
    </div>
  );
}

/** Horizontal bar chart showing totals per platform. */
export default function PlatformBreakdown({ data }: PlatformBreakdownProps) {
  if (!data.length) {
    return (
      <div className="bento-card p-5 flex items-center justify-center h-[200px]">
        <p className="text-[13px] text-text-muted">No platform data available</p>
      </div>
    );
  }

  const chartData = data.map((d) => ({
    ...d,
    name: capitalize(d.platform),
  }));

  return (
    <div className="bento-card p-4 md:p-5">
      <h3 className="text-[13px] font-semibold text-text dark:text-[#E0E0E0] mb-4">
        Platform Breakdown
      </h3>
      <div className="h-[200px] md:h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 5, right: 15, left: 5, bottom: 5 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(0,0,0,0.06)"
              horizontal={false}
            />
            <XAxis
              type="number"
              tickFormatter={formatValue}
              tick={{ fontSize: 11, fill: '#8B949E' }}
              tickLine={false}
              axisLine={{ stroke: 'rgba(0,0,0,0.06)' }}
            />
            <YAxis
              type="category"
              dataKey="name"
              tick={{ fontSize: 11, fill: '#8B949E' }}
              tickLine={false}
              axisLine={false}
              width={80}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="views" radius={[0, 6, 6, 0]} barSize={20}>
              {chartData.map((entry) => (
                <Cell
                  key={entry.platform}
                  fill={PLATFORM_COLORS[entry.platform] || '#00C3FF'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
