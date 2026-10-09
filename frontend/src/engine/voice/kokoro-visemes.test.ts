/**
 * Determinism + timing unit check for the Kokoro timestamped viseme path (WS-5).
 * Law L6: same text+voice ⇒ identical stamps. The model is argmax (no sampling),
 * so given fixed `durations` the derivation must be bit-stable and the divisor-80
 * frame math exact. Pure functions only — no model, no I/O.
 */
import { describe, it, expect } from 'vitest';
import {
  visemeStampsFromDurations,
  durationsTotalSec,
  stampsToCues,
  KOKORO_FRAME_RATE,
} from './kokoro-visemes';

describe('kokoro-visemes', () => {
  it('frame rate is 80 fps (24kHz / 300x decoder upsample)', () => {
    expect(KOKORO_FRAME_RATE).toBe(80);
  });

  it('accumulates durations with divisor-80 in fixed order', () => {
    // pad, "p"(PP), "a"(aa), pad — durations in alignment frames.
    const phonemes = ['$', 'p', 'a', '$'];
    const durations = [8, 40, 120, 12];
    const stamps = visemeStampsFromDurations(phonemes, durations);
    // onsets: 0/80, 8/80, 48/80, 168/80
    expect(stamps).toEqual([
      { time: 0, value: 'sil' },        // leading pad
      { time: 0.1, value: 'PP' },       // 8/80
      { time: 0.6, value: 'aa' },       // 48/80
      { time: 2.1, value: 'sil' },      // 168/80 trailing pad
    ]);
  });

  it('is deterministic — identical inputs give deeply-equal output', () => {
    const p = ['$', 't', 'ʃ', 'i', '$'];
    const d = [5, 30, 25, 90, 10];
    expect(visemeStampsFromDurations(p, d)).toEqual(visemeStampsFromDurations(p, d));
  });

  it('merges consecutive identical visemes to the earlier onset', () => {
    // 'n' and 'l' both map to viseme 'nn' → single stamp held across both.
    const stamps = visemeStampsFromDurations(['n', 'l', 'a'], [40, 40, 40]);
    expect(stamps).toEqual([
      { time: 0, value: 'nn' },
      { time: 1, value: 'aa' }, // 80/80
    ]);
  });

  it('maps unknown/pad symbols to sil', () => {
    const stamps = visemeStampsFromDurations(['ˈ', '', 'p'], [10, 10, 80]);
    // 'ˈ' → sil, '' → sil (merged), 'p' → PP
    expect(stamps).toEqual([
      { time: 0, value: 'sil' },
      { time: 0.25, value: 'PP' }, // 20/80
    ]);
  });

  it('durationsTotalSec sums frames / 80', () => {
    expect(durationsTotalSec([80, 80, 160])).toBe(4);
    expect(durationsTotalSec([])).toBe(0);
  });

  it('never returns an empty stamp list', () => {
    expect(visemeStampsFromDurations([], [])).toEqual([{ time: 0, value: 'sil' }]);
  });

  it('stampsToCues pairs onsets into intervals ending at durationSec', () => {
    const stamps = [
      { time: 0, value: 'sil' as const },
      { time: 0.5, value: 'PP' as const },
      { time: 1.0, value: 'aa' as const },
    ];
    const cues = stampsToCues(stamps, 1.5);
    expect(cues).toEqual([
      { viseme: 'sil', start: 0, end: 0.5, source: 'tts-aligned' },
      { viseme: 'PP', start: 0.5, end: 1.0, source: 'tts-aligned' },
      { viseme: 'aa', start: 1.0, end: 1.5, source: 'tts-aligned' },
    ]);
  });
});
