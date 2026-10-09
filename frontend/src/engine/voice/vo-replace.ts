'use client';

/**
 * Contentine Create — VO-replace loop (WS-5)
 *
 * Replace one dialogue line's audio with a user recording or upload, then make
 * it belong to the scene:
 *   1. decode take → mono PCM
 *   2. forced alignment against the KNOWN line text → re-keyed viseme cues
 *   3. Match-Tone pass (HP → noise suppression → shared EQ → compression →
 *      shared room preset → EBU-R128 loudness normalise → peak-safe limit)
 *   4. optional crossfaded splice into a surrounding mix
 *
 * All DSP is the deterministic pure-Float32 chain in match-tone.ts (Law L6);
 * the aligner is whisper-tiny word timing (forced-aligner.ts). Nothing here is
 * simulated — before/after metrics come straight from the processed samples.
 */

import type { VisemeCue } from './viseme';
import { alignToVisemes } from './forced-aligner';
import {
  matchTone,
  crossfadeSplice,
  type MatchToneOptions,
  type RoomPreset,
  type ToneMetrics,
} from './match-tone';

export interface VOReplaceInput {
  /** Recorded (MediaRecorder) or uploaded audio for the new take. */
  take: Blob;
  /** The line's script text — authoritative content for re-keying visemes. */
  knownText: string;
  /** Shared scene room so the line matches the others. Default 'booth'. */
  room?: RoomPreset;
  /** Reference integrated loudness for the scene (LUFS). Default -16. */
  targetLufs?: number;
  onProgress?: (stage: string, p: number) => void;
}

export interface VOReplaceResult {
  /** Processed mono PCM (Match-Tone applied). */
  audio: Float32Array;
  sampleRate: number;
  /** WAV blob of the processed take. */
  wav: Blob;
  /** Viseme cues re-keyed to the new take (forced alignment). */
  visemes: VisemeCue[];
  before: ToneMetrics;
  after: ToneMetrics;
}

/** Decode any browser-supported audio Blob to mono Float32 PCM + its rate. */
async function decodeToMono(blob: Blob): Promise<{ pcm: Float32Array; sampleRate: number }> {
  const arrayBuf = await blob.arrayBuffer();
  const Ctx = (window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
  const ctx = new Ctx();
  try {
    const decoded = await ctx.decodeAudioData(arrayBuf);
    const ch = decoded.numberOfChannels;
    const len = decoded.length;
    const mono = new Float32Array(len);
    for (let c = 0; c < ch; c++) {
      const data = decoded.getChannelData(c);
      for (let i = 0; i < len; i++) mono[i] += data[i] / ch;
    }
    return { pcm: mono, sampleRate: decoded.sampleRate };
  } finally {
    await ctx.close();
  }
}

/** Encode mono Float32 PCM to a 16-bit WAV blob. */
function pcmToWav(pcm: Float32Array, sampleRate: number): Blob {
  const dataSize = pcm.length * 2;
  const buf = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buf);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); view.setUint32(4, 36 + dataSize, true); str(8, 'WAVE');
  str(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  str(36, 'data'); view.setUint32(40, dataSize, true);
  let off = 44;
  for (let i = 0; i < pcm.length; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    off += 2;
  }
  return new Blob([buf], { type: 'audio/wav' });
}

/**
 * Run the full VO-replace loop for one line. Returns the tone-matched audio,
 * re-keyed visemes, and before/after acoustic metrics.
 */
export async function replaceLineVO(input: VOReplaceInput): Promise<VOReplaceResult> {
  input.onProgress?.('decode', 0);
  const { pcm, sampleRate } = await decodeToMono(input.take);

  input.onProgress?.('match-tone', 0.3);
  const toneOpts: MatchToneOptions = {
    sampleRate,
    room: input.room ?? 'booth',
    targetLufs: input.targetLufs ?? -16,
  };
  const { audio, before, after } = matchTone(pcm, toneOpts);

  input.onProgress?.('align', 0.6);
  const visemes = await alignToVisemes(audio, sampleRate, input.knownText, (p) =>
    input.onProgress?.('align', 0.6 + p * 0.35),
  );

  input.onProgress?.('done', 1);
  return { audio, sampleRate, wav: pcmToWav(audio, sampleRate), visemes, before, after };
}

/**
 * Splice a processed take into a surrounding line/mix with equal-power
 * crossfades so the seam is inaudible.
 */
export function spliceIntoMix(
  base: Float32Array,
  take: Float32Array,
  atSample: number,
  sampleRate: number,
  fadeMs = 12,
): Float32Array {
  return crossfadeSplice(base, take, atSample, sampleRate, fadeMs);
}

export { pcmToWav as encodeWav };
