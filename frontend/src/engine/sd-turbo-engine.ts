/**
 * SD-Turbo browser image generation — REAL onnxruntime-web WebGPU pipeline
 * (catalog engine: 'onnx-custom').
 *
 * Port of the ONNX Runtime sd-turbo WebGPU example (guschmue/ort-webgpu) for
 * the `schmuell/sd-turbo-ort-web` fp16 export: CLIP text encoder → single-step
 * UNet (timestep 999) → minimal EulerA step → VAE decoder. Transformers.js is
 * used ONLY for the CLIP tokenizer — transformers.js has NO 'text-to-image'
 * pipeline task; the previous version of this file called
 * `pipeline('text-to-image')` and was the live "Unsupported pipeline:
 * text-to-image" failure (C-M2 P0 round two).
 *
 * Law L2: artifacts stream browser → HuggingFace CDN into Cache Storage
 * (cache name below) — the server is never in the model path. Download and
 * cache-verification read the exact same cache the inference path loads from.
 * Law L6: `generateImage` accepts a seed; the same seed yields the same
 * latents (mulberry32 + Box-Muller), so projects can seed-lock SD-Turbo assets.
 */

const HF_BASE = 'https://huggingface.co/schmuell/sd-turbo-ort-web/resolve/main';
const CACHE_NAME = 'sd-turbo-models';

/** Artifacts actually fetched, with honest sizes (HF API, 2026-07-05) for progress weighting. */
const MODEL_FILES = [
  { key: 'text_encoder', path: 'text_encoder/model.onnx', sizeBytes: 681_400_000 },
  { key: 'unet', path: 'unet/model.onnx', sizeBytes: 1_733_400_000 },
  { key: 'vae_decoder', path: 'vae_decoder/model.onnx', sizeBytes: 99_100_000 },
] as const;

type FileKey = (typeof MODEL_FILES)[number]['key'];

// Scheduler constants from the reference implementation (1-step sd-turbo).
const SIGMA = 14.6146;
const VAE_SCALING_FACTOR = 0.18215;
const LATENT_SHAPE: number[] = [1, 4, 64, 64]; // 512×512 output

/** Deterministic PRNG (mulberry32) → Box-Muller gaussian, for seed-locked latents (L6). */
function seededRandn(size: number, seed: number, scale: number): Float32Array {
  let a = seed >>> 0;
  const rand = () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const data = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    // Box-Muller; clamp u away from 0 to avoid log(0).
    const u = Math.max(rand(), 1e-12);
    const v = rand();
    data[i] = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * scale;
  }
  return data;
}

class SDTurboEngine {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private ort: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private sessions: Partial<Record<FileKey, any>> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private tokenizer: any = null;
  private loading = false;
  private onProgress: ((progress: { text: string; progress: number }) => void) | null = null;

  /** HuggingFace repo the artifacts come from (catalog engineModelId). */
  static readonly MODEL_ID = 'schmuell/sd-turbo-ort-web';

  setProgressCallback(cb: (progress: { text: string; progress: number }) => void): void {
    this.onProgress = cb;
  }

  private report(text: string, progress: number, extra?: (fraction: number) => void): void {
    this.onProgress?.({ text, progress });
    extra?.(progress);
  }

  /** All three model artifacts present in Cache Storage — the honest cache check. */
  async isCached(): Promise<boolean> {
    try {
      const cache = await caches.open(CACHE_NAME);
      for (const f of MODEL_FILES) {
        if (!(await cache.match(`${HF_BASE}/${f.path}`))) return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  /** Remove all cached artifacts. */
  async deleteCache(): Promise<void> {
    try {
      const cache = await caches.open(CACHE_NAME);
      for (const f of MODEL_FILES) {
        await cache.delete(`${HF_BASE}/${f.path}`);
      }
    } catch { /* cache unavailable — nothing to delete */ }
  }

  /**
   * Download the model artifacts (browser → HF CDN → Cache Storage) with real
   * byte-level progress. Abortable via `signal`. Does NOT create GPU sessions —
   * the model store calls this for the download state machine; sessions are
   * created lazily on first generate.
   */
  async download(onProgress?: (fraction: number) => void, signal?: AbortSignal): Promise<void> {
    const cache = await caches.open(CACHE_NAME);
    const totalBytes = MODEL_FILES.reduce((s, f) => s + f.sizeBytes, 0);
    let doneBytes = 0;

    for (const f of MODEL_FILES) {
      const url = `${HF_BASE}/${f.path}`;
      if (await cache.match(url)) {
        doneBytes += f.sizeBytes;
        this.report(`${f.key} cached`, doneBytes / totalBytes, onProgress);
        continue;
      }
      const res = await fetch(url, { signal });
      if (!res.ok || !res.body) {
        throw new Error(`SD-Turbo ${f.path}: CDN responded ${res.status} ${res.statusText}`);
      }
      const contentLength = Number(res.headers.get('content-length')) || f.sizeBytes;
      const reader = res.body.getReader();
      const chunks: BlobPart[] = [];
      let received = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.byteLength;
        this.report(
          `Downloading ${f.key}…`,
          (doneBytes + Math.min(received, contentLength)) / totalBytes,
          onProgress,
        );
      }
      await cache.put(url, new Response(new Blob(chunks), {
        headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(received) },
      }));
      doneBytes += f.sizeBytes;
      this.report(`${f.key} done`, doneBytes / totalBytes, onProgress);
    }
  }

  /**
   * Ensure artifacts are downloaded and WebGPU inference sessions are created.
   * Session options mirror the ONNX Runtime reference example (fp16 models).
   */
  async initialize(onProgress?: (fraction: number) => void): Promise<void> {
    if (this.sessions.unet && this.sessions.text_encoder && this.sessions.vae_decoder) return;
    if (this.loading) {
      await new Promise<void>((resolve) => {
        const check = () => { if (!this.loading) resolve(); else setTimeout(check, 250); };
        check();
      });
      return;
    }
    this.loading = true;
    try {
      if (!(await this.isAvailable())) {
        throw new Error(
          'Image generation needs WebGPU with the shader-f16 feature (Chrome/Edge on a recent GPU). ' +
          'This device or browser does not expose it.',
        );
      }
      await this.download(onProgress);

      // Shared-ceiling devices: release other heavy GPU engines first (LRU).
      const { reserveGpuBudget } = await import('./memory-budgeter');
      await reserveGpuBudget('sd-turbo');

      const ort = await import('onnxruntime-web');
      this.ort = ort;
      ort.env.wasm.wasmPaths = '/wasm/ort/';
      ort.env.wasm.numThreads = 1;

      const baseOpt = {
        executionProviders: ['webgpu'],
        enableMemPattern: false,
        enableCpuMemArena: false,
        extra: {
          session: {
            disable_prepacking: '1',
            use_device_allocator_for_initializers: '1',
            use_ort_model_bytes_directly: '1',
            use_ort_model_bytes_for_initializers: '1',
          },
        },
      };
      const perModelOpt: Record<FileKey, object> = {
        text_encoder: {
          freeDimensionOverrides: { batch_size: 1 },
          preferredOutputLocation: { last_hidden_state: 'gpu-buffer' },
        },
        unet: {
          freeDimensionOverrides: { batch_size: 1, num_channels: 4, height: 64, width: 64, sequence_length: 77 },
        },
        vae_decoder: {
          freeDimensionOverrides: { batch_size: 1, num_channels_latent: 4, height_latent: 64, width_latent: 64 },
        },
      };

      const cache = await caches.open(CACHE_NAME);
      for (const f of MODEL_FILES) {
        this.report(`Preparing ${f.key} (GPU)…`, 1, onProgress);
        const match = await cache.match(`${HF_BASE}/${f.path}`);
        if (!match) throw new Error(`SD-Turbo ${f.path} missing from cache after download`);
        const bytes = await match.arrayBuffer();
        this.sessions[f.key] = await ort.InferenceSession.create(bytes, {
          ...baseOpt,
          ...perModelOpt[f.key],
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);
      }

      // CLIP tokenizer only — no transformers.js *pipeline* is involved.
      const { AutoTokenizer } = await import('@huggingface/transformers');
      this.tokenizer = await AutoTokenizer.from_pretrained('Xenova/clip-vit-base-patch16');
      this.tokenizer.pad_token_id = 0;
    } finally {
      this.loading = false;
    }
  }

  /**
   * Generate an image. Native output is 512×512 (session dims are pinned per
   * the reference example); other aspect ratios are center-cropped from it.
   * Pass `seed` to seed-lock the output (Law L6).
   */
  async generateImage(
    prompt: string,
    options?: { width?: number; height?: number; steps?: number; seed?: number },
  ): Promise<Blob> {
    await this.initialize();
    const ort = this.ort;

    const { input_ids } = await this.tokenizer(prompt, {
      padding: true, max_length: 77, truncation: true, return_tensor: false,
    });

    const { last_hidden_state } = await this.sessions.text_encoder.run({
      input_ids: new ort.Tensor('int32', Int32Array.from(input_ids.map((x: number | bigint) => Number(x))), [1, input_ids.length]),
    });

    try {
      const seed = options?.seed ?? Math.floor(Math.random() * 0xffffffff);
      const size = LATENT_SHAPE.reduce((a, b) => a * b, 1);
      const latentData = seededRandn(size, seed, SIGMA);
      const latent = new ort.Tensor(latentData, LATENT_SHAPE);

      // scale_model_inputs
      const divi = (SIGMA ** 2 + 1) ** 0.5;
      const scaled = new Float32Array(size);
      for (let i = 0; i < size; i++) scaled[i] = latentData[i] / divi;

      const { out_sample } = await this.sessions.unet.run({
        sample: new ort.Tensor(scaled, LATENT_SHAPE),
        timestep: new ort.Tensor('int64', [999n], [1]),
        encoder_hidden_states: last_hidden_state,
      });

      // Minimal EulerA step (1-step; gamma = 0), folded with VAE scaling —
      // algebraically prev_sample = pred_original_sample / vae_scaling_factor.
      const denoised = new Float32Array(size);
      for (let i = 0; i < size; i++) {
        denoised[i] = (latent.data[i] - SIGMA * out_sample.data[i]) / VAE_SCALING_FACTOR;
      }

      const { sample } = await this.sessions.vae_decoder.run({
        latent_sample: new ort.Tensor(denoised, LATENT_SHAPE),
      });

      return await this.tensorToBlob(sample, options?.width ?? 512, options?.height ?? 512);
    } finally {
      last_hidden_state.dispose?.();
    }
  }

  /** NCHW [1,3,512,512] float [-1,1] → PNG blob, center-cropped to width×height. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async tensorToBlob(sample: any, width: number, height: number): Promise<Blob> {
    const d = sample.data as Float32Array;
    const S = 512;
    const px = new Uint8ClampedArray(S * S * 4);
    const plane = S * S;
    for (let i = 0; i < plane; i++) {
      const r = Math.min(Math.max(d[i] / 2 + 0.5, 0), 1);
      const g = Math.min(Math.max(d[plane + i] / 2 + 0.5, 0), 1);
      const b = Math.min(Math.max(d[2 * plane + i] / 2 + 0.5, 0), 1);
      px[i * 4] = r * 255; px[i * 4 + 1] = g * 255; px[i * 4 + 2] = b * 255; px[i * 4 + 3] = 255;
    }
    const full = new OffscreenCanvas(S, S);
    full.getContext('2d')!.putImageData(new ImageData(px, S, S), 0, 0);
    if (width === S && height === S) return full.convertToBlob({ type: 'image/png' });

    // Center-crop to the requested aspect, then scale to requested size.
    const targetAspect = width / height;
    const cropW = targetAspect >= 1 ? S : Math.round(S * targetAspect);
    const cropH = targetAspect >= 1 ? Math.round(S / targetAspect) : S;
    const out = new OffscreenCanvas(width, height);
    out.getContext('2d')!.drawImage(full, (S - cropW) / 2, (S - cropH) / 2, cropW, cropH, 0, 0, width, height);
    return out.convertToBlob({ type: 'image/png' });
  }

  /** WebGPU + shader-f16 (the fp16 export requires it). */
  async isAvailable(): Promise<boolean> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gpu = (typeof navigator !== 'undefined' ? (navigator as any).gpu : undefined);
    if (!gpu) return false;
    try {
      const adapter = await gpu.requestAdapter();
      return !!adapter && adapter.features.has('shader-f16');
    } catch {
      return false;
    }
  }

  isReady(): boolean {
    return !!(this.sessions.unet && this.sessions.text_encoder && this.sessions.vae_decoder);
  }

  isLoading(): boolean {
    return this.loading;
  }

  /** Release GPU sessions (memory budgeter / LRU unload hook). */
  async dispose(): Promise<void> {
    for (const f of MODEL_FILES) {
      try { await this.sessions[f.key]?.release?.(); } catch { /* already gone */ }
      delete this.sessions[f.key];
    }
    this.tokenizer = null;
  }
}

export const sdTurboEngine = new SDTurboEngine();
