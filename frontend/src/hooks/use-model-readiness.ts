'use client';

/**
 * Contentine Create — model-readiness gate (WS-4, C-M2 P0).
 *
 * Reads the model-store for a feature's required models (see manifest) and
 * exposes: whether it's ready, what's missing (with human sizes), live download
 * progress, and a `download()` that fetches every missing model through the
 * model-store (real progress, persisted status, propagates store-wide) and
 * resolves true only when the feature is actually ready. A failed download
 * surfaces the ACTUAL error (never swallowed) via `error` for the caller to
 * toast. This is the product-wide "Download <model> → auto-continue" primitive.
 */

import { useCallback, useMemo, useState } from 'react';
import { useModelStore, formatBytes, isInFlight, isModelReady, type AIModel } from '@/stores/model-store';
import { FEATURE_MODELS, type FeatureKey } from '@/lib/model-readiness/manifest';

const isReady = (m: AIModel) => isModelReady(m);

export interface ModelReadiness {
  /** True when every required model is downloaded/ready. */
  ready: boolean;
  required: AIModel[];
  missing: AIModel[];
  /** A required model is actively downloading. */
  downloading: boolean;
  /** Aggregate download progress 0..1 across the missing models. */
  progress: number;
  /** e.g. "Download Llama 3.2 1B (800 MB)". */
  downloadLabel: string;
  /** Combined size of what still needs downloading, e.g. "800 MB". */
  missingSizeLabel: string;
  /** Last download error (actual reason), or null. */
  error: string | null;
  /** Download every missing model; resolves true iff the feature is now ready. */
  download: () => Promise<boolean>;
}

export function useModelReadiness(feature: FeatureKey): ModelReadiness {
  const models = useModelStore((s) => s.models);
  const downloadModel = useModelStore((s) => s.downloadModel);
  const [error, setError] = useState<string | null>(null);

  const ids = FEATURE_MODELS[feature];
  const required = useMemo(() => models.filter((m) => ids.includes(m.id)), [models, ids]);
  const missing = useMemo(() => required.filter((m) => !isReady(m)), [required]);

  const ready = required.length > 0 && missing.length === 0;
  const downloading = required.some((m) => isInFlight(m.status));
  const missingBytes = missing.reduce((s, m) => s + m.sizeBytes, 0);

  // Live aggregate progress: average the download progress of the not-yet-ready
  // required models (store updates downloadProgress → this hook re-renders).
  const progress = useMemo(() => {
    const pending = required.filter((m) => !isReady(m));
    if (pending.length === 0) return 1;
    const sum = pending.reduce((s, m) => s + (m.downloadProgress || 0), 0);
    return sum / pending.length;
  }, [required]);

  const downloadLabel = missing.length === 1
    ? `Download ${missing[0].name} (${formatBytes(missing[0].sizeBytes)})`
    : missing.length > 1
      ? `Download ${missing.length} models (${formatBytes(missingBytes)})`
      : 'Ready';

  const download = useCallback(async (): Promise<boolean> => {
    setError(null);
    const pending = useModelStore.getState().models.filter((m) => ids.includes(m.id) && !isReady(m));
    try {
      for (const m of pending) {
        await downloadModel(m.id);
        const after = useModelStore.getState().models.find((x) => x.id === m.id);
        if (!after || !isReady(after)) {
          throw new Error(after?.error || `Could not download ${m.name}. Please try again.`);
        }
      }
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Model download failed.');
      return false;
    }
  }, [ids, downloadModel]);

  return {
    ready,
    required,
    missing,
    downloading,
    progress,
    downloadLabel,
    missingSizeLabel: formatBytes(missingBytes),
    error,
    download,
  };
}
