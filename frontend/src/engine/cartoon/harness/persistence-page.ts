/**
 * Contentine Create — Cartoon Engine: project persistence harness (page side)
 *
 * Proves the durable project store in a real browser across a full browser
 * restart (acceptance A05) and under injected storage failures (A06).
 * Driven by harness/run-persistence.mjs, which launches Chrome, runs
 * `create`, QUITS the browser, relaunches it on the same profile and runs
 * `reopen` then `failures`.
 */

import { buildReferencePlan, buildEditedReferencePlan } from './reference-plan';
import { renderCartoonProject, rerenderEditedProject, type CartoonRenderOptions } from '../cartoon-renderer';
import { synthesizeTakes } from '../voice-takes';
import { probeMp4, type Mp4Probe } from '../mp4-probe';
import { sha256Hex } from '../scene-plan';
import {
  saveProject,
  loadProject,
  listProjects,
  exportProjectBundle,
  importProjectBundle,
  PROJECT_DB_NAME,
  ProjectStoreError,
} from '@/lib/cartoon/project-store';

export const WORKSPACE = 'harness-ws';

function log(msg: string): void {
  console.log(`[persist] ${msg}`);
}

async function upload(name: string, blob: Blob): Promise<void> {
  const res = await fetch(`/artifact/${name}`, { method: 'PUT', body: blob });
  if (!res.ok) throw new Error(`artifact upload failed for ${name}: ${res.status}`);
  log(`uploaded ${name} (${(blob.size / 1024 / 1024).toFixed(2)} MB)`);
}

const renderOptions = (takes: CartoonRenderOptions['takes']): CartoonRenderOptions => ({
  takes,
  collectFrameHashes: true,
  workerUrl: '/render-worker.js',
  onPhaseChange: (phase, message) => log(`${phase}: ${message}`),
});

async function sha(blob: Blob): Promise<string> {
  return sha256Hex(new Uint8Array(await blob.arrayBuffer()));
}

export interface CreateEvidence {
  userAgent: string;
  projectId: string;
  revision: number;
  planHash: string;
  takes: Record<string, string>;
  ttsCalls: number;
  sceneWindows: Array<{ sceneId: string; startFrame: number; frameCount: number }>;
  frameHashes: string[];
  audioPcmHash: string;
  mp4Sha256: string;
  bytesWritten: number;
  storageEstimate: { usage?: number; quota?: number };
  probe: Mp4Probe;
}

/** Session 1: voice, render, save. */
async function create(): Promise<CreateEvidence> {
  const plan = buildReferencePlan();
  let ttsCalls = 0;
  const takes = await synthesizeTakes(plan, undefined, (done, total, text) => {
    if (text) ttsCalls++;
    log(`take ${done}/${total}`);
  });
  const r = await renderCartoonProject(plan, renderOptions(takes));
  log(`rendered ${r.totalFrames} frames`);
  const saved = await saveProject(
    { workspaceId: WORKSPACE, plan, takes, exportConfig: {}, lastRender: { renderedPlan: plan, result: r } },
    { expectedRevision: null },
  );
  log(`saved revision ${saved.revision} (${(saved.bytesWritten / 1024 / 1024).toFixed(2)} MB)`);
  await upload('session1-render.mp4', r.mp4);
  const est = navigator.storage?.estimate ? await navigator.storage.estimate() : {};
  return {
    userAgent: navigator.userAgent,
    projectId: plan.id,
    revision: saved.revision,
    planHash: saved.planHash,
    takes: Object.fromEntries([...takes].map(([k, t]) => [k, t.pcmHash])),
    ttsCalls,
    sceneWindows: r.timing.scenes.map((w) => ({ sceneId: w.sceneId, startFrame: w.startFrame, frameCount: w.frameCount })),
    frameHashes: r.frameHashes ?? [],
    audioPcmHash: r.audioPcmHash,
    mp4Sha256: await sha(r.mp4),
    bytesWritten: saved.bytesWritten,
    storageEstimate: { usage: est.usage, quota: est.quota },
    probe: await probeMp4(r.mp4),
  };
}

export interface ReopenEvidence {
  userAgent: string;
  listed: Array<{ projectId: string; revision: number; hasRender: boolean }>;
  loaded: { revision: number; planHash: string; takes: Record<string, string>; warnings: string[]; lastRenderMp4Sha256: string | null };
  ttsCallsAfterReopen: number;
  restoredFullRender: { frameHashes: string[]; audioPcmHash: string; probe: Mp4Probe };
  partial: { mode: string; rerenderedScenes: string[]; reusedScenes: string[]; fullRenderReason?: string; probe: Mp4Probe };
  savedEditRevision: number;
}

/** Session 2 (after a full browser restart): reopen, verify, export, edit. */
async function reopen(): Promise<ReopenEvidence> {
  const listed = await listProjects(WORKSPACE);
  const projectId = buildReferencePlan().id;
  const p = await loadProject(WORKSPACE, projectId);
  log(`loaded revision ${p.revision}, ${p.takes.size} takes, render=${Boolean(p.lastRender)} warnings=${p.warnings.length}`);

  // Recompute every take hash from the restored PCM, don't trust the stored field.
  const takes: Record<string, string> = {};
  for (const [k, t] of p.takes) takes[k] = await sha256Hex(new Uint8Array(t.pcm.buffer, t.pcm.byteOffset, t.pcm.byteLength));

  let ttsCallsAfterReopen = 0;
  const voiced = await synthesizeTakes(p.plan, p.takes, (_d, _t, text) => {
    if (text) ttsCallsAfterReopen++;
  });

  log('full render from restored state...');
  const full = await renderCartoonProject(p.plan, renderOptions(voiced));
  await upload('session2-restored-full.mp4', full.mp4);

  log('partial re-render from restored render cache...');
  const edited = buildEditedReferencePlan();
  const partial = await rerenderEditedProject(p.plan, p.lastRender!.result, edited, renderOptions(voiced));
  await upload('session2-restored-edited.mp4', partial.result.mp4);
  log(`partial mode=${partial.partial.mode} rerendered=${partial.partial.rerenderedScenes.join(',')}`);

  const saved = await saveProject(
    { workspaceId: WORKSPACE, plan: edited, takes: voiced, exportConfig: p.exportConfig, lastRender: { renderedPlan: edited, result: partial.result } },
    { expectedRevision: p.revision },
  );

  return {
    userAgent: navigator.userAgent,
    listed: listed.map((s) => ({ projectId: s.projectId, revision: s.revision, hasRender: s.hasRender })),
    loaded: {
      revision: p.revision,
      planHash: p.planHash,
      takes,
      warnings: p.warnings,
      lastRenderMp4Sha256: p.lastRender ? await sha(p.lastRender.result.mp4) : null,
    },
    ttsCallsAfterReopen,
    restoredFullRender: { frameHashes: full.frameHashes ?? [], audioPcmHash: full.audioPcmHash, probe: await probeMp4(full.mp4) },
    partial: { ...partial.partial, probe: await probeMp4(partial.result.mp4) },
    savedEditRevision: saved.revision,
  };
}

export interface FailureCase {
  case: string;
  expected: string;
  observed: string;
  pass: boolean;
  detail?: string;
}

const codeOf = (err: unknown) => (err instanceof ProjectStoreError ? err.code : `non-store error: ${String(err)}`);

/** Session 2, continued: injected failures against the real IndexedDB. */
async function failures(): Promise<FailureCase[]> {
  const out: FailureCase[] = [];
  const projectId = buildReferencePlan().id;
  const before = await loadProject(WORKSPACE, projectId);

  // F1 — stale writer (another tab saved first).
  try {
    await saveProject({ workspaceId: WORKSPACE, plan: before.plan, takes: before.takes }, { expectedRevision: before.revision - 1 });
    out.push({ case: 'stale-revision-save', expected: 'REVISION_CONFLICT', observed: 'saved', pass: false });
  } catch (err) {
    out.push({ case: 'stale-revision-save', expected: 'REVISION_CONFLICT', observed: codeOf(err), pass: codeOf(err) === 'REVISION_CONFLICT' });
  }

  // F2 — write failure mid-transaction (quota-style) must leave the last good revision.
  const realPut = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
    if (this.name === 'manifests') throw new DOMException('Injected quota failure', 'QuotaExceededError');
    return realPut.call(this, value, key);
  } as typeof realPut;
  let f2: string;
  try {
    const mutated = { ...before.plan, title: `${before.plan.title} (unsaved)` };
    await saveProject({ workspaceId: WORKSPACE, plan: mutated, takes: before.takes }, { expectedRevision: before.revision });
    f2 = 'saved';
  } catch (err) {
    f2 = codeOf(err);
  } finally {
    IDBObjectStore.prototype.put = realPut;
  }
  const after = await loadProject(WORKSPACE, projectId);
  const intact = after.revision === before.revision && after.planHash === before.planHash && Boolean(after.lastRender);
  out.push({
    case: 'manifest-write-failure',
    expected: 'STORAGE_FAILED and previous revision intact',
    observed: `${f2}; revision ${after.revision}, planHash ${after.planHash === before.planHash ? 'unchanged' : 'CHANGED'}`,
    pass: f2 === 'STORAGE_FAILED' && intact,
  });

  // Damage cases run on a copy in a scratch workspace (import a verified bundle).
  const bundle = await exportProjectBundle(WORKSPACE, projectId);
  const scratch = 'harness-ws-damage';
  await importProjectBundle(bundle, scratch);
  const firstTake = [...after.takes.values()][0];
  const mp4Sha = await sha(after.lastRender!.result.mp4);
  const damage = (sha256: string, mode: 'flip' | 'delete') =>
    new Promise<void>((resolve, reject) => {
      const open = indexedDB.open(PROJECT_DB_NAME);
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction('blobs', 'readwrite');
        const store = tx.objectStore('blobs');
        const key = `${scratch}/${sha256}`;
        const g = store.get(key);
        g.onsuccess = () => {
          if (mode === 'delete') store.delete(key);
          else {
            const b = new Uint8Array((g.result.bytes as ArrayBuffer).slice(0));
            b[b.length >> 1] ^= 0xff;
            store.put({ ...g.result, bytes: b.buffer });
          }
        };
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
      open.onerror = () => reject(open.error);
    });

  // F3 — evicted render cache: project still opens, with a warning, no render.
  await damage(mp4Sha, 'delete');
  try {
    const p = await loadProject(scratch, projectId);
    out.push({
      case: 'render-cache-evicted',
      expected: 'loads with warning, no lastRender',
      observed: `loaded; lastRender=${Boolean(p.lastRender)}; warnings=${p.warnings.length}`,
      pass: !p.lastRender && p.warnings.length === 1 && p.takes.size === after.takes.size,
      detail: p.warnings[0],
    });
  } catch (err) {
    out.push({ case: 'render-cache-evicted', expected: 'loads with warning, no lastRender', observed: codeOf(err), pass: false });
  }

  // F4 — bit-rot in a pinned voice take: refuse to load, never re-synthesize silently.
  await damage(firstTake.pcmHash, 'flip');
  try {
    await loadProject(scratch, projectId);
    out.push({ case: 'voice-take-corrupted', expected: 'CORRUPT_ASSET', observed: 'loaded', pass: false });
  } catch (err) {
    out.push({ case: 'voice-take-corrupted', expected: 'CORRUPT_ASSET', observed: codeOf(err), pass: codeOf(err) === 'CORRUPT_ASSET' });
  }

  // F5 — pinned take missing entirely.
  await damage(firstTake.pcmHash, 'delete');
  try {
    await loadProject(scratch, projectId);
    out.push({ case: 'voice-take-missing', expected: 'MISSING_ASSET', observed: 'loaded', pass: false });
  } catch (err) {
    out.push({ case: 'voice-take-missing', expected: 'MISSING_ASSET', observed: codeOf(err), pass: codeOf(err) === 'MISSING_ASSET' });
  }

  // F6 — damage in one workspace never reaches another.
  const original = await loadProject(WORKSPACE, projectId);
  out.push({
    case: 'workspace-isolation',
    expected: 'original workspace still loads clean',
    observed: `revision ${original.revision}, warnings ${original.warnings.length}`,
    pass: original.revision === before.revision && original.warnings.length === 0,
  });

  // F7 — tampered backup bundle is rejected before anything is written.
  const bytes = new Uint8Array(await bundle.arrayBuffer());
  bytes[bytes.length - 5] ^= 0xff;
  try {
    await importProjectBundle(new Blob([bytes]), 'harness-ws-tamper');
    out.push({ case: 'tampered-bundle', expected: 'CORRUPT_ASSET', observed: 'imported', pass: false });
  } catch (err) {
    let wrote = true;
    try { await loadProject('harness-ws-tamper', projectId); } catch (e) { wrote = codeOf(e) !== 'NOT_FOUND'; }
    out.push({ case: 'tampered-bundle', expected: 'CORRUPT_ASSET, nothing written', observed: `${codeOf(err)}; written=${wrote}`, pass: codeOf(err) === 'CORRUPT_ASSET' && !wrote });
  }

  await upload('project-bundle.ccproj', bundle);
  return out;
}

declare global {
  interface Window {
    __persist: { create: typeof create; reopen: typeof reopen; failures: typeof failures };
  }
}

window.__persist = { create, reopen, failures };
log('harness ready');
