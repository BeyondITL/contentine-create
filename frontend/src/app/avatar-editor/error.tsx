'use client';

import { AlertCircle, RotateCcw, Home } from 'lucide-react';

/** Error boundary for the Avatar Editor page. Shows a friendly error with retry. */
export default function AvatarEditorError({
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
        Avatar Editor Error
      </h2>
      <p className="text-sm text-text-muted mb-2 max-w-md">
        The Avatar Video Editor encountered an unexpected error. This may be caused by a missing model file or browser compatibility issue.
      </p>
      {error?.message && (
        <p className="text-xs text-muted mb-6 max-w-lg bg-surface dark:bg-[#1e1e1e] rounded-lg p-3 font-mono">
          {error.message}
        </p>
      )}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover transition-colors focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none cursor-pointer min-h-[44px]"
        >
          <RotateCcw size={16} />
          Try Again
        </button>
        <a
          href="/"
          className="flex items-center gap-2 px-4 py-2.5 bg-surface dark:bg-[#2a2a2a] text-text dark:text-white rounded-lg text-sm font-medium hover:bg-border-light dark:hover:bg-[#333] transition-colors min-h-[44px]"
        >
          <Home size={16} />
          Dashboard
        </a>
      </div>
    </div>
  );
}
