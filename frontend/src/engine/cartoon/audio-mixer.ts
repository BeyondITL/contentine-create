/**
 * Contentine Create — Cartoon Engine: Offline audio mix
 *
 * Mixes dialogue takes + music cues + sfx into the final stereo master as a
 * fully offline render (Law L6 — never realtime capture). Empirical C-M1
 * harness finding: Chrome's OfflineAudioContext graph summation shows 1-ULP
 * run-to-run jitter once several sources overlap, so the summation itself is
 * done sample-by-sample in JS — bit-exact by construction. OfflineAudioContext
 * is still used to decode caller-supplied `asset:` audio. Music ducks under
 * dialogue with a piecewise-linear envelope derived from the computed
 * dialogue windows — same plan + takes ⇒ same envelope ⇒ same mix.
 *
 * Asset refs:
 *   `proc:<name>`  — built-in procedural beds/sfx (original, license-free),
 *                    synthesized sample-by-sample in pure JS (bit-exact).
 *   `asset:<id>`   — caller-supplied encoded audio (WS-6 CC0/owned library),
 *                    decoded via decodeAudioData.
 */

import { sha256Hex, type ScenePlan } from './scene-plan';
import type { PlanTiming } from './timing';
import type { VoiceTake } from './voice-takes';

export const MIX_SAMPLE_RATE = 48000;

export interface MixedAudio {
  /** Planar stereo PCM at MIX_SAMPLE_RATE. */
  left: Float32Array;
  right: Float32Array;
  sampleRate: number;
  durationSec: number;
  /** SHA-256 over both channels — mix determinism evidence. */
  pcmHash: string;
}

export interface MixOptions {
  /** Encoded audio bytes for `asset:` refs, keyed by full assetRef. */
  audioAssets?: Map<string, ArrayBuffer>;
}

const DEFAULT_MUSIC_GAIN = 0.35;
const DEFAULT_DUCK_TO = 0.12;
const DEFAULT_SFX_GAIN = 0.8;
const DUCK_ATTACK = 0.2;
const DUCK_RELEASE = 0.35;

// ─── Procedural sources (original assets — no license exposure) ──────────────
//
// All procedural audio is synthesized in pure JS float math and summed in JS.
// Empirical finding (C-M1 harness): OfflineAudioContext graphs show 1-ULP
// run-to-run jitter (oscillator nodes, and summation once several sources
// overlap) — so neither audio nodes nor graph summation are used here (L6).

/** Chord frequencies for the procedural pads (warm, low). */
const PAD_CHORDS: Record<string, number[]> = {
  'proc:warm-pad': [130.81, 164.81, 196.0, 261.63],   // C major, low
  'proc:uplift-pad': [146.83, 185.0, 220.0, 293.66],  // D major, low
};

/** Piecewise-linear envelope evaluated per sample. Points must be time-sorted. */
function envelopeAt(points: Array<[number, number]>, t: number): number {
  if (t <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    if (t <= points[i][0]) {
      const [t0, v0] = points[i - 1];
      const [t1, v1] = points[i];
      return t1 === t0 ? v1 : v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
    }
  }
  return points[points.length - 1][1];
}

/** Synthesize a pad bed: detuned triangle voices with slow swells. Pure math. */
function renderPadPcm(name: string, durationSec: number, sampleRate: number): Float32Array {
  const freqs = PAD_CHORDS[name] ?? PAD_CHORDS['proc:warm-pad'];
  const n = Math.max(1, Math.round(durationSec * sampleRate));
  const out = new Float32Array(n);

  for (let v = 0; v < freqs.length; v++) {
    const base = (0.16 / freqs.length) * (v % 2 === 0 ? 1.15 : 0.9);
    // Attack → repeating swell → release, all piecewise linear.
    const env: Array<[number, number]> = [[0, 0], [0.8 + v * 0.15, base]];
    const swellPeriod = 3.2 + v * 0.7;
    for (let t = 2; t < durationSec - 0.4; t += swellPeriod) {
      env.push([Math.min(t + swellPeriod / 2, durationSec - 0.4), base * 0.7]);
      env.push([Math.min(t + swellPeriod, durationSec - 0.4), base]);
    }
    env.push([durationSec - 0.4, base]);
    env.push([durationSec, 0]);
    env.sort((a, b) => a[0] - b[0]);

    const phaseInc = freqs[v] / sampleRate;
    let phase = 0;
    for (let i = 0; i < n; i++) {
      // Triangle wave from phase (0..1): 4|phase-0.5|-1 in [-1,1].
      const tri = 4 * Math.abs(phase - 0.5) - 1;
      out[i] += tri * envelopeAt(env, i / sampleRate);
      phase += phaseInc;
      if (phase >= 1) phase -= 1;
    }
  }
  return out;
}

/** Synthesize one sfx hit. Pure math (LCG noise, no filter nodes). */
function renderSfxPcm(name: string, sampleRate: number): Float32Array {
  switch (name) {
    case 'proc:pop': {
      const dur = 0.16;
      const n = Math.round(dur * sampleRate);
      const out = new Float32Array(n);
      let phase = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sampleRate;
        // Exponential 520 → 180 Hz sweep over 90 ms, then hold.
        const f = t < 0.09 ? 520 * Math.pow(180 / 520, t / 0.09) : 180;
        const gain = Math.pow(0.001, Math.min(1, t / 0.14));
        out[i] = Math.sin(2 * Math.PI * phase) * gain;
        phase += f / sampleRate;
      }
      return out;
    }
    case 'proc:ding': {
      const dur = 0.95;
      const n = Math.round(dur * sampleRate);
      const out = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const t = i / sampleRate;
        const gain = 0.7 * Math.pow(0.001, Math.min(1, t / 0.9));
        out[i] = Math.sin(2 * Math.PI * 1318.5 * t) * gain; // E6
      }
      return out;
    }
    case 'proc:whoosh': {
      const dur = 0.4;
      const n = Math.round(dur * sampleRate);
      const out = new Float32Array(n);
      let x = 1234567; // deterministic LCG noise
      let lp = 0;
      let lp2 = 0;
      for (let i = 0; i < n; i++) {
        x = (x * 1103515245 + 12345) & 0x7fffffff;
        const noise = (x / 0x3fffffff - 1) * (1 - i / n);
        // Sweeping one-pole band-ish shaping: difference of two lowpasses.
        const f = 400 * Math.pow(2200 / 400, i / n);
        const a = Math.min(0.98, (2 * Math.PI * f) / sampleRate);
        lp += a * (noise - lp);
        lp2 += (a * 0.5) * (lp - lp2);
        out[i] = (lp - lp2) * 2.5 * 0.8;
      }
      return out;
    }
    default:
      throw new Error(`Unknown procedural sfx '${name}'`);
  }
}

/**
 * Bake the dialogue-ducking envelope into a music PCM buffer.
 * `windows` are dialogue [start, end) in seconds relative to the buffer start.
 */
function applyDuckEnvelope(
  pcm: Float32Array,
  sampleRate: number,
  baseGain: number,
  duckTo: number,
  windows: Array<[number, number]>,
): void {
  for (let i = 0; i < pcm.length; i++) {
    const t = i / sampleRate;
    let gain = baseGain;
    for (const [start, end] of windows) {
      let g = baseGain;
      if (t >= start && t < end) g = duckTo;
      else if (t >= start - DUCK_ATTACK && t < start) g = baseGain + ((duckTo - baseGain) * (t - (start - DUCK_ATTACK))) / DUCK_ATTACK;
      else if (t >= end && t < end + DUCK_RELEASE) g = duckTo + ((baseGain - duckTo) * (t - end)) / DUCK_RELEASE;
      if (g < gain) gain = g;
    }
    pcm[i] *= gain;
  }
}

// ─── Mixer ───────────────────────────────────────────────────────────────────

/** Linear-resample `src` (srcRate) and add it into both channels at `startSec`. */
function addMono(
  left: Float32Array,
  right: Float32Array,
  src: Float32Array,
  srcRate: number,
  startSec: number,
  gain: number,
  outRate: number,
): void {
  const startSample = Math.round(startSec * outRate);
  const outLen = Math.min(
    Math.floor(((src.length - 1) * outRate) / srcRate),
    left.length - startSample,
  );
  const ratio = srcRate / outRate;
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const frac = pos - i0;
    const v = (src[i0] + (src[i0 + 1] - src[i0]) * frac) * gain;
    const o = startSample + i;
    if (o < 0) continue;
    left[o] += v;
    right[o] += v;
  }
}

/** Decode an `asset:` ref to mono PCM at the mix rate (nearest-sample flatten). */
async function decodeAssetMono(bytes: ArrayBuffer, targetLen: number, outRate: number): Promise<Float32Array> {
  const decodeCtx = new OfflineAudioContext(1, 1, outRate);
  const decoded = await decodeCtx.decodeAudioData(bytes.slice(0));
  const src = decoded.getChannelData(0);
  const out = new Float32Array(targetLen);
  const ratio = decoded.sampleRate / outRate;
  for (let i = 0; i < targetLen; i++) {
    out[i] = src[Math.floor(i * ratio) % src.length]; // loops when shorter than the scene
  }
  return out;
}

/**
 * Render the full project mix offline. Main-thread only (asset decode uses
 * OfflineAudioContext); the resulting PCM is transferred to the render worker
 * for AAC encode + mux.
 */
export async function mixPlanAudio(
  plan: ScenePlan,
  timing: PlanTiming,
  takes: Map<string, VoiceTake>,
  options: MixOptions = {},
): Promise<MixedAudio> {
  const n = Math.max(1, Math.ceil(timing.totalDuration * MIX_SAMPLE_RATE));
  const left = new Float32Array(n);
  const right = new Float32Array(n);

  // ── Dialogue ──────────────────────────────────────────────────────────────
  for (const dw of timing.dialogue) {
    const take = takes.get(dw.takeKey);
    if (!take) throw new Error(`Missing voice take '${dw.takeKey}' for dialogue '${dw.dialogueId}'`);
    addMono(left, right, take.pcm, take.sampleRate, dw.start, 1.0, MIX_SAMPLE_RATE);
  }

  // ── Music (per scene cue) with dialogue ducking baked into the PCM ────────
  for (let i = 0; i < plan.scenes.length; i++) {
    const scene = plan.scenes[i];
    const window = timing.scenes[i];
    const cue = scene.musicCue;
    if (!cue) continue;

    const base = cue.gain ?? DEFAULT_MUSIC_GAIN;
    const duckTo = cue.duckTo ?? DEFAULT_DUCK_TO;
    const duckWindows: Array<[number, number]> = timing.dialogue
      .filter((dw) => dw.sceneId === scene.id)
      .map((dw) => [dw.start - window.start, dw.end - window.start]);

    let pcm: Float32Array;
    if (cue.assetRef.startsWith('proc:')) {
      pcm = renderPadPcm(cue.assetRef, window.duration, MIX_SAMPLE_RATE);
    } else {
      const bytes = options.audioAssets?.get(cue.assetRef);
      if (!bytes) throw new Error(`Music asset '${cue.assetRef}' not supplied in audioAssets`);
      pcm = await decodeAssetMono(bytes, Math.round(window.duration * MIX_SAMPLE_RATE), MIX_SAMPLE_RATE);
    }
    applyDuckEnvelope(pcm, MIX_SAMPLE_RATE, base, duckTo, duckWindows);
    addMono(left, right, pcm, MIX_SAMPLE_RATE, window.start, 1.0, MIX_SAMPLE_RATE);
  }

  // ── SFX ───────────────────────────────────────────────────────────────────
  for (let i = 0; i < plan.scenes.length; i++) {
    const scene = plan.scenes[i];
    const window = timing.scenes[i];
    for (const fx of scene.sfx) {
      const at = window.start + fx.at;
      if (at >= window.end) continue;
      const gain = fx.gain ?? DEFAULT_SFX_GAIN;
      let pcm: Float32Array;
      if (fx.assetRef.startsWith('proc:')) {
        pcm = renderSfxPcm(fx.assetRef, MIX_SAMPLE_RATE);
      } else {
        const bytes = options.audioAssets?.get(fx.assetRef);
        if (!bytes) throw new Error(`Sfx asset '${fx.assetRef}' not supplied in audioAssets`);
        pcm = await decodeAssetMono(bytes, Math.round(0.5 * MIX_SAMPLE_RATE) * 8, MIX_SAMPLE_RATE);
      }
      addMono(left, right, pcm, MIX_SAMPLE_RATE, at, gain, MIX_SAMPLE_RATE);
    }
  }

  // ── Master: headroom gain + hard clamp ────────────────────────────────────
  for (let i = 0; i < n; i++) {
    left[i] = Math.max(-1, Math.min(1, left[i] * 0.9));
    right[i] = Math.max(-1, Math.min(1, right[i] * 0.9));
  }

  const hashInput = new Uint8Array(left.byteLength + right.byteLength);
  hashInput.set(new Uint8Array(left.buffer), 0);
  hashInput.set(new Uint8Array(right.buffer), left.byteLength);

  return {
    left,
    right,
    sampleRate: MIX_SAMPLE_RATE,
    durationSec: n / MIX_SAMPLE_RATE,
    pcmHash: await sha256Hex(hashInput),
  };
}
