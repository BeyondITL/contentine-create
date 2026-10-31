/**
 * Contentine Create — Cartoon Studio: shared typed commands + run lifecycle
 *
 * ONE set of domain operations for every caller — the timeline editor and the
 * assistant bridge (MCP) call the same methods with the same checks:
 *
 *   project_inspect      compact summary, revision, capabilities           (read)
 *   scene_propose_patch  validate + dry-run a bounded patch; no side effects (read)
 *   scene_apply_patch    atomic CAS mutation + idempotency                  (edit)
 *   voice_synthesize     create only the takes whose identity changed       (voice)
 *   render_start         run bound to a fixed input revision                (render)
 *   run_inspect          status, events, failure, artifact refs             (read)
 *   run_cancel           idempotent; works after the project moved on       (render)
 *   artifact_inspect     verified metadata / bytes of a completed run       (read)
 *
 * Trust model: the CommandContext (actor, workspace, project grant,
 * permissions) is built by the trusted application — never from model text.
 * A projectId in arguments is checked against the grant; it is not authority.
 *
 * Run states: queued → (waiting_for_renderer) → running → succeeded | failed
 * | cancelled; any non-terminal run whose page died becomes `interrupted`.
 * Success is recorded only after the MP4 exists, passes verification and is
 * stored. Mid-encode continuation is not attempted: an interrupted run is
 * restarted from its input revision with a new render_start.
 */

import { canonicalJson, diffScenePlans, hashScenePlan, sha256Hex, type DialogueLine, type ScenePlan } from '@/engine/cartoon/scene-plan';
import { computePlanTiming, takeKeyForLine } from '@/engine/cartoon/timing';
import type { VoiceTake } from '@/engine/cartoon/voice-takes';
import type { CartoonRenderResult, PartialRenderReport } from '@/engine/cartoon/cartoon-renderer';
import { takeMatchesLine } from '@/lib/cartoon/take-identity';
import {
  COMMANDS,
  RUNS,
  ProjectStoreError,
  getRecord,
  insertRunOnce,
  listRuns,
  listRunsInWorkspace,
  loadProject,
  putRecords,
  readArtifact,
  readManifest,
  updateProject,
  updateRun,
  type BlobRef,
  type LoadedProject,
  type ProjectManifestV1,
  type StoredRunBase,
} from '@/lib/cartoon/project-store';
import { CommandError, type RunFailureCode } from './errors';
import { PATCH_LIMITS, PLAN_LIMITS, applyScenePatch, checkPlanLimits, describeChanges, type PatchOp } from './patch';

// ─── Context & ports ─────────────────────────────────────────────────────────

export type Permission = 'read' | 'edit' | 'voice' | 'render';

export interface CommandContext {
  actor: { id: string; kind: 'user' | 'assistant' };
  workspaceId: string;
  /** Projects this actor may touch: '*' (the local owner) or an explicit set (a paired assistant session). */
  projects: '*' | ReadonlySet<string>;
  permissions: ReadonlySet<Permission>;
  /** Correlation id for logs/events. */
  requestId: string;
}

export interface RenderRequest {
  plan: ScenePlan;
  takes: Map<string, VoiceTake>;
  backgroundImages: Map<string, Blob>;
  audioAssets: Map<string, ArrayBuffer>;
  /** sha256 of each background asset's encoded bytes, keyed by ref (render identity). */
  assetHashes: Map<string, string>;
  previous?: { renderedPlan: ScenePlan; result: CartoonRenderResult };
  bitrate?: number;
  signal: AbortSignal;
  onProgress: (percent: number) => void;
}

export interface OutputCheck {
  hasVideo: boolean;
  hasAudio: boolean;
  durationSec: number;
  width?: number;
  height?: number;
  videoCodec?: string | null;
  audioCodec?: string | null;
}

/** The browser renderer (real implementation: browser-ports.ts). */
export interface RendererPort {
  available(): Promise<{ ok: boolean; reason?: string }>;
  render(req: RenderRequest): Promise<{ result: CartoonRenderResult; partial: PartialRenderReport }>;
  /** Independent check of the produced file (demux), not the renderer's own report. */
  verify(mp4: Blob): Promise<OutputCheck>;
}

/** Voice synthesis (real implementation: Kokoro via browser-ports.ts). */
export interface VoicePort {
  supports(voiceProfileRef: string): boolean;
  synthesize(lines: DialogueLine[], signal?: AbortSignal): Promise<Map<string, VoiceTake>>;
}

export const COMMAND_LIMITS = {
  maxVoiceLinesPerCall: 50,
  maxVoiceCharsPerCall: 10_000,
  maxTakeSeconds: 60,
  maxVideoSeconds: 600,
  maxConcurrentRunsPerWorkspace: 1,
  maxRunMs: 30 * 60_000,
  rendererWaitMs: 30_000,
  maxArtifactBytes: 512 * 1024 * 1024,
  heartbeatMs: 5_000,
  staleRunMs: 30_000,
  maxEventsReturned: 20,
} as const;

export interface CommandServiceOptions {
  renderer: RendererPort;
  voice: VoicePort;
  limits?: Partial<Record<keyof typeof COMMAND_LIMITS, number>>;
  now?: () => number;
  newRunId?: () => string;
}

// ─── Run records ─────────────────────────────────────────────────────────────

export type RunState = 'queued' | 'waiting_for_renderer' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'interrupted';

const TERMINAL: ReadonlySet<RunState> = new Set(['succeeded', 'failed', 'cancelled', 'interrupted']);

/** Permitted transitions. Terminal states have none. */
export const RUN_TRANSITIONS: Readonly<Record<RunState, readonly RunState[]>> = {
  queued: ['waiting_for_renderer', 'running', 'failed', 'cancelled', 'interrupted'],
  waiting_for_renderer: ['running', 'failed', 'cancelled', 'interrupted'],
  running: ['succeeded', 'failed', 'cancelled', 'interrupted'],
  succeeded: [],
  failed: [],
  cancelled: [],
  interrupted: [],
};

export interface RunArtifact {
  mp4: BlobRef;
  durationSec: number;
  width: number;
  height: number;
  totalFrames: number;
  audioCodec: string | null;
  planHash: string;
  check: OutputCheck;
}

export interface RunRecord extends StoredRunBase {
  actorId: string;
  requestId: string;
  idempotencyKey: string;
  inputRevision: number;
  inputPlanHash: string;
  settings: { mode: 'auto' | 'full'; bitrate: number };
  state: RunState;
  events: Array<{ at: number; state?: RunState; message: string }>;
  failure?: { code: RunFailureCode; message: string };
  artifact?: RunArtifact;
  partial?: PartialRenderReport;
  progress: number;
  createdAt: number;
  updatedAt: number;
  heartbeatAt: number;
}

export interface ApplyOutcome {
  projectId: string;
  previousRevision: number;
  revision: number;
  planHash: string;
  changedScenes: string[];
  linesNeedingVoice: string[];
  predictedRender: string;
  replayed?: boolean;
}

export interface VoiceOutcome {
  projectId: string;
  revision: number;
  synthesized: Array<{ lineId: string; takeKey: string; durationSec: number }>;
  skipped: string[];
  replayed?: boolean;
}

export interface RenderAck {
  runId: string;
  projectId: string;
  state: RunState;
  inputRevision: number;
  inputPlanHash: string;
  settings: RunRecord['settings'];
  expectedDurationSec: number;
  replayed?: boolean;
}

interface CommandRecord {
  workspaceId: string;
  actorId: string;
  key: string;
  op: string;
  projectId: string;
  payloadHash: string;
  outcome: unknown;
  createdAt: number;
}

// ─── Argument helpers ────────────────────────────────────────────────────────

type Args = Record<string, unknown>;

function asArgs(v: unknown): Args {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new CommandError('INVALID_ARGUMENT', 'arguments must be an object');
  return v as Args;
}
function str(a: Args, k: string, max = 200): string {
  const v = a[k];
  if (typeof v !== 'string' || v.length === 0 || v.length > max) throw new CommandError('INVALID_ARGUMENT', `${k} must be a non-empty string (≤ ${max} chars)`);
  return v;
}
function int(a: Args, k: string): number {
  const v = a[k];
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) throw new CommandError('INVALID_ARGUMENT', `${k} must be a non-negative integer`);
  return v;
}
const IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{8,128}$/;
function idemKey(a: Args): string {
  const v = a.idempotencyKey;
  if (typeof v !== 'string' || !IDEMPOTENCY_KEY.test(v)) {
    throw new CommandError('INVALID_ARGUMENT', 'idempotencyKey must be 8–128 chars of [A-Za-z0-9._:-]');
  }
  return v;
}
function only(a: Args, allowed: string[]): void {
  for (const k of Object.keys(a)) if (!allowed.includes(k)) throw new CommandError('INVALID_ARGUMENT', `unknown argument '${k}'`);
}

async function payloadHash(op: string, a: Args): Promise<string> {
  const rest = { ...a };
  delete rest.idempotencyKey;
  return sha256Hex(new TextEncoder().encode(canonicalJson({ op, args: rest })));
}

function fromStoreError(err: unknown): never {
  if (err instanceof CommandError) throw err;
  if (err instanceof ProjectStoreError) {
    const code = err.code === 'INVALID_PROJECT' ? 'INVALID_ARGUMENT' : err.code;
    throw new CommandError(code, err.message, err.details);
  }
  throw err;
}

const truncate = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

// ─── Service ─────────────────────────────────────────────────────────────────

export const COMMAND_NAMES = [
  'project_inspect',
  'scene_propose_patch',
  'scene_apply_patch',
  'voice_synthesize',
  'render_start',
  'run_inspect',
  'run_cancel',
  'artifact_inspect',
] as const;
export type CommandName = (typeof COMMAND_NAMES)[number];

export class CartoonCommandService {
  private readonly renderer: RendererPort;
  private readonly voice: VoicePort;
  private readonly limits: Record<keyof typeof COMMAND_LIMITS, number>;
  private readonly now: () => number;
  private readonly newRunId: () => string;
  private readonly active = new Map<string, { controller: AbortController; timedOut: boolean; progress: number }>();
  private readonly recovered = new Set<string>();

  constructor(opts: CommandServiceOptions) {
    this.renderer = opts.renderer;
    this.voice = opts.voice;
    this.limits = { ...COMMAND_LIMITS, ...(opts.limits ?? {}) } as Record<keyof typeof COMMAND_LIMITS, number>;
    this.now = opts.now ?? (() => Date.now());
    this.newRunId = opts.newRunId ?? (() => `run_${crypto.randomUUID()}`);
  }

  /** Whether this page can render right now (reported to the assistant bridge). */
  rendererStatus(): Promise<{ ok: boolean; reason?: string }> {
    return this.renderer.available().catch((e: Error) => ({ ok: false, reason: e.message }));
  }

  /** Single entry point for transports (MCP bridge). Unknown names are rejected. */
  async dispatch(name: string, ctx: CommandContext, args: unknown): Promise<unknown> {
    switch (name as CommandName) {
      case 'project_inspect': return this.projectInspect(ctx, args);
      case 'scene_propose_patch': return this.proposePatch(ctx, args);
      case 'scene_apply_patch': return this.applyPatch(ctx, args);
      case 'voice_synthesize': return this.voiceSynthesize(ctx, args);
      case 'render_start': return this.renderStart(ctx, args);
      case 'run_inspect': return this.runInspect(ctx, args);
      case 'run_cancel': return this.runCancel(ctx, args);
      case 'artifact_inspect': return this.artifactInspect(ctx, args);
      default: throw new CommandError('INVALID_ARGUMENT', `unknown command '${name}'`);
    }
  }

  // ── authorization ──

  private authorize(ctx: CommandContext, projectId: string, perm: Permission): void {
    if (!ctx || typeof ctx.workspaceId !== 'string' || !ctx.workspaceId || !ctx.actor?.id) {
      throw new CommandError('FORBIDDEN', 'missing trusted command context');
    }
    if (ctx.projects !== '*' && !ctx.projects.has(projectId)) {
      throw new CommandError('FORBIDDEN', `actor '${ctx.actor.id}' is not bound to project '${projectId}'`);
    }
    if (!ctx.permissions.has(perm)) throw new CommandError('FORBIDDEN', `actor '${ctx.actor.id}' lacks '${perm}' permission`);
  }

  private async manifest(ctx: CommandContext, projectId: string): Promise<ProjectManifestV1> {
    try {
      return await readManifest(ctx.workspaceId, projectId);
    } catch (err) {
      return fromStoreError(err);
    }
  }

  // ── idempotency ──

  private async replay<T>(ctx: CommandContext, op: string, key: string, hash: string): Promise<T | undefined> {
    const rec = await getRecord<CommandRecord>(COMMANDS, [ctx.workspaceId, ctx.actor.id, key]);
    if (!rec) return undefined;
    if (rec.op !== op || rec.payloadHash !== hash) {
      throw new CommandError('IDEMPOTENCY_KEY_REUSED', `idempotencyKey '${key}' was already used for a different request`, { op: rec.op });
    }
    return { ...(rec.outcome as object), replayed: true } as T;
  }

  private commandRecord(ctx: CommandContext, op: string, key: string, projectId: string, hash: string, outcome: unknown): CommandRecord {
    return { workspaceId: ctx.workspaceId, actorId: ctx.actor.id, key, op, projectId, payloadHash: hash, outcome, createdAt: this.now() };
  }

  // ── project_inspect ──

  async projectInspect(ctx: CommandContext, rawArgs: unknown) {
    const a = asArgs(rawArgs);
    only(a, ['projectId']);
    const projectId = str(a, 'projectId');
    this.authorize(ctx, projectId, 'read');
    await this.recover(ctx.workspaceId);
    const m = await this.manifest(ctx, projectId);
    const takes = new Map(m.takes.map((t) => [t.key, t]));
    const durations = new Map(m.takes.map((t) => [t.key, t.durationSec]));
    let sceneDurations: Map<string, number> | null = null;
    try {
      sceneDurations = new Map(computePlanTiming(m.plan, durations).scenes.map((w) => [w.sceneId, w.duration]));
    } catch {
      sceneDurations = null; // a line has no take yet
    }
    const runs = (await listRuns<RunRecord>(ctx.workspaceId, projectId)).sort((x, y) => y.createdAt - x.createdAt).slice(0, 5);
    const renderer = await this.renderer.available().catch((e: Error) => ({ ok: false, reason: e.message }));
    return {
      projectId,
      title: m.plan.title,
      revision: m.revision,
      planHash: m.planHash,
      fps: m.plan.fps,
      resolution: m.plan.resolution,
      scenes: m.plan.scenes.map((s, index) => ({
        id: s.id,
        index,
        durationSec: sceneDurations?.get(s.id) ?? null,
        background: { seed: s.background.seed, prompt: truncate(s.background.prompt, 120), assetRef: s.background.assetRef ?? null },
        characters: s.characters.map((c) => ({
          instanceId: c.instanceId,
          rigId: c.rigId,
          position: c.position,
          scale: c.scale,
          facing: c.facing ?? null,
          gestures: c.gestures.length,
          hasPalette: Boolean(c.palette && Object.keys(c.palette).length),
        })),
        dialogue: s.dialogue.map((d) => {
          const take = takes.get(takeKeyForLine(d));
          return {
            id: d.id,
            charId: d.charId,
            text: truncate(d.text, 160),
            voiceProfileRef: d.voiceProfileRef,
            take: !take ? 'missing' : takeMatchesLine(take, d) ? 'ok' : 'stale',
          };
        }),
        captions: s.captions.enabled,
        sfx: s.sfx.length,
        music: s.musicCue?.assetRef ?? null,
      })),
      renderCache: m.lastRender ? { matchesCurrentPlan: m.lastRender.renderedPlanHash === m.planHash, savedAt: m.lastRender.savedAt } : null,
      recentRuns: runs.map((r) => ({ runId: r.runId, state: r.state, inputRevision: r.inputRevision, createdAt: r.createdAt })),
      capabilities: {
        commands: COMMAND_NAMES,
        permissions: [...ctx.permissions],
        patch: {
          ops: ['replace', 'add', 'remove', 'test'],
          paths: ['/title', '/scenes/{index|@sceneId}/...'],
          idAddressing: '@<id> selects array elements by id (scenes, dialogue) or instanceId (characters)',
          immutable: ['/version', '/id', '/fps', '/resolution', '/scenes/*/id'],
          limits: { ...PATCH_LIMITS, ...PLAN_LIMITS },
        },
        renderer,
        limits: { maxVideoSeconds: this.limits.maxVideoSeconds, maxVoiceLinesPerCall: this.limits.maxVoiceLinesPerCall },
      },
    };
  }

  // ── scene_propose_patch ──

  async proposePatch(ctx: CommandContext, rawArgs: unknown) {
    const a = asArgs(rawArgs);
    only(a, ['projectId', 'baseRevision', 'ops']);
    const projectId = str(a, 'projectId');
    this.authorize(ctx, projectId, 'read');
    const m = await this.manifest(ctx, projectId);
    const baseRevision = a.baseRevision === undefined ? m.revision : int(a, 'baseRevision');
    if (baseRevision !== m.revision) {
      throw new CommandError('REVISION_CONFLICT', `Project is at revision ${m.revision}, proposal was based on ${baseRevision}`, {
        currentRevision: m.revision,
      });
    }
    const next = applyScenePatch(m.plan, a.ops);
    const impact = await this.impact(m, next);
    return {
      projectId,
      baseRevision,
      valid: true,
      proposalHash: await sha256Hex(new TextEncoder().encode(canonicalJson({ baseRevision, ops: a.ops }))),
      ...impact,
    };
  }

  private async impact(m: ProjectManifestV1, next: ScenePlan) {
    const diff = await diffScenePlans(m.plan, next);
    const takes = new Map(m.takes.map((t) => [t.key, t]));
    const linesNeedingVoice = next.scenes.flatMap((s) => s.dialogue.filter((d) => !takeMatchesLine(takes.get(takeKeyForLine(d)), d)).map((d) => d.id));
    const hintsChanged = next.scenes.some((s) => {
      const old = m.plan.scenes.find((o) => o.id === s.id);
      return old && canonicalJson(old.durationHints ?? null) !== canonicalJson(s.durationHints ?? null);
    });
    const timingMayShift = diff.structureChanged || diff.dialogueChanged || hintsChanged || linesNeedingVoice.length > 0;
    const { changes, truncated } = describeChanges(m.plan, next);
    let predictedRender: string;
    if (!m.lastRender) predictedRender = 'full (no render cache yet)';
    else if (diff.structureChanged) predictedRender = 'full (scene structure changed)';
    else if (timingMayShift) predictedRender = 'full if scene timing shifts, otherwise partial';
    else predictedRender = `partial: re-render ${diff.changedSceneIds.join(', ') || 'nothing'}`;
    return {
      changedScenes: diff.changedSceneIds,
      addedScenes: diff.addedSceneIds,
      removedScenes: diff.removedSceneIds,
      linesNeedingVoice,
      timingMayShift,
      predictedRender,
      changes,
      changesTruncated: truncated,
    };
  }

  // ── scene_apply_patch ──

  async applyPatch(ctx: CommandContext, rawArgs: unknown): Promise<ApplyOutcome> {
    const a = asArgs(rawArgs);
    only(a, ['projectId', 'expectedRevision', 'ops', 'idempotencyKey', 'note']);
    const projectId = str(a, 'projectId');
    const expectedRevision = int(a, 'expectedRevision');
    const key = idemKey(a);
    this.authorize(ctx, projectId, 'edit');
    const hash = await payloadHash('scene_apply_patch', a);
    const prior = await this.replay<ApplyOutcome>(ctx, 'scene_apply_patch', key, hash);
    if (prior) return prior;

    const m = await this.manifest(ctx, projectId);
    if (m.revision !== expectedRevision) {
      throw new CommandError('REVISION_CONFLICT', `Project is at revision ${m.revision}, expected ${expectedRevision}`, { currentRevision: m.revision });
    }
    const next = applyScenePatch(m.plan, a.ops); // complete validation before any write
    const impact = await this.impact(m, next);
    const note = typeof a.note === 'string' ? truncate(a.note, 200) : `patch (${(a.ops as PatchOp[]).length} ops)`;

    const outcomeBase = { projectId, previousRevision: expectedRevision, changedScenes: impact.changedScenes, linesNeedingVoice: impact.linesNeedingVoice, predictedRender: impact.predictedRender };
    try {
      const planHash = await hashScenePlan(next);
      const outcome = { ...outcomeBase, revision: expectedRevision + 1, planHash };
      await updateProject(ctx.workspaceId, projectId, expectedRevision, { plan: next, actorId: ctx.actor.id, note }, [
        { store: COMMANDS, value: this.commandRecord(ctx, 'scene_apply_patch', key, projectId, hash, outcome) },
      ]);
      return outcome;
    } catch (err) {
      if (err instanceof ProjectStoreError && err.code === 'REVISION_CONFLICT') {
        // A concurrent duplicate may have committed this exact request.
        const again = await this.replay<ApplyOutcome>(ctx, 'scene_apply_patch', key, hash);
        if (again) return again;
      }
      return fromStoreError(err);
    }
  }

  // ── voice_synthesize ──

  async voiceSynthesize(ctx: CommandContext, rawArgs: unknown): Promise<VoiceOutcome> {
    const a = asArgs(rawArgs);
    only(a, ['projectId', 'expectedRevision', 'idempotencyKey', 'lineIds']);
    const projectId = str(a, 'projectId');
    const expectedRevision = int(a, 'expectedRevision');
    const key = idemKey(a);
    this.authorize(ctx, projectId, 'voice');
    const hash = await payloadHash('voice_synthesize', a);
    const prior = await this.replay<VoiceOutcome>(ctx, 'voice_synthesize', key, hash);
    if (prior) return prior;

    const m = await this.manifest(ctx, projectId);
    if (m.revision !== expectedRevision) {
      throw new CommandError('REVISION_CONFLICT', `Project is at revision ${m.revision}, expected ${expectedRevision}`, { currentRevision: m.revision });
    }
    const allLines = m.plan.scenes.flatMap((s) => s.dialogue);
    let requested: DialogueLine[] = allLines;
    if (a.lineIds !== undefined) {
      if (!Array.isArray(a.lineIds) || a.lineIds.some((x) => typeof x !== 'string')) throw new CommandError('INVALID_ARGUMENT', 'lineIds must be an array of strings');
      const byId = new Map(allLines.map((l) => [l.id, l]));
      requested = (a.lineIds as string[]).map((id) => {
        const l = byId.get(id);
        if (!l) throw new CommandError('INVALID_ARGUMENT', `unknown dialogue line '${id}'`);
        return l;
      });
    }
    const takes = new Map(m.takes.map((t) => [t.key, t]));
    const needed = requested.filter((l) => !takeMatchesLine(takes.get(takeKeyForLine(l)), l));
    const skipped = requested.filter((l) => !needed.includes(l)).map((l) => l.id);
    // Two lines sharing a pinned takeRef need only one synthesis.
    const unique = [...new Map(needed.map((l) => [takeKeyForLine(l), l])).values()];

    if (unique.length === 0) {
      const outcome: VoiceOutcome = { projectId, revision: m.revision, synthesized: [], skipped };
      await putRecords([{ store: COMMANDS, value: this.commandRecord(ctx, 'voice_synthesize', key, projectId, hash, outcome) }]);
      return outcome;
    }
    if (unique.length > this.limits.maxVoiceLinesPerCall) {
      throw new CommandError('LIMIT_EXCEEDED', `${unique.length} lines need voice; at most ${this.limits.maxVoiceLinesPerCall} per call`, { linesNeedingVoice: unique.map((l) => l.id) });
    }
    const chars = unique.reduce((n, l) => n + l.text.length, 0);
    if (chars > this.limits.maxVoiceCharsPerCall) throw new CommandError('LIMIT_EXCEEDED', `${chars} characters exceeds ${this.limits.maxVoiceCharsPerCall} per call`);
    for (const l of unique) {
      if (!this.voice.supports(l.voiceProfileRef)) throw new CommandError('UNSUPPORTED_ENGINE', `voice '${l.voiceProfileRef}' (line '${l.id}') is not available in this build`);
    }

    const produced = await this.voice.synthesize(unique);
    const putTakes = new Map<string, VoiceTake>();
    for (const l of unique) {
      const k = takeKeyForLine(l);
      const t = produced.get(k);
      if (!t || !takeMatchesLine(t, l) || !(t.pcm instanceof Float32Array) || t.pcm.length === 0) {
        throw new CommandError('STORAGE_FAILED', `voice engine returned no matching take for line '${l.id}'`);
      }
      if (t.durationSec > this.limits.maxTakeSeconds) throw new CommandError('LIMIT_EXCEEDED', `take for '${l.id}' is ${t.durationSec.toFixed(1)}s (limit ${this.limits.maxTakeSeconds}s)`);
      putTakes.set(k, { ...t, pcmHash: await sha256Hex(new Uint8Array(t.pcm.buffer, t.pcm.byteOffset, t.pcm.byteLength)) });
    }
    const outcome: VoiceOutcome = {
      projectId,
      revision: expectedRevision + 1,
      synthesized: unique.map((l) => ({ lineId: l.id, takeKey: takeKeyForLine(l), durationSec: Number(putTakes.get(takeKeyForLine(l))!.durationSec.toFixed(3)) })),
      skipped,
    };
    try {
      await updateProject(ctx.workspaceId, projectId, expectedRevision, { putTakes, actorId: ctx.actor.id, note: `voice: ${unique.length} take(s)` }, [
        { store: COMMANDS, value: this.commandRecord(ctx, 'voice_synthesize', key, projectId, hash, outcome) },
      ]);
    } catch (err) {
      if (err instanceof ProjectStoreError && err.code === 'REVISION_CONFLICT') {
        const again = await this.replay<VoiceOutcome>(ctx, 'voice_synthesize', key, hash);
        if (again) return again;
      }
      return fromStoreError(err);
    }
    return outcome;
  }

  // ── render_start ──

  async renderStart(ctx: CommandContext, rawArgs: unknown): Promise<RenderAck> {
    const a = asArgs(rawArgs);
    only(a, ['projectId', 'expectedRevision', 'idempotencyKey', 'mode']);
    const projectId = str(a, 'projectId');
    const expectedRevision = int(a, 'expectedRevision');
    const key = idemKey(a);
    const mode = a.mode === undefined ? 'auto' : a.mode;
    if (mode !== 'auto' && mode !== 'full') throw new CommandError('INVALID_ARGUMENT', "mode must be 'auto' or 'full'");
    this.authorize(ctx, projectId, 'render');
    await this.recover(ctx.workspaceId);
    const hash = await payloadHash('render_start', a);
    const prior = await this.replay<RenderAck>(ctx, 'render_start', key, hash);
    if (prior) return prior;

    const m = await this.manifest(ctx, projectId);
    if (m.revision !== expectedRevision) {
      throw new CommandError('REVISION_CONFLICT', `Project is at revision ${m.revision}, expected ${expectedRevision}`, { currentRevision: m.revision });
    }
    const takes = new Map(m.takes.map((t) => [t.key, t]));
    const missing = m.plan.scenes.flatMap((s) => s.dialogue).filter((d) => !takeMatchesLine(takes.get(takeKeyForLine(d)), d)).map((d) => d.id);
    if (missing.length) throw new CommandError('TAKES_MISSING', `${missing.length} line(s) need voice_synthesize before rendering`, { lineIds: missing });
    checkPlanLimits(m.plan);
    const timing = computePlanTiming(m.plan, new Map(m.takes.map((t) => [t.key, t.durationSec])));
    if (timing.totalDuration > this.limits.maxVideoSeconds) {
      throw new CommandError('LIMIT_EXCEEDED', `video would be ${timing.totalDuration.toFixed(1)}s (limit ${this.limits.maxVideoSeconds}s)`);
    }

    // Snapshot the input revision NOW (verified bytes); the run is bound to it.
    let project: LoadedProject;
    try {
      project = await loadProject(ctx.workspaceId, projectId);
    } catch (err) {
      return fromStoreError(err);
    }
    if (project.revision !== expectedRevision) {
      throw new CommandError('REVISION_CONFLICT', `Project moved to revision ${project.revision} while starting`, { currentRevision: project.revision });
    }

    const now = this.now();
    const run: RunRecord = {
      workspaceId: ctx.workspaceId,
      runId: this.newRunId(),
      projectId,
      actorId: ctx.actor.id,
      requestId: ctx.requestId,
      idempotencyKey: key,
      inputRevision: expectedRevision,
      inputPlanHash: m.planHash,
      settings: { mode, bitrate: project.exportConfig.bitrate ?? 8_000_000 },
      state: 'queued',
      events: [{ at: now, state: 'queued', message: `queued by ${ctx.actor.kind} ${ctx.actor.id} at revision ${expectedRevision}` }],
      progress: 0,
      createdAt: now,
      updatedAt: now,
      heartbeatAt: now,
    };
    const ack: RenderAck = {
      runId: run.runId,
      projectId,
      state: run.state,
      inputRevision: run.inputRevision,
      inputPlanHash: run.inputPlanHash,
      settings: run.settings,
      expectedDurationSec: Number(timing.totalDuration.toFixed(3)),
    };
    const created = await insertRunOnce(
      this.commandRecord(ctx, 'render_start', key, projectId, hash, ack),
      run,
      (r) => !TERMINAL.has((r as RunRecord).state),
      this.limits.maxConcurrentRunsPerWorkspace,
    );
    if (created.status === 'duplicate') {
      const rec = created.existing;
      if (rec.op !== 'render_start' || rec.payloadHash !== hash) {
        throw new CommandError('IDEMPOTENCY_KEY_REUSED', `idempotencyKey '${key}' was already used for a different request`, { op: rec.op });
      }
      return { ...(rec.outcome as RenderAck), replayed: true };
    }
    if (created.status === 'busy') {
      const a = created.active as RunRecord;
      throw new CommandError('BUSY', `run ${a.runId} is still ${a.state}; cancel it or wait`, { runId: a.runId });
    }
    const assetHashes = new Map(m.backgroundImages.map((x) => [x.ref, x.data.sha256]));
    void this.execute(run, project, assetHashes, timing.totalDuration);
    return ack;
  }

  private async transition(ws: string, runId: string, to: RunState, message: string, patch: Partial<RunRecord> = {}): Promise<RunRecord | undefined> {
    const { run, applied } = await updateRun<RunRecord>(ws, runId, (cur) => {
      if (!cur || !RUN_TRANSITIONS[cur.state].includes(to)) return null;
      const at = this.now();
      return { ...cur, ...patch, state: to, updatedAt: at, heartbeatAt: at, events: [...cur.events, { at, state: to, message }].slice(-200) };
    });
    return applied ? run : undefined;
  }

  private async execute(run: RunRecord, project: LoadedProject, assetHashes: Map<string, string>, expectedDuration: number): Promise<void> {
    const ws = run.workspaceId;
    const handle = { controller: new AbortController(), timedOut: false, progress: 0 };
    this.active.set(run.runId, handle);
    const { signal } = handle.controller;
    const timeout = setTimeout(() => {
      handle.timedOut = true;
      handle.controller.abort();
    }, this.limits.maxRunMs);
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    try {
      // 1. Renderer availability (bounded wait).
      let avail = await this.renderer.available().catch((e: Error) => ({ ok: false, reason: e.message }));
      if (!avail.ok) {
        await this.transition(ws, run.runId, 'waiting_for_renderer', `renderer unavailable: ${avail.reason ?? 'unknown'}`);
        const deadline = this.now() + this.limits.rendererWaitMs;
        while (!avail.ok && this.now() < deadline && !signal.aborted) {
          await new Promise((r) => setTimeout(r, 500));
          avail = await this.renderer.available().catch((e: Error) => ({ ok: false, reason: e.message }));
        }
        if (signal.aborted) return;
        if (!avail.ok) {
          await this.transition(ws, run.runId, 'failed', 'renderer did not become available', {
            failure: { code: 'RENDERER_UNAVAILABLE', message: avail.reason ?? 'renderer unavailable' },
          });
          return;
        }
      }
      if (!(await this.transition(ws, run.runId, 'running', 'rendering'))) return; // cancelled meanwhile

      heartbeat = setInterval(() => {
        void updateRun<RunRecord>(ws, run.runId, (cur) =>
          cur && cur.state === 'running' ? { ...cur, heartbeatAt: this.now(), progress: handle.progress } : null,
        ).catch(() => {});
      }, this.limits.heartbeatMs);

      // 2. Render from the snapshot taken at render_start.
      const previous = run.settings.mode === 'auto' ? project.lastRender : undefined;
      const { result, partial } = await this.renderer.render({
        plan: project.plan,
        takes: project.takes,
        backgroundImages: project.backgroundImages,
        audioAssets: project.audioAssets,
        assetHashes,
        previous,
        bitrate: run.settings.bitrate,
        signal,
        onProgress: (p) => {
          handle.progress = p;
        },
      });
      if (signal.aborted) throw new DOMException('cancelled', 'AbortError');

      // 3. Independent verification before success.
      const bytes = new Uint8Array(await result.mp4.arrayBuffer());
      if (bytes.byteLength > this.limits.maxArtifactBytes) {
        await this.transition(ws, run.runId, 'failed', 'output too large', { failure: { code: 'LIMIT_EXCEEDED', message: `MP4 is ${bytes.byteLength} bytes` } });
        return;
      }
      const check = await this.renderer.verify(result.mp4);
      const problems: string[] = [];
      if (!check.hasVideo) problems.push('no video track');
      if (!check.hasAudio) problems.push('no audio track');
      if (Math.abs(check.durationSec - expectedDuration) > 0.5) problems.push(`duration ${check.durationSec.toFixed(2)}s ≠ expected ${expectedDuration.toFixed(2)}s`);
      if (check.width !== undefined && check.width !== project.plan.resolution.width) problems.push(`width ${check.width}`);
      if (check.height !== undefined && check.height !== project.plan.resolution.height) problems.push(`height ${check.height}`);
      if (result.planHash !== run.inputPlanHash) problems.push('rendered plan hash differs from the run input');
      if (problems.length) {
        await this.transition(ws, run.runId, 'failed', 'output failed verification', { failure: { code: 'OUTPUT_INVALID', message: problems.join('; ') } });
        return;
      }

      // 4. Store artifact + success atomically; a cancel that landed first wins.
      const at = this.now();
      await updateRun<RunRecord>(
        ws,
        run.runId,
        (cur, mp4) => {
          if (!cur || cur.state !== 'running' || !mp4) return null;
          return {
            ...cur,
            state: 'succeeded',
            progress: 100,
            updatedAt: at,
            heartbeatAt: at,
            partial,
            artifact: {
              mp4,
              durationSec: result.durationSec,
              width: result.width,
              height: result.height,
              totalFrames: result.totalFrames,
              audioCodec: result.audioCodec,
              planHash: result.planHash,
              check,
            },
            events: [...cur.events, { at, state: 'succeeded', message: `${partial.mode} render verified (${check.durationSec.toFixed(2)}s)` }],
          };
        },
        { mp4: bytes, renderCache: { renderedPlan: project.plan, result } },
      );
    } catch (err) {
      if (signal.aborted && !handle.timedOut) {
        await this.transition(ws, run.runId, 'cancelled', 'render aborted').catch(() => {});
      } else if (handle.timedOut) {
        await this.transition(ws, run.runId, 'failed', 'run time limit reached', {
          failure: { code: 'LIMIT_EXCEEDED', message: `run exceeded ${this.limits.maxRunMs} ms` },
        }).catch(() => {});
      } else {
        const message = err instanceof Error ? err.message : String(err);
        const code: RunFailureCode = err instanceof ProjectStoreError ? 'STORAGE_FAILED' : 'RENDER_FAILED';
        await this.transition(ws, run.runId, 'failed', 'render failed', { failure: { code, message: truncate(message, 500) } }).catch(() => {});
      }
    } finally {
      clearTimeout(timeout);
      if (heartbeat) clearInterval(heartbeat);
      this.active.delete(run.runId);
    }
  }

  /** Wait for a run started by THIS service instance to settle (tests, harness, UI). */
  async settled(runId: string, pollMs = 50): Promise<void> {
    while (this.active.has(runId)) await new Promise((r) => setTimeout(r, pollMs));
  }

  // ── recovery ──

  /**
   * Mark runs whose page died as `interrupted` (no heartbeat for staleRunMs
   * and not active in this instance). Output is never resumed mid-encode.
   */
  async recover(workspaceId: string, force = false): Promise<string[]> {
    if (this.recovered.has(workspaceId) && !force) return [];
    this.recovered.add(workspaceId);
    const now = this.now();
    const out: string[] = [];
    for (const r of await listRunsInWorkspace<RunRecord>(workspaceId)) {
      if (TERMINAL.has(r.state) || this.active.has(r.runId)) continue;
      if (now - r.heartbeatAt < this.limits.staleRunMs) continue;
      const done = await this.transition(workspaceId, r.runId, 'interrupted', 'no heartbeat — the page closed or crashed during the run', {
        failure: { code: 'INTERRUPTED', message: 'Run was interrupted; start a new render from the same revision' },
      });
      if (done) out.push(r.runId);
    }
    return out;
  }

  // ── run_inspect ──

  private async runFor(ctx: CommandContext, runId: string, perm: Permission): Promise<RunRecord> {
    const run = await getRecord<RunRecord>(RUNS, [ctx.workspaceId, runId]);
    if (!run) throw new CommandError('NOT_FOUND', `No run '${runId}' in this workspace`);
    this.authorize(ctx, run.projectId, perm);
    return run;
  }

  async runInspect(ctx: CommandContext, rawArgs: unknown) {
    const a = asArgs(rawArgs);
    only(a, ['runId']);
    const run = await this.runFor(ctx, str(a, 'runId'), 'read');
    const live = this.active.get(run.runId);
    return {
      runId: run.runId,
      projectId: run.projectId,
      state: run.state,
      terminal: TERMINAL.has(run.state),
      inputRevision: run.inputRevision,
      inputPlanHash: run.inputPlanHash,
      settings: run.settings,
      progress: live ? live.progress : run.progress,
      events: run.events.slice(-this.limits.maxEventsReturned),
      failure: run.failure ?? null,
      partial: run.partial ? { mode: run.partial.mode, rerenderedScenes: run.partial.rerenderedScenes, reusedScenes: run.partial.reusedScenes, fullRenderReason: run.partial.fullRenderReason ?? null } : null,
      artifact: run.artifact ? { artifactId: `${run.runId}/mp4`, sha256: run.artifact.mp4.sha256, sizeBytes: run.artifact.mp4.size, durationSec: run.artifact.durationSec } : null,
    };
  }

  // ── run_cancel ──

  async runCancel(ctx: CommandContext, rawArgs: unknown) {
    const a = asArgs(rawArgs);
    only(a, ['runId', 'idempotencyKey']);
    if (a.idempotencyKey !== undefined) idemKey(a); // validated; cancel is idempotent by run state
    const run = await this.runFor(ctx, str(a, 'runId'), 'render');
    if (TERMINAL.has(run.state)) return { runId: run.runId, state: run.state, alreadyTerminal: true };
    const after = await this.transition(ctx.workspaceId, run.runId, 'cancelled', `cancelled by ${ctx.actor.kind} ${ctx.actor.id}`);
    this.active.get(run.runId)?.controller.abort();
    if (!after) {
      const now = await getRecord<RunRecord>(RUNS, [ctx.workspaceId, run.runId]);
      return { runId: run.runId, state: now?.state ?? run.state, alreadyTerminal: true };
    }
    return { runId: run.runId, state: 'cancelled' as const, alreadyTerminal: false };
  }

  // ── artifact_inspect ──

  async artifactInspect(ctx: CommandContext, rawArgs: unknown): Promise<{ metadata: Record<string, unknown>; mp4?: Blob }> {
    const a = asArgs(rawArgs);
    only(a, ['runId', 'include']);
    const include = a.include === undefined ? 'metadata' : a.include;
    if (include !== 'metadata' && include !== 'bytes') throw new CommandError('INVALID_ARGUMENT', "include must be 'metadata' or 'bytes'");
    const run = await this.runFor(ctx, str(a, 'runId'), 'read');
    if (run.state !== 'succeeded' || !run.artifact) {
      throw new CommandError('RUN_NOT_SUCCEEDED', `run ${run.runId} is ${run.state}; it has no artifact`, { state: run.state });
    }
    const art = run.artifact;
    const metadata = {
      artifactId: `${run.runId}/mp4`,
      runId: run.runId,
      projectId: run.projectId,
      inputRevision: run.inputRevision,
      planHash: art.planHash,
      mimeType: 'video/mp4',
      sha256: art.mp4.sha256,
      sizeBytes: art.mp4.size,
      durationSec: art.durationSec,
      width: art.width,
      height: art.height,
      totalFrames: art.totalFrames,
      audioCodec: art.audioCodec,
      verification: art.check,
      renderMode: run.partial?.mode ?? null,
    };
    if (include === 'metadata') return { metadata };
    if (art.mp4.size > this.limits.maxArtifactBytes) throw new CommandError('LIMIT_EXCEEDED', 'artifact exceeds the retrieval limit');
    try {
      const bytes = await readArtifact(ctx.workspaceId, art.mp4);
      return { metadata, mp4: new Blob([bytes.slice()], { type: 'video/mp4' }) };
    } catch (err) {
      return fromStoreError(err);
    }
  }
}
