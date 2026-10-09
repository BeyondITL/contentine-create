/**
 * Contentine Create — THE single model catalog (C-M2 P0 round two, operator ruling).
 *
 * Single-catalog engine-dispatch rule:
 *  - Every downloadable model is declared HERE and ONLY here.
 *  - Every entry declares the `engine` that both downloads and runs it
 *    (webllm | transformersjs | onnx-custom | kokoro-js); the model-store
 *    downloader dispatches on that field — never on ad-hoc category switches.
 *  - The device scanner recommends ONLY ids from this catalog
 *    (see `recommendForTier`); no hardcoded model-id mappings anywhere else.
 *
 * Law L2: every entry downloads browser → HuggingFace/MLC CDN directly into
 * on-device storage. The server is NEVER in the model path.
 */

export type ModelEngine = 'webllm' | 'transformersjs' | 'onnx-custom' | 'kokoro-js';
export type ModelTier = 'high' | 'medium' | 'low';
export type ModelCategory = 'llm' | 'tts' | 'image' | 'lipsync' | 'stt' | 'voiceclone';

/**
 * Bump whenever catalog ids/recommendations change shape. Cached device
 * profiles stamped with an older version are discarded, so a stale
 * localStorage profile can never resurrect removed/quarantined model ids
 * (the live "wav2lip in the Recommended strip" leak).
 */
export const CATALOG_VERSION = 2;

/**
 * File-level model Bill of Materials (Law L4 / L5 implementation standard, per
 * RECONCILED_MODEL_VERDICTS_2026-08-03 §"file-level model BOM"). Records the
 * upstream weights source + the exact conversion actually shipped, the governing
 * WEIGHTS license with its operative clause, obligations, integrity mechanism,
 * and any face-analysis dependency (InsightFace-class contamination). The
 * `scripts/check-model-bom.mjs` gate reads these; do NOT fabricate provenance —
 * anything unsourced is `UNREVIEWED` and the gate reports it (honest red > fake
 * green). Re-read at adoption time (Law L5); `reviewDate` stamps the last read.
 */
export interface ModelBOM {
  /** Upstream WEIGHTS source (the real model, not the conversion repo). */
  baseModel: { repo: string; revision?: string; license: string };
  /** The quantization/format conversion actually downloaded, if distinct. */
  conversion?: { repo: string; revision?: string; by: string; reviewed: boolean; note?: string };
  /** Governing WEIGHTS license of the shipped artifacts (SPDX id or named license). */
  primaryLicense: string;
  /** The operative clause that governs commercial use (verbatim/near-verbatim). */
  licenseClause: string;
  /** What we must do to ship legally (attribution / NOTICE / registration). */
  obligations: string[];
  /** Whether those obligations are satisfied in the product right now. */
  obligationsMet: boolean;
  /**
   * Integrity mechanism for the shipped bytes:
   *  - 'per-artifact-sha256': every artifact SHA-256-pinned in model-artifacts.ts.
   *  - 'webllm-managed': WebLLM/MLC cache-owned; provenance recorded (base+MLC
   *    repo+license) but this app does not pin per-file SHA (documented gap).
   *  - 'UNREVIEWED': provenance/hashes not established — the gate flags it.
   */
  integrity: 'per-artifact-sha256' | 'webllm-managed' | 'UNREVIEWED';
  /** Face-analysis/detector dependency (InsightFace-class), or 'none' if clean. */
  faceAnalysisDependency: string;
  /** Free-form provenance / conversion chain notes. */
  provenance: string;
  /** ISO date of the last Law-5 license read of this BOM. */
  reviewDate: string;
}

export interface CatalogEntry {
  id: string;
  name: string;
  category: ModelCategory;
  description: string;
  /** Honest total download size of the artifacts the engine actually fetches. */
  sizeBytes: number;
  vramRequiredMB: number;
  /** The engine that downloads AND runs this model (dispatch key). */
  engine: ModelEngine;
  /**
   * Engine-native model id: concrete MLC id family for webllm, HF repo id for
   * transformersjs / kokoro-js / onnx-custom.
   */
  engineModelId: string;
  /** Human-facing source repo (documentation; not fetched directly). */
  source: { primary: string; fallback?: string };
  requiredFor: string[];
  minTier: ModelTier;
  /** Device tiers for which the scanner recommends this model in its category. */
  recommendFor: ModelTier[];
  /** File-level Bill of Materials (Law L4/L5). Required — no model ships without one. */
  bom: ModelBOM;
}

/**
 * On-device image generation feature flag (Deferral rule, C-M2 P0 round two).
 * SD-Turbo weights ship under the Stability AI Community License (July 2024:
 * commercial-OK under $1M annual revenue, registration + "Powered by Stability
 * AI" attribution required) — operator go/no-go pending; the "SD-Turbo license
 * resolved" C-M2 gate closes it. Until the explicit GO, the catalog honestly
 * excludes the model: no recommendation, no download, no dead UI. The cartoon
 * flow NEVER depends on image gen (pack-styled backgrounds are the default).
 * Enable with NEXT_PUBLIC_IMAGE_GEN_ENABLED=true at build time.
 */
export const IMAGE_GEN_ENABLED = process.env.NEXT_PUBLIC_IMAGE_GEN_ENABLED === 'true';

export const SD_TURBO_ENTRY: CatalogEntry = {
  id: 'sd-turbo',
  name: 'SD Turbo',
  category: 'image',
  description: 'AI image generation for scenes, thumbnails, and backgrounds (512px, single-step). Powered by Stability AI.',
  // Honest size: text_encoder 681 MB + unet 1733 MB + vae_decoder 99 MB
  // (fp16 ONNX artifacts actually fetched by the engine; verified via HF API).
  sizeBytes: 2_513_000_000,
  vramRequiredMB: 4096,
  engine: 'onnx-custom',
  engineModelId: 'schmuell/sd-turbo-ort-web',
  source: { primary: 'https://huggingface.co/schmuell/sd-turbo-ort-web' },
  requiredFor: ['AI Images', 'Thumbnails', 'Scene Generation'],
  minTier: 'high',
  recommendFor: ['high'],
  bom: {
    baseModel: { repo: 'stabilityai/sd-turbo', license: 'Stability-AI-Community' },
    conversion: {
      repo: 'schmuell/sd-turbo-ort-web',
      revision: 'ace89b7',
      by: 'ONNX Runtime Web demo author (guschmue reference example)',
      reviewed: false,
      note: 'fp16 ONNX export. Repo bundles the OUTDATED Nov-28-2023 "Stability AI Non-Commercial Research Community License" header (mislabel); the governing license today is the Stability AI Community License on the official repo, which covers format conversions. Per-file hashes NOT pinned; file-level provenance UNREVIEWED pending operator GO.',
    },
    primaryLicense: 'Stability-AI-Community',
    licenseClause:
      'Stability AI Community License (Last Updated July 5, 2024): free commercial use for organizations with under US$1,000,000 annual revenue; requires registration at stability.ai/community-license, the Stability NOTICE text, and prominently displayed "Powered by Stability AI"; license is revocable and TERMINATES above $1M revenue; model outputs may not be used to train other foundation models.',
    obligations: [
      'Operator registers at stability.ai/community-license',
      'Prominently display "Powered by Stability AI" in the UI',
      'Ship the Stability Community NOTICE text in LICENSES.md',
      'Add the >$1M-revenue termination trigger to the ops checklist (plan SSD-1B/Z-Image swap before the cliff)',
      'Pin the conversion revision + per-artifact SHA-256 before flipping the flag ON',
    ],
    obligationsMet: false,
    integrity: 'UNREVIEWED',
    faceAnalysisDependency: 'none',
    provenance:
      'Weights: Stability AI SD-Turbo (Community License) → schmuell/sd-turbo-ort-web fp16 ONNX export (rev ace89b7). Ships ONLY behind NEXT_PUBLIC_IMAGE_GEN_ENABLED (default OFF); honestly excluded from the live catalog while off. File-level provenance + hashes UNREVIEWED until the operator GO.',
    reviewDate: '2026-08-03',
  },
};

export const MODEL_CATALOG: CatalogEntry[] = [
  {
    id: 'llama-3.2-3b',
    name: 'Llama 3.2 3B',
    category: 'llm',
    description: 'High-quality script generation, content writing, translations',
    sizeBytes: 2_000_000_000,
    vramRequiredMB: 4096,
    engine: 'webllm',
    engineModelId: 'Llama-3.2-3B-Instruct-q4f16_1-MLC',
    source: { primary: 'https://huggingface.co/mlc-ai/Llama-3.2-3B-Instruct-q4f16_1-MLC' },
    requiredFor: ['AI Writer', 'Script Generation', 'Remix Hub'],
    minTier: 'high',
    recommendFor: ['high'],
    bom: {
      baseModel: { repo: 'meta-llama/Llama-3.2-3B-Instruct', license: 'Llama-3.2-Community' },
      conversion: {
        repo: 'mlc-ai/Llama-3.2-3B-Instruct-q4f16_1-MLC',
        by: 'MLC AI',
        reviewed: true,
        note: 'Official MLC q4f16 quantization; license live-verified 2026-08-03 (RECONCILED_MODEL_VERDICTS).',
      },
      primaryLicense: 'Llama-3.2-Community',
      licenseClause:
        'Meta Llama 3.2 Community License: commercial use permitted; requires prominent "Built with Llama" attribution, passthrough of the license + NOTICE, and Acceptable Use Policy compliance; special terms apply only above 700M monthly active users (irrelevant at our scale). EU restriction applies to multimodal only — text models are unaffected.',
      obligations: [
        'Display "Built with Llama" prominently in-app — MET: <BuiltWithLlama/> in AppFooter (app-wide via AppShell) + /notices callout (R-80)',
        'Ship the Llama 3.2 Community License text + NOTICE — MET: Llama license listed on /notices (R-80)',
        'Enforce the Llama Acceptable Use Policy — passed through via the Llama Community License on /notices (license incorporates the AUP by reference) + ToS acceptable-use; ongoing enforcement is WS-9 compliance',
      ],
      obligationsMet: true,
      integrity: 'webllm-managed',
      faceAnalysisDependency: 'none',
      provenance:
        'Weights: Meta Llama 3.2 3B Instruct → MLC q4f16 build (browser-cache-owned; WebLLM verifies shard integrity from the pinned MLC repo). Per-file SHA-256 not pinned by this app (documented WebLLM-cache gap). 3B q4f16 ≈ 2.26GB exceeds the 2GB budget — opt-in quality tier only, never default.',
      reviewDate: '2026-08-03',
    },
  },
  {
    id: 'llama-3.2-1b',
    name: 'Llama 3.2 1B',
    category: 'llm',
    description: 'Good quality scripts and writing, lower GPU requirements',
    sizeBytes: 800_000_000,
    vramRequiredMB: 2048,
    engine: 'webllm',
    engineModelId: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
    source: { primary: 'https://huggingface.co/mlc-ai/Llama-3.2-1B-Instruct-q4f16_1-MLC' },
    requiredFor: ['AI Writer', 'Script Generation', 'Remix Hub'],
    minTier: 'medium',
    recommendFor: ['medium'],
    bom: {
      baseModel: { repo: 'meta-llama/Llama-3.2-1B-Instruct', license: 'Llama-3.2-Community' },
      conversion: {
        repo: 'mlc-ai/Llama-3.2-1B-Instruct-q4f16_1-MLC',
        by: 'MLC AI',
        reviewed: true,
        note: 'Official MLC q4f16 quantization; license live-verified 2026-08-03 (RECONCILED_MODEL_VERDICTS).',
      },
      primaryLicense: 'Llama-3.2-Community',
      licenseClause:
        'Meta Llama 3.2 Community License: commercial use permitted; requires prominent "Built with Llama" attribution, passthrough of the license + NOTICE, and Acceptable Use Policy compliance; special terms apply only above 700M monthly active users (irrelevant at our scale). EU restriction applies to multimodal only — text models are unaffected.',
      obligations: [
        'Display "Built with Llama" prominently in-app — MET: <BuiltWithLlama/> in AppFooter (app-wide via AppShell) + /notices callout (R-80)',
        'Ship the Llama 3.2 Community License text + NOTICE — MET: Llama license listed on /notices (R-80)',
        'Enforce the Llama Acceptable Use Policy — passed through via the Llama Community License on /notices (license incorporates the AUP by reference) + ToS acceptable-use; ongoing enforcement is WS-9 compliance',
      ],
      obligationsMet: true,
      integrity: 'webllm-managed',
      faceAnalysisDependency: 'none',
      provenance:
        'Weights: Meta Llama 3.2 1B Instruct → MLC q4f16 build (browser-cache-owned; WebLLM verifies shard integrity from the pinned MLC repo). Per-file SHA-256 not pinned by this app (documented WebLLM-cache gap). ~0.6–1.1GB depending on shader-f16.',
      reviewDate: '2026-08-03',
    },
  },
  {
    id: 'qwen-0.5b',
    name: 'Qwen 0.5B',
    category: 'llm',
    description: 'Lightweight LLM for basic content generation',
    sizeBytes: 400_000_000,
    vramRequiredMB: 1024,
    engine: 'webllm',
    engineModelId: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC',
    source: { primary: 'https://huggingface.co/mlc-ai/Qwen2.5-0.5B-Instruct-q4f16_1-MLC' },
    requiredFor: ['AI Writer (basic)'],
    minTier: 'low',
    recommendFor: ['low'],
    bom: {
      baseModel: { repo: 'Qwen/Qwen2.5-0.5B-Instruct', license: 'Apache-2.0' },
      conversion: {
        repo: 'mlc-ai/Qwen2.5-0.5B-Instruct-q4f16_1-MLC',
        by: 'MLC AI',
        reviewed: true,
        note: 'Official MLC q4f16 quantization; Apache-2.0 live-verified 2026-08-03 (RECONCILED_MODEL_VERDICTS).',
      },
      primaryLicense: 'Apache-2.0',
      licenseClause: 'Apache License 2.0: commercial use, modification, and distribution permitted; retain LICENSE + NOTICE. No branding or user-count restrictions.',
      obligations: ['Retain the Apache-2.0 LICENSE/NOTICE'],
      obligationsMet: true,
      integrity: 'webllm-managed',
      faceAnalysisDependency: 'none',
      provenance:
        'Weights: Qwen2.5-0.5B-Instruct (Apache-2.0) → MLC q4f16 build; browser-cache-owned, WebLLM verifies shard integrity from the pinned MLC repo; per-file SHA-256 not pinned by this app (documented WebLLM-cache gap).',
      reviewDate: '2026-08-03',
    },
  },
  {
    id: 'kokoro-82m',
    name: 'Kokoro TTS',
    category: 'tts',
    description: 'Text-to-speech with 54+ voices and viseme lip-sync data',
    // Honest size: q8 ONNX 92.4 MB + all 54 voice files + tokenizer/config
    // (sum of the artifact manifest — model-artifacts.ts).
    sizeBytes: 121_090_018,
    vramRequiredMB: 200,
    engine: 'kokoro-js',
    engineModelId: 'onnx-community/Kokoro-82M-v1.0-ONNX',
    source: { primary: 'https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX' },
    requiredFor: ['Voice Studio', 'Video TTS', 'Avatar Lip-Sync'],
    minTier: 'low',
    recommendFor: ['high', 'medium', 'low'],
    bom: {
      baseModel: { repo: 'hexgrad/Kokoro-82M', license: 'Apache-2.0' },
      conversion: {
        repo: 'onnx-community/Kokoro-82M-v1.0-ONNX',
        revision: '1939ad2a8e416c0acfeecc08a694d14ef25f2231',
        by: 'onnx-community',
        reviewed: true,
        note: 'Reputable community ONNX port; every artifact SHA-256-pinned in model-artifacts.ts at this revision.',
      },
      primaryLicense: 'Apache-2.0',
      licenseClause: 'Apache License 2.0: commercial use permitted; retain LICENSE + NOTICE. Covers the 82M weights and all 54 voice embeddings.',
      obligations: ['Retain the Apache-2.0 LICENSE/NOTICE for the Kokoro weights and voice packs'],
      obligationsMet: true,
      integrity: 'per-artifact-sha256',
      faceAnalysisDependency: 'none',
      provenance:
        'Weights: hexgrad Kokoro-82M (Apache-2.0), 54 voice embeddings same license → onnx-community ONNX port (revision pinned). All 57 artifacts SHA-256-verified on download (model-artifacts.ts).',
      reviewDate: '2026-08-03',
    },
  },
  {
    id: 'kokoro-82m-timestamped',
    name: 'Kokoro TTS (timestamped)',
    category: 'tts',
    description: 'Kokoro TTS with a per-phoneme durations output — drives real cartoon lip-sync (phoneme-accurate visemes).',
    // Honest size: q8 ONNX 92.36 MB (differs from base) + 55 voices + tokenizer/config
    // (sum of the artifact manifest — model-artifacts.ts).
    sizeBytes: 121_089_957,
    vramRequiredMB: 200,
    // kokoro-family artifact layout ⇒ downloaded/verified by the manifest path
    // exactly like base Kokoro. Runtime consumption is WS-5's timestamped worker
    // path (reads the `durations` output kokoro-js discards), not generic generate.
    engine: 'kokoro-js',
    engineModelId: 'onnx-community/Kokoro-82M-v1.0-ONNX-timestamped',
    source: { primary: 'https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX-timestamped' },
    requiredFor: ['Cartoon Lip-Sync (phoneme-accurate)'],
    minTier: 'low',
    // Not a device-tier default (base Kokoro is the recommended TTS); downloaded
    // on demand by the cartoon voice-take path.
    recommendFor: [],
    bom: {
      baseModel: { repo: 'hexgrad/Kokoro-82M', license: 'Apache-2.0' },
      conversion: {
        repo: 'onnx-community/Kokoro-82M-v1.0-ONNX-timestamped',
        revision: 'dd4401a9add81ac692d20e240d22ec9dda82cc29',
        by: 'onnx-community',
        reviewed: true,
        note: 'Timestamped ONNX port — adds a per-phoneme `durations` graph output (verified 2026-08-03). model_quantized.onnx is SHA-256-pinned; tokenizer.json/tokenizer_config.json/config.json and all 55 voice .bin are BYTE-IDENTICAL to the base v1.0 ONNX port (sha256 + LFS-oid parity checked).',
      },
      primaryLicense: 'Apache-2.0',
      licenseClause: 'Apache License 2.0: commercial use permitted; retain LICENSE + NOTICE. Covers the 82M weights and all 55 voice embeddings.',
      obligations: ['Retain the Apache-2.0 LICENSE/NOTICE for the Kokoro weights and voice packs'],
      obligationsMet: true,
      integrity: 'per-artifact-sha256',
      faceAnalysisDependency: 'none',
      provenance:
        'Weights: hexgrad Kokoro-82M (Apache-2.0) → onnx-community timestamped ONNX port (revision pinned). Same weights as the base v1.0 port plus a `durations` output for lip-sync; 59 artifacts SHA-256-verified on download (only model_quantized.onnx differs from base — 92,361,055 B, sha256 c0c02b32…; tokenizer/config/55 voices identical).',
      reviewDate: '2026-08-03',
    },
  },
  // ── LAW L4 QUARANTINE (2026-07-03, operator ruling — see LICENSES.md) ──
  // F5-TTS official checkpoints are CC-BY-NC-4.0 → banned from production.
  // No catalog entry until WS-5 delivers a provenance-verified export of
  // `mrfakename/OpenF5-TTS-Base` (Apache-2.0) with repo, revision, steps and
  // hash recorded in LICENSES.md. Until then: clone tier feature-flagged OFF.
  {
    id: 'whisper-tiny',
    name: 'Whisper Tiny',
    category: 'stt',
    description: 'Fast speech-to-text for auto-captions and video translation',
    // Honest size: sum of the artifact manifest (q8 encoder + merged decoder + configs).
    sizeBytes: 43_622_127,
    vramRequiredMB: 100,
    engine: 'transformersjs',
    engineModelId: 'Xenova/whisper-tiny',
    source: { primary: 'https://huggingface.co/Xenova/whisper-tiny' },
    requiredFor: ['Auto-Captions', 'Video Translation'],
    minTier: 'low',
    recommendFor: ['medium', 'low'],
    bom: {
      baseModel: { repo: 'openai/whisper-tiny', license: 'MIT' },
      conversion: {
        repo: 'Xenova/whisper-tiny',
        revision: '5332fcc35e32a33b86612b9a57a89be7906102b1',
        by: 'Xenova (transformers.js)',
        reviewed: true,
        note: 'Reputable transformers.js ONNX port; artifacts SHA-256-pinned in model-artifacts.ts at this revision.',
      },
      primaryLicense: 'MIT',
      licenseClause: 'MIT License: unrestricted commercial use, modification, and distribution; retain the copyright notice.',
      obligations: ['Retain the MIT copyright notice'],
      obligationsMet: true,
      integrity: 'per-artifact-sha256',
      faceAnalysisDependency: 'none',
      provenance:
        'Weights: OpenAI Whisper tiny (MIT) → Xenova quantized ONNX port (revision pinned). All artifacts SHA-256-verified on download (model-artifacts.ts).',
      reviewDate: '2026-08-03',
    },
  },
  {
    id: 'whisper-base',
    name: 'Whisper Base',
    category: 'stt',
    description: 'Higher accuracy speech-to-text for captions and transcription',
    // Honest size: sum of the artifact manifest (q8 encoder + merged decoder + configs).
    sizeBytes: 79_664_191,
    vramRequiredMB: 200,
    engine: 'transformersjs',
    engineModelId: 'onnx-community/whisper-base',
    source: { primary: 'https://huggingface.co/onnx-community/whisper-base' },
    requiredFor: ['Auto-Captions (better)'],
    minTier: 'medium',
    recommendFor: ['high'],
    bom: {
      baseModel: { repo: 'openai/whisper-base', license: 'MIT' },
      conversion: {
        repo: 'onnx-community/whisper-base',
        revision: '1846881b6b3a3024392c1eea3ad983695bc23925',
        by: 'onnx-community',
        reviewed: true,
        note: 'Reputable community ONNX port; artifacts SHA-256-pinned in model-artifacts.ts at this revision.',
      },
      primaryLicense: 'MIT',
      licenseClause: 'MIT License: unrestricted commercial use, modification, and distribution; retain the copyright notice.',
      obligations: ['Retain the MIT copyright notice'],
      obligationsMet: true,
      integrity: 'per-artifact-sha256',
      faceAnalysisDependency: 'none',
      provenance:
        'Weights: OpenAI Whisper base (MIT) → onnx-community quantized ONNX port (revision pinned). All artifacts SHA-256-verified on download (model-artifacts.ts).',
      reviewDate: '2026-08-03',
    },
  },
  ...(IMAGE_GEN_ENABLED ? [SD_TURBO_ENTRY] : []),
  // ── LAW L4 QUARANTINE (2026-07-03, operator ruling — Amendment 2) ──
  // Upstream Wav2Lip license is NON-COMMERCIAL RESEARCH → no catalog entry.
  // WS-5 owns finding a commercially-clean photo lip-sync path (deadline
  // C-M3, else the photo-avatar tier ships feature-flagged OFF). The MIT
  // TalkingHead 3D avatar path is unaffected and remains live.
];

/** Look up a catalog entry by id. */
export function catalogEntry(id: string): CatalogEntry | undefined {
  return MODEL_CATALOG.find((m) => m.id === id);
}

/** True iff `id` is a current production catalog id. */
export function isCatalogId(id: string | null | undefined): boolean {
  return !!id && MODEL_CATALOG.some((m) => m.id === id);
}

export interface RecommendedModels {
  llm: string | null;
  tts: string | null;
  imageGen: string | null;
  lipSync: string | null;
  stt: string | null;
}

/**
 * Per-tier recommendations, derived from the catalog and nothing else
 * (single-catalog rule). A category with no matching entry — e.g. lip-sync
 * while Wav2Lip is quarantined — is honestly null; the UI shows its own
 * "coming later" copy, never a banned model id.
 */
export function recommendForTier(tier: ModelTier | 'unsupported'): RecommendedModels {
  const pick = (category: ModelCategory): string | null =>
    tier === 'unsupported'
      ? null
      : MODEL_CATALOG.find((m) => m.category === category && m.recommendFor.includes(tier))?.id ?? null;
  return {
    llm: pick('llm'),
    tts: pick('tts'),
    imageGen: pick('image'),
    lipSync: pick('lipsync'),
    stt: pick('stt'),
  };
}
