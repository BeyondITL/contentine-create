/**
 * Contentine Create — Cartoon Engine: Scene-Plan Schema (v1)
 *
 * The scene plan is the SOURCE OF TRUTH for a cartoon project. The MP4 is a
 * print-out; every edit mutates the plan, never the video. The plan is
 * versioned JSON, canonically serializable, and content-addressable:
 *  - `hashScenePlan()`   — identity of the whole project (determinism anchor)
 *  - `hashScene()`       — per-scene content hash (dirty tracking for
 *                          partial re-renders)
 *  - `diffScenePlans()`  — which scenes changed between two plans
 *
 * Law L6: same plan (+ same pinned voice takes) ⇒ same rendered frames.
 */

// ─── Version ─────────────────────────────────────────────────────────────────

export const SCENE_PLAN_VERSION = 1 as const;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface BackgroundSpec {
  /** Prompt used (or to be used) for SD-Turbo background generation. */
  prompt: string;
  /** Seed-lock for generated assets (Law L6). Also seeds the procedural background painter. */
  seed: number;
  /**
   * Content-addressed reference to a pre-generated background asset
   * (ImageBitmap supplied via the render asset map). When absent, the
   * renderer paints a deterministic procedural background from `seed`.
   */
  assetRef?: string;
}

export type EntranceType = 'walk-in' | 'pop-in' | 'fade-in' | 'none';
export type ExitType = 'walk-out' | 'pop-out' | 'fade-out' | 'none';
export type StageSide = 'left' | 'right' | 'bottom';

export interface GestureCue {
  /** Gesture name — must exist in the character's rig gesture library. */
  name: string;
  /** Seconds from scene start. */
  at: number;
  /** Seconds; rig default used when omitted. */
  duration?: number;
}

export interface CharacterBlock {
  /** Rig-pack id (WS-3 packs later; `tracer-stick` ships with the engine). */
  rigId: string;
  /** Unique id of this character instance within the scene — dialogue refers to it. */
  instanceId: string;
  /** Normalized stage position (0..1 in both axes, origin top-left, y = feet line). */
  position: { x: number; y: number };
  /** 1.0 = rig natural size relative to stage height. */
  scale: number;
  facing?: 'left' | 'right';
  /** Optional palette overrides, keyed by rig palette slot. */
  palette?: Record<string, string>;
  gestures: GestureCue[];
  entrance?: { type: EntranceType; from?: StageSide; duration: number };
  exit?: { type: ExitType; to?: StageSide; duration: number };
}

export interface DialogueLine {
  /** Stable id — voice takes are keyed by `takeRef ?? id`. */
  id: string;
  /** `instanceId` of the speaking character in this scene. */
  charId: string;
  text: string;
  /** Voice profile reference, e.g. `kokoro:af_sky@1.0` (engine:voice@speed). */
  voiceProfileRef: string;
  /** Pinned audio take id. When set, re-synthesis is forbidden — determinism anchor. */
  takeRef?: string;
  /** Silence after this line, seconds. Default 0.35. */
  pauseAfter?: number;
}

export interface SfxCue {
  /** `proc:<name>` = built-in procedural sfx; `asset:<id>` = supplied audio asset. */
  assetRef: string;
  /** Seconds from scene start. */
  at: number;
  /** Linear gain 0..1. Default 0.8. */
  gain?: number;
}

export interface MusicCue {
  /** `proc:<name>` = built-in procedural bed; `asset:<id>` = supplied audio asset (CC0/owned, WS-6 ledger). */
  assetRef: string;
  /** Linear gain 0..1. Default 0.35. */
  gain?: number;
  /** Gain the music ducks to while dialogue plays. Default 0.12. */
  duckTo?: number;
}

export interface CaptionSpec {
  enabled: boolean;
  /** Caption style preset, e.g. `bottom-bar`. */
  style: string;
}

export interface DurationHints {
  /** Scene will not be shorter than this (seconds). */
  min?: number;
  /** Scene will be cut at this length (seconds). */
  max?: number;
  /** Hold after the last dialogue line ends (seconds). Default 0.8. */
  holdAfterDialogue?: number;
}

export interface ScenePlanScene {
  id: string;
  background: BackgroundSpec;
  characters: CharacterBlock[];
  dialogue: DialogueLine[];
  captions: CaptionSpec;
  sfx: SfxCue[];
  musicCue?: MusicCue;
  durationHints?: DurationHints;
}

export interface ScenePlan {
  version: typeof SCENE_PLAN_VERSION;
  id: string;
  title: string;
  fps: number;
  resolution: { width: number; height: number };
  scenes: ScenePlanScene[];
}

// ─── Validation ──────────────────────────────────────────────────────────────

export interface PlanValidationResult {
  ok: boolean;
  errors: string[];
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Structural validation of a parsed scene plan. Returns every error found. */
export function validateScenePlan(plan: unknown): PlanValidationResult {
  const errors: string[] = [];
  const p = plan as ScenePlan;

  if (!p || typeof p !== 'object') return { ok: false, errors: ['plan is not an object'] };
  if (p.version !== SCENE_PLAN_VERSION) errors.push(`unsupported plan version: ${String(p.version)} (expected ${SCENE_PLAN_VERSION})`);
  if (typeof p.id !== 'string' || !p.id) errors.push('plan.id missing');
  if (typeof p.title !== 'string') errors.push('plan.title missing');
  if (!isFiniteNumber(p.fps) || p.fps <= 0 || p.fps > 120) errors.push(`plan.fps invalid: ${String(p.fps)}`);
  if (!p.resolution || !isFiniteNumber(p.resolution.width) || !isFiniteNumber(p.resolution.height)) {
    errors.push('plan.resolution invalid');
  }
  if (!Array.isArray(p.scenes) || p.scenes.length === 0) {
    errors.push('plan.scenes must be a non-empty array');
    return { ok: errors.length === 0, errors };
  }

  const sceneIds = new Set<string>();
  for (let i = 0; i < p.scenes.length; i++) {
    const s = p.scenes[i];
    const where = `scenes[${i}]`;
    if (!s || typeof s !== 'object') { errors.push(`${where} is not an object`); continue; }
    if (typeof s.id !== 'string' || !s.id) errors.push(`${where}.id missing`);
    else if (sceneIds.has(s.id)) errors.push(`${where}.id duplicate: ${s.id}`);
    else sceneIds.add(s.id);

    if (!s.background || typeof s.background.prompt !== 'string' || !isFiniteNumber(s.background.seed)) {
      errors.push(`${where}.background needs {prompt, seed}`);
    }
    if (!Array.isArray(s.characters)) { errors.push(`${where}.characters must be an array`); continue; }

    const instanceIds = new Set<string>();
    for (let c = 0; c < s.characters.length; c++) {
      const ch = s.characters[c];
      const cw = `${where}.characters[${c}]`;
      if (typeof ch.rigId !== 'string' || !ch.rigId) errors.push(`${cw}.rigId missing`);
      if (typeof ch.instanceId !== 'string' || !ch.instanceId) errors.push(`${cw}.instanceId missing`);
      else if (instanceIds.has(ch.instanceId)) errors.push(`${cw}.instanceId duplicate: ${ch.instanceId}`);
      else instanceIds.add(ch.instanceId);
      if (!ch.position || !isFiniteNumber(ch.position.x) || !isFiniteNumber(ch.position.y)) errors.push(`${cw}.position invalid`);
      if (!isFiniteNumber(ch.scale) || ch.scale <= 0) errors.push(`${cw}.scale invalid`);
      if (!Array.isArray(ch.gestures)) errors.push(`${cw}.gestures must be an array`);
      else for (const g of ch.gestures) {
        if (typeof g.name !== 'string' || !isFiniteNumber(g.at) || g.at < 0) errors.push(`${cw} gesture invalid: ${JSON.stringify(g)}`);
      }
    }

    if (!Array.isArray(s.dialogue)) { errors.push(`${where}.dialogue must be an array`); continue; }
    for (let d = 0; d < s.dialogue.length; d++) {
      const line = s.dialogue[d];
      const dw = `${where}.dialogue[${d}]`;
      if (typeof line.id !== 'string' || !line.id) errors.push(`${dw}.id missing`);
      if (typeof line.text !== 'string' || !line.text.trim()) errors.push(`${dw}.text empty`);
      if (typeof line.voiceProfileRef !== 'string' || !line.voiceProfileRef) errors.push(`${dw}.voiceProfileRef missing`);
      if (typeof line.charId !== 'string' || !instanceIds.has(line.charId)) {
        errors.push(`${dw}.charId '${String(line.charId)}' does not match a character instanceId in the scene`);
      }
    }

    if (!s.captions || typeof s.captions.enabled !== 'boolean') errors.push(`${where}.captions needs {enabled, style}`);
    if (!Array.isArray(s.sfx)) errors.push(`${where}.sfx must be an array`);
    else for (const fx of s.sfx) {
      if (typeof fx.assetRef !== 'string' || !isFiniteNumber(fx.at) || fx.at < 0) errors.push(`${where} sfx invalid: ${JSON.stringify(fx)}`);
    }
    if (s.musicCue && typeof s.musicCue.assetRef !== 'string') errors.push(`${where}.musicCue.assetRef missing`);
  }

  return { ok: errors.length === 0, errors };
}

// ─── Canonical serialization + hashing ───────────────────────────────────────

/** Recursively sort object keys so serialization is order-independent. */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v !== undefined) out[key] = canonicalize(v);
    }
    return out;
  }
  return value;
}

/** Canonical JSON — stable key order, no undefined members. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

/** SHA-256 hex of arbitrary bytes via WebCrypto (works on main thread and in workers). */
export async function sha256Hex(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data as BufferSource);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function hashJson(value: unknown): Promise<string> {
  return sha256Hex(new TextEncoder().encode(canonicalJson(value)));
}

/** Content hash of the whole plan (project identity). */
export function hashScenePlan(plan: ScenePlan): Promise<string> {
  return hashJson(plan);
}

/** Content hash of one scene (dirty-tracking unit). */
export function hashScene(scene: ScenePlanScene): Promise<string> {
  return hashJson(scene);
}

// ─── Plan diffing (scene-level dirty tracking) ───────────────────────────────

export interface ScenePlanDiff {
  /** Scene ids present in both plans whose content hash changed. */
  changedSceneIds: string[];
  /** Scene ids only in the new plan. */
  addedSceneIds: string[];
  /** Scene ids only in the old plan. */
  removedSceneIds: string[];
  /** True when scene order, count, or any id changed — frame windows shift. */
  structureChanged: boolean;
  /** True when any changed scene's dialogue array differs — audio timing may shift. */
  dialogueChanged: boolean;
}

/** Compare two plans scene-by-scene using content hashes. */
export async function diffScenePlans(oldPlan: ScenePlan, newPlan: ScenePlan): Promise<ScenePlanDiff> {
  const oldHashes = new Map<string, string>();
  for (const s of oldPlan.scenes) oldHashes.set(s.id, await hashScene(s));

  const newIds = new Set(newPlan.scenes.map((s) => s.id));
  const oldIds = new Set(oldPlan.scenes.map((s) => s.id));

  const changedSceneIds: string[] = [];
  let dialogueChanged = false;

  for (const s of newPlan.scenes) {
    const prev = oldHashes.get(s.id);
    if (prev === undefined) continue;
    const now = await hashScene(s);
    if (now !== prev) {
      changedSceneIds.push(s.id);
      const oldScene = oldPlan.scenes.find((o) => o.id === s.id)!;
      if (canonicalJson(oldScene.dialogue) !== canonicalJson(s.dialogue)) dialogueChanged = true;
    }
  }

  const addedSceneIds = newPlan.scenes.filter((s) => !oldIds.has(s.id)).map((s) => s.id);
  const removedSceneIds = oldPlan.scenes.filter((s) => !newIds.has(s.id)).map((s) => s.id);
  const structureChanged =
    addedSceneIds.length > 0 ||
    removedSceneIds.length > 0 ||
    oldPlan.scenes.length !== newPlan.scenes.length ||
    oldPlan.scenes.some((s, i) => newPlan.scenes[i]?.id !== s.id);

  return { changedSceneIds, addedSceneIds, removedSceneIds, structureChanged, dialogueChanged };
}
