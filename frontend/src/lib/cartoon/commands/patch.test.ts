import { describe, expect, it } from 'vitest';
import { buildReferencePlan } from '@/engine/cartoon/harness/reference-plan';
import { canonicalJson } from '@/engine/cartoon/scene-plan';
import { applyScenePatch, describeChanges, PATCH_LIMITS } from './patch';
import { CommandError } from './errors';

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (err) {
    return (err as CommandError).code;
  }
  return 'NO_ERROR';
};

describe('scene patches', () => {
  const plan = buildReferencePlan();
  const duo = plan.scenes.find((s) => s.id === 'scene-duo')!;
  const charB = duo.characters[1];

  it('moves a character by @id without touching the input plan', () => {
    const before = canonicalJson(plan);
    const next = applyScenePatch(plan, [
      { op: 'test', path: `/scenes/@scene-duo/characters/@${charB.instanceId}/position`, value: charB.position },
      { op: 'replace', path: `/scenes/@scene-duo/characters/@${charB.instanceId}/position`, value: { x: 0.3, y: charB.position.y } },
    ]);
    expect(canonicalJson(plan)).toBe(before);
    expect(next.scenes.find((s) => s.id === 'scene-duo')!.characters[1].position).toEqual({ x: 0.3, y: charB.position.y });
    const { changes } = describeChanges(plan, next);
    expect(changes).toEqual([{ path: `/scenes/@scene-duo/characters/@${charB.instanceId}/position/x`, before: charB.position.x, after: 0.3 }]);
  });

  it('numeric indices and add/remove work on arrays', () => {
    const next = applyScenePatch(plan, [{ op: 'add', path: '/scenes/1/sfx/-', value: { assetRef: 'proc:pop', at: 1 } }]);
    expect(next.scenes[1].sfx.at(-1)).toEqual({ assetRef: 'proc:pop', at: 1 });
    const removed = applyScenePatch(next, [{ op: 'remove', path: `/scenes/1/sfx/${next.scenes[1].sfx.length - 1}` }]);
    expect(removed.scenes[1].sfx).toEqual(plan.scenes[1].sfx);
  });

  it('rejects immutable, out-of-scope and dangerous paths', () => {
    for (const path of ['/fps', '/resolution/width', '/id', '/version', '/scenes/0/id', '/other', '/scenes/0/__proto__/x', '/scenes/@nope/captions']) {
      expect(code(() => applyScenePatch(plan, [{ op: 'replace', path, value: 1 }]))).toBe('INVALID_PATCH');
    }
    expect(code(() => applyScenePatch(plan, [{ op: 'move', path: '/title', from: '/title' } as never]))).toBe('INVALID_PATCH');
    expect(code(() => applyScenePatch(plan, []))).toBe('INVALID_PATCH');
  });

  it('validates the WHOLE result: one bad op voids the patch', () => {
    // charId pointing at a character that does not exist in the scene
    expect(
      code(() =>
        applyScenePatch(plan, [
          { op: 'replace', path: '/title', value: 'ok' },
          { op: 'replace', path: `/scenes/@scene-duo/dialogue/0/charId`, value: 'ghost' },
        ]),
      ),
    ).toBe('INVALID_PATCH');
    expect(code(() => applyScenePatch(plan, [{ op: 'test', path: '/title', value: 'wrong' }]))).toBe('INVALID_PATCH');
  });

  it('enforces bounds', () => {
    const many = Array.from({ length: PATCH_LIMITS.maxOps + 1 }, () => ({ op: 'replace', path: '/title', value: 't' }));
    expect(code(() => applyScenePatch(plan, many))).toBe('LIMIT_EXCEEDED');
    expect(code(() => applyScenePatch(plan, [{ op: 'replace', path: '/title', value: 'x'.repeat(PATCH_LIMITS.maxValueBytes + 1) }]))).toBe('LIMIT_EXCEEDED');
    expect(code(() => applyScenePatch(plan, [{ op: 'replace', path: '/title', value: 'x'.repeat(500) }]))).toBe('LIMIT_EXCEEDED');
    expect(code(() => applyScenePatch(plan, [{ op: 'replace', path: `/scenes/@scene-duo/characters/0/position/x`, value: 9 }]))).toBe('INVALID_PATCH');
    expect(code(() => applyScenePatch(plan, [{ op: 'replace', path: `/scenes/@scene-duo/dialogue/0/text`, value: 'y'.repeat(700) }]))).toBe('LIMIT_EXCEEDED');
  });
});

describe('planToPatch (editor → patch)', () => {
  it('round-trips typical editor edits through applyScenePatch', async () => {
    const { planToPatch } = await import('./plan-diff');
    const base = buildReferencePlan();
    const edits: Array<(p: ReturnType<typeof buildReferencePlan>) => void> = [
      (p) => { p.scenes[1].background.seed = 4242; },
      (p) => { p.scenes[0].dialogue[0].text = 'A brand new line.'; },
      (p) => { p.scenes[1].captions.enabled = !p.scenes[1].captions.enabled; },
      (p) => { p.scenes[0].characters[0].entrance = { type: 'pop-in', from: 'left', duration: 0.5 }; },
      (p) => { delete p.scenes[0].characters[0].entrance; },
      (p) => { p.scenes[1].characters[1].palette = { body: '#ff00aa' }; p.scenes[1].characters[1].position.x = 0.31; },
      (p) => { p.title = 'Renamed'; p.scenes[2].sfx.push({ assetRef: 'proc:pop', at: 0.5 }); },
    ];
    for (const edit of edits) {
      const after = structuredClone(base);
      edit(after);
      const ops = planToPatch(base, after);
      expect(ops.length).toBeGreaterThan(0);
      expect(canonicalJson(applyScenePatch(base, ops))).toBe(canonicalJson(after));
    }
    expect(planToPatch(base, structuredClone(base))).toEqual([]);
  });
});
