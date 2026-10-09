'use client';

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import type { DailyAnalytics } from '@/types';

/** Format tick dates to short form (Feb 1, Feb 2). */
function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Format Y-axis values (1K, 10K, 1M). */
function formatYAxis(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(0)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
  return value.toString();
}

interface ViewsChartProps {
  data: DailyAnalytics[];
}

/** Custom tooltip matching brand design. */
function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload || !payload.length) return null;

  return (
    <div className="bg-white dark:bg-dark-secondary border border-black/[0.06] dark:border-white/[0.06] rounded-xl px-3 py-2 shadow-lg">
      <p className="text-[11px] text-text-muted mb-1">{label ? formatDate(label) : ''}</p>
      <p className="text-[14px] font-semibold text-text dark:text-white">
        {payload[0].value.toLocaleString()} views
      </p>
    </div>
  );
}

/** Line chart showing daily views over time. */
export default function ViewsChart({ data }: ViewsChartProps) {
  if (!data.length) {
    return (
      <div className="bento-card p-5 flex items-center justify-center h-[200px] md:h-[300px]">
        <p className="text-[13px] text-text-muted">No chart data available</p>
      </div>
    );
  }

  return (
    <div className="bento-card p-4 md:p-5">
      <h3 className="text-[13px] font-semibold text-text dark:text-[#E0E0E0] mb-4">
        Views Over Time
      </h3>
      <div className="h-[200px] md:h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 5, left: -10, bottom: 5 }}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(0,0,0,0.06)"
              vertical={false}
            />
            <XAxis
              dataKey="date"
              tickFormatter={formatDate}
              tick={{ fontSize: 11, fill: '#8B949E' }}
              tickLine={false}
              axisLine={{ stroke: 'rgba(0,0,0,0.06)' }}
              interval="preserveStartEnd"
            />
            <YAxis
              tickFormatter={formatYAxis}
              tick={{ fontSize: 11, fill: '#8B949E' }}
              tickLine={false}
              axisLine={false}
              width={45}
            />
            <Tooltip content={<CustomTooltip />} />
            <Line
              type="monotone"
              dataKey="views"
              stroke="#00C3FF"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, stroke: '#00C3FF', strokeWidth: 2, fill: '#fff' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
