/**
 * Contentine Create — Cartoon Studio: script → ScenePlan adapter (WS-4 layer)
 *
 * The cartoon engine (WS-2) treats the ScenePlan as its source of truth; it
 * does NOT know about the wizard's script scenes. This adapter — owned by the
 * WS-4 UI layer — translates the reused script editor's scenes + the selected
 * style + voice into a valid v1 ScenePlan the engine renders deterministically.
 *
 * Type-only import from the engine barrel keeps Law L8 intact (types are erased
 * at compile time — no runtime engine import from a statically-bundled module).
 *
 * Engine-API gaps noted for WS-2 are collected at the bottom of this file.
 */

import type { ScenePlan, ScenePlanScene, CharacterBlock } from '@/engine/cartoon';
import type { CartoonStyle } from './styles';

export interface ScriptSceneInput {
  id: string;
  narration: string;
}

export interface BuildScenePlanInput {
  title: string;
  scenes: ScriptSceneInput[];
  style: CartoonStyle;
  /** Kokoro voice id, e.g. `af_sky`. */
  kokoroVoiceId: string;
  /** Playback speed, e.g. 1.0. */
  voiceSpeed: number;
  resolution: { width: number; height: number };
  fps?: number;
}

const NARRATOR_ID = 'narrator';

/** Deterministic per-scene background seed (Law L6 — same input ⇒ same seed). */
function seedForScene(index: number): number {
  // mulberry-friendly 32-bit spread; stable for a given scene index.
  return (index * 2654435761 + 101) % 100000;
}

/** Format a voice profile ref the engine's parseVoiceProfileRef accepts. */
function voiceProfileRef(kokoroVoiceId: string, speed: number): string {
  // Regex in voice-takes.ts: /^(kokoro):([A-Za-z0-9_]+)(?:@([0-9.]+))?$/
  const safeSpeed = Number.isFinite(speed) && speed > 0 ? speed : 1;
  return `kokoro:${kokoroVoiceId}@${safeSpeed}`;
}

/**
 * Build a valid ScenePlan from the reused script editor's scenes. One narrator
 * character speaks each scene's narration. Backgrounds are procedural (painted
 * from the deterministic seed — no SD-Turbo asset required for the MVP style).
 */
export function buildCartoonScenePlan(input: BuildScenePlanInput): ScenePlan {
  const usable = input.scenes.filter((s) => s.narration.trim().length > 0);
  if (usable.length === 0) {
    throw new Error('Add at least one scene with narration before generating.');
  }

  const ref = voiceProfileRef(input.kokoroVoiceId, input.voiceSpeed);
  const lastIndex = usable.length - 1;

  const scenes: ScenePlanScene[] = usable.map((scene, i) => {
    const character: CharacterBlock = {
      rigId: input.style.rigId,
      instanceId: NARRATOR_ID,
      position: { x: 0.5, y: 0.86 },
      scale: 1.0,
      facing: 'right',
      gestures: i === 0 ? [{ name: 'wave', at: 0.8 }] : [{ name: 'nod', at: 1.0 }],
      ...(i === 0 ? { entrance: { type: 'walk-in' as const, from: 'left' as const, duration: 1.4 } } : {}),
      ...(i === lastIndex ? { exit: { type: 'walk-out' as const, to: 'right' as const, duration: 1.2 } } : {}),
    };

    return {
      id: `scene-${i + 1}`,
      background: {
        prompt: `${input.style.name} flat cartoon scene ${i + 1}`,
        seed: seedForScene(i),
      },
      characters: [character],
      dialogue: [
        {
          id: `line-${i + 1}`,
          charId: NARRATOR_ID,
          text: scene.narration.trim(),
          voiceProfileRef: ref,
          pauseAfter: 0.35,
        },
      ],
      captions: { enabled: true, style: 'bottom-bar' },
      sfx: i === 0 ? [{ assetRef: 'proc:pop', at: 0.7, gain: 0.6 }] : [],
      musicCue: { assetRef: input.style.music, gain: 0.3, duckTo: 0.12 },
      durationHints: { holdAfterDialogue: 0.7 },
    };
  });

  return {
    version: 1,
    id: `cartoon-${Date.now()}`,
    title: input.title.trim() || 'My Cartoon',
    fps: input.fps ?? 30,
    resolution: input.resolution,
    scenes,
  };
}

/*
 * Engine-API gaps noted for WS-2 (no engine edits made here):
 *  - No public "script → plan" helper exists; this adapter fills that role in
 *    the UI layer. If WS-2 later ships a canonical planner, this can delegate.
 *  - synthesizeTakes surfaces per-line progress (done/total) but not the Kokoro
 *    model-download %. The UI pre-warms the model via ttsManager.init() (a
 *    public manager, not an engine internal) to show an honest download stage.
 *  - Multi-speaker casting, gesture authoring, and background-asset selection
 *    are out of MVP scope; the plan uses a single narrator + procedural
 *    backgrounds. These become real controls when the timeline editor lands.
 */
