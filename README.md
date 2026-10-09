<div align="center">

# Contentine Create

**Browser-native, on-device AI studio for short-form video and content.**
Generate scripts, voices, avatars, and animated video — in the browser, on your own device, with no server GPU.

<!-- Badges: fill the CI/release/discord links once the repo is live -->
![status](https://img.shields.io/badge/status-prototype-f3a6ff)
![license](https://img.shields.io/badge/license-AGPL--3.0-00c3ff)
![PRs welcome](https://img.shields.io/badge/PRs-welcome-35c838)

</div>

---

> **Project status — honest version.** Contentine Create is a **working prototype**, not a finished product. Several core flows are proven end-to-end (real, playable MP4s); one headline flow is gated on a licensing decision; and there is plenty of high-value work left. It was built largely by one developer and is now **open source because it deserves collaborators.** If that's you, jump to [Looking for collaborators](#looking-for-collaborators).

## What it is

Contentine Create turns an idea, a script, or a URL into finished short-form content **without sending your media to a server**. The heavy AI runs in your browser on WebGPU (with a WASM fallback): text-to-speech, speech-to-text, small language models for scripting, talking-head avatars, and a deterministic cartoon/motion-graphics renderer. An **optional** PHP/MySQL backend handles sign-in, credits, and commerce — but it is never required to *create*.

## Why it's different

- **On-device by default.** Your script, your voice recording, your render — none of it needs to leave the machine. No server GPU bill, works offline after the models are cached.
- **Deterministic rendering.** Video is rendered frame-accurately (`seek()` per frame → OffscreenCanvas → WebCodecs → [Mediabunny](https://github.com/Vanilagy/mediabunny)), not screen-captured. The same project file produces the same output on any device.
- **Honest video.** It renders cartoon/motion-graphics and avatar video — it does not pretend a diffusion model is "Pixar." Marketing claims match the actual quality ladder.
- **License-disciplined.** Every shipped model's **weights** license is read and recorded in [`NOTICE`](NOTICE) / [`LICENSES.md`](LICENSES.md). Anything with unmet obligations ships behind a feature flag that defaults to **off**.

## See it in action

<!-- TODO: drop a 20–30s screen recording / GIF of a real render here. This is the single most important thing for adoption. -->
*(Demo GIF coming — see [issue: add demo recording](#).)*

## What works today

Proof standard: a flow counts as "working" only if it produces a **downloaded, ffprobe-valid MP4** — never a green spinner.

| Flow | Status |
|---|---|
| Avatar (talking head) → MP4 | ✅ Proven |
| Audio-to-video (upload audio → captioned video) → MP4 | ✅ Proven |
| Cartoon (script → styled animated scene) → MP4 | ✅ Proven |
| Script generation (on-device SLM, with honest fallbacks) | ✅ Proven |
| URL → extract → script → video **wizard** | ✅ Up to the visuals step |
| URL → **video** (AI images) → MP4 | ⚠️ Gated — needs a model-license decision (see [ROADMAP](ROADMAP.md)) |

See [ROADMAP.md](ROADMAP.md) for exactly what's next and where help is wanted.

## Quick start

**Prerequisites:** Node 18+, a WebGPU-capable browser (recent Chrome/Edge), and — only if you want the backend — PHP 8.0+ and MySQL/MariaDB.

```bash
git clone https://github.com/BeyondITL/contentine-create.git
cd contentine-create

# Frontend (the app itself)
cd frontend
npm install
cd ..
bash scripts/setup-assets.sh   # downloads the open model weights the app uses
cd frontend
npm run dev                    # http://localhost:3000
```

The app runs **frontend-only** out of the box. To enable sign-in, credits, and sync, set up the optional backend — see [`docs/`](docs/) and copy `admin_config.php.template` → `admin_config.php` (kept out of git; never commit real secrets).

## Project layout

```
frontend/      Next.js 14 static-export app — the engines, UI, and stores
backend/       Optional PHP 8 API (auth sync, credits, commerce). PSR-4, no framework
database/      SQL schema + ordered migrations
scripts/       Asset setup, model manifest/BOM checks, and verification harnesses
docs/          Engineering, UI/UX, and implementation specs
.claude/       Claude Code project config: laws, hooks, subagents, and domain skills
```

## Architecture (short version)

- **Frontend:** Next.js 14 static export (`output: 'export'`, no SSR) — every engine import is dynamic. State in [Zustand](https://github.com/pmndrs/zustand) stores; IndexedDB/OPFS as the primary data layer.
- **Engines:** Kokoro TTS (voices), Whisper/Moonshine (ASR + captions), WebLLM small language models (scripting), TalkingHead + three.js (avatars), a GSAP-timeline cartoon engine, all exporting through WebCodecs + Mediabunny in a Worker.
- **Backend (optional):** PHP 8 front-controller (`backend/public/index.php`), PSR-4 `Contentine\` namespace, MySQL. Non-blocking sync/commerce only.

Full detail: [`ARCHITECTURE.md`](ARCHITECTURE.md) and [`docs/ENGINEERING_SPEC.md`](docs/ENGINEERING_SPEC.md).

## Models & licenses

Contentine Create orchestrates third-party open models but **does not redistribute their weights** — `scripts/setup-assets.sh` downloads them from their official sources. Each model's license, obligations, and status are recorded in [`NOTICE`](NOTICE) and [`LICENSES.md`](LICENSES.md). Notably, SD-Turbo image generation ships **disabled by default** pending the operator's acceptance of the Stability AI Community License (attribution + the US$1M revenue cliff). Read `NOTICE` before enabling any gated model.

## Looking for collaborators

This is the honest ask: **one developer can't take this to a market-grade product alone.** If you care about on-device AI, WebGPU, TTS/ASR, deterministic rendering, or just want to help a real codebase grow, you're very welcome here.

Good places to start:
- Issues labeled [`good first issue`](https://github.com/BeyondITL/contentine-create/labels/good%20first%20issue) and [`help wanted`](https://github.com/BeyondITL/contentine-create/labels/help%20wanted).
- The open items in [ROADMAP.md](ROADMAP.md) — the URL→video visuals story, the script-parser hardening, and accessibility are all well-scoped.
- Read [CONTRIBUTING.md](CONTRIBUTING.md) first — it covers the dev setup, the "no facades / evidence before done" bar, and the knowledge-graph tooling ([graphify](https://github.com/Graphify-Labs/graphify)) this repo uses.

## License

Code is licensed under **[AGPL-3.0](LICENSE)**. In short: you can use, modify, and self-host it freely, but if you run a modified version as a network service, you must publish your source. Third-party model weights keep their own licenses (see [`NOTICE`](NOTICE)).

Contributions are accepted under the project's [Contributor License Agreement](CLA.md), which keeps the door open to a future dual-license. See [CONTRIBUTING.md](CONTRIBUTING.md).

---

<div align="center">
<sub>Built by <a href="https://github.com/BeyondITL">BeyondITL</a> · part of the Contentine project.</sub>
</div>
