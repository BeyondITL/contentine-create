/**
 * Contentine Create — Kokoro timestamped → viseme derivation (WS-5)
 *
 * Pure, deterministic conversion of the timestamped Kokoro model's per-token
 * `durations` output into mouth-shape stamps. No model, no I/O — so it is fully
 * unit-testable in Node and its determinism (Law L6) is provable in isolation.
 *
 * TIMING MODEL (verified against the -timestamped repo, 2026-08-03):
 *   - The model returns `durations` (float32), one value per input token
 *     (`input_ids` = [0, ...phonemeTokens, 0], so the first & last are the pad
 *     tokens Kokoro adds).
 *   - Durations are in Kokoro's alignment frames. The decoder upsamples the
 *     80 Hz alignment lattice to 24 kHz audio, so seconds = Σframes / 80
 *     (R-83 "divisor-80 accumulation"). We accumulate in a single running float
 *     in token order and round6 at each step (matching cartoon/visemes.ts:99) so
 *     float noise can never move a hash.
 *
 * Phoneme → viseme uses the EXISTING `ipaToViseme` (Oculus 15-viseme set); pad
 * tokens and any symbol that maps to nothing become `sil` (closed mouth).
 */

import { ipaToViseme, type Viseme, type VisemeCue } from './viseme';

/** Kokoro alignment-frame rate: 24000 Hz / 300× decoder upsample = 80 fps. */
export const KOKORO_FRAME_RATE = 80;

/** Structurally identical to cartoon/visemes.ts `VisemeStamp` (kept decoupled so
 *  this pure module doesn't import a WS-2 file). `{time, value}` plugs straight
 *  into the voice-takes consumer slot. */
export interface KokoroVisemeStamp {
  /** Seconds from clip start. */
  time: number;
  value: Viseme;
}

/** Round to microsecond precision — identical to cartoon/visemes.ts:99. */
function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}

/**
 * Build viseme stamps from per-token phonemes + durations.
 *
 * @param phonemePerToken One entry per token (length === durations.length),
 *   including the two pad tokens. Pad/empty entries → `sil`.
 * @param durations Per-token alignment-frame counts (the model's `durations`).
 * @returns Ordered, de-duplicated stamps; consecutive identical visemes merge to
 *   the earlier onset (the mouth simply holds).
 */
export function visemeStampsFromDurations(
  phonemePerToken: readonly string[],
  durations: readonly number[],
): KokoroVisemeStamp[] {
  const n = Math.min(phonemePerToken.length, durations.length);
  const stamps: KokoroVisemeStamp[] = [];
  let frames = 0; // running float, fixed token order (Law L6)
  for (let i = 0; i < n; i++) {
    const sym = phonemePerToken[i];
    const viseme: Viseme = sym ? ipaToViseme(sym) : 'sil';
    const time = round6(frames / KOKORO_FRAME_RATE);
    const prev = stamps[stamps.length - 1];
    if (!prev || prev.value !== viseme) {
      stamps.push({ time, value: viseme });
    }
    frames += durations[i] ?? 0;
  }
  if (stamps.length === 0) return [{ time: 0, value: 'sil' }];
  return stamps;
}

/** Total spoken duration implied by the model's durations (seconds). Used for a
 *  sanity check against the waveform length in the worker. */
export function durationsTotalSec(durations: readonly number[]): number {
  let frames = 0;
  for (let i = 0; i < durations.length; i++) frames += durations[i] ?? 0;
  return round6(frames / KOKORO_FRAME_RATE);
}

/**
 * Adapt stamps → `VisemeCue[]` for the tts-line 'aligned' path. Each stamp opens
 * a cue that closes at the next stamp's onset (the last closes at `durationSec`).
 * Timing provenance is `tts-aligned` — the synthesiser's own alignment, honest
 * and distinct from forced-alignment/estimated (Law L1).
 */
export function stampsToCues(stamps: readonly KokoroVisemeStamp[], durationSec: number): VisemeCue[] {
  const cues: VisemeCue[] = [];
  for (let i = 0; i < stamps.length; i++) {
    const start = stamps[i].time;
    const end = i + 1 < stamps.length ? stamps[i + 1].time : Math.max(start, durationSec);
    if (end <= start && i + 1 < stamps.length) continue; // drop zero-width interior cues
    cues.push({ viseme: stamps[i].value, start, end, source: 'tts-aligned' });
  }
  return cues;
}
