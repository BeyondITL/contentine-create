'use client';

import { useState, useRef, useCallback } from 'react';
import { Download, Plus, Play, Pause, Music, ExternalLink, Volume2 } from 'lucide-react';
import type { StockItem } from '@/stores/stock-store';

interface StockMediaCardProps {
  item: StockItem;
  onAddToVideo: (item: StockItem) => void;
  onDownload: (item: StockItem) => void;
}

/** Source brand colors for badges. */
const SOURCE_COLORS: Record<string, { bg: string; text: string }> = {
  pexels: { bg: 'rgba(5, 160, 110, 0.1)', text: '#05A06E' },
  pixabay: { bg: 'rgba(0, 171, 108, 0.1)', text: '#00AB6C' },
  freesound: { bg: 'rgba(255, 152, 0, 0.1)', text: '#FF9800' },
};

/** Format duration in seconds to mm:ss display. */
function formatDuration(seconds?: number): string {
  if (!seconds) return '';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/** Individual stock media card with inline video/audio preview, attribution, and actions. */
export default function StockMediaCard({ item, onAddToVideo, onDownload }: StockMediaCardProps) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showVideo, setShowVideo] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const sourceStyle = SOURCE_COLORS[item.source] || { bg: 'rgba(0,0,0,0.05)', text: '#666' };
  const isVideo = item.type === 'video';
  const isAudio = item.type === 'audio';

  /** Toggle inline video playback. */
  const handleVideoToggle = useCallback(() => {
    if (!isVideo) return;
    if (!showVideo) {
      setShowVideo(true);
      // Video will auto-play once mounted via onLoadedData
      return;
    }
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) {
      el.play().catch(() => {});
      setIsPlaying(true);
    } else {
      el.pause();
      setIsPlaying(false);
    }
  }, [isVideo, showVideo]);

  /** Toggle inline audio playback. */
  const handleAudioToggle = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      el.play().catch(() => {});
      setIsPlaying(true);
    } else {
      el.pause();
      setIsPlaying(false);
    }
  }, []);

  return (
    <div className="bento-card overflow-hidden group flex flex-col">
      {/* Thumbnail / preview area */}
      <div className="relative aspect-[4/3] bg-black/[0.03] dark:bg-white/[0.03] overflow-hidden">
        {isAudio ? (
          /* Audio preview with play/pause */
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-warning/5 to-warning/10 dark:from-warning/10 dark:to-warning/20">
            <button
              type="button"
              onClick={handleAudioToggle}
              aria-label={isPlaying ? 'Pause audio preview' : 'Play audio preview'}
              className="
                w-14 h-14 rounded-full bg-warning/15 hover:bg-warning/25
                flex items-center justify-center
                transition-all duration-200 cursor-pointer
                focus-visible:ring-2 focus-visible:ring-warning/40 focus-visible:outline-none
                active:scale-[0.93]
              "
            >
              {isPlaying ? (
                <Pause size={22} className="text-warning" fill="currentColor" />
              ) : (
                <Play size={22} className="text-warning ml-0.5" fill="currentColor" />
              )}
            </button>

            {/* Audio waveform indicator */}
            {isPlaying && (
              <div className="flex items-end gap-[3px] h-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className="w-[3px] bg-warning/60 rounded-full animate-pulse"
                    style={{
                      height: `${8 + Math.random() * 8}px`,
                      animationDelay: `${i * 0.1}s`,
                      animationDuration: `${0.4 + Math.random() * 0.3}s`,
                    }}
                  />
                ))}
              </div>
            )}

            {item.duration != null && item.duration > 0 && (
              <span className="text-[11px] font-medium text-text-muted dark:text-[#888]">
                {formatDuration(item.duration)}
              </span>
            )}

            {/* Hidden audio element for inline playback */}
            <audio
              ref={audioRef}
              src={item.preview_url}
              preload="none"
              onEnded={() => setIsPlaying(false)}
              onPause={() => setIsPlaying(false)}
              onPlay={() => setIsPlaying(true)}
            />
          </div>
        ) : isVideo && showVideo ? (
          /* Inline video player */
          <div className="absolute inset-0">
            <video
              ref={videoRef}
              src={item.preview_url || item.download_url}
              className="w-full h-full object-cover"
              muted
              loop
              playsInline
              onLoadedData={() => {
                videoRef.current?.play().catch(() => {});
                setIsPlaying(true);
              }}
              onPause={() => setIsPlaying(false)}
              onPlay={() => setIsPlaying(true)}
            />
            {/* Play/pause overlay */}
            <button
              type="button"
              onClick={handleVideoToggle}
              aria-label={isPlaying ? 'Pause video' : 'Play video'}
              className="
                absolute inset-0 flex items-center justify-center
                bg-transparent hover:bg-black/10
                transition-all duration-200 cursor-pointer
                focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none
                opacity-0 group-hover:opacity-100
              "
            >
              <div className="w-10 h-10 rounded-full bg-black/60 flex items-center justify-center">
                {isPlaying ? (
                  <Pause size={18} className="text-white" fill="currentColor" />
                ) : (
                  <Play size={18} className="text-white ml-0.5" fill="currentColor" />
                )}
              </div>
            </button>
            {/* Muted indicator */}
            <div className="absolute top-2 left-2 flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-black/60 text-white/70 text-[9px]">
              <Volume2 size={10} />
              Muted
            </div>
            {/* Duration overlay */}
            {item.duration != null && item.duration > 0 && (
              <div className="absolute bottom-2 right-2 flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-black/70 text-white text-[10px] font-medium">
                {formatDuration(item.duration)}
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Static thumbnail for photo / video poster */}
            {!imageError && (
              <img
                src={item.preview_url}
                alt={item.title}
                loading="lazy"
                onLoad={() => setImageLoaded(true)}
                onError={() => setImageError(true)}
                className={`
                  absolute inset-0 w-full h-full object-cover
                  transition-all duration-500
                  group-hover:scale-[1.03]
                  ${imageLoaded ? 'opacity-100' : 'opacity-0'}
                `}
              />
            )}
            {/* Loading shimmer */}
            {!imageLoaded && !imageError && (
              <div className="absolute inset-0 animate-pulse bg-black/[0.04] dark:bg-white/[0.06]" />
            )}
            {/* Broken image fallback */}
            {imageError && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/[0.03] dark:bg-white/[0.03]">
                <ExternalLink size={20} className="text-text-muted" />
              </div>
            )}
            {/* Video play button overlay */}
            {isVideo && (
              <button
                type="button"
                onClick={handleVideoToggle}
                aria-label="Play video preview"
                className="
                  absolute inset-0 flex items-center justify-center
                  bg-transparent hover:bg-black/10
                  transition-all duration-200 cursor-pointer
                  focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none
                  opacity-0 group-hover:opacity-100
                "
              >
                <div className="w-11 h-11 rounded-full bg-black/60 flex items-center justify-center shadow-lg">
                  <Play size={20} className="text-white ml-0.5" fill="currentColor" />
                </div>
              </button>
            )}
            {/* Video duration badge */}
            {isVideo && item.duration != null && item.duration > 0 && (
              <div className="absolute bottom-2 right-2 flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-black/70 text-white text-[10px] font-medium">
                <Play size={9} fill="currentColor" />
                {formatDuration(item.duration)}
              </div>
            )}
          </>
        )}
      </div>

      {/* Card body */}
      <div className="flex-1 flex flex-col p-3.5">
        {/* Title */}
        <h3 className="text-[12px] font-semibold text-text dark:text-[#E0E0E0] leading-snug line-clamp-2 mb-2">
          {item.title || 'Untitled'}
        </h3>

        {/* Source badge + attribution */}
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <span
            className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold capitalize shrink-0"
            style={{ backgroundColor: sourceStyle.bg, color: sourceStyle.text }}
          >
            {item.source}
          </span>
          {item.attribution && (
            <span
              className="text-[10px] text-text-muted dark:text-[#777] truncate max-w-[160px]"
              title={item.attribution}
            >
              {item.attribution}
            </span>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 mt-auto">
          <button
            type="button"
            onClick={() => onAddToVideo(item)}
            className="
              flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2
              min-h-[44px] md:min-h-0
              rounded-lg text-[11px] font-semibold
              bg-primary/[0.07] text-primary
              hover:bg-primary/[0.14] dark:hover:bg-primary/[0.18]
              active:scale-[0.97]
              transition-all duration-200 cursor-pointer
              focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none
            "
          >
            <Plus size={13} />
            Add to Video
          </button>
          <button
            type="button"
            onClick={() => onDownload(item)}
            aria-label={`Download ${item.title}`}
            className="
              inline-flex items-center justify-center
              w-9 h-9 min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0
              rounded-lg text-text-muted
              hover:text-text dark:hover:text-white
              hover:bg-surface dark:hover:bg-[#333]
              active:scale-[0.92]
              transition-all duration-200 cursor-pointer
              focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none
            "
          >
            <Download size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
