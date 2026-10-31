/**
 * Turn an edited draft into a bounded scene patch, so the timeline editor
 * commits through exactly the same scene_apply_patch path as an assistant.
 * Leaves become `replace`/`add`/`remove`; arrays of id'd elements are walked
 * by `@id` when membership and order are unchanged, otherwise the array is
 * replaced whole. Guarded by a `test` on the first changed scene's id so a
 * patch generated against one plan cannot silently apply to another.
 */

import { canonicalJson, type ScenePlan } from '@/engine/cartoon/scene-plan';
import type { PatchOp } from './patch';

const esc = (t: string) => t.replace(/~/g, '~0').replace(/\//g, '~1');

function idOf(el: unknown): string | null {
  const o = el as Record<string, unknown> | null;
  if (!o || typeof o !== 'object') return null;
  if (typeof o.id === 'string') return o.id;
  if (typeof o.instanceId === 'string') return o.instanceId;
  return null;
}

function walk(a: unknown, b: unknown, path: string, out: PatchOp[]): void {
  if (canonicalJson(a) === canonicalJson(b)) return;
  if (Array.isArray(a) && Array.isArray(b)) {
    const ia = a.map(idOf);
    const ib = b.map(idOf);
    if (ia.length === ib.length && ia.every((x, i) => x !== null && x === ib[i])) {
      a.forEach((el, i) => walk(el, b[i], `${path}/@${esc(ia[i]!)}`, out));
      return;
    }
    if (ia.every((x) => x === null) && a.length === b.length) {
      a.forEach((el, i) => walk(el, b[i], `${path}/${i}`, out));
      return;
    }
    out.push({ op: 'replace', path, value: b });
    return;
  }
  const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
  if (isObj(a) && isObj(b)) {
    for (const k of Object.keys(a)) if (!(k in b) || b[k] === undefined) {
      if (a[k] !== undefined) out.push({ op: 'remove', path: `${path}/${esc(k)}` });
    }
    for (const k of Object.keys(b)) {
      if (b[k] === undefined) continue;
      if (!(k in a) || a[k] === undefined) out.push({ op: 'add', path: `${path}/${esc(k)}`, value: b[k] });
      else walk(a[k], b[k], `${path}/${esc(k)}`, out);
    }
    return;
  }
  out.push({ op: 'replace', path, value: b });
}

/** Minimal patch turning `before` into `after` (only /title and /scenes may differ). */
export function planToPatch(before: ScenePlan, after: ScenePlan): PatchOp[] {
  const out: PatchOp[] = [];
  if (before.title !== after.title) out.push({ op: 'replace', path: '/title', value: after.title });
  walk(before.scenes, after.scenes, '/scenes', out);
  return out;
}
