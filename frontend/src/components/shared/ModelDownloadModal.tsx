'use client';

import { Loader2, Download } from 'lucide-react';

interface ModelDownloadModalProps {
  /** 0..100 real download progress. */
  progress: number;
  isVisible: boolean;
  modelName: string;
  /** Human size, e.g. "800 MB". */
  sizeLabel: string;
}

/**
 * First-time model download modal (WS-4, C-M2 P0) — generic sibling of
 * TTSInitModal, driven by real progress from the model-store via
 * useModelReadiness. One-time, cached for offline use afterwards.
 */
export default function ModelDownloadModal({ progress, isVisible, modelName, sizeLabel }: ModelDownloadModalProps) {
  if (!isVisible) return null;
  const pct = Math.round(progress);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-[#1e1e1e] rounded-2xl p-8 max-w-sm w-full mx-4 shadow-2xl">
        <div className="flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            {pct < 100 ? (
              <Download className="w-6 h-6 text-primary animate-bounce" />
            ) : (
              <Loader2 className="w-6 h-6 text-primary animate-spin" />
            )}
          </div>
          <h3 className="text-lg font-semibold text-text dark:text-white mb-1">
            {pct < 100 ? `Downloading ${modelName}` : 'Initializing...'}
          </h3>
          <p className="text-sm text-text-muted mb-4">
            {pct < 100
              ? `This only happens once. The ${sizeLabel} model is being cached on your device for offline use.`
              : 'Almost ready...'}
          </p>
          <div className="w-full h-2 bg-black/[0.06] dark:bg-white/[0.08] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all duration-300"
              style={{ width: `${Math.max(2, pct)}%` }}
            />
          </div>
          <p className="text-xs text-text-muted mt-2 tabular-nums">{pct}%</p>
        </div>
      </div>
    </div>
  );
}
