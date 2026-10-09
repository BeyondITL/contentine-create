'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Image as ImageIcon,
  Sparkles,
  Download,
  Film,
  Loader2,
  AlertTriangle,
  RotateCcw,
  X,
  Calendar,
  Expand,
} from 'lucide-react';
import { api, APIError } from '@/lib/api';
import type { Thumbnail } from '@/types';
import EmptyState from '@/components/ui/EmptyState';
import ModelRequirements from '@/components/shared/ModelRequirements';
import AiGeneratedBadge from '@/components/shared/AiGeneratedBadge';

/** Size option for thumbnail generation. */
interface SizeOption {
  label: string;
  value: string;
  width: number;
  height: number;
  aspectClass: string;
}

const SIZE_OPTIONS: SizeOption[] = [
  { label: 'Square', value: '1024x1024', width: 1024, height: 1024, aspectClass: 'aspect-square' },
  { label: 'Landscape', value: '1792x1024', width: 1792, height: 1024, aspectClass: 'aspect-video' },
  { label: 'Portrait', value: '1024x1792', width: 1024, height: 1792, aspectClass: 'aspect-[9/16]' },
];

/** Simple video type for the dropdown. */
interface VideoOption {
  id: number;
  title: string;
}

/** Thumbnail Generator — create AI-powered thumbnails for your videos. */
export default function ThumbnailsPage() {
  // Form state
  const [prompt, setPrompt] = useState('');
  const [selectedSize, setSelectedSize] = useState<SizeOption>(SIZE_OPTIONS[0]);
  const [selectedVideoId, setSelectedVideoId] = useState<number | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  // SD Turbo model download progress (0-1, null when not downloading)
  const [modelProgress, setModelProgress] = useState<number | null>(null);

  // Generated thumbnail (latest)
  const [generatedThumbnail, setGeneratedThumbnail] = useState<Thumbnail | null>(null);

  // Gallery state
  const [thumbnails, setThumbnails] = useState<Thumbnail[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Videos list for association
  const [videos, setVideos] = useState<VideoOption[]>([]);

  // Full-size modal
  const [viewingThumbnail, setViewingThumbnail] = useState<Thumbnail | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Set page title
  useEffect(() => {
    document.title = 'Thumbnail Generator — Contentine Create';
  }, []);

  // Fetch thumbnails and videos on mount
  useEffect(() => {
    fetchThumbnails();
    fetchVideos();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchThumbnails = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const data = await api.get<{ thumbnails: Thumbnail[] }>('/thumbnails');
      setThumbnails(data?.thumbnails || []);
    } catch (err) {
      const message = err instanceof APIError ? err.message : 'Failed to load thumbnails';
      setLoadError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchVideos = useCallback(async () => {
    try {
      const data = await api.get<{ videos: VideoOption[] }>('/videos');
      setVideos(data?.videos || []);
    } catch {
      // Non-critical — just means the dropdown will be empty
    }
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || isGenerating) return;

    setIsGenerating(true);
    setGenerateError(null);
    setModelProgress(null);

    try {
      // Attempt 1: Backend API (uses admin-configured DALL-E 3 key)
      const result = await api.post<{ thumbnail: Thumbnail }>('/thumbnails/generate', {
        prompt: prompt.trim(),
        size: selectedSize.value,
        video_id: selectedVideoId,
      });

      // Guard the response shape — a malformed 200 must not crash the flow (LT-05)
      if (!result?.thumbnail) {
        throw new Error('The server returned an unexpected response. Please try again.');
      }
      setGeneratedThumbnail(result.thumbnail);
      setThumbnails((prev) => [result.thumbnail, ...prev]);
    } catch (apiErr) {
      // Attempt 2: Browser-native SD Turbo fallback (feature-flagged — see model-catalog)
      try {
        const { IMAGE_GEN_ENABLED } = await import('@/lib/model-catalog');
        if (!IMAGE_GEN_ENABLED) {
          throw new Error(
            'On-device image generation is not available yet. Configure a DALL-E API key in settings to generate thumbnails.'
          );
        }
        const { sdTurboEngine } = await import('@/engine/sd-turbo-engine');

        const available = await sdTurboEngine.isAvailable();
        if (!available) {
          throw new Error(
            'Image generation unavailable. Configure a DALL-E API key in settings, or use a browser with WebGPU support and the shader-f16 feature (Chrome/Edge on a recent GPU).'
          );
        }

        await sdTurboEngine.initialize((fraction) => setModelProgress(fraction));
        setModelProgress(null); // Model loaded, clear download progress

        const imageBlob = await sdTurboEngine.generateImage(prompt.trim(), {
          width: selectedSize.width > selectedSize.height ? 512 : selectedSize.width === selectedSize.height ? 512 : 288,
          height: selectedSize.height > selectedSize.width ? 512 : selectedSize.width === selectedSize.height ? 512 : 288,
        });

        const url = URL.createObjectURL(imageBlob);

        // Create a local thumbnail object (not persisted to backend)
        const localThumbnail: Thumbnail = {
          id: Date.now(),
          video_id: selectedVideoId,
          prompt: prompt.trim(),
          image_path: url,
          created_at: new Date().toISOString(),
        };

        setGeneratedThumbnail(localThumbnail);
        setThumbnails((prev) => [localThumbnail, ...prev]);
      } catch {
        // Attempt 3: Canvas API fallback — gradient background with text overlay
        try {
          const canvas = document.createElement('canvas');
          canvas.width = selectedSize.width;
          canvas.height = selectedSize.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('Canvas not supported');

          // Brand gradient background
          const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
          gradient.addColorStop(0, '#00C3FF');   // primary
          gradient.addColorStop(0.5, '#F3A6FF'); // accent
          gradient.addColorStop(1, '#35C838');   // secondary
          ctx.fillStyle = gradient;
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          // Subtle dark overlay for text contrast
          ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          // Decorative circles
          ctx.globalAlpha = 0.08;
          ctx.fillStyle = '#FFFFFF';
          ctx.beginPath();
          ctx.arc(canvas.width * 0.15, canvas.height * 0.3, canvas.width * 0.2, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(canvas.width * 0.85, canvas.height * 0.7, canvas.width * 0.25, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;

          // Main title text
          const maxTextWidth = canvas.width * 0.8;
          const fontSize = Math.max(28, Math.min(72, canvas.width * 0.06));
          ctx.font = `bold ${fontSize}px Inter, -apple-system, BlinkMacSystemFont, sans-serif`;
          ctx.fillStyle = '#FFFFFF';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';

          // Word-wrap the prompt text
          const words = prompt.trim().split(/\s+/);
          const lines: string[] = [];
          let currentLine = '';
          for (const word of words) {
            const testLine = currentLine ? `${currentLine} ${word}` : word;
            if (ctx.measureText(testLine).width > maxTextWidth && currentLine) {
              lines.push(currentLine);
              currentLine = word;
            } else {
              currentLine = testLine;
            }
          }
          if (currentLine) lines.push(currentLine);

          // Limit to 4 lines max
          const displayLines = lines.slice(0, 4);
          if (lines.length > 4) {
            displayLines[3] = displayLines[3].slice(0, -3) + '...';
          }

          const lineHeight = fontSize * 1.3;
          const textBlockHeight = displayLines.length * lineHeight;
          const startY = (canvas.height - textBlockHeight) / 2 + lineHeight / 2;

          // Draw text shadow
          ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
          ctx.shadowBlur = 12;
          ctx.shadowOffsetX = 2;
          ctx.shadowOffsetY = 2;

          for (let i = 0; i < displayLines.length; i++) {
            ctx.fillText(displayLines[i], canvas.width / 2, startY + i * lineHeight);
          }

          // Reset shadow
          ctx.shadowColor = 'transparent';
          ctx.shadowBlur = 0;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 0;

          // Small branding badge at bottom
          const badgeFontSize = Math.max(12, fontSize * 0.25);
          ctx.font = `600 ${badgeFontSize}px Inter, sans-serif`;
          ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
          ctx.fillText('Created with Contentine Create', canvas.width / 2, canvas.height - badgeFontSize * 2.5);

          // Convert canvas to blob
          const canvasBlob = await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob(
              (blob) => (blob ? resolve(blob) : reject(new Error('Canvas export failed'))),
              'image/png',
              1.0
            );
          });

          const canvasUrl = URL.createObjectURL(canvasBlob);
          const localThumbnail: Thumbnail = {
            id: Date.now(),
            video_id: selectedVideoId,
            prompt: prompt.trim(),
            image_path: canvasUrl,
            created_at: new Date().toISOString(),
          };

          setGeneratedThumbnail(localThumbnail);
          setThumbnails((prev) => [localThumbnail, ...prev]);
        } catch (canvasErr) {
          const message =
            canvasErr instanceof Error
              ? canvasErr.message
              : 'Thumbnail generation failed. Configure a DALL-E API key or enable WebGPU.';
          setGenerateError(message);
        }
      }
    } finally {
      setIsGenerating(false);
      setModelProgress(null);
    }
  }, [prompt, isGenerating, selectedSize, selectedVideoId]);

  const handleDownload = useCallback((thumbnail: Thumbnail) => {
    const link = document.createElement('a');
    link.href = thumbnail.image_path;
    link.download = `thumbnail-${thumbnail.id}.png`;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, []);

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  const canGenerate = prompt.trim().length > 0 && !isGenerating;

  return (
    <div className="max-w-[1280px] mx-auto animate-fade-in">
      {/* Page header */}
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-0.5">
          <ImageIcon size={20} className="text-primary" />
          <h1 className="text-xl font-semibold text-text dark:text-white tracking-[-0.02em]">
            Thumbnail Generator
          </h1>
        </div>
        <p className="text-sm text-text-muted">
          Generate eye-catching thumbnails for your videos with AI.
        </p>
      </div>

      {/* On-device image model gate — only rendered when image-gen is flag-enabled
          (SD-Turbo in the catalog); otherwise the backend/canvas fallback path is used. */}
      <div className="mb-6 empty:mb-0">
        <ModelRequirements
          feature="thumbnails"
          description="On-device image generation runs locally. SD-Turbo downloads once, then works offline."
        />
      </div>

      {/* Main layout: generator + preview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* Left: Generator controls */}
        <div className="bento-card p-4 md:p-5">
          <h2 className="text-[14px] md:text-[13px] font-semibold text-text dark:text-[#E0E0E0] mb-3">
            Describe your thumbnail
          </h2>

          {/* Prompt textarea */}
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the thumbnail you want..."
            rows={3}
            aria-label="Thumbnail prompt"
            className="
              input-field resize-none mb-3
            "
          />

          {/* Size selector */}
          <div className="mb-3">
            <label className="block text-[12px] font-semibold text-text-secondary dark:text-[#AAA] mb-2">
              Size
            </label>
            <div className="grid grid-cols-3 gap-2">
              {SIZE_OPTIONS.map((opt) => {
                const isActive = selectedSize.value === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setSelectedSize(opt)}
                    aria-pressed={isActive}
                    className={`
                      flex flex-col items-center gap-1.5 px-2 py-3
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
                    {/* Visual aspect ratio preview */}
                    <div
                      className={`
                        rounded border
                        ${isActive ? 'border-primary/40 bg-primary/10' : 'border-black/10 dark:border-white/10 bg-black/[0.03] dark:bg-white/[0.03]'}
                        ${opt.value === '1024x1024' ? 'w-6 h-6' : ''}
                        ${opt.value === '1792x1024' ? 'w-8 h-5' : ''}
                        ${opt.value === '1024x1792' ? 'w-4 h-7' : ''}
                      `}
                    />
                    <span>{opt.label}</span>
                    <span className="text-[10px] opacity-60">{opt.width}×{opt.height}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Optional video association */}
          {videos.length > 0 && (
            <div className="mb-4">
              <label
                htmlFor="video-select"
                className="block text-[12px] font-semibold text-text-secondary dark:text-[#AAA] mb-1.5"
              >
                Associate with video <span className="font-normal opacity-60">(optional)</span>
              </label>
              <select
                id="video-select"
                value={selectedVideoId ?? ''}
                onChange={(e) => setSelectedVideoId(e.target.value ? Number(e.target.value) : null)}
                className="input-field"
              >
                <option value="">None</option>
                {videos.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.title}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Generate error */}
          {generateError && (
            <div className="flex items-start gap-2 p-3 mb-3 rounded-xl bg-danger/[0.06] dark:bg-danger/[0.1] border border-danger/10">
              <AlertTriangle size={14} className="text-danger shrink-0 mt-0.5" />
              <p className="text-[12px] text-danger leading-relaxed">{generateError}</p>
            </div>
          )}

          {/* Generate button */}
          <button
            type="button"
            onClick={handleGenerate}
            disabled={!canGenerate}
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
            {isGenerating ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles size={16} />
                Generate Thumbnail
              </>
            )}
          </button>
        </div>

        {/* Right: Preview */}
        <div className="bento-card p-4 md:p-5 flex flex-col">
          <h2 className="text-[14px] md:text-[13px] font-semibold text-text dark:text-[#E0E0E0] mb-3">
            Preview
          </h2>

          <div className="flex-1 flex items-center justify-center">
            {/* Loading skeleton */}
            {isGenerating && !generatedThumbnail && (
              <div className="w-full max-w-md">
                <div
                  className={`
                    w-full rounded-xl overflow-hidden
                    bg-gradient-to-r from-black/[0.04] via-black/[0.08] to-black/[0.04]
                    dark:from-white/[0.04] dark:via-white/[0.08] dark:to-white/[0.04]
                    animate-pulse
                    ${selectedSize.aspectClass}
                  `}
                />
                {/* SD Turbo model download progress bar */}
                {modelProgress !== null && (
                  <div className="mt-3">
                    <div className="w-full h-2 rounded-full bg-black/[0.06] dark:bg-white/[0.08] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all duration-300 ease-out"
                        style={{ width: `${Math.round(modelProgress * 100)}%` }}
                      />
                    </div>
                    <p className="mt-1.5 text-center text-[11px] text-text-muted">
                      Downloading image model... {Math.round(modelProgress * 100)}% (first time only)
                    </p>
                  </div>
                )}
                <div className="mt-3 flex items-center justify-center gap-2 text-[12px] text-text-muted">
                  <Loader2 size={14} className="animate-spin" />
                  <span>{modelProgress !== null ? 'Preparing image engine...' : 'Creating your thumbnail...'}</span>
                </div>
              </div>
            )}

            {/* Generated thumbnail */}
            {generatedThumbnail && !isGenerating && (
              <div className="w-full max-w-md">
                <div className="relative group rounded-xl overflow-hidden border border-black/[0.06] dark:border-white/[0.06]">
                  {/* AI-generated disclosure (EU AI Act Art. 50) */}
                  <AiGeneratedBadge variant="corner" />
                  <img
                    src={generatedThumbnail.image_path}
                    alt={generatedThumbnail.prompt}
                    className="w-full h-auto object-contain"
                    loading="eager"
                  />
                  {/* Overlay actions */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors duration-200 flex items-center justify-center gap-3 opacity-0 group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => handleDownload(generatedThumbnail)}
                      aria-label="Download thumbnail"
                      className="
                        flex items-center gap-1.5 px-3 py-2
                        min-h-[44px] md:min-h-0
                        bg-white/90 text-[#0A0A0A] rounded-lg text-[12px] font-semibold
                        hover:bg-white transition-colors cursor-pointer
                        focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none
                      "
                    >
                      <Download size={14} />
                      Download
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewingThumbnail(generatedThumbnail)}
                      aria-label="View full size"
                      className="
                        flex items-center gap-1.5 px-3 py-2
                        min-h-[44px] md:min-h-0
                        bg-white/90 text-[#0A0A0A] rounded-lg text-[12px] font-semibold
                        hover:bg-white transition-colors cursor-pointer
                        focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none
                      "
                    >
                      <Expand size={14} />
                      Full Size
                    </button>
                  </div>
                </div>
                <p className="mt-2 text-[11px] text-text-muted truncate">{generatedThumbnail.prompt}</p>
              </div>
            )}

            {/* Shimmer skeleton while generating (with existing thumbnail) */}
            {isGenerating && generatedThumbnail && (
              <div className="w-full max-w-md">
                <div
                  className={`
                    w-full rounded-xl overflow-hidden
                    bg-gradient-to-r from-black/[0.04] via-black/[0.08] to-black/[0.04]
                    dark:from-white/[0.04] dark:via-white/[0.08] dark:to-white/[0.04]
                    animate-pulse
                    ${selectedSize.aspectClass}
                  `}
                />
                {/* SD Turbo model download progress bar */}
                {modelProgress !== null && (
                  <div className="mt-3">
                    <div className="w-full h-2 rounded-full bg-black/[0.06] dark:bg-white/[0.08] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all duration-300 ease-out"
                        style={{ width: `${Math.round(modelProgress * 100)}%` }}
                      />
                    </div>
                    <p className="mt-1.5 text-center text-[11px] text-text-muted">
                      Downloading image model... {Math.round(modelProgress * 100)}% (first time only)
                    </p>
                  </div>
                )}
                <div className="mt-3 flex items-center justify-center gap-2 text-[12px] text-text-muted">
                  <Loader2 size={14} className="animate-spin" />
                  <span>{modelProgress !== null ? 'Preparing image engine...' : 'Creating your thumbnail...'}</span>
                </div>
              </div>
            )}

            {/* Placeholder state — no thumbnail yet */}
            {!generatedThumbnail && !isGenerating && (
              <div className="flex flex-col items-center text-center py-8">
                <div className="w-14 h-14 rounded-2xl bg-primary/[0.06] flex items-center justify-center mb-3">
                  <ImageIcon size={24} className="text-primary/40" />
                </div>
                <p className="text-[13px] text-text-muted">
                  Your generated thumbnail will appear here
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Gallery section */}
      <div>
        <h2 className="text-[15px] md:text-[14px] font-semibold text-text dark:text-white mb-3">
          Your Thumbnails
        </h2>

        {/* Loading skeleton grid */}
        {isLoading && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="bento-card overflow-hidden animate-pulse">
                <div className="w-full aspect-video bg-black/[0.04] dark:bg-white/[0.06]" />
                <div className="p-3">
                  <div className="w-full h-3 bg-black/[0.04] dark:bg-white/[0.06] rounded-md mb-2" />
                  <div className="w-2/3 h-3 bg-black/[0.04] dark:bg-white/[0.06] rounded-md mb-2" />
                  <div className="w-20 h-2.5 bg-black/[0.04] dark:bg-white/[0.06] rounded-md" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Error state */}
        {!isLoading && loadError && (
          <div className="max-w-md mx-auto flex flex-col items-center text-center py-12">
            <div className="w-12 h-12 rounded-2xl bg-danger/10 flex items-center justify-center mb-4">
              <AlertTriangle size={24} className="text-danger" />
            </div>
            <h3 className="text-[15px] font-semibold text-text dark:text-white mb-1.5">
              Failed to load thumbnails
            </h3>
            <p className="text-[13px] text-text-muted mb-5 leading-relaxed">{loadError}</p>
            <button
              type="button"
              onClick={fetchThumbnails}
              className="
                flex items-center gap-2 px-4 py-2.5
                min-h-[44px] md:min-h-0
                bg-primary text-white rounded-xl text-[13px] font-semibold
                hover:bg-primary-hover active:scale-[0.97]
                transition-all duration-150 cursor-pointer
                focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none
              "
            >
              <RotateCcw size={14} />
              Retry
            </button>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !loadError && thumbnails.length === 0 && (
          <EmptyState
            icon={<ImageIcon size={28} className="text-primary" />}
            headline="No thumbnails yet"
            description="Generate your first AI-powered thumbnail above. Describe what you want and we will create it in seconds."
            ctaLabel="Start creating"
            onCTA={() => textareaRef.current?.focus()}
          />
        )}

        {/* Thumbnail grid */}
        {!isLoading && !loadError && thumbnails.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {thumbnails.map((thumb) => (
              <button
                key={thumb.id}
                type="button"
                onClick={() => setViewingThumbnail(thumb)}
                className="
                  bento-card overflow-hidden text-left group
                  transition-all duration-200 cursor-pointer
                  focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none
                "
              >
                <div className="relative overflow-hidden">
                  <img
                    src={thumb.image_path}
                    alt={thumb.prompt}
                    className="w-full aspect-video object-cover group-hover:scale-[1.03] transition-transform duration-300"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-200" />
                </div>
                <div className="p-3">
                  <p className="text-[12px] text-text dark:text-[#E0E0E0] font-medium line-clamp-2 leading-relaxed mb-1.5">
                    {thumb.prompt}
                  </p>
                  <div className="flex items-center gap-1 text-[10px] text-text-muted">
                    <Calendar size={10} />
                    <span>{formatDate(thumb.created_at)}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Full-size modal */}
      {viewingThumbnail && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
          onClick={() => setViewingThumbnail(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Thumbnail preview"
        >
          <div
            className="relative max-w-3xl w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              type="button"
              onClick={() => setViewingThumbnail(null)}
              aria-label="Close preview"
              className="
                absolute -top-10 right-0
                flex items-center justify-center w-8 h-8
                min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0
                text-white/80 hover:text-white
                transition-colors cursor-pointer
                focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none
              "
            >
              <X size={20} />
            </button>

            {/* Image */}
            <img
              src={viewingThumbnail.image_path}
              alt={viewingThumbnail.prompt}
              className="w-full h-auto rounded-xl shadow-2xl"
            />

            {/* Actions bar */}
            <div className="mt-3 flex items-center justify-between">
              <p className="text-[12px] text-white/70 truncate flex-1 mr-4">
                {viewingThumbnail.prompt}
              </p>
              <button
                type="button"
                onClick={() => handleDownload(viewingThumbnail)}
                className="
                  flex items-center gap-1.5 px-4 py-2.5
                  min-h-[44px] md:min-h-0
                  bg-white text-[#0A0A0A] rounded-xl text-[12px] font-semibold
                  hover:bg-white/90 active:scale-[0.97]
                  transition-all duration-200 cursor-pointer shrink-0
                  focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none
                "
              >
                <Download size={14} />
                Download
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
