/**
 * Contentine Create — Cartoon Studio: durable project store (format v1)
 *
 * Persists a COMPLETE cartoon project so it survives a browser restart:
 * the scene plan + revision, pinned voice takes (PCM + identity), supplied
 * background images and audio assets, export settings, and the last render
 * (MP4 + per-scene encoded chunks, so selective re-render keeps working after
 * reopen). Runtime objects (Float32Array takes, ImageBitmaps, Blobs) are
 * rebuilt from stored bytes on load; nothing non-serializable is persisted.
 *
 * Guarantees
 *  - Atomic save: every blob and the manifest commit in ONE IndexedDB
 *    transaction, so a manifest never references bytes that were not written,
 *    and a failed/interrupted save leaves the previous revision intact.
 *  - Compare-and-swap: a save carries `expectedRevision` (null = create);
 *    a stale revision is a REVISION_CONFLICT with no write.
 *  - Integrity: blobs are content-addressed (SHA-256) and re-hashed on load;
 *    a missing or altered pinned input is reported, never silently replaced.
 *    The render cache is regenerable: if only it is damaged the project still
 *    loads, without `lastRender`, and `warnings` says why.
 *  - Scope: records are keyed by (workspaceId, projectId); blobs are
 *    namespaced per workspace. A project id alone never reaches another
 *    workspace's data.
 *  - Bounded: per-blob, per-project and count limits are checked before
 *    any write. Browser storage is not an archive — `exportProjectBundle`
 *    produces a portable, hash-verified backup.
 *
 * Load this module dynamically from UI code (it imports the pure scene-plan
 * helpers, which live under engine/ — Law L8). Format: docs/cartoon-project-format.md
 */

import type { ScenePlan } from '@/engine/cartoon/scene-plan';
import type { VoiceTake } from '@/engine/cartoon/voice-takes';
import type { VisemeStamp } from '@/engine/cartoon/visemes';
import type { CartoonRenderResult, SceneRenderRecord } from '@/engine/cartoon/cartoon-renderer';
import type { PlanTiming } from '@/engine/cartoon/timing';
import { hashScenePlan, sha256Hex, validateScenePlan } from '@/engine/cartoon/scene-plan';

export const PROJECT_FORMAT_VERSION = 1 as const;
export const PROJECT_DB_NAME = 'contentine-cartoon-projects';
const DB_VERSION = 1;
const MANIFESTS = 'manifests';
const BLOBS = 'blobs';

export const PROJECT_LIMITS = {
  maxTakes: 1000,
  maxAssets: 500,
  maxBlobBytes: 256 * 1024 * 1024,
  maxProjectBytes: 1024 * 1024 * 1024,
  maxIdLength: 200,
} as const;

// ─── Errors ──────────────────────────────────────────────────────────────────

export type ProjectStoreErrorCode =
  | 'INVALID_PROJECT'
  | 'NOT_FOUND'
  | 'REVISION_CONFLICT'
  | 'LIMIT_EXCEEDED'
  | 'MISSING_ASSET'
  | 'CORRUPT_ASSET'
  | 'UNSUPPORTED_FORMAT'
  | 'STORAGE_FAILED';

export class ProjectStoreError extends Error {
  constructor(
    readonly code: ProjectStoreErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ProjectStoreError';
  }
}

// ─── Stored format (v1) ──────────────────────────────────────────────────────

export interface BlobRef {
  sha256: string;
  size: number;
}

export interface StoredTake {
  key: string;
  dialogueId: string;
  text: string;
  voiceProfileRef: string;
  sampleRate: number;
  durationSec: number;
  visemes: VisemeStamp[];
  /** Float32 PCM bytes; `pcm.sha256` equals the take's pcmHash. */
  pcm: BlobRef;
}

export interface StoredAsset {
  ref: string;
  mime: string;
  data: BlobRef;
}

export interface StoredRender {
  renderedPlan: ScenePlan;
  renderedPlanHash: string;
  mp4: BlobRef;
  fps: number;
  width: number;
  height: number;
  durationSec: number;
  totalFrames: number;
  audioCodec: string | null;
  audioPcmHash: string;
  timing: PlanTiming;
  decoderConfig: { codec: string; codedWidth: number; codedHeight: number; description?: BlobRef };
  scenes: Array<{
    sceneId: string;
    contentHash: string;
    startFrame: number;
    frameCount: number;
    /** Concatenated chunk bytes; `index` rows are [byteLength, type, timestamp, duration]. */
    chunks: BlobRef;
    index: Array<[number, 'key' | 'delta', number, number]>;
  }>;
  savedAt: number;
}

export interface ProjectManifestV1 {
  formatVersion: 1;
  workspaceId: string;
  projectId: string;
  revision: number;
  planHash: string;
  savedAt: number;
  plan: ScenePlan;
  takes: StoredTake[];
  backgroundImages: StoredAsset[];
  audioAssets: StoredAsset[];
  exportConfig: ExportConfig;
  lastRender?: StoredRender;
}

export interface ExportConfig {
  bitrate?: number;
}

// ─── Public in-memory shapes ─────────────────────────────────────────────────

export interface ProjectInput {
  workspaceId: string;
  plan: ScenePlan;
  takes: Map<string, VoiceTake>;
  /** Encoded image bytes keyed by `background.assetRef`. */
  backgroundImages?: Map<string, Blob>;
  /** Encoded audio bytes keyed by `asset:` ref. */
  audioAssets?: Map<string, ArrayBuffer>;
  exportConfig?: ExportConfig;
  /** The last successful render and the plan it was rendered from. */
  lastRender?: { renderedPlan: ScenePlan; result: CartoonRenderResult };
}

export interface LoadedProject {
  workspaceId: string;
  projectId: string;
  revision: number;
  planHash: string;
  savedAt: number;
  plan: ScenePlan;
  takes: Map<string, VoiceTake>;
  backgroundImages: Map<string, Blob>;
  audioAssets: Map<string, ArrayBuffer>;
  exportConfig: ExportConfig;
  lastRender?: { renderedPlan: ScenePlan; result: CartoonRenderResult };
  /** Non-fatal problems, e.g. a damaged render cache that was dropped. */
  warnings: string[];
}

export interface SaveResult {
  revision: number;
  planHash: string;
  savedAt: number;
  bytesWritten: number;
}

export interface ProjectSummary {
  projectId: string;
  title: string;
  revision: number;
  planHash: string;
  savedAt: number;
  hasRender: boolean;
}

// ─── IndexedDB plumbing ──────────────────────────────────────────────────────

interface BlobRow {
  key: string;
  workspaceId: string;
  sha256: string;
  bytes: ArrayBuffer;
}

const blobKey = (workspaceId: string, sha256: string) => `${workspaceId}/${sha256}`;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(PROJECT_DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(MANIFESTS)) {
        db.createObjectStore(MANIFESTS, { keyPath: ['workspaceId', 'projectId'] });
      }
      if (!db.objectStoreNames.contains(BLOBS)) {
        const blobs = db.createObjectStore(BLOBS, { keyPath: 'key' });
        blobs.createIndex('workspaceId', 'workspaceId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(new ProjectStoreError('STORAGE_FAILED', `Cannot open project storage: ${req.error?.message}`));
    req.onblocked = () => reject(new ProjectStoreError('STORAGE_FAILED', 'Project storage upgrade is blocked by another tab'));
  });
}

function checkId(kind: string, id: unknown): string {
  if (typeof id !== 'string' || id.length === 0 || id.length > PROJECT_LIMITS.maxIdLength) {
    throw new ProjectStoreError('INVALID_PROJECT', `${kind} must be a non-empty string of at most ${PROJECT_LIMITS.maxIdLength} characters`);
  }
  return id;
}

const toBytes = (view: ArrayBufferView): Uint8Array =>
  new Uint8Array(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength));

// ─── Save ────────────────────────────────────────────────────────────────────

/**
 * Save a complete project. `expectedRevision` must equal the stored revision
 * (or be `null` to create a new project); otherwise REVISION_CONFLICT and
 * nothing is written. Resolves only after the transaction has committed.
 */
export async function saveProject(
  input: ProjectInput,
  opts: { expectedRevision: number | null },
): Promise<SaveResult> {
  const workspaceId = checkId('workspaceId', input.workspaceId);
  const validation = validateScenePlan(input.plan);
  if (!validation.ok) {
    throw new ProjectStoreError('INVALID_PROJECT', `Scene plan is invalid: ${validation.errors.slice(0, 5).join('; ')}`, {
      errors: validation.errors,
    });
  }
  const projectId = checkId('plan.id', input.plan.id);

  const backgrounds = input.backgroundImages ?? new Map<string, Blob>();
  const audio = input.audioAssets ?? new Map<string, ArrayBuffer>();
  if (input.takes.size > PROJECT_LIMITS.maxTakes) {
    throw new ProjectStoreError('LIMIT_EXCEEDED', `Too many voice takes (${input.takes.size} > ${PROJECT_LIMITS.maxTakes})`);
  }
  if (backgrounds.size + audio.size > PROJECT_LIMITS.maxAssets) {
    throw new ProjectStoreError('LIMIT_EXCEEDED', `Too many assets (${backgrounds.size + audio.size} > ${PROJECT_LIMITS.maxAssets})`);
  }

  // Hash everything BEFORE opening the transaction: awaiting crypto inside an
  // IndexedDB transaction would let it auto-commit half-way.
  const pending = new Map<string, Uint8Array>();
  let projectBytes = 0;
  const addBlob = async (bytes: Uint8Array, label: string): Promise<BlobRef> => {
    if (bytes.byteLength > PROJECT_LIMITS.maxBlobBytes) {
      throw new ProjectStoreError('LIMIT_EXCEEDED', `${label} is ${bytes.byteLength} bytes (limit ${PROJECT_LIMITS.maxBlobBytes})`);
    }
    const sha256 = await sha256Hex(bytes);
    if (!pending.has(sha256)) {
      pending.set(sha256, bytes);
      projectBytes += bytes.byteLength;
      if (projectBytes > PROJECT_LIMITS.maxProjectBytes) {
        throw new ProjectStoreError('LIMIT_EXCEEDED', `Project exceeds ${PROJECT_LIMITS.maxProjectBytes} bytes`);
      }
    }
    return { sha256, size: bytes.byteLength };
  };

  const takes: StoredTake[] = [];
  for (const [key, take] of input.takes) {
    const pcm = await addBlob(toBytes(take.pcm), `take '${key}'`);
    if (take.pcmHash && take.pcmHash !== pcm.sha256) {
      throw new ProjectStoreError('INVALID_PROJECT', `Take '${key}' pcmHash does not match its PCM bytes`);
    }
    takes.push({
      key,
      dialogueId: take.dialogueId,
      text: take.text,
      voiceProfileRef: take.voiceProfileRef,
      sampleRate: take.sampleRate,
      durationSec: take.durationSec,
      visemes: take.visemes,
      pcm,
    });
  }

  const backgroundImages: StoredAsset[] = [];
  for (const [ref, blob] of backgrounds) {
    backgroundImages.push({ ref, mime: blob.type || 'application/octet-stream', data: await addBlob(new Uint8Array(await blob.arrayBuffer()), `background '${ref}'`) });
  }
  const audioAssets: StoredAsset[] = [];
  for (const [ref, buf] of audio) {
    audioAssets.push({ ref, mime: 'application/octet-stream', data: await addBlob(new Uint8Array(buf.slice(0)), `audio asset '${ref}'`) });
  }

  let lastRender: StoredRender | undefined;
  if (input.lastRender) {
    const { renderedPlan, result } = input.lastRender;
    const scenes: StoredRender['scenes'] = [];
    for (const rec of result.sceneRecords) {
      const total = rec.chunks.reduce((n, c) => n + c.data.byteLength, 0);
      const joined = new Uint8Array(total);
      let off = 0;
      for (const c of rec.chunks) {
        joined.set(c.data, off);
        off += c.data.byteLength;
      }
      scenes.push({
        sceneId: rec.sceneId,
        contentHash: rec.contentHash,
        startFrame: rec.startFrame,
        frameCount: rec.frameCount,
        chunks: await addBlob(joined, `render chunks for '${rec.sceneId}'`),
        index: rec.chunks.map((c) => [c.data.byteLength, c.type, c.timestamp, c.duration]),
      });
    }
    const dc = result.decoderConfig;
    lastRender = {
      renderedPlan,
      renderedPlanHash: await hashScenePlan(renderedPlan),
      mp4: await addBlob(new Uint8Array(await result.mp4.arrayBuffer()), 'rendered MP4'),
      fps: result.fps,
      width: result.width,
      height: result.height,
      durationSec: result.durationSec,
      totalFrames: result.totalFrames,
      audioCodec: result.audioCodec,
      audioPcmHash: result.audioPcmHash,
      timing: result.timing,
      decoderConfig: {
        codec: dc.codec,
        codedWidth: dc.codedWidth,
        codedHeight: dc.codedHeight,
        description: dc.description ? await addBlob(toBytes(dc.description), 'decoder description') : undefined,
      },
      scenes,
      savedAt: Date.now(),
    };
    if (lastRender.renderedPlanHash !== result.planHash) {
      throw new ProjectStoreError('INVALID_PROJECT', 'lastRender.result was not rendered from lastRender.renderedPlan');
    }
  }

  const planHash = await hashScenePlan(input.plan);
  const savedAt = Date.now();
  const db = await openDB();
  try {
    const revision = await new Promise<number>((resolve, reject) => {
      let tx: IDBTransaction;
      try {
        tx = db.transaction([MANIFESTS, BLOBS], 'readwrite');
      } catch (err) {
        reject(new ProjectStoreError('STORAGE_FAILED', `Cannot start save: ${(err as Error).message}`));
        return;
      }
      let failure: ProjectStoreError | null = null;
      let nextRevision = 0;
      const manifests = tx.objectStore(MANIFESTS);
      const blobs = tx.objectStore(BLOBS);

      const current = manifests.get([workspaceId, projectId]);
      current.onsuccess = () => {
        const existing = current.result as ProjectManifestV1 | undefined;
        const stored = existing ? existing.revision : null;
        if (stored !== opts.expectedRevision) {
          failure = new ProjectStoreError(
            'REVISION_CONFLICT',
            `Project '${projectId}' is at revision ${stored ?? 'none'}, expected ${opts.expectedRevision ?? 'none'}`,
            { storedRevision: stored, expectedRevision: opts.expectedRevision },
          );
          tx.abort();
          return;
        }
        try {
          for (const [sha256, bytes] of pending) {
            const row: BlobRow = { key: blobKey(workspaceId, sha256), workspaceId, sha256, bytes: bytes.buffer as ArrayBuffer };
            blobs.put(row);
          }
          nextRevision = (stored ?? 0) + 1;
          const manifest: ProjectManifestV1 = {
            formatVersion: PROJECT_FORMAT_VERSION,
            workspaceId,
            projectId,
            revision: nextRevision,
            planHash,
            savedAt,
            plan: input.plan,
            takes,
            backgroundImages,
            audioAssets,
            exportConfig: { ...(input.exportConfig ?? {}) },
            lastRender,
          };
          manifests.put(manifest);
        } catch (err) {
          failure = new ProjectStoreError('STORAGE_FAILED', `Save failed: ${(err as Error).message}`);
          tx.abort();
        }
      };
      tx.oncomplete = () => resolve(nextRevision);
      tx.onabort = () =>
        reject(failure ?? new ProjectStoreError('STORAGE_FAILED', `Save aborted: ${tx.error?.message ?? 'unknown error'}`));
    });

    await collectGarbage(db, workspaceId).catch(() => {
      // Orphaned blobs only cost space; the committed project is consistent.
    });
    return { revision, planHash, savedAt, bytesWritten: projectBytes };
  } finally {
    db.close();
  }
}

function manifestRefs(m: ProjectManifestV1): BlobRef[] {
  const refs: BlobRef[] = [...m.takes.map((t) => t.pcm), ...m.backgroundImages.map((a) => a.data), ...m.audioAssets.map((a) => a.data)];
  if (m.lastRender) {
    refs.push(m.lastRender.mp4, ...m.lastRender.scenes.map((s) => s.chunks));
    if (m.lastRender.decoderConfig.description) refs.push(m.lastRender.decoderConfig.description);
  }
  return refs;
}

/** Delete blobs no manifest in the workspace references (one atomic pass). */
async function collectGarbage(db: IDBDatabase, workspaceId: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([MANIFESTS, BLOBS], 'readwrite');
    const range = IDBKeyRange.bound([workspaceId, ''], [workspaceId, '￿']);
    const mreq = tx.objectStore(MANIFESTS).getAll(range);
    mreq.onsuccess = () => {
      const live = new Set<string>();
      for (const m of mreq.result as ProjectManifestV1[]) for (const r of manifestRefs(m)) live.add(blobKey(workspaceId, r.sha256));
      const kreq = tx.objectStore(BLOBS).index('workspaceId').getAllKeys(IDBKeyRange.only(workspaceId));
      kreq.onsuccess = () => {
        for (const key of kreq.result as string[]) if (!live.has(key)) tx.objectStore(BLOBS).delete(key);
      };
    };
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
  });
}

// ─── Load ────────────────────────────────────────────────────────────────────

function readManifestAndBlobs(
  db: IDBDatabase,
  workspaceId: string,
  projectId: string,
): Promise<{ manifest: ProjectManifestV1 | undefined; blobs: Map<string, ArrayBuffer | undefined> }> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([MANIFESTS, BLOBS], 'readonly');
    const blobs = new Map<string, ArrayBuffer | undefined>();
    let manifest: ProjectManifestV1 | undefined;
    const mreq = tx.objectStore(MANIFESTS).get([workspaceId, projectId]);
    mreq.onsuccess = () => {
      manifest = mreq.result as ProjectManifestV1 | undefined;
      if (!manifest || manifest.formatVersion !== PROJECT_FORMAT_VERSION || !Array.isArray(manifest.takes)) return;
      for (const ref of manifestRefs(manifest)) {
        if (blobs.has(ref.sha256)) continue;
        blobs.set(ref.sha256, undefined);
        const breq = tx.objectStore(BLOBS).get(blobKey(workspaceId, ref.sha256));
        breq.onsuccess = () => blobs.set(ref.sha256, (breq.result as BlobRow | undefined)?.bytes);
      }
    };
    tx.oncomplete = () => resolve({ manifest, blobs });
    tx.onerror = () => reject(new ProjectStoreError('STORAGE_FAILED', `Load failed: ${tx.error?.message}`));
  });
}

/**
 * Load and verify a project. Pinned inputs (takes, images, audio) that are
 * missing or fail their hash raise MISSING_ASSET / CORRUPT_ASSET; a damaged
 * render cache is dropped with a warning.
 */
export async function loadProject(workspaceId: string, projectId: string): Promise<LoadedProject> {
  checkId('workspaceId', workspaceId);
  checkId('projectId', projectId);
  const db = await openDB();
  let read: Awaited<ReturnType<typeof readManifestAndBlobs>>;
  try {
    read = await readManifestAndBlobs(db, workspaceId, projectId);
  } finally {
    db.close();
  }
  const { manifest, blobs } = read;
  if (!manifest) throw new ProjectStoreError('NOT_FOUND', `No project '${projectId}' in workspace '${workspaceId}'`);
  if (typeof manifest.formatVersion !== 'number') {
    throw new ProjectStoreError('UNSUPPORTED_FORMAT', 'Stored project has no format version');
  }
  if (manifest.formatVersion !== PROJECT_FORMAT_VERSION) {
    throw new ProjectStoreError(
      'UNSUPPORTED_FORMAT',
      `Stored project format v${manifest.formatVersion} is not supported by this version (v${PROJECT_FORMAT_VERSION})`,
      { formatVersion: manifest.formatVersion },
    );
  }
  const validation = validateScenePlan(manifest.plan);
  if (!validation.ok) {
    throw new ProjectStoreError('INVALID_PROJECT', `Stored scene plan is invalid: ${validation.errors.slice(0, 5).join('; ')}`);
  }

  const verified = new Map<string, Uint8Array>();
  const verify = async (ref: BlobRef, label: string): Promise<Uint8Array> => {
    const cached = verified.get(ref.sha256);
    if (cached) return cached;
    const buf = blobs.get(ref.sha256);
    if (!buf) throw new ProjectStoreError('MISSING_ASSET', `${label} is missing from storage`, { sha256: ref.sha256 });
    const bytes = new Uint8Array(buf);
    if (bytes.byteLength !== ref.size || (await sha256Hex(bytes)) !== ref.sha256) {
      throw new ProjectStoreError('CORRUPT_ASSET', `${label} failed its integrity check`, { sha256: ref.sha256 });
    }
    verified.set(ref.sha256, bytes);
    return bytes;
  };

  const takes = new Map<string, VoiceTake>();
  for (const t of manifest.takes) {
    const bytes = await verify(t.pcm, `Voice take '${t.key}'`);
    const pcm = new Float32Array(bytes.slice().buffer);
    takes.set(t.key, {
      id: t.key,
      dialogueId: t.dialogueId,
      text: t.text,
      voiceProfileRef: t.voiceProfileRef,
      sampleRate: t.sampleRate,
      pcm,
      durationSec: t.durationSec,
      visemes: t.visemes,
      pcmHash: t.pcm.sha256,
    });
  }
  const backgroundImages = new Map<string, Blob>();
  for (const a of manifest.backgroundImages) {
    backgroundImages.set(a.ref, new Blob([(await verify(a.data, `Background image '${a.ref}'`)).slice()], { type: a.mime }));
  }
  const audioAssets = new Map<string, ArrayBuffer>();
  for (const a of manifest.audioAssets) {
    audioAssets.set(a.ref, (await verify(a.data, `Audio asset '${a.ref}'`)).slice().buffer);
  }

  const warnings: string[] = [];
  let lastRender: LoadedProject['lastRender'];
  if (manifest.lastRender) {
    try {
      lastRender = await restoreRender(manifest.lastRender, verify);
    } catch (err) {
      if (!(err instanceof ProjectStoreError)) throw err;
      warnings.push(`Last render was not restored (${err.code}: ${err.message}); the next render will be a full render.`);
    }
  }

  return {
    workspaceId,
    projectId,
    revision: manifest.revision,
    planHash: manifest.planHash,
    savedAt: manifest.savedAt,
    plan: manifest.plan,
    takes,
    backgroundImages,
    audioAssets,
    exportConfig: { ...manifest.exportConfig },
    lastRender,
    warnings,
  };
}

async function restoreRender(
  r: StoredRender,
  verify: (ref: BlobRef, label: string) => Promise<Uint8Array>,
): Promise<{ renderedPlan: ScenePlan; result: CartoonRenderResult }> {
  const mp4 = new Blob([(await verify(r.mp4, 'Rendered MP4')).slice()], { type: 'video/mp4' });
  const sceneRecords: SceneRenderRecord[] = [];
  for (const s of r.scenes) {
    const joined = await verify(s.chunks, `Render chunks for '${s.sceneId}'`);
    let off = 0;
    const chunks = s.index.map(([len, type, timestamp, duration]) => {
      const data = joined.slice(off, off + len);
      off += len;
      return { data, type, timestamp, duration };
    });
    if (off !== joined.byteLength) {
      throw new ProjectStoreError('CORRUPT_ASSET', `Render chunk index for '${s.sceneId}' does not match its bytes`);
    }
    sceneRecords.push({ sceneId: s.sceneId, contentHash: s.contentHash, startFrame: s.startFrame, frameCount: s.frameCount, chunks, frameHashes: [] });
  }
  const description = r.decoderConfig.description ? (await verify(r.decoderConfig.description, 'Decoder description')).slice() : undefined;
  return {
    renderedPlan: r.renderedPlan,
    result: {
      mp4,
      planHash: r.renderedPlanHash,
      fps: r.fps,
      width: r.width,
      height: r.height,
      durationSec: r.durationSec,
      totalFrames: r.totalFrames,
      audioCodec: r.audioCodec,
      audioPcmHash: r.audioPcmHash,
      timing: r.timing,
      decoderConfig: { ...r.decoderConfig, description },
      sceneRecords,
    } as CartoonRenderResult,
  };
}

// ─── Listing ─────────────────────────────────────────────────────────────────

export async function listProjects(workspaceId: string): Promise<ProjectSummary[]> {
  checkId('workspaceId', workspaceId);
  const db = await openDB();
  try {
    const rows = await new Promise<ProjectManifestV1[]>((resolve, reject) => {
      const tx = db.transaction(MANIFESTS, 'readonly');
      const req = tx.objectStore(MANIFESTS).getAll(IDBKeyRange.bound([workspaceId, ''], [workspaceId, '￿']));
      req.onsuccess = () => resolve(req.result as ProjectManifestV1[]);
      req.onerror = () => reject(new ProjectStoreError('STORAGE_FAILED', `List failed: ${req.error?.message}`));
    });
    return rows
      .map((m) => ({
        projectId: m.projectId,
        title: m.plan?.title ?? m.projectId,
        revision: m.revision,
        planHash: m.planHash,
        savedAt: m.savedAt,
        hasRender: Boolean(m.lastRender),
      }))
      .sort((a, b) => b.savedAt - a.savedAt);
  } finally {
    db.close();
  }
}

// ─── Portable backup bundle ──────────────────────────────────────────────────

const BUNDLE_MAGIC = new TextEncoder().encode('CCPROJ01');

/**
 * Export a project as one self-describing file:
 *   "CCPROJ01" | u32 LE manifest length | manifest JSON | blob bytes...
 * The manifest lists each blob's sha256/size/offset; import re-verifies them.
 */
export async function exportProjectBundle(workspaceId: string, projectId: string): Promise<Blob> {
  const project = await loadProject(workspaceId, projectId);
  const db = await openDB();
  let manifest: ProjectManifestV1 | undefined;
  let blobs: Map<string, ArrayBuffer | undefined>;
  try {
    ({ manifest, blobs } = await readManifestAndBlobs(db, workspaceId, projectId));
  } finally {
    db.close();
  }
  if (!manifest || manifest.revision !== project.revision) {
    throw new ProjectStoreError('REVISION_CONFLICT', 'Project changed while exporting; retry');
  }
  if (project.warnings.length) manifest = { ...manifest, lastRender: undefined };
  const order: Array<{ sha256: string; size: number; offset: number }> = [];
  let offset = 0;
  for (const ref of manifestRefs(manifest)) {
    if (order.some((o) => o.sha256 === ref.sha256)) continue;
    order.push({ sha256: ref.sha256, size: ref.size, offset });
    offset += ref.size;
  }
  const header = new TextEncoder().encode(JSON.stringify({ manifest, blobs: order }));
  const len = new Uint8Array(4);
  new DataView(len.buffer).setUint32(0, header.byteLength, true);
  const parts: BlobPart[] = [BUNDLE_MAGIC, len, header];
  for (const o of order) parts.push(new Uint8Array(blobs.get(o.sha256)!));
  return new Blob(parts, { type: 'application/x-contentine-project' });
}

/**
 * Import a bundle into `workspaceId`. Every blob is hash-verified before
 * anything is written; the project is created (expectedRevision null), so an
 * existing project with the same id is a REVISION_CONFLICT, not an overwrite.
 */
export async function importProjectBundle(bundle: Blob, workspaceId: string): Promise<SaveResult> {
  checkId('workspaceId', workspaceId);
  const bytes = new Uint8Array(await bundle.arrayBuffer());
  const magicOk = bytes.byteLength > 12 && BUNDLE_MAGIC.every((b, i) => bytes[i] === b);
  if (!magicOk) throw new ProjectStoreError('UNSUPPORTED_FORMAT', 'Not a Contentine project bundle');
  const headerLen = new DataView(bytes.buffer, bytes.byteOffset + 8, 4).getUint32(0, true);
  if (12 + headerLen > bytes.byteLength) throw new ProjectStoreError('CORRUPT_ASSET', 'Bundle header is truncated');
  let parsed: { manifest: ProjectManifestV1; blobs: Array<{ sha256: string; size: number; offset: number }> };
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes.subarray(12, 12 + headerLen)));
  } catch {
    throw new ProjectStoreError('CORRUPT_ASSET', 'Bundle header is not valid JSON');
  }
  const { manifest } = parsed;
  if (manifest?.formatVersion !== PROJECT_FORMAT_VERSION) {
    throw new ProjectStoreError('UNSUPPORTED_FORMAT', `Bundle format v${manifest?.formatVersion} is not supported`);
  }
  const base = 12 + headerLen;
  const data = new Map<string, Uint8Array>();
  for (const b of parsed.blobs) {
    const start = base + b.offset;
    if (start + b.size > bytes.byteLength) throw new ProjectStoreError('MISSING_ASSET', `Bundle blob ${b.sha256} is truncated`);
    const slice = bytes.slice(start, start + b.size);
    if ((await sha256Hex(slice)) !== b.sha256) throw new ProjectStoreError('CORRUPT_ASSET', `Bundle blob ${b.sha256} failed its integrity check`);
    data.set(b.sha256, slice);
  }
  const get = (ref: BlobRef, label: string): Uint8Array => {
    const d = data.get(ref.sha256);
    if (!d) throw new ProjectStoreError('MISSING_ASSET', `${label} is missing from the bundle`);
    return d;
  };

  const takes = new Map<string, VoiceTake>();
  for (const t of manifest.takes) {
    takes.set(t.key, {
      id: t.key, dialogueId: t.dialogueId, text: t.text, voiceProfileRef: t.voiceProfileRef,
      sampleRate: t.sampleRate, durationSec: t.durationSec, visemes: t.visemes, pcmHash: t.pcm.sha256,
      pcm: new Float32Array(get(t.pcm, `Voice take '${t.key}'`).slice().buffer),
    });
  }
  const backgroundImages = new Map(manifest.backgroundImages.map((a) => [a.ref, new Blob([get(a.data, a.ref).slice()], { type: a.mime })] as const));
  const audioAssets = new Map(manifest.audioAssets.map((a) => [a.ref, get(a.data, a.ref).slice().buffer] as const));
  let lastRender: ProjectInput['lastRender'];
  if (manifest.lastRender) {
    lastRender = await restoreRender(manifest.lastRender, async (ref, label) => get(ref, label));
  }
  return saveProject(
    { workspaceId, plan: manifest.plan, takes, backgroundImages, audioAssets, exportConfig: manifest.exportConfig, lastRender },
    { expectedRevision: null },
  );
}
