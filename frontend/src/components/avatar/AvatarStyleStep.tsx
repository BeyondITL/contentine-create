'use client';

import { Monitor, Smartphone, Square, Sparkles } from 'lucide-react';
import { useAvatarStore } from '@/stores/avatar-store';
import type { AspectRatio } from '@/types';

const ASPECT_RATIOS: { value: AspectRatio; label: string; icon: typeof Monitor }[] = [
  { value: '9:16', label: 'Portrait', icon: Smartphone },
  { value: '16:9', label: 'Landscape', icon: Monitor },
  { value: '1:1', label: 'Square', icon: Square },
];

const SUBTITLE_STYLES = [
  { id: 'modern-pop', label: 'Modern Pop', desc: 'Bold animated text' },
  { id: 'karaoke', label: 'Karaoke', desc: 'Word-by-word highlight' },
  { id: 'minimal', label: 'Minimal', desc: 'Clean & subtle' },
  { id: 'bold-center', label: 'Bold Center', desc: 'Large centered text' },
  { id: 'none', label: 'No Subtitles', desc: 'Voice only' },
];

const BG_STYLES: { id: 'solid' | 'gradient' | 'blur'; label: string; desc: string }[] = [
  { id: 'blur', label: 'Blurred Photo', desc: 'Frosted glass effect using the avatar photo' },
  { id: 'gradient', label: 'Dark Gradient', desc: 'Professional dark blue gradient' },
  { id: 'solid', label: 'Solid Color', desc: 'Single solid background color' },
];

const BG_COLORS = [
  '#0a0a0a', '#1a1a2e', '#16213e', '#0f3460', '#533483',
  '#2c3e50', '#1b2838', '#0d1b2a', '#2d132c', '#1a1a1a',
];

/** Step 4 — Style settings: aspect ratio, subtitles, background. */
export default function AvatarStyleStep() {
  const {
    aspectRatio, setAspectRatio,
    subtitleStyle, setSubtitleStyle,
    backgroundStyle, setBackgroundStyle,
    backgroundColor, setBackgroundColor,
  } = useAvatarStore();

  return (
    <div className="space-y-6">
      {/* Aspect Ratio */}
      <Section title="Aspect Ratio">
        <div className="grid grid-cols-3 gap-2 md:gap-3">
          {ASPECT_RATIOS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => setAspectRatio(value)}
              className={`
                flex flex-col items-center gap-1.5 md:gap-2 p-3 md:p-4 rounded-xl border-2 transition-all min-h-[44px]
                ${aspectRatio === value
                  ? 'border-primary bg-primary-bg dark:bg-primary/10 ring-1 ring-primary/20'
                  : 'border-border-light dark:border-[#333] hover:border-border dark:hover:border-[#555]'
                }
              `}
            >
              <Icon size={24} className={aspectRatio === value ? 'text-primary' : 'text-muted'} />
              <div className="text-center">
                <p className="text-xs md:text-sm font-medium text-text dark:text-white">{value}</p>
                <p className="text-[10px] md:text-[11px] text-muted">{label}</p>
              </div>
            </button>
          ))}
        </div>
      </Section>

      {/* Subtitle Style */}
      <Section title="Subtitles">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {SUBTITLE_STYLES.map((style) => (
            <button
              key={style.id}
              type="button"
              onClick={() => setSubtitleStyle(style.id)}
              className={`
                flex flex-col items-start p-3 rounded-xl border-2 text-left transition-all min-h-[44px]
                ${subtitleStyle === style.id
                  ? 'border-accent bg-accent/5 ring-1 ring-accent/20'
                  : 'border-border-light dark:border-[#333] hover:border-border dark:hover:border-[#555]'
                }
              `}
            >
              <p className="text-xs font-medium text-text dark:text-white">{style.label}</p>
              <p className="text-[10px] text-muted mt-0.5">{style.desc}</p>
            </button>
          ))}
        </div>
      </Section>

      {/* Background */}
      <Section title="Background">
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 md:gap-3">
            {BG_STYLES.map((bg) => (
              <button
                key={bg.id}
                type="button"
                onClick={() => setBackgroundStyle(bg.id)}
                className={`
                  flex flex-col items-start p-3 rounded-xl border-2 text-left transition-all min-h-[44px]
                  ${backgroundStyle === bg.id
                    ? 'border-primary bg-primary-bg dark:bg-primary/10 ring-1 ring-primary/20'
                    : 'border-border-light dark:border-[#333] hover:border-border dark:hover:border-[#555]'
                  }
                `}
              >
                <p className="text-xs font-medium text-text dark:text-white">{bg.label}</p>
                <p className="text-[10px] text-muted mt-0.5">{bg.desc}</p>
              </button>
            ))}
          </div>

          {/* Color picker (only for solid) */}
          {backgroundStyle === 'solid' && (
            <div className="flex items-center gap-2 pt-2">
              <span className="text-xs text-muted shrink-0">Color:</span>
              <div className="flex gap-2 md:gap-1.5 flex-wrap">
                {BG_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setBackgroundColor(color)}
                    className={`w-9 h-9 md:w-7 md:h-7 rounded-full border-2 transition-all ${
                      backgroundColor === color
                        ? 'border-primary scale-110'
                        : 'border-transparent hover:border-border'
                    }`}
                    style={{ backgroundColor: color }}
                    aria-label={`Background color ${color}`}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </Section>

      {/* Preview hint */}
      <div className="bg-accent/5 border border-accent/20 rounded-lg p-3">
        <p className="text-[11px] text-accent font-medium flex items-center gap-1 mb-1">
          <Sparkles size={10} />
          Style Preview
        </p>
        <p className="text-[11px] text-muted leading-relaxed">
          Your avatar will be centered in the frame with the selected background style. Subtitles appear at the bottom, synchronized with the AI voiceover.
        </p>
      </div>
    </div>
  );
}

/** Section wrapper with title. */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">{title}</h3>
      {children}
    </div>
  );
}
