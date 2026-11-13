/**
 * Viseme mapping unit check (WS-5).
 *
 * The forced-alignment lip-sync path and the TTS-line path both depend on
 * the pure helpers in viseme.ts, but none had a direct test. Pins the IPA
 * mapping, IPA normalization (stress stripped, digraphs kept together),
 * the grapheme fallback heuristic, and the duration-weighted distribution
 * (consecutive duplicates merged, final cue clamped to the interval end).
 */
import { describe, it, expect } from 'vitest';
import {
  ipaToViseme,
  normalizeIpa,
  graphemesToVisemes,
  distributeVisemes,
} from './viseme';

describe('ipaToViseme', () => {
  it('maps representative symbols from each viseme group', () => {
    expect(ipaToViseme('p')).toBe('PP');
    expect(ipaToViseme('ð')).toBe('TH');
    expect(ipaToViseme('tʃ')).toBe('CH');
    expect(ipaToViseme('s')).toBe('SS');
    expect(ipaToViseme('a')).toBe('aa');
  });

  it('returns sil for an unknown symbol', () => {
    expect(ipaToViseme('ɧ')).toBe('sil');
    expect(ipaToViseme('?')).toBe('sil');
  });
});

describe('normalizeIpa', () => {
  it('strips stress and keeps digraphs together', () => {
    expect(normalizeIpa('ˈtʃiːz')).toEqual(['tʃ', 'iː', 'z']);
  });

  it('strips secondary stress and syllable marks', () => {
    expect(normalizeIpa('ˌhɛl.oʊ')).toEqual(['h', 'ɛ', 'l', 'oʊ']);
  });
});

describe('graphemesToVisemes', () => {
  it('maps "the" through the th digraph', () => {
    expect(graphemesToVisemes('the')).toEqual(['TH', 'E']);
  });

  it('falls back to aa for empty or letter-free input', () => {
    expect(graphemesToVisemes('')).toEqual(['aa']);
    expect(graphemesToVisemes('123')).toEqual(['aa']);
  });
});

describe('distributeVisemes', () => {
  it('merges consecutive duplicates, ends exactly at end, and tags the source', () => {
    const cues = distributeVisemes(['PP', 'PP', 'aa'], 0, 1, 'estimated');
    expect(cues).toHaveLength(2);
    expect(cues[0].viseme).toBe('PP');
    expect(cues[0].start).toBe(0);
    expect(cues[1].viseme).toBe('aa');
    expect(cues[1].end).toBe(1);
    expect(cues.every((c) => c.source === 'estimated')).toBe(true);
  });

  it('weights durations by the openness prior (vowels dwell longer than stops)', () => {
    const cues = distributeVisemes(['PP', 'aa'], 0, 2.2, 'tts-aligned');
    expect(cues).toHaveLength(2);
    expect(cues[0].end).toBeCloseTo(0.6);
    expect(cues[1].start).toBeCloseTo(0.6);
    expect(cues[1].end).toBe(2.2);
  });

  it('returns [] for an empty list or a non-positive interval', () => {
    expect(distributeVisemes([], 0, 1, 'estimated')).toEqual([]);
    expect(distributeVisemes(['PP'], 1, 1, 'estimated')).toEqual([]);
    expect(distributeVisemes(['PP'], 2, 1, 'estimated')).toEqual([]);
  });
});
