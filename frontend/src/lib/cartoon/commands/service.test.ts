/**
 * Contract tests for the shared command layer (verification class:
 * contract_test). Storage is real code on fake-indexeddb; the renderer and
 * voice engine are FAKE ports — the real-browser run lives in
 * harness/run-commands.mjs.
 */
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildReferencePlan } from '@/engine/cartoon/harness/reference-plan';
import { hashScenePlan, hashScene, sha256Hex, type DialogueLine, type ScenePlan } from '@/engine/cartoon/scene-plan';
import { computePlanTiming, takeKeyForLine } from '@/engine/cartoon/timing';
import type { VoiceTake } from '@/engine/cartoon/voice-takes';
import type { CartoonRenderResult } from '@/engine/cartoon/cartoon-renderer';
import { saveProject, getRecord, putRecords, readManifest, REVISIONS, RUNS, type RevisionRecord } from '@/lib/cartoon/project-store';
import { CartoonCommandService, type CommandContext, type RenderRequest, type RendererPort, type RunRecord, type VoicePort } from './service';
import { CommandError } from './errors';

const WS = 'ws-cmd';
const plan0 = buildReferencePlan();
const PID = plan0.id;
const duo = plan0.scenes.find((s) => s.id === 'scene-duo')!;
const charB = duo.characters[1].instanceId;
const moveB = (x: number) => [{ op: 'replace', path: `/scenes/@scene-duo/characters/@${charB}/position/x`, value: x }];

async function fakeTake(line: DialogueLine): Promise<VoiceTake> {
  const n = 2400 + line.text.length * 10;
  const pcm = new Float32Array(n);
  let seed = 0;
  for (const ch of `${line.text}|${line.voiceProfileRef}`) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  for (let i = 0; i < n; i++) pcm[i] = Math.sin((i + seed) / 9) * 0.4;
  return {
    id: takeKeyForLine(line), dialogueId: line.id, text: line.text, voiceProfileRef: line.voiceProfileRef,
    sampleRate: 24000, pcm, durationSec: n / 24000, visemes: [], pcmHash: await sha256Hex(new Uint8Array(pcm.buffer)),
  };
}

class FakeVoice implements VoicePort {
  calls: string[][] = [];
  supports(ref: string) { return ref.startsWith('kokoro:'); }
  async synthesize(lines: DialogueLine[]) {
    this.calls.push(lines.map((l) => l.id));
    return new Map(await Promise.all(lines.map(async (l) => [takeKeyForLine(l), await fakeTake(l)] as const)));
  }
}

class FakeRenderer implements RendererPort {
  ok = true;
  hold: Promise<void> | null = null;
  release: () => void = () => {};
  badOutput = false;
  ignoreAbort = false;
  renders: Array<{ planHash: string; previous: boolean }> = [];
  holdNext() { this.hold = new Promise((r) => { this.release = r; }); }
  async available() { return this.ok ? { ok: true } : { ok: false, reason: 'no browser renderer paired' }; }
  async render(req: RenderRequest) {
    const planHash = await hashScenePlan(req.plan);
    this.renders.push({ planHash, previous: Boolean(req.previous) });
    if (this.hold) {
      const h = this.hold;
      this.hold = null;
      if (this.ignoreAbort) await h;
      else await Promise.race([h, new Promise((_, rej) => req.signal.addEventListener('abort', () => rej(new DOMException('Render cancelled', 'AbortError'))))]);
    }
    const timing = computePlanTiming(req.plan, new Map([...req.takes].map(([k, t]) => [k, t.durationSec])));
    const result = {
      mp4: new Blob([new TextEncoder().encode(`mp4:${planHash}`)], { type: 'video/mp4' }),
      planHash, fps: req.plan.fps, width: req.plan.resolution.width, height: req.plan.resolution.height,
      durationSec: timing.totalDuration, totalFrames: timing.totalFrames, audioCodec: 'opus', audioPcmHash: 'p'.repeat(64), timing,
      decoderConfig: { codec: 'avc1.42001f', codedWidth: req.plan.resolution.width, codedHeight: req.plan.resolution.height },
      settingsKey: 'k'.repeat(64),
      sceneRecords: await Promise.all(req.plan.scenes.map(async (s, i) => ({
        sceneId: s.id, contentHash: await hashScene(s), renderKey: `rk-${i}`, startFrame: timing.scenes[i].startFrame,
        frameCount: timing.scenes[i].frameCount, chunks: [{ data: new Uint8Array([i, 1]), type: 'key' as const, timestamp: 0, duration: 1 }], frameHashes: [],
      }))),
    } as CartoonRenderResult;
    return { result, partial: { mode: req.previous ? 'partial' as const : 'full' as const, rerenderedScenes: ['scene-duo'], rerenderedFrameRanges: [], reusedScenes: [] } };
  }
  async verify(mp4: Blob) {
    const text = await mp4.text();
    void text;
    return this.badOutput ? { hasVideo: true, hasAudio: false, durationSec: 0 } : { hasVideo: true, hasAudio: true, durationSec: this.lastDuration };
  }
  lastDuration = 0;
}

let voice: FakeVoice;
let renderer: FakeRenderer;
let svc: CartoonCommandService;

const owner: CommandContext = { actor: { id: 'owner', kind: 'user' }, workspaceId: WS, projects: '*', permissions: new Set(['read', 'edit', 'voice', 'render']), requestId: 'r1' };
const assistant: CommandContext = { actor: { id: 'claude-session-1', kind: 'assistant' }, workspaceId: WS, projects: new Set([PID]), permissions: new Set(['read', 'edit', 'voice', 'render']), requestId: 'r2' };

async function errCode(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'NO_ERROR';
  } catch (err) {
    if (err instanceof CommandError) return err.code;
    throw err;
  }
}

async function seed(plan: ScenePlan = plan0) {
  const takes = new Map<string, VoiceTake>();
  for (const s of plan.scenes) for (const d of s.dialogue) takes.set(takeKeyForLine(d), await fakeTake(d));
  await saveProject({ workspaceId: WS, plan, takes }, { expectedRevision: null });
  const timing = computePlanTiming(plan, new Map([...takes].map(([k, t]) => [k, t.durationSec])));
  renderer.lastDuration = timing.totalDuration;
}

beforeEach(async () => {
  (globalThis as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
  voice = new FakeVoice();
  renderer = new FakeRenderer();
  svc = new CartoonCommandService({ renderer, voice, limits: { rendererWaitMs: 300, heartbeatMs: 20, staleRunMs: 1000 } });
  await seed();
});

describe('authorization and scope', () => {
  it('a project id in the request is not authority', async () => {
    const other: CommandContext = { ...assistant, projects: new Set(['some-other-project']) };
    expect(await errCode(svc.projectInspect(other, { projectId: PID }))).toBe('FORBIDDEN');
    const readOnly: CommandContext = { ...assistant, permissions: new Set(['read']) };
    expect(await errCode(svc.applyPatch(readOnly, { projectId: PID, expectedRevision: 1, ops: moveB(0.3), idempotencyKey: 'key-00001' }))).toBe('FORBIDDEN');
    const otherWs: CommandContext = { ...owner, workspaceId: 'ws-someone-else' };
    expect(await errCode(svc.projectInspect(otherWs, { projectId: PID }))).toBe('NOT_FOUND');
    expect(await errCode(svc.projectInspect(assistant, { projectId: PID, extra: 1 }))).toBe('INVALID_ARGUMENT');
    expect(await errCode(svc.dispatch('shell_exec', owner, {}))).toBe('INVALID_ARGUMENT');
  });

  it('inspect returns a compact summary with take status and capabilities', async () => {
    const r = await svc.projectInspect(assistant, { projectId: PID });
    expect(r.revision).toBe(1);
    expect(r.scenes.map((s) => s.id)).toEqual(plan0.scenes.map((s) => s.id));
    expect(r.scenes.flatMap((s) => s.dialogue.map((d) => d.take))).toSatisfy((xs: string[]) => xs.every((x) => x === 'ok'));
    expect(r.capabilities.renderer).toEqual({ ok: true });
    expect(JSON.stringify(r).length).toBeLessThan(12_000);
  });
});

describe('propose / apply', () => {
  it('propose has no side effects and reports a partial-render impact', async () => {
    const p = await svc.proposePatch(assistant, { projectId: PID, ops: moveB(0.3) });
    expect(p.changedScenes).toEqual(['scene-duo']);
    expect(p.linesNeedingVoice).toEqual([]);
    expect(p.timingMayShift).toBe(false);
    expect(p.changes).toHaveLength(1);
    expect((await readManifest(WS, PID)).revision).toBe(1);
  });

  it('apply is atomic, CAS-guarded, idempotent, and keeps history', async () => {
    const args = { projectId: PID, expectedRevision: 1, ops: moveB(0.3), idempotencyKey: 'apply-0001' };
    const a1 = await svc.applyPatch(assistant, args);
    expect(a1).toMatchObject({ revision: 2, changedScenes: ['scene-duo'] });
    const again = await svc.applyPatch(assistant, args);
    expect(again).toMatchObject({ revision: 2, replayed: true });
    expect((await readManifest(WS, PID)).revision).toBe(2);

    expect(await errCode(svc.applyPatch(assistant, { ...args, ops: moveB(0.4) }))).toBe('IDEMPOTENCY_KEY_REUSED');
    expect(await errCode(svc.applyPatch(assistant, { ...args, idempotencyKey: 'apply-0002' }))).toBe('REVISION_CONFLICT');
    expect(await errCode(svc.applyPatch(assistant, { ...args, expectedRevision: 2, idempotencyKey: 'apply-0003', ops: [{ op: 'replace', path: '/fps', value: 24 }] }))).toBe('INVALID_PATCH');
    expect(await errCode(svc.applyPatch(assistant, { ...args, expectedRevision: 2, idempotencyKey: 'bad key!' }))).toBe('INVALID_ARGUMENT');
    expect((await readManifest(WS, PID)).revision).toBe(2);

    const h1 = await getRecord<RevisionRecord>(REVISIONS, [WS, PID, 1]);
    const h2 = await getRecord<RevisionRecord>(REVISIONS, [WS, PID, 2]);
    expect(h1?.planHash).toBe(await hashScenePlan(plan0));
    expect(h2).toMatchObject({ actorId: 'claude-session-1' });
  });

  it('a user edit between inspect and apply yields a conflict for the assistant', async () => {
    const seen = await svc.projectInspect(assistant, { projectId: PID });
    await svc.applyPatch(owner, { projectId: PID, expectedRevision: seen.revision, ops: moveB(0.6), idempotencyKey: 'user-edit-1' });
    const code = await errCode(svc.applyPatch(assistant, { projectId: PID, expectedRevision: seen.revision, ops: moveB(0.3), idempotencyKey: 'asst-edit-1' }));
    expect(code).toBe('REVISION_CONFLICT');
    const m = await readManifest(WS, PID);
    expect(m.plan.scenes.find((s) => s.id === 'scene-duo')!.characters[1].position.x).toBe(0.6);
  });
});

describe('voice identity', () => {
  it('a text or voice/speed change makes exactly that take stale; synthesis creates only it', async () => {
    const line = duo.dialogue[0];
    await svc.applyPatch(owner, { projectId: PID, expectedRevision: 1, idempotencyKey: 'voice-0001', ops: [{ op: 'replace', path: `/scenes/@scene-duo/dialogue/@${line.id}/voiceProfileRef`, value: `${line.voiceProfileRef.split('@')[0]}@1.2` }] });
    const insp = await svc.projectInspect(owner, { projectId: PID });
    const statuses = insp.scenes.flatMap((s) => s.dialogue.map((d) => [d.id, d.take]));
    expect(statuses.filter(([, t]) => t !== 'ok')).toEqual([[line.id, 'stale']]);
    expect(await errCode(svc.renderStart(owner, { projectId: PID, expectedRevision: 2, idempotencyKey: 'render-0001' }))).toBe('TAKES_MISSING');

    const v = await svc.voiceSynthesize(owner, { projectId: PID, expectedRevision: 2, idempotencyKey: 'synth-0001' });
    expect(v.synthesized.map((x) => x.lineId)).toEqual([line.id]);
    expect(voice.calls).toEqual([[line.id]]);
    const v2 = await svc.voiceSynthesize(owner, { projectId: PID, expectedRevision: 3, idempotencyKey: 'synth-0002' });
    expect(v2.synthesized).toEqual([]);
    expect(voice.calls).toHaveLength(1);

    await svc.applyPatch(owner, { projectId: PID, expectedRevision: 3, idempotencyKey: 'voice-0002', ops: [{ op: 'replace', path: `/scenes/@scene-duo/dialogue/@${line.id}/voiceProfileRef`, value: 'elevenlabs:x@1.0' }] });
    expect(await errCode(svc.voiceSynthesize(owner, { projectId: PID, expectedRevision: 4, idempotencyKey: 'synth-0003' }))).toBe('UNSUPPORTED_ENGINE');
  });
});

describe('runs', () => {
  it('render_start → succeeded with a verified, retrievable artifact; replay returns the same run', async () => {
    const args = { projectId: PID, expectedRevision: 1, idempotencyKey: 'render-0001' };
    const ack = await svc.renderStart(assistant, args);
    expect(ack).toMatchObject({ state: 'queued', inputRevision: 1 });
    const replay = await svc.renderStart(assistant, args);
    expect(replay).toMatchObject({ runId: ack.runId, replayed: true });
    await svc.settled(ack.runId);
    const r = await svc.runInspect(assistant, { runId: ack.runId });
    expect(r.state).toBe('succeeded');
    expect(r.events.map((e) => e.state).filter(Boolean)).toEqual(['queued', 'running', 'succeeded']);
    const art = await svc.artifactInspect(assistant, { runId: ack.runId, include: 'bytes' });
    expect(art.metadata.sha256).toBe(await sha256Hex(new Uint8Array(await art.mp4!.arrayBuffer())));
    expect(renderer.renders).toHaveLength(1);
    expect((await readManifest(WS, PID)).lastRender).toBeDefined();
  });

  it('a run stays bound to its input revision when the project changes mid-run', async () => {
    renderer.holdNext();
    const ack = await svc.renderStart(owner, { projectId: PID, expectedRevision: 1, idempotencyKey: 'render-0002' });
    await svc.applyPatch(owner, { projectId: PID, expectedRevision: 1, ops: moveB(0.2), idempotencyKey: 'mid-run-01' });
    renderer.release();
    await svc.settled(ack.runId);
    const r = await svc.runInspect(owner, { runId: ack.runId });
    expect(r.state).toBe('succeeded');
    expect(renderer.renders[0].planHash).toBe(await hashScenePlan(plan0));
    // The finished render becomes the partial-render basis (there was no cache).
    const m = await readManifest(WS, PID);
    expect(m.revision).toBe(2);
    expect(m.lastRender?.renderedPlanHash).toBe(await hashScenePlan(plan0));
  });

  it('cancel is idempotent, works after the project moved on, and keeps the previous good output', async () => {
    const first = await svc.renderStart(owner, { projectId: PID, expectedRevision: 1, idempotencyKey: 'render-0003' });
    await svc.settled(first.runId);
    await svc.applyPatch(owner, { projectId: PID, expectedRevision: 1, ops: moveB(0.25), idempotencyKey: 'edit-00004' });
    renderer.holdNext();
    const second = await svc.renderStart(owner, { projectId: PID, expectedRevision: 2, idempotencyKey: 'render-0004' });
    await svc.applyPatch(owner, { projectId: PID, expectedRevision: 2, ops: moveB(0.35), idempotencyKey: 'edit-00005' });
    expect(await svc.runCancel(assistant, { runId: second.runId })).toEqual({ runId: second.runId, state: 'cancelled', alreadyTerminal: false });
    expect(await svc.runCancel(assistant, { runId: second.runId })).toEqual({ runId: second.runId, state: 'cancelled', alreadyTerminal: true });
    await svc.settled(second.runId);
    expect((await svc.runInspect(owner, { runId: second.runId })).state).toBe('cancelled');
    expect(await errCode(svc.artifactInspect(owner, { runId: second.runId }))).toBe('RUN_NOT_SUCCEEDED');
    const prev = await svc.artifactInspect(owner, { runId: first.runId, include: 'bytes' });
    expect(prev.mp4!.size).toBeGreaterThan(0);
    expect((await svc.runCancel(owner, { runId: first.runId })).alreadyTerminal).toBe(true);
  });

  it('a cancel from another page while the encoder finishes still wins; no artifact is recorded', async () => {
    renderer.holdNext();
    renderer.ignoreAbort = true;
    const ack = await svc.renderStart(owner, { projectId: PID, expectedRevision: 1, idempotencyKey: 'render-0011' });
    await new Promise((r) => setTimeout(r, 20));
    // Cancelled from ANOTHER page/instance: it cannot abort this executor's
    // encoder, only the persisted run state — which must still win.
    const otherPage = new CartoonCommandService({ renderer, voice });
    await otherPage.runCancel(owner, { runId: ack.runId });
    renderer.release();
    await svc.settled(ack.runId);
    const r = await svc.runInspect(owner, { runId: ack.runId });
    expect(r).toMatchObject({ state: 'cancelled', artifact: null });
    expect((await readManifest(WS, PID)).lastRender).toBeUndefined();
  });

  it('a disconnected renderer cannot produce success', async () => {
    renderer.ok = false;
    const ack = await svc.renderStart(owner, { projectId: PID, expectedRevision: 1, idempotencyKey: 'render-0005' });
    await svc.settled(ack.runId);
    const r = await svc.runInspect(owner, { runId: ack.runId });
    expect(r.state).toBe('failed');
    expect(r.failure?.code).toBe('RENDERER_UNAVAILABLE');
    expect(r.events.map((e) => e.state).filter(Boolean)).toEqual(['queued', 'waiting_for_renderer', 'failed']);
  });

  it('output that fails independent verification is not a success', async () => {
    renderer.badOutput = true;
    const ack = await svc.renderStart(owner, { projectId: PID, expectedRevision: 1, idempotencyKey: 'render-0006' });
    await svc.settled(ack.runId);
    const r = await svc.runInspect(owner, { runId: ack.runId });
    expect(r).toMatchObject({ state: 'failed', artifact: null });
    expect(r.failure?.code).toBe('OUTPUT_INVALID');
  });

  it('one active run per workspace', async () => {
    renderer.holdNext();
    const a = await svc.renderStart(owner, { projectId: PID, expectedRevision: 1, idempotencyKey: 'render-0007' });
    expect(await errCode(svc.renderStart(owner, { projectId: PID, expectedRevision: 1, idempotencyKey: 'render-0008' }))).toBe('BUSY');
    renderer.release();
    await svc.settled(a.runId);
  });

  it('runs orphaned by a closed page become interrupted, never silently resumed', async () => {
    const stale: RunRecord = {
      workspaceId: WS, runId: 'run_orphan', projectId: PID, actorId: 'owner', requestId: 'x', idempotencyKey: 'orphan-001',
      inputRevision: 1, inputPlanHash: 'h', settings: { mode: 'auto', bitrate: 8_000_000 }, state: 'running',
      events: [{ at: 0, state: 'running', message: 'rendering' }], progress: 40, createdAt: 0, updatedAt: 0, heartbeatAt: 0,
    };
    await putRecords([{ store: RUNS, value: stale }]);
    const fresh = new CartoonCommandService({ renderer, voice, limits: { staleRunMs: 1000 } });
    expect(await fresh.recover(WS)).toEqual(['run_orphan']);
    const r = await fresh.runInspect(owner, { runId: 'run_orphan' });
    expect(r).toMatchObject({ state: 'interrupted', failure: { code: 'INTERRUPTED' } });
    // and a new render can start (the orphan no longer counts as active)
    const ack = await fresh.renderStart(owner, { projectId: PID, expectedRevision: 1, idempotencyKey: 'render-0009' });
    await fresh.settled(ack.runId);
    expect((await fresh.runInspect(owner, { runId: ack.runId })).state).toBe('succeeded');
  });

  it('runs are scoped: another project grant cannot inspect or cancel them', async () => {
    const ack = await svc.renderStart(owner, { projectId: PID, expectedRevision: 1, idempotencyKey: 'render-0010' });
    await svc.settled(ack.runId);
    const stranger: CommandContext = { ...assistant, projects: new Set(['elsewhere']) };
    expect(await errCode(svc.runInspect(stranger, { runId: ack.runId }))).toBe('FORBIDDEN');
    expect(await errCode(svc.runCancel(stranger, { runId: ack.runId }))).toBe('FORBIDDEN');
    expect(await errCode(svc.artifactInspect({ ...owner, workspaceId: 'ws-other' }, { runId: ack.runId }))).toBe('NOT_FOUND');
  });
});
