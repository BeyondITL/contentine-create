'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Check, AlertCircle, Loader2, Sparkles, ChevronDown, ChevronUp, Box, Camera, Crown } from 'lucide-react';
import { useAvatarStore, type AvatarTier } from '@/stores/avatar-store';
import AvatarGrid from './AvatarGrid';
import CharacterManager from './CharacterManager';
import RealCloneStudio from './RealCloneStudio';

/** Tier configuration for the three-tier avatar strategy. */
const AVATAR_TIERS: { id: AvatarTier; label: string; icon: typeof Box; description: string; badge?: string; available?: boolean }[] = [
  // SA-26: the 3D (GLB) engine ships no rigged avatar model yet, so this tier cannot
  // render. Gated off (never selectable) until a license-cleared GLB is provisioned —
  // honest "coming soon" instead of a cryptic GLB-parse failure. Photo is the default.
  { id: 'quick', label: 'Quick Avatar', icon: Box, description: '3D animated avatar with real-time lip-sync — coming soon.', badge: 'Soon', available: false },
  { id: 'photo', label: 'Photo Avatar', icon: Camera, description: 'Upload your photo — AI animates your face with lip-sync. Free and unlimited.', badge: 'Free' },
  { id: 'pro', label: 'Pro Avatar', icon: Crown, description: 'Photorealistic talking-head via D-ID. Industry-leading quality. Paid plans only.', badge: 'Pro' },
];

/** Step 1 — Select avatar tier + preset or upload custom photo, then detect/generate face data. */
export default function AvatarSelectStep() {
  const {
    avatars, selectedAvatarId, customAvatarUrl,
    selectAvatar, setCustomAvatar, clearCustomAvatar,
    faceDetected, faceDetectionProgress, faceDetectionMessage,
    setFaceDetected, setFaceDetectionProgress,
    getSelectedAvatar,
    avatarTier, setAvatarTier,
    characters, fetchCharacters, selectCharacter, selectedCharacterId,
    createCharacter, deleteCharacter,
  } = useAvatarStore();

  const [isDetecting, setIsDetecting] = useState(false);
  const [detectionError, setDetectionError] = useState<string | null>(null);
  const [showCharacters, setShowCharacters] = useState(false);
  const [showRealClone, setShowRealClone] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchCharacters();
  }, [fetchCharacters]);

  const currentPhotoUrl = customAvatarUrl || getSelectedAvatar()?.photo_path || null;

  /** Run real face detection on custom uploads. */
  const runFaceDetection = useCallback(async (photoUrl: string) => {
    setIsDetecting(true);
    setDetectionError(null);
    setFaceDetected(false);

    try {
      setFaceDetectionProgress(10, 'Loading face detection models...');

      // Dynamic import to avoid bundling face-api.js at build time
      const { initFaceDetection, detectFace } = await import('@/engine/face-animator');

      await initFaceDetection((percent, message) => {
        setFaceDetectionProgress(percent * 0.6, message);
      });

      setFaceDetectionProgress(65, 'Analyzing face...');

      // Load the image for detection
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Failed to load avatar image'));
        img.src = photoUrl;
      });

      setFaceDetectionProgress(80, 'Detecting landmarks...');

      const faceData = await detectFace(img);

      if (!faceData) {
        setDetectionError('No face detected in this image. Please choose a clear photo with a visible face.');
        setFaceDetected(false);
        return;
      }

      setFaceDetectionProgress(100, 'Face detected successfully');
      setFaceDetected(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Face detection failed';
      setDetectionError(message);
      setFaceDetected(false);
    } finally {
      setIsDetecting(false);
    }
  }, [setFaceDetected, setFaceDetectionProgress]);

  /** For preset avatars (illustrated/SVG), use default face data instead of real detection. */
  function handleSelectPresetAvatar(id: number) {
    selectAvatar(id);
    setDetectionError(null);
    // Presets use default face data (standard portrait proportions) since they may be
    // illustrated/SVG avatars that face-api.js cannot detect. The animation engine
    // uses these landmarks to position mouth/eye overlays on the avatar image.
    setFaceDetectionProgress(100, 'Avatar ready');
    setFaceDetected(true);
  }

  function handleUpload() {
    fileInputRef.current?.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setDetectionError('Please upload an image file (JPEG, PNG, or WebP).');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setDetectionError('Image too large. Maximum 10MB.');
      return;
    }

    setCustomAvatar(file);
    setDetectionError(null);
    // Use the store's blob URL (created by setCustomAvatar) — don't create a duplicate
    // The store URL is tracked and properly revoked on clearCustomAvatar/reset
    const storeUrl = useAvatarStore.getState().customAvatarUrl;
    if (storeUrl) {
      runFaceDetection(storeUrl);
    }
  }

  return (
    <div className="space-y-6">
      {/* Avatar tier selector */}
      <div>
        <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">
          Avatar Engine
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {AVATAR_TIERS.map((tier) => {
            const isActive = avatarTier === tier.id;
            const isAvailable = tier.available !== false;
            const Icon = tier.icon;
            return (
              <button
                key={tier.id}
                type="button"
                disabled={!isAvailable}
                onClick={() => isAvailable && setAvatarTier(tier.id)}
                className={`
                  relative flex flex-col p-3 rounded-xl border-2 text-left transition-all min-h-[44px]
                  ${!isAvailable
                    ? 'border-border-light dark:border-[#333] opacity-50 cursor-not-allowed'
                    : isActive
                    ? 'border-primary bg-primary-bg dark:bg-primary/10 ring-1 ring-primary/20'
                    : 'border-border-light dark:border-[#333] hover:border-border dark:hover:border-[#555]'
                  }
                `}
              >
                {isActive && (
                  <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                    <Check size={12} className="text-white" />
                  </div>
                )}
                <div className="flex items-center gap-2 mb-1.5">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    tier.id === 'pro' ? 'bg-accent/10 text-accent' : 'bg-primary/10 text-primary'
                  }`}>
                    <Icon size={16} />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold text-text dark:text-white">{tier.label}</span>
                    {tier.badge && (
                      <span className={`px-1.5 py-0.5 text-[9px] font-bold uppercase rounded ${
                        tier.badge === 'Pro'
                          ? 'bg-accent/10 text-accent'
                          : 'bg-secondary/10 text-secondary'
                      }`}>
                        {tier.badge}
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-[11px] text-muted leading-relaxed">{tier.description}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Status banner */}
      {currentPhotoUrl && (
        <div className={`flex items-center gap-3 p-3 rounded-xl border ${
          faceDetected
            ? 'bg-secondary/5 border-secondary/20'
            : isDetecting
              ? 'bg-primary/5 border-primary/20'
              : detectionError
                ? 'bg-danger/5 border-danger/20'
                : 'bg-surface dark:bg-[#1e1e1e] border-border-light dark:border-[#333]'
        }`}>
          {isDetecting ? (
            <>
              <Loader2 size={16} className="text-primary animate-spin shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-text dark:text-white">{faceDetectionMessage || 'Detecting face...'}</p>
                <div className="mt-1.5 h-1.5 bg-border-light dark:bg-[#333] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-primary to-accent rounded-full transition-all duration-300"
                    style={{ width: `${faceDetectionProgress}%` }}
                  />
                </div>
              </div>
            </>
          ) : faceDetected ? (
            <>
              <div className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center shrink-0">
                <Check size={14} className="text-white" />
              </div>
              <p className="text-xs font-medium text-secondary">
                {selectedAvatarId ? 'Avatar ready — preset animation configured' : 'Face detected — ready to animate'}
              </p>
            </>
          ) : detectionError ? (
            <>
              <AlertCircle size={16} className="text-danger shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-danger">{detectionError}</p>
                <button
                  type="button"
                  onClick={() => currentPhotoUrl && runFaceDetection(currentPhotoUrl)}
                  className="text-[11px] text-primary hover:underline mt-0.5 min-h-[44px] md:min-h-0 flex items-center"
                >
                  Try again
                </button>
              </div>
            </>
          ) : null}
        </div>
      )}

      {/* Avatar grid */}
      <AvatarGrid
        avatars={avatars}
        selectedId={selectedAvatarId}
        onSelect={handleSelectPresetAvatar}
        onUploadCustom={handleUpload}
      />

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Custom upload preview */}
      {customAvatarUrl && (
        <div className="flex items-center gap-3 md:gap-4 p-3 md:p-4 bg-white dark:bg-[#1e1e1e] rounded-xl border border-border-light dark:border-[#333]">
          <div className="w-14 h-14 md:w-16 md:h-16 rounded-lg overflow-hidden bg-surface dark:bg-[#151515] shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={customAvatarUrl} alt="Custom avatar" className="w-full h-full object-cover" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-text dark:text-white">Custom Avatar Photo</p>
            <p className="text-xs text-muted mt-0.5">Your uploaded photo will be used as the avatar</p>
          </div>
          <button
            type="button"
            onClick={() => {
              clearCustomAvatar();
              setDetectionError(null);
            }}
            className="text-xs text-muted hover:text-danger transition-colors min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 flex items-center justify-center"
          >
            Remove
          </button>
        </div>
      )}

      {/* Character Anchors (collapsible) */}
      <div className="bg-white dark:bg-[#1e1e1e] rounded-xl border border-border-light dark:border-[#333] overflow-hidden">
        <button
          type="button"
          onClick={() => setShowCharacters(!showCharacters)}
          className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-surface dark:hover:bg-[#151515] transition-colors min-h-[44px]"
        >
          <span className="text-xs font-semibold text-text dark:text-white uppercase tracking-wider">
            Character Anchors
          </span>
          {showCharacters ? (
            <ChevronUp size={14} className="text-muted" />
          ) : (
            <ChevronDown size={14} className="text-muted" />
          )}
        </button>
        {showCharacters && (
          <div className="px-4 pb-4">
            <CharacterManager
              characters={characters}
              selectedId={selectedCharacterId}
              onSelect={selectCharacter}
              onCreate={() => createCharacter({ name: 'New Character' })}
              onDelete={deleteCharacter}
            />
          </div>
        )}
      </div>

      {/* Real Clone Studio (collapsible) — Professional tier, consent-gated (L7) */}
      <div className="bg-white dark:bg-[#1e1e1e] rounded-xl border border-border-light dark:border-[#333] overflow-hidden">
        <button
          type="button"
          onClick={() => setShowRealClone(!showRealClone)}
          className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-surface dark:hover:bg-[#151515] transition-colors min-h-[44px]"
        >
          <span className="flex items-center gap-1.5 text-xs font-semibold text-text dark:text-white uppercase tracking-wider">
            Real Clone Studio
            <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase rounded bg-accent/10 text-accent normal-case tracking-normal">Pro</span>
          </span>
          {showRealClone ? (
            <ChevronUp size={14} className="text-muted" />
          ) : (
            <ChevronDown size={14} className="text-muted" />
          )}
        </button>
        {showRealClone && (
          <div className="px-4 pb-4">
            <RealCloneStudio />
          </div>
        )}
      </div>

      {/* Info note */}
      {!currentPhotoUrl && (
        <div className="bg-accent/5 border border-accent/20 rounded-lg p-3">
          <p className="text-[11px] text-accent font-medium flex items-center gap-1 mb-1">
            <Sparkles size={10} />
            Getting Started
          </p>
          <p className="text-[11px] text-muted leading-relaxed">
            Select an avatar preset or upload your own photo. Contentine Create will animate facial features to match the AI voiceover. Presets work instantly — custom photos go through face detection for optimal animation quality.
          </p>
        </div>
      )}
    </div>
  );
}
