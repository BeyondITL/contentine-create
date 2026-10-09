/**
 * Contentine Create — Cartoon Engine: Plan timing
 *
 * Pure, deterministic derivation of absolute timing from a scene plan plus
 * measured voice-take durations. Shared by the audio mixer (main thread)
 * and the GSAP timeline compiler (render worker) so both always agree.
 *
 * Scene durations are quantized to whole frames — scene boundaries are the
 * splice points for partial re-renders and must be frame-aligned.
 */

import type { DialogueLine, ScenePlan } from './scene-plan';

/** Voice takes are keyed by `takeRef` when pinned, else by the dialogue line id. */
export function takeKeyForLine(line: DialogueLine): string {
  return line.takeRef ?? line.id;
}

export interface DialogueWindow {
  dialogueId: string;
  takeKey: string;
  sceneId: string;
  charId: string;
  text: string;
  /** Absolute timeline seconds. */
  start: number;
  end: number;
}

export interface SceneWindow {
  sceneId: string;
  /** Absolute timeline seconds (frame-aligned). */
  start: number;
  end: number;
  duration: number;
  /** Frame indices at plan fps: [startFrame, startFrame + frameCount). */
  startFrame: number;
  frameCount: number;
}

export interface PlanTiming {
  fps: number;
  totalDuration: number;
  totalFrames: number;
  scenes: SceneWindow[];
  dialogue: DialogueWindow[];
}

const DEFAULT_PAUSE_AFTER = 0.35;
const DEFAULT_HOLD_AFTER_DIALOGUE = 0.8;
const DIALOGUE_LEAD_IN = 0.4;
const EMPTY_SCENE_DURATION = 2.0;

/**
 * Compute absolute scene/dialogue timing.
 * @param takeDurations — measured audio duration (seconds) per take key.
 */
export function computePlanTiming(plan: ScenePlan, takeDurations: Map<string, number>): PlanTiming {
  const fps = plan.fps;
  const scenes: SceneWindow[] = [];
  const dialogue: DialogueWindow[] = [];

  let cursorFrames = 0;

  for (const scene of plan.scenes) {
    const sceneStart = cursorFrames / fps;

    // Dialogue begins after the longest entrance (plus a beat), min lead-in.
    const entranceLead = scene.characters.reduce(
      (max, ch) => Math.max(max, ch.entrance && ch.entrance.type !== 'none' ? ch.entrance.duration : 0),
      0,
    );
    let t = Math.max(DIALOGUE_LEAD_IN, entranceLead + 0.15);

    const sceneDialogue: DialogueWindow[] = [];
    for (const line of scene.dialogue) {
      const key = takeKeyForLine(line);
      const dur = takeDurations.get(key);
      if (dur === undefined) {
        throw new Error(`No voice take for dialogue '${line.id}' (take key '${key}') in scene '${scene.id}'`);
      }
      sceneDialogue.push({
        dialogueId: line.id,
        takeKey: key,
        sceneId: scene.id,
        charId: line.charId,
        text: line.text,
        start: sceneStart + t,
        end: sceneStart + t + dur,
      });
      t += dur + (line.pauseAfter ?? DEFAULT_PAUSE_AFTER);
    }

    // Content end: dialogue tail + hold, or gestures/sfx tail for silent scenes.
    const hold = scene.durationHints?.holdAfterDialogue ?? DEFAULT_HOLD_AFTER_DIALOGUE;
    let contentEnd: number;
    if (sceneDialogue.length > 0) {
      contentEnd = sceneDialogue[sceneDialogue.length - 1].end - sceneStart + hold;
    } else {
      const gestureTail = scene.characters.reduce(
        (max, ch) => ch.gestures.reduce((m, g) => Math.max(m, g.at + (g.duration ?? 1.5)), max),
        0,
      );
      const sfxTail = scene.sfx.reduce((max, fx) => Math.max(max, fx.at + 0.5), 0);
      contentEnd = Math.max(EMPTY_SCENE_DURATION, gestureTail + 0.5, sfxTail);
    }

    // Leave room for exits, apply duration hints, quantize to whole frames.
    const exitLead = scene.characters.reduce(
      (max, ch) => Math.max(max, ch.exit && ch.exit.type !== 'none' ? ch.exit.duration : 0),
      0,
    );
    let duration = contentEnd + exitLead;
    if (scene.durationHints?.min !== undefined) duration = Math.max(duration, scene.durationHints.min);
    if (scene.durationHints?.max !== undefined) duration = Math.min(duration, scene.durationHints.max);

    const frameCount = Math.max(1, Math.round(duration * fps));
    duration = frameCount / fps;

    scenes.push({
      sceneId: scene.id,
      start: sceneStart,
      end: sceneStart + duration,
      duration,
      startFrame: cursorFrames,
      frameCount,
    });
    dialogue.push(...sceneDialogue);
    cursorFrames += frameCount;
  }

  return {
    fps,
    totalDuration: cursorFrames / fps,
    totalFrames: cursorFrames,
    scenes,
    dialogue,
  };
}
