import type { VoiceProfile } from '@/types';

/**
 * 20 Kokoro TTS voice presets — the client-side fallback used whenever the
 * backend `/voices` endpoint is unavailable or returns no presets. Law L2:
 * core creation must never depend on the PHP backend, and offline-after-download
 * must keep working. Shared by editor-store (video/cartoon/voices flows) AND
 * avatar-store (avatar flow) so every creation surface has the same fallback
 * (SA-28: the avatar store previously lacked it and dead-ended at "No voices
 * available" whenever the backend was down).
 *
 * SA-32 — EVERY `kokoro_voice_id` BELOW IS A REAL Kokoro-82M v1.0 VOICE.
 * Nine ids here were fabricated OpenAI-style names (am_leo, am_alloy, am_fable,
 * af_shimmer, af_luna, af_aria, am_felix, af_sage, am_dash) that do not exist in
 * the model and threw "Voice <id> not found" in every flow. Source of truth, in
 * this order:
 *   1. the shipped artifact BOM — `voices/<id>.bin` entries in `model-artifacts.ts`
 *      (54 bins, sha256-pinned, from onnx-community/Kokoro-82M-v1.0-ONNX);
 *   2. kokoro-js's own VOICES table (28 English voices), which is what
 *      `kokoro.generate({voice})` validates against and what produces the
 *      "Should be one of: …" error.
 * Presets may only use the INTERSECTION — the 28 `af_`/`am_` (en-us) and
 * `bf_`/`bm_` (en-gb) voices. The other 26 bins ship but are unusable: kokoro-js
 * rejects them and `voiceLang()` (kokoro-phonemize) only maps 'a'/'b' prefixes.
 *
 * Card `name` is deliberately the model's OWN voice name so name↔id is 1:1 and
 * an auditor can eyeball a mismatch. Numeric `id`s are FK-stable (they key
 * `videos.voice_id`), so the nine bad slots kept their ids and changed voice.
 * `voice-presets.test.ts` fails the build if any id drifts off the real list.
 * Keep in lockstep with `backend/migrations/002_seed_data.sql`.
 */
export const VOICE_PRESETS: VoiceProfile[] = [
  { id: 1,  user_id: null, name: 'Sky',     kokoro_voice_id: 'af_sky',     source: 'preset', language: 'English',       gender: 'female', tone: 'warm',          speed: 1.0,  pitch: 1, style: 'conversational', is_preset: true },
  { id: 2,  user_id: null, name: 'Bella',   kokoro_voice_id: 'af_bella',   source: 'preset', language: 'English',       gender: 'female', tone: 'friendly',      speed: 1.0,  pitch: 1, style: 'conversational', is_preset: true },
  { id: 3,  user_id: null, name: 'Nicole',  kokoro_voice_id: 'af_nicole',  source: 'preset', language: 'English',       gender: 'female', tone: 'confident',     speed: 1.0,  pitch: 1, style: 'professional',   is_preset: true },
  { id: 4,  user_id: null, name: 'Sarah',   kokoro_voice_id: 'af_sarah',   source: 'preset', language: 'English',       gender: 'female', tone: 'calm',          speed: 0.95, pitch: 1, style: 'narration',      is_preset: true },
  { id: 5,  user_id: null, name: 'Heart',   kokoro_voice_id: 'af_heart',   source: 'preset', language: 'English',       gender: 'female', tone: 'enthusiastic',  speed: 1.05, pitch: 1, style: 'energetic',      is_preset: true },
  { id: 6,  user_id: null, name: 'Nova',    kokoro_voice_id: 'af_nova',    source: 'preset', language: 'English',       gender: 'female', tone: 'modern',        speed: 1.0,  pitch: 1, style: 'casual',         is_preset: true },
  { id: 7,  user_id: null, name: 'River',   kokoro_voice_id: 'af_river',   source: 'preset', language: 'English',       gender: 'female', tone: 'soothing',      speed: 0.90, pitch: 1, style: 'meditation',     is_preset: true },
  { id: 8,  user_id: null, name: 'Adam',    kokoro_voice_id: 'am_adam',    source: 'preset', language: 'English',       gender: 'male',   tone: 'deep',          speed: 1.0,  pitch: 1, style: 'professional',   is_preset: true },
  { id: 9,  user_id: null, name: 'Michael', kokoro_voice_id: 'am_michael', source: 'preset', language: 'English',       gender: 'male',   tone: 'authoritative', speed: 0.95, pitch: 1, style: 'narration',      is_preset: true },
  { id: 10, user_id: null, name: 'Echo',    kokoro_voice_id: 'am_echo',    source: 'preset', language: 'English',       gender: 'male',   tone: 'warm',          speed: 1.0,  pitch: 1, style: 'conversational', is_preset: true },
  { id: 11, user_id: null, name: 'Puck',    kokoro_voice_id: 'am_puck',    source: 'preset', language: 'English',       gender: 'male',   tone: 'energetic',     speed: 1.10, pitch: 1, style: 'social_media',   is_preset: true },
  { id: 12, user_id: null, name: 'Onyx',    kokoro_voice_id: 'am_onyx',    source: 'preset', language: 'English',       gender: 'male',   tone: 'smooth',        speed: 0.95, pitch: 1, style: 'luxury',         is_preset: true },
  { id: 13, user_id: null, name: 'Fenrir',  kokoro_voice_id: 'am_fenrir',  source: 'preset', language: 'English',       gender: 'male',   tone: 'neutral',       speed: 1.0,  pitch: 1, style: 'corporate',      is_preset: true },
  { id: 14, user_id: null, name: 'Fable',   kokoro_voice_id: 'bm_fable',   source: 'preset', language: 'English (UK)',  gender: 'male',   tone: 'storytelling',  speed: 0.90, pitch: 1, style: 'narration',      is_preset: true },
  { id: 15, user_id: null, name: 'Kore',    kokoro_voice_id: 'af_kore',    source: 'preset', language: 'English',       gender: 'female', tone: 'bright',        speed: 1.05, pitch: 1, style: 'tutorial',       is_preset: true },
  { id: 16, user_id: null, name: 'Aoede',   kokoro_voice_id: 'af_aoede',   source: 'preset', language: 'English',       gender: 'female', tone: 'mystical',      speed: 0.90, pitch: 1, style: 'narration',      is_preset: true },
  { id: 17, user_id: null, name: 'Emma',    kokoro_voice_id: 'bf_emma',    source: 'preset', language: 'English (UK)',  gender: 'female', tone: 'professional',  speed: 1.0,  pitch: 1, style: 'corporate',      is_preset: true },
  { id: 18, user_id: null, name: 'Eric',    kokoro_voice_id: 'am_eric',    source: 'preset', language: 'English',       gender: 'male',   tone: 'casual',        speed: 1.05, pitch: 1, style: 'social_media',   is_preset: true },
  { id: 19, user_id: null, name: 'Alloy',   kokoro_voice_id: 'af_alloy',   source: 'preset', language: 'English',       gender: 'female', tone: 'wise',          speed: 0.90, pitch: 1, style: 'educational',    is_preset: true },
  { id: 20, user_id: null, name: 'Liam',    kokoro_voice_id: 'am_liam',    source: 'preset', language: 'English',       gender: 'male',   tone: 'fast',          speed: 1.20, pitch: 1, style: 'energetic',      is_preset: true },
];
