/**
 * Bounded scene patches.
 *
 * A patch is a short list of JSON Patch (RFC 6902) operations applied to the
 * EXISTING ScenePlan schema — there is no second scene dialect. Two
 * restrictions and one extension:
 *  - ops: replace | add | remove | test (no move/copy);
 *  - paths are confined to `/title` and `/scenes/...`; `/version`, `/id`,
 *    `/fps`, `/resolution` and any scene's `id` are immutable here;
 *  - extension: a path token `@<id>` selects the array element whose `id`
 *    (scenes, dialogue lines) or `instanceId` (characters) equals <id>, so
 *    callers address "scene-duo / character b" instead of fragile indices.
 * The whole patch is applied to a copy and the result must pass
 * validateScenePlan + PLAN_LIMITS; otherwise nothing changes.
 */

import { canonicalJson, validateScenePlan, type ScenePlan } from '@/engine/cartoon/scene-plan';
import { CommandError } from './errors';

export type PatchOp =
  | { op: 'replace' | 'add' | 'test'; path: string; value: unknown }
  | { op: 'remove'; path: string };

export const PATCH_LIMITS = {
  maxOps: 32,
  maxValueBytes: 16 * 1024,
  maxPathDepth: 10,
} as const;

export const PLAN_LIMITS = {
  maxScenes: 50,
  maxCharactersPerScene: 8,
  maxDialoguePerScene: 40,
  maxTextChars: 600,
  maxTitleChars: 200,
  maxGesturesPerCharacter: 50,
  maxSfxPerScene: 50,
  maxFps: 60,
  maxWidth: 1920,
  maxHeight: 1080,
  maxSceneSeconds: 120,
} as const;

const FORBIDDEN_TOKENS = new Set(['__proto__', 'prototype', 'constructor']);
const IMMUTABLE_ROOTS = new Set(['version', 'id', 'fps', 'resolution']);

function parsePointer(path: unknown, opIndex: number): string[] {
  if (typeof path !== 'string' || !path.startsWith('/')) {
    throw new CommandError('INVALID_PATCH', `op ${opIndex}: path must be a JSON pointer starting with '/'`, { opIndex });
  }
  const tokens = path
    .slice(1)
    .split('/')
    .map((t) => t.replace(/~1/g, '/').replace(/~0/g, '~'));
  if (tokens.length > PATCH_LIMITS.maxPathDepth) {
    throw new CommandError('INVALID_PATCH', `op ${opIndex}: path is deeper than ${PATCH_LIMITS.maxPathDepth}`, { opIndex });
  }
  for (const t of tokens) {
    if (t === '' || FORBIDDEN_TOKENS.has(t)) throw new CommandError('INVALID_PATCH', `op ${opIndex}: invalid path token '${t}'`, { opIndex });
  }
  const root = tokens[0];
  if (IMMUTABLE_ROOTS.has(root)) {
    throw new CommandError('INVALID_PATCH', `op ${opIndex}: /${root} cannot be changed by a scene patch`, { opIndex });
  }
  if (root !== 'title' && root !== 'scenes') {
    throw new CommandError('INVALID_PATCH', `op ${opIndex}: only /title and /scenes/... are patchable`, { opIndex });
  }
  if (root === 'title' && tokens.length !== 1) throw new CommandError('INVALID_PATCH', `op ${opIndex}: /title has no children`, { opIndex });
  if (root === 'scenes' && tokens.length === 3 && tokens[2] === 'id') {
    throw new CommandError('INVALID_PATCH', `op ${opIndex}: a scene's id is immutable`, { opIndex });
  }
  return tokens;
}

/** Resolve an `@id` token or numeric index against an array. */
function resolveIndex(arr: unknown[], token: string, opIndex: number, allowEnd: boolean): number {
  if (token.startsWith('@')) {
    const id = token.slice(1);
    const i = arr.findIndex((el) => {
      const o = el as Record<string, unknown> | null;
      return !!o && (o.id === id || o.instanceId === id);
    });
    if (i < 0) throw new CommandError('INVALID_PATCH', `op ${opIndex}: no element with id '${id}'`, { opIndex });
    return i;
  }
  if (token === '-' && allowEnd) return arr.length;
  if (!/^(0|[1-9][0-9]*)$/.test(token)) throw new CommandError('INVALID_PATCH', `op ${opIndex}: '${token}' is not an array index or @id`, { opIndex });
  const i = Number(token);
  if (i > arr.length || (!allowEnd && i === arr.length)) {
    throw new CommandError('INVALID_PATCH', `op ${opIndex}: index ${i} out of range`, { opIndex });
  }
  return i;
}

function isContainer(v: unknown): v is Record<string, unknown> | unknown[] {
  return typeof v === 'object' && v !== null;
}

/** Apply a validated, bounded patch to a COPY of the plan. Throws INVALID_PATCH; never mutates `plan`. */
export function applyScenePatch(plan: ScenePlan, ops: unknown): ScenePlan {
  if (!Array.isArray(ops) || ops.length === 0) throw new CommandError('INVALID_PATCH', 'ops must be a non-empty array');
  if (ops.length > PATCH_LIMITS.maxOps) {
    throw new CommandError('LIMIT_EXCEEDED', `A patch may contain at most ${PATCH_LIMITS.maxOps} operations`, { ops: ops.length });
  }
  const doc = structuredClone(plan) as unknown as Record<string, unknown>;

  ops.forEach((raw, opIndex) => {
    const op = raw as { op?: unknown; path?: unknown; value?: unknown };
    if (!op || typeof op !== 'object' || !['replace', 'add', 'remove', 'test'].includes(op.op as string)) {
      throw new CommandError('INVALID_PATCH', `op ${opIndex}: op must be replace, add, remove or test`, { opIndex });
    }
    const tokens = parsePointer(op.path, opIndex);
    const needsValue = op.op !== 'remove';
    if (needsValue) {
      if (!('value' in op) || op.value === undefined) throw new CommandError('INVALID_PATCH', `op ${opIndex}: value is required`, { opIndex });
      const size = new TextEncoder().encode(JSON.stringify(op.value)).byteLength;
      if (size > PATCH_LIMITS.maxValueBytes) {
        throw new CommandError('LIMIT_EXCEEDED', `op ${opIndex}: value is ${size} bytes (limit ${PATCH_LIMITS.maxValueBytes})`, { opIndex });
      }
    }

    let parent: unknown = doc;
    for (let t = 0; t < tokens.length - 1; t++) {
      if (!isContainer(parent)) throw new CommandError('INVALID_PATCH', `op ${opIndex}: path does not exist`, { opIndex });
      const key = Array.isArray(parent) ? resolveIndex(parent, tokens[t], opIndex, false) : tokens[t];
      parent = (parent as Record<string | number, unknown>)[key];
    }
    if (!isContainer(parent)) throw new CommandError('INVALID_PATCH', `op ${opIndex}: path does not exist`, { opIndex });
    const last = tokens[tokens.length - 1];
    const value = needsValue ? structuredClone(op.value) : undefined;

    if (Array.isArray(parent)) {
      const i = resolveIndex(parent, last, opIndex, op.op === 'add');
      if (op.op === 'add') parent.splice(i, 0, value);
      else if (op.op === 'remove') parent.splice(i, 1);
      else if (op.op === 'replace') parent[i] = value;
      else if (canonicalJson(parent[i]) !== canonicalJson(value)) {
        throw new CommandError('INVALID_PATCH', `op ${opIndex}: test failed at ${String(op.path)}`, { opIndex });
      }
      return;
    }
    const obj = parent as Record<string, unknown>;
    const exists = Object.prototype.hasOwnProperty.call(obj, last);
    if ((op.op === 'replace' || op.op === 'remove' || op.op === 'test') && !exists) {
      throw new CommandError('INVALID_PATCH', `op ${opIndex}: ${String(op.path)} does not exist`, { opIndex });
    }
    if (op.op === 'remove') delete obj[last];
    else if (op.op === 'test') {
      if (canonicalJson(obj[last]) !== canonicalJson(value)) throw new CommandError('INVALID_PATCH', `op ${opIndex}: test failed at ${String(op.path)}`, { opIndex });
    } else obj[last] = value;
  });

  const next = doc as unknown as ScenePlan;
  const validation = validateScenePlan(next);
  if (!validation.ok) {
    throw new CommandError('INVALID_PATCH', `Patched plan is invalid: ${validation.errors.slice(0, 5).join('; ')}`, { errors: validation.errors.slice(0, 20) });
  }
  if (next.id !== plan.id || next.version !== plan.version || next.fps !== plan.fps || canonicalJson(next.resolution) !== canonicalJson(plan.resolution)) {
    throw new CommandError('INVALID_PATCH', 'Patch changed an immutable field');
  }
  checkPlanLimits(next);
  return next;
}

/** Content bounds beyond schema validity. Throws LIMIT_EXCEEDED / INVALID_PATCH. */
export function checkPlanLimits(plan: ScenePlan): void {
  const L = PLAN_LIMITS;
  const fail = (msg: string) => {
    throw new CommandError('LIMIT_EXCEEDED', msg);
  };
  if (plan.title.length > L.maxTitleChars) fail(`title exceeds ${L.maxTitleChars} characters`);
  if (plan.fps > L.maxFps) fail(`fps exceeds ${L.maxFps}`);
  if (plan.resolution.width > L.maxWidth || plan.resolution.height > L.maxHeight) fail(`resolution exceeds ${L.maxWidth}x${L.maxHeight}`);
  if (plan.scenes.length > L.maxScenes) fail(`more than ${L.maxScenes} scenes`);
  for (const s of plan.scenes) {
    if (s.characters.length > L.maxCharactersPerScene) fail(`scene '${s.id}' has more than ${L.maxCharactersPerScene} characters`);
    if (s.dialogue.length > L.maxDialoguePerScene) fail(`scene '${s.id}' has more than ${L.maxDialoguePerScene} dialogue lines`);
    if (s.sfx.length > L.maxSfxPerScene) fail(`scene '${s.id}' has more than ${L.maxSfxPerScene} sfx cues`);
    if ((s.durationHints?.min ?? 0) > L.maxSceneSeconds || (s.durationHints?.max ?? 0) > L.maxSceneSeconds) {
      fail(`scene '${s.id}' duration hint exceeds ${L.maxSceneSeconds}s`);
    }
    for (const c of s.characters) {
      if (c.gestures.length > L.maxGesturesPerCharacter) fail(`character '${c.instanceId}' has more than ${L.maxGesturesPerCharacter} gestures`);
      if (c.position.x < -0.5 || c.position.x > 1.5 || c.position.y < -0.5 || c.position.y > 1.5) {
        throw new CommandError('INVALID_PATCH', `character '${c.instanceId}' position must stay within [-0.5, 1.5]`);
      }
      if (c.scale > 4) throw new CommandError('INVALID_PATCH', `character '${c.instanceId}' scale must be ≤ 4`);
    }
    for (const d of s.dialogue) if (d.text.length > L.maxTextChars) fail(`line '${d.id}' exceeds ${L.maxTextChars} characters`);
  }
}

export interface FieldChange {
  path: string;
  before: unknown;
  after: unknown;
}

/**
 * Leaf-level differences between two plans, with arrays of id'd elements
 * addressed by `@id` (readable, stable). Bounded to `max` entries.
 */
export function describeChanges(before: ScenePlan, after: ScenePlan, max = 40): { changes: FieldChange[]; truncated: boolean } {
  const out: FieldChange[] = [];
  let truncated = false;
  const keyOf = (el: unknown): string | null => {
    const o = el as Record<string, unknown> | null;
    if (o && typeof o === 'object') {
      if (typeof o.id === 'string') return `@${o.id}`;
      if (typeof o.instanceId === 'string') return `@${o.instanceId}`;
    }
    return null;
  };
  const walk = (a: unknown, b: unknown, path: string) => {
    if (out.length >= max) {
      truncated = true;
      return;
    }
    if (canonicalJson(a) === canonicalJson(b)) return;
    if (Array.isArray(a) && Array.isArray(b)) {
      const ka = a.map(keyOf);
      const kb = b.map(keyOf);
      if (ka.every(Boolean) && kb.every(Boolean)) {
        const am = new Map(a.map((el, i) => [ka[i]!, el]));
        const bm = new Map(b.map((el, i) => [kb[i]!, el]));
        for (const k of new Set([...ka, ...kb] as string[])) walk(am.get(k), bm.get(k), `${path}/${k}`);
        if (ka.join() !== kb.join() && ka.length === kb.length) out.push({ path: `${path} (order)`, before: ka, after: kb });
        return;
      }
      if (a.length === b.length) {
        a.forEach((el, i) => walk(el, b[i], `${path}/${i}`));
        return;
      }
    } else if (isContainer(a) && isContainer(b) && !Array.isArray(a) && !Array.isArray(b)) {
      for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
        walk((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}/${k}`);
      }
      return;
    }
    out.push({ path: path || '/', before: a, after: b });
  };
  walk(before, after, '');
  return { changes: out, truncated };
}
