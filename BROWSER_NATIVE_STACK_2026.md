# BROWSER_NATIVE_STACK_2026.md — Running the Suite With No Server At All
**Research date: July 3, 2026.** Question: can open models run natively in any web browser, zero server? Answer: **yes — this is a production-grade architecture in 2026 for image, speech, audio, language, and vision tasks; native video *generation* remains the one surface that stays on GPUs.** This is the thesis Contentine Create is already built on; below is the July-2026 refresh and the "nerfed Higgsfield, browser edition" blueprint.

## 1. Platform state (what changed)
- **WebGPU ships by default across Chrome, Firefox, Edge, and Safari** as of late 2025 — ≈82.7% of global browser traffic; ~70–75% of mobile users can run it. Treat it as the primary path with a WASM/CPU fallback (3–10× slower) and a capability check + graceful degrade as non-negotiable architecture.
- FP16 shaders + DP4a packed-int8 dot products landed in Chrome — 2–3× speedups on embedding/decoding workloads.
- **WebNN** (NPU/native-accelerator access) is the next wave — real SD pipelines run on it today but still behind `chrome://flags`; watchlist, not dependency.
- Storage: model files cached once via Cache API / IndexedDB / **OPFS** (origin-private file system; newest engines stream GGUF from OPFS straight into GPU buffers, cutting the double-buffering RAM spike older stacks have).
- Doctrine that hasn't changed: inference in **Web Workers** always; download+warmup progress UX; first-run WGSL shader-compile window of 3–10 s to hide; cross-tab model sharing via SharedWorkers is emerging.

## 2. Runtimes (July-2026 tier list)
| Runtime | State | Use for |
|---|---|---|
| **Transformers.js v4** (HF, Feb 2026) | WebGPU-first; HF claims 20B-class models ~60 tok/s on capable hardware, "faster than AWS inference, in your browser"; per-component dtype control (`embed fp16 / head fp32 / default q4`) | The general workhorse: LLM, Whisper ASR, embeddings, vision, TTS pipelines |
| **WebLLM** (MLC) | OpenAI-compatible API (streaming, JSON-mode, seeds, function-calling WIP); Llama-3.1-8B q4 ≈ 41 tok/s on M3 Max (~80% of native), Phi-3.5-mini 71 tok/s; community reports 180 tok/s Qwen3.5-INT4 with tuned WGSL | Drop-in local "OpenAI endpoint" — the agent brain |
| **wllama / LlamaWeb-class engines** | llama.cpp-in-WASM+WebGPU; GGUF; OPFS-direct loading; research engine beats WebLLM/Transformers.js decode by 54–69% | Memory-constrained devices; GGUF reuse from the desktop world |
| **ONNX Runtime Web** | WebGPU EP mature (SD-Turbo **sub-second 512² on a 4090, in a tab**; SAM encoder 19× vs WASM); **on-device training support** → in-browser LoRA/personalization is now a real direction | Diffusion, segmentation, custom ONNX graphs |
| **MediaPipe LLM** (Google) | Gemma 3n E2B/E4B, multimodal (image+audio in), WebGPU-only | Lightweight multimodal; note: Google-weights |
| ffmpeg.wasm / **Mediabunny** / WebCodecs | unchanged mission | All muxing/encode/cut/caption work client-side |
Adjacent, not open-weights: Chrome's built-in **Gemini Nano** (Prompt/Summarizer APIs) — zero-download local AI to exploit opportunistically, never depend on.

### 2b. The 2026 browser model zoo (deep-dive additions, verified July 3)
**TTS:** Kokoro-82M now runs **WebGPU real-time — ~10 s of speech generated in ~1 s** — via mature `kokoro-js` (streaming API, q8/q4 dtypes, WASM fallback; ~160 MB first download, then cached). The zoo around it: **Kitten TTS** (~25M — near-instant, low-end devices), **Piper** (26 voices), **Supertonic** (5 languages), **OuteTTS-0.2-500M** (heavier, LLM-based). Create keeps Kokoro/HeadTTS as default (its viseme timestamps are load-bearing — see §6) with Kitten as the weak-device tier.
**STT:** browser speech recognition is now production-grade: quantized **whisper-large-v3-turbo-class builds transcribe at 5–8× real-time** on WebGPU with worker architecture; **Moonshine Tiny (27M)** does real-time *streaming* English ASR, faster and more accurate than same-size Whisper — the live-captioning lane. Engineering gotcha on record: transformers.js v3.8.x shipped with Whisper's suppress-tokens disabled → boundary hallucinations; verify fixed on the v4 upgrade or patch the logits processor.
**Full-local conversational pattern (proven):** Silero VAD → Whisper → SmolLM2-class LLM → Kokoro, 100% in-browser — the reference architecture for any "talk to your project" feature.
**Vision:** SmolVLM/Florence-2-class small VLMs run under Transformers.js for captioning/tagging (feeds Remix Hub auto-description).
**Music/SFX:** small MusicGen-class models run browser-side but slow; keep music as a modest lane (or Tone.js procedural) — ACE-Step-class stays in Studio.

## 3. What a browser can generate natively today — mapped to Higgsfield surfaces
| Surface | Browser-native in 2026? | Engine |
|---|---|---|
| Image gen | ✅ real | SD-Turbo / SDXL-Turbo via ONNX-Web WebGPU (1–4 steps; sub-second→seconds on dGPU; ~4 GB VRAM class); palettized-quant SD builds exist down to **~250 MB**; big 2026 models (Z-Image 6B, klein 4B) are not browser-practical yet — SD-Turbo tier is the ceiling |
| Image edit / bg removal | ✅ real | SAM + RMBG/BiRefNet-class ONNX; real-time on WebGPU |
| Script / agent / prompt-enhancer | ✅ real | 0.5–8B LLMs (Qwen, Llama-3.2, Phi) via WebLLM/Transformers.js; JSON-mode agents; WebMCP emerging for tool wiring |
| TTS / voiceover | ✅ real | **Kokoro 82M** (already proven in Contentine Create via kokoro-js/HeadTTS with viseme timestamps) |
| Voice clone | ⚠️ frontier | F5-TTS in-browser = Contentine Create's existing bet; heavy but demonstrated |
| ASR / captions | ✅ real | Whisper (Transformers.js) + Moonshine-class light models; powers a full Shorts-captioning flow client-side |
| Talking avatar / lip-sync | ✅-lite | Contentine Create's stack: TalkingHead 3D + viseme TTS; Wav2Lip-class photo lip-sync at modest res |
| Music / SFX | ⚠️ partial | Small audio models + Tone.js synthesis; ACE-Step-class = server |
| **Video generation (T2V/I2V)** | ❌ not natively | No usable open T2V runs in a tab in mid-2026 (5B+ diffusion transformers exceed tab memory/compute). Honest boundary. Nearest browser-native equivalents: **motion-graphics tier** — generate stills → Ken-Burns/parallax/keyframe animation → WebCodecs/ffmpeg.wasm encode; plus lip-synced avatar clips. True T2V = the server tier's moat. |
| Enhance / upscale | ⚠️ small only | Compact SR ONNX models fine for stills; SeedVR2-class video SR = server |

## 4. Blueprint: "Nerfed Higgsfield" — the browser edition (= Contentine Create, refreshed)
**Positioning:** one product story, two tiers sharing the same preset schema, UI shell, and brand — **Create (browser, unlimited, credit-free, private)** for everything in §3's ✅ rows; **Studio (GPU, metered)** for true video, Cinema, S2V, and heavy Enhance. Every Studio preset gets a Create "lite twin" where feasible; the upsell is native.
Surfaces the browser edition ships fully client-side: Image Studio (SD-Turbo tier, 1–4-step), Edit & bg-removal, Canvas (Layered comps client-side), Voiceover + clone (Kokoro/F5), Captions/Shorts tooling (Whisper + WebCodecs cutting + ASS burn via ffmpeg.wasm), Avatar-lite (TalkingHead/Wav2Lip), Marketing stills, Script/Agent (WebLLM, OpenAI-compatible so the same agent code targets browser or server), motion-graphics "video" (stills+animation+encode).
**Contentine Create stack refresh (upgrade list):**
1. Transformers.js → **v4** (WebGPU default, dtype maps); re-benchmark Whisper + embeddings after upgrade.
2. WebLLM current builds — adopt JSON-mode for the script agent; watch function-calling GA. Consider **wllama** as the low-RAM GGUF fallback engine on weak devices.
3. Model cache: add **OPFS** alongside IndexedDB for large shards (streaming loads, less RAM double-buffering).
4. The already-planned **device capability scanner** is now the industry-standard pattern (capability check → tier routing → server fallback); ship it as the first-run experience.
5. ONNX Runtime Web **on-device training** → roadmap item: personalize small models (style embeddings, user LoRA-lites) fully client-side.
6. Keep the boundary honest in-product: no facade "browser video gen" — the video button either runs the motion-graphics pipeline transparently labeled, or routes to Studio.

## 5. Strategic read
Every user brings their own GPU: zero marginal inference cost, total privacy, infinite horizontal scale — the economics that made Contentine Create's thesis right are now mainstream consensus, with production deployments reporting five-figure monthly inference bills cut to zero. The 2026 delta is that the platform layer caught up (four-browser WebGPU, v4-era runtimes, OPFS). The one thing the browser still cannot do — real video generation — is exactly what Contentine Studio's owned GPUs provide. The two products are one architecture with the compute dial at opposite ends.

## 6. THE 2D CARTOON THESIS — where browser-native doesn't just survive, it wins
**Claim:** for 2D cartoon / motion-graphics video, the browser edition can produce output that is *equal or superior to server generation* — because this genre removes the one thing browsers can't do (heavy generative rasterization) and plays to the one thing browsers do better than anything (deterministic vector rendering at any resolution, 60 fps, for free).

**Why the quality equation flips:**
1. **Rendering ≠ generating.** A rigged 2D scene rendered via Canvas/SVG/WebGL and encoded through WebCodecs is pixel-perfect at 1080p or 4K — zero diffusion artifacts, zero temporal flicker. Server diffusion models are *worse* at clean flat-style animation than a renderer, not better.
2. **Character consistency — the hardest unsolved problem in generative video — is free.** A rigged character is 100% identical across every scene by construction. Studio needs IP-Adapters, LoRAs, and anchoring pipelines to approximate what a puppet rig guarantees.
3. **Small-model image gen looks GOOD in this genre.** SD-Turbo's weakness is photorealism; flat/cartoon/vector-adjacent styles hide it completely. Browser image gen produces genuinely attractive cartoon backgrounds and props.
4. **Deterministic = editable.** Every element stays an object on a timeline: move the character, rewrite one line, re-voice one sentence, change the palette — no re-generation lottery. This is a capability *advantage* over generative video, not a compromise.
5. **The AI that makes it "AI video" all fits browser budgets:** WebLLM JSON-mode writes the script AND the scene plan; Kokoro voices it AND emits viseme timestamps; those same timestamps drive 2D mouth-shape swaps (Create already produces them for TalkingHead — the hardest asset is already in the stack); Whisper captions it; SD-Turbo paints the world.

**The pipeline (Create's "Cartoon Studio" surface):**
LLM (JSON scene plan: scenes → background, characters, positions, gestures, dialogue, captions, music cues) → Kokoro TTS per line with viseme timestamps → GSAP master timeline per scene (character enter/exit, gesture triggers, viseme-keyed mouth swaps, SplitText kinetic typography, multi-layer parallax backgrounds from SD-Turbo) → Canvas frame render → WebCodecs/Mediabunny → 1080p MP4. Every stage is an existing Create capability or a free library; the work is engineering, not research.

**Toolchain (all license-verified July 3, 2026):**
| Tool | License / cost | Role |
|---|---|---|
| **GSAP** (+ ALL plugins: SplitText, MorphSVG, ScrollTrigger, MotionPath, DrawSVG) | **100% free incl. commercial use since Apr 30 2025 (Webflow-backed)** — GreenSock standard no-charge license (free, not OSI; record in LICENSES.md) | The animation engine: timelines, easing, morphing, text FX |
| lottie-web / dotLottie | MIT; Lottie JSON is a spec we can **generate programmatically from LLM scene plans** | Pre-made motion assets + machine-writable animation format |
| Pixi.js / Three.js | MIT | WebGL scene rendering at scale (particles, parallax, filters) |
| Rive | runtimes open-source; **editor is commercial SaaS** — use runtime only if ever needed; don't build authoring dependence | Optional interactive-character format |
| Inochi2D / nijilive | open source (non-restrictive), the genuine Live2D alternative — but D-native runtime, VTuber-focused, thin docs, experimental web ports | Watchlist, not foundation |
| **In-house SVG puppet rigs** ⭐ | ours (the sovereign-asset move, again) | 10–20 designed characters as layered SVG: GSAP bone transforms + viseme-keyed mouth sprites + gesture library. Full control, zero license exposure, perfectly consistent |
| Live2D Cubism | proprietary — **excluded** | — |

**Market frame:** this genre is Vyond / Animaker / Powtoon / Doodly territory — explainers, whiteboard, kinetic typography, faceless-channel content — all subscription SaaS with server rendering and export limits. Create doing it **unlimited, free, private, in the browser** is a category-first, and it aligns exactly with the faceless-creator audience Create already targets as a Syllaby competitor. Honest boundary, stated in-product: cartoon camera language is 2D (pans, zooms, parallax fake-3D); cinematic photoreal remains Studio's moat — and the "Open in Studio" button sits right there.

## 7. Revised tier map (post-research)
Create ships: Cartoon Studio (flagship video surface — parity-or-better vs server) · Image (SD-Turbo tier) · Voiceover/clone · Captions/Shorts tooling · Avatar-lite · Canvas · Script/Agent · Remix Hub. Studio keeps: photoreal T2V/I2V, Cinema camera control, S2V cinematic avatars, heavy Enhance, music. One preset schema, two renderers, honest routing.

## 8. July-3 deep-sweep addendum — engine upgrades & license watchlist
**🔴 LICENSE CATCH (affects Create's current spec):** F5-TTS *code* is MIT, but the official pretrained checkpoints are **CC-BY-NC-4.0** ("due to the training data Emilia" — maintainers' own README), and the maintainer states on the record that the NC base model **cannot be used commercially even after fine-tuning**. Create's handover lists F5 voice cloning as a headline advantage — with official weights, that is a violation. XTTS v2 is equally NC (Coqui CPML; Coqui shut down Jan 2024, so no one can even sell a license).
**✅ The remedy is a checkpoint swap, not a redesign:** `mrfakename/OpenF5-TTS-Base` — same F5 architecture retrained from scratch on the CC-licensed Emilia-YODAS subset, released **Apache-2.0, explicitly commercial-OK** (alpha; English-only; currently below official-NC quality; improved variants promised). Browser runtime already proven: a working ONNX WebGPU/WASM F5 implementation exists (nsarang/voice-cloning-f5-tts, 5–10 s reference cloning fully client-side). Action: ship cloning on OpenF5 weights + record in LICENSES.md; keep official F5 strictly for internal research; re-verify OpenF5 variants at onboarding. Complementary commercial-safe voice roster: Kokoro (Apache, core), OpenVoice v2 (MIT, style/emotion transfer), Piper/Bark/StyleTTS2 (MIT), Chatterbox (MIT — reported to beat ElevenLabs in blind tests; Turbo 350M = browser-export candidate, unverified).
**Image slot:** SD-Turbo remains the verified browser workhorse; **SANA-Sprint** (1–4-step distillation, ~250 ms with ControlNet on datacenter cards; small linear-attention DiT family) is the natural next-gen candidate — *watchlist*: needs a browser/ONNX port + full license read (NVIDIA weight licenses vary) before adoption. Bonus Studio note: SANA-Video claims Wan2.1-1.3B-competitive quality at 16× lower latency — registry watchlist.
**Platform nuance for the capability scanner:** WebGPU ships in all four major browsers, but MDN still marks it "limited availability / not Baseline" (May 2026) — support is uneven at the edges, so runtime feature-detection per engine (never UA sniffing) stays mandatory, exactly as designed.
**Emotion technique confirmed as documented practice:** include the target emotion in the F5 reference clip and the model carries it through — reference-swapping is the emotion knob for cloned characters.
