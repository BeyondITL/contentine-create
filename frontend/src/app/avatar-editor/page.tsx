'use client';

import { Suspense, useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Users,
  FileText,
  Mic,
  Palette,
  Play,
  ArrowLeft,
  ArrowRight,
  Check,
  Sparkles,
} from 'lucide-react';
import { useAvatarStore } from '@/stores/avatar-store';
import AvatarSelectStep from '@/components/avatar/AvatarSelectStep';
import AvatarScriptStep from '@/components/avatar/AvatarScriptStep';
import AvatarVoiceStep from '@/components/avatar/AvatarVoiceStep';
import AvatarStyleStep from '@/components/avatar/AvatarStyleStep';
import AvatarGenerateStep from '@/components/avatar/AvatarGenerateStep';
import ModelRequirements from '@/components/shared/ModelRequirements';

const STEPS = [
  { label: 'Avatar', icon: Users },
  { label: 'Script', icon: FileText },
  { label: 'Voice', icon: Mic },
  { label: 'Style', icon: Palette },
  { label: 'Generate', icon: Play },
] as const;

/** Avatar Video Editor — wrapped in Suspense for useSearchParams. */
export default function AvatarEditorPage() {
  return (
    <Suspense fallback={<AvatarEditorSkeleton />}>
      <AvatarEditorInner />
    </Suspense>
  );
}

/** Inner component with useSearchParams — must be within Suspense boundary. */
function AvatarEditorInner() {
  const searchParams = useSearchParams();
  const {
    step, setStep, nextStep, prevStep,
    selectedAvatarId, customAvatarUrl, faceDetected,
    fetchAvatars, fetchVoices, selectAvatar,
    scenes, voiceId,
  } = useAvatarStore();

  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    fetchAvatars();
    fetchVoices();
    // Pre-select avatar from query param
    const avatarIdParam = searchParams.get('avatarId');
    if (avatarIdParam) {
      selectAvatar(parseInt(avatarIdParam, 10));
    }
    setInitialized(true);
  }, [fetchAvatars, fetchVoices, searchParams, selectAvatar]);

  const safeScenes = scenes ?? [];
  const hasAvatar = selectedAvatarId !== null || customAvatarUrl !== null;
  const hasScript = safeScenes.some((s) => s.narration.trim().length > 0);
  const hasVoice = voiceId !== null;

  const canAdvance = useCallback((): boolean => {
    switch (step) {
      case 1: return hasAvatar && faceDetected;
      case 2: return hasScript;
      case 3: return hasVoice;
      case 4: return true;
      case 5: return false;
      default: return false;
    }
  }, [step, hasAvatar, faceDetected, hasScript, hasVoice]);

  if (!initialized) {
    return (
      <div className="p-4 md:p-6">
        <AvatarEditorSkeleton />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-5 lg:p-6 max-w-[960px] mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 rounded-xl bg-accent/10 flex items-center justify-center">
          <Sparkles size={18} className="text-accent" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-text dark:text-white tracking-[-0.02em]">
            Avatar Video Editor
          </h1>
          <p className="text-xs text-muted">Create a talking-head video with an AI avatar</p>
        </div>
      </div>

      {/* On-device voice model gate — talking-head narration synthesizes via Kokoro */}
      <div className="mb-6">
        <ModelRequirements
          feature="avatar"
          description="Avatar narration is synthesized on your device. Kokoro downloads once, then works offline."
        />
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-1 mb-8 overflow-x-auto pb-2">
        {STEPS.map((s, i) => {
          const stepNum = (i + 1) as 1 | 2 | 3 | 4 | 5;
          const isActive = step === stepNum;
          const isCompleted = step > stepNum;
          const Icon = s.icon;

          return (
            <button
              key={s.label}
              type="button"
              onClick={() => {
                if (isCompleted) setStep(stepNum);
              }}
              disabled={!isCompleted && !isActive}
              className={`
                flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-medium transition-all shrink-0 min-h-[44px] md:min-h-0
                ${isActive
                  ? 'bg-[#0A0A0A] dark:bg-white text-white dark:text-[#0A0A0A] shadow-sm'
                  : isCompleted
                    ? 'bg-secondary/10 text-secondary cursor-pointer hover:bg-secondary/15'
                    : 'bg-surface dark:bg-[#1e1e1e] text-muted cursor-not-allowed'
                }
              `}
            >
              {isCompleted ? (
                <Check size={14} className="text-secondary" />
              ) : (
                <Icon size={14} />
              )}
              <span className="hidden sm:inline">{s.label}</span>
              <span className="sm:hidden">{stepNum}</span>
            </button>
          );
        })}
      </div>

      {/* Step content */}
      <div className="min-h-[400px]">
        {step === 1 && <AvatarSelectStep />}
        {step === 2 && <AvatarScriptStep />}
        {step === 3 && <AvatarVoiceStep />}
        {step === 4 && <AvatarStyleStep />}
        {step === 5 && <AvatarGenerateStep />}
      </div>

      {/* Navigation bar */}
      {step < 5 && (
        <div className="flex items-center justify-between mt-8 pt-5 border-t border-border-light dark:border-[#333]">
          <button
            type="button"
            onClick={prevStep}
            disabled={step === 1}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-text dark:text-white bg-surface dark:bg-[#1e1e1e] hover:bg-border-light dark:hover:bg-[#2a2a2a] transition-colors disabled:opacity-40 disabled:cursor-not-allowed min-h-[44px] md:min-h-0"
          >
            <ArrowLeft size={16} />
            Back
          </button>

          <div className="text-xs text-muted">
            Step {step} of 5
          </div>

          <button
            type="button"
            onClick={nextStep}
            disabled={!canAdvance()}
            className={`
              flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-[0.98] min-h-[44px] md:min-h-0
              ${canAdvance()
                ? 'bg-gradient-to-r from-primary via-accent to-secondary text-white hover:opacity-90 shadow-sm'
                : 'bg-surface dark:bg-[#2a2a2a] text-muted cursor-not-allowed'
              }
            `}
          >
            {step === 4 ? 'Review & Generate' : 'Continue'}
            <ArrowRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

/** Skeleton for avatar editor loading state. */
function AvatarEditorSkeleton() {
  return (
    <div className="p-4 md:p-6 max-w-[960px] mx-auto animate-pulse">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 rounded-xl bg-surface dark:bg-[#1e1e1e]" />
        <div>
          <div className="h-5 w-48 bg-surface dark:bg-[#1e1e1e] rounded mb-1" />
          <div className="h-3 w-64 bg-surface dark:bg-[#1e1e1e] rounded" />
        </div>
      </div>
      <div className="flex gap-2 mb-8 overflow-x-auto">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-10 w-20 md:w-28 bg-surface dark:bg-[#1e1e1e] rounded-xl shrink-0" />
        ))}
      </div>
      <div className="h-[400px] bg-surface dark:bg-[#1e1e1e] rounded-xl" />
    </div>
  );
}
