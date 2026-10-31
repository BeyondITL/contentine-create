/**
 * Contentine Create — command layer harness (page side, real ports)
 *
 * Exercises the SAME CartoonCommandService the editor uses, with the real
 * Kokoro voice port and the real WebCodecs renderer port, in a real browser.
 * Driven by harness/run-commands.mjs:
 *   flow()        create → voice → render → inspect/propose/apply → partial
 *                 render → A04 asset swap under the same ref → voice/speed
 *                 change → revision conflict → real mid-render cancel
 *   startOrphan() start a render the driver kills by closing the browser
 *   recover()     after relaunch: the orphan is `interrupted`; re-render works
 */

import { buildReferencePlan } from './reference-plan';
import { sha256Hex } from '../scene-plan';
import { CartoonCommandService, type CommandContext } from '@/lib/cartoon/commands/service';
import { createBrowserRenderer, createKokoroVoice } from '@/lib/cartoon/commands/browser-ports';
import { loadProject, saveProject } from '@/lib/cartoon/project-store';

const WS = 'harness-cmd';
const log = (m: string) => console.log(`[cmd] ${m}`);

const svc = new CartoonCommandService({
  renderer: createBrowserRenderer({ workerUrl: '/render-worker.js' }),
  voice: createKokoroVoice(),
  limits: { staleRunMs: 5_000, heartbeatMs: 1_000 },
});

const owner: CommandContext = { actor: { id: 'harness-owner', kind: 'user' }, workspaceId: WS, projects: '*', permissions: new Set(['read', 'edit', 'voice', 'render']), requestId: 'owner' };
const plan0 = (() => {
  const p = buildReferencePlan();
  p.id = 'cmd-harness-project';
  p.scenes[0].background.assetRef = 'asset:bg-intro';
  return p;
})();
const assistant: CommandContext = { actor: { id: 'assistant-session', kind: 'assistant' }, workspaceId: WS, projects: new Set([plan0.id]), permissions: new Set(['read', 'edit', 'voice', 'render']), requestId: 'assistant' };

let keyN = 0;
const key = (tag: string) => `${tag}-${Date.now()}-${keyN++}`;

async function paintBackground(hueA: number, hueB: number): Promise<Blob> {
  const c = new OffscreenCanvas(1920, 1080);
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 1920, 1080);
  grad.addColorStop(0, `hsl(${hueA} 70% 55%)`);
  grad.addColorStop(1, `hsl(${hueB} 70% 35%)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, 1920, 1080);
  return c.convertToBlob({ type: 'image/png' });
}

async function upload(name: string, blob: Blob): Promise<void> {
  const res = await fetch(`/artifact/${name}`, { method: 'PUT', body: blob });
  if (!res.ok) throw new Error(`upload ${name} failed: ${res.status}`);
}

async function waitRun(runId: string, ctx = owner) {
  for (;;) {
    const r = await svc.runInspect(ctx, { runId });
    if (r.terminal) return r;
    await new Promise((res) => setTimeout(res, 500));
  }
}

async function renderAndFetch(ctx: CommandContext, revision: number, name: string, mode: 'auto' | 'full' = 'auto') {
  const ack = await svc.renderStart(ctx, { projectId: plan0.id, expectedRevision: revision, idempotencyKey: key('render'), mode });
  const run = await waitRun(ack.runId, ctx);
  if (run.state !== 'succeeded') throw new Error(`run ${name} ${run.state}: ${JSON.stringify(run.failure)}`);
  const art = await svc.artifactInspect(ctx, { runId: ack.runId, include: 'bytes' });
  await upload(`${name}.mp4`, art.mp4!);
  log(`${name}: ${run.partial?.mode} rerendered=${run.partial?.rerenderedScenes.join(',')} reused=${run.partial?.reusedScenes.join(',')}`);
  return { ack, run, metadata: art.metadata, bytesSha256: await sha256Hex(new Uint8Array(await art.mp4!.arrayBuffer())) };
}

const codeOf = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'NO_ERROR';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
};

async function flow() {
  const steps: Record<string, unknown> = {};

  // 1. Create the project with ONLY plan + background asset (no takes yet).
  const bgA = await paintBackground(30, 200);
  await saveProject({ workspaceId: WS, plan: plan0, takes: new Map(), backgroundImages: new Map([['asset:bg-intro', bgA]]) }, { expectedRevision: null });
  const i0 = await svc.projectInspect(assistant, { projectId: plan0.id });
  steps.inspectBeforeVoice = { revision: i0.revision, takes: i0.scenes.flatMap((s) => s.dialogue.map((d) => d.take)), renderer: i0.capabilities.renderer };
  steps.renderWithoutTakes = await codeOf(svc.renderStart(assistant, { projectId: plan0.id, expectedRevision: 1, idempotencyKey: key('r') }));

  // 2. Voice every line (real Kokoro), then the first full render.
  const v1 = await svc.voiceSynthesize(assistant, { projectId: plan0.id, expectedRevision: 1, idempotencyKey: key('voice') });
  steps.voiceAll = { revision: v1.revision, synthesized: v1.synthesized.map((s) => s.lineId) };
  const r1 = await renderAndFetch(assistant, v1.revision, 'cmd-1-full');
  steps.render1 = { runId: r1.ack.runId, state: r1.run.state, partial: r1.run.partial, events: r1.run.events.map((e) => e.state).filter(Boolean), artifact: r1.metadata, bytesSha256: r1.bytesSha256 };

  // 3. Assistant: inspect → propose → apply the bounded scene-2 edit → render.
  const i1 = await svc.projectInspect(assistant, { projectId: plan0.id });
  const move = [
    { op: 'test', path: '/scenes/@scene-duo/characters/@dash/position', value: plan0.scenes[1].characters[1].position },
    { op: 'replace', path: '/scenes/@scene-duo/characters/@dash/position/x', value: 0.32 },
  ];
  const proposal = await svc.proposePatch(assistant, { projectId: plan0.id, baseRevision: i1.revision, ops: move });
  steps.proposal = { changedScenes: proposal.changedScenes, linesNeedingVoice: proposal.linesNeedingVoice, predictedRender: proposal.predictedRender, changes: proposal.changes };
  const applied = await svc.applyPatch(assistant, { projectId: plan0.id, expectedRevision: i1.revision, ops: move, idempotencyKey: 'move-dash-0001' });
  const replay = await svc.applyPatch(assistant, { projectId: plan0.id, expectedRevision: i1.revision, ops: move, idempotencyKey: 'move-dash-0001' });
  steps.apply = { revision: applied.revision, replayed: Boolean(replay.replayed), sameOutcome: replay.revision === applied.revision };
  const r2 = await renderAndFetch(assistant, applied.revision, 'cmd-2-move');
  steps.render2 = { partial: r2.run.partial, artifact: r2.metadata };

  // 4. A04: replace the intro background BYTES under the same ref, and make a
  //    visual edit to the outro in the same revision. Plan JSON for the intro
  //    is unchanged — only its asset bytes changed.
  const loaded = await loadProject(WS, plan0.id);
  const bgB = await paintBackground(280, 120);
  const outroEdited = structuredClone(loaded.plan);
  outroEdited.scenes[2].background.seed = 31337;
  await saveProject(
    { workspaceId: WS, plan: outroEdited, takes: loaded.takes, backgroundImages: new Map([['asset:bg-intro', bgB]]), exportConfig: loaded.exportConfig, lastRender: loaded.lastRender },
    { expectedRevision: loaded.revision },
  );
  const r3 = await renderAndFetch(owner, loaded.revision + 1, 'cmd-3-asset');
  steps.render3AssetSwap = { partial: r3.run.partial, artifact: r3.metadata };

  // 5. Voice/speed change on one line → exactly one take re-synthesized.
  const i3 = await svc.projectInspect(assistant, { projectId: plan0.id });
  const speed = await svc.applyPatch(assistant, {
    projectId: plan0.id,
    expectedRevision: i3.revision,
    idempotencyKey: key('speed'),
    ops: [{ op: 'replace', path: '/scenes/@scene-outro/dialogue/@outro-1/voiceProfileRef', value: 'kokoro:af_sky@1.15' }],
  });
  const i4 = await svc.projectInspect(assistant, { projectId: plan0.id });
  const v2 = await svc.voiceSynthesize(assistant, { projectId: plan0.id, expectedRevision: speed.revision, idempotencyKey: key('voice') });
  steps.voiceSpeedChange = {
    staleBefore: i4.scenes.flatMap((s) => s.dialogue.filter((d) => d.take !== 'ok').map((d) => `${d.id}:${d.take}`)),
    synthesized: v2.synthesized,
  };
  const r4 = await renderAndFetch(assistant, v2.revision, 'cmd-4-speed');
  steps.render4 = { partial: r4.run.partial, artifact: r4.metadata };

  // 6. A user edit between the assistant's inspect and apply → conflict, no change.
  const seen = await svc.projectInspect(assistant, { projectId: plan0.id });
  await svc.applyPatch(owner, { projectId: plan0.id, expectedRevision: seen.revision, idempotencyKey: key('user'), ops: [{ op: 'replace', path: '/scenes/@scene-duo/captions/enabled', value: !plan0.scenes[1].captions.enabled }] });
  const conflictCode = await codeOf(svc.applyPatch(assistant, { projectId: plan0.id, expectedRevision: seen.revision, idempotencyKey: key('asst'), ops: move.slice(1) }));
  const after = await svc.projectInspect(assistant, { projectId: plan0.id });
  steps.conflict = { assistantSawRevision: seen.revision, code: conflictCode, revisionAfter: after.revision };

  // 7. Real mid-render cancel; previous output stays retrievable.
  const cancelAck = await svc.renderStart(assistant, { projectId: plan0.id, expectedRevision: after.revision, idempotencyKey: key('render'), mode: 'full' });
  for (;;) {
    const r = await svc.runInspect(assistant, { runId: cancelAck.runId });
    if (r.state === 'running' && r.progress >= 15) break;
    if (r.terminal) break;
    await new Promise((res) => setTimeout(res, 200));
  }
  const c1 = await svc.runCancel(assistant, { runId: cancelAck.runId });
  const c2 = await svc.runCancel(assistant, { runId: cancelAck.runId });
  await svc.settled(cancelAck.runId);
  const cancelled = await svc.runInspect(assistant, { runId: cancelAck.runId });
  const prev = await svc.artifactInspect(assistant, { runId: r4.ack.runId, include: 'bytes' });
  steps.cancel = {
    first: c1,
    second: c2,
    finalState: cancelled.state,
    progressAtCancel: cancelled.progress,
    artifactAfterCancel: await codeOf(svc.artifactInspect(assistant, { runId: cancelAck.runId })),
    previousArtifactStillValid: (await sha256Hex(new Uint8Array(await prev.mp4!.arrayBuffer()))) === r4.bytesSha256,
  };

  // 8. Scope: a session bound to another project cannot see this one.
  const stranger: CommandContext = { ...assistant, projects: new Set(['other-project']) };
  steps.scope = {
    inspect: await codeOf(svc.projectInspect(stranger, { projectId: plan0.id })),
    runInspect: await codeOf(svc.runInspect(stranger, { runId: r1.ack.runId })),
    unknownCommand: await codeOf(svc.dispatch('eval_js', assistant, { code: '1' })),
  };

  return { userAgent: navigator.userAgent, projectId: plan0.id, sceneWindows: r1.run && (await loadProject(WS, plan0.id)).lastRender?.result.timing.scenes.map((w) => ({ sceneId: w.sceneId, startFrame: w.startFrame, frameCount: w.frameCount })), steps };
}

/** Start a render and report once it is running; the driver then kills the browser. */
async function startOrphan() {
  const i = await svc.projectInspect(owner, { projectId: plan0.id });
  const ack = await svc.renderStart(owner, { projectId: plan0.id, expectedRevision: i.revision, idempotencyKey: key('orphan'), mode: 'full' });
  for (;;) {
    const r = await svc.runInspect(owner, { runId: ack.runId });
    if (r.state === 'running' && r.progress >= 10) return { runId: ack.runId, revision: i.revision, stateWhenKilled: r.state, progress: r.progress };
    if (r.terminal) return { runId: ack.runId, revision: i.revision, stateWhenKilled: r.state, progress: r.progress };
    await new Promise((res) => setTimeout(res, 200));
  }
}

/** After relaunch: recover orphaned runs, then show a fresh render still works. */
async function recover(orphanRunId: string, revision: number) {
  await new Promise((res) => setTimeout(res, 6_000)); // > staleRunMs since the last heartbeat
  const interrupted = await svc.recover(WS, true);
  const orphan = await svc.runInspect(owner, { runId: orphanRunId });
  const again = await renderAndFetch(owner, revision, 'cmd-5-after-restart');
  return { interrupted, orphan: { state: orphan.state, failure: orphan.failure, events: orphan.events.map((e) => e.state).filter(Boolean) }, rerender: { state: again.run.state, partial: again.run.partial } };
}

declare global {
  interface Window {
    __cmd: { flow: typeof flow; startOrphan: typeof startOrphan; recover: typeof recover };
  }
}
window.__cmd = { flow, startOrphan, recover };
log('harness ready');
