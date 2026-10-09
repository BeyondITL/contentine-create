import { create } from 'zustand';
import type { DeviceProfile } from '@/engine/device-scanner';
import { MODEL_CATALOG, type CatalogEntry } from '@/lib/model-catalog';
import {
  classifyModelError,
  describeModelError,
  requestPersistentStorage,
  storageSnapshot,
  type ModelErrorKind,
} from '@/lib/model-errors';
import {
  downloadModelArtifacts,
  getStorageMode,
  isManagedModel,
  verifyModelArtifacts,
} from '@/lib/model-storage';
import { MODEL_ARTIFACTS } from '@/lib/model-artifacts';

/**
 * Contentine Create — model download store (C-M2 P0 round two).
 *
 * Single-catalog engine dispatch: the catalog lives in `@/lib/model-catalog`;
 * every entry declares its `engine`, and `downloadModel` dispatches on that
 * field alone. Law L2: every engine streams browser → HuggingFace/MLC CDN
 * directly into the SAME on-device cache the feature reads (WebLLM Cache
 * Storage / transformers.js cache / SD-Turbo Cache Storage) — the server is
 * NEVER in the model path.
 *
 * Per-model download state machine:
 *   not_downloaded → queued → downloading → finalizing → verifying → ready
 *                                                              ↘ error(reason)
 * - `queued`: waiting for an engine slot (WebLLM serializes GPU loads).
 * - `finalizing`: bytes fetched; engine is preparing the model (GPU shader
 *   compile / cache load). One-way from `downloading` — progress phases in
 *   WebLLM re-run 0→1, which previously read as "Downloading 100%" forever.
 * - `verifying`: honest cache check through the SAME engine cache API the
 *   runtime uses; also re-run on every page load (`checkAllStatuses`) so a
 *   restart never trusts stale localStorage over reality.
 * - A stall watchdog errors out any in-flight download whose engine goes
 *   silent, with the real phase + timing in the message (never a stuck bar).
 */

export type ModelStatus =
  | 'not_downloaded'
  | 'queued'
  | 'downloading'
  | 'finalizing'
  | 'verifying'
  | 'ready'
  | 'error';

export interface AIModel extends CatalogEntry {
  status: ModelStatus;
  downloadProgress: number;
  /** Live engine status line (e.g. WebLLM shader-compile stage), for in-flight UI. */
  statusText?: string;
  error?: string;
  /** Honest failure classification (drives the remedy the UI offers). */
  errorKind?: ModelErrorKind;
  isRecommended: boolean;
}

/** A download is actively owned by the state machine. */
export function isInFlight(status: ModelStatus): boolean {
  return status === 'queued' || status === 'downloading' || status === 'finalizing' || status === 'verifying';
}

/** The one true "this model can be used now" predicate. */
export function isModelReady(m: Pick<AIModel, 'status'>): boolean {
  return m.status === 'ready';
}

const TIER_ORDER: Record<string, number> = { high: 3, medium: 2, low: 1, unsupported: 0 };
const PERSIST_KEY = 'contentine-model-status';

/** Stall watchdog limits per phase (ms without any engine event). */
const STALL_LIMIT_MS: Partial<Record<ModelStatus, number>> = {
  downloading: 150_000,
  finalizing: 300_000,
  verifying: 60_000,
};
const WATCHDOG_TICK_MS = 10_000;

/** Persist ready statuses to localStorage (optimistic boot; verified on load). */
function persistStatuses(models: AIModel[]): void {
  try {
    const map: Record<string, 'ready'> = {};
    for (const m of models) {
      if (m.status === 'ready') map[m.id] = 'ready';
    }
    localStorage.setItem(PERSIST_KEY, JSON.stringify(map));
  } catch { /* ignore — localStorage full or unavailable */ }
}

/** Read persisted statuses. Legacy 'downloaded' values (pre-state-machine) count as 'ready'. */
function readPersistedStatuses(): Record<string, 'ready'> {
  try {
    const raw = localStorage.getItem(PERSIST_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    const out: Record<string, 'ready'> = {};
    for (const [id, s] of Object.entries(parsed)) {
      if (s === 'ready' || s === 'downloaded') out[id] = 'ready';
    }
    return out;
  } catch {
    return {};
  }
}

/** Format bytes to human-readable size. */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/** True iff the transformers.js browser cache holds an .onnx artifact for this repo id. */
async function transformersCacheHas(idSubstring: string): Promise<boolean> {
  try {
    const cache = await caches.open('transformers-cache');
    const keys = await cache.keys();
    return keys.some((req) => req.url.includes(idSubstring) && req.url.includes('.onnx'));
  } catch {
    return false;
  }
}

/** Delete all transformers.js-cached artifacts for a repo id. */
async function transformersCacheDelete(idSubstring: string): Promise<void> {
  try {
    const cache = await caches.open('transformers-cache');
    for (const req of await cache.keys()) {
      if (req.url.includes(idSubstring)) await cache.delete(req);
    }
  } catch { /* cache unavailable */ }
}

/**
 * Honest cache verification, dispatched by engine — the SAME cache the
 * runtime path reads, so 'ready' here means the feature will actually work.
 */
async function verifyModelCached(entry: CatalogEntry): Promise<boolean> {
  try {
    // Manifest-managed models (kokoro-js / transformersjs): every artifact
    // present at its exact catalog size in the ACTIVE storage backend
    // (browser cache or the user's model folder). Legacy caches from
    // previous app versions use the same cache names + URL keys, so they
    // re-verify in place — upgrade path, never brick.
    if (isManagedModel(entry.id)) {
      return (await verifyModelArtifacts(entry.id, 'presence')).ok;
    }
    switch (entry.engine) {
      case 'webllm': {
        const { webllmEngine } = await import('@/engine/webllm-engine');
        return await webllmEngine.isModelCached(entry.engineModelId);
      }
      case 'kokoro-js':
        return await transformersCacheHas('Kokoro-82M');
      case 'transformersjs':
        return await transformersCacheHas(entry.engineModelId);
      case 'onnx-custom': {
        const { sdTurboEngine } = await import('@/engine/sd-turbo-engine');
        return await sdTurboEngine.isCached();
      }
      default:
        return false;
    }
  } catch {
    return false;
  }
}

interface ModelState {
  models: AIModel[];
  isChecking: boolean;

  /** Initialize recommendations from the device profile. */
  initWithProfile: (profile: DeviceProfile) => void;
  /** Restart-safe cache verification — run on page load. */
  checkAllStatuses: () => Promise<void>;
  /** Download a specific model (state machine owner). */
  downloadModel: (id: string) => Promise<void>;
  /** Checksum-verify a managed model and re-download only damaged shards. */
  repairModel: (id: string) => Promise<void>;
  /** Cancel an in-progress download. */
  cancelDownload: (id: string) => void;
  /** Delete a model from its engine cache. */
  deleteModel: (id: string) => Promise<void>;
  getByCategory: (cat: AIModel['category'] | 'all') => AIModel[];
  getRecommended: () => AIModel[];
  getTotalDownloadSize: (ids: string[]) => number;
  /** Download all recommended models (2 concurrent; engines serialize internally). */
  downloadRecommended: () => Promise<void>;
}

// In-flight bookkeeping (module scope — not persisted, not reactive).
const abortControllers = new Map<string, AbortController>();
const lastActivity = new Map<string, number>();
let watchdogTimer: ReturnType<typeof setInterval> | null = null;

export const useModelStore = create<ModelState>((set, get) => {
  // Rehydrate persisted statuses at store creation so any page shows sane
  // state immediately; checkAllStatuses() then verifies against real caches.
  const bootstrap = readPersistedStatuses();

  const patch = (id: string, partial: Partial<AIModel>) =>
    set({ models: get().models.map((m) => (m.id === id ? { ...m, ...partial } : m)) });

  const markActivity = (id: string) => lastActivity.set(id, Date.now());

  const stopWatchdogIfIdle = () => {
    if (watchdogTimer && !get().models.some((m) => isInFlight(m.status))) {
      clearInterval(watchdogTimer);
      watchdogTimer = null;
    }
  };

  const startWatchdog = () => {
    if (watchdogTimer) return;
    watchdogTimer = setInterval(() => {
      const now = Date.now();
      for (const m of get().models) {
        const limit = STALL_LIMIT_MS[m.status];
        if (!limit) continue;
        const last = lastActivity.get(m.id) ?? now;
        if (now - last > limit) {
          abortControllers.get(m.id)?.abort();
          abortControllers.delete(m.id);
          lastActivity.delete(m.id);
          const seconds = Math.round((now - last) / 1000);
          // Honest taxonomy: a stall in the DOWNLOADING phase is a NETWORK
          // problem (no bytes arriving) — telling the user to "free GPU memory"
          // is a mislabel. Only the GPU-bound finalizing/verifying phases
          // (shader compile / cache load) warrant the GPU remedy.
          const kind: ModelErrorKind = m.status === 'downloading' ? 'network' : 'gpu';
          patch(m.id, {
            status: 'error',
            statusText: undefined,
            errorKind: kind,
            error: describeModelError(
              kind,
              m.name,
              `No progress from the ${m.engine} engine for ${seconds}s while ${m.status}.`,
            ),
          });
        }
      }
      stopWatchdogIfIdle();
    }, WATCHDOG_TICK_MS);
  };

  return {
    models: MODEL_CATALOG.map((m) => ({
      ...m,
      status: (bootstrap[m.id] ?? 'not_downloaded') as ModelStatus,
      downloadProgress: bootstrap[m.id] ? 1 : 0,
      isRecommended: false,
    })),
    isChecking: false,

    initWithProfile: (profile) => {
      const tierValue = TIER_ORDER[profile.tier] || 0;
      set({
        models: get().models.map((m) => ({
          ...m,
          isRecommended: TIER_ORDER[m.minTier] <= tierValue && tierValue > 0,
        })),
      });
    },

    checkAllStatuses: async () => {
      set({ isChecking: true });
      // Models that claim ready get a visible 'verifying' beat; models never
      // downloaded are checked silently (they may have been fetched by an
      // engine outside the store, e.g. TTSInitModal).
      for (const m of get().models) {
        if (m.status === 'ready') patch(m.id, { status: 'verifying' });
      }
      for (const m of get().models) {
        if (isInFlight(m.status) && m.status !== 'verifying') continue; // active download owns its state
        const cached = await verifyModelCached(m);
        const current = get().models.find((x) => x.id === m.id);
        if (!current || (isInFlight(current.status) && current.status !== 'verifying')) continue;
        if (cached) {
          patch(m.id, { status: 'ready', downloadProgress: 1, error: undefined, statusText: undefined });
        } else if (current.status === 'verifying' || current.status === 'ready') {
          // Persisted claim contradicted by the real cache — demote honestly.
          patch(m.id, { status: 'not_downloaded', downloadProgress: 0, statusText: undefined });
        }
      }
      set({ isChecking: false });
      persistStatuses(get().models);
    },

    downloadModel: async (id) => {
      const model = get().models.find((m) => m.id === id);
      if (!model) return;
      if (isInFlight(model.status) || model.status === 'ready') return;

      const controller = new AbortController();
      abortControllers.set(id, controller);
      patch(id, { status: 'queued', downloadProgress: 0, error: undefined, statusText: undefined });
      markActivity(id);
      startWatchdog();

      // Engine progress → state machine. Phases only move forward:
      // queued → downloading on the first event; downloading → finalizing when
      // the fetch phase completes (WebLLM then re-reports 0→1 for cache-load /
      // shader-compile — that must NOT read as "Downloading" again).
      const onEngineProgress = (p: { progress: number; text?: string }) => {
        if (controller.signal.aborted) return;
        markActivity(id);
        const current = get().models.find((m) => m.id === id);
        if (!current || !isInFlight(current.status)) return;
        if (current.status === 'finalizing' || p.progress >= 1) {
          patch(id, { status: 'finalizing', downloadProgress: 1, statusText: p.text });
        } else {
          patch(id, {
            status: 'downloading',
            downloadProgress: Math.max(current.downloadProgress, Math.min(p.progress, 0.999)),
            statusText: p.text,
          });
        }
      };

      try {
        // Quota preflight (browser storage only — a real folder is the OS's
        // disk, not origin quota): fail fast with the TRUE numbers instead of
        // letting a cache write die (or worse, get silently swallowed inside
        // an engine — the July-5 live regression). Ask for persistent storage
        // first: it protects existing models AND can raise the quota.
        if (getStorageMode() === 'browser') {
          await requestPersistentStorage();
          const snap = await storageSnapshot();
          // Require space only for the bytes we will ACTUALLY write. Already-
          // cached artifacts are counted in `usage`, so they're already excluded
          // from freeBytes — demanding the FULL model size on top double-counts
          // them and can falsely block a partial/re-download that needs little or
          // no new space (JL-013: "blocked N MB while reporting GBs free"). For a
          // managed model the true need is the verified delta; WebLLM/SD-Turbo
          // own their caches, so the catalog size is the honest upper bound.
          let requiredBytes = model.sizeBytes;
          if (isManagedModel(model.id)) {
            const delta = await verifyModelArtifacts(model.id, 'presence');
            requiredBytes = delta.needed.reduce((s, a) => s + a.sizeBytes, 0);
          }
          if (snap && requiredBytes > 0 && snap.freeBytes < requiredBytes * 1.1) {
            const err = new Error(
              `storage quota preflight: need ~${formatBytes(Math.ceil(requiredBytes * 1.1))} free, have ${formatBytes(snap.freeBytes)}`,
            );
            err.name = 'QuotaExceededError';
            throw err;
          }
        }

        // ── Single-catalog engine dispatch (operator ruling) ──
        if (isManagedModel(model.id)) {
          // kokoro-js / transformersjs: OUR downloader — streamed from the
          // pinned-revision CDN into the active storage backend, SHA-256
          // verified on the wire, per-shard delta (present artifacts are
          // never re-fetched). Quota errors here are LOUD, never swallowed.
          patch(id, { status: 'downloading' });
          await downloadModelArtifacts(model.id, {
            signal: controller.signal,
            onProgress: (p) =>
              onEngineProgress({
                progress: p.totalBytes > 0 ? p.loadedBytes / p.totalBytes : 0,
                text: p.currentFile,
              }),
          });
        } else {
          switch (model.engine) {
            case 'webllm': {
              const { webllmEngine } = await import('@/engine/webllm-engine');
              // Stays 'queued' until WebLLM's serialized loader reaches it.
              // Pass the abort signal so a watchdog stall / cancel actually
              // settles this load (frees the slot + advances the serialized queue)
              // instead of hanging the whole LLM tier forever.
              await webllmEngine.ensureModel(model.engineModelId, onEngineProgress, controller.signal);
              break;
            }
            case 'onnx-custom': {
              const { sdTurboEngine } = await import('@/engine/sd-turbo-engine');
              patch(id, { status: 'downloading' });
              await sdTurboEngine.download((f) => onEngineProgress({ progress: f }), controller.signal);
              break;
            }
            default:
              throw new Error(`No browser-native engine is wired for ${model.name}.`);
          }
        }

        if (controller.signal.aborted) return;
        patch(id, { status: 'verifying', downloadProgress: 1, statusText: undefined });
        markActivity(id);
        const ok = await verifyModelCached(model);
        if (controller.signal.aborted) return;
        if (!ok) {
          const err = new Error(
            `${model.name} finished downloading but failed the on-device cache check.`,
          );
          err.name = 'VerifyFailError';
          throw err;
        }
        patch(id, { status: 'ready', downloadProgress: 1, error: undefined, errorKind: undefined, statusText: undefined });
        persistStatuses(get().models);
      } catch (err) {
        if (controller.signal.aborted) return; // cancelled or watchdog-errored — state already set
        const raw = err instanceof Error ? err.message : 'Download failed';
        let kind = classifyModelError(err);
        if ((err as Error)?.name === 'VerifyFailError') {
          // A verify failure right after download on a near-full origin IS
          // the swallowed-quota signature — report the true cause.
          const snap = await storageSnapshot();
          kind = snap && snap.freeBytes < model.sizeBytes * 1.1 ? 'storage-quota' : 'verify-fail';
        }
        patch(id, {
          status: 'error',
          statusText: undefined,
          errorKind: kind,
          error: describeModelError(kind, model.name, raw, await storageSnapshot()),
        });
      } finally {
        abortControllers.delete(id);
        lastActivity.delete(id);
        stopWatchdogIfIdle();
      }
    },

    repairModel: async (id) => {
      const model = get().models.find((m) => m.id === id);
      if (!model || !isManagedModel(id) || isInFlight(model.status)) return;
      const controller = new AbortController();
      abortControllers.set(id, controller);
      patch(id, { status: 'verifying', error: undefined, errorKind: undefined, statusText: 'Checking files…' });
      markActivity(id);
      startWatchdog();
      try {
        // Full-checksum pass, then re-download ONLY missing/damaged shards.
        await downloadModelArtifacts(id, {
          signal: controller.signal,
          verifyLevel: 'hash',
          onProgress: (p) => {
            markActivity(id);
            patch(id, {
              status: 'downloading',
              downloadProgress: p.totalBytes > 0 ? p.loadedBytes / p.totalBytes : 0,
              statusText: `Repairing ${p.currentFile}`,
            });
          },
        });
        patch(id, { status: 'ready', downloadProgress: 1, error: undefined, errorKind: undefined, statusText: undefined });
        persistStatuses(get().models);
      } catch (err) {
        if (controller.signal.aborted) return;
        const raw = err instanceof Error ? err.message : 'Repair failed';
        const kind = (err as Error)?.name === 'VerifyFailError' ? 'verify-fail' : classifyModelError(err);
        patch(id, {
          status: 'error',
          statusText: undefined,
          errorKind: kind,
          error: describeModelError(kind, model.name, raw, await storageSnapshot()),
        });
      } finally {
        abortControllers.delete(id);
        lastActivity.delete(id);
        stopWatchdogIfIdle();
      }
    },

    cancelDownload: (id) => {
      abortControllers.get(id)?.abort();
      abortControllers.delete(id);
      lastActivity.delete(id);
      patch(id, { status: 'not_downloaded', downloadProgress: 0, error: undefined, statusText: undefined });
      stopWatchdogIfIdle();
    },

    deleteModel: async (id) => {
      const model = get().models.find((m) => m.id === id);
      if (!model) return;
      try {
        if (isManagedModel(id)) {
          // Delete every manifest artifact from the ACTIVE backend (folder
          // deletes remove the real files), plus any legacy cache entries.
          const { activeBackend } = await import('@/lib/model-storage');
          const backend = await activeBackend();
          for (const artifact of MODEL_ARTIFACTS[id].artifacts) {
            await backend.delete(id, artifact.path);
          }
          // Legacy transformers-cache sweep for THIS repo only. Scope by the full
          // repo id + the '/resolve/' path terminator so a sibling variant whose
          // repo string merely PREFIXES this one (onnx-community/Kokoro-82M-v1.0-ONNX
          // vs …-ONNX-timestamped) is never collaterally purged — deleting one
          // Kokoro variant must not evict the other's cache (SA-21). The exact
          // current-format artifacts were already removed by backend.delete above.
          const repo = MODEL_ARTIFACTS[id]?.repo;
          await transformersCacheDelete(repo ? `${repo}/resolve/` : model.engineModelId);
        } else {
          switch (model.engine) {
            case 'webllm': {
              const { webllmEngine } = await import('@/engine/webllm-engine');
              await webllmEngine.deleteModelCache(model.engineModelId);
              break;
            }
            case 'onnx-custom': {
              const { sdTurboEngine } = await import('@/engine/sd-turbo-engine');
              await sdTurboEngine.deleteCache();
              break;
            }
          }
        }
      } catch { /* cache may already be empty */ }
      patch(id, { status: 'not_downloaded', downloadProgress: 0, error: undefined, statusText: undefined });
      persistStatuses(get().models);
    },

    getByCategory: (cat) => {
      if (cat === 'all') return get().models;
      return get().models.filter((m) => m.category === cat);
    },

    getRecommended: () => get().models.filter((m) => m.isRecommended),

    getTotalDownloadSize: (ids) => {
      return get().models
        .filter((m) => ids.includes(m.id))
        .reduce((sum, m) => sum + m.sizeBytes, 0);
    },

    downloadRecommended: async () => {
      const recommended = get().getRecommended().filter((m) => m.status === 'not_downloaded' || m.status === 'error');
      // Download up to 2 concurrently (WebLLM serializes its own GPU loads).
      // WebLLM serializes internally, so two WebLLM models in the 2-slot pool
      // leave one downloading while the other idles — starving small non-WebLLM
      // models (Kokoro ~121MB, Whisper 42/76MB) behind GBs of LLM weights.
      // Stable partition: queue non-WebLLM engines first so at least one small
      // model always gets a live slot. Same models, same order within each group.
      const queue = [
        ...recommended.filter((m) => m.engine !== 'webllm'),
        ...recommended.filter((m) => m.engine === 'webllm'),
      ];
      const active: Promise<void>[] = [];
      while (queue.length > 0 || active.length > 0) {
        while (active.length < 2 && queue.length > 0) {
          const model = queue.shift()!;
          const p = get().downloadModel(model.id);
          active.push(p);
          p.finally(() => {
            const idx = active.indexOf(p);
            if (idx !== -1) active.splice(idx, 1);
          });
        }
        if (active.length > 0) await Promise.race(active);
      }
    },
  };
});
