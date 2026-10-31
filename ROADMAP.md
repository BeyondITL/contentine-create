# Roadmap

An honest view of where Contentine Create is and what's next. This is a working prototype; the list below is the real backlog, not marketing.

## Proven today (downloadable, ffprobe-valid MP4)

- Avatar — **Photo tier** (upload a photo → face-animated talking head) → MP4. *(The 3D "Quick Avatar" / TalkingHead tier is gated off, pending a license-cleared GLB **and** viseme wiring — see the 3D-avatar issue.)*
- Audio-to-video (upload audio → on-device transcription → captioned video) → MP4
- Cartoon (script → styled animated scene → render) → MP4
- On-device script generation with honest fallbacks when no browser LLM/WebGPU is available
- URL → extract → script → video wizard, hydrated up to the visuals step

## The one headline blocker: URL → video visuals

URL→video stops at the image step because on-device AI image generation (SD-Turbo) is gated behind `NEXT_PUBLIC_IMAGE_GEN_ENABLED`, which defaults to **off**. This is **not a bug** — it's a licensing decision under the Stability AI Community License (attribution, registration, and the US$1M revenue cliff; see [`NOTICE`](NOTICE)). Paths forward:

- **Enable SD-Turbo** after accepting the license obligations (register, ship the "Powered by Stability AI" attribution + NOTICE text, add the >$1M termination trigger to ops).
- **Or** add an alternative visuals source: an Apache/MIT image model (e.g. a PixArt-class checkpoint), server-side stock footage (needs operator Pexels/Pixabay keys), or upload-your-own per scene.

Until one of these lands, URL→video is not a launch flow. Help wanted here.

## Near-term, well-scoped (good contributor entry points)

- **Harden the remix→wizard script parser.** It can mis-split model output (preamble becomes a junk scene; `**SCENE n:**` markdown survives; `(Visual prompt: …)` / `Camera angle:` lines leak into narration and would be spoken by TTS). Needs preamble/epilogue trimming, markdown-marker stripping, scene-heading dedup, and field-aware parsing. Test fixtures still need to be captured from real model output (tracked as a `help wanted` issue).
- **Accessibility pass.** Toast announcements already ship (`role="status"`/`"alert"` + `aria-live`, SA-35); the open work is icon-only buttons with no accessible name, form fields not associated with their labels, `Modal` focus handling (trap + restore on close), and the `ContentTypeStep` `role`/`aria-pressed` conflict. Several are labelled `good first issue`.
- **Honest UI labels for gated features.** Where a tier advertises a model that's currently flag-gated off, show the real gated-state message instead of the aspirational label.
- **Test coverage.** The `scripts/verify-*.mjs` harnesses need to be made portable first (they hard-code an absolute local path and read `/tmp/api-key.txt`). The Vitest `@/` alias is now wired, so store and engine modules can be imported directly in new unit tests.

## Later / bigger bets

- A clean, documented plugin surface for new engines and styles.
- Broader language support for TTS/ASR.
- Packaged releases and a one-command local setup.
- A hosted option (kept honest with the AGPL + the on-device-first promise).

## Hard problems (level 3)

Open problems with no known answer yet. Each one says what "solved" means, so a proposal can be judged on evidence rather than opinion. Comment on the issue with an approach before writing much code. (Code paths are under `frontend/src/` unless they start with `scripts/`.)

- **Deterministic export across browsers.** *Unsolved:* the cartoon export pins `hardwareAcceleration: 'prefer-software'` in `engine/cartoon/render-worker.ts`, and the C-M1 harness (`engine/cartoon/harness/run-c-m1.mjs`) proves byte-identical renders run-to-run, but only in one Chrome via Playwright. Law L6 promises the same output on any device. *Why it's hard:* WebCodecs encoder availability and software H.264 behaviour differ between Chromium, Firefox, and Safari, and 2D canvas rasterisation (anti-aliasing, text) is not specified to be bit-exact across engines. *Judged by:* the C-M1 reference plan, rendered with `collectFrameHashes` in Chromium, Firefox, and WebKit, produces identical per-frame SHA-256 lists, and each run yields an ffprobe-valid MP4. Where a browser can't match, the harness records which frames diverge and why, rather than passing silently.
- **Usable performance without WebGPU.** *Unsolved:* WebLLM script drafting needs WebGPU (`engine/webllm-engine.ts`); without it the app falls back honestly (`scripts/verify-script-generation.mjs`, case C) but cannot draft on-device. `wllama` is listed as a low-RAM fallback in `LICENSES.md` but is not wired. Kokoro TTS already runs on WASM in `engine/tts-worker.ts`. *Why it's hard:* WASM inference is much slower than WebGPU, and the static export's cross-origin isolation, memory ceilings, and model download size all bite harder on the low-end devices that lack WebGPU. *Judged by:* with WebGPU disabled, the cartoon wizard drafts a real script on-device, and the harness records tokens/sec, time to first token, and peak memory next to the WebGPU numbers on the same machine.
- **3D avatar with real lip-sync** ([#41](https://github.com/BeyondITL/contentine-create/issues/41)). *Unsolved:* the TalkingHead "Quick Avatar" tier is gated off pending a license-cleared GLB and viseme wiring. `engine/talkinghead-engine.ts` falls back to idle animation when viseme-driven speech isn't available. *Why it's hard:* the GLB needs a clean license and the right morph targets, and TalkingHead advances its own real-time clock, which has to be driven frame-by-frame for a deterministic export (L6) instead of played live. *Judged by:* a downloaded, ffprobe-valid MP4 of a 3D avatar speaking a Kokoro line where mouth shapes follow the Kokoro viseme timestamps (an onset log per viseme, compared against the audio, committed with the evidence), and the GLB's license recorded in `LICENSES.md`.
- **Multilingual ASR/TTS matrix** ([#37](https://github.com/BeyondITL/contentine-create/issues/37)). *Unsolved:* voices are English-only today: `engine/voice/kokoro-phonemize.ts` maps every voice to `en-us` or `en-gb` (Moonshine, the streaming caption model in `LICENSES.md`, is English-only and not yet wired). Whisper (`engine/whisper-engine.ts`, whisper-tiny) can transcribe more languages, but nothing measures how well. *Why it's hard:* every added language needs a phonemizer path, voices, and a weights-license read (L4), all on-device and within download budgets, and the IPA→viseme mapping (`engine/voice/viseme.ts`) has only been exercised on English phonemes. *Judged by:* a committed matrix of languages × engines (TTS, ASR, captions, lip-sync) where each "supported" cell is backed by a fixture: a TTS→ASR round-trip word error rate and an ffprobe-valid captioned MP4.
- **Offline after download.** *Unsolved:* the README promises the app "works offline after the models are cached". Models are cached and re-verified by `lib/model-storage.ts`, but the app itself does not register a service worker, so whether a reload with no network still reaches a working editor is unproven. *Why it's hard:* a static export with cross-origin isolation (COOP/COEP) has to serve its own shell, workers, and WASM from cache with the right headers, and storage eviction can remove models at any time. *Judged by:* a Playwright run that loads the app, caches the models for one flow, goes offline (`context.setOffline(true)`), reloads, and still produces an ffprobe-valid MP4; plus a check that an evicted model fails with the real classified error, not a silent spinner.

## How to help

Grab a [`good first issue`](https://github.com/BeyondITL/contentine-create/labels/good%20first%20issue), or comment on the matching issue for anything above. See [CONTRIBUTING.md](CONTRIBUTING.md) for the dev setup and the quality bar.
