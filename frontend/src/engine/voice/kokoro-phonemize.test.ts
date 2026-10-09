/**
 * Locks the pure (no-espeak) text normalizer ported from kokoro-js@1.2.1's
 * private `m()`. These are the behaviours that must match kokoro-js so the
 * timestamped path phonemizes a line identically to the base Voice Studio path.
 */
import { describe, it, expect } from 'vitest';
import { normalizeText, voiceLang } from './kokoro-phonemize';

describe('kokoro-phonemize / normalizeText', () => {
  it('is a near-identity on plain dialogue', () => {
    expect(normalizeText('Hello there, friend!')).toBe('Hello there, friend!');
  });

  it('expands common abbreviations', () => {
    expect(normalizeText('Dr. Smith')).toBe('Doctor Smith');
    expect(normalizeText('Mr. Smith')).toBe('Mister Smith');
  });

  it('expands currency', () => {
    expect(normalizeText('$5')).toBe('5 dollars');
    expect(normalizeText('$1')).toBe('1 dollar');
  });

  it('expands year-style four-digit numbers', () => {
    expect(normalizeText('1990')).toBe('19 90');
  });

  it('is deterministic', () => {
    const s = 'The year 1999 cost $3.50 on Dr. Vale’s desk.';
    expect(normalizeText(s)).toBe(normalizeText(s));
  });

  it('voiceLang maps a*/b* voices to en-us/en-gb keys', () => {
    expect(voiceLang('af_sky')).toBe('a');
    expect(voiceLang('am_adam')).toBe('a');
    expect(voiceLang('bf_emma')).toBe('b');
    expect(voiceLang('bm_george')).toBe('b');
  });
});
