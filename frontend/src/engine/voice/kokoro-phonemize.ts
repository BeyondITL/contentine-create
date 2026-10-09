/**
 * Contentine Create — Kokoro grapheme→phoneme front-end (WS-5)
 *
 * WHY THIS EXISTS
 * ---------------
 * The timestamped Kokoro model (`onnx-community/Kokoro-82M-v1.0-ONNX-timestamped`)
 * emits a `durations` output that gives us REAL per-phoneme timing — but to read
 * those durations we must run the ONNX session ourselves (kokoro-js@1.2.1
 * destructures only `{ waveform }` and throws the `durations` output away; see
 * node_modules/kokoro-js/dist/kokoro.js `generate_from_ids`). Running the session
 * ourselves means producing the exact same `input_ids` kokoro-js would, which
 * means reproducing its text→phoneme front-end.
 *
 * kokoro-js keeps that front-end (`m()`) private (not exported). This module is a
 * FAITHFUL, readable port of kokoro-js@1.2.1's `m()` normalizer + post-map,
 * calling the SAME `phonemize` from the `phonemizer` package kokoro-js uses. So a
 * given line phonemizes identically whether it is spoken through kokoro-js (base
 * Voice Studio path) or through our timestamped session (cartoon lip-sync path) —
 * same phonemes ⇒ same audio ⇒ honest, matching output (Law L1, Law L6).
 *
 * SOURCE: kokoro-js v1.2.1, Apache-2.0 (Xenova / hexgrad). Ported here with
 * attribution per the Apache-2.0 grant. `normalizeText` is split out and pure
 * (no espeak) so the port is locked by unit tests without loading a model.
 */

// phonemizer is a transitive dep of kokoro-js (espeak-ng WASM); it is already in
// the tts-worker bundle, so importing it here adds no new runtime dependency.
import { phonemize } from 'phonemizer';

/** Kokoro voice id → espeak language ('a…' voices = en-us, else en-gb). */
export function voiceLang(voiceId: string): 'a' | 'b' {
  return voiceId.charAt(0) === 'a' ? 'a' : 'b';
}

// ── number / time / currency expanders (verbatim behaviour from kokoro-js) ──

/** Expand a numeric/time token (years, clock times, "hundred"). */
function expandNumberToken(e: string): string {
  if (e.includes('.')) return e;
  if (e.includes(':')) {
    const [a, t] = e.split(':').map(Number);
    return t === 0 ? `${a} o'clock` : t < 10 ? `${a} oh ${t}` : `${a} ${t}`;
  }
  const a = parseInt(e.slice(0, 4), 10);
  if (a < 1100 || a % 1000 < 10) return e;
  const t = e.slice(0, 2);
  const r = parseInt(e.slice(2, 4), 10);
  const n = e.endsWith('s') ? 's' : '';
  if (a % 1000 >= 100 && a % 1000 <= 999) {
    if (r === 0) return `${t} hundred${n}`;
    if (r < 10) return `${t} oh ${r}${n}`;
  }
  return `${t} ${r}${n}`;
}

/** Expand a currency token ($/£). */
function expandCurrency(e: string): string {
  const a = e[0] === '$' ? 'dollar' : 'pound';
  if (isNaN(Number(e.slice(1)))) return `${e.slice(1)} ${a}s`;
  if (!e.includes('.')) {
    const t = e.slice(1) === '1' ? '' : 's';
    return `${e.slice(1)} ${a}${t}`;
  }
  const [t, r] = e.slice(1).split('.');
  const n = parseInt(r.padEnd(2, '0'), 10);
  const unit = e[0] === '$' ? (n === 1 ? 'cent' : 'cents') : n === 1 ? 'penny' : 'pence';
  return `${t} ${a}${t === '1' ? '' : 's'} and ${n} ${unit}`;
}

/** Expand a decimal number ("3.14" → "3 point 1 4"). */
function expandDecimal(e: string): string {
  const [a, t] = e.split('.');
  return `${a} point ${t.split('').join(' ')}`;
}

// Punctuation the phonemizer must not see (kokoro splits on runs of these).
const PUNCT = ';:,.!?¡¿—…"«»“”(){}[]';
const PUNCT_RE = new RegExp(
  `(\\s*[${PUNCT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}]+\\s*)+`,
  'g',
);

interface Segment { match: boolean; text: string; }

/** Split text into punctuation runs (`match:true`, passed through) and speech
 *  spans (`match:false`, sent to espeak) — exactly kokoro-js's segmenter. */
function segment(text: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const m of text.matchAll(PUNCT_RE)) {
    const s = m[0];
    if (last < m.index!) out.push({ match: false, text: text.slice(last, m.index!) });
    if (s.length > 0) out.push({ match: true, text: s });
    last = m.index! + s.length;
  }
  if (last < text.length) out.push({ match: false, text: text.slice(last) });
  return out;
}

/**
 * Text normalization (abbreviations, numbers, currency, quote handling).
 * Pure and deterministic — no espeak — so it is unit-testable in isolation.
 * Verbatim behaviour of kokoro-js@1.2.1's normalizer.
 */
export function normalizeText(e: string): string {
  return e
    .replace(/[‘’]/g, "'")
    .replace(/«/g, '“')
    .replace(/»/g, '”')
    .replace(/[“”]/g, '"')
    .replace(/\(/g, '«')
    .replace(/\)/g, '»')
    .replace(/、/g, ', ')
    .replace(/。/g, '. ')
    .replace(/！/g, '! ')
    .replace(/，/g, ', ')
    .replace(/：/g, ': ')
    .replace(/；/g, '; ')
    .replace(/？/g, '? ')
    .replace(/[^\S \n]/g, ' ')
    .replace(/  +/, ' ')
    .replace(/(?<=\n) +(?=\n)/g, '')
    .replace(/\bD[Rr]\.(?= [A-Z])/g, 'Doctor')
    .replace(/\b(?:Mr\.|MR\.(?= [A-Z]))/g, 'Mister')
    .replace(/\b(?:Ms\.|MS\.(?= [A-Z]))/g, 'Miss')
    .replace(/\b(?:Mrs\.|MRS\.(?= [A-Z]))/g, 'Mrs')
    .replace(/\betc\.(?! [A-Z])/gi, 'etc')
    .replace(/\b(y)eah?\b/gi, "$1e'a")
    .replace(/\d*\.\d+|\b\d{4}s?\b|(?<!:)\b(?:[1-9]|1[0-2]):[0-5]\d\b(?!:)/g, expandNumberToken)
    .replace(/(?<=\d),(?=\d)/g, '')
    .replace(/[$£]\d+(?:\.\d+)?(?: hundred| thousand| (?:[bm]|tr)illion)*\b|[$£]\d+\.\d\d?\b/gi, expandCurrency)
    .replace(/\d*\.\d+/g, expandDecimal)
    .replace(/(?<=\d)-(?=\d)/g, ' to ')
    .replace(/(?<=\d)S/g, ' S')
    .replace(/(?<=[BCDFGHJ-NP-TV-Z])'?s\b/g, "'S")
    .replace(/(?<=X')S\b/g, 's')
    .replace(/(?:[A-Za-z]\.){2,} [a-z]/g, (m) => m.replace(/\./g, '-'))
    .replace(/(?<=[A-Z])\.(?=[A-Z])/gi, '-')
    .trim();
}

/**
 * Phonemize `text` to the IPA string Kokoro's tokenizer consumes. `lang` is the
 * voice's first char ('a' → en-us, else en-gb), matching kokoro-js. Result is
 * fed straight to the Kokoro `AutoTokenizer`. Deterministic (espeak is a fixed
 * rule engine): same text ⇒ same phonemes ⇒ same tokens ⇒ same durations (L6).
 */
export async function phonemizeForKokoro(text: string, lang: 'a' | 'b'): Promise<string> {
  const normalized = normalizeText(text);
  const segs = segment(normalized);
  const espeakLang = lang === 'a' ? 'en-us' : 'en';
  const parts = await Promise.all(
    segs.map(async (s) => (s.match ? s.text : (await phonemize(s.text, espeakLang)).join(' '))),
  );
  let out = parts
    .join('')
    .replace(/kəkˈoːɹoʊ/g, 'kˈoʊkəɹoʊ')
    .replace(/kəkˈɔːɹəʊ/g, 'kˈəʊkəɹəʊ')
    .replace(/ʲ/g, 'j')
    .replace(/r/g, 'ɹ')
    .replace(/x/g, 'k')
    .replace(/ɬ/g, 'l')
    .replace(/(?<=[a-zɹː])(?=hˈʌndɹɪd)/g, ' ')
    .replace(/ z(?=[;:,.!?¡¿—…"«»“” ]|$)/g, 'z');
  if (lang === 'a') out = out.replace(/(?<=nˈaɪn)ti(?!ː)/g, 'di');
  return out.trim();
}
