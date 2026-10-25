/**
 * Contentine Create — model storage abstraction (C-M2 Model Storage spec).
 *
 * Two backends behind one interface:
 *  - 'browser' (default): Cache Storage, same cache names + URL keys the
 *    engines have always used ('transformers-cache', 'kokoro-voices') — so
 *    every previously-downloaded model re-verifies in place (upgrade path,
 *    never brick).
 *  - 'folder': a user-chosen real directory via the File System Access API
 *    (feature-detected; Chrome/Edge). The handle persists in IndexedDB and
 *    survives "Clear all app data" — folder-stored models re-adopt instantly.
 *
 * Downloads for manifest engines (kokoro-js / transformersjs) are OUR OWN
 * fetches: browser → HF CDN (pinned revision) → streamed into the backend
 * with SHA-256 computed on the way through. Quota failures are LOUD — the
 * silent transformers.js `cache.put().catch(console.warn)` swallow (hub.js)
 * is out of the write path entirely. Engines then read via a transformers.js
 * `env.customCache` adapter backed by the same storage (worker included).
 *
 * WebLLM owns its own cache and is honestly labeled browser-storage-only.
 *
 * Law L2: the server is NEVER in the model path. All of this is client-side.
 */

import { MODEL_ARTIFACTS, type ModelArtifact } from './model-artifacts';

export type StorageMode = 'browser' | 'folder';

/** FS Access API permission methods (not yet in the TS DOM lib). */
interface PermissionedDirectoryHandle extends FileSystemDirectoryHandle {
  queryPermission(desc: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
  requestPermission(desc: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
}

export interface ArtifactCheck {
  path: string;
  sizeBytes: number;
  state: 'ok' | 'missing' | 'size-mismatch' | 'hash-mismatch';
}

export interface ModelVerifyResult {
  ok: boolean;
  /** Artifacts that need (re-)download — the delta set. */
  needed: ModelArtifact[];
  checks: ArtifactCheck[];
  totalPresentBytes: number;
}

const TRANSFORMERS_CACHE = 'transformers-cache';
const VOICES_CACHE = 'kokoro-voices';
const HANDLE_DB = 'contentine-model-storage';
const HANDLE_STORE = 'handles';
const MODE_KEY = 'contentine-model-storage-mode';
const LAST_VERIFIED_KEY = 'contentine-model-last-verified';

/** Cache-key URL for an artifact — the exact URL the engines request. */
export function artifactUrl(modelId: string, path: string): string {
  const set = MODEL_ARTIFACTS[modelId];
  return `https://huggingface.co/${set.repo}/resolve/main/${path}`;
}

/** Pinned-revision URL for downloads (reproducible even if main moves). */
function pinnedUrl(modelId: string, path: string): string {
  const set = MODEL_ARTIFACTS[modelId];
  return `https://huggingface.co/${set.repo}/resolve/${set.revision}/${path}`;
}

/** True iff this model's artifacts are managed by this storage layer. */
export function isManagedModel(modelId: string): boolean {
  return modelId in MODEL_ARTIFACTS;
}

/* ────────────────────────────── IndexedDB helpers ───────────────────────── */

function openHandleDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(HANDLE_DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(HANDLE_STORE)) {
        req.result.createObjectStore(HANDLE_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openHandleDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(HANDLE_STORE, 'readonly');
      const req = tx.objectStore(HANDLE_STORE).get(key);
      req.onsuccess = () => resolve(req.result as T | undefined);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openHandleDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(HANDLE_STORE, 'readwrite');
      tx.objectStore(HANDLE_STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

async function idbDelete(key: string): Promise<void> {
  const db = await openHandleDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(HANDLE_STORE, 'readwrite');
      tx.objectStore(HANDLE_STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/* ─────────────────────────── mode + folder handle ───────────────────────── */

/** Is the File System Access API available in this browser? */
export function folderStorageSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

/**
 * Workers have no localStorage and can't show pickers, so the main thread
 * passes them the storage context (mode + folder handle — directory handles
 * are structured-cloneable) via postMessage; the worker installs it here
 * before any engine import.
 */
let workerContext: { mode: StorageMode; handle: FileSystemDirectoryHandle | null } | null = null;
export function setStorageContextForWorker(mode: StorageMode, handle: FileSystemDirectoryHandle | null): void {
  workerContext = { mode, handle };
}

export function getStorageMode(): StorageMode {
  if (workerContext) return workerContext.mode;
  try {
    return localStorage.getItem(MODE_KEY) === 'folder' && folderStorageSupported() ? 'folder' : 'browser';
  } catch {
    return 'browser';
  }
}

async function setStorageMode(mode: StorageMode): Promise<void> {
  localStorage.setItem(MODE_KEY, mode);
}

export async function getFolderHandle(): Promise<FileSystemDirectoryHandle | null> {
  if (workerContext) return workerContext.handle;
  try {
    return (await idbGet<FileSystemDirectoryHandle>('modelFolder')) ?? null;
  } catch {
    return null;
  }
}

export type FolderPermission = 'granted' | 'prompt' | 'denied' | 'none';

/** Current permission on the persisted folder handle (no prompt). */
export async function queryFolderPermission(): Promise<FolderPermission> {
  const handle = await getFolderHandle();
  if (!handle) return 'none';
  try {
    const h = handle as PermissionedDirectoryHandle;
    // Handles without the permission API (e.g. OPFS-backed) are always granted.
    if (typeof h.queryPermission !== 'function') return 'granted';
    return (await h.queryPermission({ mode: 'readwrite' })) as FolderPermission;
  } catch {
    return 'denied';
  }
}

/** Re-request folder permission — MUST be called from a user gesture. */
export async function requestFolderPermission(): Promise<FolderPermission> {
  const handle = await getFolderHandle();
  if (!handle) return 'none';
  try {
    return (await (handle as PermissionedDirectoryHandle).requestPermission({ mode: 'readwrite' })) as FolderPermission;
  } catch {
    return 'denied';
  }
}

/**
 * Pick a model folder (user gesture required), persist the handle, and switch
 * to folder mode. Returns the handle. Throws AbortError if the user cancels.
 */
export async function chooseModelFolder(): Promise<FileSystemDirectoryHandle> {
  const w = window as unknown as {
    showDirectoryPicker: (opts: { id: string; mode: string }) => Promise<FileSystemDirectoryHandle>;
  };
  const handle = await w.showDirectoryPicker({ id: 'contentine-models', mode: 'readwrite' });
  await idbSet('modelFolder', handle);
  await setStorageMode('folder');
  adoptionIndex = null; // force re-scan against the new folder
  return handle;
}

/** Switch back to browser storage (keeps the folder handle for later). */
export async function switchToBrowserStorage(): Promise<void> {
  await setStorageMode('browser');
}

/* ─────────────────────────── last-verified ledger ───────────────────────── */

export function getLastVerified(modelId: string): number | null {
  try {
    const map = JSON.parse(localStorage.getItem(LAST_VERIFIED_KEY) ?? '{}') as Record<string, number>;
    return map[modelId] ?? null;
  } catch {
    return null;
  }
}

function stampVerified(modelId: string): void {
  try {
    const map = JSON.parse(localStorage.getItem(LAST_VERIFIED_KEY) ?? '{}') as Record<string, number>;
    map[modelId] = Date.now();
    localStorage.setItem(LAST_VERIFIED_KEY, JSON.stringify(map));
  } catch { /* localStorage unavailable */ }
}

/* ──────────────────────────── adoption index ────────────────────────────
 * Maps `modelId/path` → relative path inside the user folder, so adopted
 * files keep working wherever the user already had them laid out. Canonical
 * layout for OUR downloads is `<modelId>/<repo path>`.                      */

let adoptionIndex: Map<string, string[]> | null = null;

async function loadAdoptionIndex(): Promise<Map<string, string[]>> {
  if (adoptionIndex) return adoptionIndex;
  const stored = (await idbGet<Record<string, string[]>>('adoptionIndex')) ?? {};
  adoptionIndex = new Map(Object.entries(stored));
  return adoptionIndex;
}

async function saveAdoptionIndex(): Promise<void> {
  if (!adoptionIndex) return;
  await idbSet('adoptionIndex', Object.fromEntries(adoptionIndex.entries()));
}

/* ─────────────────────────── folder file helpers ────────────────────────── */

async function folderGetFile(
  root: FileSystemDirectoryHandle,
  relPath: string,
  create = false,
): Promise<FileSystemFileHandle | null> {
  const parts = relPath.split('/').filter(Boolean);
  let dir = root;
  try {
    for (let i = 0; i < parts.length - 1; i++) {
      dir = await dir.getDirectoryHandle(parts[i], { create });
    }
    return await dir.getFileHandle(parts[parts.length - 1], { create });
  } catch {
    return null;
  }
}

async function folderCandidatePaths(modelId: string, path: string): Promise<string[]> {
  const index = await loadAdoptionIndex();
  const adopted = index.get(`${modelId}/${path}`) ?? [];
  return [...adopted, `${modelId}/${path}`];
}

/* ─────────────────────────────── backends ──────────────────────────────── */

interface Backend {
  mode: StorageMode;
  /** Read artifact bytes as a Blob, or null when absent. */
  read(modelId: string, path: string): Promise<Blob | null>;
  /** Size in bytes, or null when absent (cheap — no full read for folder). */
  sizeOf(modelId: string, path: string): Promise<number | null>;
  /** Stream-write an artifact. THROWS on quota/disk errors — never swallow. */
  write(modelId: string, path: string, stream: ReadableStream<Uint8Array>): Promise<void>;
  delete(modelId: string, path: string): Promise<void>;
}

function voiceCacheFor(path: string): string {
  // kokoro-js reads voice .bin files from its own 'kokoro-voices' Cache
  // directly (not via transformers.js env), so voices live there in browser
  // mode and are seeded there from the folder in folder mode.
  return path.startsWith('voices/') ? VOICES_CACHE : TRANSFORMERS_CACHE;
}

const browserBackend: Backend = {
  mode: 'browser',
  async read(modelId, path) {
    try {
      const cache = await caches.open(voiceCacheFor(path));
      const res = await cache.match(artifactUrl(modelId, path));
      return res ? await res.blob() : null;
    } catch {
      return null;
    }
  },
  async sizeOf(modelId, path) {
    const blob = await this.read(modelId, path);
    return blob ? blob.size : null;
  },
  async write(modelId, path, stream) {
    const cache = await caches.open(voiceCacheFor(path));
    // No .catch: a QuotaExceededError here MUST fail the download loudly.
    await cache.put(artifactUrl(modelId, path), new Response(stream));
  },
  async delete(modelId, path) {
    try {
      const cache = await caches.open(voiceCacheFor(path));
      await cache.delete(artifactUrl(modelId, path));
    } catch { /* already gone */ }
  },
};

function makeFolderBackend(root: FileSystemDirectoryHandle): Backend {
  return {
    mode: 'folder',
    async read(modelId, path) {
      for (const rel of await folderCandidatePaths(modelId, path)) {
        const fh = await folderGetFile(root, rel);
        if (fh) return await fh.getFile();
      }
      return null;
    },
    async sizeOf(modelId, path) {
      for (const rel of await folderCandidatePaths(modelId, path)) {
        const fh = await folderGetFile(root, rel);
        if (fh) return (await fh.getFile()).size;
      }
      return null;
    },
    async write(modelId, path, stream) {
      // Repairs write to the ADOPTED location when one exists (respecting the
      // user's own layout — and so reads never serve a stale adopted copy);
      // fresh downloads use the canonical `<modelId>/<path>` layout.
      const [target] = await folderCandidatePaths(modelId, path);
      const fh = await folderGetFile(root, target, true);
      if (!fh) throw new Error(`Could not create ${target} in the model folder.`);
      const writable = await fh.createWritable();
      await stream.pipeTo(writable); // throws on disk-full / permission loss
    },
    async delete(modelId, path) {
      for (const rel of await folderCandidatePaths(modelId, path)) {
        const parts = rel.split('/');
        try {
          let dir = root;
          for (let i = 0; i < parts.length - 1; i++) dir = await dir.getDirectoryHandle(parts[i]);
          await dir.removeEntry(parts[parts.length - 1]);
        } catch { /* already gone */ }
      }
    },
  };
}

/** Resolve the active backend (folder mode falls back to browser if the
 *  handle is missing or permission is not currently granted). */
export async function activeBackend(): Promise<Backend> {
  if (getStorageMode() === 'folder') {
    const handle = await getFolderHandle();
    if (handle) {
      try {
        const h = handle as PermissionedDirectoryHandle;
        if (typeof h.queryPermission !== 'function' ||
            (await h.queryPermission({ mode: 'readwrite' })) === 'granted') {
          return makeFolderBackend(handle);
        }
      } catch { /* fall through */ }
    }
  }
  return browserBackend;
}

/* ───────────────────────────── hashing ─────────────────────────────────── */

async function sha256OfStream(stream: ReadableStream<Uint8Array>): Promise<string> {
  const { createSHA256 } = await import('hash-wasm');
  const hasher = await createSHA256();
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    hasher.update(value);
  }
  return hasher.digest('hex');
}

/* ───────────────────────────── verification ─────────────────────────────── */

/**
 * Verify a model's artifacts against the manifest.
 * `level: 'presence'` checks existence + exact size (fast — page-load checks);
 * `level: 'hash'` additionally streams SHA-256 over every artifact (adopt,
 * post-download, repair).
 */
export async function verifyModelArtifacts(
  modelId: string,
  level: 'presence' | 'hash',
  backend?: Backend,
): Promise<ModelVerifyResult> {
  const set = MODEL_ARTIFACTS[modelId];
  if (!set) return { ok: false, needed: [], checks: [], totalPresentBytes: 0 };
  const b = backend ?? (await activeBackend());
  const checks: ArtifactCheck[] = [];
  const needed: ModelArtifact[] = [];
  let totalPresentBytes = 0;

  for (const artifact of set.artifacts) {
    let state: ArtifactCheck['state'];
    if (level === 'presence') {
      const size = await b.sizeOf(modelId, artifact.path);
      state = size === null ? 'missing' : size !== artifact.sizeBytes ? 'size-mismatch' : 'ok';
      if (size !== null) totalPresentBytes += size;
    } else {
      const blob = await b.read(modelId, artifact.path);
      if (!blob) {
        state = 'missing';
      } else if (blob.size !== artifact.sizeBytes) {
        state = 'size-mismatch';
        totalPresentBytes += blob.size;
      } else {
        const hash = await sha256OfStream(blob.stream());
        state = hash === artifact.sha256 ? 'ok' : 'hash-mismatch';
        totalPresentBytes += blob.size;
      }
    }
    checks.push({ path: artifact.path, sizeBytes: artifact.sizeBytes, state });
    if (state !== 'ok') needed.push(artifact);
  }

  const ok = needed.length === 0;
  if (ok) stampVerified(modelId);
  return { ok, needed, checks, totalPresentBytes };
}

/* ───────────────────────────── downloader ──────────────────────────────── */

export interface DownloadProgress {
  loadedBytes: number;
  totalBytes: number;
  currentFile: string;
}

/**
 * Download a model's missing/damaged artifacts (per-shard delta — artifacts
 * already verified 'ok' are never re-fetched). Streams each artifact from the
 * pinned-revision CDN URL into the backend while hashing; a hash mismatch on
 * the wire throws 'verify-fail' honestly. Quota errors from the backend
 * propagate loudly (classified by the caller).
 */
export async function downloadModelArtifacts(
  modelId: string,
  opts: {
    signal?: AbortSignal;
    onProgress?: (p: DownloadProgress) => void;
    /** 'hash' re-verifies present artifacts by checksum first (repair). */
    verifyLevel?: 'presence' | 'hash';
  } = {},
): Promise<void> {
  const set = MODEL_ARTIFACTS[modelId];
  if (!set) throw new Error(`No artifact manifest for model ${modelId}`);
  const backend = await activeBackend();

  const before = await verifyModelArtifacts(modelId, opts.verifyLevel ?? 'presence', backend);
  const needed = before.needed;
  if (needed.length === 0) return;

  const totalBytes = needed.reduce((s, a) => s + a.sizeBytes, 0);
  let loadedBytes = 0;

  for (const artifact of needed) {
    if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const res = await fetch(pinnedUrl(modelId, artifact.path), { signal: opts.signal });
    if (!res.ok || !res.body) {
      throw new Error(`HTTP ${res.status} fetching ${artifact.path}`);
    }

    const { createSHA256 } = await import('hash-wasm');
    const hasher = await createSHA256();
    const counter = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        hasher.update(chunk);
        loadedBytes = Math.min(loadedBytes + chunk.length, totalBytes);
        opts.onProgress?.({ loadedBytes, totalBytes, currentFile: artifact.path });
        controller.enqueue(chunk);
      },
    });

    await backend.write(modelId, artifact.path, res.body.pipeThrough(counter));

    const hash = hasher.digest('hex');
    if (hash !== artifact.sha256) {
      await backend.delete(modelId, artifact.path);
      const err = new Error(
        `${artifact.path} failed checksum verification after download (expected ${artifact.sha256.slice(0, 12)}…, got ${hash.slice(0, 12)}…).`,
      );
      err.name = 'VerifyFailError';
      throw err;
    }
  }

  const after = await verifyModelArtifacts(modelId, 'presence', backend);
  if (!after.ok) {
    const err = new Error(
      `${after.needed.length} artifact(s) missing from storage immediately after download — the write did not stick.`,
    );
    err.name = 'VerifyFailError';
    throw err;
  }

  await seedVoicesCache(modelId, backend);
}

/**
 * Copy manifest voice files into the 'kokoro-voices' Cache kokoro-js reads
 * directly. No-op for models without voices or when already seeded. In
 * browser mode voices are already written there by the backend.
 */
export async function seedVoicesCache(modelId: string, backend?: Backend): Promise<void> {
  const set = MODEL_ARTIFACTS[modelId];
  if (!set) return;
  const voices = set.artifacts.filter((a) => a.path.startsWith('voices/'));
  if (voices.length === 0) return;
  const b = backend ?? (await activeBackend());
  if (b.mode === 'browser') return; // written to kokoro-voices at download time
  try {
    const cache = await caches.open(VOICES_CACHE);
    for (const artifact of voices) {
      const url = artifactUrl(modelId, artifact.path);
      if (await cache.match(url)) continue;
      const blob = await b.read(modelId, artifact.path);
      if (blob) await cache.put(url, new Response(blob));
    }
  } catch {
    // Seeding is a warm-up: kokoro falls back to fetching voices lazily.
  }
}

/* ───────────────────────── TTS-init cache preflight ──────────────────────── */

/** Cheap existence check (no body read) for a URL in a named Cache. */
async function cacheHas(cacheName: string, url: string): Promise<boolean> {
  try {
    const cache = await caches.open(cacheName);
    return !!(await cache.match(url));
  } catch {
    return false;
  }
}

export interface SeedProgress {
  /** 'reseed' = restoring from a local copy (no network); 'refetch' = CDN download. */
  phase: 'reseed' | 'refetch';
  loaded: number;
  total: number;
  file: string;
}

/**
 * TTS-init preflight for a managed model (kokoro): the browser cache is the ONLY
 * model store (per C-03 / architecture row R-94) and CAN be evicted under quota
 * pressure or in incognito/ephemeral sessions — while `/models` still reports
 * READY. Voices are the recurring casualty: kokoro-js reads voice .bin files
 * from the DISTINCT `kokoro-voices` Cache directly (not via the transformers
 * backend), so an eviction there breaks synthesis even when the main model is
 * fine.
 *
 * This verifies BOTH the main artifacts (in the store the runtime reads them
 * from) AND the `kokoro-voices` cache, and restores any missing delta: re-seed
 * from the local folder when the bytes exist on disk (a copy, no network), else
 * re-fetch only the missing artifacts from the pinned CDN with visible progress.
 * A recoverable miss NEVER surfaces as voice-not-found; a genuinely
 * unrecoverable miss (offline + evicted + no local copy) throws the real,
 * classified download error (honest — never a facade). Eviction is treated as an
 * EXPECTED state, not an exception.
 */
export async function ensureModelSeeded(
  modelId: string,
  onProgress?: (p: SeedProgress) => void,
): Promise<{ status: 'ok' | 'reseeded' | 'refetched'; restored: number }> {
  const set = MODEL_ARTIFACTS[modelId];
  if (!set) return { status: 'ok', restored: 0 };
  const mode = getStorageMode();
  const backend = await activeBackend();

  // Which artifacts are missing from the exact store the runtime reads them from?
  // Voices → always the kokoro-voices Cache; everything else → the transformers
  // Cache (browser) or the user's folder (folder mode). Existence-only checks so
  // this preflight stays cheap on the common already-seeded path.
  const missing: ModelArtifact[] = [];
  for (const a of set.artifacts) {
    const present = a.path.startsWith('voices/')
      ? await cacheHas(VOICES_CACHE, artifactUrl(modelId, a.path))
      : mode === 'folder'
        ? (await backend.sizeOf(modelId, a.path)) !== null
        : await cacheHas(TRANSFORMERS_CACHE, artifactUrl(modelId, a.path));
    if (!present) missing.push(a);
  }
  if (missing.length === 0) return { status: 'ok', restored: 0 };

  // (a) Re-seed from local bytes first. In folder mode the real files live on
  //     disk, so restoring the kokoro-voices cache is a copy (no network). In
  //     browser mode a missing entry has no local source (the cache IS the
  //     store) so backend.read returns null and we fall through to re-fetch.
  const voicesCache = await caches.open(VOICES_CACHE);
  let restored = 0;
  const stillMissing: ModelArtifact[] = [];
  for (const a of missing) {
    const blob = await backend.read(modelId, a.path);
    if (blob && blob.size === a.sizeBytes) {
      if (a.path.startsWith('voices/')) {
        await voicesCache.put(artifactUrl(modelId, a.path), new Response(blob));
      }
      restored++;
      onProgress?.({ phase: 'reseed', loaded: restored, total: missing.length, file: a.path });
    } else {
      stillMissing.push(a);
    }
  }
  if (stillMissing.length === 0) return { status: 'reseeded', restored };

  // (b) No local copy → honest delta re-fetch of ONLY the missing artifacts from
  //     the pinned CDN (downloadModelArtifacts fetches the delta, verifies
  //     SHA-256, and — folder mode — re-seeds the voices cache at the end).
  await downloadModelArtifacts(modelId, {
    onProgress: (p) => onProgress?.({ phase: 'refetch', loaded: p.loadedBytes, total: p.totalBytes, file: p.currentFile }),
  });
  return { status: 'refetched', restored };
}

/* ─────────────────────────────── adopt ─────────────────────────────────── */

export interface AdoptProgress {
  scanned: number;
  totalFiles: number;
  matched: number;
  currentFile: string;
}

export interface AdoptResult {
  /** modelId → artifact paths matched in the folder. */
  matchedByModel: Record<string, string[]>;
  scannedFiles: number;
}

/**
 * Scan a folder that may already contain model files, hash-verify every
 * size-candidate file against the catalog manifest, and index matches so
 * they are served in place — zero re-download for adopted artifacts.
 */
export async function adoptFolder(
  handle: FileSystemDirectoryHandle,
  onProgress?: (p: AdoptProgress) => void,
): Promise<AdoptResult> {
  // size → [{modelId, artifact}] lookup (only hash files that could match).
  const bySize = new Map<number, { modelId: string; artifact: ModelArtifact }[]>();
  for (const [modelId, set] of Object.entries(MODEL_ARTIFACTS)) {
    for (const artifact of set.artifacts) {
      const list = bySize.get(artifact.sizeBytes) ?? [];
      list.push({ modelId, artifact });
      bySize.set(artifact.sizeBytes, list);
    }
  }

  const files: { rel: string; handle: FileSystemFileHandle; size: number }[] = [];
  async function walk(dir: FileSystemDirectoryHandle, prefix: string): Promise<void> {
    for await (const [name, entry] of dir as unknown as AsyncIterable<[string, FileSystemHandle]>) {
      if (name.startsWith('.')) continue;
      const rel = prefix ? `${prefix}/${name}` : name;
      if (entry.kind === 'directory') {
        await walk(entry as FileSystemDirectoryHandle, rel);
      } else {
        const f = await (entry as FileSystemFileHandle).getFile();
        if (bySize.has(f.size)) files.push({ rel, handle: entry as FileSystemFileHandle, size: f.size });
      }
    }
  }
  await walk(handle, '');

  const index = await loadAdoptionIndex();
  const matchedByModel: Record<string, string[]> = {};
  let scanned = 0;
  let matched = 0;

  for (const file of files) {
    scanned++;
    onProgress?.({ scanned, totalFiles: files.length, matched, currentFile: file.rel });
    const candidates = bySize.get(file.size)!;
    const blob = await file.handle.getFile();
    const hash = await sha256OfStream(blob.stream());
    for (const { modelId, artifact } of candidates) {
      if (hash !== artifact.sha256) continue;
      const key = `${modelId}/${artifact.path}`;
      const existing = index.get(key) ?? [];
      if (!existing.includes(file.rel)) index.set(key, [file.rel, ...existing]);
      (matchedByModel[modelId] ??= []).push(artifact.path);
      matched++;
    }
  }

  await saveAdoptionIndex();
  return { matchedByModel, scannedFiles: files.length };
}

/* ────────────────────────────── migration ──────────────────────────────── */

/**
 * Copy every present artifact of every managed model between backends
 * (browser ⇄ folder) with progress. The source copy is kept — deleting is a
 * separate, explicit user action.
 */
export async function migrateStorage(
  direction: 'browser-to-folder' | 'folder-to-browser',
  onProgress?: (p: DownloadProgress) => void,
): Promise<void> {
  const handle = await getFolderHandle();
  if (!handle) throw new Error('No model folder is configured.');
  const folder = makeFolderBackend(handle);
  const [from, to] = direction === 'browser-to-folder' ? [browserBackend, folder] : [folder, browserBackend];

  const work: { modelId: string; artifact: ModelArtifact; blob: Blob }[] = [];
  for (const [modelId, set] of Object.entries(MODEL_ARTIFACTS)) {
    for (const artifact of set.artifacts) {
      const blob = await from.read(modelId, artifact.path);
      if (blob && blob.size === artifact.sizeBytes && (await to.sizeOf(modelId, artifact.path)) !== artifact.sizeBytes) {
        work.push({ modelId, artifact, blob });
      }
    }
  }
  const totalBytes = work.reduce((s, w) => s + w.blob.size, 0);
  let loadedBytes = 0;
  for (const { modelId, artifact, blob } of work) {
    await to.write(modelId, artifact.path, blob.stream());
    loadedBytes += blob.size;
    onProgress?.({ loadedBytes, totalBytes, currentFile: `${modelId}/${artifact.path}` });
  }
}

/* ─────────────────────────── usage + orphans ────────────────────────────── */

export interface CacheUsageEntry {
  cacheName: string;
  url: string;
  sizeBytes: number;
  /** Managed model this entry belongs to, or null → orphan candidate. */
  modelId: string | null;
}

/** Enumerate every Cache Storage entry with its size and owning model. */
export async function enumerateCacheStorage(): Promise<CacheUsageEntry[]> {
  const entries: CacheUsageEntry[] = [];
  const urlToModel = new Map<string, string>();
  for (const [modelId, set] of Object.entries(MODEL_ARTIFACTS)) {
    for (const artifact of set.artifacts) {
      urlToModel.set(artifactUrl(modelId, artifact.path), modelId);
    }
  }
  try {
    for (const cacheName of await caches.keys()) {
      const cache = await caches.open(cacheName);
      for (const req of await cache.keys()) {
        let sizeBytes = 0;
        try {
          const res = await cache.match(req);
          if (res) sizeBytes = (await res.blob()).size;
        } catch { /* unreadable entry */ }
        entries.push({
          cacheName,
          url: req.url,
          sizeBytes,
          modelId: urlToModel.get(req.url) ?? null,
        });
      }
    }
  } catch { /* Cache API unavailable */ }
  return entries;
}

export interface OrphanReport {
  /** Cache entries not belonging to any current catalog model. */
  entries: CacheUsageEntry[];
  totalBytes: number;
}

/**
 * Orphans = Cache Storage entries in the model caches that no current
 * catalog model claims: partial downloads, superseded quantization variants,
 * pre-state-machine leftovers, models removed from the catalog. WebLLM's own
 * caches are matched against catalog engineModelId families; the SD-Turbo
 * cache counts as orphaned while image generation is feature-flagged off.
 */
export async function findOrphans(
  catalogWebllmFamilies: string[],
  imageGenEnabled: boolean,
): Promise<OrphanReport> {
  const all = await enumerateCacheStorage();
  const orphans: CacheUsageEntry[] = [];
  for (const entry of all) {
    if (entry.modelId) continue; // owned by a managed model
    const name = entry.cacheName;
    if (name === TRANSFORMERS_CACHE || name === VOICES_CACHE) {
      orphans.push(entry); // model cache entry no manifest claims
    } else if (name.startsWith('webllm')) {
      const owned = catalogWebllmFamilies.some((fam) => entry.url.includes(fam));
      if (!owned) orphans.push(entry);
    } else if (name === 'sd-turbo-models') {
      if (!imageGenEnabled) orphans.push(entry);
    }
    // Other caches (app assets, next static) are not model storage — skip.
  }
  return { entries: orphans, totalBytes: orphans.reduce((s, e) => s + e.sizeBytes, 0) };
}

/** Delete a set of cache entries (from an orphan report). */
export async function deleteCacheEntries(entries: CacheUsageEntry[]): Promise<void> {
  for (const entry of entries) {
    try {
      const cache = await caches.open(entry.cacheName);
      await cache.delete(entry.url);
    } catch { /* already gone */ }
  }
}

/* ──────────────────────────── clear all data ────────────────────────────── */

export interface ClearReport {
  cachesDeleted: string[];
  databasesDeleted: string[];
  opfsCleared: boolean;
  serviceWorkersUnregistered: number;
}

/**
 * Wipe THIS ORIGIN's stored data: every Cache API cache, every IndexedDB
 * database (except the model-folder handle DB — folder-stored models must
 * survive a clear and re-adopt instantly, per spec), OPFS, and service-worker
 * registrations. A browser cannot clear Chrome's global HTTP cache — only
 * its own site data; the UI says so honestly.
 */
export async function clearAllAppData(): Promise<ClearReport> {
  const report: ClearReport = { cachesDeleted: [], databasesDeleted: [], opfsCleared: false, serviceWorkersUnregistered: 0 };

  try {
    for (const name of await caches.keys()) {
      if (await caches.delete(name)) report.cachesDeleted.push(name);
    }
  } catch { /* Cache API unavailable */ }

  try {
    const dbs = (await indexedDB.databases?.()) ?? [];
    for (const db of dbs) {
      if (!db.name || db.name === HANDLE_DB) continue;
      await new Promise<void>((resolve) => {
        const req = indexedDB.deleteDatabase(db.name!);
        req.onsuccess = req.onerror = req.onblocked = () => resolve();
      });
      report.databasesDeleted.push(db.name);
    }
  } catch { /* indexedDB.databases unsupported */ }

  try {
    const root = await navigator.storage?.getDirectory?.();
    if (root) {
      // Never delete the configured model folder — even if it happens to
      // live inside OPFS. Real directories resolve to null and are untouched
      // by design (a website cannot delete your files).
      let protectedTop: string | null = null;
      const folder = await getFolderHandle();
      if (folder) {
        try {
          const rel = await root.resolve(folder);
          if (rel && rel.length > 0) protectedTop = rel[0];
        } catch { /* not OPFS-backed */ }
      }
      for await (const [name] of root as unknown as AsyncIterable<[string, FileSystemHandle]>) {
        if (name === protectedTop) continue;
        await root.removeEntry(name, { recursive: true }).catch(() => undefined);
      }
      report.opfsCleared = true;
    }
  } catch { /* OPFS unavailable */ }

  try {
    const regs = (await navigator.serviceWorker?.getRegistrations?.()) ?? [];
    for (const reg of regs) {
      if (await reg.unregister()) report.serviceWorkersUnregistered++;
    }
  } catch { /* no service workers */ }

  // Model bookkeeping in localStorage must not outlive the data it described.
  try {
    localStorage.removeItem('contentine-model-status');
    localStorage.removeItem(LAST_VERIFIED_KEY);
    // Underscores — must match device-scanner's CACHE_KEY ('contentine_device_profile');
    // the old hyphenated key removed nothing, so a stale profile survived a full clear.
    localStorage.removeItem('contentine_device_profile');
  } catch { /* localStorage unavailable */ }

  return report;
}

/* ───────────────── transformers.js custom-cache adapter ─────────────────── */

/**
 * Map an incoming request URL to a managed (modelId, path) pair. Handles any
 * revision segment (`resolve/<rev>/`) so engine requests for 'main' hit
 * artifacts we downloaded at a pinned revision.
 */
function resolveManagedUrl(url: string): { modelId: string; path: string } | null {
  const m = url.match(/^https:\/\/huggingface\.co\/([^/]+\/[^/]+)\/resolve\/[^/]+\/(.+?)(?:\?.*)?$/);
  if (!m) return null;
  const [, repo, path] = m;
  for (const [modelId, set] of Object.entries(MODEL_ARTIFACTS)) {
    if (set.repo === repo && set.artifacts.some((a) => a.path === path)) {
      return { modelId, path };
    }
  }
  return null;
}

/**
 * Install this storage layer as transformers.js's cache
 * (`env.useCustomCache`). Idempotent. Works on the main thread and inside
 * workers — pass the transformers `env` object (imported dynamically by the
 * caller to keep engine imports dynamic, Law L8). In folder mode, artifact
 * reads come straight from the user's directory.
 */
export function installTransformersCache(env: {
  useBrowserCache: boolean;
  useCustomCache: boolean;
  customCache: unknown;
}): void {
  if (env.useCustomCache && env.customCache) return;
  env.useBrowserCache = false;
  env.useCustomCache = true;
  env.customCache = {
    async match(request: RequestInfo): Promise<Response | undefined> {
      const url = typeof request === 'string' ? request : request.url;
      const managed = resolveManagedUrl(url);
      if (managed) {
        const backend = await activeBackend();
        const blob = await backend.read(managed.modelId, managed.path);
        if (blob) return new Response(blob);
        return undefined;
      }
      try {
        const cache = await caches.open(TRANSFORMERS_CACHE);
        return await cache.match(url);
      } catch {
        return undefined;
      }
    },
    async put(request: RequestInfo, response: Response): Promise<void> {
      const url = typeof request === 'string' ? request : request.url;
      const managed = resolveManagedUrl(url);
      if (managed) {
        const backend = await activeBackend();
        if ((await backend.sizeOf(managed.modelId, managed.path)) !== null) return; // already stored
        if (!response.body) return;
        await backend.write(managed.modelId, managed.path, response.body); // loud on quota
        return;
      }
      // Unmanaged extras keep legacy behavior (best-effort browser cache).
      try {
        const cache = await caches.open(TRANSFORMERS_CACHE);
        await cache.put(url, response);
      } catch (err) {
        console.warn(`model-storage: could not cache ${url}:`, err);
      }
    },
  };
}
