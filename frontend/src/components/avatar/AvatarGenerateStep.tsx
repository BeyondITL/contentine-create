'use client';

import { useState, useRef, useEffect } from 'react';
import {
  Play,
  Mic,
  Palette,
  Clock,
  FileText,
  Users,
  Monitor,
  Smartphone,
  Square,
  Check,
  AlertCircle,
  Loader2,
  ExternalLink,
  Sparkles,
  Box,
  Camera,
  Crown,
  Download,
  Info,
  Settings,
} from 'lucide-react';
import { useAvatarStore } from '@/stores/avatar-store';
import { useVideoStore } from '@/stores/video-store';
import { ProgressBar } from '@/components/ui';
import type { RenderPhase } from '@/types';

/** Convert Float32Array audio to WAV Blob for upload. */
function float32ToWavBlob(data: Float32Array, sampleRate: number): Blob {
  const numChannels = 1;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = data.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bytesPerSample * 8, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < data.length; i++, offset += 2) {
    const sample = Math.max(-1, Math.min(1, data[i]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

/** Convert Blob to base64 string. */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1] || '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Robustly verify a GLB binary is actually present — NOT masked by the SPA
 * fallback. The `.htaccess`/serve rewrite turns a missing `/models/avatars/*.glb`
 * into index.html served with HTTP 200 + `text/html`, so a plain `res.ok` (or
 * bare HEAD) reports the asset as present when it is not (SA-26). We therefore
 * range-GET the first 12 bytes and require BOTH a non-HTML content-type AND the
 * glTF-binary magic number `glTF` (0x67 0x6C 0x54 0x46). Returns false on any
 * ambiguity so a missing binary can never be treated as available.
 */
async function isGlbBinaryAvailable(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { headers: { Range: 'bytes=0-11' } });
    if (!res.ok) return false;
    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    if (contentType.includes('text/html')) return false; // SPA fallback
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length < 4) return false;
    // 'glTF' little-endian magic for binary glTF (.glb)
    return buf[0] === 0x67 && buf[1] === 0x6c && buf[2] === 0x54 && buf[3] === 0x46;
  } catch {
    return false;
  }
}

/** Step 5 — Summary + Generate avatar video with real render pipeline. */
export default function AvatarGenerateStep() {
  const avatar = useAvatarStore();
  const videoStore = useVideoStore();
  const [isRendering, setIsRendering] = useState(false);
  const [renderComplete, setRenderComplete] = useState(false);
  const [videoId, setVideoId] = useState<number | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const mp4BlobRef = useRef<Blob | null>(null);

  // Tier availability checks
  const [glbModelAvailable, setGlbModelAvailable] = useState<boolean | null>(null);
  const [wav2lipModelAvailable, setWav2lipModelAvailable] = useState<boolean | null>(null);
  const [didApiAvailable, setDidApiAvailable] = useState<boolean | null>(null);

  const selectedAvatar = avatar.getSelectedAvatar();
  const avatarName = selectedAvatar?.name || 'Custom Avatar';
  const avatarPhotoUrl = avatar.customAvatarUrl || selectedAvatar?.photo_path || null;
  const tier = avatar.avatarTier;

  // Check tier-specific availability on mount
  useEffect(() => {
    if (tier === 'quick') {
      // Check if GLB model exists at runtime
      const modelUrl = selectedAvatar?.photo_path?.endsWith('.glb')
        ? selectedAvatar.photo_path
        : '/models/avatars/default.glb';
      isGlbBinaryAvailable(modelUrl)
        .then(setGlbModelAvailable)
        .catch(() => setGlbModelAvailable(false));
    }

    if (tier === 'photo') {
      // Check if Wav2Lip ONNX model is downloaded
      import('@/engine/wav2lip-engine').then(({ wav2lipEngine }) => {
        wav2lipEngine.isModelAvailable().then(setWav2lipModelAvailable);
      }).catch(() => setWav2lipModelAvailable(false));
    }

    if (tier === 'pro') {
      // Check if D-ID API key is configured via backend
      import('@/lib/api').then(({ api }) => {
        api.get<{ available: boolean }>('/avatar/pro/available')
          .then((res) => setDidApiAvailable(res.available))
          .catch(() => setDidApiAvailable(false));
      });
    }
  }, [tier, selectedAvatar]);

  const hasNarration = avatar.scenes.some((s) => s.narration.trim().length > 0);
  const hasVoice = avatar.voiceId !== null;
  const hasFace = avatar.faceDetected;
  // Quick tier (TalkingHead 3D) doesn't strictly need face detection on the photo
  const canGenerate = (tier === 'quick' || hasFace) && hasNarration && hasVoice && (!!avatarPhotoUrl || tier === 'quick');

  const tierLabel = tier === 'quick' ? 'Quick Avatar (3D)' : tier === 'photo' ? 'Photo Avatar (Wav2Lip)' : 'Pro Avatar (D-ID)';
  const tierIcon = tier === 'quick' ? <Box size={16} /> : tier === 'photo' ? <Camera size={16} /> : <Crown size={16} />;

  const totalDuration = avatar.scenes.reduce((sum, s) => sum + s.duration, 0);

  const aspectIcon = avatar.aspectRatio === '9:16'
    ? <Smartphone size={14} />
    : avatar.aspectRatio === '16:9'
      ? <Monitor size={14} />
      : <Square size={14} />;

  async function handleGenerate() {
    if (!canGenerate) return;
    setIsRendering(true);
    setRenderError(null);

    try {
      // Create video record
      const video = await videoStore.createVideo({
        title: avatar.title || `Avatar Video ${new Date().toLocaleDateString()}`,
        type: 'avatar',
        aspect_ratio: avatar.aspectRatio,
        script_json: avatar.toScriptJSON(),
        voice_profile_id: avatar.voiceId,
        status: 'rendering',
      });
      setVideoId(video.id);

      let videoBlob: Blob;

      if (tier === 'quick') {
        // Tier 1: TalkingHead 3D avatar — outputs mp4 via WebCodecs + Mediabunny
        videoBlob = await renderWithTalkingHead(video.id);
      } else if (tier === 'pro') {
        // Tier 3: D-ID Pro avatar (API) — outputs mp4 from D-ID
        videoBlob = await renderWithDID(video.id);
      } else {
        // Tier 2: Wav2Lip photo-to-video — outputs mp4 via WebCodecs + Mediabunny
        videoBlob = await renderWithWav2Lip(video.id);
      }

      // If the result is webm (Tier 1), try to convert to MP4 for consistent upload.
      // If conversion fails, upload the webm as-is — backend handles both formats.
      if (videoBlob.type.includes('webm')) {
        try {
          videoStore.setRenderPhase('muxing' as RenderPhase, 'Converting to MP4...');
          videoStore.setRenderProgress(92);
          const { convertFormat } = await import('@/engine/mediabunny-muxer');
          videoBlob = await convertFormat(videoBlob, 'mp4', (pct) => {
            videoStore.setRenderProgress(92 + Math.round(pct * 0.03));
          });
        } catch {
          // Conversion failed — upload webm as-is
          console.warn('[AvatarGenerate] WebM→MP4 conversion failed, uploading webm');
        }
      }

      mp4BlobRef.current = videoBlob;

      // Upload to backend — NON-BLOCKING (Law L2). The MP4 already exists
      // client-side and is downloadable via handleDownload(mp4BlobRef); a backend
      // upload/sync failure must never discard a completed render (SA-31). Mirror
      // createVideo's local-first, best-effort-sync pattern: attempt the upload,
      // but complete and deliver the local video regardless of backend reachability.
      videoStore.setRenderPhase('uploading' as RenderPhase, 'Saving your avatar video...');
      videoStore.setRenderProgress(96);

      try {
        const { uploadVideo } = await import('@/engine/render-pipeline');
        const videoPath = await uploadVideo(video.id, videoBlob);
        await videoStore.updateVideo(video.id, {
          status: 'completed',
          mp4_path: videoPath,
          duration_seconds: totalDuration,
        });
      } catch (uploadErr) {
        // Backend unavailable / offline — keep the local render; sync stays pending.
        console.warn('[AvatarGenerate] Backend upload failed; delivering local MP4 (sync deferred):', uploadErr);
        await videoStore
          .updateVideo(video.id, { status: 'completed', duration_seconds: totalDuration })
          .catch(() => { /* local update best-effort */ });
      }

      videoStore.setRenderPhase('complete', 'Avatar video ready!');
      videoStore.setRenderProgress(100);
      setRenderComplete(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Render failed. Please try again.';
      videoStore.setRenderPhase('error', message);
      setRenderError(message);

      // Update video status to failed if we have a video ID
      if (videoId) {
        try {
          await videoStore.updateVideo(videoId, { status: 'failed' });
        } catch {
          // Silent — the error message is already shown to the user
        }
      }
    } finally {
      setIsRendering(false);
    }
  }

  /** Tier 1 — TalkingHead 3D avatar render with audio. */
  async function renderWithTalkingHead(_videoId: number): Promise<Blob> {
    videoStore.setRenderPhase('images' as RenderPhase, 'Loading 3D avatar engine...');
    videoStore.setRenderProgress(5);

    // Check WebGL2 availability first
    const { talkingHeadEngine } = await import('@/engine/talkinghead-engine');
    const webgl2Ok = await talkingHeadEngine.isAvailable();
    if (!webgl2Ok) {
      throw new Error(
        'WebGL2 is not available in this browser. ' +
        'Quick Avatar (3D) requires WebGL2 support. ' +
        'Please use Chrome, Firefox, or Edge with hardware acceleration enabled.'
      );
    }

    // Create an offscreen container for the 3D avatar canvas
    const container = document.createElement('div');
    container.style.width = '512px';
    container.style.height = '512px';
    container.style.position = 'fixed';
    container.style.left = '-9999px';
    container.style.top = '0px';
    document.body.appendChild(container);

    try {
      const selectedAv = avatar.getSelectedAvatar();
      // TalkingHead uses GLB 3D models; preset avatars point to .svg photos so use a
      // default GLB model when no GLB path is available
      const modelUrl = selectedAv?.photo_path?.endsWith('.glb')
        ? selectedAv.photo_path
        : '/models/avatars/default.glb';

      // Verify the GLB *binary* exists before attempting to load it. A bare
      // HEAD/res.ok is defeated by the SPA fallback (index.html at 200/text-html
      // for a missing .glb, SA-26), which would hand the loader HTML to parse as
      // a 3D model. isGlbBinaryAvailable requires the glTF magic bytes.
      if (!(await isGlbBinaryAvailable(modelUrl))) {
        throw new Error(
          `3D avatar model not found at ${modelUrl}. ` +
          'Please download the default GLB model or select a different avatar tier. ' +
          'Run "npm run setup-assets" to download required models.'
        );
      }

      const gender: 'F' | 'M' = selectedAv?.gender === 'male' ? 'M' : 'F';

      videoStore.setRenderPhase('images' as RenderPhase, 'Initializing 3D avatar...');
      videoStore.setRenderProgress(15);
      await talkingHeadEngine.init(container, modelUrl, { body: gender });

      // Generate TTS audio for all scenes
      videoStore.setRenderPhase('tts', 'Generating voiceover...');
      videoStore.setRenderProgress(25);

      const { ttsManager } = await import('@/engine/tts-manager');
      const allNarration = avatar.scenes.map((s) => s.narration).join(' ');
      // SA-29: pass the selected voice's Kokoro model id (e.g. 'af_sky'), NOT the
      // numeric profile id — ttsManager rejects a numeric id ("Voice '1' not found").
      const kokoroVoiceId = avatar.voices.find((v) => v.id === avatar.voiceId)?.kokoro_voice_id || 'af_bella';
      const ttsResult = await ttsManager.synthesize(allNarration, kokoroVoiceId, avatar.voiceSpeed);

      // Convert TTS PCM to WAV Blob for MediaRecorder audio mixing
      const wavBlob = float32ToWavBlob(ttsResult.buffer, ttsResult.sampleRate);

      // Convert Float32Array to ArrayBuffer for TalkingHead lip-sync
      const audioArrayBuffer = ttsResult.buffer.buffer.slice(
        ttsResult.buffer.byteOffset,
        ttsResult.buffer.byteOffset + ttsResult.buffer.byteLength
      ) as ArrayBuffer;

      videoStore.setRenderPhase('compositing', 'Recording 3D avatar animation...');
      videoStore.setRenderProgress(45);

      // Start speaking (non-blocking) and record simultaneously
      const durationMs = Math.ceil((ttsResult.buffer.length / ttsResult.sampleRate) * 1000);
      talkingHeadEngine.startSpeaking(audioArrayBuffer);

      videoStore.setRenderPhase('encoding', 'Capturing video with audio...');
      videoStore.setRenderProgress(55);

      // Record canvas + audio together into a single webm blob
      const recordedBlob = await talkingHeadEngine.record(durationMs, wavBlob);

      // Wait for speaking animation to complete
      await talkingHeadEngine.waitForSpeaking();

      videoStore.setRenderProgress(90);
      return recordedBlob;
    } finally {
      talkingHeadEngine.destroy();
      container.remove();
    }
  }

  /** Tier 2 — Wav2Lip photo-to-video render. Tries ONNX Wav2Lip first, falls back to face-animator. */
  async function renderWithWav2Lip(_videoId: number): Promise<Blob> {
    if (!avatarPhotoUrl) throw new Error('No avatar photo selected');

    videoStore.setRenderPhase('images' as RenderPhase, 'Preparing avatar...');
    videoStore.setRenderProgress(5);

    // Load the avatar image
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Failed to load avatar image'));
      img.src = avatarPhotoUrl;
    });

    // Detect face landmarks (needed by both paths)
    const { initFaceDetection, detectFace, getDefaultFaceData } = await import('@/engine/face-animator');
    let faceData;
    try {
      await initFaceDetection((percent, message) => {
        videoStore.setRenderPhase('images' as RenderPhase, message);
        videoStore.setRenderProgress(5 + percent * 0.1);
      });
      faceData = await detectFace(img);
    } catch {
      faceData = null;
    }
    if (!faceData) {
      faceData = getDefaultFaceData(img.naturalWidth || 400, img.naturalHeight || 400);
    }

    // Try Wav2Lip ONNX engine if the model file is available
    const { wav2lipEngine } = await import('@/engine/wav2lip-engine');
    const modelAvailable = await wav2lipEngine.isModelAvailable();

    if (modelAvailable) {
      try {
        return await renderWithWav2LipONNX(img, faceData, wav2lipEngine);
      } catch (err) {
        console.warn('[Wav2Lip] ONNX engine failed, falling back to face-animator:', err);
        // Fall through to face-animator pipeline
      }
    }

    // Fallback: Use the face-animator pseudo-avatar pipeline
    videoStore.setRenderPhase('compositing', 'Animating avatar with face engine...');
    videoStore.setRenderProgress(30);

    const { renderAvatarVideo } = await import('@/engine/avatar-render-pipeline');
    return renderAvatarVideo({
      script: avatar.toScriptJSON(),
      avatarPhotoUrl,
      faceData,
      // SA-29: pass the Kokoro model voice id (e.g. 'af_bella'), not the numeric
      // profile id — the pipeline feeds this straight to the TTS engine.
      voiceId: avatar.voices.find((v) => v.id === avatar.voiceId)?.kokoro_voice_id || 'af_bella',
      voiceSpeed: avatar.voiceSpeed,
      backgroundStyle: avatar.backgroundStyle,
      backgroundColor: avatar.backgroundColor,
      onPhaseChange: (phase: RenderPhase, message: string) => {
        videoStore.setRenderPhase(phase, message);
      },
      onProgress: (percent: number) => {
        videoStore.setRenderProgress(percent);
      },
    });
  }

  /**
   * Render using the real Wav2Lip ONNX model for photorealistic lip sync.
   * Generates TTS audio, runs Wav2Lip inference per frame, composites onto the
   * original photo, encodes via WebCodecs, and muxes with Mediabunny.
   */
  async function renderWithWav2LipONNX(
    img: HTMLImageElement,
    faceData: { faceBox: { x: number; y: number; width: number; height: number } },
    wav2lip: { init: (cb?: (pct: number) => void) => Promise<void>; cropFace: (img: HTMLImageElement, box: { x: number; y: number; width: number; height: number }) => HTMLCanvasElement; animate: (face: HTMLCanvasElement, audio: Float32Array, fps?: number, onProgress?: (f: number, t: number) => void) => Promise<ImageData[]>; compositeFrames: (img: HTMLImageElement, faces: ImageData[], box: { x: number; y: number; width: number; height: number }, w: number, h: number) => OffscreenCanvas[] }
  ): Promise<Blob> {
    // Initialize Wav2Lip ONNX model
    videoStore.setRenderPhase('images' as RenderPhase, 'Loading Wav2Lip model...');
    videoStore.setRenderProgress(15);
    await wav2lip.init((pct) => {
      videoStore.setRenderProgress(15 + pct * 0.1);
    });

    // Generate TTS audio
    videoStore.setRenderPhase('tts', 'Generating voiceover...');
    videoStore.setRenderProgress(28);

    const { ttsManager } = await import('@/engine/tts-manager');
    const allNarration = avatar.scenes.map((s) => s.narration).join(' ');
    const kokoroVoiceId = avatar.voices.find((v) => v.id === avatar.voiceId)?.kokoro_voice_id || 'af_bella';
    const ttsResult = await ttsManager.synthesize(allNarration, kokoroVoiceId, avatar.voiceSpeed);

    // Crop face region for Wav2Lip input
    videoStore.setRenderPhase('compositing', 'Animating face with Wav2Lip...');
    videoStore.setRenderProgress(35);

    const croppedFace = wav2lip.cropFace(img, faceData.faceBox);
    const fps = 25; // Wav2Lip standard framerate

    // Run Wav2Lip inference to get animated face frames
    const animatedFaces = await wav2lip.animate(
      croppedFace,
      ttsResult.buffer,
      fps,
      (frame, total) => {
        videoStore.setRenderProgress(35 + Math.round((frame / total) * 30));
      }
    );

    if (animatedFaces.length === 0) {
      throw new Error('Wav2Lip produced no frames');
    }

    // Composite animated faces onto original photo
    videoStore.setRenderPhase('encoding', 'Compositing and encoding video...');
    videoStore.setRenderProgress(68);

    const { getResolution, supportsWebCodecs, H264Encoder } = await import('@/engine/webcodecs-encoder');
    const { muxToMP4 } = await import('@/engine/mediabunny-muxer');
    const { getCapabilities } = await import('@/engine/device-detect');

    const webCodecsOk = await supportsWebCodecs();
    if (!webCodecsOk) {
      throw new Error('WebCodecs not available');
    }

    const capabilities = getCapabilities();
    const aspectRatio = avatar.aspectRatio;
    const resolution = getResolution(aspectRatio, capabilities.tier);
    const bitrate = capabilities.tier === 'high' ? 8_000_000 : 4_000_000;

    const compositedFrames = wav2lip.compositeFrames(
      img, animatedFaces, faceData.faceBox, resolution.width, resolution.height
    );

    const encoder = new H264Encoder({ aspectRatio, fps, bitrate, tier: capabilities.tier });
    await encoder.init();

    try {
      for (let i = 0; i < compositedFrames.length; i++) {
        const timestampUs = Math.round((i / fps) * 1_000_000);
        encoder.encodeFrame(compositedFrames[i], timestampUs);
        if (i % 10 === 0) {
          videoStore.setRenderProgress(68 + Math.round((i / compositedFrames.length) * 15));
        }
      }

      videoStore.setRenderPhase('muxing', 'Creating MP4 file...');
      videoStore.setRenderProgress(85);

      const videoChunks = await encoder.flush();
      const decoderMeta = encoder.decoderMeta;

      const mp4Blob = await muxToMP4({
        videoChunks,
        decoderMeta,
        audioData: ttsResult.buffer,
        audioSampleRate: ttsResult.sampleRate,
        fps,
        width: resolution.width,
        height: resolution.height,
        onProgress: (pct) => videoStore.setRenderProgress(85 + Math.round(pct * 0.1)),
      });

      videoStore.setRenderProgress(95);
      return mp4Blob;
    } finally {
      encoder.close();
    }
  }

  /** Tier 3 — D-ID Pro avatar via API with proper timeout and error handling. */
  async function renderWithDID(_videoId: number): Promise<Blob> {
    if (!avatarPhotoUrl) throw new Error('No avatar photo selected');

    // Check D-ID availability before starting expensive TTS generation
    const { api } = await import('@/lib/api');
    try {
      const availability = await api.get<{ available: boolean }>('/avatar/pro/available');
      if (!availability.available) {
        throw new Error(
          'D-ID Pro is not configured. ' +
          'Configure your D-ID API key in Admin Settings (System Keys) or Settings (API Keys). ' +
          'Alternatively, switch to Quick Avatar (Tier 1) or Photo Avatar (Tier 2) for free, browser-native lip-sync.'
        );
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes('D-ID Pro is not configured')) {
        throw err;
      }
      // Network error checking availability — proceed, generate endpoint will fail with its own message
    }

    videoStore.setRenderPhase('tts', 'Generating voiceover...');
    videoStore.setRenderProgress(5);

    // Generate TTS audio first
    const { ttsManager } = await import('@/engine/tts-manager');
    const allNarration = avatar.scenes.map((s) => s.narration).join(' ');
    const kokoroVoiceId = avatar.voices.find((v) => v.id === avatar.voiceId)?.kokoro_voice_id || 'af_bella';
    const ttsResult = await ttsManager.synthesize(allNarration, kokoroVoiceId, avatar.voiceSpeed);

    // Convert Float32Array to WAV Blob for upload
    const wavBlob = float32ToWavBlob(ttsResult.buffer, ttsResult.sampleRate);

    videoStore.setRenderPhase('compositing', 'Sending to D-ID Pro...');
    videoStore.setRenderProgress(20);

    // Upload photo + audio to D-ID via backend proxy
    let createRes: { id: string };
    try {
      createRes = await api.post<{ id: string }>('/avatar/pro/generate', {
        photo_url: avatarPhotoUrl,
        audio_base64: await blobToBase64(wavBlob),
      });
    } catch (err) {
      throw new Error(
        `Failed to submit D-ID job: ${err instanceof Error ? err.message : 'Network error'}`
      );
    }

    if (!createRes.id) {
      throw new Error('D-ID Pro did not return a job ID. Check your D-ID API key.');
    }

    const jobId = createRes.id;

    // Poll for completion with proper timeout (120s max, 2s interval = 60 attempts)
    videoStore.setRenderPhase('encoding', 'D-ID is generating your video...');
    const maxDurationMs = 120_000; // 2 minutes absolute timeout
    const pollIntervalMs = 2_000;
    const startTime = Date.now();
    let attempts = 0;
    let consecutiveErrors = 0;
    const maxConsecutiveErrors = 5;

    while (Date.now() - startTime < maxDurationMs) {
      // D-ID API polling interval — legitimate use of setTimeout
      await new Promise((r) => setTimeout(r, pollIntervalMs));
      attempts++;

      const elapsed = Date.now() - startTime;
      const progressPct = 20 + Math.min(65, Math.round((elapsed / maxDurationMs) * 65));
      videoStore.setRenderProgress(progressPct);
      videoStore.setRenderPhase(
        'encoding',
        `D-ID is generating your video... (${Math.round(elapsed / 1000)}s)`
      );

      try {
        const status = await api.get<{
          status: string;
          result_url?: string;
          error?: string;
        }>(`/avatar/pro/status/${jobId}`);

        consecutiveErrors = 0; // reset on success

        if (status.status === 'done' && status.result_url) {
          videoStore.setRenderPhase('muxing', 'Downloading D-ID result...');
          videoStore.setRenderProgress(88);

          const videoResponse = await fetch(status.result_url);
          if (!videoResponse.ok) {
            throw new Error(`Failed to download D-ID video: HTTP ${videoResponse.status}`);
          }

          videoStore.setRenderProgress(95);
          return await videoResponse.blob();
        }

        if (status.status === 'error') {
          const detail = status.error || 'Unknown error from D-ID';
          throw new Error(`D-ID Pro generation failed: ${detail}`);
        }

        // status is still 'processing' or 'created' — continue polling
      } catch (err) {
        // If it's a definitive D-ID error (not a network glitch), throw immediately
        if (err instanceof Error && err.message.startsWith('D-ID Pro generation failed')) {
          throw err;
        }

        consecutiveErrors++;
        if (consecutiveErrors >= maxConsecutiveErrors) {
          throw new Error(
            `Lost connection to D-ID after ${maxConsecutiveErrors} consecutive polling failures. ` +
            `Last error: ${err instanceof Error ? err.message : 'Unknown'}`
          );
        }
        // Network glitch — continue polling
      }
    }

    throw new Error(
      `D-ID Pro generation timed out after ${Math.round(maxDurationMs / 1000)} seconds ` +
      `(${attempts} polls). The video may still be processing — check your D-ID dashboard.`
    );
  }

  function handleDownload() {
    if (!mp4BlobRef.current) return;
    const blob = mp4BlobRef.current;
    const isWebm = blob.type.includes('webm');
    const ext = isWebm ? 'webm' : 'mp4';
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${avatar.title || 'avatar-video'}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const rp = videoStore.renderProgress;

  return (
    <div className="space-y-6">
      {/* Summary card */}
      <div className="bg-white dark:bg-[#1e1e1e] rounded-xl border border-border-light dark:border-[#333] overflow-hidden">
        <div className="px-4 py-3 md:px-5 md:py-4 border-b border-border-light dark:border-[#333]">
          <h3 className="text-base font-semibold text-text dark:text-white flex items-center gap-2">
            <Sparkles size={16} className="text-accent" />
            {avatar.title || `Avatar Video ${new Date().toLocaleDateString()}`}
          </h3>
          <p className="text-xs text-muted mt-0.5">Review your avatar video settings</p>
        </div>

        <div className="divide-y divide-border-light dark:divide-[#333]">
          <SummaryRow
            icon={tierIcon}
            label="Engine"
            value={tierLabel}
            status="ok"
          />
          <SummaryRow
            icon={<Users size={16} />}
            label="Avatar"
            value={avatarName}
            status={tier === 'quick' || hasFace ? 'ok' : 'error'}
            warning={tier !== 'quick' && !hasFace ? 'Face not detected — go back to Step 1' : undefined}
          />
          <SummaryRow
            icon={<FileText size={16} />}
            label="Script"
            value={`${avatar.scenes.length} scene${avatar.scenes.length !== 1 ? 's' : ''}, ~${totalDuration}s`}
            status={hasNarration ? 'ok' : 'warning'}
            warning={!hasNarration ? 'Add narration in Step 2' : undefined}
          />
          <SummaryRow
            icon={<Mic size={16} />}
            label="Voice"
            value={hasVoice
              ? `${avatar.voices.find((v) => v.id === avatar.voiceId)?.name || 'Selected'} (${avatar.voiceSpeed}x)`
              : 'Not selected'
            }
            status={hasVoice ? 'ok' : 'error'}
            warning={!hasVoice ? 'Select a voice in Step 3' : undefined}
          />
          <SummaryRow
            icon={<Palette size={16} />}
            label="Style"
            value={`${avatar.subtitleStyle} / ${avatar.backgroundStyle}`}
            status="ok"
          />
          <SummaryRow
            icon={aspectIcon}
            label="Format"
            value={avatar.aspectRatio}
            status="ok"
          />
          <SummaryRow
            icon={<Clock size={16} />}
            label="Est. Duration"
            value={totalDuration >= 60 ? `${Math.floor(totalDuration / 60)}m ${totalDuration % 60}s` : `${totalDuration}s`}
            status="ok"
          />
        </div>
      </div>

      {/* Render progress */}
      {(isRendering || renderComplete || renderError) && rp.phase !== 'idle' && (
        <div className="bg-white dark:bg-[#1e1e1e] rounded-xl border border-border-light dark:border-[#333] p-4 md:p-5">
          <ProgressBar
            percent={rp.percent}
            message={rp.message}
            subtitle={
              rp.phase === 'complete' ? 'Your avatar video is ready'
                : rp.phase === 'error' ? 'Something went wrong'
                  : `Phase: ${rp.phase}`
            }
          />

          {renderError && (
            <div className="mt-4 p-3 bg-danger/5 border border-danger/20 rounded-lg flex items-start gap-2">
              <AlertCircle size={16} className="text-danger mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-danger">Render failed</p>
                <p className="text-xs text-muted mt-0.5">{renderError}</p>
                <button
                  type="button"
                  onClick={() => {
                    setRenderError(null);
                    videoStore.setRenderPhase('idle');
                    videoStore.setRenderProgress(0);
                  }}
                  className="mt-2 text-xs text-primary hover:underline min-h-[44px] md:min-h-0 flex items-center"
                >
                  Try again
                </button>
              </div>
            </div>
          )}

          {renderComplete && (
            <div className="mt-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
              <button
                type="button"
                onClick={handleDownload}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover transition-colors active:scale-[0.98] min-h-[44px]"
              >
                <Play size={16} />
                Download Video
              </button>
              {videoId && (
                <a
                  href="/videos/"
                  className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-surface dark:bg-[#2a2a2a] text-text dark:text-white rounded-lg text-sm font-medium hover:bg-border-light dark:hover:bg-[#333] transition-colors min-h-[44px]"
                >
                  <ExternalLink size={14} />
                  My Videos
                </a>
              )}
              <button
                type="button"
                onClick={() => {
                  mp4BlobRef.current = null;
                  avatar.reset();
                  videoStore.setRenderPhase('idle');
                  videoStore.setRenderProgress(0);
                  setRenderComplete(false);
                  setVideoId(null);
                }}
                className="px-4 py-2.5 bg-surface dark:bg-[#2a2a2a] text-text dark:text-white rounded-lg text-sm font-medium hover:bg-border-light dark:hover:bg-[#333] transition-colors min-h-[44px]"
              >
                Create Another
              </button>
            </div>
          )}
        </div>
      )}

      {/* Tier-specific availability banners */}
      {!isRendering && !renderComplete && !renderError && (
        <>
          {/* Tier 1: GLB model not found */}
          {tier === 'quick' && glbModelAvailable === false && (
            <div className="flex items-start gap-3 p-3 rounded-xl bg-warning/5 border border-warning/20">
              <Info size={16} className="text-warning mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-text dark:text-white">3D Model Not Found</p>
                <p className="text-xs text-muted mt-0.5">
                  The default 3D avatar model (GLB) is not available. Run <code className="px-1 py-0.5 bg-surface dark:bg-[#2a2a2a] rounded text-[11px]">npm run setup-assets</code> to download required models, or switch to Photo Avatar (Tier 2) instead.
                </p>
              </div>
            </div>
          )}

          {/* Tier 2: Wav2Lip model not downloaded — using face-animator fallback */}
          {tier === 'photo' && wav2lipModelAvailable === false && (
            <div className="flex items-start gap-3 p-3 rounded-xl bg-info/5 border border-info/20">
              <Download size={16} className="text-info mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-text dark:text-white">Using Basic Lip-Sync</p>
                <p className="text-xs text-muted mt-0.5">
                  For higher quality photorealistic lip-sync, download the Wav2Lip model on the Models page. The current render will use the built-in face animation engine, which still produces good results.
                </p>
              </div>
            </div>
          )}

          {/* Tier 3: D-ID not configured */}
          {tier === 'pro' && didApiAvailable === false && (
            <div className="flex items-start gap-3 p-3 rounded-xl bg-danger/5 border border-danger/20">
              <Settings size={16} className="text-danger mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-danger">D-ID API Key Not Configured</p>
                <p className="text-xs text-muted mt-0.5">
                  Configure your D-ID API key in Admin Settings (System Keys) or your personal Settings (API Keys) to use Pro Avatar. Alternatively, switch to Quick Avatar or Photo Avatar for free, browser-native rendering.
                </p>
              </div>
            </div>
          )}
        </>
      )}

      {/* Generate button */}
      {!isRendering && !renderComplete && !renderError && (
        <button
          type="button"
          onClick={handleGenerate}
          disabled={!canGenerate || (tier === 'pro' && didApiAvailable === false)}
          className="w-full flex items-center justify-center gap-2 py-4 bg-gradient-to-r from-primary via-accent to-secondary text-white rounded-xl text-base font-semibold hover:opacity-90 transition-all active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-primary/20 min-h-[44px]"
        >
          <Sparkles size={20} />
          Generate Avatar Video
        </button>
      )}

      {isRendering && (
        <button
          type="button"
          disabled
          className="w-full flex items-center justify-center gap-2 py-4 bg-gradient-to-r from-primary via-accent to-secondary text-white rounded-xl text-base font-semibold opacity-80 cursor-not-allowed min-h-[44px]"
        >
          <Loader2 size={20} className="animate-spin" />
          Rendering — do not close this tab
        </button>
      )}

      {!canGenerate && !isRendering && !renderComplete && !renderError && (
        <p className="text-xs text-warning text-center">
          Complete all required fields before generating
        </p>
      )}
    </div>
  );
}

/** Summary row for the pre-render checklist. */
function SummaryRow({
  icon,
  label,
  value,
  status,
  warning,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  status: 'ok' | 'warning' | 'error';
  warning?: string;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3 md:px-5 gap-2">
      <div className="flex items-center gap-2 md:gap-3 min-w-0">
        <div className="text-muted shrink-0">{icon}</div>
        <div className="min-w-0">
          <span className="text-sm font-medium text-text dark:text-white">{label}</span>
          {warning && (
            <p className={`text-[11px] mt-0.5 ${status === 'error' ? 'text-danger' : 'text-warning'}`}>
              {warning}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-xs md:text-sm text-muted truncate max-w-[120px] md:max-w-none">{value}</span>
        {status === 'ok' && <Check size={14} className="text-secondary" />}
        {status === 'warning' && <AlertCircle size={14} className="text-warning" />}
        {status === 'error' && <AlertCircle size={14} className="text-danger" />}
      </div>
    </div>
  );
}
