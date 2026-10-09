/**
 * Contentine Create — Cartoon Engine: Render orchestrator (main thread)
 *
 * Drives the render worker and owns scene-level dirty tracking:
 *   renderCartoonProject   — full render: mix audio offline, render all
 *                            frames in the worker, mux, keep per-scene
 *                            chunk groups for later partial re-renders.
 *   rerenderEditedProject  — diff old vs new plan; when only scene content
 *                            changed (frame windows intact), re-render just
 *                            the dirty scenes' frame ranges and re-mux at
 *                            the scene boundaries. Falls back to a full
 *                            render (and says so) when timing shifted.
 *
 * The MP4 is a print-out of the plan — every edit flows through here as a
 * plan mutation, never as video surgery.
 */

import {
  diffScenePlans,
  hashScene,
  hashScenePlan,
  validateScenePlan,
  type ScenePlan,
} from './scene-plan';
import { computePlanTiming, type PlanTiming } from './timing';
import { mixPlanAudio, type MixedAudio } from './audio-mixer';
import { takeTimingInfo, type VoiceTake } from './voice-takes';
import type { RenderFramesRequest, MuxRequest, WorkerChunk, WorkerDecoderConfig, WorkerResponse } from './render-worker';
import { getAiDisclosure } from '@/lib/ai-disclosure';

// ─── Options / results ───────────────────────────────────────────────────────

export type CartoonRenderPhase = 'audio-mix' | 'compositing' | 'muxing';

export interface CartoonRenderOptions {
  /** Voice takes keyed by `takeRef ?? dialogue.id` (see voice-takes.ts). */
  takes: Map<string, VoiceTake>;
  /** Encoded audio for `asset:` music/sfx refs. */
  audioAssets?: Map<string, ArrayBuffer>;
  /** Decoded background images keyed by background.assetRef. */
  backgroundAssets?: Map<string, ImageBitmap>;
  bitrate?: number;
  /** Collect per-frame raw-pixel SHA-256 hashes (determinism evidence). */
  collectFrameHashes?: boolean;
  onPhaseChange?: (phase: CartoonRenderPhase, message: string) => void;
  onProgress?: (percent: number) => void;
  /** Override the worker script location (used by the determinism harness). */
  workerUrl?: string | URL;
}

export interface SceneRenderRecord {
  sceneId: string;
  contentHash: string;
  startFrame: number;
  frameCount: number;
  chunks: WorkerChunk[];
  /** Present when collectFrameHashes was set. */
  frameHashes: string[];
}

export interface CartoonRenderResult {
  mp4: Blob;
  planHash: string;
  fps: number;
  width: number;
  height: number;
  durationSec: number;
  totalFrames: number;
  audioCodec: string | null;
  /** SHA-256 of the mixed master PCM. */
  audioPcmHash: string;
  timing: PlanTiming;
  decoderConfig: WorkerDecoderConfig;
  /** Per-scene encoded chunk groups — the partial re-render cache. */
  sceneRecords: SceneRenderRecord[];
  /** All frame hashes in order, when collected. */
  frameHashes?: string[];
}

export interface PartialRenderReport {
  mode: 'partial' | 'full';
  /** Scene ids that were re-rendered. */
  rerenderedScenes: string[];
  /** Frame ranges [startFrame, endFrame) that were re-rendered. */
  rerenderedFrameRanges: Array<[number, number]>;
  /** Scene ids whose encoded chunks were reused untouched. */
  reusedScenes: string[];
  /** Why a full render was required (mode 'full' only). */
  fullRenderReason?: string;
}

const DEFAULT_BITRATE = 8_000_000;

// ─── Worker plumbing ─────────────────────────────────────────────────────────

interface WorkerHandle {
  worker: Worker;
  call<T extends WorkerResponse['op']>(
    request: RenderFramesRequest | MuxRequest,
    doneOp: T,
    onProgress?: (phase: string, percent: number) => void,
    transfer?: Transferable[],
  ): Promise<Extract<WorkerResponse, { op: T }>>;
  terminate(): void;
}

function createWorkerHandle(workerUrl?: string | URL): WorkerHandle {
  // Bundler-visible URL keeps this compatible with the Next.js static export;
  // the engine itself is only ever loaded via dynamic import (Law L8).
  const worker = new Worker(workerUrl ?? new URL('./render-worker.ts', import.meta.url), { type: 'module' });
  let nextId = 1;

  return {
    worker,
    call(request, doneOp, onProgress, transfer) {
      const id = nextId++;
      request.id = id;
      return new Promise((resolve, reject) => {
        const onMessage = (event: MessageEvent) => {
          const msg = event.data as WorkerResponse;
          if (msg.id !== id) return;
          if (msg.op === 'progress') {
            onProgress?.(msg.phase, msg.percent);
          } else if (msg.op === 'error') {
            cleanup();
            reject(new Error(msg.error));
          } else if (msg.op === doneOp) {
            cleanup();
            resolve(msg as Extract<WorkerResponse, { op: typeof doneOp }>);
          }
        };
        const onError = (err: ErrorEvent) => {
          cleanup();
          reject(new Error(`Render worker crashed: ${err.message}`));
        };
        const cleanup = () => {
          worker.removeEventListener('message', onMessage);
          worker.removeEventListener('error', onError);
        };
        worker.addEventListener('message', onMessage);
        worker.addEventListener('error', onError);
        worker.postMessage(request, transfer ?? []);
      });
    },
    terminate() {
      worker.terminate();
    },
  };
}

// ─── Shared helpers ──────────────────────────────────────────────────────────

function frameOfChunk(chunk: WorkerChunk, fps: number): number {
  return Math.round((chunk.timestamp * fps) / 1_000_000);
}

/** Partition a whole-project chunk list into per-scene records. */
async function splitIntoSceneRecords(
  plan: ScenePlan,
  timing: PlanTiming,
  chunks: WorkerChunk[],
  frameHashes: string[],
): Promise<SceneRenderRecord[]> {
  const records: SceneRenderRecord[] = [];
  for (let i = 0; i < plan.scenes.length; i++) {
    const window = timing.scenes[i];
    const endFrame = window.startFrame + window.frameCount;
    records.push({
      sceneId: window.sceneId,
      contentHash: await hashScene(plan.scenes[i]),
      startFrame: window.startFrame,
      frameCount: window.frameCount,
      chunks: chunks.filter((c) => {
        const f = frameOfChunk(c, timing.fps);
        return f >= window.startFrame && f < endFrame;
      }),
      frameHashes: frameHashes.slice(window.startFrame, endFrame),
    });
  }
  return records;
}

function renderFramesRequest(
  plan: ScenePlan,
  options: CartoonRenderOptions,
  startFrame: number,
  endFrame: number,
): RenderFramesRequest {
  return {
    op: 'render-frames',
    id: 0, // assigned by the worker handle
    plan,
    takeInfo: Array.from(takeTimingInfo(options.takes).entries()),
    startFrame,
    endFrame,
    bitrate: options.bitrate ?? DEFAULT_BITRATE,
    collectFrameHashes: options.collectFrameHashes ?? false,
    backgroundAssets: Array.from((options.backgroundAssets ?? new Map<string, ImageBitmap>()).entries()),
  };
}

async function muxRecords(
  handle: WorkerHandle,
  plan: ScenePlan,
  planHash: string,
  records: SceneRenderRecord[],
  decoderConfig: WorkerDecoderConfig,
  audio: MixedAudio,
  onProgress?: (percent: number) => void,
): Promise<{ mp4: Blob; audioCodec: string | null }> {
  // Law L7 — resolve the user's AI-disclosure caption on the MAIN THREAD
  // (getAiDisclosure reads localStorage; the worker can't). This is the single
  // source of truth shared with the visible /notices badge. An empty string means
  // the user disabled Art. 50 marking, so we omit the aiDisclosure tag entirely.
  const aiDisclosure = getAiDisclosure();
  const request: MuxRequest = {
    op: 'mux',
    id: 0,
    chunks: records.flatMap((r) => r.chunks),
    decoderConfig,
    audio: { left: audio.left, right: audio.right, sampleRate: audio.sampleRate },
    fps: plan.fps,
    width: plan.resolution.width,
    height: plan.resolution.height,
    provenance: {
      title: plan.title,
      planHash,
      generator: 'Contentine Create — Cartoon Engine v1 (browser-native, deterministic render)',
      ...(aiDisclosure ? { aiDisclosure } : {}),
    },
  };
  const done = await handle.call(request, 'mux-done', (_phase, pct) => onProgress?.(pct));
  return { mp4: new Blob([done.mp4], { type: 'video/mp4' }), audioCodec: done.audioCodec };
}

function assertValid(plan: ScenePlan): void {
  const validation = validateScenePlan(plan);
  if (!validation.ok) {
    throw new Error(`Scene plan invalid:\n- ${validation.errors.join('\n- ')}`);
  }
}

// ─── Full render ─────────────────────────────────────────────────────────────

export async function renderCartoonProject(
  plan: ScenePlan,
  options: CartoonRenderOptions,
): Promise<CartoonRenderResult> {
  assertValid(plan);
  const planHash = await hashScenePlan(plan);
  const takeDurations = new Map(Array.from(options.takes, ([k, t]) => [k, t.durationSec]));
  const timing = computePlanTiming(plan, takeDurations);

  options.onPhaseChange?.('audio-mix', 'Mixing audio (offline render)...');
  options.onProgress?.(2);
  const audio = await mixPlanAudio(plan, timing, options.takes, { audioAssets: options.audioAssets });
  options.onProgress?.(10);

  const handle = createWorkerHandle(options.workerUrl);
  try {
    options.onPhaseChange?.('compositing', 'Rendering frames...');
    const framesDone = await handle.call(
      renderFramesRequest(plan, options, 0, timing.totalFrames),
      'frames-done',
      (_phase, pct) => options.onProgress?.(10 + Math.round(pct * 0.75)),
    );

    options.onPhaseChange?.('muxing', 'Muxing MP4...');
    const records = await splitIntoSceneRecords(plan, timing, framesDone.chunks, framesDone.frameHashes);
    const { mp4, audioCodec } = await muxRecords(
      handle, plan, planHash, records, framesDone.decoderConfig, audio,
      (pct) => options.onProgress?.(85 + Math.round(pct * 0.15)),
    );
    options.onProgress?.(100);

    return {
      mp4,
      planHash,
      fps: plan.fps,
      width: plan.resolution.width,
      height: plan.resolution.height,
      durationSec: timing.totalDuration,
      totalFrames: timing.totalFrames,
      audioCodec,
      audioPcmHash: audio.pcmHash,
      timing,
      decoderConfig: framesDone.decoderConfig,
      sceneRecords: records,
      frameHashes: options.collectFrameHashes ? framesDone.frameHashes : undefined,
    };
  } finally {
    handle.terminate();
  }
}

// ─── Partial re-render (scene-level dirty tracking) ──────────────────────────

function sameDecoderConfig(a: WorkerDecoderConfig, b: WorkerDecoderConfig): boolean {
  if (a.codec !== b.codec || a.codedWidth !== b.codedWidth || a.codedHeight !== b.codedHeight) return false;
  const da = a.description ?? new Uint8Array(0);
  const db = b.description ?? new Uint8Array(0);
  return da.length === db.length && da.every((byte, i) => byte === db[i]);
}

function windowsMatch(a: PlanTiming, b: PlanTiming): boolean {
  return (
    a.fps === b.fps &&
    a.totalFrames === b.totalFrames &&
    a.scenes.length === b.scenes.length &&
    a.scenes.every(
      (w, i) =>
        b.scenes[i].sceneId === w.sceneId &&
        b.scenes[i].startFrame === w.startFrame &&
        b.scenes[i].frameCount === w.frameCount,
    )
  );
}

/**
 * Re-render an edited plan, reusing the previous result's encoded chunks for
 * every untouched scene. Audio is always re-mixed (offline mix is cheap) and
 * the file is re-muxed at scene boundaries.
 */
export async function rerenderEditedProject(
  prevPlan: ScenePlan,
  prevResult: CartoonRenderResult,
  newPlan: ScenePlan,
  options: CartoonRenderOptions,
): Promise<{ result: CartoonRenderResult; partial: PartialRenderReport }> {
  assertValid(newPlan);
  const diff = await diffScenePlans(prevPlan, newPlan);
  const takeDurations = new Map(Array.from(options.takes, ([k, t]) => [k, t.durationSec]));
  const newTiming = computePlanTiming(newPlan, takeDurations);

  const fullRender = async (reason: string) => {
    const result = await renderCartoonProject(newPlan, options);
    return {
      result,
      partial: {
        mode: 'full' as const,
        rerenderedScenes: newPlan.scenes.map((s) => s.id),
        rerenderedFrameRanges: [[0, newTiming.totalFrames] as [number, number]],
        reusedScenes: [],
        fullRenderReason: reason,
      },
    };
  };

  if (diff.structureChanged) return fullRender('scene structure changed (add/remove/reorder)');
  if (!windowsMatch(prevResult.timing, newTiming)) {
    return fullRender('scene frame windows shifted (dialogue/duration edit changed timing)');
  }
  if (diff.changedSceneIds.length === 0) {
    return fullRender('no scene content changed — nothing to splice, re-rendered for coherence');
  }

  const planHash = await hashScenePlan(newPlan);
  const changed = new Set(diff.changedSceneIds);

  options.onPhaseChange?.('audio-mix', 'Re-mixing audio (offline render)...');
  options.onProgress?.(2);
  const audio = await mixPlanAudio(newPlan, newTiming, options.takes, { audioAssets: options.audioAssets });
  options.onProgress?.(10);

  const handle = createWorkerHandle(options.workerUrl);
  try {
    const records: SceneRenderRecord[] = [];
    const rerenderedFrameRanges: Array<[number, number]> = [];
    let decoderConfig = prevResult.decoderConfig;
    let progressBudgetDone = 0;
    const scenesToRender = newTiming.scenes.filter((w) => changed.has(w.sceneId));
    const framesToRender = scenesToRender.reduce((sum, w) => sum + w.frameCount, 0);

    for (let i = 0; i < newPlan.scenes.length; i++) {
      const window = newTiming.scenes[i];
      const prevRecord = prevResult.sceneRecords[i];

      if (!changed.has(window.sceneId)) {
        records.push(prevRecord);
        continue;
      }

      options.onPhaseChange?.('compositing', `Re-rendering scene '${window.sceneId}'...`);
      const endFrame = window.startFrame + window.frameCount;
      const framesDone = await handle.call(
        renderFramesRequest(newPlan, options, window.startFrame, endFrame),
        'frames-done',
        (_phase, pct) => {
          const local = (pct / 100) * window.frameCount;
          options.onProgress?.(10 + Math.round(((progressBudgetDone + local) / framesToRender) * 75));
        },
      );
      progressBudgetDone += window.frameCount;
      rerenderedFrameRanges.push([window.startFrame, endFrame]);

      // The splice is only valid when both encoder sessions produced the same
      // decoder configuration (SPS/PPS). Same device + same config ⇒ same
      // bytes; verify rather than assume.
      if (!sameDecoderConfig(decoderConfig, framesDone.decoderConfig)) {
        handle.terminate();
        return fullRender('encoder decoder-config mismatch between sessions — splice would corrupt');
      }
      decoderConfig = framesDone.decoderConfig;

      records.push({
        sceneId: window.sceneId,
        contentHash: await hashScene(newPlan.scenes[i]),
        startFrame: window.startFrame,
        frameCount: window.frameCount,
        chunks: framesDone.chunks,
        frameHashes: framesDone.frameHashes,
      });
    }

    options.onPhaseChange?.('muxing', 'Re-muxing MP4 at scene boundaries...');
    const { mp4, audioCodec } = await muxRecords(
      handle, newPlan, planHash, records, decoderConfig, audio,
      (pct) => options.onProgress?.(85 + Math.round(pct * 0.15)),
    );
    options.onProgress?.(100);

    const frameHashes = records.every((r) => r.frameHashes.length === r.frameCount)
      ? records.flatMap((r) => r.frameHashes)
      : undefined;

    return {
      result: {
        mp4,
        planHash,
        fps: newPlan.fps,
        width: newPlan.resolution.width,
        height: newPlan.resolution.height,
        durationSec: newTiming.totalDuration,
        totalFrames: newTiming.totalFrames,
        audioCodec,
        audioPcmHash: audio.pcmHash,
        timing: newTiming,
        decoderConfig,
        sceneRecords: records,
        frameHashes,
      },
      partial: {
        mode: 'partial',
        rerenderedScenes: diff.changedSceneIds,
        rerenderedFrameRanges,
        reusedScenes: newPlan.scenes.map((s) => s.id).filter((id) => !changed.has(id)),
      },
    };
  } finally {
    handle.terminate();
  }
}
