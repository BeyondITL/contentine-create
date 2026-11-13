/**
 * Unit tests for cartoon plan timing (engine/cartoon/timing.ts).
 *
 * Law L6 depends on computePlanTiming quantizing scene durations to whole
 * frames and laying scenes out contiguously — scene boundaries are the
 * splice points for partial re-renders. These tests build the takeDurations
 * map from the reference-plan fixture via takeKeyForLine (#28) and pin:
 * integer frame counts, contiguous startFrames, totals, the missing-take
 * throw, takeRef keying, and the exact first-scene dialogue windows for
 * known take durations.
 */
import { describe, it, expect } from 'vitest';
import { computePlanTiming, takeKeyForLine } from './timing';
import { buildReferencePlan } from './harness/reference-plan';
import type { ScenePlan } from './scene-plan';

/** A takeDurations map covering every line of the plan, keyed the way the mixer keys it. */
function durationsFor(plan: ScenePlan, seconds: number): Map<string, number> {
  const map = new Map<string, number>();
  for (const scene of plan.scenes) {
    for (const line of scene.dialogue) map.set(takeKeyForLine(line), seconds);
  }
  return map;
}

describe('takeKeyForLine', () => {
  it('keys by line id when no take is pinned', () => {
    const plan = buildReferencePlan();
    const line = plan.scenes[0].dialogue[0];
    expect(takeKeyForLine(line)).toBe(line.id);
  });

  it('keys by takeRef when a take is pinned', () => {
    const plan = buildReferencePlan();
    const line = { ...plan.scenes[0].dialogue[0], takeRef: 'take-abc' };
    expect(takeKeyForLine(line)).toBe('take-abc');
  });
});

describe('computePlanTiming', () => {
  it('quantizes every scene to whole frames and lays scenes out contiguously', () => {
    const plan = buildReferencePlan();
    const timing = computePlanTiming(plan, durationsFor(plan, 2));

    expect(timing.fps).toBe(plan.fps);
    for (const scene of timing.scenes) {
      expect(Number.isInteger(scene.frameCount)).toBe(true);
      expect(Number.isInteger(scene.startFrame)).toBe(true);
    }
    for (let i = 1; i < timing.scenes.length; i++) {
      const prev = timing.scenes[i - 1];
      expect(timing.scenes[i].startFrame).toBe(prev.startFrame + prev.frameCount);
      expect(timing.scenes[i].start).toBeCloseTo(prev.end, 10);
    }
    const totalFrames = timing.scenes.reduce((sum, s) => sum + s.frameCount, 0);
    expect(timing.totalFrames).toBe(totalFrames);
    expect(timing.totalDuration).toBeCloseTo(totalFrames / plan.fps, 10);
  });

  it('pins the first scene\'s dialogue windows for 2s takes', () => {
    const plan = buildReferencePlan();
    const timing = computePlanTiming(plan, durationsFor(plan, 2));

    // scene-intro: Dot walks in over 1.6s, so dialogue leads at 1.6 + 0.15 = 1.75s.
    const [first, second] = timing.dialogue;
    expect(first.dialogueId).toBe('intro-1');
    expect(first.start).toBeCloseTo(1.75, 10);
    expect(first.end).toBeCloseTo(3.75, 10);
    // Second line follows after the default 0.35s pause.
    expect(second.dialogueId).toBe('intro-2');
    expect(second.start).toBeCloseTo(4.1, 10);
    expect(second.end).toBeCloseTo(6.1, 10);
    // Content end 6.1 + holdAfterDialogue 0.9 = 7.0s = 210 frames at 30fps.
    expect(timing.scenes[0].frameCount).toBe(210);
    expect(timing.scenes[0].duration).toBeCloseTo(7, 10);
  });

  it('throws when a take is missing', () => {
    const plan = buildReferencePlan();
    expect(() => computePlanTiming(plan, new Map())).toThrow(
      "No voice take for dialogue 'intro-1' (take key 'intro-1') in scene 'scene-intro'",
    );
  });

  it('resolves a pinned take by its takeRef key', () => {
    const plan = buildReferencePlan();
    plan.scenes[0].dialogue[0].takeRef = 'pinned-take-1';
    const durations = durationsFor(plan, 2);
    expect(durations.has('pinned-take-1')).toBe(true);
    expect(() => computePlanTiming(plan, durations)).not.toThrow();
  });
});
