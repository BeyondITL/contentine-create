/**
 * Contentine Create — Viseme model (WS-5)
 *
 * Shared viseme vocabulary + phoneme/grapheme → viseme mapping used by both the
 * TTS-line path (Kokoro) and the VO-replace path (recorded/uploaded audio).
 *
 * Viseme set: the Oculus LipSync 15-viseme standard. It is the de-facto set for
 * real-time browser avatars and maps cleanly from eSpeak IPA (what Kokoro emits)
 * and from a compact English grapheme heuristic (fallback for ASR word text).
 *
 * PROVENANCE HONESTY (Law L1): a `VisemeCue`'s TIMING is only as real as its
 * `source`. `forced-alignment` cues have ASR-measured word onsets; `estimated`
 * cues are a linguistic-prior approximation for instant UI preview and must never
 * be presented as ground-truth timing. Kokoro itself exposes no per-phoneme
 * durations (kokoro-js destructures only `{ waveform }` from the model, and the
 * `onnx-community/Kokoro-82M-v1.0-ONNX` graph emits no `durations`/`pred_dur`
 * output), so real per-line timing is obtained by forced alignment, not from the
 * synthesiser. See forced-aligner.ts.
 */

/** The 15 Oculus visemes. `sil` = closed/neutral mouth (silence). */
export const VISEMES = [
  'sil', // silence / neutral closed
  'PP',  // bilabial: p b m
  'FF',  // labiodental: f v
  'TH',  // dental: θ ð
  'DD',  // alveolar plosive: t d
  'kk',  // velar: k g
  'CH',  // postalveolar affricate: tʃ dʒ ʃ ʒ
  'SS',  // alveolar fricative: s z
  'nn',  // nasal/lateral: n l
  'RR',  // rhotic: r ɹ ɚ
  'aa',  // open vowel: ɑ a
  'E',   // front mid vowel: ɛ e
  'I',   // close front vowel: i ɪ
  'O',   // rounded back vowel: ɔ o
  'U',   // close rounded vowel: u ʊ
] as const;

export type Viseme = (typeof VISEMES)[number];

/**
 * How a cue's timing was derived — load-bearing for honesty (Law L1).
 *  - `forced-alignment` — ASR-measured word onsets (recorded/uploaded VO).
 *  - `tts-aligned`      — the synthesiser's own per-phoneme durations (Kokoro
 *                         timestamped model). Real model timing, not a guess.
 *  - `estimated`        — linguistic-prior approximation; preview-only.
 */
export type VisemeSource = 'forced-alignment' | 'tts-aligned' | 'estimated';

/** A single mouth-shape cue on the timeline. Times are seconds from clip start. */
export interface VisemeCue {
  viseme: Viseme;
  /** Start time in seconds. */
  start: number;
  /** End time in seconds. */
  end: number;
  /** How the timing was derived. `estimated` timing is preview-only. */
  source: VisemeSource;
}

/**
 * Relative "openness" weight per viseme — a duration prior used to distribute a
 * word interval across its constituent visemes. Vowels dwell longer than stops.
 * These are linguistic priors (not measured), used only for sub-word placement.
 */
const DURATION_WEIGHT: Record<Viseme, number> = {
  sil: 0.5,
  PP: 0.6, FF: 0.8, TH: 0.8, DD: 0.6, kk: 0.6,
  CH: 0.9, SS: 1.0, nn: 0.8, RR: 0.9,
  aa: 1.6, E: 1.4, I: 1.3, O: 1.5, U: 1.4,
};

/**
 * Map one eSpeak-style IPA symbol to a viseme.
 * Stress marks (ˈ ˌ), length (ː), and ties should be stripped before calling.
 */
export function ipaToViseme(sym: string): Viseme {
  switch (sym) {
    case 'p': case 'b': case 'm': return 'PP';
    case 'f': case 'v': return 'FF';
    case 'θ': case 'ð': return 'TH';
    case 't': case 'd': return 'DD';
    case 'k': case 'g': case 'ŋ': case 'x': return 'kk';
    case 'tʃ': case 'dʒ': case 'ʃ': case 'ʒ': case 'j': return 'CH';
    case 's': case 'z': return 'SS';
    case 'n': case 'l': return 'nn';
    case 'r': case 'ɹ': case 'ɚ': case 'ɝ': return 'RR';
    case 'ɑ': case 'a': case 'ʌ': case 'æ': case 'ɐ': return 'aa';
    case 'ɛ': case 'e': case 'ə': case 'eɪ': case 'ɜ': return 'E';
    case 'i': case 'ɪ': case 'iː': return 'I';
    case 'ɔ': case 'o': case 'oʊ': case 'əʊ': case 'ɒ': case 'aʊ': case 'ɔɪ': return 'O';
    case 'u': case 'ʊ': case 'uː': case 'w': return 'U';
    case 'h': return 'aa';
    default: return 'sil';
  }
}

/** Strip stress/length/diacritic marks from an IPA string into base symbols. */
export function normalizeIpa(ipa: string): string[] {
  const cleaned = ipa.replace(/[ˈˌ.̩̃]/g, '').trim();
  // Greedy 2-char digraph pass then singles.
  const digraphs = ['tʃ', 'dʒ', 'eɪ', 'oʊ', 'əʊ', 'aʊ', 'ɔɪ', 'iː', 'uː'];
  const out: string[] = [];
  let i = 0;
  while (i < cleaned.length) {
    const two = cleaned.slice(i, i + 2);
    if (digraphs.includes(two)) { out.push(two); i += 2; continue; }
    const ch = cleaned[i];
    if (ch !== ' ' && ch !== 'ː') out.push(ch);
    i += 1;
  }
  return out;
}

/**
 * Compact English grapheme → viseme heuristic. Used only when an IPA phoneme
 * string is unavailable (e.g. distributing ASR word text). Deterministic.
 */
export function graphemesToVisemes(word: string): Viseme[] {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  const out: Viseme[] = [];
  for (let i = 0; i < w.length; i++) {
    const c = w[i];
    const nxt = w[i + 1] ?? '';
    if (c === 't' && nxt === 'h') { out.push('TH'); i++; continue; }
    if (c === 'c' && nxt === 'h') { out.push('CH'); i++; continue; }
    if (c === 's' && nxt === 'h') { out.push('CH'); i++; continue; }
    switch (c) {
      case 'p': case 'b': case 'm': out.push('PP'); break;
      case 'f': case 'v': out.push('FF'); break;
      case 't': case 'd': out.push('DD'); break;
      case 'k': case 'g': case 'c': case 'q': out.push('kk'); break;
      case 'j': out.push('CH'); break;
      case 's': case 'z': case 'x': out.push('SS'); break;
      case 'n': case 'l': out.push('nn'); break;
      case 'r': out.push('RR'); break;
      case 'a': out.push('aa'); break;
      case 'e': out.push('E'); break;
      case 'i': case 'y': out.push('I'); break;
      case 'o': out.push('O'); break;
      case 'u': case 'w': out.push('U'); break;
      case 'h': break; // usually silent-ish for mouth shape
      default: break;
    }
  }
  return out.length ? out : ['aa'];
}

/**
 * Distribute a time interval [start, end] across an ordered viseme list,
 * weighted by the duration prior. Returns cues tagged with `source`. Consecutive
 * identical visemes are merged.
 */
export function distributeVisemes(
  visemes: Viseme[],
  start: number,
  end: number,
  source: VisemeSource,
): VisemeCue[] {
  if (visemes.length === 0 || end <= start) return [];
  const totalWeight = visemes.reduce((s, v) => s + DURATION_WEIGHT[v], 0);
  const span = end - start;
  const cues: VisemeCue[] = [];
  let t = start;
  for (const v of visemes) {
    const dur = (DURATION_WEIGHT[v] / totalWeight) * span;
    const last = cues[cues.length - 1];
    if (last && last.viseme === v) {
      last.end = t + dur;
    } else {
      cues.push({ viseme: v, start: t, end: t + dur, source });
    }
    t += dur;
  }
  if (cues.length) cues[cues.length - 1].end = end; // clamp rounding drift
  return cues;
}
