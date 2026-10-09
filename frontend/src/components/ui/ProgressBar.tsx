'use client';

import { Film } from 'lucide-react';

interface ProgressBarProps {
  percent: number;
  message?: string;
  subtitle?: string;
  estimatedTime?: string;
  animated?: boolean;
  className?: string;
}

/** Render progress bar with brand gradient — signature visual element. */
export default function ProgressBar({
  percent,
  message = 'Rendering video',
  subtitle,
  estimatedTime,
  animated = true,
  className = '',
}: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, percent));

  return (
    <div className={`bento-card p-5 cursor-default ${className}`}>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-xl bg-primary/[0.07] flex items-center justify-center shrink-0">
          <Film className="w-[17px] h-[17px] text-primary" strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-text dark:text-[#E0E0E0] truncate">{message}</p>
          {subtitle && (
            <p className="text-[11px] text-text-muted mt-0.5 truncate">{subtitle}</p>
          )}
        </div>
      </div>

      {/* Track */}
      <div className="h-2 bg-black/[0.04] dark:bg-white/[0.06] rounded-full overflow-hidden">
        <div
          className={`h-full bg-gradient-to-r from-primary via-accent to-secondary rounded-full transition-all duration-500 ${
            animated && clamped < 100 ? 'animate-[shimmer_2s_linear_infinite]' : ''
          }`}
          style={{
            width: `${clamped}%`,
            backgroundSize: animated ? '200% 100%' : '100% 100%',
          }}
        />
      </div>

      {/* Labels */}
      <div className="flex justify-between mt-2">
        <span className="text-[10px] font-medium text-text-muted">{clamped}% complete</span>
        {estimatedTime && (
          <span className="text-[10px] text-text-muted">{estimatedTime}</span>
        )}
      </div>
    </div>
  );
}
