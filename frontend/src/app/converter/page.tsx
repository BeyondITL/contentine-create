'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Maximize,
  Upload,
  Film,
  Download,
  Loader2,
  AlertTriangle,
  Check,
  RectangleHorizontal,
  RectangleVertical,
  Square,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { api } from '@/lib/api';

/** Aspect ratio option. */
interface RatioOption {
  label: string;
  sublabel: string;
  value: string;
  width: number;
  height: number;
  icon: typeof RectangleHorizontal;
  previewClass: string;
}

const RATIO_OPTIONS: RatioOption[] = [
  {
    label: '16:9',
    sublabel: 'Landscape',
    value: '16:9',
    width: 1920,
    height: 1080,
    icon: RectangleHorizontal,
    previewClass: 'w-10 h-[22px]',
  },
  {
    label: '9:16',
    sublabel: 'Portrait',
    value: '9:16',
    width: 1080,
    height: 1920,
    icon: RectangleVertical,
    previewClass: 'w-[22px] h-10',
  },
  {
    label: '1:1',
    sublabel: 'Square',
    value: '1:1',
    width: 1080,
    height: 1080,
    icon: Square,
    previewClass: 'w-8 h-8',
  },
];

type FillMode = 'fit' | 'fill';

/** Simple video type for dropdown. */
interface VideoOption {
  id: number;
  title: string;
  video_path: string;
}

/** Output format derived from encoding path. */
type OutputFormat = 'mp4' | 'webm';

/** Seek the video element to a specific time and resolve when the seek completes. */
function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onErr);
      resolve();
    };
    const onErr = () => {
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onErr);
      reject(new Error('Seek failed'));
    };
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('error', onErr);
    video.currentTime = time;
  });
}

/** Draw a single source video frame onto the target canvas with the given fill mode. */
function drawFrame(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  outW: number,
  outH: number,
  srcW: number,
  srcH: number,
  mode: FillMode,
  bg: string
): void {
  if (mode === 'fit') {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, outW, outH);
    const scale = Math.min(outW / srcW, outH / srcH);
    const dw = srcW * scale;
    const dh = srcH * scale;
    ctx.drawImage(video, (outW - dw) / 2, (outH - dh) / 2, dw, dh);
  } else {
    const scale = Math.max(outW / srcW, outH / srcH);
    const dw = srcW * scale;
    const dh = srcH * scale;
    ctx.drawImage(video, (outW - dw) / 2, (outH - dh) / 2, dw, dh);
  }
}

/** Aspect Ratio Converter — client-side full video conversion tool. */
export default function ConverterPage() {
  // Step tracking
  const [currentStep, setCurrentStep] = useState(1);

  // Step 1: Video selection
  const [videoSource, setVideoSource] = useState<'upload' | 'library' | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [selectedVideoId, setSelectedVideoId] = useState<number | null>(null);
  const [videos, setVideos] = useState<VideoOption[]>([]);
  const [videoDimensions, setVideoDimensions] = useState<{ width: number; height: number } | null>(null);

  // Step 2: Target ratio
  const [targetRatio, setTargetRatio] = useState<RatioOption>(RATIO_OPTIONS[0]);
  const [fillMode, setFillMode] = useState<FillMode>('fit');
  const [bgColor, setBgColor] = useState('#000000');

  // Audio detection
  const [hasAudioTrack, setHasAudioTrack] = useState<boolean | null>(null);

  // Step 3: Convert — outputs a full video blob
  const [isConverting, setIsConverting] = useState(false);
  const [convertProgress, setConvertProgress] = useState(0);
  const [convertedVideoUrl, setConvertedVideoUrl] = useState<string | null>(null);
  const [outputFormat, setOutputFormat] = useState<OutputFormat>('mp4');
  const [convertError, setConvertError] = useState<string | null>(null);

  // Abort handle for cancelling in-progress conversion
  const abortRef = useRef(false);

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Set page title
  useEffect(() => {
    document.title = 'Aspect Ratio Converter — Contentine Create';
  }, []);

  // Fetch user videos
  useEffect(() => {
    fetchVideos();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup blob URLs
  useEffect(() => {
    return () => {
      if (videoUrl && videoUrl.startsWith('blob:')) {
        URL.revokeObjectURL(videoUrl);
      }
      if (convertedVideoUrl && convertedVideoUrl.startsWith('blob:')) {
        URL.revokeObjectURL(convertedVideoUrl);
      }
    };
  }, [videoUrl, convertedVideoUrl]);

  const fetchVideos = useCallback(async () => {
    try {
      const data = await api.get<{ videos: VideoOption[] }>('/videos');
      setVideos(data.videos || []);
    } catch {
      // Non-critical
    }
  }, []);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Cleanup previous blob URL
    if (videoUrl && videoUrl.startsWith('blob:')) {
      URL.revokeObjectURL(videoUrl);
    }

    setVideoFile(file);
    setVideoSource('upload');
    const url = URL.createObjectURL(file);
    setVideoUrl(url);
    setSelectedVideoId(null);
    setConvertedVideoUrl(null);
    setConvertError(null);
    setHasAudioTrack(null);
    setCurrentStep(2);
  }, [videoUrl]);

  const handleVideoSelect = useCallback((videoId: number) => {
    const video = videos.find((v) => v.id === videoId);
    if (!video) return;

    // Cleanup previous blob URL
    if (videoUrl && videoUrl.startsWith('blob:')) {
      URL.revokeObjectURL(videoUrl);
    }

    setSelectedVideoId(videoId);
    setVideoSource('library');
    setVideoUrl(video.video_path);
    setVideoFile(null);
    setConvertedVideoUrl(null);
    setConvertError(null);
    setHasAudioTrack(null);
    setCurrentStep(2);
  }, [videos, videoUrl]);

  const handleVideoLoaded = useCallback(() => {
    const video = videoRef.current;
    if (video) {
      setVideoDimensions({ width: video.videoWidth, height: video.videoHeight });

      // Detect whether the source video contains an audio track
      // Use mozHasAudio/webkitAudioDecodedByteCount for detection
      const mediaEl = video as HTMLVideoElement & {
        mozHasAudio?: boolean;
        webkitAudioDecodedByteCount?: number;
        audioTracks?: { length: number };
      };

      if (typeof mediaEl.mozHasAudio === 'boolean') {
        setHasAudioTrack(mediaEl.mozHasAudio);
      } else if (mediaEl.audioTracks && typeof mediaEl.audioTracks.length === 'number') {
        setHasAudioTrack(mediaEl.audioTracks.length > 0);
      } else {
        // For Chrome/Edge: check captureStream for audio tracks after a short delay
        // The webkitAudioDecodedByteCount is only populated after some decoding
        setTimeout(() => {
          if (typeof mediaEl.webkitAudioDecodedByteCount === 'number') {
            setHasAudioTrack(mediaEl.webkitAudioDecodedByteCount > 0);
          } else {
            // Fallback: try captureStream to detect audio tracks
            try {
              const stream: MediaStream | null = (video as any).captureStream ? (video as any).captureStream() : null;
              if (stream) {
                const audioTracks = stream.getAudioTracks();
                setHasAudioTrack(audioTracks.length > 0);
                // Stop tracks to release resources
                stream.getTracks().forEach((t: MediaStreamTrack) => t.stop());
              } else {
                // Cannot determine — assume true (safer default)
                setHasAudioTrack(true);
              }
            } catch {
              setHasAudioTrack(true);
            }
          }
        }, 300);
      }
    }
  }, []);

  /** Full video conversion: decode frames, transform aspect ratio, re-encode to MP4/WebM. */
  const handleConvert = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    abortRef.current = false;
    setIsConverting(true);
    setConvertProgress(0);
    setConvertError(null);

    // Cleanup previous output
    if (convertedVideoUrl && convertedVideoUrl.startsWith('blob:')) {
      URL.revokeObjectURL(convertedVideoUrl);
    }
    setConvertedVideoUrl(null);

    try {
      // Ensure the video has loaded metadata
      if (video.readyState < 1) {
        await new Promise<void>((resolve, reject) => {
          const onLoaded = () => { video.removeEventListener('loadeddata', onLoaded); resolve(); };
          const onError = () => { video.removeEventListener('error', onError); reject(new Error('Video failed to load')); };
          video.addEventListener('loadeddata', onLoaded);
          video.addEventListener('error', onError);
        });
      }

      // Pause the video so seeking works reliably
      video.pause();

      const srcW = video.videoWidth;
      const srcH = video.videoHeight;
      const duration = video.duration;
      const fps = 30;
      const totalFrames = Math.max(1, Math.ceil(duration * fps));
      const outW = targetRatio.width;
      const outH = targetRatio.height;

      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('Canvas context not available');

      // --- Extract audio from source video (used by WebCodecs path) ---
      let sourceAudioData: Float32Array | null = null;
      let sourceAudioSampleRate = 44100;

      // WebCodecs is the only export path (Law L6 — the MediaRecorder/captureStream
      // fallback was removed; realtime capture can never be deterministic). If it is
      // unavailable we surface an honest capability error below rather than degrade.
      const hasWebCodecsApi = typeof VideoEncoder !== 'undefined';

      if (hasAudioTrack && videoUrl && hasWebCodecsApi) {
        try {
          setConvertProgress(1);
          // Fetch the source video as ArrayBuffer for AudioContext decoding
          const response = await fetch(videoUrl);
          const arrayBuffer = await response.arrayBuffer();
          const audioCtx = new AudioContext();
          const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
          sourceAudioSampleRate = audioBuffer.sampleRate;

          // Mix down to mono — preserves all audio content
          if (audioBuffer.numberOfChannels === 1) {
            sourceAudioData = audioBuffer.getChannelData(0);
          } else {
            const length = audioBuffer.length;
            const mono = new Float32Array(length);
            const channelCount = audioBuffer.numberOfChannels;
            for (let ch = 0; ch < channelCount; ch++) {
              const channelData = audioBuffer.getChannelData(ch);
              for (let s = 0; s < length; s++) {
                mono[s] += channelData[s];
              }
            }
            for (let s = 0; s < length; s++) {
              mono[s] /= channelCount;
            }
            sourceAudioData = mono;
          }
          await audioCtx.close();
        } catch (audioErr) {
          // Audio extraction failed — proceed video-only
          console.warn('[Converter] Audio extraction failed, proceeding without audio:', audioErr);
          sourceAudioData = null;
        }
      }

      setConvertProgress(3);

      if (hasWebCodecsApi) {
        // --- WebCodecs + Mediabunny path (produces MP4) ---
        setOutputFormat('mp4');

        const { H264Encoder, supportsWebCodecs } = await import('@/engine/webcodecs-encoder');
        const webCodecsOk = await supportsWebCodecs();

        if (!webCodecsOk) {
          throw new Error('WebCodecs H.264 encoding is not supported in this browser. Please use Chrome 94+ or Edge 94+.');
        }

        const encoder = new H264Encoder({
          aspectRatio: targetRatio.value as '9:16' | '16:9' | '1:1',
          fps,
          bitrate: 6_000_000,
          tier: 'high',
        });
        await encoder.init();

        // Seek through each frame and encode (5-75% progress)
        for (let i = 0; i < totalFrames; i++) {
          if (abortRef.current) {
            encoder.close();
            throw new Error('Conversion cancelled');
          }

          const seekTime = Math.min(i / fps, duration - 0.001);
          await seekTo(video, seekTime);

          drawFrame(ctx, video, outW, outH, srcW, srcH, fillMode, bgColor);

          const timestampUs = Math.round((i / fps) * 1_000_000);
          encoder.encodeFrame(canvas, timestampUs);

          const pct = 5 + Math.round((i / totalFrames) * 70);
          setConvertProgress(pct);
        }

        // Flush encoder
        const chunks = await encoder.flush();
        const decoderMeta = encoder.decoderMeta;
        encoder.close();

        setConvertProgress(80);

        // Mux to MP4 via Mediabunny — with audio passthrough if available
        if (sourceAudioData && sourceAudioData.length > 0) {
          const { muxToMP4 } = await import('@/engine/mediabunny-muxer');
          const mp4Blob = await muxToMP4({
            videoChunks: chunks,
            decoderMeta,
            audioData: sourceAudioData,
            audioSampleRate: sourceAudioSampleRate,
            fps,
            width: outW,
            height: outH,
            onProgress: (p) => {
              setConvertProgress(80 + Math.round(p * 0.2));
            },
          });

          const url = URL.createObjectURL(mp4Blob);
          setConvertedVideoUrl(url);
          setConvertProgress(100);
          setCurrentStep(3);
        } else {
          const { muxVideoOnly } = await import('@/engine/mediabunny-muxer');
          const mp4Blob = await muxVideoOnly(chunks, fps, decoderMeta, (p) => {
            setConvertProgress(80 + Math.round(p * 0.2));
          });

          const url = URL.createObjectURL(mp4Blob);
          setConvertedVideoUrl(url);
          setConvertProgress(100);
          setCurrentStep(3);
        }
      } else {
        // No WebCodecs — the legacy MediaRecorder/captureStream WebM fallback was
        // removed under Law L6 (realtime capture yields browser-dependent output).
        // Surface an honest capability error instead of a silent alternate encoder.
        throw new Error(
          'Video conversion requires WebCodecs H.264 encoding, which this browser does not support. ' +
          'Please use Chrome 94+, Edge 94+, or Safari 16.4+.'
        );
      }
    } catch (err) {
      if (!abortRef.current) {
        const message = err instanceof Error ? err.message : 'Video conversion failed. Please try again.';
        setConvertError(message);
      }
    } finally {
      setIsConverting(false);
    }
  }, [targetRatio, fillMode, bgColor, convertedVideoUrl, hasAudioTrack, videoUrl]);

  const handleDownload = useCallback(() => {
    if (!convertedVideoUrl) return;

    const ext = outputFormat === 'mp4' ? 'mp4' : 'webm';
    const link = document.createElement('a');
    link.href = convertedVideoUrl;
    link.download = `converted-${targetRatio.value.replace(':', 'x')}.${ext}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [convertedVideoUrl, targetRatio, outputFormat]);

  const handleReset = useCallback(() => {
    abortRef.current = true;
    if (videoUrl && videoUrl.startsWith('blob:')) URL.revokeObjectURL(videoUrl);
    if (convertedVideoUrl && convertedVideoUrl.startsWith('blob:')) URL.revokeObjectURL(convertedVideoUrl);

    setVideoFile(null);
    setVideoUrl(null);
    setVideoSource(null);
    setSelectedVideoId(null);
    setVideoDimensions(null);
    setHasAudioTrack(null);
    setConvertedVideoUrl(null);
    setConvertError(null);
    setConvertProgress(0);
    setIsConverting(false);
    setCurrentStep(1);

    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [videoUrl, convertedVideoUrl]);

  const hasVideo = videoUrl !== null;

  return (
    <div className="max-w-[1280px] mx-auto animate-fade-in">
      {/* Page header */}
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-0.5">
          <Maximize size={20} className="text-primary" />
          <h1 className="text-xl font-semibold text-text dark:text-white tracking-[-0.02em]">
            Aspect Ratio Converter
          </h1>
        </div>
        <p className="text-sm text-text-muted">
          Convert your videos between 16:9, 9:16, and 1:1 aspect ratios.
        </p>
      </div>

      {/* Step indicators */}
      <div className="flex items-center gap-2 mb-5">
        {[
          { num: 1, label: 'Select Video' },
          { num: 2, label: 'Choose Ratio' },
          { num: 3, label: 'Convert' },
        ].map((step, idx) => (
          <div key={step.num} className="flex items-center gap-2">
            {idx > 0 && (
              <div
                className={`w-6 md:w-10 h-px ${
                  currentStep > idx ? 'bg-primary' : 'bg-black/[0.08] dark:bg-white/[0.08]'
                }`}
              />
            )}
            <div className="flex items-center gap-1.5">
              <div
                className={`
                  w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0
                  transition-colors duration-200
                  ${
                    currentStep > step.num
                      ? 'bg-primary text-white'
                      : currentStep === step.num
                        ? 'bg-primary/10 text-primary border border-primary/30'
                        : 'bg-surface dark:bg-[#1e1e1e] text-text-muted border border-black/[0.06] dark:border-white/[0.06]'
                  }
                `}
              >
                {currentStep > step.num ? <Check size={12} /> : step.num}
              </div>
              <span
                className={`text-[12px] font-medium hidden sm:inline ${
                  currentStep >= step.num
                    ? 'text-text dark:text-[#E0E0E0]'
                    : 'text-text-muted'
                }`}
              >
                {step.label}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Left column: Controls (3 cols on lg) */}
        <div className="lg:col-span-3 space-y-4">
          {/* Step 1: Upload / Select Video */}
          <div className="bento-card p-4 md:p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[14px] md:text-[13px] font-semibold text-text dark:text-[#E0E0E0]">
                1. Select a video
              </h2>
              {hasVideo && (
                <button
                  type="button"
                  onClick={handleReset}
                  className="text-[11px] text-primary hover:text-primary-hover font-medium cursor-pointer focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none rounded px-1.5 py-0.5"
                >
                  Change video
                </button>
              )}
            </div>

            {!hasVideo ? (
              <div className="space-y-3">
                {/* File upload */}
                <label
                  htmlFor="video-upload"
                  className="
                    flex flex-col items-center justify-center gap-2 py-8
                    border-2 border-dashed border-black/[0.08] dark:border-white/[0.08]
                    rounded-xl cursor-pointer
                    hover:border-primary/30 hover:bg-primary/[0.02] dark:hover:bg-primary/[0.04]
                    transition-all duration-200
                  "
                >
                  <div className="w-10 h-10 rounded-xl bg-primary/[0.06] flex items-center justify-center">
                    <Upload size={18} className="text-primary" />
                  </div>
                  <div className="text-center">
                    <p className="text-[13px] font-medium text-text dark:text-[#E0E0E0]">
                      Upload a video file
                    </p>
                    <p className="text-[11px] text-text-muted mt-0.5">
                      MP4 or WebM, up to 500MB
                    </p>
                  </div>
                  <input
                    ref={fileInputRef}
                    id="video-upload"
                    type="file"
                    accept="video/mp4,video/webm"
                    onChange={handleFileUpload}
                    className="sr-only"
                  />
                </label>

                {/* OR divider */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-black/[0.06] dark:bg-white/[0.06]" />
                  <span className="text-[11px] text-text-muted font-medium">OR</span>
                  <div className="flex-1 h-px bg-black/[0.06] dark:bg-white/[0.06]" />
                </div>

                {/* Select from library */}
                <div>
                  <label
                    htmlFor="library-select"
                    className="block text-[12px] font-semibold text-text-secondary dark:text-[#AAA] mb-1.5"
                  >
                    Select from My Videos
                  </label>
                  <select
                    id="library-select"
                    value={selectedVideoId ?? ''}
                    onChange={(e) => {
                      if (e.target.value) handleVideoSelect(Number(e.target.value));
                    }}
                    className="input-field"
                  >
                    <option value="">Choose a video...</option>
                    {videos.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.title}
                      </option>
                    ))}
                  </select>
                  {videos.length === 0 && (
                    <p className="text-[11px] text-text-muted mt-1">
                      No videos found. Upload a file above to get started.
                    </p>
                  )}
                </div>
              </div>
            ) : (
              /* Video preview */
              <div className="rounded-xl overflow-hidden border border-black/[0.06] dark:border-white/[0.06] bg-black">
                <video
                  ref={videoRef}
                  src={videoUrl}
                  onLoadedMetadata={handleVideoLoaded}
                  className="w-full max-h-[280px] object-contain"
                  controls
                  playsInline
                  muted
                  crossOrigin="anonymous"
                />
                {videoDimensions && (
                  <div className="px-3 py-2 bg-surface dark:bg-[#1e1e1e] text-[11px] text-text-muted flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Film size={12} />
                      <span>
                        {videoDimensions.width} × {videoDimensions.height}
                        {videoFile && ` · ${(videoFile.size / (1024 * 1024)).toFixed(1)} MB`}
                      </span>
                    </div>
                    {hasAudioTrack !== null && (
                      <div className={`flex items-center gap-1 ${hasAudioTrack ? 'text-secondary' : 'text-text-muted'}`}>
                        {hasAudioTrack ? <Volume2 size={12} /> : <VolumeX size={12} />}
                        <span>{hasAudioTrack ? 'Audio: Preserved' : 'Audio: None detected'}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Step 2: Choose Target Ratio */}
          <div
            className={`bento-card p-4 md:p-5 transition-opacity duration-200 ${
              !hasVideo ? 'opacity-50 pointer-events-none' : ''
            }`}
          >
            <h2 className="text-[14px] md:text-[13px] font-semibold text-text dark:text-[#E0E0E0] mb-3">
              2. Choose target aspect ratio
            </h2>

            {/* Ratio cards */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              {RATIO_OPTIONS.map((opt) => {
                const isActive = targetRatio.value === opt.value;
                const Icon = opt.icon;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      setTargetRatio(opt);
                      setConvertedVideoUrl(null);
                    }}
                    aria-pressed={isActive}
                    className={`
                      flex flex-col items-center gap-2 px-3 py-4
                      min-h-[44px] md:min-h-0
                      rounded-xl text-[12px] font-medium
                      transition-all duration-200 cursor-pointer
                      focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none
                      ${
                        isActive
                          ? 'bg-primary/[0.08] dark:bg-primary/[0.12] text-primary border border-primary/20 dark:border-primary/30'
                          : 'bg-surface dark:bg-[#1e1e1e] text-text-secondary dark:text-[#AAA] border border-transparent hover:bg-border-light dark:hover:bg-[#2a2a2a]'
                      }
                    `}
                  >
                    <div
                      className={`
                        rounded border flex items-center justify-center
                        ${isActive ? 'border-primary/40 bg-primary/10' : 'border-black/10 dark:border-white/10 bg-black/[0.03] dark:bg-white/[0.03]'}
                        ${opt.previewClass}
                      `}
                    >
                      <Icon size={14} className={isActive ? 'text-primary/60' : 'text-text-muted/40'} />
                    </div>
                    <div className="text-center">
                      <div className="font-semibold">{opt.label}</div>
                      <div className="text-[10px] opacity-60">{opt.sublabel}</div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Fill mode toggle */}
            <div className="mb-3">
              <label className="block text-[12px] font-semibold text-text-secondary dark:text-[#AAA] mb-2">
                Fill mode
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setFillMode('fit');
                    setConvertedVideoUrl(null);
                  }}
                  aria-pressed={fillMode === 'fit'}
                  className={`
                    flex flex-col items-center gap-1 px-3 py-2.5
                    min-h-[44px] md:min-h-0
                    rounded-xl text-[12px] font-medium
                    transition-all duration-200 cursor-pointer
                    focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none
                    ${
                      fillMode === 'fit'
                        ? 'bg-primary/[0.08] dark:bg-primary/[0.12] text-primary border border-primary/20 dark:border-primary/30'
                        : 'bg-surface dark:bg-[#1e1e1e] text-text-secondary dark:text-[#AAA] border border-transparent hover:bg-border-light dark:hover:bg-[#2a2a2a]'
                    }
                  `}
                >
                  <span className="font-semibold">Fit</span>
                  <span className="text-[10px] opacity-60">Letterbox</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFillMode('fill');
                    setConvertedVideoUrl(null);
                  }}
                  aria-pressed={fillMode === 'fill'}
                  className={`
                    flex flex-col items-center gap-1 px-3 py-2.5
                    min-h-[44px] md:min-h-0
                    rounded-xl text-[12px] font-medium
                    transition-all duration-200 cursor-pointer
                    focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none
                    ${
                      fillMode === 'fill'
                        ? 'bg-primary/[0.08] dark:bg-primary/[0.12] text-primary border border-primary/20 dark:border-primary/30'
                        : 'bg-surface dark:bg-[#1e1e1e] text-text-secondary dark:text-[#AAA] border border-transparent hover:bg-border-light dark:hover:bg-[#2a2a2a]'
                    }
                  `}
                >
                  <span className="font-semibold">Fill</span>
                  <span className="text-[10px] opacity-60">Crop to fit</span>
                </button>
              </div>
            </div>

            {/* Background color picker (letterbox mode only) */}
            {fillMode === 'fit' && (
              <div className="mb-3">
                <label
                  htmlFor="bg-color"
                  className="block text-[12px] font-semibold text-text-secondary dark:text-[#AAA] mb-1.5"
                >
                  Background color
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="bg-color"
                    type="color"
                    value={bgColor}
                    onChange={(e) => {
                      setBgColor(e.target.value);
                      setConvertedVideoUrl(null);
                    }}
                    className="
                      w-10 h-10 min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 md:w-8 md:h-8
                      rounded-lg border border-black/[0.08] dark:border-white/[0.08]
                      cursor-pointer bg-transparent
                    "
                  />
                  <input
                    type="text"
                    value={bgColor}
                    onChange={(e) => {
                      if (/^#[0-9A-Fa-f]{0,6}$/.test(e.target.value)) {
                        setBgColor(e.target.value);
                        setConvertedVideoUrl(null);
                      }
                    }}
                    className="input-field w-28"
                    maxLength={7}
                  />
                </div>
              </div>
            )}

            {/* Convert error */}
            {convertError && (
              <div className="flex items-start gap-2 p-3 mb-3 rounded-xl bg-danger/[0.06] dark:bg-danger/[0.1] border border-danger/10">
                <AlertTriangle size={14} className="text-danger shrink-0 mt-0.5" />
                <p className="text-[12px] text-danger leading-relaxed">{convertError}</p>
              </div>
            )}

            {/* Convert button */}
            <button
              type="button"
              onClick={handleConvert}
              disabled={!hasVideo || isConverting}
              className="
                w-full flex items-center justify-center gap-2
                px-4 py-3 min-h-[44px] md:min-h-0
                rounded-xl text-[14px] md:text-[13px] font-semibold text-white
                bg-gradient-to-r from-primary to-accent
                hover:opacity-90 active:scale-[0.98]
                disabled:opacity-40 disabled:cursor-not-allowed
                transition-all duration-200 cursor-pointer
                focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none
              "
            >
              {isConverting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Converting...
                </>
              ) : (
                <>
                  <Maximize size={16} />
                  Convert
                </>
              )}
            </button>

            {/* Progress bar */}
            {isConverting && (
              <div className="mt-3">
                <div className="w-full h-2 rounded-full bg-surface dark:bg-[#1e1e1e] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-primary via-accent to-secondary transition-all duration-500 ease-out"
                    style={{ width: `${convertProgress}%` }}
                  />
                </div>
                <p className="text-[11px] text-text-muted mt-1 text-center">
                  {convertProgress}% complete
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Right column: Preview (2 cols on lg) */}
        <div className="lg:col-span-2">
          <div className="bento-card p-4 md:p-5 lg:sticky lg:top-4">
            <h2 className="text-[14px] md:text-[13px] font-semibold text-text dark:text-[#E0E0E0] mb-3">
              3. Result
            </h2>

            {/* Converted preview */}
            {convertedVideoUrl ? (
              <div>
                <div className="rounded-xl overflow-hidden border border-black/[0.06] dark:border-white/[0.06] bg-black mb-3">
                  <video
                    src={convertedVideoUrl}
                    className="w-full max-h-[400px] object-contain"
                    controls
                    playsInline
                    autoPlay
                  />
                </div>

                <div className="flex items-center gap-2 px-3 py-2 mb-3 rounded-xl bg-secondary/[0.06] dark:bg-secondary/[0.1] border border-secondary/10">
                  <Check size={14} className="text-secondary shrink-0" />
                  <div className="flex-1">
                    <p className="text-[11px] text-text-muted leading-relaxed">
                      Video converted to {targetRatio.label} ({outputFormat.toUpperCase()}).
                    </p>
                    <div className={`flex items-center gap-1 mt-0.5 text-[11px] ${hasAudioTrack ? 'text-secondary' : 'text-text-muted'}`}>
                      {hasAudioTrack ? <Volume2 size={11} /> : <VolumeX size={11} />}
                      <span>{hasAudioTrack ? 'Audio preserved' : 'No audio track'}</span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleDownload}
                  className="
                    w-full flex items-center justify-center gap-2
                    px-4 py-3 min-h-[44px] md:min-h-0
                    btn-primary
                  "
                >
                  <Download size={16} />
                  Download {outputFormat.toUpperCase()}
                </button>
              </div>
            ) : isConverting ? (
              /* Converting skeleton */
              <div className="flex flex-col items-center py-10">
                <div className="w-full aspect-video rounded-xl bg-gradient-to-r from-black/[0.04] via-black/[0.08] to-black/[0.04] dark:from-white/[0.04] dark:via-white/[0.08] dark:to-white/[0.04] animate-pulse mb-3" />
                <div className="flex items-center gap-2 text-[12px] text-text-muted">
                  <Loader2 size={14} className="animate-spin" />
                  <span>Converting video frames...</span>
                </div>
              </div>
            ) : (
              /* Empty state */
              <div className="flex flex-col items-center text-center py-10">
                <div className="w-14 h-14 rounded-2xl bg-primary/[0.06] flex items-center justify-center mb-3">
                  <Maximize size={24} className="text-primary/40" />
                </div>
                <p className="text-[13px] font-medium text-text dark:text-[#E0E0E0] mb-1">
                  No conversion yet
                </p>
                <p className="text-[12px] text-text-muted max-w-[220px]">
                  {hasVideo
                    ? 'Choose your target ratio and click Convert to see the result.'
                    : 'Upload or select a video to get started with the conversion.'}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Hidden canvas for rendering */}
      <canvas ref={canvasRef} className="hidden" aria-hidden="true" />
    </div>
  );
}
