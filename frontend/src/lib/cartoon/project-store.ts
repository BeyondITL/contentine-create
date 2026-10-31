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
/**
 * IndexedDB schema version (independent of the manifest formatVersion).
 *  v1: manifests, blobs
 *  v2: + revisions (plan history for undo), commands (idempotency records),
 *        runs (render run lifecycle). Additive; v1 data is untouched.
 */
export const PROJECT_DB_VERSION = 2;
const MANIFESTS = 'manifests';
const BLOBS = 'blobs';
export const REVISIONS = 'revisions';
export const COMMANDS = 'commands';
export const RUNS = 'runs';

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
  /** Render settings identity; absent (older saves) ⇒ the cache is never spliced. */
  settingsKey?: string;
  scenes: Array<{
    sceneId: string;
    contentHash: string;
    /** Scene render identity; absent/null ⇒ that scene is always re-rendered. */
    renderKey?: string | null;
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

export function openProjectDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(PROJECT_DB_NAME, PROJECT_DB_VERSION);
    req.onupgradeneeded = () => {
      // Every step is additive and idempotent, so any older version upgrades
      // by running the steps it is missing.
      const db = req.result;
      if (!db.objectStoreNames.contains(MANIFESTS)) {
        db.createObjectStore(MANIFESTS, { keyPath: ['workspaceId', 'projectId'] });
      }
      if (!db.objectStoreNames.contains(BLOBS)) {
        const blobs = db.createObjectStore(BLOBS, { keyPath: 'key' });
        blobs.createIndex('workspaceId', 'workspaceId', { unique: false });
      }
      if (!db.objectStoreNames.contains(REVISIONS)) {
        db.createObjectStore(REVISIONS, { keyPath: ['workspaceId', 'projectId', 'revision'] });
      }
      if (!db.objectStoreNames.contains(COMMANDS)) {
        db.createObjectStore(COMMANDS, { keyPath: ['workspaceId', 'actorId', 'key'] });
      }
      if (!db.objectStoreNames.contains(RUNS)) {
        const runs = db.createObjectStore(RUNS, { keyPath: ['workspaceId', 'runId'] });
        runs.createIndex('project', ['workspaceId', 'projectId'], { unique: false });
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
  const collector = new BlobCollector();
  const addBlob = collector.add;
  const takes = await prepareTakes(input.takes, collector);

  const backgroundImages: StoredAsset[] = [];
  for (const [ref, blob] of backgrounds) {
    backgroundImages.push({ ref, mime: blob.type || 'application/octet-stream', data: await addBlob(new Uint8Array(await blob.arrayBuffer()), `background '${ref}'`) });
  }
  const audioAssets: StoredAsset[] = [];
  for (const [ref, buf] of audio) {
    audioAssets.push({ ref, mime: 'application/octet-stream', data: await addBlob(new Uint8Array(buf.slice(0)), `audio asset '${ref}'`) });
  }

  const lastRender = input.lastRender ? await prepareRender(input.lastRender, collector) : undefined;

  const planHash = await hashScenePlan(input.plan);
  const savedAt = Date.now();
  const db = await openProjectDB();
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
          failure = conflict(projectId, stored, opts.expectedRevision);
          tx.abort();
          return;
        }
        try {
          collector.putAll(blobs, workspaceId);
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
    return { revision, planHash, savedAt, bytesWritten: collector.bytes };
  } finally {
    db.close();
  }
}

function conflict(projectId: string, stored: number | null, expected: number | null): ProjectStoreError {
  return new ProjectStoreError(
    'REVISION_CONFLICT',
    `Project '${projectId}' is at revision ${stored ?? 'none'}, expected ${expected ?? 'none'}`,
    { storedRevision: stored, expectedRevision: expected },
  );
}

/** Hashes and bounds blobs before a transaction opens; writes them inside it. */
class BlobCollector {
  readonly pending = new Map<string, Uint8Array>();
  bytes = 0;

  add = async (bytes: Uint8Array, label: string): Promise<BlobRef> => {
    if (bytes.byteLength > PROJECT_LIMITS.maxBlobBytes) {
      throw new ProjectStoreError('LIMIT_EXCEEDED', `${label} is ${bytes.byteLength} bytes (limit ${PROJECT_LIMITS.maxBlobBytes})`);
    }
    const sha256 = await sha256Hex(bytes);
    if (!this.pending.has(sha256)) {
      this.pending.set(sha256, bytes);
      this.bytes += bytes.byteLength;
      if (this.bytes > PROJECT_LIMITS.maxProjectBytes) {
        throw new ProjectStoreError('LIMIT_EXCEEDED', `Project exceeds ${PROJECT_LIMITS.maxProjectBytes} bytes`);
      }
    }
    return { sha256, size: bytes.byteLength };
  };

  putAll(store: IDBObjectStore, workspaceId: string): void {
    for (const [sha256, bytes] of this.pending) {
      const exact = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength ? bytes : bytes.slice();
      const row: BlobRow = { key: blobKey(workspaceId, sha256), workspaceId, sha256, bytes: exact.buffer as ArrayBuffer };
      store.put(row);
    }
  }
}

async function prepareTakes(takes: Map<string, VoiceTake>, collector: BlobCollector): Promise<StoredTake[]> {
  const out: StoredTake[] = [];
  for (const [key, take] of takes) {
    const pcm = await collector.add(toBytes(take.pcm), `take '${key}'`);
    if (take.pcmHash && take.pcmHash !== pcm.sha256) {
      throw new ProjectStoreError('INVALID_PROJECT', `Take '${key}' pcmHash does not match its PCM bytes`);
    }
    out.push({
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
  return out;
}

async function prepareRender(
  input: { renderedPlan: ScenePlan; result: CartoonRenderResult },
  collector: BlobCollector,
): Promise<StoredRender> {
  const addBlob = collector.add;
  const { renderedPlan, result } = input;
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
      renderKey: rec.renderKey ?? null,
      startFrame: rec.startFrame,
      frameCount: rec.frameCount,
      chunks: await addBlob(joined, `render chunks for '${rec.sceneId}'`),
      index: rec.chunks.map((c) => [c.data.byteLength, c.type, c.timestamp, c.duration]),
    });
  }
  const dc = result.decoderConfig;
  const lastRender: StoredRender = {
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
    settingsKey: result.settingsKey,
    scenes,
    savedAt: Date.now(),
  };
  if (lastRender.renderedPlanHash !== result.planHash) {
    throw new ProjectStoreError('INVALID_PROJECT', 'lastRender.result was not rendered from lastRender.renderedPlan');
  }
  return lastRender;
}

function manifestRefs(m: ProjectManifestV1): BlobRef[] {
  const refs: BlobRef[] = [...m.takes.map((t) => t.pcm), ...m.backgroundImages.map((a) => a.data), ...m.audioAssets.map((a) => a.data)];
  if (m.lastRender) {
    refs.push(m.lastRender.mp4, ...m.lastRender.scenes.map((s) => s.chunks));
    if (m.lastRender.decoderConfig.description) refs.push(m.lastRender.decoderConfig.description);
  }
  return refs;
}

/** Delete blobs no manifest or run artifact in the workspace references (one atomic pass). */
async function collectGarbage(db: IDBDatabase, workspaceId: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([MANIFESTS, BLOBS, RUNS], 'readwrite');
    const range = IDBKeyRange.bound([workspaceId, ''], [workspaceId, '\uffff']);
    const live = new Set<string>();
    const mreq = tx.objectStore(MANIFESTS).getAll(range);
    mreq.onsuccess = () => {
      for (const m of mreq.result as ProjectManifestV1[]) for (const r of manifestRefs(m)) live.add(blobKey(workspaceId, r.sha256));
      const rreq = tx.objectStore(RUNS).getAll(range);
      rreq.onsuccess = () => {
        for (const run of rreq.result as StoredRunBase[]) if (run.artifact) live.add(blobKey(workspaceId, run.artifact.mp4.sha256));
        const kreq = tx.objectStore(BLOBS).index('workspaceId').getAllKeys(IDBKeyRange.only(workspaceId));
        kreq.onsuccess = () => {
          for (const key of kreq.result as string[]) if (!live.has(key)) tx.objectStore(BLOBS).delete(key);
        };
      };
    };
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
  });
}

// ─── Incremental updates (used by the commands layer) ────────────────────────

/** One plan revision, kept for history/undo. */
export interface RevisionRecord {
  workspaceId: string;
  projectId: string;
  revision: number;
  planHash: string;
  plan: ScenePlan;
  savedAt: number;
  actorId: string;
  note: string;
}

/** The fields of a stored run the store itself needs (GC, scoping). */
export interface StoredRunBase {
  workspaceId: string;
  runId: string;
  projectId: string;
  artifact?: { mp4: BlobRef };
}

/** A record written in the SAME transaction as a project change (e.g. an idempotency record). */
export type ExtraRecord = { store: typeof COMMANDS; value: { workspaceId: string; actorId: string; key: string } } | { store: typeof RUNS; value: StoredRunBase };

export interface ProjectUpdate {
  plan?: ScenePlan;
  /** Takes to add or replace, keyed by take key. */
  putTakes?: Map<string, VoiceTake>;
  actorId: string;
  note: string;
}

const ALL_STORES = [MANIFESTS, BLOBS, REVISIONS, COMMANDS, RUNS];

/**
 * Apply a plan and/or take change as ONE new revision, under compare-and-swap,
 * together with any `extras` (idempotency or run records) — all or nothing.
 * Assets and the render cache are kept; history gets the new revision.
 */
export async function updateProject(
  workspaceId: string,
  projectId: string,
  expectedRevision: number,
  update: ProjectUpdate,
  extras: ExtraRecord[] = [],
): Promise<SaveResult> {
  checkId('workspaceId', workspaceId);
  checkId('projectId', projectId);
  if (update.plan) {
    const validation = validateScenePlan(update.plan);
    if (!validation.ok) {
      throw new ProjectStoreError('INVALID_PROJECT', `Scene plan is invalid: ${validation.errors.slice(0, 5).join('; ')}`, { errors: validation.errors });
    }
    if (update.plan.id !== projectId) throw new ProjectStoreError('INVALID_PROJECT', 'plan.id cannot change');
  }
  const collector = new BlobCollector();
  const newTakes = update.putTakes ? await prepareTakes(update.putTakes, collector) : [];
  const planHash = update.plan ? await hashScenePlan(update.plan) : null;
  const savedAt = Date.now();

  const db = await openProjectDB();
  try {
    const out = await new Promise<{ revision: number; planHash: string }>((resolve, reject) => {
      const tx = db.transaction(ALL_STORES, 'readwrite');
      let failure: ProjectStoreError | null = null;
      let result = { revision: 0, planHash: '' };
      const manifests = tx.objectStore(MANIFESTS);
      const g = manifests.get([workspaceId, projectId]);
      g.onsuccess = () => {
        const m = g.result as ProjectManifestV1 | undefined;
        if (!m) {
          failure = new ProjectStoreError('NOT_FOUND', `No project '${projectId}' in workspace '${workspaceId}'`);
          tx.abort();
          return;
        }
        if (m.revision !== expectedRevision) {
          failure = conflict(projectId, m.revision, expectedRevision);
          tx.abort();
          return;
        }
        if (m.takes.length + newTakes.length > PROJECT_LIMITS.maxTakes) {
          failure = new ProjectStoreError('LIMIT_EXCEEDED', `Too many voice takes (limit ${PROJECT_LIMITS.maxTakes})`);
          tx.abort();
          return;
        }
        try {
          collector.putAll(tx.objectStore(BLOBS), workspaceId);
          const takeMap = new Map(m.takes.map((t) => [t.key, t]));
          for (const t of newTakes) takeMap.set(t.key, t);
          const next: ProjectManifestV1 = {
            ...m,
            revision: m.revision + 1,
            planHash: planHash ?? m.planHash,
            plan: update.plan ?? m.plan,
            takes: [...takeMap.values()],
            savedAt,
          };
          const history = tx.objectStore(REVISIONS);
          // Record the previous revision's plan if history doesn't have it yet
          // (the first update after a full save).
          const prev = history.get([workspaceId, projectId, m.revision]);
          prev.onsuccess = () => {
            if (!prev.result) {
              history.put({ workspaceId, projectId, revision: m.revision, planHash: m.planHash, plan: m.plan, savedAt: m.savedAt, actorId: 'unknown', note: 'saved project' } satisfies RevisionRecord);
            }
          };
          history.put({ workspaceId, projectId, revision: next.revision, planHash: next.planHash, plan: next.plan, savedAt, actorId: update.actorId, note: update.note } satisfies RevisionRecord);
          manifests.put(next);
          for (const e of extras) tx.objectStore(e.store).put(e.value);
          result = { revision: next.revision, planHash: next.planHash };
        } catch (err) {
          failure = new ProjectStoreError('STORAGE_FAILED', `Update failed: ${(err as Error).message}`);
          tx.abort();
        }
      };
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(failure ?? new ProjectStoreError('STORAGE_FAILED', `Update aborted: ${tx.error?.message ?? 'unknown error'}`));
    });
    await collectGarbage(db, workspaceId).catch(() => {});
    return { ...out, savedAt, bytesWritten: collector.bytes };
  } finally {
    db.close();
  }
}

/**
 * Atomically read-modify-write one run record, optionally storing its MP4
 * artifact bytes and a new render cache in the SAME transaction.
 * `mutate` gets the current record (and the artifact ref when bytes were
 * given) and returns the next record, or null to change nothing — e.g. when
 * the run was cancelled meanwhile; then no bytes or cache are written either.
 * The render cache (the basis for partial re-renders) is replaced by this
 * render unless the stored cache already matches the project's CURRENT plan
 * exactly and this one does not — a late-finishing older run never displaces
 * an exact cache.
 * Does not change the project revision.
 */
export async function updateRun<R extends StoredRunBase>(
  workspaceId: string,
  runId: string,
  mutate: (current: R | undefined, artifact?: BlobRef) => R | null,
  opts: { mp4?: Uint8Array; renderCache?: { renderedPlan: ScenePlan; result: CartoonRenderResult }; extras?: ExtraRecord[] } = {},
): Promise<{ run: R | undefined; applied: boolean; cacheUpdated: boolean }> {
  checkId('workspaceId', workspaceId);
  const collector = new BlobCollector();
  const artifact = opts.mp4 ? await collector.add(opts.mp4, 'run artifact') : undefined;
  const cache = opts.renderCache ? await prepareRender(opts.renderCache, collector) : undefined;
  const db = await openProjectDB();
  try {
    const out = await new Promise<{ run: R | undefined; applied: boolean; cacheUpdated: boolean }>((resolve, reject) => {
      const tx = db.transaction(ALL_STORES, 'readwrite');
      let state: { run: R | undefined; applied: boolean; cacheUpdated: boolean } = { run: undefined, applied: false, cacheUpdated: false };
      let failure: Error | null = null;
      const runs = tx.objectStore(RUNS);
      const g = runs.get([workspaceId, runId]);
      g.onsuccess = () => {
        const current = g.result as R | undefined;
        let next: R | null;
        try {
          next = mutate(current, artifact);
        } catch (err) {
          failure = err as Error;
          tx.abort();
          return;
        }
        if (!next) {
          state = { run: current, applied: false, cacheUpdated: false };
          return; // read-only transaction outcome; nothing written
        }
        if (next.workspaceId !== workspaceId || next.runId !== runId) {
          failure = new ProjectStoreError('INVALID_PROJECT', 'run identity cannot change');
          tx.abort();
          return;
        }
        collector.putAll(tx.objectStore(BLOBS), workspaceId);
        runs.put(next);
        for (const e of opts.extras ?? []) tx.objectStore(e.store).put(e.value);
        state = { run: next, applied: true, cacheUpdated: false };
        if (cache) {
          const manifests = tx.objectStore(MANIFESTS);
          const mg = manifests.get([workspaceId, next.projectId]);
          mg.onsuccess = () => {
            const m = mg.result as ProjectManifestV1 | undefined;
            const exactAlready = m?.lastRender?.renderedPlanHash === m?.planHash;
            if (m && (m.planHash === cache.renderedPlanHash || !exactAlready)) {
              manifests.put({ ...m, lastRender: cache });
              state = { ...state, cacheUpdated: true };
            }
          };
        }
      };
      tx.oncomplete = () => resolve(state);
      tx.onabort = () => reject(failure ?? new ProjectStoreError('STORAGE_FAILED', `Run update failed: ${tx.error?.message ?? 'aborted'}`));
    });
    if (out.applied && (cache || artifact)) await collectGarbage(db, workspaceId).catch(() => {});
    return out;
  } finally {
    db.close();
  }
}

/** Read a project's manifest without loading or verifying blobs (cheap; for inspection). */
export async function readManifest(workspaceId: string, projectId: string): Promise<ProjectManifestV1> {
  checkId('workspaceId', workspaceId);
  checkId('projectId', projectId);
  const db = await openProjectDB();
  try {
    const m = await new Promise<ProjectManifestV1 | undefined>((resolve, reject) => {
      const req = db.transaction(MANIFESTS, 'readonly').objectStore(MANIFESTS).get([workspaceId, projectId]);
      req.onsuccess = () => resolve(req.result as ProjectManifestV1 | undefined);
      req.onerror = () => reject(new ProjectStoreError('STORAGE_FAILED', `Read failed: ${req.error?.message}`));
    });
    if (!m) throw new ProjectStoreError('NOT_FOUND', `No project '${projectId}' in workspace '${workspaceId}'`);
    if (m.formatVersion !== PROJECT_FORMAT_VERSION) {
      throw new ProjectStoreError('UNSUPPORTED_FORMAT', `Stored project format v${String(m.formatVersion)} is not supported`);
    }
    return m;
  } finally {
    db.close();
  }
}

/** Read one record by primary key from a store (scoped reads only). */
export async function getRecord<T>(store: typeof COMMANDS | typeof RUNS | typeof REVISIONS, key: IDBValidKey): Promise<T | undefined> {
  const db = await openProjectDB();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const req = db.transaction(store, 'readonly').objectStore(store).get(key);
      req.onsuccess = () => resolve(req.result as T | undefined);
      req.onerror = () => reject(new ProjectStoreError('STORAGE_FAILED', `Read failed: ${req.error?.message}`));
    });
  } finally {
    db.close();
  }
}

/** Write records that are not tied to a project revision (e.g. a cancel's idempotency record + run state). */
export async function putRecords(records: ExtraRecord[]): Promise<void> {
  const db = await openProjectDB();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([COMMANDS, RUNS], 'readwrite');
      for (const r of records) tx.objectStore(r.store).put(r.value);
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(new ProjectStoreError('STORAGE_FAILED', `Write failed: ${tx.error?.message ?? 'aborted'}`));
    });
  } finally {
    db.close();
  }
}

/** All runs of a project (scoped by workspace). */
export async function listRuns<T extends StoredRunBase>(workspaceId: string, projectId: string): Promise<T[]> {
  const db = await openProjectDB();
  try {
    return await new Promise<T[]>((resolve, reject) => {
      const req = db.transaction(RUNS, 'readonly').objectStore(RUNS).index('project').getAll(IDBKeyRange.only([workspaceId, projectId]));
      req.onsuccess = () => resolve(req.result as T[]);
      req.onerror = () => reject(new ProjectStoreError('STORAGE_FAILED', `List runs failed: ${req.error?.message}`));
    });
  } finally {
    db.close();
  }
}

/**
 * Create a run exactly once, atomically: in ONE transaction, return the
 * existing idempotency record if the key was already used; otherwise refuse
 * when `maxActive` runs are active in the workspace; otherwise insert the run
 * and its idempotency record together. Concurrent duplicate deliveries
 * therefore yield one run.
 */
export async function insertRunOnce<R extends StoredRunBase, C extends { workspaceId: string; actorId: string; key: string }>(
  command: C,
  run: R,
  isActive: (r: R) => boolean,
  maxActive: number,
): Promise<{ status: 'created' } | { status: 'duplicate'; existing: C } | { status: 'busy'; active: R }> {
  const db = await openProjectDB();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction([COMMANDS, RUNS], 'readwrite');
      let out: { status: 'created' } | { status: 'duplicate'; existing: C } | { status: 'busy'; active: R } = { status: 'created' };
      const g = tx.objectStore(COMMANDS).get([command.workspaceId, command.actorId, command.key]);
      g.onsuccess = () => {
        if (g.result) {
          out = { status: 'duplicate', existing: g.result as C };
          return;
        }
        const all = tx.objectStore(RUNS).getAll(IDBKeyRange.bound([run.workspaceId, ''], [run.workspaceId, '\uffff']));
        all.onsuccess = () => {
          const active = (all.result as R[]).filter(isActive);
          if (active.length >= maxActive) {
            out = { status: 'busy', active: active[0] };
            return;
          }
          tx.objectStore(RUNS).put(run);
          tx.objectStore(COMMANDS).put(command);
        };
      };
      tx.oncomplete = () => resolve(out);
      tx.onabort = () => reject(new ProjectStoreError('STORAGE_FAILED', `Run creation failed: ${tx.error?.message ?? 'aborted'}`));
    });
  } finally {
    db.close();
  }
}

/** All runs in a workspace (for recovery and concurrency limits). */
export async function listRunsInWorkspace<T extends StoredRunBase>(workspaceId: string): Promise<T[]> {
  checkId('workspaceId', workspaceId);
  const db = await openProjectDB();
  try {
    return await new Promise<T[]>((resolve, reject) => {
      const req = db.transaction(RUNS, 'readonly').objectStore(RUNS).getAll(IDBKeyRange.bound([workspaceId, ''], [workspaceId, '\uffff']));
      req.onsuccess = () => resolve(req.result as T[]);
      req.onerror = () => reject(new ProjectStoreError('STORAGE_FAILED', `List runs failed: ${req.error?.message}`));
    });
  } finally {
    db.close();
  }
}

/** Read a run's artifact bytes, re-verifying the hash. */
export async function readArtifact(workspaceId: string, ref: BlobRef): Promise<Uint8Array> {
  const db = await openProjectDB();
  try {
    const row = await new Promise<BlobRow | undefined>((resolve, reject) => {
      const req = db.transaction(BLOBS, 'readonly').objectStore(BLOBS).get(blobKey(workspaceId, ref.sha256));
      req.onsuccess = () => resolve(req.result as BlobRow | undefined);
      req.onerror = () => reject(new ProjectStoreError('STORAGE_FAILED', `Read failed: ${req.error?.message}`));
    });
    if (!row) throw new ProjectStoreError('MISSING_ASSET', 'Artifact bytes are missing from storage', { sha256: ref.sha256 });
    const bytes = new Uint8Array(row.bytes);
    if (bytes.byteLength !== ref.size || (await sha256Hex(bytes)) !== ref.sha256) {
      throw new ProjectStoreError('CORRUPT_ASSET', 'Artifact failed its integrity check', { sha256: ref.sha256 });
    }
    return bytes;
  } finally {
    db.close();
  }
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
  const db = await openProjectDB();
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
    sceneRecords.push({ sceneId: s.sceneId, contentHash: s.contentHash, renderKey: s.renderKey ?? null, startFrame: s.startFrame, frameCount: s.frameCount, chunks, frameHashes: [] });
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
      settingsKey: r.settingsKey,
      sceneRecords,
    } as CartoonRenderResult,
  };
}

// ─── Listing ─────────────────────────────────────────────────────────────────

export async function listProjects(workspaceId: string): Promise<ProjectSummary[]> {
  checkId('workspaceId', workspaceId);
  const db = await openProjectDB();
  try {
    const rows = await new Promise<ProjectManifestV1[]>((resolve, reject) => {
      const tx = db.transaction(MANIFESTS, 'readonly');
      const req = tx.objectStore(MANIFESTS).getAll(IDBKeyRange.bound([workspaceId, ''], [workspaceId, '\uffff']));
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
  const db = await openProjectDB();
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
