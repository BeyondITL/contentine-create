'use client';

import {
  Twitter, Linkedin, Instagram, Facebook, Music2,
  MessageCircle, BookOpen, Mail, Video, CheckCheck, XCircle, Sparkles,
} from 'lucide-react';
import { useRemixStore } from '@/stores/remix-store';
import type { RemixTarget } from '@/types';

interface PlatformOption {
  id: RemixTarget;
  label: string;
  description: string;
  icon: typeof Twitter;
  color: string;
}

const PLATFORMS: PlatformOption[] = [
  { id: 'twitter', label: 'Twitter / X', description: 'Tweet or thread (280 chars)', icon: Twitter, color: 'text-sky-500' },
  { id: 'linkedin', label: 'LinkedIn', description: 'Professional post (1200-3000 chars)', icon: Linkedin, color: 'text-blue-600' },
  { id: 'instagram', label: 'Instagram', description: 'Caption + hashtags', icon: Instagram, color: 'text-pink-500' },
  { id: 'facebook', label: 'Facebook', description: 'Conversational post', icon: Facebook, color: 'text-blue-500' },
  { id: 'tiktok', label: 'TikTok', description: 'Ultra-punchy caption', icon: Music2, color: 'text-pink-600' },
  { id: 'threads', label: 'Threads', description: 'Personal, no hashtags', icon: MessageCircle, color: 'text-gray-700 dark:text-gray-300' },
  { id: 'blog', label: 'Blog Article', description: 'SEO-optimized 1000-2000 words', icon: BookOpen, color: 'text-emerald-500' },
  { id: 'newsletter', label: 'Newsletter', description: 'Email with CTA (300-800 words)', icon: Mail, color: 'text-orange-500' },
  { id: 'video_script', label: 'Video Script', description: 'Scene-by-scene for video creator', icon: Video, color: 'text-accent' },
];

/** Step 2 — Select target platforms and add custom instructions. */
export default function PlatformSelector() {
  const {
    selectedPlatforms, togglePlatform, selectAllPlatforms, deselectAllPlatforms,
    customInstructions, setCustomInstructions,
  } = useRemixStore();

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-text dark:text-white">Target Platforms</h3>
          <p className="text-[11px] text-muted mt-0.5">
            Select where you want your content remixed for ({selectedPlatforms.length} selected)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={selectAllPlatforms}
            className="flex items-center gap-1 px-3 py-2 min-h-[44px] text-[11px] font-medium text-primary hover:bg-primary/5 rounded-md transition-colors"
          >
            <CheckCheck size={12} />
            Select All
          </button>
          <button
            type="button"
            onClick={deselectAllPlatforms}
            className="flex items-center gap-1 px-3 py-2 min-h-[44px] text-[11px] font-medium text-muted hover:text-text dark:hover:text-white hover:bg-surface dark:hover:bg-[#2a2a2a] rounded-md transition-colors"
          >
            <XCircle size={12} />
            Clear
          </button>
        </div>
      </div>

      {/* Platform cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {PLATFORMS.map((platform) => {
          const isSelected = selectedPlatforms.includes(platform.id);
          const Icon = platform.icon;

          return (
            <button
              key={platform.id}
              type="button"
              onClick={() => togglePlatform(platform.id)}
              className={`
                relative flex items-start gap-3 p-3 min-h-[56px] rounded-xl border-2 text-left transition-all active:scale-[0.98]
                ${isSelected
                  ? platform.id === 'video_script'
                    ? 'border-accent bg-accent/5 dark:bg-accent/10 ring-1 ring-accent/20'
                    : 'border-primary bg-primary-bg dark:bg-primary/10 ring-1 ring-primary/20'
                  : 'border-border-light dark:border-[#333] hover:border-border dark:hover:border-[#555]'
                }
              `}
            >
              {/* Checkbox indicator */}
              <div className={`
                w-6 h-6 rounded-md border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all
                ${isSelected
                  ? platform.id === 'video_script'
                    ? 'bg-accent border-accent'
                    : 'bg-primary border-primary'
                  : 'border-border dark:border-[#555]'
                }
              `}>
                {isSelected && (
                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                    <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <Icon size={14} className={platform.color} />
                  <span className="text-sm font-medium text-text dark:text-white">{platform.label}</span>
                </div>
                <p className="text-[10px] text-muted mt-0.5 leading-relaxed">{platform.description}</p>
              </div>

              {/* AI sparkle for video_script */}
              {platform.id === 'video_script' && (
                <Sparkles size={12} className="text-accent absolute top-2 right-2" />
              )}
            </button>
          );
        })}
      </div>

      {/* Custom instructions */}
      <div className="space-y-2">
        <label className="text-xs font-semibold text-muted uppercase tracking-wider flex items-center gap-1">
          <Sparkles size={10} className="text-accent" />
          Custom Instructions (Optional)
        </label>
        <textarea
          value={customInstructions}
          onChange={(e) => setCustomInstructions(e.target.value)}
          rows={3}
          placeholder="Any special instructions for the AI? E.g. 'Focus on the 3 key takeaways', 'Use a casual Gen-Z tone', 'Include a call-to-action about our launch'..."
          className="w-full bg-white dark:bg-[#1e1e1e] border border-border-light dark:border-[#333] rounded-xl px-4 py-3 text-[16px] sm:text-sm text-text dark:text-white placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent resize-none transition-all"
        />
      </div>
    </div>
  );
}
