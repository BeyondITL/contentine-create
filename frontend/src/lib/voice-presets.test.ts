/**
 * SA-32 regression gate for VOICE_PRESETS.
 *
 * Fabricated OpenAI-style voice ids (am_leo, af_shimmer, …) have now shipped in
 * this repo through THREE audits: caught first in the pre-rebuild BUG ledger
 * ("Voice am_leo not found"), carried verbatim into editor-store, and copied
 * again into the shared voice-presets module during SA-28. Prose caveats did not
 * stop them, so this test does.
 *
 * The legal voice set is DERIVED, never hardcoded here — hardcoding a second
 * list is exactly how the first one drifted. Derivation:
 *   1. `MODEL_ARTIFACTS['kokoro-82m'].artifacts` — the sha256-pinned BOM of the
 *      bytes we actually ship, listing one `voices/<id>.bin` per real voice (54).
 *   2. Narrowed to the prefixes the runtime can speak: `voiceLang()`
 *      (kokoro-phonemize) maps only 'a' → en-us and 'b' → en-gb, and kokoro-js's
 *      internal VOICES table registers exactly those 28. The other 26 bins ship
 *      but `kokoro.generate()` rejects them, so a preset must never use one.
 * Intersection = the 28 voices a preset card is allowed to reference.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { VOICE_PRESETS } from './voice-presets';
import { MODEL_ARTIFACTS } from './model-artifacts';

/** Every `voices/<id>.bin` in the shipped, sha256-pinned Kokoro artifact set. */
const BOM_VOICE_IDS = new Set(
  MODEL_ARTIFACTS['kokoro-82m'].artifacts
    .map((a) => /^voices\/([a-z]{2}_[a-z]+)\.bin$/.exec(a.path)?.[1])
    .filter((id): id is string => Boolean(id)),
);

/** Of those, the ones kokoro-js can actually synthesize (en-us `a*`, en-gb `b*`). */
const SPEAKABLE_VOICE_IDS = new Set(
  [...BOM_VOICE_IDS].filter((id) => /^[ab][fm]_/.test(id)),
);

const SEED_SQL = join(__dirname, '../../../backend/migrations/002_seed_data.sql');

/** Parse the 20 preset rows out of the backend seed so both trees must agree. */
function seedPresetRows(): { name: string; voiceId: string }[] {
  const sql = readFileSync(SEED_SQL, 'utf8');
  const block = /INSERT INTO voice_profiles[^;]+;/.exec(sql)?.[0] ?? '';
  return [...block.matchAll(/\('([^']+)',\s*'([a-z]{2}_[a-z]+)',\s*'preset'/g)].map((m) => ({
    name: m[1],
    voiceId: m[2],
  }));
}

describe('VOICE_PRESETS ↔ Kokoro-82M v1.0 artifacts', () => {
  it('derives a non-empty legal set from the shipped BOM', () => {
    // Guards the derivation itself: if model-artifacts.ts is ever restructured
    // these sets would silently empty and every assertion below would pass.
    expect(BOM_VOICE_IDS.size).toBe(54);
    expect(SPEAKABLE_VOICE_IDS.size).toBe(28);
  });

  it('backs every preset with a real, shipped voice .bin', () => {
    const fabricated = VOICE_PRESETS.filter((v) => !BOM_VOICE_IDS.has(v.kokoro_voice_id!));
    expect(fabricated.map((v) => `${v.name}=${v.kokoro_voice_id}`)).toEqual([]);
  });

  it('uses only voices kokoro.generate() accepts (en-us / en-gb)', () => {
    const unspeakable = VOICE_PRESETS.filter((v) => !SPEAKABLE_VOICE_IDS.has(v.kokoro_voice_id!));
    expect(unspeakable.map((v) => `${v.name}=${v.kokoro_voice_id}`)).toEqual([]);
  });

  it('advertises the gender encoded in the voice id', () => {
    // Catches the af_alloy/am_alloy confusion class: a card claiming 'male' while
    // backed by an `*f_` voice mislabels the card AND breaks gender-matched cloning.
    const mismatched = VOICE_PRESETS.filter(
      (v) => v.gender !== (v.kokoro_voice_id![1] === 'f' ? 'female' : 'male'),
    );
    expect(mismatched.map((v) => `${v.name}=${v.kokoro_voice_id}:${v.gender}`)).toEqual([]);
  });

  it('has unique, FK-stable ids 1..20', () => {
    expect(VOICE_PRESETS.map((v) => v.id)).toEqual(
      Array.from({ length: 20 }, (_, i) => i + 1),
    );
  });

  it('stays in lockstep with the backend seed (order is the AUTO_INCREMENT id)', () => {
    expect(seedPresetRows()).toEqual(
      VOICE_PRESETS.map((v) => ({ name: v.name, voiceId: v.kokoro_voice_id! })),
    );
  });
});
