---
name: voice-profiles
description: Voice profile model (Kokoro base + blend, clone via OpenF5, VO record/upload, Match-Tone). Use for WS-5 voice work and any dialogue-related surfaces. Enforces Law L4 (OpenF5 pin only) and Law L7 (consent gate).
---

# voice-profiles

## Model

```ts
type VoiceProfile =
  | { kind: 'kokoro'; voiceId: string; speed: number; pausesMs: Record<string,number>; phonemeOverrides: Record<string,string> }
  | { kind: 'kokoro-blend'; blend: Array<{ voiceId: string; weight: number }>; speed: number }
  | { kind: 'openf5-clone'; refClipRef: string; consentEventId: string; emotionCue?: 'happy'|'sad'|'excited'|'neutral' }
  | { kind: 'user-vo'; takes: Record<lineId, string /* opfs://audio/... */>; matchTone: boolean }
```

## The pin (Law L4)

- Voice-clone runtime **must** load `mrfakename/OpenF5-TTS-Base` (Apache-2.0). `frontend/src/engine/f5tts-engine.ts` must reference this HF repo string explicitly. Official `SWivid/F5-TTS` checkpoints are CC-BY-NC-4.0 and banned from production paths.
- `LICENSES.md` records the pin. Any variant fold-in re-verifies both license and quality.

## Consent gate (Law L7)

- Voice-clone requires a **recorded consent checkbox** persisted to the backend:
  - Backend: consent-events table with `user_id`, `voice_ref_hash`, `consent_text_version`, `ip`, `ua`, `signed_at`. Emit a `consentEventId`.
  - Frontend: `<ConsentGate />` — checkbox + statement of rights (right of publicity / ELVIS-Act-class language, US framing) — no clone action can fire without `consentEventId` in the profile.
  - The backend `AuthController.php` "prompt=consent" reference is Auth0's OAuth prompt, not the clone gate — do not confuse.

## Kokoro voice (default)

- WebGPU real-time (~10 s speech in ~1 s).
- Viseme timestamps come free — feed straight to `rig-authoring` mouth-swap track.
- Blend: normalize weights → weighted sum of Kokoro embeddings. Speed is the model's speed knob, not post-hoc rate change.

## User VO (record / upload) + Match Tone

- Record via `MediaRecorder(mimeType:'audio/webm;codecs=opus')` — **input capture only**, whitelisted vs Law L6 (see AUDIT_REPORT.md §7 note on `VoiceCloner.tsx:127`).
- Whisper (Transformers.js v4) forced-alignment against the known dialogue text → per-word start/end → viseme timestamps re-derived exactly as Kokoro would emit.
- **Match Tone** pass (all in OfflineAudioContext, deterministic):
  1. RNNoise-class noise suppression worklet.
  2. Loudness normalize to −18 LUFS (project standard).
  3. EQ + light comp (shared "room" preset for scene coherence).
  4. Crossfade splices at word boundaries (± 20 ms).
- On any dialogue-text edit, invalidate the take *only* if the text materially changed (case + whitespace insensitive equality) — otherwise reuse.

## FX chain (per-character, per-track mix)

- Chain: pitch (± semitones via WebAudio `PitchShifter`), EQ (peaking bands), room presets (impulse-response convolver — CC0 IRs only), telephone / radio / robot preset, dynamics comp, pan.
- Music auto-duck: −18 dB under active dialogue windows (200 ms attack/release ramps).

## Emotion (clone)

- OpenF5 carries emotion through the reference clip. To dial emotion on a cloned character: swap the reference-clip pointer, not a code-side dial.

## Verification (WS-QA)

- Deterministic mix test: render the same scene's audio twice → identical PCM sample hashes.
- Consent-gate test: attempt clone without `consentEventId` → both client and server refuse; audit-log entry.
