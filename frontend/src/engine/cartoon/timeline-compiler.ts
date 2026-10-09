/**
 * Contentine Create — Cartoon Engine: Plan → GSAP master-timeline compiler
 *
 * Deterministically compiles a scene plan (+ voice-take timing/visemes) into
 * one paused GSAP master timeline that tweens plain pose objects:
 *   - character entrances/exits (walk/pop/fade)
 *   - gesture triggers from the rig's gesture library
 *   - viseme-keyed mouth swaps from the take's viseme stamps
 *   - deterministic ambient life (blinks, talking bob) — schedule derived
 *     from scene/character indices, never from Math.random (Law L6)
 *
 * The renderer drives the timeline exclusively via seek(); the ticker is
 * never used. Same plan + same takes ⇒ same timeline ⇒ same frames.
 *
 * GSAP core (no CSSPlugin — we tween plain objects, DOM-free, worker-safe).
 * License: GreenSock standard no-charge license, free for commercial use
 * (recorded in LICENSES.md).
 */

import { gsap } from 'gsap/gsap-core';

/** GSAP core timeline type, derived from the factory (namespace types stay internal). */
export type GsapTimeline = ReturnType<typeof gsap.timeline>;

import type { CharacterBlock, ScenePlan, ScenePlanScene } from './scene-plan';
import type { VisemeStamp } from './visemes';
import { createRestPose, getRig, type RigDefinition, type RigPose } from './rig';
import { computePlanTiming, takeKeyForLine, type PlanTiming } from './timing';

// ─── Compiled output ─────────────────────────────────────────────────────────

export interface CharacterRuntime {
  block: CharacterBlock;
  rig: RigDefinition;
  pose: RigPose;
  palette: Record<string, string>;
  /** Character height in canvas pixels (rig base × plan scale × stage height). */
  heightPx: number;
}

export interface SceneRuntime {
  scene: ScenePlanScene;
  characters: CharacterRuntime[];
}

export interface CompiledStage {
  scenes: Map<string, SceneRuntime>;
}

export interface CompiledTimeline {
  timeline: GsapTimeline;
  stage: CompiledStage;
  timing: PlanTiming;
}

/** Timing + viseme data the compiler needs per take (PCM stays out of the worker). */
export interface TakeTimingInfo {
  durationSec: number;
  visemes: VisemeStamp[];
}

// ─── Entrance / exit builders ────────────────────────────────────────────────

function offstageX(side: 'left' | 'right' | 'bottom' | undefined, homeX: number, width: number): number {
  if (side === 'right') return width * 1.15;
  if (side === 'bottom') return homeX;
  return -width * 0.15; // default: left
}

function applyEntrance(
  tl: GsapTimeline,
  char: CharacterRuntime,
  sceneStart: number,
  width: number,
  height: number,
): void {
  const entrance = char.block.entrance;
  const pose = char.pose;
  const homeX = pose.x;
  const homeY = pose.y;
  if (!entrance || entrance.type === 'none') return;
  const dur = entrance.duration;

  switch (entrance.type) {
    case 'walk-in': {
      const fromBottom = entrance.from === 'bottom';
      tl.set(pose, fromBottom ? { y: height * 1.2 } : { x: offstageX(entrance.from, homeX, width) }, sceneStart);
      tl.to(pose, fromBottom ? { y: homeY, duration: dur, ease: 'none' } : { x: homeX, duration: dur, ease: 'none' }, sceneStart);
      // Leg swing while walking, settled by entrance end.
      const steps = Math.max(2, Math.round(dur / 0.3));
      const stepDur = dur / steps;
      for (let s = 0; s < steps; s++) {
        const swing = s === steps - 1 ? 0 : (s % 2 === 0 ? 24 : -24);
        tl.to(pose, { legL: swing, legR: -swing, duration: stepDur, ease: 'sine.inOut' }, sceneStart + s * stepDur);
      }
      break;
    }
    case 'pop-in':
      tl.set(pose, { scaleMul: 0.001 }, sceneStart);
      tl.to(pose, { scaleMul: 1, duration: dur, ease: 'back.out(1.8)' }, sceneStart);
      break;
    case 'fade-in':
      tl.set(pose, { opacity: 0 }, sceneStart);
      tl.to(pose, { opacity: 1, duration: dur, ease: 'power1.inOut' }, sceneStart);
      break;
  }
}

function applyExit(
  tl: GsapTimeline,
  char: CharacterRuntime,
  sceneEnd: number,
  width: number,
  height: number,
): void {
  const exit = char.block.exit;
  const pose = char.pose;
  if (!exit || exit.type === 'none') return;
  const dur = exit.duration;
  const at = sceneEnd - dur;

  switch (exit.type) {
    case 'walk-out': {
      const toBottom = exit.to === 'bottom';
      tl.to(
        pose,
        toBottom
          ? { y: height * 1.2, duration: dur, ease: 'none' }
          : { x: offstageX(exit.to, pose.x, width), duration: dur, ease: 'none' },
        at,
      );
      const steps = Math.max(2, Math.round(dur / 0.3));
      const stepDur = dur / steps;
      for (let s = 0; s < steps; s++) {
        const swing = s % 2 === 0 ? 24 : -24;
        tl.to(pose, { legL: swing, legR: -swing, duration: stepDur, ease: 'sine.inOut' }, at + s * stepDur);
      }
      break;
    }
    case 'pop-out':
      tl.to(pose, { scaleMul: 0.001, duration: dur, ease: 'back.in(1.8)' }, at);
      break;
    case 'fade-out':
      tl.to(pose, { opacity: 0, duration: dur, ease: 'power1.inOut' }, at);
      break;
  }
}

// ─── Ambient life (deterministic schedules) ──────────────────────────────────

/** Blinks on a fixed cadence, phase-shifted per character index — no randomness. */
function applyBlinks(
  tl: GsapTimeline,
  pose: RigPose,
  sceneStart: number,
  sceneEnd: number,
  charIndex: number,
): void {
  const cadence = 3.1;
  const blinkDur = 0.09;
  for (let t = sceneStart + 0.9 + charIndex * 1.17; t < sceneEnd - blinkDur * 2; t += cadence) {
    tl.to(pose, { blink: 1, duration: blinkDur, ease: 'power1.in' }, t);
    tl.to(pose, { blink: 0, duration: blinkDur, ease: 'power1.out' }, t + blinkDur);
  }
}

/** Gentle body bob while a character speaks. */
function applyTalkingBob(tl: GsapTimeline, pose: RigPose, start: number, end: number): void {
  const halfPeriod = 0.32;
  const cycles = Math.floor((end - start) / halfPeriod);
  for (let c = 0; c < cycles; c++) {
    tl.to(pose, { bob: c % 2 === 0 ? 1.6 : 0, duration: halfPeriod, ease: 'sine.inOut' }, start + c * halfPeriod);
  }
  tl.to(pose, { bob: 0, duration: halfPeriod, ease: 'sine.out' }, start + cycles * halfPeriod);
}

// ─── Compiler ────────────────────────────────────────────────────────────────

/**
 * Compile a plan into a paused GSAP master timeline plus the stage state the
 * painter reads. Deterministic: identical inputs produce identical timelines.
 *
 * @param takeInfo — duration + viseme stamps per take key (see `takeKeyForLine`).
 */
export function compileTimeline(plan: ScenePlan, takeInfo: Map<string, TakeTimingInfo>): CompiledTimeline {
  const width = plan.resolution.width;
  const height = plan.resolution.height;

  const takeDurations = new Map<string, number>();
  for (const [key, info] of takeInfo) takeDurations.set(key, info.durationSec);
  const timing = computePlanTiming(plan, takeDurations);

  const tl = gsap.timeline({ paused: true });
  const stage: CompiledStage = { scenes: new Map() };

  for (let sceneIdx = 0; sceneIdx < plan.scenes.length; sceneIdx++) {
    const scene = plan.scenes[sceneIdx];
    const window = timing.scenes[sceneIdx];

    const characters: CharacterRuntime[] = scene.characters.map((block) => {
      const rig = getRig(block.rigId);
      const pose = createRestPose();
      pose.x = block.position.x * width;
      pose.y = block.position.y * height;
      pose.facing = block.facing === 'left' ? -1 : 1;
      return {
        block,
        rig,
        pose,
        palette: { ...rig.defaultPalette, ...block.palette },
        heightPx: rig.baseHeightFrac * height * block.scale,
      };
    });
    stage.scenes.set(scene.id, { scene, characters });

    for (let charIdx = 0; charIdx < characters.length; charIdx++) {
      const char = characters[charIdx];
      applyEntrance(tl, char, window.start, width, height);
      applyExit(tl, char, window.end, width, height);
      applyBlinks(tl, char.pose, window.start, window.end, charIdx);

      // Gesture triggers from the rig's library.
      for (const cue of char.block.gestures) {
        const gesture = char.rig.gestures[cue.name];
        if (!gesture) {
          throw new Error(`Rig '${char.rig.id}' has no gesture '${cue.name}' (scene '${scene.id}')`);
        }
        gesture.apply(tl, char.pose, window.start + cue.at, cue.duration ?? gesture.defaultDuration);
      }
    }

    // Viseme-keyed mouth swaps + talking bob, per dialogue line.
    for (const line of scene.dialogue) {
      const key = takeKeyForLine(line);
      const info = takeInfo.get(key)!; // presence enforced by computePlanTiming
      const dw = timing.dialogue.find((d) => d.dialogueId === line.id)!;
      const speaker = characters.find((c) => c.block.instanceId === line.charId);
      if (!speaker) continue; // validated upstream; guard for hand-built plans

      for (const stamp of info.visemes) {
        if (stamp.time > info.durationSec) break;
        tl.set(speaker.pose, { mouth: stamp.value }, dw.start + stamp.time);
      }
      tl.set(speaker.pose, { mouth: 'sil' }, dw.end);
      applyTalkingBob(tl, speaker.pose, dw.start, dw.end);
    }
  }

  // Pin the timeline's duration to the computed total so seeks past the last
  // tween still resolve (e.g. hold frames at the very end).
  tl.set({}, {}, timing.totalDuration);

  return { timeline: tl, stage, timing };
}

/**
 * Seek the compiled timeline to absolute time `t` (seconds), clamped inside
 * the timeline, forcing a synchronous state update of every pose object.
 */
export function seekTimeline(compiled: CompiledTimeline, t: number): void {
  const clamped = Math.min(Math.max(t, 0), compiled.timing.totalDuration - 1e-6);
  compiled.timeline.time(clamped, true);
}
