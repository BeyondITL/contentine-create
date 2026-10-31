# LICENSES.md — Contentine Create

Weights-license ledger per Law L4. **Every model checkpoint, library, and asset that ships in the product is recorded here.** Read the license before wiring; record revenue / field-of-use / NC clauses verbatim. Rig packs, style names, and music are original-or-CC0 only.

Status legend: ✅ = read + cleared for production · ⚠ = watchlist (research-only or pending license read) · ❌ = banned.

---

## Model checkpoints (weights)

| Model | Repo / build | License | Status | Notes |
|---|---|---|---|---|
| Kokoro TTS 82M | `hexgrad/kokoro` via `kokoro-js` | Apache-2.0 | ✅ | Core voice. WebGPU real-time; viseme timestamps drive cartoon mouth-shape swaps. |
| Kokoro TTS 82M (timestamped) | `onnx-community/Kokoro-82M-v1.0-ONNX-timestamped` @ `dd4401a9…` | Apache-2.0 | ✅ | Same hexgrad Kokoro-82M weights as above, re-exported with a per-phoneme `durations` output. Drives phoneme-accurate cartoon lip-sync (catalog `kokoro-82m-timestamped`). model_quantized.onnx sha256 `c0c02b32…` (92,361,055 B); tokenizer/config/55 voices byte-identical to the base v1.0 port (verified 2026-08-03). |
| OpenF5-TTS-Base | `mrfakename/OpenF5-TTS-Base` | Apache-2.0 (explicit commercial-OK) | ✅ | Voice cloning. **Standing pin** — must be referenced explicitly in `frontend/src/engine/f5tts-engine.ts`. Alpha, English-only; below official-NC quality, improved variants promised. |
| F5-TTS (official checkpoints, SWivid/F5-TTS) | — | CC-BY-NC-4.0 | ❌ | Maintainer states NC base model cannot be used commercially even after fine-tuning. **Banned from production.** Research-only. |
| F5-TTS-ONNX (unofficial re-upload) | `huggingfacess/F5-TTS-ONNX` | unverified — **presumed CC-BY-NC derivative until proven otherwise** (operator ruling 2026-07-03) | ❌ | **QUARANTINED.** Was the download source at `model-store.ts` (catalog entry now commented out). Referenced local file `frontend/public/models/f5tts/f5tts_base.onnx` exists neither in-repo nor on the live server (verified 2026-07-03: both return SPA HTML fallback). WS-5 provenance task: (a) trace origin of the `huggingfacess` repo; (b) replace with an export from `mrfakename/OpenF5-TTS-Base` recording source repo, revision, conversion steps + hash here; (c) purge any user-side IndexedDB `models/f5-tts` cache entries via migration; (d) if not validated by C-M2 → clone tier feature-flagged OFF (Kokoro + blends only at launch). |
| XTTS v2 | Coqui | CPML-NC (Coqui shut down Jan 2024) | ❌ | Banned. |
| Whisper (large-v3-turbo class) | HF | MIT | ✅ | ASR via Transformers.js v4. Verify suppress-tokens fix on v4 upgrade or patch logits processor. |
| Moonshine Tiny 27M | HF | MIT | ✅ | Streaming caption lane (English). |
| WebLLM SLMs (Qwen 0.5–8B, Llama-3.2, Phi-3.5-mini) | MLC WebLLM builds | model-dependent (Qwen — Apache-2.0; Llama — Meta Llama 3 Community; Phi — MIT) | ✅ / ⚠ | Read each per weight before shipping. Llama-3 has attribution + AUP; must comply. |
| SD-Turbo | Stability | **RE-READ COMPLETED 2026-07-05 (WS-0).** Official `stabilityai/sd-turbo` now ships the **Stability AI Community License** ("Last Updated: July 5, 2024"). Verbatim: free commercial use for orgs "generating annual revenue of less than US $1,000,000"; **"you must register with Stability AI at (https://stability.ai/community-license)"** for commercial use; attribution required — NOTICE text *"This Stability AI Model is licensed under the Stability AI Community License, Copyright © Stability AI Ltd. All Rights Reserved"* + **"prominently display 'Powered by Stability AI'"**; license is **revocable** and terminates above $1M revenue. | ⚠ → operator go/no-go | Image gen ships **feature-flagged OFF** (`NEXT_PUBLIC_IMAGE_GEN_ENABLED`, default off) until the operator's explicit GO (registration + attribution) — the C-M2 "SD-Turbo license resolved" gate. Engine work (onnx-custom pipeline) is complete and smoke-tested regardless. Fallback if NO: PixArt-Sigma-class Apache/MIT checkpoint. |
| SmolVLM / Florence-2 | HF | MIT / Apache | ✅ | Captioning / tagging (Remix Hub). |
| BiRefNet / RMBG-class | HF | model-dependent | ⚠ | Read before wiring bg-removal. |
| Silero VAD | HF | MIT | ✅ | Voice activity for cloning + VO. |
| AniDoc (line-art colorization) | `Yhmeng1106/anidoc` + **required base** `stabilityai/stable-video-diffusion-img2vid-xt` | Repo label MIT/Apache **is a decoy** — runtime composite is an **SVD Derivative Work under the STABILITY AI COMMUNITY LICENSE** | ⚠ → operator go/no-go (**same gate as SD-Turbo**) | R6 hybrid-stage shelf candidate (primary read 2026-08-04). AniDoc ships **no standalone checkpoint**; README requires downloading SVD-xt into `pretrained_weights/`, so the inference model is a Derivative Work of `stabilityai/stable-video-diffusion-img2vid-xt`. SVD-xt LICENSE.md = STABILITY AI COMMUNITY LICENSE: Derivative Works cover "fine tune" + "low-rank adaptation"; free commercial under **"USD $1,000,000 in annual revenue"** w/ registration at stability.ai/community-license + NOTICE + **"Powered by Stability AI"** prominently displayed; **terminates** above $1M. SVD is no longer NC → NOT hard-banned, but **NOT commercial-clean**: inherits the exact SD-Turbo/R-62 regime — adopt only behind operator GO (register + attribution + $1M cliff + feature-flag OFF), else policy-banned. See RESEARCH_LEDGER R-95 (closes R-27). |
| AniSora (Bilibili) — Wan-line vs V1 | V2 `IndexTeam/Index-anisora` on `Wan-AI/Wan2.1-T2V-14B`; V3/V3.2 on `Wan-AI/Wan2.2-T2V-A14B`; **V1.0** on `zai-org/CogVideoX-5b` | Apache-2.0 (Wan-line, clean) / **custom "CogVideoX License" (V1 — banned)** | ✅ Wan-line · ❌ V1.0 · 🟡 V3.1 pending | R6 hybrid-stage shelf candidate (primary reads 2026-08-04). Bilibili releases AniSora Apache-2.0 (V2 + V3 per update log); the **base** determines validity. **ADOPT V2 (Wan2.1-14B) + V3/V3.2 (Wan2.2)** — both Apache-2.0 confirmed; obligations = **dual attribution + NOTICE for AniSora AND the Wan base** + carry Wan AUP. **BAN V1.0 (CogVideoX-5B)**: `zai-org/CogVideoX-5b` = `License: other` — commercial requires bigmodel.cn registration, cap "**must not exceed 1 million visits per month**", field-of-use bars content that "**may undermine China's national security and national unity**" + military/illegal; the Apache tag cannot override the inherited base. **V3.1 base UNCONFIRMED** — verify its checkpoint repo (Apache + Wan2.x, not CogVideoX) before pinning. See RESEARCH_LEDGER R-96 (closes R-26). |

## Libraries / runtimes

| Library | License | Status | Notes |
|---|---|---|---|
| GSAP + all plugins (SplitText, MorphSVG, ScrollTrigger, MotionPath, DrawSVG) | GreenSock no-charge (free, incl. commercial, since 2025-04-30, Webflow-backed) | ✅ | **ADOPTED 2026-07-03** (gsap@3.15.0, cartoon-engine timeline compiler; core only, no CSSPlugin). package.json `license` field: "Standard 'no charge' license: https://gsap.com/standard-license". Not OSI-approved; free for commercial use per that license. |
| lottie-web / dotLottie | MIT | ✅ | Lottie JSON generated programmatically from LLM scene plans. |
| Pixi.js | MIT | ✅ | Optional WebGL scene-render backend. |
| Three.js | MIT | ✅ | Avatar / TalkingHead. |
| Rive runtimes | open-source (runtime); editor commercial SaaS | ⚠ | Use runtime only; do not depend on authoring. |
| Live2D Cubism | proprietary | ❌ | Excluded. |
| Transformers.js | Apache-2.0 | ✅ | v4 (WebGPU default). |
| WebLLM (MLC) | Apache-2.0 | ✅ | JSON-mode for scene plans. |
| wllama | MIT | ✅ | Low-RAM GGUF fallback. |
| ONNX Runtime Web | MIT | ✅ | Diffusion + SAM + custom ONNX. |
| MediaPipe LLM (Google) | Apache-2.0 | ⚠ | Gemma weights terms bind separately — read before shipping. |
| ffmpeg.wasm | LGPL-2.1+ (some builds GPL-3) | ✅ | Dynamic-linked WASM; keep the LGPL notice in-product. |
| Mediabunny | MPL-2.0 (verified in node_modules/mediabunny/LICENSE, v1.34.3, 2026-07-03) | ✅ | File-level copyleft only — commercial use fine, no NC/field-of-use clauses. Already a shipped dep (muxer + cartoon-engine mux/probe). |
| WebCodecs | browser platform API | ✅ | No license. |
| Tone.js | MIT | ✅ | Procedural stingers. |
| hash-wasm | MIT (verified in node_modules/hash-wasm/LICENSE, v4.12.0, 2026-07-05) | ✅ | **ADOPTED 2026-07-05** — streaming SHA-256 for model-artifact verification (model-storage layer: download verify, adopt-folder scan, delta repair). |
| esbuild | MIT (verified in node_modules/esbuild/package.json, v0.25.12, 2026-07-05) | ✅ | **ADOPTED 2026-07-05** — build-time only (devDependency): bundles the Kokoro TTS worker (scripts/setup-assets.sh step 7). Nothing of esbuild ships to users. |
| Stripe / stripe-php | ISC / MIT | ✅ | Hosted redirect Checkout + Billing Portal. |
| firebase/php-jwt | BSD-3 | ✅ | Backend JWT. |
| Lucide icons | ISC | ✅ | Icon set. |
| Anime-style WebGPU post-filter (`engine/bridge/anime4k-filter.ts`) | **Contentine-original WGSL** (MIT-spirit; CAS/Anime4K-inspired, no third-party code embedded) | ✅ | **ADOPTED 2026-08-04 (WS-11 R6, R-72 slot).** Self-written linear-upscale + Contrast-Adaptive-Sharpen render pass. NO model download, NO npm dependency, and **no GPL app code embedded** (R-89 doctrine honoured — `web-realesrgan` was neither read nor vendored). **Preview-only** — deliberately NOT wired into the deterministic export path (Law L6: a GPU pass is same-device deterministic but not guaranteed bit-identical across GPUs; the software export encoder stays the sole export path). |
| `anime4k-webgpu` npm package (MIT) | MIT (R-72, RECONCILED_MODEL_VERDICTS 2026-08-03) | 🟡 NOT ADOPTED — **pending WS-12** | Full Anime4K shader set (higher anime-restore quality than the self-written pass above). Adopting it = a package.json addition (WS-12 gate) **and** the same L6 preview-only constraint. Deferred, not dropped: recommended as a follow-up if the operator wants the fuller shader ladder. Weights: none (shaders). Optional HQ still-mode via independently-converted Real-ESRGAN **weights (BSD-3 upstream only, never the GPL app code)** remains a separate future BOM entry. |
| ToonCrafter (R-25) | Apache-2.0 (weights + code) | ✅ detection/gating only — **no bundle, no weights shipped** | **WS-11 R6:** the ~10GB model is a **bridge-served capability** (user's own ComfyUI), never a browser download. `engine/bridge/comfyui.ts` only *detects* a ToonCrafter-class node via `/object_info` and surfaces it honestly ("via your local ComfyUI"). Because nothing ships, there is **no model-BOM entry** — if ToonCrafter is ever bundled or downloaded by us, a full BOM row + per-artifact SHA-256 becomes mandatory. |
| `@modelcontextprotocol/sdk` (bridge/, companion process only — not in the browser bundle) | MIT (verified in bridge/node_modules/@modelcontextprotocol/sdk/LICENSE, v1.32.1, 2026-10-31) | ✅ | MCP server for the assistant bridge. Transitive tree: 82 MIT, 7 ISC, 2 BSD-3-Clause (`fast-uri`, `qs`), 1 BSD-2-Clause (`json-schema-typed`) — all permissive; keep their notices if the bridge is ever redistributed as a package. |
| `ws` (bridge/) | MIT (verified in bridge/node_modules/ws/LICENSE, v8.22.0, 2026-10-31) | ✅ | Loopback WebSocket for the paired tab. |
| `zod` (bridge/) | MIT (verified in bridge/node_modules/zod/LICENSE, v3.25.76, 2026-10-31) | ✅ | Tool input schemas. |
| `fake-indexeddb` (frontend devDependency, tests only) | Apache-2.0 (verified in node_modules/fake-indexeddb/LICENSE, v6.2.7, 2026-10-31) | ✅ | Not shipped; unit/contract tests of the project store. |

## Bundled-binary provenance ledger (operator protocol, 2026-07-03)

Every binary shipped under `frontend/public/models/` or `frontend/public/wasm/`, and every runtime-downloaded checkpoint source, gets a provenance entry: source repo, revision, hash, license — verified before C-M2 or the consuming feature is flagged off. **Owner: WS-5 (voice binaries) / WS-7 (the rest).**

| Binary / source | Where | Presumed origin | License (presumed) | Provenance status |
|---|---|---|---|---|
| `models/f5tts/f5tts_base.onnx` | referenced by `f5tts-engine.ts` — **file absent locally & live** | unknown | — | ❌ QUARANTINED (see checkpoint table) |
| `models/wav2lip/wav2lip_quantized.onnx` | referenced by `model-store.ts` — **file absent locally & live** (200 = SPA fallback) | unknown | Wav2Lip upstream is **non-commercial research** | ❌ **QUARANTINED (operator ruling 2026-07-03, Amendment 2 — same protocol as F5).** Catalog entry commented out in `model-store.ts`. WS-5 sub-task: identify a commercially-clean browser photo-lip-sync path; failing validation by C-M3 → photo-avatar tier feature-flagged OFF per the Deferral rule. **MIT TalkingHead 3D avatar path unaffected — remains live.** |
| `models/face-api/*` (4 model sets, manifests + shards) | bundled in-repo | `justadudewhohacks/face-api.js` | MIT (code + published weights) | ⚠ verify shard hashes against upstream release |
| `models/kokoro-voices/*.bin` (5 voice packs, 522,240 B each) | bundled in-repo | `hexgrad/Kokoro-82M` voice embeddings | Apache-2.0 | ⚠ verify against upstream release hashes |
| `wasm/` (ONNX Runtime WASM on live server; local dir empty) | live webroot | `onnxruntime-web` npm dist | MIT | ⚠ re-provision from the pinned npm version at next deploy; never hand-copied |
| `mlc-ai/*` WebLLM builds (runtime download) | `model-store.ts` catalog | MLC official | Apache-2.0 code; **weights per-model** (Llama 3.2 Community License; Qwen Apache-2.0) | ⚠ record per-weight terms before C-M2 |
| `onnx-community/Kokoro-82M-v1.0-ONNX`, `Xenova/whisper-tiny`, `onnx-community/whisper-base` (runtime download) | `model-store.ts` catalog | HF official community ports | Apache-2.0 / MIT | ✅ reputable ports; pin revisions in WS-7 |
| `schmuell/sd-turbo-ort-web` (runtime download, rev `ace89b7`) | `model-catalog.ts` (engine: onnx-custom; feature-flagged) | fp16 ONNX export of SD-Turbo by the ONNX Runtime demo author (guschmue's reference WebGPU example uses this exact repo) | Repo bundles the **old Nov-28-2023 "STABILITY AI NON-COMMERCIAL RESEARCH COMMUNITY LICENSE"** text (verbatim header verified 2026-07-05); the underlying weights are governed today by the Stability AI **Community License** on official `stabilityai/sd-turbo` (see checkpoint table), which covers Derivative Works incl. format conversions | ⚠ Ships only behind `NEXT_PUBLIC_IMAGE_GEN_ENABLED` (default OFF) pending operator go/no-go. Artifacts verified: text_encoder 681.4 MB, unet 1733.4 MB, vae_decoder 99.1 MB (HF API + curl -I 302→CDN, 2026-07-05). If GO: consider re-hosting/pinning an export traced to the official repo, or at minimum pin revision + hashes here. |

## OpenF5 provenance & F5-TTS-ONNX trace (Law L4, WS-5 — completed 2026-07-03)

### (a) `huggingfacess/F5-TTS-ONNX` origin — TRACED → **CONFIRMED CC-BY-NC-4.0 derivative, BANNED**

Evidence (verbatim, fetched from huggingface.co 2026-07-03):
- The repo card has **no license field** ("empty or missing yaml metadata in repo card") — no independent grant.
- Its README instructs, verbatim: *"Download [CPU](https://huggingface.co/SWivid/F5-TTS/tree/main/F5TTS_Base) or [GPU](https://huggingface.co/SWivid/E2-TTS/tree/main/E2TTS_Base) and place under model/"* and cites *"ONNX Github: https://github.com/DakeQQ/F5-TTS-ONNX"*. So the repo is purely an **ONNX format-conversion of the official `SWivid/F5-TTS` `F5TTS_Base` checkpoint**; it carries no weights of its own.
- `SWivid/F5-TTS` license tag (fetched same day) = **`cc-by-nc-4.0`**. Files shipped by the ONNX repo: `F5_Preprocess`, `F5_Transformer`, `F5_Decode` (`.onnx`/`.ort`).

**Ruling:** a format conversion is a derivative work; CC-BY-NC-4.0's NonCommercial term binds derivatives, and the ONNX repo grants nothing that could relicense it. Operator's 2026-07-03 presumption ("presumed CC-BY-NC derivative until proven otherwise") is **upheld with evidence → ❌ BANNED from production.** Removed from `model-store.ts` catalog (entry commented out); local/live file `models/f5tts/f5tts_base.onnx` never existed.

### (b) Replacement export from `mrfakename/OpenF5-TTS-Base` — SOURCE PINNED, export **PLANNED (not yet validated)**

| Field | Value |
|---|---|
| Repo | `mrfakename/OpenF5-TTS-Base` |
| License | **apache-2.0** — verbatim: *"This model was trained on permissively licensed data and is available under the Apache 2.0 license, which means it can be used for both commercial and personal purposes."* |
| Pinned revision (sha) | `28e45df3acf0595c9febf233d7d82b409708ce2c` |
| Training | *"trained using the F5-TTS Base V1 model configuration for 1 million steps on the Emilia-YODAS dataset"* |
| `model.pt` | 5,402,567,833 B · LFS sha256 `c8a97749c1318cb6cf4659dd1eef067c85c42e75156c98a937124c53de2ca148` |
| `config.yaml` | 2,012 B · git oid `48caf0790738e43b74bdafc6a028f31c7dce7d52` |
| `vocab.txt` | 13,679 B · git oid `7977fa560849a603201bdcc564dab57ea838b795` |

Pinned in code: `frontend/src/engine/f5tts-engine.ts` exports `OPENF5_MODEL_ID` + `OPENF5_REVISION` (Law L4 standing pin satisfied — AUDIT_REPORT §6 exposure closed).

**Reproducible export script (WS-5, 2026-08-03):** `scripts/export-openf5-onnx.py` commits the conversion below as a runnable, fully-pinned script (source repo+revision+model.pt sha256; toolchain: SWivid/F5-TTS @ `9c614e96…` MIT, DakeQQ/F5-TTS-ONNX exporter @ `47173d5f…`, f5-tts 1.1.22, Vocos MIT). `--dry-run` validates the toolchain, re-confirms the pinned source against HuggingFace (metadata only, no download), and prints a LICENSES.md-ready provenance block; `--run` performs the ~5.4 GB conversion and records the output ONNX sizes+sha256. It **never** flips `F5_CLONE_TIER_ENABLED` — that stays a separate, human-reviewed change after parity validation.

**Planned conversion (offline job — needs Python+torch+~5.4 GB DL; cannot run in the browser-native session — escalated to lead for where to run):**
1. Check out `SWivid/F5-TTS` model code (MIT code) at the F5TTS_Base_V1 config + the `DakeQQ/F5-TTS-ONNX` exporter.
2. Load OpenF5 `model.pt` @ rev `28e45df…` with `config.yaml` + `vocab.txt` (vocab-based tokenizer; F5 mel front-end: 24 kHz, 100-mel, hop 256, win 1024; flow-matching ODE sampler; Vocos vocoder, MIT).
3. Export `F5_Preprocess` / `F5_Transformer` / `F5_Decode` ONNX; quantize q8/fp16 for browser (ORT-Web).
4. **Validate**: numerical parity vs the PyTorch reference on a fixed (ref-audio, text) pair within tolerance + listening check; record output ONNX file sizes + sha256 here.
5. Wire `VALIDATED_MODEL_SOURCE` and flip `F5_CLONE_TIER_ENABLED = true` in `f5tts-engine.ts`.

**Status until then:** clone tier is **feature-flagged OFF** (`F5_CLONE_TIER_ENABLED = false`); `isModelDownloaded()` returns false and all three consumers (`VoiceCloner.tsx`, `editor-store.ts`, `translation-pipeline.ts`) fall back to Kokoro. The previous engine's fabricated inference (`extractFeatures`/`tokenize` stand-ins) has been **removed** (Law L1). Per Plan of Record: not validated by **C-M2 → clone tier ships OFF** (Kokoro + blends only).

### (c) IndexedDB purge migration — IMPLEMENTED

`frontend/src/engine/voice/f5-purge-migration.ts` — `runF5PurgeMigrationOnce()` removes any quarantined F5 binary from the asset-cache `models` store (keys `f5-tts`/`f5tts`/`models/f5-tts`/`f5-tts-onnx` + a defensive `/f5/i` scan), localStorage-guarded to run once, idempotent. **Only** the model binary is purged — user voice samples (separate store) are never touched. Invoked from `f5tts-engine.isModelDownloaded()`.

### Engine honesty note — Kokoro viseme timing (verified 2026-07-03)

Kokoro exposes **no per-phoneme durations**: `kokoro-js@1.2.1` destructures only `{ waveform }` from the model, and the `onnx-community/Kokoro-82M-v1.0-ONNX` graph emits no `durations`/`pred_dur` output (unlike transformers.js's Supertonic path, which does). Therefore any per-viseme times emitted straight from Kokoro would be a synthetic placeholder (Law L1 facade). Real viseme timing is obtained by **forced alignment** of the produced audio against the known text (`engine/voice/forced-aligner.ts`, whisper-tiny MIT); cues are tagged `source:'forced-alignment'` (real word onsets) vs `'estimated'` (preview-only).

**R4 update (2026-08-03, WS-5 — R-83 ADOPT):** the honesty note above holds for the *base* v1.0 port. For cartoon lip-sync we now additionally ship the **timestamped** Kokoro export (`onnx-community/Kokoro-82M-v1.0-ONNX-timestamped`), whose graph DOES emit a per-phoneme `durations` output. kokoro-js still discards it, so `tts-worker.ts` runs that model's transformers.js session directly (reusing kokoro-js's tokenizer + a faithful, attributed port of its private phonemizer in `engine/voice/kokoro-phonemize.ts`) and derives real stamps in `engine/voice/kokoro-visemes.ts` via divisor-80 frame accumulation. These cues are tagged `source:'tts-aligned'` — the synthesiser's own timing, not a guess. Forced alignment is **retained unchanged** for user-recorded/uploaded VO (the audio isn't Kokoro's, so no durations exist). Determinism (Law L6): argmax model + fixed-order float accumulation ⇒ same text+voice ⇒ identical stamps.

## Photo lip-sync (Wav2Lip-replacement) watchlist (Law L4 · Amendment 2 · WS-5 · deadline C-M3)

WEIGHTS-license reads (verbatim). Gate = commercially-clean **weights** AND browser-feasible (Law L2). MIT TalkingHead 3D path is unaffected and remains live.

| Candidate | Weights license (verbatim) | Browser feasibility | Verdict |
|---|---|---|---|
| **Wav2Lip** (`Rudrabha/Wav2Lip`) | *"All results from this open-source code or our demo website should only be used for research/academic/personal purposes only."* … *"Any form of commercial use is strictly prohibited."* | GAN, exportable | ❌ **BANNED-NC** (confirms operator ruling) |
| **MuseTalk** (`TMElyralab/MuseTalk`) | tag `creativeml-openrail-m`; *"The trained model are available for any purpose, even commercially."* (code MIT) | latent VAE+UNet — heavy; ONNX port unproven in-browser | ⚠ **BEST CANDIDATE** — commercial-OK weights, BUT OpenRAIL-M use-restrictions apply + must clear component licenses it names (whisper, ft-mse-vae/SD-VAE, dwpose, S3FD) individually; and its own note restricts *test data* to "non-commercial research purposes only" |
| **LatentSync-1.5** (`ByteDance/LatentSync-1.5`) | tag `openrail++` (full text not yet read) | SD diffusion U-Net — too heavy for browser real-time | ⚠ PARKED — read full OpenRAIL++ + SD/Whisper/SyncNet deps; browser-infeasible as-is |
| MediaPipe FaceLandmarker + 2D mouth-warp | Apache-2.0 (MediaPipe) / MIT (TF.js) | native browser, real-time | ✅ CLEAR license but **lower photoreal quality** (geometric warp, not generative) — fallback path |

**Shortlist for C-M2/C-M3 spike (ranked):** (1) **MuseTalk** — clear the OpenRAIL-M + 4 component licenses and prove a browser ONNX port; (2) **MediaPipe 2D warp** — license-clean, guaranteed browser-feasible, quality-limited safety net; (3) LatentSync — parked (weight-license read pending + diffusion too heavy). If none validates by **C-M3 → photo-avatar tier feature-flagged OFF** per the Deferral rule.

## Original assets (Contentine-owned)

| Asset class | Status | Notes |
|---|---|---|
| 6 launch style packs (Flat Explainer, Cutout Comedy, Whiteboard/Doodle, Kinetic Typography, Chibi Sticker, Anime-lite Webtoon) | ⚪ TBD-per-workstream | Rigs + palettes + bg-prompt templates + motion presets + 1 self-generated demo per pack. All-original names + designs. **Owner: WS-3.** |
| Rig packs (SVG puppets: bones + gesture library + viseme mouth set) | ⚪ TBD-per-workstream | Data-driven format so packs ship without code. **Owner: WS-3.** |
| Music library | ⚪ TBD-per-workstream | CC0 or owned only. Per-track ledger to be filled here. **Owner: WS-6.** |
| SFX library | ⚪ TBD-per-workstream | Same rule. |

## Compliance readiness

- **US launch:** Stripe Tax configured for US sales-tax nexus (add EU VAT only if EU sales open later).
- **Voice-clone consent gate:** Law L7 — recorded checkbox (DB), enforced client + server side. **In progress (R5) — WS-5 owns the submission gate + `real_clone_requests` INSERT; WS-9 admin review queue is live (`RealCloneController` + `/admin/real-clone`, approve blocked without recorded consent).**
- **Provenance metadata + AI-disclosure caption preset:** embedded in every export. SB-942-class / EU AI Act Art. 50 readiness. **Implemented in the cartoon lane (render-worker.ts:258, caption sourced from `lib/ai-disclosure.ts` via `getAiDisclosure()`); visible "AI-generated" disclosure UI + settings shipped (WS-9 R5); general video lane routed to WS-7 R5.**
- **Hunyuan** and other territorial-bar-affected engines: excluded by default even where the bar lifts.

*Every entry above must be re-verified whenever the source repo publishes a new release. Fold changes into this file the same commit they're wired in.*
