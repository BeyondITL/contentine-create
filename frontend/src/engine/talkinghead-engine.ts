'use client';

/** TalkingHead 3D avatar engine — browser-native lip-sync via GLB models. */
export class TalkingHeadEngine {
  private head: any = null;
  private container: HTMLElement | null = null;
  private _initialized = false;
  private _speakingPromise: Promise<void> | null = null;

  /** Whether the engine is initialized and ready. */
  get initialized(): boolean { return this._initialized; }

  /** Check if WebGL2 is available (required for Three.js). */
  async isAvailable(): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2');
      return gl !== null;
    } catch { return false; }
  }

  /** Initialize TalkingHead with a container element. */
  async init(container: HTMLElement, avatarUrl: string, options?: { body?: 'F' | 'M'; mood?: string; lang?: string }): Promise<void> {
    if (this._initialized) return;
    this.container = container;
    // @ts-expect-error — TalkingHead doesn't ship full TS declarations
    const { TalkingHead } = await import('@met4citizen/talkinghead');
    this.head = new TalkingHead(container, {
      ttsEndpoint: null,
      cameraView: 'head',
      cameraDistance: 0.4,
    });
    await this.head.showAvatar({
      url: avatarUrl,
      body: options?.body ?? 'F',
      avatarMood: options?.mood ?? 'neutral',
      lipsyncLang: options?.lang ?? 'en',
    });
    this._initialized = true;
  }

  /** Speak with viseme-driven lip sync from Kokoro TTS. */
  async speak(audioBuffer: ArrayBuffer, visemes?: Array<{ time: number; value: string }>): Promise<void> {
    if (!this.head) throw new Error('TalkingHead not initialized');
    if (visemes && visemes.length > 0 && typeof this.head.speakWithVisemes === 'function') {
      this._speakingPromise = this.head.speakWithVisemes(audioBuffer, visemes);
    } else if (typeof this.head.speakAudio === 'function') {
      this._speakingPromise = this.head.speakAudio(audioBuffer);
    } else {
      console.warn('[TalkingHead] speakAudio not available, skipping lip-sync');
      this._speakingPromise = Promise.resolve();
    }
    await this._speakingPromise;
    this._speakingPromise = null;
  }

  /** Start speaking without awaiting completion (for recording simultaneously). */
  startSpeaking(audioBuffer: ArrayBuffer, visemes?: Array<{ time: number; value: string }>): void {
    if (!this.head) throw new Error('TalkingHead not initialized');
    try {
      if (visemes && visemes.length > 0 && typeof this.head.speakWithVisemes === 'function') {
        this._speakingPromise = this.head.speakWithVisemes(audioBuffer, visemes);
      } else if (typeof this.head.speakAudio === 'function') {
        this._speakingPromise = this.head.speakAudio(audioBuffer);
      } else {
        // TalkingHead instance does not have speakAudio — skip lip-sync, just animate idle
        console.warn('[TalkingHead] speakAudio not available, running without lip-sync');
        this._speakingPromise = Promise.resolve();
      }
    } catch {
      console.warn('[TalkingHead] Error starting speech, running without lip-sync');
      this._speakingPromise = Promise.resolve();
    }
    // Let it run — we record in parallel
    this._speakingPromise?.catch(() => { /* handled by caller via waitForSpeaking */ });
  }

  /** Wait for speaking to finish. */
  async waitForSpeaking(): Promise<void> {
    if (this._speakingPromise) {
      await this._speakingPromise;
      this._speakingPromise = null;
    }
  }

  /** Set avatar mood (neutral, happy, angry, sad, surprised, etc.). */
  setMood(mood: string): void {
    this.head?.setMood(mood);
  }

  /** Get the canvas element from the container. */
  getCanvas(): HTMLCanvasElement | null {
    return this.container?.querySelector('canvas') ?? null;
  }

  /** Capture current canvas frame as Blob. */
  async captureFrame(): Promise<Blob> {
    const canvas = this.getCanvas();
    if (!canvas) throw new Error('No canvas found');
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('toBlob failed')), 'image/png');
    });
  }

  /**
   * Render the speaking avatar to an MP4 blob via frame-driven WebCodecs capture.
   *
   * The TalkingHead engine advances its own animation + viseme timeline (and plays
   * the reference audio) on a real-time rAF loop; this method samples the live WebGL
   * canvas at the target frame rate, encodes each frame with the WebCodecs H.264
   * encoder, and muxes the WAV audio via Mediabunny. captureStream / MediaRecorder
   * are banned for export (Law L6 — realtime capture yields browser-dependent output).
   *
   * @param durationMs - Duration to capture in milliseconds (matches the audio length).
   * @param audioBlob - Optional WAV blob muxed in as the audio track.
   */
  async record(durationMs: number, audioBlob?: Blob): Promise<Blob> {
    const canvas = this.getCanvas();
    if (!canvas) throw new Error('No canvas found');

    const { H264Encoder, supportsWebCodecs } = await import('./webcodecs-encoder');
    if (!(await supportsWebCodecs())) {
      throw new Error(
        'Avatar video export requires WebCodecs H.264 encoding, which this browser does not support. ' +
        'Please use a current version of Chrome, Edge, or Safari (16.4+).'
      );
    }

    const fps = 30;
    const durationS = Math.max(0.001, durationMs / 1000);
    const totalFrames = Math.max(1, Math.ceil(durationS * fps));

    // TalkingHead renders to a square container canvas.
    const encoder = new H264Encoder({ aspectRatio: '1:1', fps, bitrate: 6_000_000, tier: 'high' });
    await encoder.init();

    const offscreen = new OffscreenCanvas(encoder.width, encoder.height);
    const offCtx = offscreen.getContext('2d');
    if (!offCtx) {
      encoder.close();
      throw new Error('Failed to create OffscreenCanvas 2D context for avatar capture');
    }

    try {
      // Frame-driven capture: pace sampling to real time (via rAF) so the live
      // animation has advanced to each frame's timestamp, but encode with fixed
      // per-frame timestamps so the output stream structure is identical run to run.
      const startMs = performance.now();
      for (let i = 0; i < totalFrames; i++) {
        const targetMs = (i / fps) * 1000;
        while (performance.now() - startMs < targetMs) {
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        }
        offCtx.drawImage(canvas, 0, 0, encoder.width, encoder.height);
        encoder.encodeFrame(offscreen, Math.round((i / fps) * 1_000_000));
      }

      const videoChunks = await encoder.flush();
      const decoderMeta = encoder.decoderMeta;

      if (videoChunks.length === 0) {
        throw new Error('Avatar capture produced no frames. Check browser WebGL2 and WebCodecs support.');
      }

      // Decode the WAV reference audio to PCM for muxing (input-side decode).
      let audioData = new Float32Array(0);
      let audioSampleRate = 48000;
      if (audioBlob && audioBlob.size > 0) {
        const audioCtx = new AudioContext();
        try {
          const decoded = await audioCtx.decodeAudioData(await audioBlob.arrayBuffer());
          audioData = decoded.getChannelData(0).slice();
          audioSampleRate = decoded.sampleRate;
        } finally {
          await audioCtx.close().catch(() => {});
        }
      }

      const { muxToMP4 } = await import('./mediabunny-muxer');
      return await muxToMP4({
        videoChunks,
        decoderMeta,
        audioData,
        audioSampleRate,
        fps,
        width: encoder.width,
        height: encoder.height,
      });
    } finally {
      encoder.close();
    }
  }

  /** Destroy and clean up all resources. */
  destroy(): void {
    try { this.head?.destroy(); } catch {}
    this.head = null;
    this._initialized = false;
    this._speakingPromise = null;
  }
}

export const talkingHeadEngine = new TalkingHeadEngine();
