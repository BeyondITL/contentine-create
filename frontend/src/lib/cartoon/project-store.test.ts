/**
 * Durable project store (format v1) — contract tests against fake-indexeddb.
 * The real-browser restart proof (A05/A06) lives in the C-M1 harness; these
 * pin the storage contract: round-trip, CAS, integrity, atomicity, scoping,
 * limits and the portable bundle.
 */
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildReferencePlan, buildEditedReferencePlan } from '@/engine/cartoon/harness/reference-plan';
import { hashScenePlan, sha256Hex } from '@/engine/cartoon/scene-plan';
import type { ScenePlan } from '@/engine/cartoon/scene-plan';
import type { VoiceTake } from '@/engine/cartoon/voice-takes';
import type { CartoonRenderResult } from '@/engine/cartoon/cartoon-renderer';
import {
  PROJECT_DB_NAME,
  PROJECT_LIMITS,
  ProjectStoreError,
  exportProjectBundle,
  importProjectBundle,
  listProjects,
  loadProject,
  saveProject,
  type ProjectInput,
} from './project-store';

const WS = 'ws-test';

beforeEach(() => {
  // A fresh, empty IndexedDB for every test.
  (globalThis as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
});

async function makeTake(key: string, text: string, voice: string, seed: number): Promise<VoiceTake> {
  const pcm = new Float32Array(2400);
  for (let i = 0; i < pcm.length; i++) pcm[i] = Math.sin((i + seed) / 7) * 0.5;
  return {
    id: key,
    dialogueId: key,
    text,
    voiceProfileRef: voice,
    sampleRate: 24000,
    pcm,
    durationSec: pcm.length / 24000,
    visemes: [{ time: 0, value: 'sil' } as VoiceTake['visemes'][number]],
    pcmHash: await sha256Hex(new Uint8Array(pcm.buffer)),
  };
}

async function takesFor(plan: ScenePlan): Promise<Map<string, VoiceTake>> {
  const takes = new Map<string, VoiceTake>();
  let seed = 0;
  for (const scene of plan.scenes) {
    for (const line of scene.dialogue) {
      takes.set(line.takeRef ?? line.id, await makeTake(line.takeRef ?? line.id, line.text, line.voiceProfileRef, seed++));
    }
  }
  return takes;
}

async function fakeRender(plan: ScenePlan): Promise<CartoonRenderResult> {
  return {
    mp4: new Blob([new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 1, 2, 3])], { type: 'video/mp4' }),
    planHash: await hashScenePlan(plan),
    fps: 30,
    width: 1920,
    height: 1080,
    durationSec: 1,
    totalFrames: 30,
    audioCodec: 'opus',
    audioPcmHash: 'a'.repeat(64),
    timing: { totalFrames: 30 } as unknown as CartoonRenderResult['timing'],
    decoderConfig: { codec: 'avc1.640028', codedWidth: 1920, codedHeight: 1080, description: new Uint8Array([1, 100, 0, 40]) },
    settingsKey: 's'.repeat(64),
    sceneRecords: plan.scenes.map((s, i) => ({
      sceneId: s.id,
      contentHash: `hash-${s.id}`,
      renderKey: i === 1 ? null : `key-${s.id}`,
      startFrame: i * 10,
      frameCount: 10,
      chunks: [
        { data: new Uint8Array([i, 1, 2, 3]), type: 'key' as const, timestamp: i * 1000, duration: 33333 },
        { data: new Uint8Array([i, 9]), type: 'delta' as const, timestamp: i * 1000 + 33333, duration: 33333 },
      ],
      frameHashes: [],
    })),
  } as CartoonRenderResult;
}

async function fullInput(plan = buildReferencePlan()): Promise<ProjectInput> {
  return {
    workspaceId: WS,
    plan,
    takes: await takesFor(plan),
    backgroundImages: new Map([['asset:bg-1', new Blob([new Uint8Array([137, 80, 78, 71, 5, 6])], { type: 'image/png' })]]),
    audioAssets: new Map([['asset:music', new Uint8Array([9, 8, 7, 6]).buffer]]),
    exportConfig: { bitrate: 8_000_000 },
    lastRender: { renderedPlan: plan, result: await fakeRender(plan) },
  };
}

async function expectCode(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toBeInstanceOf(ProjectStoreError);
  await expect(p).rejects.toMatchObject({ code });
}

/** Directly mutate a stored blob row (simulates disk damage / eviction). */
function mutateBlob(sha256: string, fn: (row: { bytes: ArrayBuffer } | undefined) => 'delete' | ArrayBuffer): Promise<void> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(PROJECT_DB_NAME);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction('blobs', 'readwrite');
      const store = tx.objectStore('blobs');
      const key = `${WS}/${sha256}`;
      const g = store.get(key);
      g.onsuccess = () => {
        const out = fn(g.result);
        if (out === 'delete') store.delete(key);
        else store.put({ ...g.result, bytes: out });
      };
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
    open.onerror = () => reject(open.error);
  });
}

describe('project-store v1', () => {
  it('round-trips plan, takes (bit-exact), assets, export config and the render cache', async () => {
    const input = await fullInput();
    const saved = await saveProject(input, { expectedRevision: null });
    expect(saved.revision).toBe(1);
    expect(saved.planHash).toBe(await hashScenePlan(input.plan));

    const loaded = await loadProject(WS, input.plan.id);
    expect(loaded.warnings).toEqual([]);
    expect(loaded.revision).toBe(1);
    expect(await hashScenePlan(loaded.plan)).toBe(saved.planHash);
    expect(loaded.exportConfig).toEqual({ bitrate: 8_000_000 });

    expect([...loaded.takes.keys()].sort()).toEqual([...input.takes.keys()].sort());
    for (const [key, take] of input.takes) {
      const got = loaded.takes.get(key)!;
      expect(got.pcmHash).toBe(take.pcmHash);
      expect(await sha256Hex(new Uint8Array(got.pcm.buffer))).toBe(take.pcmHash);
      expect(got.text).toBe(take.text);
      expect(got.voiceProfileRef).toBe(take.voiceProfileRef);
      expect(got.visemes).toEqual(take.visemes);
    }

    const bg = loaded.backgroundImages.get('asset:bg-1')!;
    expect(bg.type).toBe('image/png');
    expect([...new Uint8Array(await bg.arrayBuffer())]).toEqual([137, 80, 78, 71, 5, 6]);
    expect([...new Uint8Array(loaded.audioAssets.get('asset:music')!)]).toEqual([9, 8, 7, 6]);

    const r = loaded.lastRender!;
    const orig = input.lastRender!.result;
    expect(r.result.planHash).toBe(orig.planHash);
    expect([...new Uint8Array(await r.result.mp4.arrayBuffer())]).toEqual([...new Uint8Array(await orig.mp4.arrayBuffer())]);
    expect([...(r.result.decoderConfig.description as Uint8Array)]).toEqual([1, 100, 0, 40]);
    expect(r.result.settingsKey).toBe(orig.settingsKey);
    expect(r.result.sceneRecords.map((s) => ({ ...s, chunks: s.chunks.map((c) => ({ ...c, data: [...c.data] })) }))).toEqual(
      orig.sceneRecords.map((s) => ({ ...s, chunks: s.chunks.map((c) => ({ ...c, data: [...c.data] })) })),
    );
  });

  it('advances revisions with compare-and-swap and rejects stale writes without writing', async () => {
    const input = await fullInput();
    await saveProject(input, { expectedRevision: null });
    const edited = { ...input, plan: buildEditedReferencePlan(), lastRender: undefined };
    expect((await saveProject(edited, { expectedRevision: 1 })).revision).toBe(2);

    await expectCode(saveProject(input, { expectedRevision: 1 }), 'REVISION_CONFLICT');
    await expectCode(saveProject(input, { expectedRevision: null }), 'REVISION_CONFLICT');
    const loaded = await loadProject(WS, input.plan.id);
    expect(loaded.revision).toBe(2);
    expect(loaded.planHash).toBe(await hashScenePlan(buildEditedReferencePlan()));
    expect(loaded.lastRender).toBeUndefined();
  });

  it('reports a corrupted pinned voice take instead of loading or replacing it', async () => {
    const input = await fullInput();
    await saveProject(input, { expectedRevision: null });
    const victim = [...input.takes.values()][0];
    await mutateBlob(victim.pcmHash, (row) => {
      const b = new Uint8Array(row!.bytes.slice(0));
      b[10] ^= 0xff;
      return b.buffer;
    });
    await expectCode(loadProject(WS, input.plan.id), 'CORRUPT_ASSET');
  });

  it('reports a missing pinned asset', async () => {
    const input = await fullInput();
    await saveProject(input, { expectedRevision: null });
    const bgHash = await sha256Hex(new Uint8Array([137, 80, 78, 71, 5, 6]));
    await mutateBlob(bgHash, () => 'delete');
    await expectCode(loadProject(WS, input.plan.id), 'MISSING_ASSET');
  });

  it('drops only a damaged render cache, with a warning, and keeps the project', async () => {
    const input = await fullInput();
    await saveProject(input, { expectedRevision: null });
    const mp4Hash = await sha256Hex(new Uint8Array(await input.lastRender!.result.mp4.arrayBuffer()));
    await mutateBlob(mp4Hash, () => 'delete');
    const loaded = await loadProject(WS, input.plan.id);
    expect(loaded.lastRender).toBeUndefined();
    expect(loaded.warnings).toHaveLength(1);
    expect(loaded.warnings[0]).toMatch(/MISSING_ASSET.*full render/);
    expect(loaded.takes.size).toBe(input.takes.size);
  });

  it('an interrupted save leaves the previous revision intact and writes no partial state', async () => {
    const input = await fullInput();
    await saveProject(input, { expectedRevision: null });

    // Edit that adds a new take, then fail the manifest write after blobs were queued.
    const edited = { ...input, plan: buildEditedReferencePlan(), takes: new Map(input.takes), lastRender: undefined };
    const extra = await makeTake('extra', 'never stored', 'v', 999);
    edited.takes.set('extra', extra);
    const realPut = IDBObjectStore.prototype.put;
    const spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      if (this.name === 'manifests') throw new DOMException('Simulated quota exhaustion', 'QuotaExceededError');
      return realPut.call(this, value, key);
    });
    try {
      await expectCode(saveProject(edited, { expectedRevision: 1 }), 'STORAGE_FAILED');
    } finally {
      spy.mockRestore();
    }

    const loaded = await loadProject(WS, input.plan.id);
    expect(loaded.revision).toBe(1);
    expect(loaded.planHash).toBe(await hashScenePlan(input.plan));
    expect(loaded.takes.has('extra')).toBe(false);
    expect(loaded.lastRender).toBeDefined();
    // The new take's bytes were rolled back with the transaction.
    let present = true;
    await mutateBlob(extra.pcmHash, (row) => {
      present = row !== undefined;
      return 'delete';
    });
    expect(present).toBe(false);
  });

  it('scopes projects by workspace', async () => {
    const input = await fullInput();
    await saveProject(input, { expectedRevision: null });
    await expectCode(loadProject('other-ws', input.plan.id), 'NOT_FOUND');
    expect(await listProjects('other-ws')).toEqual([]);
    const list = await listProjects(WS);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ projectId: input.plan.id, revision: 1, hasRender: true });
  });

  it('keeps identical content isolated per workspace (no shared blob rows across workspaces)', async () => {
    const input = await fullInput();
    await saveProject(input, { expectedRevision: null });
    await saveProject({ ...input, workspaceId: 'ws-b' }, { expectedRevision: null });
    // Replace every take in ws-b and delete its old bytes via GC; ws-test must be unaffected.
    const replaced = new Map<string, VoiceTake>();
    let seed = 5000;
    for (const [k, t] of input.takes) replaced.set(k, await makeTake(k, t.text, t.voiceProfileRef, seed++));
    await saveProject({ ...input, workspaceId: 'ws-b', takes: replaced, backgroundImages: new Map(), audioAssets: new Map(), lastRender: undefined }, { expectedRevision: 1 });
    const a = await loadProject(WS, input.plan.id);
    expect(a.warnings).toEqual([]);
    expect(a.takes.size).toBe(input.takes.size);
    expect(a.backgroundImages.size).toBe(1);
  });

  it('garbage-collects blobs no longer referenced', async () => {
    const input = await fullInput();
    await saveProject(input, { expectedRevision: null });
    const victim = [...input.takes.keys()][0];
    const oldHash = input.takes.get(victim)!.pcmHash;
    const replaced = new Map(input.takes);
    replaced.set(victim, await makeTake(victim, input.takes.get(victim)!.text, input.takes.get(victim)!.voiceProfileRef, 4242));
    await saveProject({ ...input, takes: replaced }, { expectedRevision: 1 });
    let present = true;
    await mutateBlob(oldHash, (row) => {
      present = row !== undefined;
      return 'delete';
    });
    expect(present).toBe(false);
  });

  it('validates input and enforces limits before writing', async () => {
    const input = await fullInput();
    await expectCode(saveProject({ ...input, plan: { ...input.plan, version: 99 } as unknown as ScenePlan }, { expectedRevision: null }), 'INVALID_PROJECT');
    await expectCode(saveProject({ ...input, workspaceId: '' }, { expectedRevision: null }), 'INVALID_PROJECT');

    const bad = new Map(input.takes);
    const first = [...bad.keys()][0];
    bad.set(first, { ...bad.get(first)!, pcmHash: 'f'.repeat(64) });
    await expectCode(saveProject({ ...input, takes: bad }, { expectedRevision: null }), 'INVALID_PROJECT');

    const tooMany = new Map<string, Blob>();
    for (let i = 0; i <= PROJECT_LIMITS.maxAssets; i++) tooMany.set(`asset:${i}`, new Blob([new Uint8Array([i & 255])]));
    await expectCode(saveProject({ ...input, backgroundImages: tooMany }, { expectedRevision: null }), 'LIMIT_EXCEEDED');

    const mismatched = { ...input, lastRender: { renderedPlan: buildEditedReferencePlan(), result: input.lastRender!.result } };
    await expectCode(saveProject(mismatched, { expectedRevision: null }), 'INVALID_PROJECT');

    await expectCode(loadProject(WS, input.plan.id), 'NOT_FOUND');
  });

  it('refuses an unknown stored format version', async () => {
    const input = await fullInput();
    await saveProject(input, { expectedRevision: null });
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open(PROJECT_DB_NAME);
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction('manifests', 'readwrite');
        const s = tx.objectStore('manifests');
        const g = s.get([WS, input.plan.id]);
        g.onsuccess = () => s.put({ ...g.result, formatVersion: 2 });
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
    });
    await expectCode(loadProject(WS, input.plan.id), 'UNSUPPORTED_FORMAT');
  });

  it('exports a portable bundle that imports bit-exact into another workspace, and rejects tampering', async () => {
    const input = await fullInput();
    await saveProject(input, { expectedRevision: null });
    const bundle = await exportProjectBundle(WS, input.plan.id);

    const imported = await importProjectBundle(bundle, 'ws-restore');
    expect(imported.revision).toBe(1);
    const a = await loadProject(WS, input.plan.id);
    const b = await loadProject('ws-restore', input.plan.id);
    expect(b.planHash).toBe(a.planHash);
    expect([...b.takes.values()].map((t) => t.pcmHash).sort()).toEqual([...a.takes.values()].map((t) => t.pcmHash).sort());
    expect(b.lastRender?.result.planHash).toBe(a.lastRender?.result.planHash);

    // Importing over an existing project is a conflict, not an overwrite.
    await expectCode(importProjectBundle(bundle, 'ws-restore'), 'REVISION_CONFLICT');

    const bytes = new Uint8Array(await bundle.arrayBuffer());
    bytes[bytes.length - 1] ^= 0xff;
    await expectCode(importProjectBundle(new Blob([bytes]), 'ws-tamper'), 'CORRUPT_ASSET');
    await expectCode(importProjectBundle(new Blob([new Uint8Array(20)]), 'ws-tamper'), 'UNSUPPORTED_FORMAT');
    await expectCode(loadProject('ws-tamper', input.plan.id), 'NOT_FOUND');
  });
});

describe('versioned sample', () => {
  it('samples/cartoon/dot-and-dash.plan.json is the reference plan and imports as a new project', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const { canonicalJson, validateScenePlan } = await import('@/engine/cartoon/scene-plan');
    const { importScenePlan } = await import('./project-store');
    const json = fs.readFileSync(path.resolve(__dirname, '../../../../samples/cartoon/dot-and-dash.plan.json'), 'utf8');
    expect(canonicalJson(JSON.parse(json))).toBe(canonicalJson(buildReferencePlan()));
    expect(validateScenePlan(JSON.parse(json)).ok).toBe(true);
    const saved = await importScenePlan(json, WS);
    expect(saved.revision).toBe(1);
    const loaded = await loadProject(WS, 'c-m1-reference');
    expect(loaded.takes.size).toBe(0);
    expect(loaded.lastRender).toBeUndefined();
    await expectCode(importScenePlan(json, WS), 'REVISION_CONFLICT');
    await expectCode(importScenePlan('{"version":1}', WS), 'INVALID_PROJECT');
    await expectCode(importScenePlan('not json', WS), 'INVALID_PROJECT');
  });
});
