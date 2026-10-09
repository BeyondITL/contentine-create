'use client';

import { Loader2, Download } from 'lucide-react';

interface TTSInitModalProps {
  progress: number;
  isVisible: boolean;
}

/** Modal shown during first-time Kokoro TTS model download with real progress. */
export default function TTSInitModal({ progress, isVisible }: TTSInitModalProps) {
  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-[#1e1e1e] rounded-2xl p-8 max-w-sm w-full mx-4 shadow-2xl">
        <div className="flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            {progress < 100 ? (
              <Download className="w-6 h-6 text-primary animate-bounce" />
            ) : (
              <Loader2 className="w-6 h-6 text-primary animate-spin" />
            )}
          </div>
          <h3 className="text-lg font-semibold text-text dark:text-white mb-1">
            {progress < 100 ? 'Downloading Voice Model' : 'Initializing...'}
          </h3>
          <p className="text-sm text-text-muted mb-4">
            {progress < 100
              ? 'This only happens once. The 87MB Kokoro TTS model is being cached for offline use.'
              : 'Almost ready...'}
          </p>
          <div className="w-full h-2 bg-black/[0.06] dark:bg-white/[0.08] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all duration-300"
              style={{ width: `${Math.max(2, progress)}%` }}
            />
          </div>
          <p className="text-xs text-text-muted mt-2 tabular-nums">{Math.round(progress)}%</p>
        </div>
      </div>
    </div>
  );
}
