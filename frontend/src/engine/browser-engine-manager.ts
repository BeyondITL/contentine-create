/**
 * Contentine Create -- Browser Engine Manager
 * Central coordinator for all browser-native AI engines.
 * Auto-detects and routes to the best available engine per capability.
 * Gemini Nano (zero-download) is preferred for text when available.
 */

export type TextEngine = 'webllm' | 'gemini_nano';
export type ImageEngine = 'sd_turbo';

/** Status of browser-native AI engines. */
export interface EngineStatus {
  webllm: boolean;
  gemini_nano: boolean;
  sd_turbo: boolean;
  preferred_text: TextEngine;
  detected: boolean;
}

/** Unified text generation interface shared by Gemini Nano and WebLLM engines. */
export interface TextGenerationEngine {
  generate(systemPrompt: string, userPrompt: string, options?: { temperature?: number; maxTokens?: number }): Promise<string>;
  generateStream(systemPrompt: string, userPrompt: string, onChunk: (text: string) => void): Promise<string>;
  isAvailable(): Promise<boolean>;
  /** Engine name for display purposes. */
  readonly name: string;
}

/** Available engine info for UI display. */
export interface AvailableEngines {
  text: string;
  image: string | null;
  tts: string;
  stt: string | null;
}

/** Manages browser-native AI engines -- auto-detects and routes to the best available. */
class BrowserEngineManager {
  private status: EngineStatus = {
    webllm: false,
    gemini_nano: false,
    sd_turbo: false,
    preferred_text: 'webllm',
    detected: false,
  };

  private textEngineInstance: TextGenerationEngine | null = null;
  private initialized = false;

  /** Detect which browser engines are available on this device. */
  async detectEngines(): Promise<EngineStatus> {
    // Dynamic imports to avoid pulling engine code into the main bundle
    const [{ geminiNanoEngine }, { webllmEngine }, { sdTurboEngine }] = await Promise.all([
      import('./gemini-nano-engine'),
      import('./webllm-engine'),
      import('./sd-turbo-engine'),
    ]);

    const [nanoOk, webllmOk, sdOk] = await Promise.all([
      geminiNanoEngine.isAvailable().catch(() => false),
      webllmEngine.isAvailable().catch(() => false),
      sdTurboEngine.isAvailable().catch(() => false),
    ]);

    // Prefer Gemini Nano if available (faster start, no download needed)
    // Fall back to WebLLM (works in all WebGPU browsers but requires model download)
    const preferredText: TextEngine = nanoOk ? 'gemini_nano' : 'webllm';

    // sd_turbo is honest availability: device capability AND the image-gen
    // feature flag (Deferral rule — see model-catalog.ts).
    const { IMAGE_GEN_ENABLED } = await import('@/lib/model-catalog');
    this.status = {
      webllm: webllmOk,
      gemini_nano: nanoOk,
      sd_turbo: IMAGE_GEN_ENABLED && sdOk,
      preferred_text: preferredText,
      detected: true,
    };

    // Reset cached text engine so it picks up the new preference
    this.textEngineInstance = null;

    return this.status;
  }

  /**
   * Get the best available text generation engine.
   * Returns Gemini Nano if available (Chrome 137+, zero download),
   * otherwise falls back to WebLLM (requires model download).
   */
  async getTextEngine(): Promise<TextGenerationEngine> {
    if (!this.status.detected) await this.detectEngines();

    if (this.textEngineInstance) return this.textEngineInstance;

    if (this.status.preferred_text === 'gemini_nano') {
      const { geminiNanoEngine } = await import('./gemini-nano-engine');
      this.textEngineInstance = geminiNanoEngine;
      return this.textEngineInstance;
    }

    if (this.status.webllm) {
      const { webllmEngine } = await import('./webllm-engine');
      // Wrap WebLLM to match the TextGenerationEngine interface
      const wrapped: TextGenerationEngine = {
        name: 'WebLLM',
        generate: (sys, user, opts) => webllmEngine.generate(sys, user, opts),
        generateStream: (sys, user, onChunk) => webllmEngine.generateStream(sys, user, onChunk),
        isAvailable: () => webllmEngine.isAvailable(),
      };
      this.textEngineInstance = wrapped;
      return this.textEngineInstance;
    }

    throw new Error('No browser text engine available. Please use a Cloud AI provider or enable WebGPU.');
  }

  /**
   * Get the image generation engine (SD Turbo).
   * Returns null if WebGPU is not available or model not downloaded.
   */
  async getImageEngine(): Promise<typeof import('./sd-turbo-engine').sdTurboEngine | null> {
    if (!this.status.detected) await this.detectEngines();
    if (!this.status.sd_turbo) return null;
    const { sdTurboEngine } = await import('./sd-turbo-engine');
    return sdTurboEngine;
  }

  /**
   * Get the Kokoro TTS manager for text-to-speech synthesis.
   * Always available (runs in a Web Worker).
   */
  async getTTSEngine(): Promise<typeof import('./tts-manager').ttsManager> {
    const { ttsManager } = await import('./tts-manager');
    return ttsManager;
  }

  /**
   * Get the Whisper STT engine for speech-to-text.
   * Returns null if the model is not yet downloaded and no WebGPU support.
   */
  async getSTTEngine(): Promise<typeof import('./whisper-engine').whisperEngine | null> {
    const { whisperEngine } = await import('./whisper-engine');
    // Whisper uses transformers.js which works without WebGPU (falls back to WASM)
    // so it is always potentially available -- return the engine reference
    return whisperEngine;
  }

  /**
   * Get a summary of which engines are available for UI display.
   */
  async getAvailableEngines(): Promise<AvailableEngines> {
    if (!this.status.detected) await this.detectEngines();

    let textName: string;
    if (this.status.gemini_nano) {
      textName = 'Gemini Nano (built-in)';
    } else if (this.status.webllm) {
      textName = 'WebLLM (WebGPU)';
    } else {
      textName = 'Cloud API only';
    }

    // STT is always potentially available via transformers.js WASM fallback
    const sttName = 'Whisper (browser)';

    return {
      text: textName,
      image: this.status.sd_turbo ? 'SD Turbo (WebGPU)' : null,
      tts: 'Kokoro TTS (Web Worker)',
      stt: sttName,
    };
  }

  /** Generate text using the best available browser engine. */
  async generateText(systemPrompt: string, userPrompt: string, options?: { temperature?: number; maxTokens?: number }): Promise<string> {
    const engine = await this.getTextEngine();
    return engine.generate(systemPrompt, userPrompt, options);
  }

  /** Generate text with streaming using the best available engine. */
  async generateTextStream(systemPrompt: string, userPrompt: string, onChunk: (text: string) => void): Promise<string> {
    const engine = await this.getTextEngine();
    return engine.generateStream(systemPrompt, userPrompt, onChunk);
  }

  /** Generate an image using browser engine (SD Turbo). */
  async generateImage(prompt: string, options?: { width?: number; height?: number; steps?: number }): Promise<Blob> {
    const engine = await this.getImageEngine();
    if (!engine) {
      throw new Error('No browser image engine available. Please use a Cloud AI provider or enable WebGPU.');
    }
    return engine.generateImage(prompt, options);
  }

  /** Check if any text engine is available. */
  hasTextEngine(): boolean {
    return this.status.webllm || this.status.gemini_nano;
  }

  /** Check if the image engine is available. */
  hasImageEngine(): boolean {
    return this.status.sd_turbo;
  }

  /** Get the current engine status. */
  getStatus(): EngineStatus {
    return { ...this.status };
  }

  /** Set progress callback on WebLLM and SD Turbo engines. */
  setProgressCallback(cb: (progress: { text: string; progress: number }) => void): void {
    // Apply to WebLLM and SD Turbo (dynamic imports keep them lazy)
    import('./webllm-engine').then(({ webllmEngine }) => {
      webllmEngine.setProgressCallback(cb);
    }).catch(() => { /* engine not available */ });

    import('./sd-turbo-engine').then(({ sdTurboEngine }) => {
      sdTurboEngine.setProgressCallback(cb);
    }).catch(() => { /* engine not available */ });
  }

  /**
   * Cleanup all initialized engines and free memory.
   * Useful for low-memory devices or when navigating away from AI-heavy pages.
   */
  async cleanup(): Promise<void> {
    this.textEngineInstance = null;

    // Dispose WebLLM engine
    try {
      const { webllmEngine } = await import('./webllm-engine');
      await webllmEngine.dispose();
    } catch { /* not loaded */ }

    // Terminate TTS worker
    try {
      const { ttsManager } = await import('./tts-manager');
      ttsManager.terminate();
    } catch { /* not loaded */ }

    // Destroy Whisper pipeline
    try {
      const { whisperEngine } = await import('./whisper-engine');
      whisperEngine.destroy();
    } catch { /* not loaded */ }

    // Reset detection state so engines are re-detected on next use
    this.status = {
      webllm: false,
      gemini_nano: false,
      sd_turbo: false,
      preferred_text: 'webllm',
      detected: false,
    };
  }
}

export const browserEngineManager = new BrowserEngineManager();
