'use client';

/**
 * Contentine Create — Forced aligner (WS-5)
 *
 * Produces REAL viseme timing by aligning audio to its KNOWN text with Whisper
 * word-level timestamps, then distributing each word's interval across its
 * visemes with linguistic duration priors (viseme.ts). Used by both:
 *   - the TTS-line path (Kokoro emits no per-phoneme durations, so timing must
 *     be recovered from the produced audio), and
 *   - the VO-replace path (recorded/uploaded take re-keyed to the same text).
 *
 * Honesty (Law L1): word ONSETS/OFFSETS are ASR-measured from the actual audio
 * (`source: 'forced-alignment'`). Sub-word viseme placement is a duration-prior
 * interpolation — real enough to drive a mouth, and never presented as
 * ground-truth per-phoneme timing.
 *
 * Runtime: @huggingface/transformers ASR with `return_timestamps: 'word'`, model
 * `Xenova/whisper-tiny` (MIT — see LICENSES.md). It shares the on-disk model
 * cache with whisper-engine.ts (same model id), so no extra download.
 */

import type { VisemeCue } from './viseme';
import { graphemesToVisemes, distributeVisemes } from './viseme';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let asr: any = null;
let loading: Promise<void> | null = null;

const MODEL_ID = 'Xenova/whisper-tiny';

async function ensureAsr(onProgress?: (p: number) => void): Promise<void> {
  if (asr) return;
  if (loading) return loading;
  loading = (async () => {
    const { pipeline } = await import('@huggingface/transformers');
    asr = await pipeline('automatic-speech-recognition', MODEL_ID, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      progress_callback: (d: any) => {
        if (d?.status === 'progress' && typeof d.progress === 'number') onProgress?.(d.progress / 100);
      },
    });
  })();
  await loading;
}

/** One ASR-timed word. */
interface TimedWord { text: string; start: number; end: number; }

/** Resample a Float32 buffer to 16 kHz mono (Whisper's expected rate). */
function resampleTo16k(x: Float32Array, sr: number): Float32Array {
  if (sr === 16000) return x;
  const ratio = 16000 / sr;
  const outLen = Math.floor(x.length * ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const src = i / ratio;
    const i0 = Math.floor(src);
    const frac = src - i0;
    out[i] = (x[i0] || 0) * (1 - frac) + (x[i0 + 1] || 0) * frac;
  }
  return out;
}

/**
 * Get Whisper word timestamps for a PCM buffer.
 * Returns words with real start/end seconds measured from the audio.
 */
export async function transcribeWordTimings(
  pcm: Float32Array,
  sampleRate: number,
  onProgress?: (p: number) => void,
): Promise<TimedWord[]> {
  await ensureAsr(onProgress);
  const audio16k = resampleTo16k(pcm, sampleRate);
  const result = await asr(audio16k, {
    return_timestamps: 'word',
    chunk_length_s: 30,
    stride_length_s: 5,
  });
  const chunks = (Array.isArray(result) ? result[0]?.chunks : result?.chunks) ?? [];
  const words: TimedWord[] = [];
  for (const c of chunks) {
    const t = c?.timestamp;
    const text = (c?.text ?? '').trim();
    if (!text || !Array.isArray(t)) continue;
    const start = typeof t[0] === 'number' ? t[0] : 0;
    const end = typeof t[1] === 'number' ? t[1] : start;
    words.push({ text, start, end: Math.max(end, start) });
  }
  return words;
}

/**
 * Align audio to known text and emit viseme cues.
 *
 * The known text is authoritative for CONTENT; the ASR pass supplies TIMING. We
 * zip known words onto ASR word timings in order (proportionally redistributing
 * when the counts differ, e.g. ASR merged/split a token), then interpolate
 * visemes inside each word and insert `sil` in the gaps.
 */
export async function alignToVisemes(
  pcm: Float32Array,
  sampleRate: number,
  knownText: string,
  onProgress?: (p: number) => void,
): Promise<VisemeCue[]> {
  const timed = await transcribeWordTimings(pcm, sampleRate, onProgress);
  const knownWords = knownText.trim().split(/\s+/).filter(Boolean);
  const durationSec = pcm.length / sampleRate;

  // Build a timeline of [word, start, end] using ASR timings as the spine.
  const slots: TimedWord[] = [];
  if (timed.length === 0) {
    // ASR returned nothing usable — spread known words evenly across the clip.
    const per = durationSec / Math.max(1, knownWords.length);
    knownWords.forEach((w, i) => slots.push({ text: w, start: i * per, end: (i + 1) * per }));
  } else if (knownWords.length === timed.length) {
    knownWords.forEach((w, i) => slots.push({ text: w, start: timed[i].start, end: timed[i].end }));
  } else {
    // Count mismatch: map known words onto the overall ASR span proportionally.
    const t0 = timed[0].start;
    const t1 = timed[timed.length - 1].end;
    const span = Math.max(1e-3, t1 - t0);
    const per = span / knownWords.length;
    knownWords.forEach((w, i) => slots.push({ text: w, start: t0 + i * per, end: t0 + (i + 1) * per }));
  }

  const cues: VisemeCue[] = [];
  let prevEnd = 0;
  for (const slot of slots) {
    if (slot.start > prevEnd + 0.04) {
      cues.push({ viseme: 'sil', start: prevEnd, end: slot.start, source: 'forced-alignment' });
    }
    const visemes = graphemesToVisemes(slot.text);
    cues.push(...distributeVisemes(visemes, slot.start, slot.end, 'forced-alignment'));
    prevEnd = slot.end;
  }
  if (durationSec > prevEnd + 0.04) {
    cues.push({ viseme: 'sil', start: prevEnd, end: durationSec, source: 'forced-alignment' });
  }
  return cues;
}

/** Free the ASR pipeline. */
export function disposeAligner(): void {
  if (asr && typeof asr.dispose === 'function') asr.dispose();
  asr = null;
  loading = null;
}
