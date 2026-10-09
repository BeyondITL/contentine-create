/**
 * Contentine Create — Kokoro TTS Web Worker.
 *
 * BUNDLED at build time by esbuild (scripts/setup-assets.sh) into
 * `public/workers/tts-worker.js` from THIS file — kokoro-js and
 * transformers.js ship inside the bundle. (The previous worker imported
 * kokoro-js from the jsdelivr CDN at runtime: a Law-L2 offline violation and
 * unreachable by the model storage layer.)
 *
 * Static imports are correct here: this is a standalone worker bundle, not
 * part of the Next.js static export (Law L8 applies to app chunks).
 *
 * Messages IN:
 *   { type: 'init', storage?: { mode: 'browser'|'folder', handle } }
 *   { type: 'synthesize', id, text, voiceId, speed, withVisemes? }
 *   { type: 'cancel' }
 *
 * Messages OUT:
 *   { type: 'init-progress', percent, message }
 *   { type: 'init-complete' } | { type: 'init-error', error }
 *   { type: 'audio', id, buffer: Float32Array, sampleRate, visemes? }
 *   { type: 'progress', id, percent } | { type: 'error', id, error }
 *
 * VISEME PATH (withVisemes:true — cartoon lip-sync): the base kokoro-js path
 * exposes no per-phoneme durations. When visemes are requested we lazily load the
 * TIMESTAMPED Kokoro model (same weights + a `durations` output) via a KokoroTTS
 * instance, call its transformers.js model directly (kokoro-js's own generate
 * throws `durations` away), and derive real mouth-shape stamps. Same weights ⇒
 * same audio as the base path; durations give honest timing (Law L1/L6).
 */

import { KokoroTTS } from 'kokoro-js';
import { env, Tensor } from '@huggingface/transformers';
import {
  installTransformersCache,
  seedVoicesCache,
  setStorageContextForWorker,
  type StorageMode,
} from '../lib/model-storage';
import { phonemizeForKokoro, voiceLang } from './voice/kokoro-phonemize';
import { visemeStampsFromDurations, durationsTotalSec } from './voice/kokoro-visemes';

/** Timestamped Kokoro export (per-phoneme `durations`). Same weights as base;
 *  voices/tokenizer byte-identical (verified). Catalog: `kokoro-82m-timestamped`. */
const TIMESTAMPED_REPO = 'onnx-community/Kokoro-82M-v1.0-ONNX-timestamped';
/** Voice embeddings live only in the BASE repo; kokoro-js reads them from there
 *  regardless of model repo, and the timestamped repo's voices are identical. */
const VOICE_BASE_URL = 'https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/voices';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let kokoro: any = null;
let isInitialized = false;
let isCancelled = false;

// Timestamped (viseme) pipeline — lazily initialised on first withVisemes call.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let tsKokoro: any = null;
let tsInitialized = false;
let tsStorage: StorageContext | undefined;

interface StorageContext {
  mode: StorageMode;
  handle: FileSystemDirectoryHandle | null;
}

/**
 * Initialize the Kokoro TTS engine. Model artifacts are read through the
 * model storage layer (browser cache or the user's model folder); anything
 * missing streams browser → HF CDN with loud quota errors.
 */
async function initKokoro(storage?: StorageContext) {
  tsStorage = storage; // remember for the lazy timestamped (viseme) pipeline
  if (isInitialized) return;

  try {
    self.postMessage({ type: 'init-progress', percent: 5, message: 'Loading Kokoro TTS engine...' });

    // Workers have no localStorage: the main thread hands us the storage
    // context (folder handles are structured-cloneable).
    setStorageContextForWorker(storage?.mode ?? 'browser', storage?.handle ?? null);
    installTransformersCache(env as unknown as Parameters<typeof installTransformersCache>[0]);
    // ONNX runtime WASM ships with the app (offline-capable, Law L2).
    (env as { backends: { onnx: { wasm: { wasmPaths: string } } } }).backends.onnx.wasm.wasmPaths =
      '/wasm/transformers/';

    self.postMessage({ type: 'init-progress', percent: 20, message: 'Downloading voice model (first time only)...' });

    // q8 quantization for best quality/size trade-off; WASM for compatibility.
    kokoro = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
      dtype: 'q8',
      device: 'wasm',
    });

    // kokoro-js reads voice .bin files from its own 'kokoro-voices' cache;
    // seed it from the model folder so voices work offline in folder mode.
    await seedVoicesCache('kokoro-82m');

    isInitialized = true;
    self.postMessage({ type: 'init-complete' });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    self.postMessage({ type: 'init-error', error: message });
  }
}

/**
 * Synthesize speech from text using a specific voice.
 * Returns raw PCM audio as Float32Array.
 */
async function synthesize(id: string, text: string, voiceId: string, speed: number) {
  isCancelled = false;

  if (!isInitialized || !kokoro) {
    await initKokoro();
    if (!isInitialized) {
      self.postMessage({ type: 'error', id, error: 'TTS engine failed to initialize' });
      return;
    }
  }

  try {
    self.postMessage({ type: 'progress', id, percent: 10 });

    const audio = await kokoro.generate(text, {
      voice: voiceId,
      speed: speed,
    });

    if (isCancelled) return;

    self.postMessage({ type: 'progress', id, percent: 80 });

    const audioData = audio.audio;
    const sampleRate = audio.sampling_rate || 24000;

    self.postMessage({ type: 'progress', id, percent: 100 });

    // Transfer the audio buffer (zero-copy)
    self.postMessage(
      {
        type: 'audio',
        id,
        buffer: audioData,
        sampleRate,
      },
      // @ts-expect-error — Transferable for Float32Array.buffer
      [audioData.buffer]
    );
  } catch (err) {
    if (!isCancelled) {
      const message = err instanceof Error ? err.message : String(err);
      self.postMessage({ type: 'error', id, error: message });
    }
  }
}

// ─── Timestamped (viseme) pipeline ────────────────────────────────

/** Lazily load the timestamped Kokoro model. Reuses the transformers.js cache +
 *  storage layer exactly like the base path; loads the base voice cache too
 *  (voices are shared and byte-identical). */
async function initTimestamped() {
  if (tsInitialized) return;
  setStorageContextForWorker(tsStorage?.mode ?? 'browser', tsStorage?.handle ?? null);
  installTransformersCache(env as unknown as Parameters<typeof installTransformersCache>[0]);
  (env as { backends: { onnx: { wasm: { wasmPaths: string } } } }).backends.onnx.wasm.wasmPaths =
    '/wasm/transformers/';
  tsKokoro = await KokoroTTS.from_pretrained(TIMESTAMPED_REPO, { dtype: 'q8', device: 'wasm' });
  await seedVoicesCache('kokoro-82m'); // shared voice .bin cache (base repo URLs)
  tsInitialized = true;
}

/** Load a voice style embedding (256 floats) for a given token length —
 *  mirrors kokoro-js's private voice loader: read the `[N,1,256]` .bin from the
 *  'kokoro-voices' cache (base-repo URL), slice by phoneme count. */
async function loadVoiceStyle(voiceId: string, tokenLen: number): Promise<Float32Array> {
  const url = `${VOICE_BASE_URL}/${voiceId}.bin`;
  let buf: ArrayBuffer | undefined;
  try {
    const cache = await caches.open('kokoro-voices');
    const hit = await cache.match(url);
    if (hit) buf = await hit.arrayBuffer();
    if (!buf) {
      const res = await fetch(url);
      buf = await res.arrayBuffer();
      try { await cache.put(url, new Response(buf.slice(0))); } catch { /* cache best-effort */ }
    }
  } catch {
    const res = await fetch(url);
    buf = await res.arrayBuffer();
  }
  const all = new Float32Array(buf);
  // ref_s = voices[len(phonemeTokens)]; token count excludes the 2 pad tokens.
  const offset = 256 * Math.min(Math.max(tokenLen - 2, 0), 509);
  return all.slice(offset, offset + 256);
}

/**
 * Synthesize with the timestamped model and derive real viseme stamps from the
 * model's `durations` output. Same weights ⇒ same audio as the base path.
 */
async function synthesizeTimestamped(id: string, text: string, voiceId: string, speed: number) {
  isCancelled = false;
  if (!tsInitialized) {
    try {
      await initTimestamped();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      self.postMessage({ type: 'error', id, error: `timestamped TTS init failed: ${message}` });
      return;
    }
  }

  try {
    self.postMessage({ type: 'progress', id, percent: 10 });

    const lang = voiceLang(voiceId);
    const phonemes = await phonemizeForKokoro(text, lang);
    const { input_ids } = tsKokoro.tokenizer(phonemes, { truncation: true });
    const tokenLen: number = input_ids.dims.at(-1);

    self.postMessage({ type: 'progress', id, percent: 30 });

    const style = await loadVoiceStyle(voiceId, tokenLen);
    const inputs = {
      input_ids,
      style: new Tensor('float32', style, [1, 256]),
      speed: new Tensor('float32', [speed], [1]),
    };

    const out = await tsKokoro.model(inputs);
    if (isCancelled) return;

    const waveform = out.waveform;
    const durationsOut = out.durations;
    if (!durationsOut) {
      // The whole point of this path is the durations output; refuse to emit a
      // fabricated viseme track if it is absent (Law L1 — no half-wired source).
      self.postMessage({
        type: 'error',
        id,
        error: 'timestamped Kokoro model returned no `durations` output — viseme path unavailable',
      });
      return;
    }

    const audioData: Float32Array = waveform.data;
    const sampleRate = 24000;
    const durations: number[] = Array.from(durationsOut.data as Float32Array | ArrayLike<number>, Number);

    self.postMessage({ type: 'progress', id, percent: 80 });

    // Per-token phoneme symbols (pad tokens → '' → sil). Decode each id back to
    // its char via the tokenizer so the mapping is robust to OOV drops.
    const ids: number[] = Array.from(input_ids.data as ArrayLike<number | bigint>, (v) => Number(v));
    const phonemePerToken = ids.map((tokenId) => {
      try {
        return String(tsKokoro.tokenizer.decode([tokenId], { skip_special_tokens: false }) ?? '');
      } catch {
        return '';
      }
    });

    const visemes = visemeStampsFromDurations(phonemePerToken, durations);

    // Determinism/sanity: total viseme time should track the produced audio.
    const audioSec = audioData.length / sampleRate;
    const visemeSec = durationsTotalSec(durations);
    if (Math.abs(audioSec - visemeSec) > 0.25) {
      console.warn(
        `[TTS Worker] viseme/audio duration drift: ${visemeSec.toFixed(3)}s vs ${audioSec.toFixed(3)}s`,
      );
    }

    self.postMessage({ type: 'progress', id, percent: 100 });
    self.postMessage(
      { type: 'audio', id, buffer: audioData, sampleRate, visemes },
      // @ts-expect-error — Transferable for Float32Array.buffer
      [audioData.buffer],
    );
  } catch (err) {
    if (!isCancelled) {
      const message = err instanceof Error ? err.message : String(err);
      self.postMessage({ type: 'error', id, error: message });
    }
  }
}

// Message handler
self.onmessage = (event: MessageEvent) => {
  const { type, id, text, voiceId, speed, storage, withVisemes } = event.data;

  switch (type) {
    case 'init':
      initKokoro(storage);
      break;

    case 'synthesize':
      if (withVisemes) {
        synthesizeTimestamped(id, text, voiceId || 'af_sky', speed || 1.0);
      } else {
        synthesize(id, text, voiceId || 'af_sky', speed || 1.0);
      }
      break;

    case 'cancel':
      isCancelled = true;
      break;

    default:
      console.warn('[TTS Worker] Unknown message type:', type);
  }
};
