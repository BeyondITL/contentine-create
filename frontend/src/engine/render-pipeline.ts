/**
 * Contentine Create -- Full Render Pipeline Orchestrator
 * Coordinates: TTS -> Image fetch -> Ken Burns Canvas -> Subtitle overlay -> WebCodecs -> Mediabunny -> MP4 Upload
 *
 * Architecture:
 *   Script -> TTS Worker (Kokoro) -> Audio per scene
 *   Script -> Image fetch -> Ken Burns Canvas -> Subtitle overlay per frame
 *   All frames -> WebCodecs H.264 encoder (deterministic frame-driven loop)
 *   H.264 bitstream + PCM audio -> Mediabunny muxer -> MP4 Blob
 *   MP4 Blob -> Upload to backend /api/videos/{id}/upload
 *
 * Error Recovery:
 *   - TTS failure per scene: skip voiceover, render silent with subtitles only
 *   - Image load failure: show branded gradient placeholder with scene number
 *   - Each major phase wrapped in try/catch with descriptive messages
 *   - Granular progress reporting within each phase
 */

import type { Scene, ScriptJSON, AspectRatio, RenderPhase } from '@/types';
import { getAiDisclosure } from '@/lib/ai-disclosure';

/** Result from the render pipeline, including any warnings for partial failures. */
export interface RenderResult {
  blob: Blob;
  warnings: string[];
}

export interface RenderOptions {
  script: ScriptJSON;
  voiceId: string;
  voiceSpeed: number;
  onPhaseChange: (phase: RenderPhase, message: string) => void;
  onProgress: (percent: number) => void;
}

// ─── Brand gradient colors for placeholder frames ─────────────────────────────

const BRAND_GRADIENT_STOPS = ['#00C3FF', '#F3A6FF', '#35C838'];

/** Draw a branded gradient placeholder frame with scene number text. */
function drawPlaceholderFrame(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  width: number,
  height: number,
  sceneNumber: number
): void {
  // Draw brand gradient background
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, BRAND_GRADIENT_STOPS[0]);
  gradient.addColorStop(0.5, BRAND_GRADIENT_STOPS[1]);
  gradient.addColorStop(1, BRAND_GRADIENT_STOPS[2]);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Draw semi-transparent overlay for text readability
  ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
  ctx.fillRect(0, 0, width, height);

  // Draw scene number text
  const scaleFactor = width / 1080;
  const fontSize = Math.round(48 * scaleFactor);
  ctx.font = `700 ${fontSize}px Inter, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.fillText(`Scene ${sceneNumber}`, width / 2, height / 2);
}

/** Load an image from URL into an HTMLImageElement with timeout. */
async function loadImage(url: string, timeoutMs: number = 30000): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    const timer = setTimeout(() => {
      img.src = '';
      reject(new Error(`Image load timed out after ${timeoutMs}ms: ${url}`));
    }, timeoutMs);

    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      reject(new Error(`Failed to load image: ${url}`));
    };
    img.src = url;
  });
}

/** Concatenate multiple Float32Arrays into one. */
function concatFloat32(arrays: Float32Array[]): Float32Array {
  const totalLength = arrays.reduce((sum, a) => sum + a.length, 0);
  const result = new Float32Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

// ─── Shared Pipeline Phases (TTS + Images) ───────────────────────────────────

interface PipelineContext {
  scenes: Scene[];
  voiceId: string;
  voiceSpeed: number;
  subtitleStyle: string;
  aspectRatio: AspectRatio;
  fps: number;
  bitrate: number;
  onPhaseChange: (phase: RenderPhase, message: string) => void;
  onProgress: (percent: number) => void;
  warnings: string[];
}

interface TTSPhaseResult {
  audioResults: Map<string, { buffer: Float32Array; sampleRate: number }>;
  fullAudio: Float32Array;
  sampleRate: number;
  sceneDurations: number[];
  failedScenes: number[];
}

/** Phase 1: Generate TTS audio for all scenes with per-scene error recovery. */
async function phaseTTS(ctx: PipelineContext): Promise<TTSPhaseResult> {
  const totalScenes = ctx.scenes.length;
  ctx.onPhaseChange('tts', `Generating voiceover (0/${totalScenes})...`);
  ctx.onProgress(5);

  // Dynamic import to keep TTS out of the static bundle
  const { ttsManager } = await import('./tts-manager');

  const audioResults = new Map<string, { buffer: Float32Array; sampleRate: number }>();
  const audioChunks: Float32Array[] = [];
  let sampleRate = 24000;
  const failedScenes: number[] = [];

  for (let i = 0; i < totalScenes; i++) {
    const scene = ctx.scenes[i];
    ctx.onPhaseChange('tts', `Generating voiceover (scene ${i + 1}/${totalScenes})...`);
    ctx.onProgress(5 + Math.round((i / totalScenes) * 15));

    if (!scene.narration.trim()) continue;

    try {
      const result = await ttsManager.synthesize(scene.narration, ctx.voiceId, ctx.voiceSpeed);
      audioResults.set(scene.id, result);
      audioChunks.push(result.buffer);
      sampleRate = result.sampleRate;
    } catch (err) {
      // TTS failed for this scene -- skip voiceover, render silent with subtitles only
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn(`[Render] TTS failed for scene ${i + 1}: ${errMsg}`);
      failedScenes.push(i);
      ctx.warnings.push(`Scene ${i + 1}: Voiceover skipped (TTS error: ${errMsg})`);
      // Insert silence for the scene's default duration so audio timeline stays aligned
      const silenceDuration = scene.duration || 5;
      const silenceSamples = Math.round(silenceDuration * sampleRate);
      audioChunks.push(new Float32Array(silenceSamples));
    }
  }

  const fullAudio = concatFloat32(audioChunks);

  // Recalculate scene durations based on actual TTS audio length or defaults
  const sceneDurations: number[] = [];
  for (let i = 0; i < ctx.scenes.length; i++) {
    const scene = ctx.scenes[i];
    const result = audioResults.get(scene.id);
    if (result) {
      const durationSec = result.buffer.length / result.sampleRate;
      sceneDurations.push(durationSec);
    } else {
      // No TTS result -- use default duration (either from scene config or 5s)
      sceneDurations.push(scene.duration || 5);
    }
  }

  ctx.onProgress(20);
  return { audioResults, fullAudio, sampleRate, sceneDurations, failedScenes };
}

/** Phase 2: Load all scene images with per-scene error recovery. */
async function phaseImages(ctx: PipelineContext): Promise<Map<string, HTMLImageElement>> {
  const totalScenes = ctx.scenes.length;
  ctx.onPhaseChange('images', `Loading scene images (0/${totalScenes})...`);
  ctx.onProgress(22);

  const images = new Map<string, HTMLImageElement>();
  for (let i = 0; i < totalScenes; i++) {
    const scene = ctx.scenes[i];
    ctx.onPhaseChange('images', `Loading scene images (${i + 1}/${totalScenes})...`);
    ctx.onProgress(22 + Math.round(((i + 1) / totalScenes) * 13));

    if (scene.image_url) {
      try {
        const img = await loadImage(scene.image_url);
        images.set(scene.id, img);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.warn(`[Render] Failed to load image for scene ${i + 1}: ${errMsg}`);
        ctx.warnings.push(`Scene ${i + 1}: Using placeholder image (load error)`);
        // Image not added to map -- compositing will use branded placeholder
      }
    }
  }

  ctx.onProgress(35);
  return images;
}

// ─── WebCodecs Primary Path ──────────────────────────────────────────────────

/** Render via WebCodecs H.264 encoder + Mediabunny muxer (primary path). */
async function renderWithWebCodecs(
  ctx: PipelineContext,
  images: Map<string, HTMLImageElement>,
  sceneDurations: number[],
  fullAudio: Float32Array,
  sampleRate: number,
): Promise<Blob> {
  // Dynamic imports for engine modules
  const { renderKenBurnsFrame, KB_PRESETS } = await import('./ken-burns');
  const { renderSubtitle, SUBTITLE_PRESETS, generateWordTimings, getCurrentSubtitleText } = await import('./subtitle-renderer');
  const { H264Encoder, getResolution, supportsWebCodecs } = await import('./webcodecs-encoder');
  const { muxToMP4 } = await import('./mediabunny-muxer');
  const { getCapabilities } = await import('./device-detect');

  // ── Phase 3: Compositing ────────────────────────────────────────────────────
  ctx.onPhaseChange('compositing', 'Compositing video frames...');
  ctx.onProgress(38);

  const capabilities = getCapabilities();
  const resolution = getResolution(ctx.aspectRatio, capabilities.tier);
  const canvas = new OffscreenCanvas(resolution.width, resolution.height);
  const canvasCtx = canvas.getContext('2d')!;

  let encoder: InstanceType<typeof H264Encoder> | null = null;

  try {
    encoder = new H264Encoder({
      aspectRatio: ctx.aspectRatio,
      fps: ctx.fps,
      bitrate: ctx.bitrate,
      tier: capabilities.tier,
    });
    await encoder.init();
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    throw new Error(`Video encoder initialization failed: ${errMsg}. Try using a different browser or device.`);
  }

  const style = SUBTITLE_PRESETS[ctx.subtitleStyle] || SUBTITLE_PRESETS['modern-pop'];
  let sceneStartTime = 0;
  const totalScenes = ctx.scenes.length;

  try {
    for (let sceneIdx = 0; sceneIdx < totalScenes; sceneIdx++) {
      const scene = ctx.scenes[sceneIdx];
      const duration = sceneDurations[sceneIdx];
      const totalFrames = Math.ceil(duration * ctx.fps);
      const image = images.get(scene.id);

      const kb = scene.ken_burns || KB_PRESETS['zoom-in'];
      const wordTimings = generateWordTimings(scene.narration, 0, duration);

      ctx.onPhaseChange('compositing', `Compositing scene ${sceneIdx + 1}/${totalScenes}...`);

      try {
        for (let frameIdx = 0; frameIdx < totalFrames; frameIdx++) {
          const t = frameIdx / Math.max(1, totalFrames - 1);
          const currentTime = frameIdx / ctx.fps;

          // Clear canvas
          canvasCtx.fillStyle = '#000000';
          canvasCtx.fillRect(0, 0, resolution.width, resolution.height);

          // Draw image or branded placeholder
          if (image) {
            renderKenBurnsFrame(canvasCtx, image, resolution.width, resolution.height, kb.start, kb.end, t);
          } else {
            drawPlaceholderFrame(canvasCtx, resolution.width, resolution.height, sceneIdx + 1);
          }

          // Draw subtitles
          if (ctx.subtitleStyle !== 'none' && scene.narration) {
            const { text } = getCurrentSubtitleText(wordTimings, currentTime);
            if (text) {
              renderSubtitle(canvasCtx, resolution.width, resolution.height, text, style);
            }
          }

          // Encode frame
          const timestampUs = Math.round((sceneStartTime + currentTime) * 1_000_000);
          encoder!.encodeFrame(canvas, timestampUs);
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`[Render] Compositing error on scene ${sceneIdx + 1}: ${errMsg}`);
        ctx.warnings.push(`Scene ${sceneIdx + 1}: Frame encoding error (${errMsg})`);
        // Continue to next scene rather than crashing the entire render
      }

      sceneStartTime += duration;

      // Progress: 38-70% during compositing
      const compositingProgress = 38 + Math.round(((sceneIdx + 1) / totalScenes) * 32);
      ctx.onProgress(Math.min(70, compositingProgress));
    }

    // ── Phase 4: Encoding ───────────────────────────────────────────────────────
    ctx.onPhaseChange('encoding', 'Encoding video...');
    ctx.onProgress(72);

    let videoChunks;
    let decoderMeta;
    try {
      videoChunks = await encoder!.flush();
      decoderMeta = encoder!.decoderMeta;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      throw new Error(`Video encoding failed during flush: ${errMsg}`);
    }

    if (videoChunks.length === 0) {
      throw new Error('Video encoding produced no frames. Check your scene data and try again.');
    }

    ctx.onProgress(80);

    // ── Phase 5: Muxing ─────────────────────────────────────────────────────────
    ctx.onPhaseChange('muxing', 'Finalizing MP4...');
    ctx.onProgress(82);

    let mp4Blob: Blob;
    try {
      mp4Blob = await muxToMP4({
        videoChunks,
        decoderMeta,
        audioData: fullAudio,
        audioSampleRate: sampleRate,
        fps: ctx.fps,
        width: resolution.width,
        height: resolution.height,
        onProgress: (pct) => ctx.onProgress(82 + Math.round(pct * 0.13)),
        // Law L7 / Art. 50(2): embed the user's AI-disclosure preset ('' ⇒ no tag)
        aiDisclosure: getAiDisclosure(),
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      throw new Error(`MP4 muxing failed: ${errMsg}. The video frames were encoded but could not be packaged.`);
    }

    ctx.onProgress(95);
    return mp4Blob;
  } finally {
    encoder?.close();
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Execute the full render pipeline with error recovery.
 * Export path is WebCodecs + Mediabunny only (Law L6 — captureStream/
 * MediaRecorder export is banned; deterministic frame-driven encode).
 * Returns a RenderResult with the video Blob and any warnings from partial failures.
 */
export async function renderVideo(options: RenderOptions): Promise<RenderResult> {
  const { script, voiceId, voiceSpeed, onPhaseChange, onProgress } = options;
  const scenes = script.scenes;
  const subtitleStyle = script.settings?.subtitle_style || 'modern-pop';
  const aspectRatio = (script.settings?.aspect_ratio || '9:16') as AspectRatio;

  if (!scenes || scenes.length === 0) {
    throw new Error('No scenes in script. Add at least one scene before generating.');
  }

  // Dynamic import for device-detect
  const { getCapabilities } = await import('./device-detect');
  const capabilities = getCapabilities();
  const fps = 30;
  const bitrate = capabilities.tier === 'high' ? 8_000_000 : 4_000_000;

  const warnings: string[] = [];

  const ctx: PipelineContext = {
    scenes,
    voiceId,
    voiceSpeed,
    subtitleStyle,
    aspectRatio,
    fps,
    bitrate,
    onPhaseChange,
    onProgress,
    warnings,
  };

  // ── Phase 1: TTS ──────────────────────────────────────────────────────────
  let ttsResult: TTSPhaseResult;
  try {
    ttsResult = await phaseTTS(ctx);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    // If TTS completely fails (e.g. worker crash), fall back to all-silent render
    console.error(`[Render] TTS phase failed entirely: ${errMsg}`);
    warnings.push(`Voiceover generation failed entirely: ${errMsg}. Rendering silent video.`);
    const defaultSampleRate = 24000;
    const sceneDurations = scenes.map((s) => s.duration || 5);
    const totalSilence = sceneDurations.reduce((a, b) => a + b, 0);
    ttsResult = {
      audioResults: new Map(),
      fullAudio: new Float32Array(Math.round(totalSilence * defaultSampleRate)),
      sampleRate: defaultSampleRate,
      sceneDurations,
      failedScenes: scenes.map((_, i) => i),
    };
    onPhaseChange('tts', 'Voiceover skipped (rendering silent)...');
    onProgress(20);
  }

  // ── Phase 2: Images ───────────────────────────────────────────────────────
  let images: Map<string, HTMLImageElement>;
  try {
    images = await phaseImages(ctx);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[Render] Image loading phase failed: ${errMsg}`);
    warnings.push(`Image loading failed: ${errMsg}. Using placeholder frames for all scenes.`);
    images = new Map();
    onProgress(35);
  }

  // ── Phase 3-5: Compositing + Encoding + Muxing ─────────────────────────────
  const { fullAudio, sampleRate, sceneDurations } = ttsResult;

  // WebCodecs is required — the legacy MediaRecorder/captureStream fallback
  // was removed under Law L6 (realtime capture can never be deterministic).
  const { supportsWebCodecs } = await import('./webcodecs-encoder');
  const webCodecsAvailable = await supportsWebCodecs();
  if (!webCodecsAvailable) {
    throw new Error(
      'Video export requires WebCodecs H.264 encoding, which this browser does not support. ' +
      'Please use a current version of Chrome, Edge, or Safari (16.4+).'
    );
  }

  const blob = await renderWithWebCodecs(ctx, images, sceneDurations, fullAudio, sampleRate);

  return { blob, warnings };
}

// ─── Audio-to-Video Path (F-11) ──────────────────────────────────────────────

/** One parsed narration segment from the transcript. */
export interface AudioScene {
  index: number;
  text: string;
  start: number;
  end: number;
}

export interface AudioToVideoOptions {
  /** The uploaded audio (or audio-bearing media) to turn into a captioned video. */
  audioBlob: Blob;
  aspectRatio?: AspectRatio;
  subtitleStyle?: string;
  onPhaseChange: (phase: RenderPhase, message: string) => void;
  onProgress: (percent: number) => void;
  /** Fired once transcription + scene parse completes, before rendering. */
  onTranscript?: (transcript: string, scenes: AudioScene[]) => void;
}

export interface AudioToVideoResult {
  blob: Blob;
  warnings: string[];
  transcript: string;
  scenes: AudioScene[];
}

/** Decode an audio blob to a mono Float32 PCM buffer at its native sample rate. */
async function decodeAudioToMono(blob: Blob): Promise<{ pcm: Float32Array; sampleRate: number; duration: number }> {
  const arrayBuffer = await blob.arrayBuffer();
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const audioCtx = new AudioCtx();
  try {
    const decoded = await audioCtx.decodeAudioData(arrayBuffer);
    const { numberOfChannels, length, sampleRate, duration } = decoded;
    if (numberOfChannels === 1) {
      const src = decoded.getChannelData(0);
      const pcm = new Float32Array(src.length);
      pcm.set(src);
      return { pcm, sampleRate, duration };
    }
    // Mix down to mono
    const mono = new Float32Array(length);
    for (let ch = 0; ch < numberOfChannels; ch++) {
      const data = decoded.getChannelData(ch);
      for (let s = 0; s < length; s++) mono[s] += data[s];
    }
    for (let s = 0; s < length; s++) mono[s] /= numberOfChannels;
    return { pcm: mono, sampleRate, duration };
  } finally {
    await audioCtx.close();
  }
}

/**
 * Parse Whisper chunks into narration scenes. Chunks are grouped into scenes at
 * sentence boundaries (terminal punctuation) or when a scene would exceed
 * `maxSceneSeconds`, so the rendered video reads scene-by-scene like the wizard
 * path rather than as one undifferentiated caption stream.
 */
function parseChunksIntoScenes(
  chunks: TranscriptChunkLike[],
  totalDuration: number,
  maxSceneSeconds = 6,
): AudioScene[] {
  const scenes: AudioScene[] = [];
  let buffer: string[] = [];
  let sceneStart: number | null = null;
  let lastEnd = 0;

  const flush = (end: number) => {
    if (buffer.length === 0) return;
    scenes.push({
      index: scenes.length,
      text: buffer.join(' ').replace(/\s+/g, ' ').trim(),
      start: sceneStart ?? 0,
      end,
    });
    buffer = [];
    sceneStart = null;
  };

  for (const chunk of chunks) {
    const text = chunk.text.trim();
    if (!text) continue;
    const start = Number.isFinite(chunk.timestamp?.[0]) ? chunk.timestamp[0] : lastEnd;
    const end = Number.isFinite(chunk.timestamp?.[1]) ? (chunk.timestamp[1] as number) : start;
    if (sceneStart === null) sceneStart = start;
    buffer.push(text);
    lastEnd = Math.max(lastEnd, end);

    const endsSentence = /[.!?]["')\]]?$/.test(text);
    const sceneLongEnough = end - (sceneStart ?? start) >= maxSceneSeconds;
    if (endsSentence || sceneLongEnough) flush(end);
  }
  flush(Math.max(lastEnd, totalDuration));

  // Guarantee at least one scene even if chunking was empty.
  if (scenes.length === 0) {
    scenes.push({ index: 0, text: '', start: 0, end: totalDuration });
  }
  return scenes;
}

/** Local alias mirroring the Whisper chunk shape (avoids importing the engine's type statically). */
interface TranscriptChunkLike {
  text: string;
  timestamp: [number, number];
}

/**
 * F-11 — Audio-to-video path. Transcribes an uploaded audio file on-device with
 * Whisper, parses the transcript into scenes, renders a captioned video whose
 * subtitles are driven by the model's real word timings (F-8), and muxes the
 * ORIGINAL uploaded audio back in via Mediabunny. WebCodecs + Mediabunny only
 * (Law L6 — no captureStream). Reuses existing engines end-to-end.
 */
export async function renderAudioToVideo(options: AudioToVideoOptions): Promise<AudioToVideoResult> {
  const { audioBlob, onPhaseChange, onProgress, onTranscript } = options;
  const aspectRatio = (options.aspectRatio || '9:16') as AspectRatio;
  const subtitleStyle = options.subtitleStyle || 'modern-pop';
  const warnings: string[] = [];

  // ── Phase 1: Transcribe (Whisper, on-device) ──────────────────────────────
  onPhaseChange('transcribing', 'Transcribing audio...');
  onProgress(2);
  const { whisperEngine } = await import('./whisper-engine');
  await whisperEngine.init((p) => onProgress(2 + Math.round(p * 20)));
  onProgress(24);
  const transcription = await whisperEngine.transcribe(audioBlob);
  const chunks: TranscriptChunkLike[] = (transcription.chunks ?? []).map((c) => ({
    text: c.text,
    timestamp: c.timestamp,
  }));
  if (chunks.length === 0 && transcription.text.trim()) {
    // No timestamped chunks (rare) — fall back to a single chunk spanning the clip.
    warnings.push('No word-level timings returned; captions use the full clip span.');
  }

  // ── Phase 2: Decode source audio for the muxer ────────────────────────────
  onProgress(28);
  const { pcm, sampleRate, duration } = await decodeAudioToMono(audioBlob);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error('Could not read the audio duration. Please try a different file (MP3, WAV, M4A).');
  }

  const chunksForRender: TranscriptChunkLike[] = chunks.length > 0
    ? chunks
    : [{ text: transcription.text.trim(), timestamp: [0, duration] }];
  const scenes = parseChunksIntoScenes(chunksForRender, duration);
  onTranscript?.(transcription.text.trim(), scenes);

  // ── Phase 3: Render frames (placeholder background + real-timed subtitles) ─
  const { getCapabilities } = await import('./device-detect');
  const { getResolution, H264Encoder, supportsWebCodecs } = await import('./webcodecs-encoder');
  const { renderSubtitle, SUBTITLE_PRESETS, wordTimingsFromChunks, getCurrentSubtitleText } = await import('./subtitle-renderer');
  const { muxToMP4 } = await import('./mediabunny-muxer');

  if (!(await supportsWebCodecs())) {
    throw new Error(
      'Video export requires WebCodecs H.264 encoding, which this browser does not support. ' +
      'Please use a current version of Chrome, Edge, or Safari (16.4+).'
    );
  }

  const fps = 30;
  const capabilities = getCapabilities();
  const resolution = getResolution(aspectRatio, capabilities.tier);
  const canvas = new OffscreenCanvas(resolution.width, resolution.height);
  const canvasCtx = canvas.getContext('2d')!;
  const style = SUBTITLE_PRESETS[subtitleStyle] || SUBTITLE_PRESETS['modern-pop'];
  const wordTimings = wordTimingsFromChunks(chunksForRender);

  onPhaseChange('compositing', 'Rendering captioned video...');
  onProgress(32);

  const encoder = new H264Encoder({
    aspectRatio,
    fps,
    bitrate: capabilities.tier === 'high' ? 8_000_000 : 4_000_000,
    tier: capabilities.tier,
  });
  await encoder.init();

  /** Which scene owns a given time (for the per-scene placeholder background). */
  const sceneAtTime = (t: number): AudioScene => {
    for (const s of scenes) if (t >= s.start && t < s.end) return s;
    return scenes[scenes.length - 1];
  };

  try {
    const totalFrames = Math.max(1, Math.ceil(duration * fps));
    for (let frameIdx = 0; frameIdx < totalFrames; frameIdx++) {
      const currentTime = frameIdx / fps;
      const scene = sceneAtTime(currentTime);

      // Branded placeholder background keyed to the current scene (honest: no
      // fabricated imagery — audio-to-video ships captions over brand frames).
      drawPlaceholderFrame(canvasCtx, resolution.width, resolution.height, scene.index + 1);

      if (subtitleStyle !== 'none') {
        const { text } = getCurrentSubtitleText(wordTimings, currentTime);
        if (text) renderSubtitle(canvasCtx, resolution.width, resolution.height, text, style);
      }

      encoder.encodeFrame(canvas, Math.round(currentTime * 1_000_000));

      if (frameIdx % 15 === 0) {
        onProgress(32 + Math.round((frameIdx / totalFrames) * 40));
      }
    }

    // ── Phase 4: Encode ──────────────────────────────────────────────────────
    onPhaseChange('encoding', 'Encoding video...');
    onProgress(74);
    const videoChunks = await encoder.flush();
    const decoderMeta = encoder.decoderMeta;
    if (videoChunks.length === 0) {
      throw new Error('Video encoding produced no frames.');
    }

    // ── Phase 5: Mux original audio + video ─────────────────────────────────
    onPhaseChange('muxing', 'Finalizing MP4...');
    onProgress(82);
    const blob = await muxToMP4({
      videoChunks,
      decoderMeta,
      audioData: pcm,
      audioSampleRate: sampleRate,
      fps,
      width: resolution.width,
      height: resolution.height,
      onProgress: (pct) => onProgress(82 + Math.round(pct * 0.16)),
      // Law L7 / Art. 50(2): embed the user's AI-disclosure preset ('' ⇒ no tag)
      aiDisclosure: getAiDisclosure(),
    });

    onProgress(100);
    onPhaseChange('complete', 'Done');
    return { blob, warnings, transcript: transcription.text.trim(), scenes };
  } finally {
    encoder.close();
  }
}

/** Upload the rendered MP4 to the backend. */
export async function uploadVideo(videoId: number, mp4Blob: Blob): Promise<string> {
  const { api } = await import('@/lib/api');
  const result = await api.upload(`/videos/${videoId}/upload`, mp4Blob, `video_${videoId}.mp4`);
  return result.path;
}
