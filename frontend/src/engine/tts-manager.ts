/**
 * Contentine Create — TTS Manager
 * Main-thread wrapper for the Kokoro TTS Web Worker.
 * Provides a Promise-based API for speech synthesis.
 */

import type { KokoroVisemeStamp } from './voice/kokoro-visemes';

export interface TTSResult {
  buffer: Float32Array;
  sampleRate: number;
  /**
   * Real per-phoneme mouth-shape stamps from the timestamped Kokoro model,
   * present ONLY when synthesised with `{ withVisemes: true }`. Structurally
   * identical to the cartoon engine's `VisemeStamp` ({ time, value }), so it
   * plugs straight into voice-takes and tts-line. Absent ⇒ consumers fall back
   * (text-estimate stamps / forced alignment).
   */
  visemes?: KokoroVisemeStamp[];
}

export interface TTSProgress {
  percent: number;
  message?: string;
}

type ProgressCallback = (progress: TTSProgress) => void;

let worker: Worker | null = null;
let isReady = false;
const pendingCallbacks = new Map<
  string,
  {
    resolve: (result: TTSResult) => void;
    reject: (error: Error) => void;
    onProgress?: ProgressCallback;
  }
>();

let initResolve: (() => void) | null = null;
let initReject: ((err: Error) => void) | null = null;
let initProgressCallback: ProgressCallback | null = null;

/** Start the TTS Web Worker. */
function ensureWorker(): Worker {
  if (worker) return worker;

  // Load the TTS worker at runtime. The worker dynamically imports kokoro-js
  // which includes onnxruntime-web WASM. We use a string path instead of
  // new URL('./tts-worker.ts', import.meta.url) to prevent webpack from
  // bundling the worker and its kokoro-js dependency tree at build time.
  worker = new Worker('/workers/tts-worker.js', { type: 'module' });

  worker.onmessage = (event: MessageEvent) => {
    const { type, id } = event.data;

    switch (type) {
      case 'init-progress':
        initProgressCallback?.({
          percent: event.data.percent,
          message: event.data.message,
        });
        break;

      case 'init-complete':
        isReady = true;
        initResolve?.();
        initResolve = null;
        initReject = null;
        break;

      case 'init-error':
        initReject?.(new Error(event.data.error));
        initResolve = null;
        initReject = null;
        break;

      case 'audio': {
        const cb = pendingCallbacks.get(id);
        if (cb) {
          cb.resolve({
            buffer: event.data.buffer,
            sampleRate: event.data.sampleRate,
            visemes: event.data.visemes,
          });
          pendingCallbacks.delete(id);
        }
        break;
      }

      case 'progress': {
        const cb2 = pendingCallbacks.get(id);
        cb2?.onProgress?.({ percent: event.data.percent });
        break;
      }

      case 'error': {
        const cb3 = pendingCallbacks.get(id);
        if (cb3) {
          cb3.reject(new Error(event.data.error));
          pendingCallbacks.delete(id);
        }
        break;
      }
    }
  };

  worker.onerror = (err) => {
    console.error('[TTS Manager] Worker error:', err);
    initReject?.(new Error('TTS Worker crashed'));
  };

  return worker;
}

/** Unique ID generator for TTS requests. */
let idCounter = 0;
function nextId(): string {
  return `tts_${++idCounter}_${Date.now()}`;
}

// ─── Public API ───────────────────────────────────────────────

export const ttsManager = {
  /**
   * Initialize the TTS engine. Downloads model on first call (~87MB).
   * Shows progress via the callback. Resolves when ready.
   */
  async init(onProgress?: ProgressCallback): Promise<void> {
    if (isReady) return;

    const w = ensureWorker();
    initProgressCallback = onProgress || null;

    // Workers can't read localStorage or the persisted folder handle — hand
    // them the storage context (directory handles are structured-cloneable).
    const { getStorageMode, getFolderHandle, ensureModelSeeded } = await import('@/lib/model-storage');
    const mode = getStorageMode();
    const handle = mode === 'folder' ? await getFolderHandle() : null;

    // Cache-eviction preflight (SA-21/R-94): the browser cache is the only model
    // store and can be evicted (quota/incognito) while /models still shows READY.
    // Verify the main artifacts AND the distinct kokoro-voices cache, restoring
    // any missing delta BEFORE the worker loads kokoro — re-seed from folder when
    // the bytes are local, else re-fetch with a visible "restoring voices" state.
    // Never let kokoro-js hit a voice-not-found at synth time. A genuinely
    // unrecoverable miss (offline + evicted + no local copy) throws honestly.
    await ensureModelSeeded('kokoro-82m', (p) => {
      const pct = p.total > 0 ? Math.round((p.loaded / p.total) * 100) : 0;
      initProgressCallback?.({
        percent: pct,
        message: p.phase === 'refetch' ? 'Restoring voice model…' : 'Restoring voices…',
      });
    });

    return new Promise<void>((resolve, reject) => {
      initResolve = resolve;
      initReject = reject;
      w.postMessage({ type: 'init', storage: { mode, handle } });
    });
  },

  /** Check if the TTS engine is initialized and ready. */
  get isReady(): boolean {
    return isReady;
  },

  /**
   * Synthesize speech from text.
   * @param text — The narration text to speak.
   * @param voiceId — Kokoro voice ID (e.g., 'af_sky', 'am_adam').
   * @param speed — Playback speed multiplier (0.75 – 1.5).
   * @param onProgress — Optional progress callback.
   * @param opts — `withVisemes:true` routes to the timestamped Kokoro model and
   *   returns real per-phoneme viseme stamps on the result (same audio, extra
   *   `durations` output). Lazily downloads the timestamped model on first use.
   * @returns PCM audio data, sample rate, and (when requested) viseme stamps.
   */
  async synthesize(
    text: string,
    voiceId: string = 'af_sky',
    speed: number = 1.0,
    onProgress?: ProgressCallback,
    opts?: { withVisemes?: boolean }
  ): Promise<TTSResult> {
    const w = ensureWorker();

    // Auto-init if needed
    if (!isReady) {
      await this.init(onProgress);
    }

    const id = nextId();

    return new Promise<TTSResult>((resolve, reject) => {
      pendingCallbacks.set(id, { resolve, reject, onProgress });
      w.postMessage({ type: 'synthesize', id, text, voiceId, speed, withVisemes: opts?.withVisemes === true });
    });
  },

  /**
   * Synthesize all scenes in a script sequentially.
   * Returns an array of TTSResults in scene order.
   */
  async synthesizeAll(
    scenes: { id: string; narration: string }[],
    voiceId: string = 'af_sky',
    speed: number = 1.0,
    onProgress?: (sceneIndex: number, totalScenes: number) => void
  ): Promise<Map<string, TTSResult>> {
    const results = new Map<string, TTSResult>();

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      if (!scene.narration.trim()) continue;

      onProgress?.(i, scenes.length);
      const result = await this.synthesize(scene.narration, voiceId, speed);
      results.set(scene.id, result);
    }

    return results;
  },

  /** Cancel the current synthesis. */
  cancel(): void {
    worker?.postMessage({ type: 'cancel' });
    // Reject all pending
    for (const [id, cb] of pendingCallbacks) {
      cb.reject(new Error('Synthesis cancelled'));
    }
    pendingCallbacks.clear();
  },

  /** Terminate the worker. Call when navigating away. */
  terminate(): void {
    worker?.terminate();
    worker = null;
    isReady = false;
    pendingCallbacks.clear();
  },

  /**
   * Convert Float32Array PCM to WAV blob for playback/download.
   */
  pcmToWav(pcm: Float32Array, sampleRate: number): Blob {
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);
    const dataSize = pcm.length * (bitsPerSample / 8);

    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    // WAV header
    const writeStr = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };

    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true); // subchunk1 size
    view.setUint16(20, 1, true); // PCM format
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    writeStr(36, 'data');
    view.setUint32(40, dataSize, true);

    // Convert float PCM to int16
    let offset = 44;
    for (let i = 0; i < pcm.length; i++) {
      const s = Math.max(-1, Math.min(1, pcm[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      offset += 2;
    }

    return new Blob([buffer], { type: 'audio/wav' });
  },
};
