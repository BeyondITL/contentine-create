'use client';

/**
 * Contentine Create — Per-line TTS API (WS-5 → WS-2 contract)
 *
 * The clean surface the cartoon engine consumes for the tracer scene:
 *   text line in → { audio buffer, sample rate, WAV blob, viseme cues } out.
 *
 * Audio is Kokoro (Apache-2.0, hexgrad/kokoro via kokoro-js — see LICENSES.md),
 * synthesised off-thread by tts-manager.ts. Viseme timing is REAL forced
 * alignment of the produced audio against the known line text (forced-aligner.ts);
 * Kokoro exposes no per-phoneme durations, so this is the honest path (Law L1).
 *
 * For instant UI scrubbing before the (heavier) alignment finishes, callers may
 * request `estimated` visemes — clearly tagged `source: 'estimated'` and never a
 * substitute for the aligned timing.
 */

import { ttsManager } from '../tts-manager';
import type { VisemeCue } from './viseme';
import { graphemesToVisemes, distributeVisemes } from './viseme';
import { alignToVisemes } from './forced-aligner';
import { stampsToCues } from './kokoro-visemes';

export interface LineOptions {
  /** Kokoro voice id (e.g. 'af_sky', 'am_adam'). Default 'af_sky'. */
  voiceId?: string;
  /** Speaking speed 0.75–1.5. Default 1.0. */
  speed?: number;
  /**
   * Viseme timing mode:
   *   'aligned'   — real forced-alignment timing (default; WS-2 render path).
   *   'estimated' — instant linguistic-prior guess for UI preview only.
   *   'none'      — skip visemes (audio only).
   */
  visemes?: 'aligned' | 'estimated' | 'none';
  onProgress?: (p: number) => void;
}

export interface LineResult {
  /** Mono PCM, Kokoro's native sample rate (24 kHz). */
  audio: Float32Array;
  sampleRate: number;
  /** WAV-encoded blob for playback/preview/mux. */
  wav: Blob;
  /** Mouth-shape cues over the clip. Empty when `visemes: 'none'`. */
  visemes: VisemeCue[];
  /** How the viseme timing was derived. */
  visemeSource: 'forced-alignment' | 'tts-aligned' | 'estimated' | 'none';
  /** Echo of the line text (content-of-record for the cue track). */
  text: string;
  durationSec: number;
}

const KOKORO_SAMPLE_RATE = 24000;

/** Rough syllable/character estimate → instant preview visemes (no alignment). */
function estimateLineVisemes(text: string, durationSec: number): VisemeCue[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  // Weight each word by its viseme count so longer words get more time.
  const perWord = words.map((w) => ({ w, vis: graphemesToVisemes(w) }));
  const totalVis = perWord.reduce((s, p) => s + p.vis.length, 0);
  const cues: VisemeCue[] = [];
  let t = 0;
  for (const { vis } of perWord) {
    const wordDur = (vis.length / totalVis) * durationSec;
    cues.push(...distributeVisemes(vis, t, t + wordDur, 'estimated'));
    t += wordDur;
  }
  return cues;
}

/**
 * Synthesise a single dialogue/narration line and return audio + viseme cues.
 * This is the primary API WS-2 calls per line of the tracer scene.
 */
export async function synthesizeLine(text: string, opts: LineOptions = {}): Promise<LineResult> {
  const voiceId = opts.voiceId ?? 'af_sky';
  const speed = opts.speed ?? 1.0;
  const mode = opts.visemes ?? 'aligned';

  const result = await ttsManager.synthesize(
    text, voiceId, speed,
    (p) => opts.onProgress?.(p.percent / 100),
    { withVisemes: mode === 'aligned' },
  );
  const { buffer, sampleRate } = result;
  const wav = ttsManager.pcmToWav(buffer, sampleRate);
  const durationSec = buffer.length / sampleRate;

  let visemes: VisemeCue[] = [];
  let visemeSource: LineResult['visemeSource'] = 'none';
  if (mode === 'aligned') {
    if (result.visemes && result.visemes.length > 0) {
      // Prefer the synthesiser's own per-phoneme durations (real model timing).
      visemes = stampsToCues(result.visemes, durationSec);
      visemeSource = 'tts-aligned';
    } else {
      // No timestamped model available — fall back to forced alignment of the
      // produced audio against the known text (whisper-tiny).
      visemes = await alignToVisemes(buffer, sampleRate, text);
      visemeSource = 'forced-alignment';
    }
  } else if (mode === 'estimated') {
    visemes = estimateLineVisemes(text, durationSec);
    visemeSource = 'estimated';
  }

  return { audio: buffer, sampleRate: sampleRate || KOKORO_SAMPLE_RATE, wav, visemes, visemeSource, text, durationSec };
}

/**
 * Synthesise many lines in order (e.g. all dialogue in a scene).
 * Alignment runs per line; pass `visemes:'estimated'` for a fast first pass.
 */
export async function synthesizeLines(
  lines: Array<{ id: string; text: string; voiceId?: string; speed?: number }>,
  opts: Omit<LineOptions, 'onProgress'> & { onLine?: (id: string, i: number, total: number) => void } = {},
): Promise<Map<string, LineResult>> {
  const out = new Map<string, LineResult>();
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (!ln.text.trim()) continue;
    opts.onLine?.(ln.id, i, lines.length);
    out.set(ln.id, await synthesizeLine(ln.text, {
      voiceId: ln.voiceId ?? opts.voiceId,
      speed: ln.speed ?? opts.speed,
      visemes: opts.visemes,
    }));
  }
  return out;
}
