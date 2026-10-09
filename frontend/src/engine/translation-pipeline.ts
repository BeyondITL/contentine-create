'use client';

/**
 * Contentine Create — Multi-language Video Translation Pipeline
 * Pipeline: Source video -> Extract audio -> Transcribe -> Translate -> TTS -> Lip-sync -> Mux -> MP4
 *
 * All heavy processing runs in the browser. Browser-native WebLLM/Gemini Nano is used for translation, with backend as fallback.
 * Mediabunny is used for final muxing (not FFmpeg.wasm).
 */

const getWav2LipEngine = async () => (await import('./wav2lip-engine')).wav2lipEngine;
const getF5TTSEngine = async () => (await import('./f5tts-engine')).f5ttsEngine;

/** Supported target languages for translation pipeline. */
export const TRANSLATION_LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'zh', name: 'Chinese' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'it', name: 'Italian' },
  { code: 'hi', name: 'Hindi' },
] as const;

export type TranslationLanguage = typeof TRANSLATION_LANGUAGES[number]['code'];

export interface TranslationProgress {
  stage: 'checking' | 'extracting' | 'transcribing' | 'translating' | 'synthesizing' | 'animating' | 'compositing' | 'complete' | 'error';
  progress: number;
  message: string;
}

/** Engine readiness status for each step of the pipeline. */
export interface EngineReadiness {
  tts: 'ready' | 'needs-download' | 'unavailable';
  wav2lip: 'ready' | 'needs-download' | 'unavailable';
  webcodecs: 'ready' | 'unavailable';
  whisper: 'ready' | 'needs-download' | 'unavailable';
}

/** Check which engines are available and which need downloading. */
export async function checkEngineReadiness(): Promise<EngineReadiness> {
  const result: EngineReadiness = {
    tts: 'needs-download',
    wav2lip: 'needs-download',
    webcodecs: 'unavailable',
    whisper: 'needs-download',
  };

  // Check TTS readiness
  try {
    const { ttsManager } = await import('./tts-manager');
    result.tts = ttsManager.isReady ? 'ready' : 'needs-download';
  } catch {
    result.tts = 'unavailable';
  }

  // Check Wav2Lip readiness
  try {
    const wav2lip = await getWav2LipEngine();
    const available = await wav2lip.isAvailable();
    result.wav2lip = available ? 'needs-download' : 'unavailable';
  } catch {
    result.wav2lip = 'unavailable';
  }

  // Check WebCodecs support
  try {
    const { supportsWebCodecs } = await import('./webcodecs-encoder');
    const supported = await supportsWebCodecs();
    result.webcodecs = supported ? 'ready' : 'unavailable';
  } catch {
    result.webcodecs = 'unavailable';
  }

  // Check Whisper STT readiness
  try {
    const { whisperEngine } = await import('./whisper-engine');
    result.whisper = whisperEngine.isAvailable() ? 'ready' : 'needs-download';
  } catch {
    result.whisper = 'unavailable';
  }

  return result;
}

/**
 * Multi-language lip-sync translation pipeline.
 * Pipeline: Source video -> Extract audio -> Transcribe -> Translate -> TTS -> Lip-sync -> Composite
 */
export class TranslationPipeline {
  private onProgress?: (p: TranslationProgress) => void;

  constructor(onProgress?: (p: TranslationProgress) => void) {
    this.onProgress = onProgress;
  }

  private report(stage: TranslationProgress['stage'], progress: number, message: string): void {
    this.onProgress?.({ stage, progress, message });
  }

  /**
   * Translate a video to a target language with lip-sync.
   * @param sourceVideo - Source video Blob.
   * @param targetLanguage - Target language code.
   * @param options - Additional options (voice cloning, source text bypass, etc.).
   * @returns Translated video Blob (MP4).
   */
  async translate(
    sourceVideo: Blob,
    targetLanguage: TranslationLanguage,
    options: {
      useVoiceClone?: boolean;
      voiceSample?: ArrayBuffer;
      sourceText?: string;
    } = {}
  ): Promise<Blob> {
    // ────────────────────────────────────────────
    // Step 1: Extract audio from video
    // ────────────────────────────────────────────
    this.report('extracting', 5, 'Extracting audio from video...');
    const { pcmData, sampleRate } = await this.extractAudio(sourceVideo);

    if (pcmData.length === 0) {
      throw new Error('No audio track found in the video. Please provide source text manually.');
    }

    // ────────────────────────────────────────────
    // Step 2: Transcribe audio to text
    // ────────────────────────────────────────────
    let sourceText = options.sourceText?.trim() || '';

    if (!sourceText) {
      // Strategy: Try browser-native Whisper first, then fall back to backend,
      // then finally fail with a helpful message about manual transcript input.
      let transcribed = false;

      // Attempt 1: Browser-native Whisper STT via @huggingface/transformers
      try {
        this.report('transcribing', 15, 'Loading browser speech recognition...');
        const { whisperEngine } = await import('./whisper-engine');
        const wavBlob = this.pcmToWav(pcmData, sampleRate);
        await whisperEngine.init((p) => {
          this.report('transcribing', 15 + Math.round(p * 10), 'Downloading speech recognition model...');
        });
        this.report('transcribing', 25, 'Transcribing audio in browser...');
        const result = await whisperEngine.transcribe(wavBlob);
        if (result.text.trim()) {
          sourceText = result.text.trim();
          transcribed = true;
        }
      } catch {
        // Browser Whisper failed — fall through to backend
      }

      // Attempt 2: Backend transcription endpoint
      if (!transcribed) {
        this.report('transcribing', 20, 'Transcribing audio via backend...');
        try {
          const { api } = await import('@/lib/api');
          const wavBlob = this.pcmToWav(pcmData, sampleRate);
          const transcription = await api.upload('/transcribe', wavBlob, 'audio.wav');
          if (transcription?.text?.trim()) {
            sourceText = transcription.text.trim();
            transcribed = true;
          }
        } catch {
          // Backend also unavailable — will throw below
        }
      }

      // Both methods failed
      if (!transcribed || !sourceText) {
        throw new Error(
          'Audio transcription is not available. Please provide the source text manually ' +
          'using the "I have the transcript" option.'
        );
      }
    }

    // ────────────────────────────────────────────
    // Step 3: Translate text to target language
    // ────────────────────────────────────────────
    this.report('translating', 30, `Translating to ${targetLanguage}...`);

    const langName = TRANSLATION_LANGUAGES.find((l) => l.code === targetLanguage)?.name || targetLanguage;
    let translatedText = '';

    // Try browser-native translation first (no server needed)
    try {
      const { browserEngineManager } = await import('./browser-engine-manager');
      const textEngine = await browserEngineManager.getTextEngine();
      this.report('translating', 35, `Translating to ${langName} using ${textEngine.name}...`);
      translatedText = await textEngine.generate(
        'You are a professional translator. Output ONLY the translated text with no commentary, notes, or explanations.',
        `Translate the following text to ${langName}. Preserve the original tone, style, meaning, and pacing:\n\n${sourceText}`
      );
      translatedText = translatedText.trim();
    } catch {
      // Browser engine not available -- try backend
    }

    // Fallback to backend API if browser translation failed
    if (!translatedText) {
      try {
        this.report('translating', 35, `Translating to ${langName} via backend...`);
        const { api } = await import('@/lib/api');
        const translateRes = await api.post<{ content: string }>('/writer/generate', {
          content_type: 'article',
          topic: `Translate the following text to ${langName}. Preserve the original tone, style, meaning, and pacing. Output ONLY the translated text with no commentary, notes, or explanations:\n\n${sourceText}`,
          tone: 'professional',
          length: 'medium',
        });
        translatedText = translateRes?.content?.trim() || '';
      } catch {
        // Backend also failed
      }
    }

    if (!translatedText) {
      throw new Error(
        `Translation failed. Please ensure an AI model is downloaded from the Models page, or try again later.`
      );
    }

    // ────────────────────────────────────────────
    // Step 4: Synthesize speech in target language
    // ────────────────────────────────────────────
    this.report('synthesizing', 45, 'Generating speech in target language...');

    let newAudioPCM: Float32Array;
    let newAudioSampleRate: number;

    if (options.useVoiceClone) {
      // Use F5-TTS voice cloning with the original audio as reference
      const f5tts = await getF5TTSEngine();
      const referenceAudio = options.voiceSample || pcmData.buffer;
      const clonedAudioBuffer = await f5tts.cloneAndSpeak(
        referenceAudio instanceof ArrayBuffer ? referenceAudio : (referenceAudio as unknown as ArrayBuffer),
        translatedText,
        targetLanguage
      );
      // F5-TTS returns a WAV ArrayBuffer — decode it to get PCM
      const audioCtx = new AudioContext({ sampleRate: 24000 });
      const decoded = await audioCtx.decodeAudioData(clonedAudioBuffer);
      newAudioPCM = decoded.getChannelData(0);
      newAudioSampleRate = decoded.sampleRate;
      await audioCtx.close();
    } else {
      // Use Kokoro TTS with a language-appropriate voice
      const { ttsManager } = await import('./tts-manager');
      const voiceMap: Record<string, string> = {
        en: 'af_sky', es: 'af_sky', fr: 'bf_emma', de: 'bf_emma',
        zh: 'af_sky', ja: 'af_sky', ko: 'af_sky', pt: 'af_sky',
        it: 'bf_emma', hi: 'af_sky',
      };
      const voiceId = voiceMap[targetLanguage] || 'af_sky';
      this.report('synthesizing', 50, 'Initializing TTS engine...');
      const result = await ttsManager.synthesize(translatedText, voiceId, 1.0, (p) => {
        this.report('synthesizing', 50 + Math.round(p.percent * 0.15), p.message || 'Synthesizing...');
      });
      newAudioPCM = result.buffer;
      newAudioSampleRate = result.sampleRate;
    }

    // ────────────────────────────────────────────
    // Step 5: Detect face and attempt lip-sync
    // ────────────────────────────────────────────
    this.report('animating', 70, 'Checking for faces in video...');
    let animatedFrames: ImageData[] | null = null;
    let hasFace = false;

    try {
      const firstFrame = await this.extractFirstFrame(sourceVideo);
      const wav2lip = await getWav2LipEngine();

      // Attempt Wav2Lip animation — the engine will throw if model is missing
      this.report('animating', 75, 'Animating lip movements...');
      const audioForLipSync = new Float32Array(newAudioPCM);
      animatedFrames = await wav2lip.animate(firstFrame, audioForLipSync.buffer, 25);
      hasFace = animatedFrames.length > 0;
    } catch {
      // Wav2Lip unavailable or no face detected — fall back to audio-only replacement
      hasFace = false;
    }

    // ────────────────────────────────────────────
    // Step 6: Composite final video
    // ────────────────────────────────────────────
    this.report('compositing', 85, 'Building final video...');

    let resultBlob: Blob;

    if (hasFace && animatedFrames && animatedFrames.length > 0) {
      // Lip-synced path: encode animated frames + new audio via WebCodecs + Mediabunny
      resultBlob = await this.compositeWithWebCodecs(animatedFrames, newAudioPCM, newAudioSampleRate, 25);
    } else {
      // Audio-only path: replace original audio track with new TTS audio
      resultBlob = await this.replaceAudioTrack(sourceVideo, newAudioPCM, newAudioSampleRate);
    }

    this.report('complete', 100, 'Translation complete!');
    return resultBlob;
  }

  /**
   * Extract audio track from video as Float32Array PCM + sample rate.
   * Uses AudioContext.decodeAudioData for real audio decoding.
   */
  private async extractAudio(video: Blob): Promise<{ pcmData: Float32Array; sampleRate: number }> {
    const arrayBuffer = await video.arrayBuffer();
    const audioCtx = new AudioContext();

    try {
      const decoded = await audioCtx.decodeAudioData(arrayBuffer);
      // Extract mono channel data as a properly-sized Float32Array
      const channelData = decoded.getChannelData(0);
      const pcmData = new Float32Array(channelData.length);
      pcmData.set(channelData);
      const sr = decoded.sampleRate;
      await audioCtx.close();
      return { pcmData, sampleRate: sr };
    } catch {
      await audioCtx.close();
      return { pcmData: new Float32Array(0), sampleRate: 16000 };
    }
  }

  /** Extract first video frame as ImageBitmap for face detection. */
  private async extractFirstFrame(video: Blob): Promise<ImageBitmap> {
    const url = URL.createObjectURL(video);
    const videoEl = document.createElement('video');
    videoEl.muted = true;
    videoEl.src = url;

    await new Promise<void>((resolve, reject) => {
      videoEl.onloadeddata = () => resolve();
      videoEl.onerror = () => reject(new Error('Failed to load video for frame extraction'));
      videoEl.load();
    });

    // Seek to first frame
    videoEl.currentTime = 0.1; // Slight offset to avoid black first frame
    await new Promise<void>((resolve) => {
      videoEl.onseeked = () => resolve();
    });

    const bitmap = await createImageBitmap(videoEl);
    URL.revokeObjectURL(url);
    return bitmap;
  }

  /**
   * Composite lip-synced frames + audio into MP4 using WebCodecs + Mediabunny.
   * This path is used when Wav2Lip successfully animated frames.
   */
  private async compositeWithWebCodecs(
    frames: ImageData[],
    audioPCM: Float32Array,
    audioSampleRate: number,
    fps: number
  ): Promise<Blob> {
    if (frames.length === 0) {
      throw new Error('No frames to composite');
    }

    // WebCodecs is required — the legacy MediaRecorder/captureStream WebM fallback
    // was removed under Law L6 (realtime capture can never be deterministic).
    const { supportsWebCodecs, H264Encoder } = await import('./webcodecs-encoder');
    if (!(await supportsWebCodecs())) {
      throw new Error(
        'Video export requires WebCodecs H.264 encoding, which this browser does not support. ' +
        'Please use a current version of Chrome, Edge, or Safari (16.4+).'
      );
    }

    // WebCodecs path: H.264 encode frames, then mux with Mediabunny
    const encoder = new H264Encoder({
      aspectRatio: '16:9',
      fps,
      bitrate: 4_000_000,
      tier: 'standard',
    });
    await encoder.init();

    const canvas = new OffscreenCanvas(encoder.width, encoder.height);
    const ctx = canvas.getContext('2d')!;

    for (let i = 0; i < frames.length; i++) {
      // Scale frame to encoder resolution
      const frameBitmap = await createImageBitmap(frames[i]);
      ctx.drawImage(frameBitmap, 0, 0, encoder.width, encoder.height);
      frameBitmap.close();

      const timestampUs = Math.round((i / fps) * 1_000_000);
      encoder.encodeFrame(canvas, timestampUs);

      if (i % 10 === 0) {
        this.report('compositing', 85 + Math.round((i / frames.length) * 10), `Encoding frame ${i + 1}/${frames.length}`);
      }
    }

    const chunks = await encoder.flush();
    const decoderMeta = encoder.decoderMeta;
    encoder.close();

    // Mux via Mediabunny
    const { muxToMP4 } = await import('./mediabunny-muxer');
    return muxToMP4({
      videoChunks: chunks,
      decoderMeta,
      audioData: audioPCM,
      audioSampleRate,
      fps,
      width: encoder.width,
      height: encoder.height,
      onProgress: (pct) => this.report('compositing', 90 + Math.round(pct * 0.1), 'Muxing MP4...'),
    });
  }

  /**
   * Replace the audio track of the original video with new TTS audio.
   * Used when no face is detected (audio-only translation).
   * Uses Mediabunny's conversion pipeline.
   */
  private async replaceAudioTrack(
    originalVideo: Blob,
    newAudioPCM: Float32Array,
    audioSampleRate: number
  ): Promise<Blob> {
    // Strategy: Re-encode the video frames from the original video with new audio.
    // Extract frames from the original, then encode with WebCodecs + Mediabunny.
    const videoEl = document.createElement('video');
    videoEl.muted = true;
    const url = URL.createObjectURL(originalVideo);
    videoEl.src = url;

    await new Promise<void>((resolve, reject) => {
      videoEl.onloadedmetadata = () => resolve();
      videoEl.onerror = () => reject(new Error('Failed to load video for audio replacement'));
      videoEl.load();
    });

    const duration = videoEl.duration;
    const fps = 25;
    const totalFrames = Math.ceil(duration * fps);
    const width = videoEl.videoWidth;
    const height = videoEl.videoHeight;

    // WebCodecs is required — the legacy MediaRecorder/captureStream WebM fallback
    // was removed under Law L6 (realtime capture can never be deterministic).
    const { supportsWebCodecs, H264Encoder } = await import('./webcodecs-encoder');
    if (!(await supportsWebCodecs())) {
      URL.revokeObjectURL(url);
      throw new Error(
        'Video export requires WebCodecs H.264 encoding, which this browser does not support. ' +
        'Please use a current version of Chrome, Edge, or Safari (16.4+).'
      );
    }

    const encoder = new H264Encoder({
      aspectRatio: width > height ? '16:9' : (width === height ? '1:1' : '9:16'),
      fps,
      bitrate: 4_000_000,
      tier: 'standard',
    });
    await encoder.init();

    const canvas = new OffscreenCanvas(encoder.width, encoder.height);
    const ctx = canvas.getContext('2d')!;

    // Seek through original video and encode each frame
    for (let i = 0; i < totalFrames; i++) {
      const seekTime = i / fps;
      if (seekTime > duration) break;

      videoEl.currentTime = seekTime;
      await new Promise<void>((resolve) => { videoEl.onseeked = () => resolve(); });

      ctx.drawImage(videoEl, 0, 0, encoder.width, encoder.height);
      const timestampUs = Math.round(seekTime * 1_000_000);
      encoder.encodeFrame(canvas, timestampUs);

      if (i % 10 === 0) {
        this.report('compositing', 85 + Math.round((i / totalFrames) * 10), `Re-encoding frame ${i + 1}/${totalFrames}`);
      }
    }

    URL.revokeObjectURL(url);

    const chunks = await encoder.flush();
    const decoderMeta = encoder.decoderMeta;
    encoder.close();

    const { muxToMP4 } = await import('./mediabunny-muxer');
    return muxToMP4({
      videoChunks: chunks,
      decoderMeta,
      audioData: newAudioPCM,
      audioSampleRate,
      fps,
      width: encoder.width,
      height: encoder.height,
      onProgress: (pct) => this.report('compositing', 90 + Math.round(pct * 0.1), 'Muxing MP4...'),
    });
  }

  /** Convert Float32Array PCM to WAV Blob for uploading to backend transcription. */
  private pcmToWav(pcm: Float32Array, sampleRate: number): Blob {
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);
    const dataSize = pcm.length * (bitsPerSample / 8);

    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    const writeStr = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };

    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM format
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    writeStr(36, 'data');
    view.setUint32(40, dataSize, true);

    let offset = 44;
    for (let i = 0; i < pcm.length; i++) {
      const s = Math.max(-1, Math.min(1, pcm[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      offset += 2;
    }

    return new Blob([buffer], { type: 'audio/wav' });
  }
}
