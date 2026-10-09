/**
 * Contentine Create — Browser-native Whisper STT Engine
 * Uses @huggingface/transformers pipeline API for in-browser speech-to-text.
 * Model: Xenova/whisper-tiny (~40MB, cached automatically by transformers.js).
 * All processing runs client-side — no server required for transcription.
 */

/** Transcription result with optional word-level timestamps. */
export interface WhisperResult {
  text: string;
  chunks?: Array<{ text: string; timestamp: [number, number] }>;
}

/** Whisper engine status for UI display. */
export type WhisperStatus = 'not-downloaded' | 'downloading' | 'loading' | 'ready' | 'error';

// Module-level singleton state
let pipeline: ReturnType<typeof createPipelineRef> | null = null;
let currentStatus: WhisperStatus = 'not-downloaded';
let statusListeners: Array<(status: WhisperStatus, progress?: number) => void> = [];

/** Lazily resolved pipeline reference (avoids top-level import). */
function createPipelineRef() {
  return { instance: null as unknown | null };
}

/** Notify all subscribed listeners of a status change. */
function notifyStatus(status: WhisperStatus, progress?: number): void {
  currentStatus = status;
  for (const listener of statusListeners) {
    listener(status, progress);
  }
}

/** Browser-native Whisper speech-to-text engine (singleton). */
export const whisperEngine = {
  /** Check if the Whisper model is already cached and available for immediate use. */
  isAvailable(): boolean {
    return currentStatus === 'ready';
  },

  /** Get the current engine status. */
  getStatus(): WhisperStatus {
    return currentStatus;
  },

  /** Subscribe to status changes. Returns an unsubscribe function. */
  onStatusChange(listener: (status: WhisperStatus, progress?: number) => void): () => void {
    statusListeners.push(listener);
    return () => {
      statusListeners = statusListeners.filter((l) => l !== listener);
    };
  },

  /**
   * Initialize the Whisper pipeline. Downloads the model on first call (~40MB for
   * tiny) directly from the HuggingFace CDN — no server in the path (Law L2).
   * Subsequent calls reuse the cached model from browser storage.
   * @param onProgress - Optional callback for model download progress (0-1).
   * @param hfModelId - HuggingFace repo id to load (defaults to whisper-tiny).
   */
  async init(onProgress?: (p: number) => void, hfModelId = 'Xenova/whisper-tiny'): Promise<void> {
    if (currentStatus === 'ready' && pipeline?.instance) return;
    if (currentStatus === 'downloading' || currentStatus === 'loading') return;

    notifyStatus('downloading', 0);

    try {
      // Dynamic import for static Next.js export compatibility
      const { pipeline: createPipeline, env } = await import('@huggingface/transformers');
      // Route all artifact reads/writes through the model storage layer
      // (browser cache or the user's model folder) — loud quota errors,
      // never the silent hub.js cache.put swallow.
      const { installTransformersCache } = await import('@/lib/model-storage');
      installTransformersCache(env as unknown as Parameters<typeof installTransformersCache>[0]);

      notifyStatus('loading', 0.5);

      // Create the automatic-speech-recognition pipeline. transformers.js handles
      // model download (browser→HF CDN), caching, and ONNX inference.
      const asr = await createPipeline(
        'automatic-speech-recognition',
        hfModelId,
        {
          progress_callback: (progressData: { status: string; progress?: number; loaded?: number; total?: number }) => {
            if (progressData.status === 'progress' && typeof progressData.progress === 'number') {
              const pct = progressData.progress / 100;
              onProgress?.(pct);
              notifyStatus('downloading', pct);
            } else if (progressData.status === 'done') {
              onProgress?.(1);
              notifyStatus('loading', 1);
            }
          },
        }
      );

      if (!pipeline) pipeline = createPipelineRef();
      pipeline.instance = asr;
      notifyStatus('ready');
    } catch (err) {
      notifyStatus('error');
      throw new Error(
        `Failed to initialize Whisper engine: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
    }
  },

  /**
   * Transcribe an audio Blob to text using the in-browser Whisper model.
   * Automatically initializes the pipeline if not already loaded.
   * @param audioBlob - Audio data (WAV, MP3, or raw PCM).
   * @returns Transcription result with text and optional timestamped chunks.
   */
  async transcribe(audioBlob: Blob): Promise<WhisperResult> {
    // Ensure the pipeline is initialized
    if (!pipeline?.instance) {
      await whisperEngine.init();
    }

    if (!pipeline?.instance) {
      throw new Error('Whisper engine not initialized. Please try again.');
    }

    // Convert Blob to Float32Array at 16kHz (Whisper's expected input format)
    const float32Audio = await blobToFloat32At16kHz(audioBlob);

    // Run the ASR pipeline
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const asrPipeline = pipeline.instance as any;
    const result = await asrPipeline(float32Audio, {
      return_timestamps: true,
      chunk_length_s: 30,
      stride_length_s: 5,
    });

    // Normalize the result shape — transformers.js may return different structures
    if (Array.isArray(result)) {
      const first = result[0];
      return {
        text: first?.text?.trim() || '',
        chunks: first?.chunks?.map((c: { text: string; timestamp: [number, number] }) => ({
          text: c.text?.trim() || '',
          timestamp: c.timestamp,
        })),
      };
    }

    return {
      text: result?.text?.trim() || '',
      chunks: result?.chunks?.map((c: { text: string; timestamp: [number, number] }) => ({
        text: c.text?.trim() || '',
        timestamp: c.timestamp,
      })),
    };
  },

  /** Release the pipeline and free memory. */
  destroy(): void {
    if (pipeline?.instance) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const inst = pipeline.instance as any;
      if (typeof inst.dispose === 'function') {
        inst.dispose();
      }
      pipeline.instance = null;
    }
    currentStatus = 'not-downloaded';
    notifyStatus('not-downloaded');
  },
};

/**
 * Convert an audio Blob to a Float32Array resampled to 16kHz mono.
 * Whisper expects 16kHz mono Float32 input for optimal accuracy.
 */
async function blobToFloat32At16kHz(blob: Blob): Promise<Float32Array> {
  const TARGET_SAMPLE_RATE = 16000;

  // Decode the audio blob using AudioContext
  const arrayBuffer = await blob.arrayBuffer();
  const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)({
    sampleRate: TARGET_SAMPLE_RATE,
  });

  try {
    const decoded = await audioCtx.decodeAudioData(arrayBuffer);

    // If already at 16kHz, return channel data directly
    if (decoded.sampleRate === TARGET_SAMPLE_RATE) {
      const channelData = decoded.getChannelData(0);
      const result = new Float32Array(channelData.length);
      result.set(channelData);
      await audioCtx.close();
      return result;
    }

    // Resample to 16kHz using OfflineAudioContext
    const offlineCtx = new OfflineAudioContext(
      1, // mono
      Math.ceil(decoded.duration * TARGET_SAMPLE_RATE),
      TARGET_SAMPLE_RATE
    );

    const source = offlineCtx.createBufferSource();
    source.buffer = decoded;
    source.connect(offlineCtx.destination);
    source.start(0);

    const resampled = await offlineCtx.startRendering();
    const channelData = resampled.getChannelData(0);
    const result = new Float32Array(channelData.length);
    result.set(channelData);

    await audioCtx.close();
    return result;
  } catch (err) {
    await audioCtx.close();
    throw new Error(
      `Failed to decode audio for Whisper: ${err instanceof Error ? err.message : 'Unknown format'}`
    );
  }
}
