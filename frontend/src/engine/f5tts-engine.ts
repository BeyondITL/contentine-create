'use client';

/**
 * Contentine Create — F5 voice-clone engine (Law L4 / Law L1)  [WS-5]
 *
 * STATUS: clone tier FEATURE-FLAGGED OFF pending a provenance-validated ONNX
 * export of `mrfakename/OpenF5-TTS-Base` (Apache-2.0, commercial-OK). See
 * LICENSES.md → "OpenF5 provenance".
 *
 * WHY THE REWRITE (2026-07-03): the previous implementation fabricated inference —
 * `extractFeatures` copied raw samples as if they were a mel-spectrogram and
 * `tokenize` used `charCodeAt`, neither of which the F5 graph expects. It also
 * loaded `models/f5tts/f5tts_base.onnx`, which traced to an ONNX repackage of the
 * official SWivid/F5-TTS `F5TTS_Base` checkpoint (cc-by-nc-4.0 → banned). That
 * path was a Law-L1 facade and a Law-L4 exposure and has been removed.
 *
 * Until a validated OpenF5 export is wired (repo + revision + steps + hash in
 * LICENSES.md), `isModelDownloaded()` returns false and every consumer falls
 * back to Kokoro (the clone tier is simply unavailable). `cloneAndSpeak` throws
 * rather than returning a fake buffer.
 */

import { runF5PurgeMigrationOnce } from './voice/f5-purge-migration';

/**
 * The ONLY checkpoint permitted for voice cloning (Law L4 standing pin).
 * Apache-2.0, explicit commercial-OK. Pinned revision recorded here and in
 * LICENSES.md so the source is unambiguous.
 */
export const OPENF5_MODEL_ID = 'mrfakename/OpenF5-TTS-Base';
export const OPENF5_REVISION = '28e45df3acf0595c9febf233d7d82b409708ce2c';

/**
 * Feature flag for the clone tier. Flips to true ONLY when a validated,
 * provenance-recorded browser ONNX export of OpenF5 is bundled/downloadable and
 * `VALIDATED_MODEL_SOURCE` points at it. Ships OFF (Plan of Record: miss C-M2 →
 * clone tier OFF; Kokoro + blends only).
 */
export const F5_CLONE_TIER_ENABLED = false;

/**
 * Set to the validated ONNX model source (URL or ArrayBuffer loader) once the
 * OpenF5 export exists. Null until then — no unvalidated model is ever loaded.
 */
const VALIDATED_MODEL_SOURCE: string | null = null;

/** F5 voice-clone engine. Clone tier is OFF until OpenF5 export is validated. */
export class F5TTSEngine {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private session: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private ort: any = null;
  private _initializing = false;

  /** onnxruntime-web presence — necessary but not sufficient (needs a model too). */
  async isAvailable(): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    if (!F5_CLONE_TIER_ENABLED) return false;
    try {
      const ort = await import('onnxruntime-web');
      return typeof ort.InferenceSession !== 'undefined';
    } catch {
      return false;
    }
  }

  /**
   * Whether a validated clone model is ready. Purges any quarantined F5 cache on
   * the way (Law L4). Returns false while the tier is flagged OFF — consumers
   * then fall back to Kokoro.
   */
  async isModelDownloaded(): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    // Remove any NC-licensed F5 binary a previous build may have cached.
    await runF5PurgeMigrationOnce();
    if (!F5_CLONE_TIER_ENABLED || !VALIDATED_MODEL_SOURCE) return false;
    try {
      const { assetCache } = await import('./asset-cache');
      return await assetCache.has('models', 'openf5-tts');
    } catch {
      return false;
    }
  }

  /**
   * Initialise the validated OpenF5 ONNX session. Throws while the tier is OFF —
   * there is no unvalidated model to load (Law L1: no fake init).
   */
  async init(onProgress?: (pct: number) => void): Promise<void> {
    if (!F5_CLONE_TIER_ENABLED || !VALIDATED_MODEL_SOURCE) {
      throw new Error(
        'Voice cloning is unavailable: no provenance-validated OpenF5-TTS export is wired yet (Law L4). Kokoro voices remain available.',
      );
    }
    if (this.session || this._initializing) return;
    this._initializing = true;
    try {
      onProgress?.(10);
      this.ort = await import('onnxruntime-web');
      onProgress?.(40);
      this.session = await this.ort.InferenceSession.create(VALIDATED_MODEL_SOURCE, {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all',
      });
      onProgress?.(100);
    } finally {
      this._initializing = false;
    }
  }

  /**
   * Clone a voice from a reference sample and speak text.
   * Disabled until a validated OpenF5 export + its real feature/tokenizer
   * front-end are wired. Throws instead of returning fabricated audio (Law L1).
   */
  async cloneAndSpeak(
    _referenceAudio: ArrayBuffer,
    _text: string,
    _language: string = 'en',
  ): Promise<ArrayBuffer> {
    throw new Error(
      'Voice cloning is not enabled: awaiting a provenance-validated OpenF5-TTS-Base ONNX export (Law L4). ' +
        'Use a Kokoro voice, or the Kokoro-matched fallback, instead.',
    );
  }

  destroy(): void {
    this.session?.release?.();
    this.session = null;
    this.ort = null;
  }
}

export const f5ttsEngine = new F5TTSEngine();
