/**
 * Contentine Create — Cartoon Engine: Viseme utilities
 *
 * Viseme ids follow the Oculus viseme set — the same convention the
 * TalkingHead 3D-avatar path already consumes ({ time, value } stamps),
 * so WS-5's viseme-stamped TTS output plugs straight in.
 *
 * `stampVisemesFromText` is the deterministic fallback used until the
 * tts-manager emits real phoneme-aligned visemes (WS-5): it derives a
 * viseme sequence from the dialogue text and distributes it across the
 * measured audio duration, proportional to word length. Same text + same
 * duration ⇒ same stamps (Law L6).
 */

export type VisemeId =
  | 'sil' | 'PP' | 'FF' | 'TH' | 'DD' | 'kk' | 'CH' | 'SS'
  | 'nn' | 'RR' | 'aa' | 'E' | 'I' | 'O' | 'U';

export interface VisemeStamp {
  /** Seconds from the start of the take's audio. */
  time: number;
  value: VisemeId;
}

/** English grapheme → viseme mapping (coarse, deterministic). */
const GRAPHEME_VISEMES: Array<[RegExp, VisemeId]> = [
  [/^(ch|j|sh|zh)/, 'CH'],
  [/^(th)/, 'TH'],
  [/^(oo|ou|u)/, 'U'],
  [/^(oa|oh|o)/, 'O'],
  [/^(ee|ea|i|y)/, 'I'],
  [/^(ai|ay|a)/, 'aa'],
  [/^(e)/, 'E'],
  [/^(p|b|m)/, 'PP'],
  [/^(f|v)/, 'FF'],
  [/^(t|d)/, 'DD'],
  [/^(k|c|g|q|x)/, 'kk'],
  [/^(s|z)/, 'SS'],
  [/^(n|l)/, 'nn'],
  [/^(r|w)/, 'RR'],
  [/^(h)/, 'kk'],
];

/** Convert one word to a viseme sequence. Always yields ≥1 viseme. */
function wordToVisemes(word: string): VisemeId[] {
  const out: VisemeId[] = [];
  let rest = word.toLowerCase().replace(/[^a-z']/g, '');
  while (rest.length > 0) {
    let matched = false;
    for (const [re, viseme] of GRAPHEME_VISEMES) {
      const m = rest.match(re);
      if (m) {
        out.push(viseme);
        rest = rest.slice(m[0].length);
        matched = true;
        break;
      }
    }
    if (!matched) rest = rest.slice(1); // apostrophes / unmapped letters
  }
  return out.length > 0 ? out : ['aa'];
}

/**
 * Deterministically stamp visemes for a dialogue take.
 * Speech is assumed to occupy the audio minus small lead-in/out silences,
 * with each word given time proportional to its viseme count.
 */
export function stampVisemesFromText(text: string, durationSec: number): VisemeStamp[] {
  const words = text.split(/\s+/).filter((w) => /[a-zA-Z]/.test(w));
  if (words.length === 0 || durationSec <= 0) return [{ time: 0, value: 'sil' }];

  const leadIn = Math.min(0.08, durationSec * 0.05);
  const leadOut = Math.min(0.12, durationSec * 0.06);
  const speechSpan = Math.max(0.01, durationSec - leadIn - leadOut);

  const wordVisemes = words.map(wordToVisemes);
  const interWordGap = 0.5; // gap weight between words, in viseme units
  const totalUnits = wordVisemes.reduce((sum, v) => sum + v.length, 0) + interWordGap * (words.length - 1);
  const unitSec = speechSpan / totalUnits;

  const stamps: VisemeStamp[] = [{ time: 0, value: 'sil' }];
  let t = leadIn;
  for (let w = 0; w < wordVisemes.length; w++) {
    for (const v of wordVisemes[w]) {
      stamps.push({ time: round6(t), value: v });
      t += unitSec;
    }
    if (w < wordVisemes.length - 1) {
      stamps.push({ time: round6(t), value: 'sil' });
      t += interWordGap * unitSec;
    }
  }
  stamps.push({ time: round6(Math.min(t, durationSec - leadOut)), value: 'sil' });
  return stamps;
}

/** Round to microsecond-ish precision so float noise can't change hashes. */
function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}
