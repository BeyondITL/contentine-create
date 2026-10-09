/**
 * Contentine Create — per-feature required-models manifest (WS-1, R1 / SA-05).
 *
 * Single source of truth for the on-device models a feature needs before its
 * browser-native path can run. Ids match the model-store catalog
 * (`lib/model-catalog.ts`). `useModelReadiness` + `ModelRequirements` read this
 * so any feature page can turn "you need model X" into a real "Download <model>"
 * CTA at point of use instead of failing silently on a fresh profile.
 *
 * Honesty rules baked into this map (R1 operator-approved per-page audit):
 *  - Only the PRIMARY on-device model per feature is listed. Lighter fallbacks
 *    (e.g. qwen-0.5b for the LLM features) are alternatives the engine may pick,
 *    NOT extra required downloads — listing them would force-download two LLMs.
 *  - llama-3.2-3b is catalog-defined but wired into no feature path, so it is
 *    declared for NO feature here.
 *  - Features whose server has a real fallback (script gen, translation copy)
 *    only list the models the BROWSER path needs; the banner informs+offers,
 *    it never hard-blocks those pages (the page content renders beneath it).
 *  - Cartoon captions are burned in from known dialogue by the render engine —
 *    they do NOT use Whisper — so the cartoon flow needs only llama + kokoro.
 *    The `captions` entry is for the separate auto-caption/translation surface.
 *  - Thumbnails need SD-Turbo ONLY when image-gen is enabled at build time;
 *    when the flag is off SD-Turbo isn't in the catalog, so the feature has no
 *    required model and `ModelRequirements` renders nothing for it.
 *  - /converter is intentionally absent: it is pure WebCodecs/muxing with no
 *    on-device model, so it declares no requirement and shows no banner.
 */

import { IMAGE_GEN_ENABLED } from '@/lib/model-catalog';

export type FeatureKey =
  | 'cartoon-script'   // /cartoon step 1 — on-device WebLLM script drafting
  | 'cartoon-render'   // /cartoon render — Kokoro voice synthesis
  | 'writer'           // /writer — AI Writer (WebLLM)
  | 'video-create'     // /video/create — Kokoro TTS for the video voiceover
  | 'voices'           // /voices — Voice Studio (Kokoro)
  | 'translate'        // /translate — Whisper STT + Kokoro TTS
  | 'remix'            // /remix — Remix Hub script/card generation (WebLLM)
  | 'thumbnails'       // /thumbnails — SD-Turbo image gen (flag-gated)
  | 'avatar'           // /create/avatar + /avatar-editor — Kokoro voice
  | 'captions';        // auto-captions / translation surface (Whisper)

export const FEATURE_MODELS: Record<FeatureKey, string[]> = {
  'cartoon-script': ['llama-3.2-1b'],            // on-device WebLLM script drafting
  'cartoon-render': ['kokoro-82m'],              // voice synthesis for the render
  'writer': ['llama-3.2-1b'],                    // AI Writer on-device drafting (WebLLM)
  'video-create': ['kokoro-82m'],                // TTS voiceover; script gen is backend
  'voices': ['kokoro-82m'],                      // Voice Studio synthesis
  'translate': ['whisper-tiny', 'kokoro-82m'],   // STT transcribe + TTS re-voice
  'remix': ['llama-3.2-1b'],                     // remix card/script generation (WebLLM)
  'thumbnails': IMAGE_GEN_ENABLED ? ['sd-turbo'] : [], // image gen only when flag on
  'avatar': ['kokoro-82m'],                      // talking-head voice; lip-sync path separate
  'captions': ['whisper-tiny'],                  // auto-captions / translation (not cartoon)
};
