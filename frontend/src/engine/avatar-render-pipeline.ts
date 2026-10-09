/**
 * Contentine Create — Avatar Render Pipeline
 * Specialized pipeline for avatar-style videos with face animation.
 *
 * Architecture:
 *   Avatar photo → face-api.js landmarks → animation frames from TTS audio
 *   Per-frame: base image + face animation + subtitle overlay → WebCodecs → Mediabunny → MP4
 *
 * All processing is browser-side.
 */

import type { ScriptJSON, AspectRatio, RenderPhase } from '@/types';
import type { FaceData, AnimationFrame } from './face-animator';
import { ttsManager, type TTSResult } from './tts-manager';
import { renderSubtitle, SUBTITLE_PRESETS, generateWordTimings, getCurrentSubtitleText } from './subtitle-renderer';
import { H264Encoder, getResolution, supportsWebCodecs } from './webcodecs-encoder';
import { muxToMP4 } from './mediabunny-muxer';
import { getCapabilities } from './device-detect';

/**
 * SA-30: Mediabunny selects HE-AAC (`mp4a.40.5`) for low-sample-rate mono audio,
 * a profile this browser's WebCodecs AudioEncoder cannot encode ("encoder
 * configuration … is not supported"). Kokoro TTS emits 24 kHz mono. Resampling to
 * 48 kHz makes Mediabunny pick AAC-LC (`mp4a.40.2`) — the broadly-supported
 * profile the cartoon lane already muxes with. Only the avatar lane calls this;
 * the shared muxer (and cartoon L6 determinism) is untouched.
 */
async function resampleAudio(data: Float32Array, fromRate: number, toRate: number): Promise<Float32Array> {
  if (fromRate === toRate || data.length === 0) return data;
  const frames = Math.max(1, Math.round((data.length * toRate) / fromRate));
  const ctx = new OfflineAudioContext(1, frames, toRate);
  const src = ctx.createBuffer(1, data.length, fromRate);
  src.getChannelData(0).set(data);
  const node = ctx.createBufferSource();
  node.buffer = src;
  node.connect(ctx.destination);
  node.start();
  const rendered = await ctx.startRendering();
  return rendered.getChannelData(0).slice();
}

export interface AvatarRenderOptions {
  /** The ScriptJSON with scenes (narration-only, no images needed). */
  script: ScriptJSON;
  /** Avatar photo URL to render. */
  avatarPhotoUrl: string;
  /** Pre-detected face data from face-api.js. */
  faceData: FaceData;
  /** Voice ID for TTS. */
  voiceId: string;
  /** Voice speed multiplier. */
  voiceSpeed: number;
  /** Background style behind the avatar. */
  backgroundStyle: 'solid' | 'gradient' | 'blur';
  /** Background color (for solid mode). */
  backgroundColor: string;
  /** Callbacks. */
  onPhaseChange: (phase: RenderPhase, message: string) => void;
  onProgress: (percent: number) => void;
}

/** Load an image from URL into an HTMLImageElement. */
async function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load avatar image: ${url}`));
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

/** Draw blurred background from avatar image. */
function drawBlurredBackground(
  ctx: OffscreenCanvasRenderingContext2D,
  image: HTMLImageElement,
  width: number,
  height: number
): void {
  ctx.save();
  ctx.filter = 'blur(30px) brightness(0.4)';
  // Fill entire canvas with scaled/cropped image
  const imgRatio = image.width / image.height;
  const canvasRatio = width / height;
  let drawW = width;
  let drawH = height;
  let drawX = 0;
  let drawY = 0;
  if (imgRatio > canvasRatio) {
    drawH = height;
    drawW = height * imgRatio;
    drawX = (width - drawW) / 2;
  } else {
    drawW = width;
    drawH = width / imgRatio;
    drawY = (height - drawH) / 2;
  }
  ctx.drawImage(image, drawX, drawY, drawW, drawH);
  ctx.restore();
}

/** Draw gradient background. */
function drawGradientBackground(
  ctx: OffscreenCanvasRenderingContext2D,
  width: number,
  height: number
): void {
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#1a1a2e');
  gradient.addColorStop(0.5, '#16213e');
  gradient.addColorStop(1, '#0f3460');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

/**
 * Render a single avatar frame with face animation.
 * Uses the face-animator module's logic inline to avoid circular imports on OffscreenCanvas.
 */
function renderAvatarFrameOnCanvas(
  ctx: OffscreenCanvasRenderingContext2D,
  image: HTMLImageElement,
  canvasWidth: number,
  canvasHeight: number,
  faceData: FaceData,
  animation: AnimationFrame,
  backgroundStyle: 'solid' | 'gradient' | 'blur',
  backgroundColor: string
): void {
  // Draw background
  if (backgroundStyle === 'blur') {
    drawBlurredBackground(ctx, image, canvasWidth, canvasHeight);
  } else if (backgroundStyle === 'gradient') {
    drawGradientBackground(ctx, canvasWidth, canvasHeight);
  } else {
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  }

  // Calculate scale to fit avatar in frame (centered, with padding)
  const padding = 0.05; // 5% padding
  const availW = canvasWidth * (1 - padding * 2);
  const availH = canvasHeight * (1 - padding * 2);
  const scale = Math.min(availW / image.width, availH / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  const offsetX = (canvasWidth - drawWidth) / 2;
  const offsetY = (canvasHeight - drawHeight) / 2 - canvasHeight * 0.05; // Slight upward shift for subtitle space

  ctx.save();

  // Apply head bob and rotation centered on face
  const centerX = offsetX + (faceData.faceBox.x + faceData.faceBox.width / 2) * scale;
  const centerY = offsetY + (faceData.faceBox.y + faceData.faceBox.height / 2) * scale;

  ctx.translate(centerX, centerY);
  ctx.rotate((animation.headRotation * Math.PI) / 180);
  ctx.translate(-centerX, -centerY + animation.headBob);

  // Draw the avatar image
  ctx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);

  // Animate mouth — dark ellipse overlay
  if (animation.mouthOpen > 0.05) {
    const mouth = faceData.mouth;
    if (mouth.length >= 12) {
      ctx.save();
      const upperLip = mouth[3];
      const lowerLip = mouth[9];
      const leftCorner = mouth[0];
      const rightCorner = mouth[6];

      const mouthCenterX = offsetX + ((leftCorner.x + rightCorner.x) / 2) * scale;
      const mouthCenterY = offsetY + ((upperLip.y + lowerLip.y) / 2) * scale;
      const mouthWidth = Math.abs(rightCorner.x - leftCorner.x) * scale * 0.7;
      const mouthHeight = Math.abs(lowerLip.y - upperLip.y) * scale * animation.mouthOpen * 2;

      ctx.fillStyle = 'rgba(30, 20, 20, 0.85)';
      ctx.beginPath();
      ctx.ellipse(
        mouthCenterX,
        mouthCenterY + mouthHeight * 0.2,
        mouthWidth * 0.5,
        Math.max(2, mouthHeight * 0.5),
        0, 0, Math.PI * 2
      );
      ctx.fill();
      ctx.restore();
    }
  }

  // Animate eye blinks
  if (animation.leftEyeOpen < 0.95) {
    drawEyeBlink(ctx, faceData.leftEye, scale, offsetX, offsetY, 1 - animation.leftEyeOpen);
  }
  if (animation.rightEyeOpen < 0.95) {
    drawEyeBlink(ctx, faceData.rightEye, scale, offsetX, offsetY, 1 - animation.rightEyeOpen);
  }

  ctx.restore();
}

/** Draw an eye blink overlay. */
function drawEyeBlink(
  ctx: OffscreenCanvasRenderingContext2D,
  eyePoints: { x: number; y: number }[],
  scale: number,
  offsetX: number,
  offsetY: number,
  closedness: number
): void {
  if (eyePoints.length < 6) return;

  const xs = eyePoints.map((p) => p.x);
  const ys = eyePoints.map((p) => p.y);
  const minX = Math.min(...xs) * scale + offsetX;
  const maxX = Math.max(...xs) * scale + offsetX;
  const minY = Math.min(...ys) * scale + offsetY;
  const maxY = Math.max(...ys) * scale + offsetY;

  const eyeWidth = maxX - minX;
  const eyeHeight = maxY - minY;
  const eyeCenterY = (minY + maxY) / 2;

  const lidHeight = eyeHeight * closedness * 1.5;
  ctx.fillStyle = 'rgba(200, 170, 140, 0.9)';
  ctx.fillRect(minX - 2, eyeCenterY - lidHeight / 2, eyeWidth + 4, lidHeight);
}

/**
 * Execute the avatar render pipeline.
 * Returns the final MP4 Blob.
 */
export async function renderAvatarVideo(options: AvatarRenderOptions): Promise<Blob> {
  const {
    script, avatarPhotoUrl, faceData, voiceId, voiceSpeed,
    backgroundStyle, backgroundColor,
    onPhaseChange, onProgress,
  } = options;

  const scenes = script.scenes;
  const subtitleStyle = script.settings?.subtitle_style || 'modern-pop';
  const aspectRatio = (script.settings?.aspect_ratio || '9:16') as AspectRatio;

  const capabilities = getCapabilities();
  const fps = 30;
  const bitrate = capabilities.tier === 'high' ? 8_000_000 : 4_000_000;

  // Check WebCodecs availability early
  const webCodecsAvailable = await supportsWebCodecs();
  if (!webCodecsAvailable) {
    throw new Error('WebCodecs not available. Please use Chrome 94+ for video rendering.');
  }

  // ─── PHASE 1: TTS ─────────────────────────────────────────
  onPhaseChange('tts', 'Generating voiceover...');
  onProgress(5);

  const audioResults = new Map<string, TTSResult>();
  const audioChunks: Float32Array[] = [];
  let sampleRate = 24000;

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    if (!scene.narration.trim()) continue;

    onProgress(5 + Math.round((i / scenes.length) * 15));

    const result = await ttsManager.synthesize(scene.narration, voiceId, voiceSpeed);
    audioResults.set(scene.id, result);
    audioChunks.push(result.buffer);
    sampleRate = result.sampleRate;
  }

  const fullAudio = concatFloat32(audioChunks);

  // Recalculate scene durations from actual TTS audio
  const sceneDurations: number[] = [];
  for (const scene of scenes) {
    const result = audioResults.get(scene.id);
    if (result) {
      sceneDurations.push(result.buffer.length / result.sampleRate);
    } else {
      sceneDurations.push(scene.duration || 5);
    }
  }

  // ─── PHASE 2: LOAD AVATAR ─────────────────────────────────
  onPhaseChange('images', 'Preparing avatar...');
  onProgress(25);

  const avatarImage = await loadImage(avatarPhotoUrl);

  // ─── PHASE 3: COMPOSITING ─────────────────────────────────
  onPhaseChange('compositing', 'Animating avatar...');
  onProgress(35);

  const resolution = getResolution(aspectRatio, capabilities.tier);
  const canvas = new OffscreenCanvas(resolution.width, resolution.height);
  const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D | null;
  if (!ctx) throw new Error('Failed to create OffscreenCanvas 2D context');

  const encoder = new H264Encoder({ aspectRatio, fps, bitrate, tier: capabilities.tier });
  await encoder.init();

  const style = SUBTITLE_PRESETS[subtitleStyle] || SUBTITLE_PRESETS['modern-pop'];
  let globalTimeOffset = 0;

  try {
    for (let sceneIdx = 0; sceneIdx < scenes.length; sceneIdx++) {
      const scene = scenes[sceneIdx];
      const duration = sceneDurations[sceneIdx];
      const totalFrames = Math.ceil(duration * fps);

      // Get audio data for this scene to generate animation frames
      const sceneAudio = audioResults.get(scene.id);
      let animationFrames: AnimationFrame[];

      if (sceneAudio) {
        // Dynamic import to avoid bundling face-api.js in main chunk
        const { generateAnimationFrames } = await import('./face-animator');
        animationFrames = generateAnimationFrames(sceneAudio.buffer, sceneAudio.sampleRate, fps);
      } else {
        // No audio — generate idle frames
        animationFrames = Array.from({ length: totalFrames }, (_, i) => {
          const time = i / fps;
          return {
            mouthOpen: 0,
            leftEyeOpen: 1,
            rightEyeOpen: 1,
            headRotation: Math.sin(time * 0.8) * 1.5,
            headBob: Math.sin(time * 1.5) * 1.5,
          };
        });
      }

      // Word timings for subtitles
      const wordTimings = generateWordTimings(scene.narration, 0, duration);

      for (let frameIdx = 0; frameIdx < totalFrames; frameIdx++) {
        const currentTime = frameIdx / fps;
        const animFrame = animationFrames[Math.min(frameIdx, animationFrames.length - 1)];

        // Render avatar frame with animation
        renderAvatarFrameOnCanvas(
          ctx, avatarImage, resolution.width, resolution.height,
          faceData, animFrame, backgroundStyle, backgroundColor
        );

        // Draw subtitles
        if (subtitleStyle !== 'none' && scene.narration) {
          const { text } = getCurrentSubtitleText(wordTimings, currentTime);
          if (text) {
            renderSubtitle(ctx, resolution.width, resolution.height, text, style);
          }
        }

        // Encode frame
        const timestampUs = Math.round((globalTimeOffset + currentTime) * 1_000_000);
        encoder.encodeFrame(canvas, timestampUs);
      }

      globalTimeOffset += duration;
      onProgress(35 + Math.round(((sceneIdx + 1) / scenes.length) * 35));
    }

    // ─── PHASE 4: ENCODING ────────────────────────────────────
    onPhaseChange('encoding', 'Encoding video...');
    onProgress(75);

    const videoChunks = await encoder.flush();
    const decoderMeta = encoder.decoderMeta;

    // ─── PHASE 5: MUXING ──────────────────────────────────────
    onPhaseChange('muxing', 'Creating MP4 file...');
    onProgress(85);

    // SA-30: lift 24 kHz mono → 48 kHz so the muxer negotiates AAC-LC, not HE-AAC.
    const muxSampleRate = sampleRate < 32000 ? 48000 : sampleRate;
    const muxAudio = await resampleAudio(fullAudio, sampleRate, muxSampleRate);

    const mp4Blob = await muxToMP4({
      videoChunks,
      decoderMeta,
      audioData: muxAudio,
      audioSampleRate: muxSampleRate,
      fps,
      width: resolution.width,
      height: resolution.height,
      onProgress: (pct) => onProgress(85 + Math.round(pct * 0.1)),
    });

    onProgress(95);
    return mp4Blob;
  } finally {
    encoder.close();
  }
}
