'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Video, Send, AlertCircle, ExternalLink, Hash,
} from 'lucide-react';
import { useScheduleStore } from '@/stores/schedule-store';
import { useVideoStore } from '@/stores/video-store';
import { Button } from '@/components/ui';
import { Textarea } from '@/components/ui/Input';
import ScheduleTimePicker from './ScheduleTimePicker';
import CTATemplateSelect from './CTATemplateSelect';
import type { Platform, ScheduledPostWithVideo } from '@/types';

const PLATFORMS: { id: Platform; label: string; color: string }[] = [
  { id: 'youtube', label: 'YouTube', color: 'bg-red-500' },
  { id: 'tiktok', label: 'TikTok', color: 'bg-black dark:bg-white' },
  { id: 'instagram', label: 'Instagram', color: 'bg-gradient-to-br from-purple-500 to-pink-500' },
  { id: 'facebook', label: 'Facebook', color: 'bg-blue-600' },
  { id: 'linkedin', label: 'LinkedIn', color: 'bg-blue-700' },
  { id: 'threads', label: 'Threads', color: 'bg-black dark:bg-white' },
  { id: 'twitter', label: 'X / Twitter', color: 'bg-black dark:bg-white' },
];

interface ScheduleFormProps {
  /** Existing post to edit, or undefined for create mode. */
  post?: ScheduledPostWithVideo;
  /** Callback after successful submit. */
  onSuccess?: () => void;
  /** Callback for cancel. */
  onCancel?: () => void;
  /** Callback to open CTA template manager. */
  onManageTemplates?: () => void;
  className?: string;
}

/** Form for creating or editing a scheduled post. */
export default function ScheduleForm({
  post,
  onSuccess,
  onCancel,
  onManageTemplates,
  className = '',
}: ScheduleFormProps) {
  const { socialAccounts, fetchSocialAccounts, createPost, updatePost } = useScheduleStore();
  const { videos, fetchVideos } = useVideoStore();

  const [videoId, setVideoId] = useState<number | ''>(post?.video_id ?? '');
  const [platform, setPlatform] = useState<Platform | ''>(post?.platform ?? '');
  const [scheduledAt, setScheduledAt] = useState(post?.scheduled_at ?? '');
  const [title, setTitle] = useState(post?.title ?? '');
  const [description, setDescription] = useState(post?.description ?? '');
  const [tagsInput, setTagsInput] = useState(post?.tags?.join(', ') ?? '');
  const [hashtagsInput, setHashtagsInput] = useState(
    post?.hashtags?.map((h) => (h.startsWith('#') ? h.slice(1) : h)).join(', ') ?? ''
  );
  const [ctaTemplateId, setCtaTemplateId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const isEditing = !!post;

  // Fetch videos and social accounts on mount
  useEffect(() => {
    if (videos.length === 0) fetchVideos().catch(() => {});
    if (socialAccounts.length === 0) fetchSocialAccounts().catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Only show completed videos
  const completedVideos = useMemo(
    () => videos.filter((v) => v.status === 'completed'),
    [videos]
  );

  // Connected platform IDs
  const connectedPlatforms = useMemo(
    () => new Set(socialAccounts.map((a) => a.platform)),
    [socialAccounts]
  );

  const validate = (): boolean => {
    const errs: Record<string, string> = {};

    if (!videoId) errs.video = 'Select a video';
    if (!platform) errs.platform = 'Select a platform';
    if (!scheduledAt) {
      errs.schedule = 'Pick a date and time';
    } else {
      const d = new Date(scheduledAt);
      if (isNaN(d.getTime()) || d <= new Date()) {
        errs.schedule = 'Schedule time must be in the future';
      }
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setSaving(true);
    try {
      const tags = tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      const hashtags = hashtagsInput
        .split(',')
        .map((h) => {
          const cleaned = h.trim().replace(/^#/, '');
          return cleaned ? `#${cleaned}` : '';
        })
        .filter(Boolean);

      const payload = {
        video_id: Number(videoId),
        platform: platform as Platform,
        scheduled_at: scheduledAt,
        title: title.trim() || null,
        description: description.trim() || null,
        tags: tags.length > 0 ? tags : null,
        hashtags: hashtags.length > 0 ? hashtags : null,
        cta_template_id: ctaTemplateId || null,
      };

      if (isEditing && post) {
        await updatePost(post.id, payload);
      } else {
        await createPost(payload);
      }

      onSuccess?.();
    } catch (err: unknown) {
      setErrors({ submit: err instanceof Error ? err.message : 'Failed to save. Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className={`space-y-5 ${className}`}>
      {/* Video selector */}
      <div>
        <label className="block text-[12px] font-medium text-text dark:text-[#E0E0E0] mb-1.5">
          Video <span className="text-danger">*</span>
        </label>
        <div className="relative">
          <Video className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted/50 pointer-events-none" />
          <select
            value={videoId}
            onChange={(e) => setVideoId(e.target.value ? Number(e.target.value) : '')}
            className={`w-full pl-9 pr-3 py-2.5 min-h-[44px] text-[16px] md:text-[13px] rounded-xl bg-white dark:bg-dark-secondary text-text dark:text-[#E0E0E0] border appearance-none cursor-pointer transition-all duration-200 focus:outline-none focus:ring-2 ${
              errors.video
                ? 'border-danger focus:ring-danger/15 focus:border-danger'
                : 'border-black/[0.08] dark:border-white/[0.08] focus:ring-primary/15 focus:border-primary/30'
            }`}
          >
            <option value="">Select a completed video...</option>
            {completedVideos.map((v) => (
              <option key={v.id} value={v.id}>
                {v.title} ({v.aspect_ratio})
              </option>
            ))}
          </select>
        </div>
        {errors.video && (
          <p className="flex items-center gap-1 text-[11px] text-danger mt-1">
            <AlertCircle className="w-3 h-3" />
            {errors.video}
          </p>
        )}
        {completedVideos.length === 0 && (
          <p className="text-[10px] text-text-muted/50 mt-1">
            No completed videos. <a href="/video/create" className="text-primary hover:underline">Create one first</a>.
          </p>
        )}
      </div>

      {/* Platform selector */}
      <div>
        <label className="block text-[12px] font-medium text-text dark:text-[#E0E0E0] mb-1.5">
          Platform <span className="text-danger">*</span>
        </label>
        <div className="flex flex-wrap gap-2">
          {PLATFORMS.map((p) => {
            const isConnected = connectedPlatforms.has(p.id);
            const isSelected = platform === p.id;

            return (
              <button
                key={p.id}
                type="button"
                disabled={!isConnected}
                onClick={() => setPlatform(p.id)}
                className={`
                  relative flex items-center gap-2 px-3 py-2.5 min-h-[44px] md:min-h-0 md:py-2 rounded-xl text-[12px] font-medium transition-all duration-150
                  focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none
                  ${isSelected
                    ? 'bg-primary/10 dark:bg-primary/20 text-primary border-2 border-primary/30'
                    : isConnected
                      ? 'bg-surface dark:bg-[#252525] text-text dark:text-[#E0E0E0] border border-border-light dark:border-[#333] hover:border-primary/30 cursor-pointer'
                      : 'bg-surface/50 dark:bg-[#1a1a1a] text-text-muted/40 border border-border-light/50 dark:border-[#2a2a2a] cursor-not-allowed'
                  }
                `}
              >
                <span className={`w-2.5 h-2.5 rounded-full ${p.color} ${!isConnected ? 'opacity-30' : ''}`} />
                {p.label}
                {!isConnected && (
                  <a
                    href="/settings"
                    onClick={(e) => e.stopPropagation()}
                    className="text-[9px] text-primary hover:underline ml-1 pointer-events-auto"
                  >
                    Connect
                  </a>
                )}
              </button>
            );
          })}
        </div>
        {errors.platform && (
          <p className="flex items-center gap-1 text-[11px] text-danger mt-1">
            <AlertCircle className="w-3 h-3" />
            {errors.platform}
          </p>
        )}
      </div>

      {/* Date/time */}
      <ScheduleTimePicker
        value={scheduledAt}
        onChange={setScheduledAt}
        error={errors.schedule}
      />

      {/* Title */}
      <div>
        <label className="block text-[12px] font-medium text-text dark:text-[#E0E0E0] mb-1.5">
          Post Title
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Enter a title for this post..."
          className="w-full px-3.5 py-2.5 min-h-[44px] text-[16px] md:text-[13px] rounded-xl bg-white dark:bg-dark-secondary text-text dark:text-[#E0E0E0] placeholder:text-text-muted/40 border border-black/[0.08] dark:border-white/[0.08] focus:outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary/30 transition-all duration-200"
        />
      </div>

      {/* Description */}
      <Textarea
        label="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Write a description for this post..."
      />

      {/* Tags */}
      <div>
        <label className="block text-[12px] font-medium text-text dark:text-[#E0E0E0] mb-1.5">
          Tags
        </label>
        <input
          type="text"
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          placeholder="marketing, tips, tutorial (comma separated)"
          className="w-full px-3.5 py-2.5 min-h-[44px] text-[16px] md:text-[13px] rounded-xl bg-white dark:bg-dark-secondary text-text dark:text-[#E0E0E0] placeholder:text-text-muted/40 border border-black/[0.08] dark:border-white/[0.08] focus:outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary/30 transition-all duration-200"
        />
        <p className="text-[10px] text-text-muted/50 mt-1">Separate with commas</p>
      </div>

      {/* Hashtags */}
      <div>
        <label className="flex items-center gap-1 text-[12px] font-medium text-text dark:text-[#E0E0E0] mb-1.5">
          <Hash className="w-3.5 h-3.5" />
          Hashtags
        </label>
        <input
          type="text"
          value={hashtagsInput}
          onChange={(e) => setHashtagsInput(e.target.value)}
          placeholder="contentcreator, ai, video (auto-prefixed with #)"
          className="w-full px-3.5 py-2.5 min-h-[44px] text-[16px] md:text-[13px] rounded-xl bg-white dark:bg-dark-secondary text-text dark:text-[#E0E0E0] placeholder:text-text-muted/40 border border-black/[0.08] dark:border-white/[0.08] focus:outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary/30 transition-all duration-200"
        />
        <p className="text-[10px] text-text-muted/50 mt-1">
          Separate with commas, # is added automatically
        </p>
      </div>

      {/* CTA Template */}
      <CTATemplateSelect
        value={ctaTemplateId}
        onChange={setCtaTemplateId}
        onManageClick={onManageTemplates}
      />

      {/* Submit error */}
      {errors.submit && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-danger/[0.06] border border-danger/10">
          <AlertCircle className="w-4 h-4 text-danger shrink-0" />
          <p className="text-[12px] text-danger">{errors.submit}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center sm:justify-end gap-2 pt-2">
        {onCancel && (
          <Button variant="ghost" size="md" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
        )}
        <Button
          type="submit"
          variant="primary"
          size="md"
          icon={<Send className="w-4 h-4" />}
          isLoading={saving}
        >
          {isEditing ? 'Update Schedule' : 'Schedule Post'}
        </Button>
      </div>
    </form>
  );
}
