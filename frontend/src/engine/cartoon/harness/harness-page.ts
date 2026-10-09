/**
 * Contentine Create — Cartoon Engine: C-M1 browser harness (page side)
 *
 * Runs the full tracer bullet in a real browser and reports evidence:
 *   1. synthesize voice takes once (real Kokoro TTS via tts-manager)
 *   2. render the reference project TWICE with per-frame hashing
 *   3. probe both MP4s (duration / streams / packet counts)
 *   4. apply the timing-neutral scene-2 edit → partial re-render
 *   5. upload all three MP4s to the harness server, return evidence JSON
 *
 * Driven by harness/run-c-m1.mjs through window.__cm1.run().
 */

import { buildReferencePlan, buildEditedReferencePlan } from './reference-plan';
import {
  renderCartoonProject,
  rerenderEditedProject,
  type CartoonRenderOptions,
  type CartoonRenderResult,
} from '../cartoon-renderer';
import { synthesizeTakes } from '../voice-takes';
import { probeMp4, type Mp4Probe } from '../mp4-probe';
import type { PartialRenderReport } from '../cartoon-renderer';

interface SceneHashDelta {
  sceneId: string;
  startFrame: number;
  frameCount: number;
  differingFrames: number;
  firstDifferingFrame: number | null;
}

export interface Cm1Evidence {
  userAgent: string;
  plan: { id: string; title: string; hash: string; scenes: Array<{ sceneId: string; startFrame: number; frameCount: number }> };
  takes: Array<{ id: string; durationSec: number; pcmHash: string }>;
  render1: { frameHashes: string[]; audioPcmHash: string; audioCodec: string | null; probe: Mp4Probe };
  render2: { frameHashes: string[]; audioPcmHash: string; audioCodec: string | null; probe: Mp4Probe };
  determinism: { framesIdentical: boolean; frameCount: number; firstMismatch: number | null; audioMixIdentical: boolean };
  partial: {
    report: PartialRenderReport;
    editedPlanHash: string;
    probe: Mp4Probe;
    sceneDeltasVsRender1: SceneHashDelta[];
  };
}

function log(msg: string): void {
  console.log(`[c-m1] ${msg}`);
}

async function upload(name: string, blob: Blob): Promise<void> {
  const res = await fetch(`/artifact/${name}`, { method: 'PUT', body: blob });
  if (!res.ok) throw new Error(`artifact upload failed for ${name}: ${res.status}`);
  log(`uploaded ${name} (${(blob.size / 1024 / 1024).toFixed(2)} MB)`);
}

function sceneDeltas(a: CartoonRenderResult, b: CartoonRenderResult): SceneHashDelta[] {
  return a.sceneRecords.map((recA, i) => {
    const recB = b.sceneRecords[i];
    let differing = 0;
    let first: number | null = null;
    for (let f = 0; f < recA.frameHashes.length; f++) {
      if (recA.frameHashes[f] !== recB.frameHashes[f]) {
        differing++;
        if (first === null) first = recA.startFrame + f;
      }
    }
    return {
      sceneId: recA.sceneId,
      startFrame: recA.startFrame,
      frameCount: recA.frameCount,
      differingFrames: differing,
      firstDifferingFrame: first,
    };
  });
}

async function run(): Promise<Cm1Evidence> {
  const plan = buildReferencePlan();

  log('synthesizing voice takes (Kokoro TTS — model downloads on first run)...');
  const takes = await synthesizeTakes(plan, undefined, (done, total, text) => {
    log(`take ${done}/${total} ${text ? `"${text.slice(0, 40)}..."` : 'done'}`);
  });

  const options: CartoonRenderOptions = {
    takes,
    collectFrameHashes: true,
    workerUrl: '/render-worker.js',
    onPhaseChange: (phase, message) => log(`${phase}: ${message}`),
    onProgress: (pct) => { if (pct % 20 === 0) log(`progress ${pct}%`); },
  };

  log('render #1 (full, with per-frame hashing)...');
  const r1 = await renderCartoonProject(plan, options);
  log(`render #1 done: ${r1.totalFrames} frames, ${r1.durationSec.toFixed(2)}s, audio=${r1.audioCodec}`);

  log('render #2 (identical input)...');
  const r2 = await renderCartoonProject(plan, options);
  log('render #2 done');

  const h1 = r1.frameHashes!;
  const h2 = r2.frameHashes!;
  let firstMismatch: number | null = null;
  for (let i = 0; i < Math.max(h1.length, h2.length); i++) {
    if (h1[i] !== h2[i]) { firstMismatch = i; break; }
  }

  log('partial re-render (scene-duo edit: background seed + character position/palette)...');
  const edited = buildEditedReferencePlan();
  const partial = await rerenderEditedProject(plan, r1, edited, options);
  log(`partial mode=${partial.partial.mode} rerendered=${partial.partial.rerenderedScenes.join(',')}`);

  log('probing MP4s (mediabunny demux)...');
  const [probe1, probe2, probeEdited] = [
    await probeMp4(r1.mp4),
    await probeMp4(r2.mp4),
    await probeMp4(partial.result.mp4),
  ];

  await upload('render1.mp4', r1.mp4);
  await upload('render2.mp4', r2.mp4);
  await upload('edited-partial.mp4', partial.result.mp4);

  return {
    userAgent: navigator.userAgent,
    plan: {
      id: plan.id,
      title: plan.title,
      hash: r1.planHash,
      scenes: r1.timing.scenes.map((w) => ({ sceneId: w.sceneId, startFrame: w.startFrame, frameCount: w.frameCount })),
    },
    takes: Array.from(takes.values(), (t) => ({ id: t.id, durationSec: t.durationSec, pcmHash: t.pcmHash })),
    render1: { frameHashes: h1, audioPcmHash: r1.audioPcmHash, audioCodec: r1.audioCodec, probe: probe1 },
    render2: { frameHashes: h2, audioPcmHash: r2.audioPcmHash, audioCodec: r2.audioCodec, probe: probe2 },
    determinism: {
      framesIdentical: firstMismatch === null && h1.length === h2.length,
      frameCount: h1.length,
      firstMismatch,
      audioMixIdentical: r1.audioPcmHash === r2.audioPcmHash,
    },
    partial: {
      report: partial.partial,
      editedPlanHash: partial.result.planHash,
      probe: probeEdited,
      sceneDeltasVsRender1: sceneDeltas(r1, partial.result),
    },
  };
}

declare global {
  interface Window {
    __cm1: { run: () => Promise<Cm1Evidence> };
  }
}

window.__cm1 = { run };
log('harness ready');
