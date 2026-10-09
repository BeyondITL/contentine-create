/**
 * Contentine Create -- Gemini Nano Engine
 * Browser-native LLM using Chrome's built-in Gemini Nano (Chrome 137+).
 * Zero download, instant start -- saves VRAM for image/voice models.
 * Implements the TextGenerationEngine interface from browser-engine-manager.
 */

import type { TextGenerationEngine } from './browser-engine-manager';

/** Browser-native LLM engine using Chrome's built-in Gemini Nano (Chrome 137+). */
class GeminiNanoEngine implements TextGenerationEngine {
  readonly name = 'Gemini Nano';

  /**
   * Check if Chrome's built-in AI LanguageModel API exists and model is available.
   * Detection covers the Chrome AI API surface:
   *   - window.ai?.languageModel (older origin trial API shape)
   *   - window.LanguageModel (newer standardized API shape, Chrome 137+)
   */
  async isAvailable(): Promise<boolean> {
    if (typeof window === 'undefined') return false;

    // Newer API shape (Chrome 137+): window.LanguageModel
    if ('LanguageModel' in window) {
      try {
        const availability = await (window as any).LanguageModel.availability();
        return availability === 'readily' || availability === 'after-download';
      } catch {
        return false;
      }
    }

    // Older origin trial API shape: window.ai?.languageModel
    if ('ai' in window && 'languageModel' in ((window as any).ai || {})) {
      try {
        const capabilities = await (window as any).ai.languageModel.capabilities();
        return capabilities?.available === 'readily' || capabilities?.available === 'after-download';
      } catch {
        return false;
      }
    }

    return false;
  }

  /**
   * Create a LanguageModel session using whichever API shape is available.
   * Abstracts the difference between window.LanguageModel and window.ai.languageModel.
   */
  private async createSession(systemPrompt: string): Promise<any> {
    if ('LanguageModel' in window) {
      return (window as any).LanguageModel.create({ systemPrompt });
    }
    if ('ai' in window && 'languageModel' in ((window as any).ai || {})) {
      return (window as any).ai.languageModel.create({ systemPrompt });
    }
    throw new Error('Gemini Nano API not found in this browser');
  }

  /** Generate text using Gemini Nano. Creates a session per call. */
  async generate(systemPrompt: string, userPrompt: string, _options?: { temperature?: number; maxTokens?: number }): Promise<string> {
    if (!await this.isAvailable()) {
      throw new Error('Gemini Nano not available in this browser');
    }
    const session = await this.createSession(systemPrompt);
    try {
      return await session.prompt(userPrompt);
    } finally {
      session.destroy();
    }
  }

  /** Generate text with streaming output. */
  async generateStream(systemPrompt: string, userPrompt: string, onChunk: (text: string) => void): Promise<string> {
    if (!await this.isAvailable()) {
      throw new Error('Gemini Nano not available in this browser');
    }
    const session = await this.createSession(systemPrompt);
    try {
      const stream = await session.promptStreaming(userPrompt);
      let fullText = '';
      let previousLength = 0;
      for await (const chunk of stream) {
        // Chrome's API gives accumulated text, not deltas
        const newText = chunk.slice(previousLength);
        previousLength = chunk.length;
        fullText = chunk;
        onChunk(newText);
      }
      return fullText;
    } finally {
      session.destroy();
    }
  }
}

export const geminiNanoEngine = new GeminiNanoEngine();
