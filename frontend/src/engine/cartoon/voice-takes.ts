/**
 * Contentine Create — Cartoon Engine: Voice takes
 *
 * A voice take is the immutable audio unit the renderer consumes: PCM +
 * sample rate + viseme stamps + content hash, keyed by `takeRef ?? line.id`.
 * Takes are produced ONCE per dialogue line via the existing tts-manager
 * (WS-5's surface — consumed here, never modified) and then pinned; a plan
 * whose lines carry `takeRef`s renders identically forever (Law L6).
 *
 * Viseme stamps: if the TTS result carries visemes (WS-5 upgrade path),
 * they are used verbatim; otherwise deterministic text-derived stamps are
 * generated from the measured audio duration.
 */

import { sha256Hex } from './scene-plan';
import { stampVisemesFromText, type VisemeStamp } from './visemes';
import { takeKeyForLine } from './timing';
import type { ScenePlan } from './scene-plan';

export interface VoiceTake {
  /** Take key: `takeRef ?? dialogue.id`. */
  id: string;
  dialogueId: string;
  text: string;
  voiceProfileRef: string;
  sampleRate: number;
  pcm: Float32Array;
  durationSec: number;
  visemes: VisemeStamp[];
  /** SHA-256 of the raw PCM bytes — audio determinism evidence. */
  pcmHash: string;
}

export interface VoiceProfile {
  engine: 'kokoro';
  voiceId: string;
  speed: number;
}

/** Parse `kokoro:af_sky@1.0` → { engine, voiceId, speed }. */
export function parseVoiceProfileRef(ref: string): VoiceProfile {
  const match = ref.match(/^(kokoro):([A-Za-z0-9_]+)(?:@([0-9.]+))?$/);
  if (!match) {
    throw new Error(`Invalid voiceProfileRef '${ref}' (expected e.g. 'kokoro:af_sky@1.0')`);
  }
  return { engine: 'kokoro', voiceId: match[2], speed: match[3] ? parseFloat(match[3]) : 1.0 };
}

async function hashPcm(pcm: Float32Array): Promise<string> {
  return sha256Hex(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength));
}

/**
 * Synthesize takes for every dialogue line in the plan that doesn't already
 * have one in `existing`. Lines whose take key is already present are left
 * untouched — this is what makes VO-replace surgical: swap one take, only
 * that line changes.
 */
export async function synthesizeTakes(
  plan: ScenePlan,
  existing?: Map<string, VoiceTake>,
  onProgress?: (done: number, total: number, text: string) => void,
): Promise<Map<string, VoiceTake>> {
  const takes = new Map<string, VoiceTake>(existing);

  const lines = plan.scenes.flatMap((s) => s.dialogue);
  const missing = lines.filter((line) => !takes.has(takeKeyForLine(line)));
  if (missing.length === 0) return takes;

  // Dynamic import — Law L8 / static-export: TTS never lands in the page bundle.
  const { ttsManager } = await import('../tts-manager');

  for (let i = 0; i < missing.length; i++) {
    const line = missing[i];
    onProgress?.(i, missing.length, line.text);

    const profile = parseVoiceProfileRef(line.voiceProfileRef);
    // Request engine viseme stamps (timestamped Kokoro): real per-phoneme timing
    // when the model is present, else result.visemes is undefined and we fall
    // back to text-derived stamps below (Law L6 either way).
    const result = await ttsManager.synthesize(line.text, profile.voiceId, profile.speed, undefined, {
      withVisemes: true,
    });
    const durationSec = result.buffer.length / result.sampleRate;

    // WS-5 upgrade path: use engine-provided viseme stamps when present.
    const engineVisemes = (result as { visemes?: VisemeStamp[] }).visemes;
    const visemes =
      engineVisemes && engineVisemes.length > 0
        ? engineVisemes
        : stampVisemesFromText(line.text, durationSec);

    const key = takeKeyForLine(line);
    takes.set(key, {
      id: key,
      dialogueId: line.id,
      text: line.text,
      voiceProfileRef: line.voiceProfileRef,
      sampleRate: result.sampleRate,
      pcm: result.buffer,
      durationSec,
      visemes,
      pcmHash: await hashPcm(result.buffer),
    });
  }

  onProgress?.(missing.length, missing.length, '');
  return takes;
}

/** Extract the compiler-facing timing/viseme view of a take map (PCM stays behind). */
export function takeTimingInfo(takes: Map<string, VoiceTake>): Map<string, { durationSec: number; visemes: VisemeStamp[] }> {
  const out = new Map<string, { durationSec: number; visemes: VisemeStamp[] }>();
  for (const [key, take] of takes) out.set(key, { durationSec: take.durationSec, visemes: take.visemes });
  return out;
}
