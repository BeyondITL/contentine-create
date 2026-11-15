/**
 * Unit tests for the cartoon scene-plan schema (engine/cartoon/scene-plan.ts).
 *
 * The plan is the single source of truth for cartoon renders, and law L6
 * (determinism) depends on validateScenePlan catching malformed plans and on
 * canonicalJson producing the same output for any key order. These tests use
 * the existing reference-plan fixture (#28) — never a hand-written fake plan —
 * mutate one field at a time, and assert the specific error string for each.
 */
import { describe, it, expect } from 'vitest';
import {
  validateScenePlan,
  canonicalJson,
  hashScenePlan,
  hashScene,
} from './scene-plan';
import { buildReferencePlan, buildEditedReferencePlan } from './harness/reference-plan';

describe('validateScenePlan', () => {
  it('accepts the reference plan', () => {
    expect(validateScenePlan(buildReferencePlan())).toEqual({ ok: true, errors: [] });
  });

  it('rejects a wrong plan version with the specific error', () => {
    const plan = buildReferencePlan();
    (plan as { version: number }).version = 2;
    const result = validateScenePlan(plan);
    expect(result.ok).toBe(false);
    expect(result.errors).toContain('unsupported plan version: 2 (expected 1)');
  });

  it('rejects a duplicate scene id with the specific error', () => {
    const plan = buildReferencePlan();
    plan.scenes[1].id = plan.scenes[0].id;
    const result = validateScenePlan(plan);
    expect(result.ok).toBe(false);
    expect(result.errors).toContain('scenes[1].id duplicate: scene-intro');
  });

  it('rejects dialogue whose charId is not a character in the scene', () => {
    const plan = buildReferencePlan();
    plan.scenes[0].dialogue[0].charId = 'nobody';
    const result = validateScenePlan(plan);
    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      "scenes[0].dialogue[0].charId 'nobody' does not match a character instanceId in the scene",
    );
  });

  it('rejects fps: 0 with the specific error', () => {
    const plan = buildReferencePlan();
    plan.fps = 0;
    const result = validateScenePlan(plan);
    expect(result.ok).toBe(false);
    expect(result.errors).toContain('plan.fps invalid: 0');
  });
});

describe('canonicalJson', () => {
  it('produces the same string for the same object with keys in a different order', () => {
    const a = { title: 'x', fps: 30, nested: { width: 1920, height: 1080 } };
    const b = { nested: { height: 1080, width: 1920 }, fps: 30, title: 'x' };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
    expect(canonicalJson(a)).toBe('{"fps":30,"nested":{"height":1080,"width":1920},"title":"x"}');
  });

  it('drops undefined members', () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe('{"a":1}');
  });

  it('serializes two separately built reference plans identically', () => {
    expect(canonicalJson(buildReferencePlan())).toBe(canonicalJson(buildReferencePlan()));
  });
});

describe('hashScenePlan / hashScene', () => {
  it('is stable across calls and across separately built identical plans', async () => {
    const first = await hashScenePlan(buildReferencePlan());
    const second = await hashScenePlan(buildReferencePlan());
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(second).toBe(first);
  });

  it('changes when the plan content changes, and only for the edited scene', async () => {
    const original = buildReferencePlan();
    const edited = buildEditedReferencePlan();
    expect(await hashScenePlan(edited)).not.toBe(await hashScenePlan(original));
    expect(await hashScene(edited.scenes[0])).toBe(await hashScene(original.scenes[0]));
    expect(await hashScene(edited.scenes[1])).not.toBe(await hashScene(original.scenes[1]));
    expect(await hashScene(edited.scenes[2])).toBe(await hashScene(original.scenes[2]));
  });
});
