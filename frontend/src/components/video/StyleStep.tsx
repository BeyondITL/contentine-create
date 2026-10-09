'use client';

import { Check, Monitor, Smartphone, Square, Type, Music, Volume2 } from 'lucide-react';
import { useEditorStore } from '@/stores/editor-store';
import type { AspectRatio } from '@/types';

/* Subtitle style presets */
const SUBTITLE_STYLES = [
  { id: 'modern-pop', name: 'Modern Pop', preview: 'text-white font-bold text-lg drop-shadow-lg', bg: 'bg-gradient-to-r from-primary to-accent' },
  { id: 'minimal-white', name: 'Minimal White', preview: 'text-white font-medium text-base', bg: 'bg-[#1a1a1a]' },
  { id: 'bold-yellow', name: 'Bold Yellow', preview: 'text-yellow-400 font-extrabold text-lg', bg: 'bg-[#1a1a1a]' },
  { id: 'news-ticker', name: 'News Ticker', preview: 'text-white font-medium text-sm tracking-wide', bg: 'bg-red-600' },
  { id: 'karaoke', name: 'Karaoke', preview: 'text-primary font-bold text-lg', bg: 'bg-black' },
  { id: 'typewriter', name: 'Typewriter', preview: 'text-white font-mono text-sm', bg: 'bg-[#2d2d2d]' },
  { id: 'outline', name: 'Outline', preview: 'text-transparent font-bold text-lg', bg: 'bg-[#1a1a1a]' },
  { id: 'none', name: 'No Subtitles', preview: 'text-muted text-sm italic', bg: 'bg-surface dark:bg-[#1e1e1e]' },
] as const;

/* Aspect ratio cards */
const ASPECT_RATIOS: { ratio: AspectRatio; label: string; desc: string; icon: React.ReactNode; w: number; h: number }[] = [
  { ratio: '9:16', label: '9:16', desc: 'TikTok, Reels, Shorts', icon: <Smartphone size={20} />, w: 9, h: 16 },
  { ratio: '16:9', label: '16:9', desc: 'YouTube, Landscape', icon: <Monitor size={20} />, w: 16, h: 9 },
  { ratio: '1:1', label: '1:1', desc: 'Instagram Feed, Twitter', icon: <Square size={20} />, w: 1, h: 1 },
];

const TRANSITIONS = [
  { id: 'crossfade' as const, name: 'Crossfade', desc: 'Smooth blend' },
  { id: 'cut' as const, name: 'Hard Cut', desc: 'Instant switch' },
  { id: 'slide' as const, name: 'Slide', desc: 'Directional wipe' },
];

/** Step 4 — Style: subtitle style, aspect ratio, music, transitions. */
export default function StyleStep() {
  const {
    subtitleStyle,
    setSubtitleStyle,
    aspectRatio,
    setAspectRatio,
    transitionStyle,
    setTransitionStyle,
    musicUrl,
    setMusicUrl,
    musicVolume,
    setMusicVolume,
  } = useEditorStore();

  return (
    <div className="space-y-8">
      {/* Subtitle style */}
      <section>
        <h3 className="text-sm font-semibold text-text dark:text-white mb-1 flex items-center gap-2">
          <Type size={16} />
          Subtitle Style
        </h3>
        <p className="text-xs text-muted mb-3">Choose how captions appear on your video</p>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {SUBTITLE_STYLES.map((style) => {
            const isActive = subtitleStyle === style.id;
            return (
              <button
                key={style.id}
                type="button"
                onClick={() => setSubtitleStyle(style.id)}
                className={`
                  relative rounded-xl border-2 overflow-hidden transition-all min-h-[44px]
                  ${isActive
                    ? 'border-primary ring-1 ring-primary/20'
                    : 'border-border-light dark:border-[#333] hover:border-border dark:hover:border-[#555]'
                  }
                `}
              >
                {/* Preview area */}
                <div className={`${style.bg} px-3 py-6 flex items-center justify-center`}>
                  <span className={style.preview}>
                    {style.id === 'none' ? 'No text' : 'Sample text'}
                  </span>
                </div>

                {/* Name */}
                <div className="px-3 py-2 bg-white dark:bg-[#1e1e1e] flex items-center justify-between">
                  <span className="text-xs font-medium text-text dark:text-white">{style.name}</span>
                  {isActive && <Check size={14} className="text-primary" />}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Aspect ratio */}
      <section>
        <h3 className="text-sm font-semibold text-text dark:text-white mb-1 flex items-center gap-2">
          <Monitor size={16} />
          Aspect Ratio
        </h3>
        <p className="text-xs text-muted mb-3">Choose your video format</p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {ASPECT_RATIOS.map((ar) => {
            const isActive = aspectRatio === ar.ratio;
            return (
              <button
                key={ar.ratio}
                type="button"
                onClick={() => setAspectRatio(ar.ratio)}
                className={`
                  flex flex-col items-center gap-3 p-4 min-h-[44px] rounded-xl border-2 transition-all
                  ${isActive
                    ? 'border-primary bg-primary-bg dark:bg-primary/10'
                    : 'border-border-light dark:border-[#333] hover:border-border dark:hover:border-[#555]'
                  }
                `}
              >
                {/* Visual ratio representation */}
                <div
                  className={`border-2 rounded-md ${isActive ? 'border-primary' : 'border-border dark:border-[#555]'}`}
                  style={{
                    width: `${Math.min(ar.w * 4, 48)}px`,
                    height: `${Math.min(ar.h * 4, 48)}px`,
                  }}
                />
                <div className="text-center">
                  <span className="text-sm font-semibold text-text dark:text-white">{ar.label}</span>
                  <p className="text-[11px] text-muted mt-0.5">{ar.desc}</p>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Transition style */}
      <section>
        <h3 className="text-sm font-semibold text-text dark:text-white mb-3">Transition</h3>
        <div className="flex flex-col sm:flex-row gap-3">
          {TRANSITIONS.map((t) => {
            const isActive = transitionStyle === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTransitionStyle(t.id)}
                className={`
                  flex-1 flex flex-col items-center gap-1 p-3 min-h-[44px] rounded-xl border-2 transition-all
                  ${isActive
                    ? 'border-primary bg-primary-bg dark:bg-primary/10'
                    : 'border-border-light dark:border-[#333] hover:border-border dark:hover:border-[#555]'
                  }
                `}
              >
                <span className="text-sm font-medium text-text dark:text-white">{t.name}</span>
                <span className="text-[11px] text-muted">{t.desc}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Background music */}
      <section>
        <h3 className="text-sm font-semibold text-text dark:text-white mb-1 flex items-center gap-2">
          <Music size={16} />
          Background Music
          <span className="text-xs text-muted font-normal">(optional)</span>
        </h3>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mt-3">
          <button
            type="button"
            onClick={() => setMusicUrl(null)}
            className={`px-4 py-2 min-h-[44px] md:min-h-0 rounded-lg text-sm font-medium border transition-all ${
              !musicUrl
                ? 'border-primary bg-primary-bg dark:bg-primary/10 text-primary'
                : 'border-border-light dark:border-[#333] text-muted hover:text-text dark:hover:text-white'
            }`}
          >
            No Music
          </button>
          <button
            type="button"
            onClick={() => setMusicUrl('/audio/sample-bgm.mp3')}
            className={`px-4 py-2 min-h-[44px] md:min-h-0 rounded-lg text-sm font-medium border transition-all ${
              musicUrl
                ? 'border-primary bg-primary-bg dark:bg-primary/10 text-primary'
                : 'border-border-light dark:border-[#333] text-muted hover:text-text dark:hover:text-white'
            }`}
          >
            Browse Library
          </button>
        </div>

        {musicUrl && (
          <div className="flex items-center gap-3 mt-3 p-3 bg-surface dark:bg-[#1e1e1e] rounded-lg">
            <Volume2 size={16} className="text-muted" />
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={musicVolume}
              onChange={(e) => setMusicVolume(parseFloat(e.target.value))}
              className="flex-1 h-1 bg-border dark:bg-[#333] rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 md:[&::-webkit-slider-thumb]:w-3 md:[&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary"
            />
            <span className="text-xs text-muted w-8">{Math.round(musicVolume * 100)}%</span>
          </div>
        )}
      </section>
    </div>
  );
}
