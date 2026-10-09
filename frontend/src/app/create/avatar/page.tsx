'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, Sparkles, Users, Video, Loader2 } from 'lucide-react';
import Link from 'next/link';
import AvatarGrid from '@/components/avatar/AvatarGrid';
import ModelRequirements from '@/components/shared/ModelRequirements';
import { EmptyState } from '@/components/ui';
import { DashboardSkeleton } from '@/components/ui/Skeleton';
import { api } from '@/lib/api';
import { LOCAL_AVATAR_PRESETS } from '@/data/avatar-presets';
import type { AvatarPreset } from '@/types';

/** Avatar selection page — choose a preset or upload your own. */
export default function AvatarPage() {
  const [avatars, setAvatars] = useState<AvatarPreset[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAvatars();
  }, []);

  async function loadAvatars() {
    try {
      const res = await api.get<{ avatars: AvatarPreset[] }>('/avatars/presets');
      setAvatars(res.avatars || []);
    } catch {
      // Use local preset data as fallback
      setAvatars(LOCAL_AVATAR_PRESETS);
    } finally {
      setLoading(false);
    }
  }

  const selectedAvatar = avatars.find((a) => a.id === selectedId);

  if (loading) {
    return (
      <div className="p-4 md:p-6">
        <DashboardSkeleton />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-5 lg:p-6 max-w-[1280px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-text dark:text-white tracking-[-0.02em] flex items-center gap-2">
            <Users size={22} className="text-primary" />
            Avatar Studio
          </h1>
          <p className="text-sm text-muted mt-0.5">
            Choose an AI avatar to narrate your video. Select a preset or upload your own photo.
          </p>
        </div>
      </div>

      {/* On-device voice model gate — talking-head narration synthesizes via Kokoro */}
      <div className="mb-6">
        <ModelRequirements
          feature="avatar"
          description="Avatar narration is synthesized on your device. Kokoro downloads once, then works offline."
        />
      </div>

      {/* Main layout: grid left, preview right */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left: Avatar grid */}
        <div className="flex-1 min-w-0">
          {avatars.length > 0 ? (
            <AvatarGrid
              avatars={avatars}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          ) : (
            <EmptyState
              icon={<Users size={28} className="text-primary" />}
              headline="Avatar presets loading"
              description="AI avatar presets are being prepared. Refresh if they don't appear shortly."
              ctaLabel="Refresh"
              onCTA={loadAvatars}
            />
          )}
        </div>

        {/* Right: Selection preview + Continue */}
        <aside className="lg:w-[320px] shrink-0">
          <div className="sticky top-6 space-y-4">
            {/* Preview card */}
            <div className="bg-white dark:bg-[#1e1e1e] rounded-xl border border-border-light dark:border-[#333] overflow-hidden">
              {selectedAvatar ? (
                <>
                  <div className="aspect-square bg-surface dark:bg-[#151515]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={selectedAvatar.photo_path}
                      alt={selectedAvatar.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="p-4">
                    <h3 className="text-sm font-semibold text-text dark:text-white">{selectedAvatar.name}</h3>
                    <p className="text-xs text-muted mt-0.5">{selectedAvatar.description || 'AI avatar preset'}</p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {selectedAvatar.gender && (
                        <span className="px-2.5 py-1 md:px-2 md:py-0.5 text-[10px] font-medium bg-surface dark:bg-[#2a2a2a] text-muted rounded-md capitalize">
                          {selectedAvatar.gender}
                        </span>
                      )}
                      {selectedAvatar.age_range && (
                        <span className="px-2.5 py-1 md:px-2 md:py-0.5 text-[10px] font-medium bg-surface dark:bg-[#2a2a2a] text-muted rounded-md">
                          {selectedAvatar.age_range}
                        </span>
                      )}
                      {selectedAvatar.style && (
                        <span className="px-2.5 py-1 md:px-2 md:py-0.5 text-[10px] font-medium bg-accent/10 text-accent rounded-md capitalize">
                          {selectedAvatar.style}
                        </span>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="aspect-square bg-surface dark:bg-[#151515] flex flex-col items-center justify-center text-center p-6">
                  <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                    <Users size={24} className="text-primary" />
                  </div>
                  <p className="text-sm font-medium text-text dark:text-white">Select an Avatar</p>
                  <p className="text-xs text-muted mt-1 max-w-[200px]">
                    Choose a preset avatar from the grid to preview it here
                  </p>
                </div>
              )}
            </div>

            {/* Continue button */}
            <Link
              href={selectedId ? `/avatar-editor/?avatarId=${selectedId}` : '#'}
              className={`
                w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all min-h-[44px]
                ${selectedId
                  ? 'bg-gradient-to-r from-primary via-accent to-secondary text-white hover:opacity-90 active:scale-[0.98] shadow-lg shadow-primary/20'
                  : 'bg-surface dark:bg-[#2a2a2a] text-muted cursor-not-allowed'
                }
              `}
              onClick={(e) => { if (!selectedId) e.preventDefault(); }}
            >
              <Sparkles size={16} />
              Continue to Editor
              <ArrowRight size={16} />
            </Link>

            {/* Info box */}
            <div className="bg-accent/5 border border-accent/20 rounded-lg p-3">
              <p className="text-[11px] text-accent font-medium flex items-center gap-1 mb-1">
                <Sparkles size={10} />
                How Avatar Videos Work
              </p>
              <p className="text-[11px] text-muted leading-relaxed">
                Contentine Create detects facial landmarks in the avatar photo, then animates mouth movements synced to your AI voiceover. The result is a natural-looking talking-head video — all rendered in your browser.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

// Local preset data imported from shared module
