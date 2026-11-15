/**
 * Unit tests for the subtitle timing functions (engine/subtitle-renderer.ts).
 *
 * Every exported MP4 burns captions in with these three pure functions, and
 * wordTimingsFromChunks is what lines captions up with real Whisper
 * timestamps — a regression silently desyncs captions. The file has no
 * imports, so it is tested directly (#27): even word splits, the null/NaN
 * chunk-end fallback, missing-start continuation, empty-chunk skipping, the
 * sliding display window (including its current no-backfill truncation at
 * the end), and the endTime boundary rule.
 */
import { describe, it, expect } from 'vitest';
import {
  generateWordTimings,
  wordTimingsFromChunks,
  getCurrentSubtitleText,
  type TranscriptChunk,
} from './subtitle-renderer';

/** Whisper occasionally emits a null end on the final chunk — build such a chunk past the type. */
function chunk(text: string, start: unknown, end: unknown): TranscriptChunk {
  return { text, timestamp: [start, end] as [number, number] };
}

describe('generateWordTimings', () => {
  it('returns [] for empty or whitespace-only text', () => {
    expect(generateWordTimings('', 0, 5)).toEqual([]);
    expect(generateWordTimings('   \n\t ', 0, 5)).toEqual([]);
  });

  it('splits the duration evenly across words', () => {
    const timings = generateWordTimings('one two three four', 10, 8);
    expect(timings.map((w) => w.word)).toEqual(['one', 'two', 'three', 'four']);
    expect(timings.map((w) => [w.startTime, w.endTime])).toEqual([
      [10, 12],
      [12, 14],
      [14, 16],
      [16, 18],
    ]);
  });

  it('ends the last word exactly at start + duration', () => {
    const timings = generateWordTimings('a b c', 2.5, 3);
    expect(timings[timings.length - 1].endTime).toBe(2.5 + 3);
  });
});

describe('wordTimingsFromChunks', () => {
  it('distributes a chunk\'s words evenly across its real [start, end] span', () => {
    const timings = wordTimingsFromChunks([chunk('hello brave world', 1, 4)]);
    expect(timings.map((w) => [w.word, w.startTime, w.endTime])).toEqual([
      ['hello', 1, 2],
      ['brave', 2, 3],
      ['world', 3, 4],
    ]);
  });

  it('falls back to words * fallbackWordDuration when the chunk end is null', () => {
    const timings = wordTimingsFromChunks([chunk('two words', 5, null)]);
    expect(timings).toHaveLength(2);
    expect(timings[0].startTime).toBeCloseTo(5, 10);
    expect(timings[0].endTime).toBeCloseTo(5.4, 10);
    expect(timings[1].endTime).toBeCloseTo(5.8, 10);
  });

  it('falls back the same way when the chunk end is NaN, honouring a custom fallback', () => {
    const timings = wordTimingsFromChunks([chunk('a b c', 0, NaN)], 0.5);
    expect(timings.map((w) => w.endTime)).toEqual([0.5, 1, 1.5]);
  });

  it('continues from the previous chunk\'s end when a chunk start is missing', () => {
    const timings = wordTimingsFromChunks([
      chunk('first', 0, 2),
      chunk('second part', NaN, 6),
    ]);
    expect(timings.map((w) => [w.word, w.startTime, w.endTime])).toEqual([
      ['first', 0, 2],
      ['second', 2, 4],
      ['part', 4, 6],
    ]);
  });

  it('skips empty-text chunks', () => {
    const timings = wordTimingsFromChunks([
      chunk('   ', 0, 1),
      chunk('', 1, 2),
      chunk('real', 2, 3),
    ]);
    expect(timings.map((w) => w.word)).toEqual(['real']);
  });
});

describe('getCurrentSubtitleText', () => {
  // Ten words, one second each: w0 [0,1) … w9 [9,10).
  const timings = generateWordTimings('w0 w1 w2 w3 w4 w5 w6 w7 w8 w9', 0, 10);

  it('returns empty text and -1 before the first word', () => {
    const later = generateWordTimings('a b', 5, 2);
    expect(getCurrentSubtitleText(later, 2)).toEqual({ text: '', activeWordIndex: -1 });
  });

  it('returns empty text and -1 after the last word', () => {
    expect(getCurrentSubtitleText(timings, 10.5)).toEqual({ text: '', activeWordIndex: -1 });
  });

  it('centres a mid-stream window on the active word', () => {
    expect(getCurrentSubtitleText(timings, 4.5, 6)).toEqual({
      text: 'w1 w2 w3 w4 w5 w6',
      activeWordIndex: 3,
    });
  });

  it('uses a window of 6 by default', () => {
    expect(getCurrentSubtitleText(timings, 4.5)).toEqual(getCurrentSubtitleText(timings, 4.5, 6));
  });

  it('truncates the window near the end without backfilling (current behaviour)', () => {
    // Active word is w9: the start clamps at 9 - 3 = 6, so only 4 words show
    // even though the window size is 6 — the window does not slide back.
    expect(getCurrentSubtitleText(timings, 9.5, 6)).toEqual({
      text: 'w6 w7 w8 w9',
      activeWordIndex: 3,
    });
  });

  it('treats currentTime === endTime as belonging to the next word', () => {
    const result = getCurrentSubtitleText(timings, 1, 6);
    expect(result.text.split(' ')[result.activeWordIndex]).toBe('w1');
  });
});
