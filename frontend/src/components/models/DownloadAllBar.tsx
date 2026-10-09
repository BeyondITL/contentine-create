'use client';

import { Download, Check, Sparkles } from 'lucide-react';
import { useModelStore, formatBytes, isInFlight } from '@/stores/model-store';

/** Sticky bar for one-click "Download Recommended" — premium CTA with satisfying progress. */
export default function DownloadAllBar() {
  const { models, downloadRecommended } = useModelStore();

  const recommended = models.filter((m) => m.isRecommended);
  const notDownloaded = recommended.filter((m) => m.status === 'not_downloaded' || m.status === 'error');
  const downloading = recommended.filter((m) => isInFlight(m.status));
  const downloaded = recommended.filter((m) => m.status === 'ready');

  /* ── All recommended models downloaded — success state ── */
  if (recommended.length > 0 && notDownloaded.length === 0 && downloading.length === 0) {
    return (
      <div className="bento-card p-4 md:p-5 mb-6 border border-secondary/10 dark:border-secondary/15 animate-fade-in">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-[13px] bg-secondary/[0.08] dark:bg-secondary/[0.15] flex items-center justify-center shrink-0">
            <Check className="w-5 h-5 text-secondary" strokeWidth={2.5} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13.5px] font-bold text-secondary leading-tight mb-0.5">All recommended models ready</p>
            <p className="text-[11.5px] text-text-muted dark:text-white/50">
              {downloaded.length} model{downloaded.length !== 1 ? 's' : ''} downloaded — your device is fully set up for AI.
            </p>
          </div>
        </div>
      </div>
    );
  }

  /* ── Nothing to recommend ── */
  if (recommended.length === 0) return null;

  /* ── Compute sizes & progress ── */
  const totalSize = notDownloaded.reduce((sum, m) => sum + m.sizeBytes, 0);
  const isDownloading = downloading.length > 0;

  const overallProgress = recommended.length > 0
    ? recommended.reduce((sum, m) => {
        if (m.status === 'ready') return sum + 1;
        if (isInFlight(m.status)) return sum + m.downloadProgress;
        return sum;
      }, 0) / recommended.length
    : 0;

  return (
    <div className="bento-card p-4 md:p-5 mb-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        {/* Left — info */}
        <div className="flex items-start gap-3.5 flex-1 min-w-0">
          <div className="w-10 h-10 rounded-[13px] bg-primary/[0.06] dark:bg-primary/[0.12] flex items-center justify-center shrink-0">
            {isDownloading ? (
              <div className="w-5 h-5 rounded-full border-2 border-primary/25 border-t-primary animate-spin" />
            ) : (
              <Sparkles className="w-5 h-5 text-primary" strokeWidth={1.75} />
            )}
          </div>
          <div className="min-w-0 pt-0.5">
            <p className="text-[13.5px] font-bold text-text dark:text-white leading-tight mb-0.5">
              {isDownloading ? 'Downloading recommended models\u2026' : 'Download recommended models'}
            </p>
            <p className="text-[11.5px] text-text-muted dark:text-white/50">
              {isDownloading
                ? `${downloaded.length + downloading.length} of ${recommended.length} models \u2022 ${Math.round(overallProgress * 100)}% complete`
                : `${notDownloaded.length} model${notDownloaded.length !== 1 ? 's' : ''} \u2022 ${formatBytes(totalSize)} total`}
            </p>
          </div>
        </div>

        {/* Right — action / progress */}
        {isDownloading ? (
          <div className="w-full sm:w-52 shrink-0">
            <div className="w-full h-2.5 rounded-full bg-black/[0.04] dark:bg-white/[0.06] overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all duration-500 ease-out relative"
                style={{ width: `${Math.max(3, Math.round(overallProgress * 100))}%` }}
              >
                {/* Glow effect on active progress */}
                <div className="absolute inset-0 rounded-full bg-white/20 animate-progress-glow" />
              </div>
            </div>
            <p className="text-[10px] text-text-muted/50 dark:text-white/30 text-right mt-1.5 tabular-nums font-medium">
              {Math.round(overallProgress * 100)}%
            </p>
          </div>
        ) : (
          <button
            onClick={downloadRecommended}
            className="
              btn-primary flex items-center justify-center gap-2 !text-[12.5px] !px-6 !py-2.5 shrink-0
              shadow-sm shadow-black/10 active:scale-[0.97] transition-all duration-200
            "
          >
            <Download className="w-4 h-4" strokeWidth={2} />
            Download All ({formatBytes(totalSize)})
          </button>
        )}
      </div>
    </div>
  );
}
