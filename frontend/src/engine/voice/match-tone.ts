/**
 * Contentine Create — Match-Tone DSP core (WS-5)
 *
 * Pure, dependency-free, deterministic signal processing so a replaced VO line
 * sits in the same acoustic space as the rest of the scene. Operating on plain
 * Float32Array (no WebAudio graph) means the same input yields byte-identical
 * output on any device — satisfying Law L6 determinism — and lets the offline
 * artifact harness run the exact shipping algorithm under Node.
 *
 * Chain (order matters): high-pass rumble cut → spectral noise suppression →
 * shared EQ preset → compression → shared room convolution → loudness
 * normalisation (EBU R128 / BS.1770 K-weighting) → true-peak-safe limiter.
 *
 * The real-time monitoring worklet (noise-suppression while recording) lives in
 * match-tone-worklet.ts and shares the `spectralDenoise` primitive; the committed
 * take is always re-rendered through this offline path for determinism.
 */

export type RoomPreset = 'dry' | 'booth' | 'room' | 'hall';

export interface MatchToneOptions {
  sampleRate: number;
  /** Target integrated loudness (LUFS). Web VO reference: -16. */
  targetLufs?: number;
  /** Shared room acoustic so every line matches. Default 'booth'. */
  room?: RoomPreset;
  /** High-pass cutoff (Hz) to remove rumble/plosive thump. Default 80. */
  highPassHz?: number;
  /** Noise-suppression strength 0..1 (0 = off). Default 0.75. */
  denoise?: number;
}

export interface ToneMetrics {
  integratedLufs: number;
  peakDbfs: number;
  /** Estimated noise-floor level in dBFS (quietest frames). */
  noiseFloorDbfs: number;
  sampleRate: number;
  durationSec: number;
}

export interface MatchToneResult {
  audio: Float32Array;
  before: ToneMetrics;
  after: ToneMetrics;
}

// ─── Deterministic PRNG (for the room impulse; seeded, device-independent) ───

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Biquad filters (RBJ audio-EQ cookbook, Direct Form I) ───

interface BiquadCoefs { b0: number; b1: number; b2: number; a1: number; a2: number; }

function highPassCoefs(fc: number, sr: number, q = 0.707): BiquadCoefs {
  const w0 = (2 * Math.PI * fc) / sr;
  const cos = Math.cos(w0), sin = Math.sin(w0);
  const alpha = sin / (2 * q);
  const a0 = 1 + alpha;
  return {
    b0: ((1 + cos) / 2) / a0,
    b1: (-(1 + cos)) / a0,
    b2: ((1 + cos) / 2) / a0,
    a1: (-2 * cos) / a0,
    a2: (1 - alpha) / a0,
  };
}

function peakingCoefs(fc: number, sr: number, q: number, gainDb: number): BiquadCoefs {
  const A = Math.pow(10, gainDb / 40);
  const w0 = (2 * Math.PI * fc) / sr;
  const cos = Math.cos(w0), sin = Math.sin(w0);
  const alpha = sin / (2 * q);
  const a0 = 1 + alpha / A;
  return {
    b0: (1 + alpha * A) / a0,
    b1: (-2 * cos) / a0,
    b2: (1 - alpha * A) / a0,
    a1: (-2 * cos) / a0,
    a2: (1 - alpha / A) / a0,
  };
}

function highShelfCoefs(fc: number, sr: number, gainDb: number, s = 0.9): BiquadCoefs {
  const A = Math.pow(10, gainDb / 40);
  const w0 = (2 * Math.PI * fc) / sr;
  const cos = Math.cos(w0), sin = Math.sin(w0);
  const alpha = (sin / 2) * Math.sqrt((A + 1 / A) * (1 / s - 1) + 2);
  const twoSqrtAalpha = 2 * Math.sqrt(A) * alpha;
  const a0 = (A + 1) - (A - 1) * cos + twoSqrtAalpha;
  return {
    b0: (A * ((A + 1) + (A - 1) * cos + twoSqrtAalpha)) / a0,
    b1: (-2 * A * ((A - 1) + (A + 1) * cos)) / a0,
    b2: (A * ((A + 1) + (A - 1) * cos - twoSqrtAalpha)) / a0,
    a1: (2 * ((A - 1) - (A + 1) * cos)) / a0,
    a2: ((A + 1) - (A - 1) * cos - twoSqrtAalpha) / a0,
  };
}

function applyBiquad(x: Float32Array, c: BiquadCoefs): Float32Array {
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let n = 0; n < x.length; n++) {
    const xn = x[n];
    const yn = c.b0 * xn + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
    x2 = x1; x1 = xn; y2 = y1; y1 = yn;
    y[n] = yn;
  }
  return y;
}

// ─── FFT (iterative radix-2, in-place) ───

function fft(re: Float32Array, im: Float32Array, inverse: boolean): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (inverse ? 2 : -2) * Math.PI / len;
    const wRe = Math.cos(ang), wIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curRe = 1, curIm = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = i + k + len / 2;
        const tRe = re[b] * curRe - im[b] * curIm;
        const tIm = re[b] * curIm + im[b] * curRe;
        re[b] = re[a] - tRe; im[b] = im[a] - tIm;
        re[a] += tRe; im[a] += tIm;
        const nRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nRe;
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}

function hann(n: number): Float32Array {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
  return w;
}

/**
 * Spectral-subtraction noise suppression. Estimates a magnitude noise profile
 * from the quietest frames (or a supplied noise segment) and softly gates each
 * STFT bin toward it. Overlap-add (75%) with a Hann window. Real DSP.
 */
export function spectralDenoise(x: Float32Array, strength: number, noiseSeg?: Float32Array): Float32Array {
  if (strength <= 0) return x.slice();
  const N = 1024, hop = N / 4;
  const win = hann(N);
  const nFrames = Math.max(1, Math.ceil((x.length - N) / hop) + 1);

  // 1. Noise magnitude profile.
  const noiseMag = new Float32Array(N);
  const source = noiseSeg && noiseSeg.length >= N ? noiseSeg : x;
  // Gather per-frame energy to find the quietest frames.
  const frameEnergies: Array<{ i: number; e: number }> = [];
  const sFrames = Math.max(1, Math.floor((source.length - N) / hop) + 1);
  for (let f = 0; f < sFrames; f++) {
    let e = 0;
    const off = f * hop;
    for (let i = 0; i < N; i++) { const s = source[off + i] || 0; e += s * s; }
    frameEnergies.push({ i: off, e });
  }
  frameEnergies.sort((a, b) => a.e - b.e);
  const quiet = frameEnergies.slice(0, Math.max(1, Math.floor(frameEnergies.length * 0.1)));
  {
    const re = new Float32Array(N), im = new Float32Array(N);
    for (const q of quiet) {
      for (let i = 0; i < N; i++) { re[i] = (source[q.i + i] || 0) * win[i]; im[i] = 0; }
      fft(re, im, false);
      for (let i = 0; i < N; i++) noiseMag[i] += Math.hypot(re[i], im[i]);
    }
    for (let i = 0; i < N; i++) noiseMag[i] /= quiet.length;
  }

  // 2. Per-frame spectral subtraction + overlap-add.
  const out = new Float32Array(x.length);
  const norm = new Float32Array(x.length);
  const re = new Float32Array(N), im = new Float32Array(N);
  const oversub = 1 + strength * 1.5; // over-subtraction factor
  const floor = 0.05 * (1 - strength);  // spectral floor (residual)
  for (let f = 0; f < nFrames; f++) {
    const off = f * hop;
    for (let i = 0; i < N; i++) { re[i] = (x[off + i] || 0) * win[i]; im[i] = 0; }
    fft(re, im, false);
    for (let i = 0; i < N; i++) {
      const mag = Math.hypot(re[i], im[i]);
      if (mag < 1e-9) continue;
      const clean = Math.max(floor * mag, mag - oversub * noiseMag[i]);
      const g = clean / mag;
      re[i] *= g; im[i] *= g;
    }
    fft(re, im, true);
    for (let i = 0; i < N; i++) {
      const idx = off + i;
      if (idx < out.length) { out[idx] += re[i] * win[i]; norm[idx] += win[i] * win[i]; }
    }
  }
  for (let i = 0; i < out.length; i++) out[i] = norm[i] > 1e-6 ? out[i] / norm[i] : x[i];
  return out;
}

// ─── Loudness (BS.1770 K-weighting, gated integrated LUFS) ───

export function measureLufs(x: Float32Array, sr: number): number {
  // K-weighting: stage-1 high-shelf (~+4 dB) + stage-2 high-pass (~38 Hz).
  const pre = applyBiquad(applyBiquad(x, highShelfCoefs(1500, sr, 4)), highPassCoefs(38, sr, 0.5));
  const blockLen = Math.floor(0.4 * sr), step = Math.floor(0.1 * sr);
  const blocks: number[] = [];
  for (let off = 0; off + blockLen <= pre.length; off += step) {
    let sum = 0;
    for (let i = 0; i < blockLen; i++) { const s = pre[off + i]; sum += s * s; }
    blocks.push(sum / blockLen);
  }
  if (blocks.length === 0) return -70;
  const loud = (ms: number) => -0.691 + 10 * Math.log10(ms + 1e-12);
  // Absolute gate at -70 LUFS.
  let gated = blocks.filter((ms) => loud(ms) > -70);
  if (gated.length === 0) return -70;
  const meanAbs = gated.reduce((a, b) => a + b, 0) / gated.length;
  // Relative gate at -10 LU below the ungated mean.
  const relThresh = loud(meanAbs) - 10;
  gated = gated.filter((ms) => loud(ms) > relThresh);
  if (gated.length === 0) return -70;
  const mean = gated.reduce((a, b) => a + b, 0) / gated.length;
  return loud(mean);
}

function peakDbfs(x: Float32Array): number {
  let peak = 0;
  for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > peak) peak = a; }
  return 20 * Math.log10(peak + 1e-12);
}

/** Estimate the noise floor as the RMS of the quietest 10% of 20 ms frames. */
function noiseFloorDbfs(x: Float32Array, sr: number): number {
  const fl = Math.max(1, Math.floor(0.02 * sr));
  const rms: number[] = [];
  for (let off = 0; off + fl <= x.length; off += fl) {
    let s = 0;
    for (let i = 0; i < fl; i++) { const v = x[off + i]; s += v * v; }
    rms.push(Math.sqrt(s / fl));
  }
  if (rms.length === 0) return -120;
  rms.sort((a, b) => a - b);
  const q = rms.slice(0, Math.max(1, Math.floor(rms.length * 0.1)));
  const avg = q.reduce((a, b) => a + b, 0) / q.length;
  return 20 * Math.log10(avg + 1e-12);
}

// ─── Compressor (feed-forward, log-domain envelope) ───

function compress(x: Float32Array, sr: number, thresholdDb = -20, ratio = 3, attackMs = 5, releaseMs = 120, makeupDb = 0): Float32Array {
  const y = new Float32Array(x.length);
  const aA = Math.exp(-1 / (0.001 * attackMs * sr));
  const aR = Math.exp(-1 / (0.001 * releaseMs * sr));
  const makeup = Math.pow(10, makeupDb / 20);
  let env = 0;
  for (let n = 0; n < x.length; n++) {
    const lvl = Math.abs(x[n]);
    env = lvl > env ? aA * env + (1 - aA) * lvl : aR * env + (1 - aR) * lvl;
    const envDb = 20 * Math.log10(env + 1e-12);
    let gainDb = 0;
    if (envDb > thresholdDb) gainDb = (thresholdDb - envDb) * (1 - 1 / ratio);
    y[n] = x[n] * Math.pow(10, gainDb / 20) * makeup;
  }
  return y;
}

// ─── Shared room impulse (deterministic, seeded) + convolution ───

const ROOM_PARAMS: Record<RoomPreset, { ms: number; decay: number; mix: number }> = {
  dry:   { ms: 0,   decay: 0,    mix: 0 },
  booth: { ms: 45,  decay: 22,   mix: 0.10 },
  room:  { ms: 120, decay: 9,    mix: 0.16 },
  hall:  { ms: 320, decay: 3.5,  mix: 0.22 },
};

function roomImpulse(preset: RoomPreset, sr: number): Float32Array {
  const p = ROOM_PARAMS[preset];
  const len = Math.floor((p.ms / 1000) * sr);
  if (len <= 0) return new Float32Array(0);
  const ir = new Float32Array(len);
  const rnd = mulberry32(0x00c3ff); // brand-seed → identical IR everywhere
  for (let i = 0; i < len; i++) {
    const env = Math.exp((-p.decay * i) / len);
    ir[i] = (rnd() * 2 - 1) * env;
  }
  return ir;
}

function convolveMix(x: Float32Array, ir: Float32Array, mix: number): Float32Array {
  if (ir.length === 0 || mix <= 0) return x.slice();
  const wet = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) {
    const xi = x[i];
    if (xi === 0) continue;
    const end = Math.min(ir.length, x.length - i);
    for (let k = 0; k < end; k++) wet[i + k] += xi * ir[k];
  }
  // Normalise wet energy then blend.
  let wpeak = 0;
  for (let i = 0; i < wet.length; i++) { const a = Math.abs(wet[i]); if (a > wpeak) wpeak = a; }
  const g = wpeak > 1e-6 ? 0.6 / wpeak : 0;
  const out = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) out[i] = x[i] * (1 - mix) + wet[i] * g * mix;
  return out;
}

/**
 * Envelope-follower peak limiter: keeps true peak below the ceiling by pulling
 * gain down ONLY around transients (fast attack, slower release), so integrated
 * loudness is essentially preserved — unlike a global downscale, which would
 * crush the whole clip whenever a single sample clips.
 */
function limit(x: Float32Array, sr: number, ceilingDb = -1): Float32Array {
  const ceil = Math.pow(10, ceilingDb / 20);
  const aA = Math.exp(-1 / (0.001 * 1 * sr));   // 1 ms attack
  const aR = Math.exp(-1 / (0.001 * 60 * sr));  // 60 ms release
  const y = new Float32Array(x.length);
  let gain = 1;
  for (let n = 0; n < x.length; n++) {
    const lvl = Math.abs(x[n]);
    const target = lvl > ceil ? ceil / lvl : 1; // gain needed to stay under ceiling
    // Attack fast toward a smaller gain; release slowly back up.
    gain = target < gain ? aA * gain + (1 - aA) * target : aR * gain + (1 - aR) * target;
    // Smooth limiting handles sustained level; a final hard clamp guarantees no
    // sample exceeds the ceiling (catches the sub-ms attack overshoot only).
    const v = x[n] * gain;
    y[n] = v > ceil ? ceil : v < -ceil ? -ceil : v;
  }
  return y;
}

function metricsOf(x: Float32Array, sr: number): ToneMetrics {
  return {
    integratedLufs: measureLufs(x, sr),
    peakDbfs: peakDbfs(x),
    noiseFloorDbfs: noiseFloorDbfs(x, sr),
    sampleRate: sr,
    durationSec: x.length / sr,
  };
}

/**
 * Run the full Match-Tone chain. Deterministic: same input+options ⇒ same output.
 */
export function matchTone(input: Float32Array, opts: MatchToneOptions): MatchToneResult {
  const sr = opts.sampleRate;
  const targetLufs = opts.targetLufs ?? -16;
  const room = opts.room ?? 'booth';
  const hp = opts.highPassHz ?? 80;
  const denoise = opts.denoise ?? 0.75;

  const before = metricsOf(input, sr);

  // 1. High-pass rumble/plosive cut.
  let s = applyBiquad(input, highPassCoefs(hp, sr, 0.707));
  // 2. Noise suppression.
  s = spectralDenoise(s, denoise);
  // 3. Shared EQ preset: gentle low-mud cut, presence lift, air.
  s = applyBiquad(s, peakingCoefs(300, sr, 1.0, -2.5));
  s = applyBiquad(s, peakingCoefs(3000, sr, 0.9, 2.5));
  s = applyBiquad(s, highShelfCoefs(9000, sr, 2));
  // 4. Compression to even out level.
  s = compress(s, sr, -22, 3, 6, 140, 0);
  // 5. Shared room so every line matches the scene.
  s = convolveMix(s, roomImpulse(room, sr), ROOM_PARAMS[room].mix);
  // 6. Loudness normalise to the target (EBU R128).
  const measured = measureLufs(s, sr);
  const gainDb = targetLufs - measured;
  const g = Math.pow(10, gainDb / 20);
  for (let i = 0; i < s.length; i++) s[i] *= g;
  // 7. Peak-safe limiter (preserves loudness; catches only transients).
  s = limit(s, sr, -1);

  return { audio: s, before, after: metricsOf(s, sr) };
}

/**
 * Equal-power crossfade splice: replace samples [atSample, atSample+replaceLen)
 * of `base` with `insert`, blending `fadeMs` at each seam so the splice is
 * inaudible. Returns a new buffer. Used to drop a re-voiced line into a mix.
 */
export function crossfadeSplice(
  base: Float32Array,
  insert: Float32Array,
  atSample: number,
  sr: number,
  fadeMs = 12,
): Float32Array {
  const fade = Math.max(1, Math.floor((fadeMs / 1000) * sr));
  const out = new Float32Array(Math.max(base.length, atSample + insert.length));
  out.set(base.subarray(0, Math.min(base.length, out.length)));
  for (let i = 0; i < insert.length; i++) {
    const idx = atSample + i;
    if (idx >= out.length) break;
    let w = 1; // insert weight
    if (i < fade) w = Math.sin((Math.PI / 2) * (i / fade));
    else if (i > insert.length - fade) w = Math.sin((Math.PI / 2) * ((insert.length - i) / fade));
    const baseW = Math.sqrt(Math.max(0, 1 - w * w)); // equal-power complement
    out[idx] = insert[i] * w + (out[idx] || 0) * baseW;
  }
  return out;
}
