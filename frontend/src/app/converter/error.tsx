'use client';

import { AlertCircle, RotateCcw, Home } from 'lucide-react';

/** Error boundary for the Aspect Ratio Converter page. */
export default function ConverterError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="max-w-4xl mx-auto flex flex-col items-center justify-center py-20 text-center">
      <div className="w-14 h-14 rounded-full bg-danger/10 flex items-center justify-center mb-4">
        <AlertCircle size={28} className="text-danger" />
      </div>
      <h2 className="text-lg font-semibold text-text dark:text-white mb-2">
        Something went wrong
      </h2>
      <p className="text-sm text-text-muted mb-6 max-w-md">
        The Aspect Ratio Converter encountered an unexpected error. This is usually temporary — try refreshing or going back to the dashboard.
      </p>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="
            flex items-center gap-2 px-4 py-2.5
            min-h-[44px] md:min-h-0
            bg-primary text-white rounded-lg text-sm font-medium
            hover:bg-primary-hover transition-colors
            focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none
            cursor-pointer
          "
        >
          <RotateCcw size={16} />
          Try Again
        </button>
        <a
          href="/"
          className="
            flex items-center gap-2 px-4 py-2.5
            min-h-[44px] md:min-h-0
            bg-surface dark:bg-[#2a2a2a] text-text dark:text-white
            rounded-lg text-sm font-medium
            hover:bg-border-light dark:hover:bg-[#333] transition-colors
            focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none
          "
        >
          <Home size={16} />
          Dashboard
        </a>
      </div>
    </div>
  );
}
