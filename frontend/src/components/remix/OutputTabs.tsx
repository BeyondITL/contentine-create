'use client';

import {
  Twitter, Linkedin, Instagram, Facebook, Music2,
  MessageCircle, BookOpen, Mail, Video, Copy, RefreshCw,
  Calendar, Send, Loader2, Check, Sparkles, ArrowRight,
  AlertCircle, Clapperboard,
} from 'lucide-react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useRemixStore } from '@/stores/remix-store';
import { useEditorStore } from '@/stores/editor-store';
import type { RemixTarget, RemixOutput } from '@/types';

/** Platform icon + metadata. */
function getPlatformMeta(platform: RemixTarget) {
  const map: Record<RemixTarget, { icon: typeof Twitter; label: string; color: string }> = {
    twitter: { icon: Twitter, label: 'Twitter / X', color: 'text-sky-500' },
    linkedin: { icon: Linkedin, label: 'LinkedIn', color: 'text-blue-600' },
    instagram: { icon: Instagram, label: 'Instagram', color: 'text-pink-500' },
    facebook: { icon: Facebook, label: 'Facebook', color: 'text-blue-500' },
    tiktok: { icon: Music2, label: 'TikTok', color: 'text-pink-600' },
    threads: { icon: MessageCircle, label: 'Threads', color: 'text-gray-700 dark:text-gray-300' },
    blog: { icon: BookOpen, label: 'Blog', color: 'text-emerald-500' },
    newsletter: { icon: Mail, label: 'Newsletter', color: 'text-orange-500' },
    video_script: { icon: Video, label: 'Video Script', color: 'text-accent' },
  };
  return map[platform] || map.twitter;
}

/**
 * Normalize a video_script output into the "SCENE N: visual\nnarration\n---" text that
 * the editor store's loadFromRemixScript parses. The server LLM returns JSON
 * ({scenes:[{narration,visual_prompt,duration}]}), while the browser-native LLM already
 * returns SCENE text — this collapses both to one shape so the editor loads either.
 */
function remixScriptToSceneText(generated: string): string {
  const text = generated.trim();
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed?.scenes) && parsed.scenes.length > 0) {
        return parsed.scenes
          .map((s: { visual_prompt?: string; narration?: string }, i: number) =>
            `SCENE ${i + 1}: ${s.visual_prompt ?? ''}\n${s.narration ?? ''}\n---`
          )
          .join('\n');
      }
    } catch {
      // Not valid JSON — fall through and treat the raw text as SCENE format.
    }
  }
  return generated;
}

/** Step 3 — Tabbed output viewer with editing, copy, and actions. */
export default function OutputTabs() {
  const {
    outputs, activeOutputTab, setActiveOutputTab, updateOutput,
    regenerateOutput, isGenerating, generateError, currentProject, toVideo,
    setWizardStep, generateRemix,
  } = useRemixStore();
  const loadFromRemixScript = useEditorStore((s) => s.loadFromRemixScript);
  const router = useRouter();
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [isSendingToVideo, setIsSendingToVideo] = useState(false);

  // Error state — generation failed
  if (generateError && outputs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-14 h-14 rounded-full bg-danger/10 flex items-center justify-center mb-3">
          <AlertCircle size={28} className="text-danger" />
        </div>
        <h3 className="text-sm font-semibold text-text dark:text-white mb-1">Generation failed</h3>
        <p className="text-xs text-muted max-w-xs mb-4">{generateError}</p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => generateRemix()}
            className="flex items-center gap-2 px-4 py-2.5 min-h-[44px] bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 transition-colors focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
          >
            <RefreshCw size={14} />
            Try Again
          </button>
          <button
            type="button"
            onClick={() => setWizardStep(2)}
            className="flex items-center gap-2 px-4 py-2.5 min-h-[44px] bg-surface dark:bg-[#2a2a2a] text-text dark:text-white rounded-lg text-sm font-medium hover:bg-border-light dark:hover:bg-[#333] transition-colors focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  // Loading state — actively generating
  if (outputs.length === 0 && isGenerating) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-14 h-14 rounded-full bg-accent/10 flex items-center justify-center mb-3">
          <Sparkles size={28} className="text-accent" />
        </div>
        <h3 className="text-sm font-semibold text-text dark:text-white mb-1">Generating your remixes</h3>
        <p className="text-xs text-muted max-w-xs">
          The AI is creating optimized content for each platform. This usually takes 15-30 seconds.
        </p>
        <div className="mt-4 flex items-center gap-2 text-accent">
          <Loader2 size={16} className="animate-spin" />
          <span className="text-xs font-medium">Processing...</span>
        </div>
      </div>
    );
  }

  // Empty state — no outputs, not generating, no error
  if (outputs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-14 h-14 rounded-full bg-accent/10 flex items-center justify-center mb-3">
          <Sparkles size={28} className="text-accent" />
        </div>
        <h3 className="text-sm font-semibold text-text dark:text-white mb-1">No remixes yet</h3>
        <p className="text-xs text-muted max-w-xs mb-4">
          Go back to select platforms and generate your content remixes.
        </p>
        <button
          type="button"
          onClick={() => setWizardStep(2)}
          className="flex items-center gap-2 px-4 py-2.5 min-h-[44px] bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 transition-colors focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
        >
          <Sparkles size={14} />
          Select Platforms
        </button>
      </div>
    );
  }

  const activeOutput = outputs.find((o) => o.target_platform === activeOutputTab) || outputs[0];

  async function handleCopy(output: RemixOutput) {
    const text = output.generated_text || '';
    await navigator.clipboard.writeText(text);
    setCopiedId(output.id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  async function handleRegenerate(platform: RemixTarget) {
    await regenerateOutput(platform);
  }

  async function handleSendToVideo() {
    const videoOutput = outputs.find((o) => o.target_platform === 'video_script');
    if (!videoOutput?.generated_text) return;

    setIsSendingToVideo(true);
    try {
      // Populate the editor from the generated script, then navigate client-side so the
      // zustand editor store survives the transition (a full-page redirect would reset it).
      // The create page renders from the editor store, not from a videoId query param.
      loadFromRemixScript(remixScriptToSceneText(videoOutput.generated_text));

      // Persist a server-side video record when the project exists on the backend (F-41
      // bridge). Best-effort: the editor is already populated, so a backend failure here
      // must not block the user from continuing.
      if (currentProject && currentProject.id > 0) {
        await toVideo(currentProject.id).catch(() => {});
      }

      router.push('/video/create');
    } finally {
      setIsSendingToVideo(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Tab bar — horizontally scrollable on mobile */}
      <div className="-mx-4 px-4 md:mx-0 md:px-0">
        <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-thin">
          {outputs.map((output) => {
            const meta = getPlatformMeta(output.target_platform);
            const Icon = meta.icon;
            const isActive = output.target_platform === (activeOutputTab || outputs[0]?.target_platform);

            return (
              <button
                key={output.target_platform}
                type="button"
                onClick={() => setActiveOutputTab(output.target_platform)}
                className={`
                  flex items-center gap-1.5 px-3 py-2.5 min-h-[44px] rounded-lg text-xs font-medium whitespace-nowrap transition-all shrink-0
                  ${isActive
                    ? output.target_platform === 'video_script'
                      ? 'bg-accent/10 text-accent border border-accent/20'
                      : 'bg-primary/10 text-primary border border-primary/20'
                    : 'text-muted hover:text-text dark:hover:text-white hover:bg-surface dark:hover:bg-[#2a2a2a]'
                  }
                `}
              >
                <Icon size={12} className={isActive ? meta.color : ''} />
                {meta.label}
                {output.is_edited && (
                  <span className="w-1.5 h-1.5 rounded-full bg-warning" title="Edited" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Active output content */}
      {activeOutput && (
        <div className="bg-white dark:bg-[#1e1e1e] rounded-xl border border-border-light dark:border-[#333] overflow-hidden">
          {/* Action bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between px-3 sm:px-4 py-2.5 border-b border-border-light dark:border-[#333] gap-2">
            <div className="flex items-center gap-2">
              {(() => {
                const meta = getPlatformMeta(activeOutput.target_platform);
                const Icon = meta.icon;
                return (
                  <>
                    <Icon size={14} className={meta.color} />
                    <span className="text-sm font-medium text-text dark:text-white">{meta.label}</span>
                  </>
                );
              })()}
              {activeOutput.is_edited && (
                <span className="text-[10px] font-medium text-warning bg-warning/10 px-1.5 py-0.5 rounded">
                  Edited
                </span>
              )}
            </div>

            <div className="flex items-center gap-1 overflow-x-auto -mx-1 px-1">
              <button
                type="button"
                onClick={() => handleCopy(activeOutput)}
                className="flex items-center gap-1 px-2.5 py-2 min-h-[44px] rounded-md text-xs font-medium text-muted hover:text-text dark:hover:text-white hover:bg-surface dark:hover:bg-[#2a2a2a] transition-colors focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none shrink-0"
              >
                {copiedId === activeOutput.id ? <Check size={12} className="text-secondary" /> : <Copy size={12} />}
                {copiedId === activeOutput.id ? 'Copied' : 'Copy'}
              </button>

              <button
                type="button"
                onClick={() => handleRegenerate(activeOutput.target_platform)}
                disabled={isGenerating}
                className="flex items-center gap-1 px-2.5 py-2 min-h-[44px] rounded-md text-xs font-medium text-muted hover:text-accent hover:bg-accent/5 transition-colors disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none shrink-0"
              >
                <RefreshCw size={12} className={isGenerating ? 'animate-spin' : ''} />
                Regenerate
              </button>

              {activeOutput.target_platform === 'video_script' && (
                <button
                  type="button"
                  onClick={handleSendToVideo}
                  disabled={isSendingToVideo}
                  className="flex items-center gap-1.5 px-3 py-2 min-h-[44px] bg-accent text-white rounded-md text-xs font-medium hover:bg-accent/90 transition-colors disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none shrink-0"
                >
                  {isSendingToVideo ? <Loader2 size={12} className="animate-spin" /> : <ArrowRight size={12} />}
                  <span className="hidden sm:inline">Send to Video Creator</span>
                  <span className="sm:hidden">To Video</span>
                </button>
              )}

              {activeOutput.target_platform !== 'video_script' && (
                <>
                  <button
                    type="button"
                    disabled
                    title="Connect your social accounts in Settings to enable scheduling"
                    className="flex items-center gap-1 px-2.5 py-2 min-h-[44px] rounded-md text-xs font-medium text-muted opacity-50 cursor-not-allowed shrink-0"
                  >
                    <Calendar size={12} />
                    <span className="hidden sm:inline">Schedule</span>
                  </button>
                  <button
                    type="button"
                    disabled
                    title="Connect your social accounts in Settings to enable publishing"
                    className="flex items-center gap-1 px-2.5 py-2 min-h-[44px] rounded-md text-xs font-medium text-muted opacity-50 cursor-not-allowed shrink-0"
                  >
                    <Send size={12} />
                    <span className="hidden sm:inline">Publish</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Editable content area */}
          <div className="p-3 sm:p-4">
            {activeOutput.target_platform === 'video_script' ? (
              <VideoScriptView output={activeOutput} onCreateVideo={handleSendToVideo} />
            ) : (
              <textarea
                value={activeOutput.generated_text || ''}
                onChange={(e) => updateOutput(activeOutput.id, e.target.value)}
                rows={Math.max(8, (activeOutput.generated_text || '').split('\n').length + 2)}
                className="w-full bg-transparent text-[16px] sm:text-sm text-text dark:text-white leading-relaxed focus:outline-none resize-none"
                placeholder="Generated content will appear here..."
              />
            )}
          </div>

          {/* Character/word count */}
          <div className="px-3 sm:px-4 py-2 border-t border-border-light dark:border-[#333] flex items-center justify-between">
            <span className="text-[11px] text-muted">
              {(activeOutput.generated_text || '').length.toLocaleString()} characters
              {' · '}
              {(activeOutput.generated_text || '').split(/\s+/).filter(Boolean).length.toLocaleString()} words
            </span>
            {activeOutput.status === 'published' && (
              <span className="text-[10px] font-medium text-secondary bg-secondary/10 px-1.5 py-0.5 rounded">
                Published
              </span>
            )}
          </div>
        </div>
      )}

      {/* Generating shimmer overlay */}
      {isGenerating && (
        <div className="relative overflow-hidden rounded-xl h-2">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-accent/10 to-transparent animate-[shimmer_2s_infinite]" />
        </div>
      )}
    </div>
  );
}

/** Special view for video_script outputs showing scene cards. */
function VideoScriptView({ output, onCreateVideo }: { output: RemixOutput; onCreateVideo: () => void }) {
  const { updateOutput } = useRemixStore();
  const text = output.generated_text || '';

  // Try to parse scenes from generated_json or text
  let scenes: { narration: string; visual_prompt: string; duration: number }[] = [];

  if (output.generated_json && 'scenes' in output.generated_json) {
    scenes = (output.generated_json as { scenes: typeof scenes }).scenes || [];
  }

  if (scenes.length === 0) {
    // Fall back to displaying raw text in editable area
    return (
      <div className="space-y-3">
        <div className="bg-accent/5 border border-accent/20 rounded-lg p-2.5 flex items-center gap-2">
          <Sparkles size={12} className="text-accent" />
          <p className="text-[11px] text-accent font-medium">
            Video script generated — edit below or send directly to the Video Creator
          </p>
        </div>
        <textarea
          value={text}
          onChange={(e) => updateOutput(output.id, e.target.value)}
          rows={Math.max(10, text.split('\n').length + 2)}
          className="w-full bg-transparent text-[16px] sm:text-sm text-text dark:text-white leading-relaxed focus:outline-none resize-none font-mono"
          placeholder="Video script will appear here..."
        />
        {/* Prominent "Create Video" CTA at bottom of script */}
        {text.trim() && (
          <button
            type="button"
            onClick={onCreateVideo}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 min-h-[44px] bg-gradient-to-r from-accent via-primary to-secondary text-white rounded-xl text-sm font-semibold hover:opacity-90 transition-all active:scale-[0.98] shadow-lg shadow-accent/20 focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
          >
            <Clapperboard size={16} />
            Create Video from This Script
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="bg-accent/5 border border-accent/20 rounded-lg p-2.5 flex items-center gap-2">
        <Sparkles size={12} className="text-accent" />
        <p className="text-[11px] text-accent font-medium">
          {scenes.length} scene{scenes.length !== 1 ? 's' : ''} generated — send to the Video Creator to render
        </p>
      </div>

      {scenes.map((scene, i) => (
        <div
          key={i}
          className="bg-surface dark:bg-[#151515] rounded-lg border border-border-light dark:border-[#333] p-3"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-text dark:text-white uppercase">
              Scene {i + 1}
            </span>
            <span className="text-[10px] text-muted">{scene.duration || 5}s</span>
          </div>
          <p className="text-sm text-text dark:text-white leading-relaxed mb-2">{scene.narration}</p>
          <p className="text-[11px] text-muted italic">Visual: {scene.visual_prompt}</p>
        </div>
      ))}

      {/* Prominent "Create Video" CTA at bottom of scene list */}
      <button
        type="button"
        onClick={onCreateVideo}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 min-h-[44px] bg-gradient-to-r from-accent via-primary to-secondary text-white rounded-xl text-sm font-semibold hover:opacity-90 transition-all active:scale-[0.98] shadow-lg shadow-accent/20 focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
      >
        <Clapperboard size={16} />
        Create Video from This Script
      </button>
    </div>
  );
}
