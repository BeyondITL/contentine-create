import * as webllm from '@mlc-ai/web-llm';

// Base model families in order of preference (best quality first). Each resolves
// to a concrete MLC id at load time based on the device's shader-f16 support —
// q4f16 weights REQUIRE the WebGPU `shader-f16` feature; when it's absent we must
// load the q4f32 variant instead (this mismatch was the live "No compatible
// model found" failure — C-M2 P0 expansion). Both variants exist in the WebLLM
// prebuilt appConfig, and both download browser→CDN directly (never via server).
const MODEL_FAMILIES = [
  'Llama-3.2-1B-Instruct',   // ~600MB GPU (q4f16) / ~1.1GB (q4f32), good quality
  'Qwen2.5-0.5B-Instruct',   // ~350MB GPU, decent for short content
];
const F16_SUFFIX = '-q4f16_1-MLC';
const F32_SUFFIX = '-q4f32_1-MLC';

/** Strip a concrete MLC quantization suffix back to its base family name. */
function familyOf(mlcId: string): string {
  return mlcId.replace(/-q4f(16|32)_1-MLC$/, '');
}

/**
 * Detect whether this device's WebGPU adapter exposes the `shader-f16` feature.
 * q4f16 model weights need it; without it we fall back to the q4f32 variant.
 */
async function supportsShaderF16(): Promise<boolean> {
  const gpu = (navigator as unknown as {
    gpu?: { requestAdapter: () => Promise<{ features: { has: (f: string) => boolean } } | null> };
  }).gpu;
  if (!gpu) return false;
  try {
    const adapter = await gpu.requestAdapter();
    return !!adapter && adapter.features.has('shader-f16');
  } catch {
    return false;
  }
}

/**
 * Ordered concrete MLC ids to try for the given families. The q4f16 variant is
 * only offered when the device supports shader-f16; the q4f32 variant is always
 * appended as a universal fallback so a non-f16 GPU still gets a working model.
 */
function buildCandidates(families: string[], f16ok: boolean): string[] {
  const out: string[] = [];
  for (const fam of families) {
    if (f16ok) out.push(`${fam}${F16_SUFFIX}`);
    out.push(`${fam}${F32_SUFFIX}`);
  }
  return [...new Set(out)];
}

type ProgressCb = (progress: { text: string; progress: number }) => void;

/** Rejection raised when an in-flight load is aborted (watchdog stall / user cancel). */
class ModelLoadAbortedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AbortError';
  }
}

/** Throw immediately if the signal is already aborted (checked between phases). */
function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new ModelLoadAbortedError('Model load aborted.');
}

/**
 * Race a WebLLM load against an AbortSignal. MLC's `CreateMLCEngine` / `reload`
 * expose no cancellation, so on abort we settle THIS promise immediately with an
 * AbortError and, when the un-cancellable load eventually resolves, hand its
 * result to `disposeLeaked` so a partially-loaded engine never leaks GPU memory.
 * Without this, a hard network stall leaves the load unsettled forever — the
 * store's stall watchdog aborts its controller but `ensureModel` never settles,
 * so its concurrency slot never frees and the serialized queue deadlocks the
 * whole LLM tier (3B errors, 1B stays "queued" forever, Qwen never starts).
 */
function raceAbort<T>(
  work: Promise<T>,
  signal: AbortSignal | undefined,
  disposeLeaked: (value: T) => void,
): Promise<T> {
  if (!signal) return work;
  const scheduleDispose = () => { work.then(disposeLeaked, () => undefined); };
  if (signal.aborted) {
    scheduleDispose();
    return Promise.reject(new ModelLoadAbortedError('Model load aborted before it started.'));
  }
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', onAbort);
      fn();
    };
    const onAbort = () => settle(() => {
      scheduleDispose();
      reject(new ModelLoadAbortedError('Model load aborted.'));
    });
    signal.addEventListener('abort', onAbort, { once: true });
    work.then(
      (value) => settle(() => resolve(value)),
      (err) => settle(() => reject(err)),
    );
  });
}

/**
 * Browser-native LLM engine using WebLLM (models via WebGPU).
 *
 * SINGLE MLCEngine, SERIALIZED loads (C-M2 P0 round two): concurrent
 * `ensureModel` calls for different models queue instead of cross-wiring one
 * shared progress callback — the cause of the live "Qwen stuck at Downloading
 * 100%" bug, where a second model's initialize() silently early-returned while
 * its progress bar showed the FIRST model's events. Each queued load routes
 * progress ONLY to its caller; switching models uses engine.reload() so the
 * previous model's GPU memory is released by WebLLM.
 */
export interface GenerateOptions {
  temperature?: number;
  maxTokens?: number;
  /**
   * Decode-time structured-output constraint via WebLLM's XGrammar backend —
   * e.g. `{ type: 'json_object' }` GUARANTEES syntactically valid JSON at
   * generation time (constrain the decoder, don't beg the prompt). If the
   * loaded engine/model lacks grammar support the call transparently falls back
   * to unconstrained decoding and logs the capability honestly (once); any
   * downstream parser stays as defense-in-depth, never the sole guarantee.
   */
  responseFormat?: webllm.ResponseFormat;
}

let grammarFallbackLogged = false;
/** Log ONCE, honestly, that the decode-time grammar constraint was unavailable. */
function noteGrammarUnsupported(err: unknown): void {
  if (grammarFallbackLogged) return;
  grammarFallbackLogged = true;
  const reason = err instanceof Error ? err.message : String(err);
  console.warn(
    '[webllm] XGrammar constrained decoding unavailable on this engine/model — ' +
    `falling back to unconstrained output (JSON shape is parser-guaranteed only). Reason: ${reason}`,
  );
}

/**
 * Hard ceiling on ONE on-device inference; and the longest gap tolerated between
 * two streamed tokens before the stream is declared stalled (SA-34).
 *
 * These exist because a WebLLM fault is not always throwable at our layer:
 * `LLMChatPipeline.prefillStep` builds its grammar matcher inside
 * `new Promise((resolve) => async () => …)` — an async executor with no `reject`
 * and no try/catch — then awaits that promise in `Promise.all([device.sync(), …])`.
 * Anything that throws in there (see `assertUsableResponseFormat`) escapes as an
 * UNHANDLED rejection while the awaited promise never settles, so the caller's
 * try/catch/finally never runs and its `busy` flag latches forever. A timeout is
 * the only construct that can end that state from outside.
 */
const INFERENCE_TIMEOUT_MS = 240_000;
const STREAM_IDLE_TIMEOUT_MS = 90_000;

/** Rejection raised when inference is given up on (never latch a spinner). */
class InferenceTimeoutError extends Error {
  constructor(ms: number) {
    super(
      `On-device AI did not respond within ${Math.round(ms / 1000)}s and was stopped. ` +
      'Please try again, or write the text yourself.',
    );
    this.name = 'TimeoutError';
  }
}

/**
 * Reject a response_format WebLLM 0.2.84 cannot compile, BEFORE it reaches the
 * un-catchable path above.
 *
 * `{ type: 'json_object' }` with no `schema` is the trap: the pipeline calls
 * `grammarCompiler.compileJSONSchema(responseFormat.schema)` unconditionally for
 * that type, and embind rejects `undefined` with "Cannot pass non-string to
 * std::string" — the exact SA-34 signature. `schema` is a JSON-Schema STRING,
 * not an object, so a stringify-me-later caller trips the same wire.
 *
 * Returning `undefined` degrades the call to unconstrained decoding, which every
 * caller already parses defensively — an honest downgrade instead of a hang.
 */
function assertUsableResponseFormat(rf: webllm.ResponseFormat | undefined): webllm.ResponseFormat | undefined {
  if (!rf) return undefined;
  if (rf.type === 'json_object' && !(typeof rf.schema === 'string' && rf.schema.trim())) {
    noteGrammarUnsupported(
      new Error('response_format {type:"json_object"} needs a JSON-Schema string in `schema`'),
    );
    return undefined;
  }
  return rf;
}

class WebLLMEngine {
  private engine: webllm.MLCEngine | null = null;
  private activeModel: string | null = null;
  private loading = false;
  /** Serialization chain for model loads (never left rejected). */
  private queue: Promise<unknown> = Promise.resolve();
  private onProgress: ProgressCb | null = null;

  /** Set a default progress callback (legacy consumers). Per-call callbacks win. */
  setProgressCallback(cb: ProgressCb): void {
    this.onProgress = cb;
  }

  /**
   * Ensure `modelId`'s family is downloaded AND loaded as the active model.
   * Progress events go to `onProgress` (this call only). Serialized: concurrent
   * calls for different models run one after another, each with its own
   * progress routing. Passing no modelId loads the default preference list.
   */
  async ensureModel(modelId?: string, onProgress?: ProgressCb, signal?: AbortSignal): Promise<void> {
    const run = this.queue.then(() => this.loadSerialized(modelId, onProgress, signal));
    // Keep the chain alive whether or not this load fails OR is aborted — a
    // settled rejection here is what lets the next queued model proceed.
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async loadSerialized(modelId?: string, onProgress?: ProgressCb, signal?: AbortSignal): Promise<void> {
    const cb: ProgressCb = (p) => { (onProgress ?? this.onProgress)?.(p); };

    throwIfAborted(signal);
    const f16ok = await supportsShaderF16();
    const families = modelId ? [familyOf(modelId)] : MODEL_FAMILIES;

    // Already active? (any variant of the requested family counts)
    if (this.engine && this.activeModel && families.includes(familyOf(this.activeModel))) {
      cb({ text: `${this.activeModel} already loaded`, progress: 1 });
      return;
    }

    // Shared-ceiling devices: release other heavy GPU engines first (LRU).
    const { reserveGpuBudget } = await import('./memory-budgeter');
    await reserveGpuBudget('webllm');
    throwIfAborted(signal);

    const candidates = buildCandidates(families, f16ok);
    const tried: string[] = [];
    let lastErr = '';
    this.loading = true;
    try {
      for (const model of candidates) {
        tried.push(model);
        try {
          throwIfAborted(signal);
          cb({ text: `Loading ${model}...`, progress: 0 });
          if (this.engine) {
            this.engine.setInitProgressCallback((progress) => {
              cb({ text: progress.text, progress: progress.progress ?? 0 });
            });
            // reload() returns void — nothing to dispose; the catch below unloads
            // the (partially reloaded) engine on abort so Retry starts fresh.
            await raceAbort(this.engine.reload(model), signal, () => undefined);
          } else {
            this.engine = await raceAbort(
              webllm.CreateMLCEngine(model, {
                initProgressCallback: (progress) => {
                  cb({ text: progress.text, progress: progress.progress ?? 0 });
                },
              }),
              signal,
              // If the aborted load later resolves, unload the orphaned engine.
              (engine) => { void engine.unload().catch(() => undefined); },
            );
          }
          this.activeModel = model;
          return;
        } catch (err: unknown) {
          lastErr = err instanceof Error ? err.message : String(err);
          try { await this.engine?.unload(); } catch { /* engine already dead */ }
          this.engine = null;
          this.activeModel = null;
          // Aborted (watchdog stall or user cancel): settle NOW — do NOT walk the
          // fallback ladder. A settled rejection lets ensureModel's queue advance
          // (the next queued model loads) and frees the store's concurrency slot;
          // the engine is already unloaded above, so a later Retry starts clean.
          if (signal?.aborted || (err as { name?: string })?.name === 'AbortError') {
            const abortErr = new Error(
              `Loading ${model} was stopped after no download progress. Check your connection and retry.`,
            );
            abortErr.name = 'AbortError';
            throw abortErr;
          }
          // A storage-quota failure means the ORIGIN'S STORAGE is full, not
          // the GPU — trying the next candidate would attempt an even LARGER
          // q4f32 download into the same full storage (the July-5 live
          // regression). Stop the ladder and report the true cause.
          const { classifyModelError } = await import('@/lib/model-errors');
          if (classifyModelError(err) === 'storage-quota') {
            const quotaErr = new Error(
              `Browser storage quota exceeded while downloading ${model}: ${lastErr}`,
            );
            quotaErr.name = 'QuotaExceededError';
            throw quotaErr;
          }
          console.warn(`WebLLM: ${model} failed (${lastErr}), trying next candidate...`);
        }
      }

      const f16Note = f16ok
        ? ''
        : ' Your GPU does not expose the WebGPU shader-f16 feature, so the q4f32 variant was attempted.';
      throw new Error(
        `Could not load an on-device AI model. Tried: ${tried.join(', ')}.` +
        f16Note +
        ` Last error: ${lastErr || 'unknown'}.` +
        ' On-device AI needs WebGPU (Chrome or Edge on desktop) with enough free GPU memory —' +
        ' close other tabs or applications and try again.',
      );
    } finally {
      this.loading = false;
    }
  }

  /**
   * Initialize with a specific model (or the default preference list).
   * Kept for existing consumers; now serialized + per-call-progress safe.
   * On total failure it throws the REAL requirement + the REAL last error in
   * full (never a truncated "No compatible model found").
   */
  async initialize(modelId?: string): Promise<void> {
    // Any loaded model satisfies a no-preference initialize (generate paths).
    if (this.engine && !modelId) return;
    await this.ensureModel(modelId);
  }

  /**
   * True iff any quantization variant of the model's family is fully present
   * in the browser cache (restart-safe verification for the model store).
   */
  async isModelCached(modelId: string): Promise<boolean> {
    const fam = familyOf(modelId);
    for (const id of [`${fam}${F16_SUFFIX}`, `${fam}${F32_SUFFIX}`]) {
      try {
        if (await webllm.hasModelInCache(id)) return true;
      } catch { /* id unknown to appConfig — treat as not cached */ }
    }
    return false;
  }

  /** Delete every cached quantization variant of the model's family. */
  async deleteModelCache(modelId: string): Promise<void> {
    const fam = familyOf(modelId);
    for (const id of [`${fam}${F16_SUFFIX}`, `${fam}${F32_SUFFIX}`]) {
      try {
        if (await webllm.hasModelInCache(id)) await webllm.deleteModelInCache(id);
      } catch { /* not cached */ }
    }
  }

  /**
   * Settle `work` within `ms` no matter what the engine does (SA-34).
   *
   * A wedged WebLLM promise may never settle AND may reject long after we gave
   * up, so its outcome is absorbed here — otherwise the abandoned promise
   * resurfaces as an unhandled rejection with no caller left to see it.
   */
  private async withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    work.catch(() => undefined); // absorb a late rejection from an abandoned call
    try {
      return await Promise.race([
        work,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new InferenceTimeoutError(ms)), ms);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /**
   * Abandon a wedged inference. The stuck pipeline still holds its internal
   * generation lock, so the ONLY way a retry can succeed is a fresh engine —
   * the weights stay in the browser cache, so this reloads from disk, never
   * from the network.
   */
  private async abandonStuckInference(): Promise<void> {
    try { await this.engine?.interruptGenerate(); } catch { /* already wedged */ }
    await this.dispose();
  }

  /** Run one inference under the hard ceiling, cleaning up if it never lands. */
  private async timeboxed<T>(work: Promise<T>, ms = INFERENCE_TIMEOUT_MS): Promise<T> {
    try {
      return await this.withTimeout(work, ms);
    } catch (err) {
      if ((err as { name?: string })?.name === 'TimeoutError') await this.abandonStuckInference();
      throw err;
    }
  }

  /** Generate text completion from system + user prompts. */
  async generate(systemPrompt: string, userPrompt: string, options?: GenerateOptions): Promise<string> {
    if (!this.engine) await this.initialize();
    const messages: webllm.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];
    const temperature = options?.temperature ?? 0.7;
    const max_tokens = options?.maxTokens ?? 2048;
    const rf = assertUsableResponseFormat(options?.responseFormat);
    try {
      const response = await this.timeboxed(this.engine!.chat.completions.create(
        rf ? { messages, temperature, max_tokens, response_format: rf } : { messages, temperature, max_tokens },
      ));
      return response.choices[0]?.message?.content ?? '';
    } catch (err) {
      // A timeout already tore the engine down — surface it, never retry into it.
      if (!rf || (err as { name?: string })?.name === 'TimeoutError') throw err;
      // Honest fallback: the engine/model rejected the grammar constraint.
      noteGrammarUnsupported(err);
      if (!this.engine) await this.initialize();
      const response = await this.timeboxed(
        this.engine!.chat.completions.create({ messages, temperature, max_tokens }),
      );
      return response.choices[0]?.message?.content ?? '';
    }
  }

  /** Generate text with streaming output. Optional decode-time grammar constraint. */
  async generateStream(
    systemPrompt: string,
    userPrompt: string,
    onChunk: (text: string) => void,
    options?: GenerateOptions,
  ): Promise<string> {
    if (!this.engine) await this.initialize();
    const messages: webllm.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];
    const temperature = options?.temperature ?? 0.7;
    const max_tokens = options?.maxTokens ?? 2048;
    const rf = assertUsableResponseFormat(options?.responseFormat);
    let stream;
    try {
      stream = await this.timeboxed(this.engine!.chat.completions.create(
        rf
          ? { messages, temperature, max_tokens, stream: true, response_format: rf }
          : { messages, temperature, max_tokens, stream: true },
      ));
    } catch (err) {
      if (!rf || (err as { name?: string })?.name === 'TimeoutError') throw err;
      noteGrammarUnsupported(err);
      if (!this.engine) await this.initialize();
      stream = await this.timeboxed(
        this.engine!.chat.completions.create({ messages, temperature, max_tokens, stream: true }),
      );
    }

    // Per-token idle watchdog rather than one total budget: a long answer is
    // legitimate, a stalled decoder is not. Prefill happens on the FIRST next(),
    // so this also covers the grammar-init hang described at the top of the file.
    let fullText = '';
    const iterator = stream[Symbol.asyncIterator]();
    for (;;) {
      const step = await this.timeboxed(iterator.next(), STREAM_IDLE_TIMEOUT_MS);
      if (step.done) break;
      const delta = step.value.choices[0]?.delta?.content ?? '';
      if (delta) {
        fullText += delta;
        onChunk(delta);
      }
    }
    return fullText;
  }

  /** Check if WebGPU is available for WebLLM. */
  async isAvailable(): Promise<boolean> {
    if (typeof navigator === 'undefined' || !(navigator as any).gpu) return false;
    try {
      const adapter = await (navigator as any).gpu.requestAdapter();
      return adapter !== null;
    } catch {
      return false;
    }
  }

  isReady(): boolean { return this.engine !== null; }
  isLoading(): boolean { return this.loading; }
  getActiveModel(): string | null { return this.activeModel; }

  async dispose(): Promise<void> {
    try { await this.engine?.unload(); } catch { /* already gone */ }
    this.engine = null;
    this.activeModel = null;
  }
}

export const webllmEngine = new WebLLMEngine();
