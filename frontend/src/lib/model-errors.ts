/**
 * Contentine Create — model error taxonomy (C-M2 live-regression fix).
 *
 * Every model download/load failure is classified into one of four honest
 * kinds, each with its TRUE message and remedy. The live July-5 regression
 * was a storage-quota failure reported as a GPU-memory problem, after which
 * the fallback ladder escalated to a LARGER model variant — this module is
 * the single place that decides what actually went wrong.
 *
 *  - storage-quota: the origin's storage quota is exhausted. Remedy: free
 *    space (per-model delete / clean orphans / clear app data), request
 *    persistent storage. NEVER retry with a larger variant.
 *  - gpu: WebGPU adapter/device problems (missing adapter, device lost,
 *    genuine GPU OOM, missing shader-f16). Remedy: close GPU-heavy apps/tabs
 *    or use a smaller variant.
 *  - network: fetch/CDN failures. Remedy: check connection, retry.
 *  - verify-fail: bytes on device don't match the catalog manifest.
 *    Remedy: delta repair (re-download only the failing artifacts).
 */

export type ModelErrorKind = 'storage-quota' | 'gpu' | 'network' | 'verify-fail' | 'unknown';

export interface StorageSnapshot {
  usageBytes: number;
  quotaBytes: number;
  freeBytes: number;
  persisted: boolean;
}

/** Read the origin's real storage usage vs quota (null if API unavailable). */
export async function storageSnapshot(): Promise<StorageSnapshot | null> {
  try {
    if (!navigator.storage?.estimate) return null;
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    const persisted = (await navigator.storage.persisted?.()) ?? false;
    return { usageBytes: usage, quotaBytes: quota, freeBytes: Math.max(0, quota - usage), persisted };
  } catch {
    return null;
  }
}

/**
 * Ask the browser to protect this origin's storage from automatic eviction.
 * Safe to call repeatedly; returns whether storage is (now) persistent.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (await navigator.storage?.persisted?.()) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

const QUOTA_RE = /quota\s*exceeded|quotaexceedederror|exceeded the quota|insufficient storage|no space|not enough (?:disk |storage )?space/i;
const GPU_RE = /webgpu|gpu adapter|no adapter|requestadapter|device lost|shader-?f16|out of memory|oom|buffer size|maxstoragebuffer|maxbuffersize/i;
const NETWORK_RE = /failed to fetch|networkerror|network error|load failed|fetch(?:ing)? (?:failed|error)|err_(?:internet|network|connection|name_not)|http (?:4|5)\d\d|\b(?:404|403|429|500|502|503)\b|timed? ?out/i;

/** Classify a caught error into its true kind. Quota wins over everything. */
export function classifyModelError(err: unknown): ModelErrorKind {
  const name = (err as { name?: string })?.name ?? '';
  const message = err instanceof Error ? err.message : String(err ?? '');
  const text = `${name}: ${message}`;
  // DOMException QuotaExceededError (code 22) — thrown by Cache Storage,
  // IndexedDB, and OPFS writes when the origin's quota is exhausted.
  if (name === 'QuotaExceededError' || (err as { code?: number })?.code === 22 || QUOTA_RE.test(text)) {
    return 'storage-quota';
  }
  if (GPU_RE.test(text)) return 'gpu';
  if (NETWORK_RE.test(text)) return 'network';
  return 'unknown';
}

export function formatGB(bytes: number): string {
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/**
 * Build the honest user-facing message for a classified failure.
 * For quota errors this includes the REAL usage-vs-quota numbers.
 */
export function describeModelError(
  kind: ModelErrorKind,
  modelName: string,
  rawMessage: string,
  storage?: StorageSnapshot | null,
): string {
  switch (kind) {
    case 'storage-quota': {
      const numbers = storage
        ? ` This site is using ${formatGB(storage.usageBytes)} of its ${formatGB(storage.quotaBytes)} browser storage allowance (${formatGB(storage.freeBytes)} free).`
        : '';
      return (
        `Not enough browser storage to download ${modelName}.${numbers} ` +
        'Free up space in the Storage panel (delete unused models or clean orphaned data), then retry.'
      );
    }
    case 'gpu':
      return (
        `${modelName} could not load on your GPU: ${rawMessage} ` +
        'Close other GPU-heavy tabs and applications, or pick a smaller model.'
      );
    case 'network':
      return (
        `Network problem while downloading ${modelName}: ${rawMessage} ` +
        'Check your internet connection and retry — the download resumes where it left off.'
      );
    case 'verify-fail':
      return (
        `${modelName} downloaded but its files did not match the expected checksums. ` +
        'Use Repair to re-download only the damaged parts.'
      );
    default:
      return `${modelName} failed: ${rawMessage}`;
  }
}
