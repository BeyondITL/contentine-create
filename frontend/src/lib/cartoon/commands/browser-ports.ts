/**
 * Real browser implementations of the command-layer ports, plus the page's
 * single CartoonCommandService. The editor UI and the assistant bridge both
 * obtain the service here, so they share one instance, one run registry and
 * one storage path.
 *
 * Engine code is imported dynamically (Law L8).
 */

import type { DialogueLine, ScenePlan } from '@/engine/cartoon/scene-plan';
import type { VoiceTake } from '@/engine/cartoon/voice-takes';
import type { CartoonRenderResult } from '@/engine/cartoon/cartoon-renderer';
import { ProjectStoreError, readManifest, saveProject } from '@/lib/cartoon/project-store';
import { CartoonCommandService, type CommandContext, type OutputCheck, type RenderRequest, type RendererPort, type VoicePort } from './service';

type Engine = typeof import('@/engine/cartoon');
let enginePromise: Promise<Engine> | null = null;
const engine = () => (enginePromise ??= import('@/engine/cartoon'));

const KOKORO_REF = /^kokoro:[A-Za-z0-9_]+(?:@[0-9.]+)?$/;

export function createBrowserRenderer(opts: { workerUrl?: string } = {}): RendererPort {
  const workerUrl = opts.workerUrl ?? '/render-worker.js';
  return {
    async available() {
      if (typeof window === 'undefined') return { ok: false, reason: 'not running in a browser page' };
      const g = globalThis as Record<string, unknown>;
      for (const api of ['VideoEncoder', 'OffscreenCanvas', 'OfflineAudioContext', 'Worker']) {
        if (typeof g[api] === 'undefined') return { ok: false, reason: `${api} is not available in this browser` };
      }
      const support = await (globalThis as unknown as { VideoEncoder: typeof VideoEncoder }).VideoEncoder.isConfigSupported({
        codec: 'avc1.640028',
        width: 1920,
        height: 1080,
        hardwareAcceleration: 'prefer-software',
      }).catch(() => ({ supported: false }));
      if (!support.supported) return { ok: false, reason: 'H.264 encoding is not supported in this browser' };
      return { ok: true };
    },

    async render(req: RenderRequest) {
      const e = await engine();
      const backgroundAssets = new Map<string, ImageBitmap>();
      for (const [ref, blob] of req.backgroundImages) backgroundAssets.set(ref, await createImageBitmap(blob));
      const options = {
        takes: req.takes,
        audioAssets: req.audioAssets,
        backgroundAssets,
        assetHashes: req.assetHashes,
        bitrate: req.bitrate,
        signal: req.signal,
        workerUrl,
        onProgress: req.onProgress,
      };
      try {
        if (req.previous) return await e.rerenderEditedProject(req.previous.renderedPlan, req.previous.result, req.plan, options);
        const result = await e.renderCartoonProject(req.plan, options);
        return {
          result,
          partial: {
            mode: 'full' as const,
            rerenderedScenes: req.plan.scenes.map((s) => s.id),
            rerenderedFrameRanges: [[0, result.totalFrames] as [number, number]],
            reusedScenes: [],
            fullRenderReason: 'no render cache',
          },
        };
      } finally {
        for (const bmp of backgroundAssets.values()) bmp.close();
      }
    },

    async verify(mp4: Blob): Promise<OutputCheck> {
      const e = await engine();
      const probe = await e.probeMp4(mp4);
      const video = probe.tracks.find((t) => t.type === 'video');
      const audio = probe.tracks.find((t) => t.type === 'audio');
      return {
        hasVideo: Boolean(video && video.packetCount > 0),
        hasAudio: Boolean(audio && audio.packetCount > 0),
        durationSec: probe.durationSec,
        width: video?.width,
        height: video?.height,
        videoCodec: video?.codec ?? null,
        audioCodec: audio?.codec ?? null,
      };
    },
  };
}

export function createKokoroVoice(): VoicePort {
  return {
    supports: (ref) => KOKORO_REF.test(ref),
    async synthesize(lines: DialogueLine[]): Promise<Map<string, VoiceTake>> {
      const e = await engine();
      // synthesizeTakes only reads `scenes[].dialogue`: a one-scene carrier
      // holding exactly the requested lines synthesizes exactly those.
      const carrier = { scenes: [{ dialogue: lines }] } as unknown as Parameters<Engine['synthesizeTakes']>[0];
      return e.synthesizeTakes(carrier);
    },
  };
}

let service: CartoonCommandService | null = null;

/** The page's single command service (shared by the editor and the assistant bridge). */
export function getCartoonCommands(): CartoonCommandService {
  return (service ??= new CartoonCommandService({ renderer: createBrowserRenderer(), voice: createKokoroVoice() }));
}

/** The local workspace every on-device project lives in (no account required — Law L2). */
export const LOCAL_WORKSPACE = 'local';

/** Context for the person using this browser: full access to their local workspace. */
export function localOwnerContext(requestId = crypto.randomUUID()): CommandContext {
  return {
    actor: { id: 'local-owner', kind: 'user' },
    workspaceId: LOCAL_WORKSPACE,
    projects: '*',
    permissions: new Set(['read', 'edit', 'voice', 'render']),
    requestId,
  };
}

/**
 * Make sure a freshly rendered session exists as a saved local project and
 * return its current revision/plan (the CAS base for edits). An existing
 * project is never overwritten.
 */
export async function ensureLocalProject(s: {
  plan: ScenePlan;
  takes: Map<string, VoiceTake>;
  result: CartoonRenderResult;
}): Promise<{ workspaceId: string; revision: number; plan: ScenePlan }> {
  try {
    const m = await readManifest(LOCAL_WORKSPACE, s.plan.id);
    return { workspaceId: LOCAL_WORKSPACE, revision: m.revision, plan: m.plan };
  } catch (err) {
    if (!(err instanceof ProjectStoreError && err.code === 'NOT_FOUND')) throw err;
  }
  const saved = await saveProject(
    { workspaceId: LOCAL_WORKSPACE, plan: s.plan, takes: s.takes, lastRender: { renderedPlan: s.plan, result: s.result } },
    { expectedRevision: null },
  );
  return { workspaceId: LOCAL_WORKSPACE, revision: saved.revision, plan: s.plan };
}
