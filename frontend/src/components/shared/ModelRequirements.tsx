'use client';

/**
 * Contentine Create — model-readiness banner (WS-1, R1 / SA-05 rebuild).
 *
 * A point-of-use gate for any feature page that needs on-device AI models.
 * Reads `useModelReadiness(feature)` (which reads the per-feature manifest and
 * the model-store) and, when a required model is NOT ready, renders an honest
 * banner listing exactly which models are needed — real name + honest size from
 * the catalog — with a single "Download" CTA. The CTA runs the SAME real
 * download the models page uses (streamed browser → HuggingFace/MLC CDN into
 * on-device storage, real progress, persisted, store-wide), shows live progress
 * both inline and in the shared `ModelDownloadModal`, surfaces the ACTUAL
 * failure reason on error, and auto-continues via `onReady` the moment every
 * required model reaches READY.
 *
 * Law L1: no fake progress — every state here is driven by the real store.
 * When the feature is already ready this component renders `children` (or
 * nothing), so it composes as a wrapper OR a standalone banner.
 */

import { useEffect, useRef, type ReactNode } from 'react';
import { Download, Loader2, HardDriveDownload, AlertCircle, RotateCcw } from 'lucide-react';
import { useModelReadiness } from '@/hooks/use-model-readiness';
import { formatBytes } from '@/stores/model-store';
import type { FeatureKey } from '@/lib/model-readiness/manifest';
import ModelDownloadModal from '@/components/shared/ModelDownloadModal';

interface ModelRequirementsProps {
  /** Which feature's required models to gate on (see manifest). */
  feature: FeatureKey;
  /**
   * Fired once when the required models transition into READY — used by the
   * page to auto-continue whatever the user was trying to do.
   */
  onReady?: () => void;
  /** Headline. Defaults to a generic, honest line. */
  title?: string;
  /** Sub-line describing what needs the models on this page. */
  description?: string;
  /** Rendered in place of the banner once every required model is ready. */
  children?: ReactNode;
  className?: string;
}

/**
 * Banner that turns "this page needs model X" into a real one-click download.
 * Renders nothing (or `children`) when the feature is ready.
 */
export default function ModelRequirements({
  feature,
  onReady,
  title = 'Download required models',
  description,
  children,
  className = '',
}: ModelRequirementsProps) {
  const readiness = useModelReadiness(feature);
  const { ready, required, missing, downloading, progress, error, missingSizeLabel } = readiness;

  // Fire onReady only on the not-ready → ready transition (a download the user
  // started here completing), never on a page that mounts already-ready.
  const wasReady = useRef(ready);
  useEffect(() => {
    if (ready && !wasReady.current) onReady?.();
    wasReady.current = ready;
  }, [ready, onReady]);

  // Nothing to gate: either the feature is ready, or this build declares no
  // on-device requirement for it (e.g. thumbnails while image-gen is flagged
  // off, so SD-Turbo isn't even in the catalog). Never render an empty banner.
  if (ready || required.length === 0) return <>{children}</>;

  const pct = Math.round(progress * 100);
  const primaryModel = missing[0];

  return (
    <div className={`bento-card p-5 ${className}`}>
      {/* Full-screen real-progress modal (shared with the other model flows) */}
      {primaryModel && (
        <ModelDownloadModal
          isVisible={downloading}
          progress={progress * 100}
          modelName={missing.length === 1 ? primaryModel.name : `${missing.length} models`}
          sizeLabel={missingSizeLabel}
        />
      )}

      <div className="flex items-start gap-4">
        <div className="shrink-0 w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center">
          <HardDriveDownload size={20} className="text-primary" />
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="text-[15px] font-semibold text-text dark:text-white">{title}</h3>
          <p className="text-[13px] text-text-muted mt-0.5">
            {description ??
              `This runs on your device. The ${missingSizeLabel} below downloads once, then works offline.`}
          </p>

          {/* What's needed — real name + honest size per model */}
          <ul className="mt-3 space-y-1.5">
            {missing.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between text-[13px] rounded-lg bg-surface dark:bg-[#151515] border border-border-light dark:border-[#333] px-3 py-2"
              >
                <span className="text-text dark:text-white font-medium truncate">{m.name}</span>
                <span className="text-text-muted tabular-nums shrink-0 ml-3">{formatBytes(m.sizeBytes)}</span>
              </li>
            ))}
          </ul>

          {/* Live inline progress while downloading */}
          {downloading && (
            <div className="mt-3">
              <div className="w-full h-2 bg-black/[0.06] dark:bg-white/[0.08] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all duration-300"
                  style={{ width: `${Math.max(2, pct)}%` }}
                />
              </div>
              <p className="text-[11px] text-text-muted mt-1 tabular-nums">Downloading… {pct}%</p>
            </div>
          )}

          {/* Real failure reason (never swallowed) */}
          {error && !downloading && (
            <p className="mt-3 flex items-start gap-1.5 text-[12px] text-danger">
              <AlertCircle size={14} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </p>
          )}

          <button
            type="button"
            onClick={() => readiness.download()}
            disabled={downloading}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] md:min-h-0 bg-primary hover:bg-primary-hover text-white rounded-xl text-[14px] md:text-[13px] font-semibold transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
          >
            {downloading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : error ? (
              <RotateCcw size={16} />
            ) : (
              <Download size={16} />
            )}
            {downloading ? 'Downloading model…' : error ? 'Retry download' : readiness.downloadLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
