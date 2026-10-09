'use client';

import { useEffect } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/** Error boundary for the AI Writer page. Shows a friendly error with retry. */
export default function WriterError({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error('[AI Writer] Error boundary caught:', error);
  }, [error]);

  return (
    <div className="max-w-lg mx-auto flex flex-col items-center justify-center py-20 md:py-28 text-center px-4">
      <div className="w-14 h-14 rounded-2xl bg-danger/[0.06] flex items-center justify-center mb-4">
        <AlertTriangle size={24} className="text-danger" />
      </div>
      <h2 className="text-[16px] md:text-[18px] font-bold text-text dark:text-white mb-2">
        Something went wrong
      </h2>
      <p className="text-[13px] text-text-muted max-w-[320px] mb-6 leading-relaxed">
        The AI Writer ran into an unexpected error. Your work is safe — try refreshing to pick up where you left off.
      </p>
      <button
        type="button"
        onClick={reset}
        className="inline-flex items-center gap-2 px-5 py-3 min-h-[44px] rounded-xl bg-[#0A0A0A] dark:bg-white text-white dark:text-[#0A0A0A] text-[13px] font-semibold hover:bg-[#1A1A1A] dark:hover:bg-[#E8E8E8] active:scale-[0.97] transition-all duration-200 cursor-pointer focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
        style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.15), 0 0 0 0.5px rgba(0,0,0,0.08)' }}
      >
        <RotateCcw size={15} />
        Try Again
      </button>
    </div>
  );
}
