# Roadmap

An honest view of where Contentine Create is and what's next. This is a working prototype; the list below is the real backlog, not marketing.

## Proven today (downloadable, ffprobe-valid MP4)

- Avatar (talking head) → MP4
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

## How to help

Grab a [`good first issue`](https://github.com/BeyondITL/contentine-create/labels/good%20first%20issue), or comment on the matching issue for anything above. See [CONTRIBUTING.md](CONTRIBUTING.md) for the dev setup and the quality bar.
