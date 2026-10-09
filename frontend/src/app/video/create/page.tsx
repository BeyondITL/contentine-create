'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useEditorStore } from '@/stores/editor-store';
import StepIndicator from '@/components/video/StepIndicator';
import ScriptStep from '@/components/video/ScriptStep';
import VisualsStep from '@/components/video/VisualsStep';
import VoiceStep from '@/components/video/VoiceStep';
import StyleStep from '@/components/video/StyleStep';
import GenerateStep from '@/components/video/GenerateStep';
import ModelRequirements from '@/components/shared/ModelRequirements';

/** Skeleton loader for the video creation wizard. */
function WizardSkeleton() {
  return (
    <div className="flex flex-col h-[calc(100dvh-56px)] pb-16 md:pb-0 bg-white dark:bg-dark animate-pulse">
      {/* Step indicator skeleton */}
      <div className="h-[52px] border-b border-border-light dark:border-[#333] flex items-center justify-center gap-4 px-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-black/[0.06] dark:bg-white/[0.08]" />
            <div className="hidden md:block w-16 h-3 bg-black/[0.04] dark:bg-white/[0.05] rounded" />
          </div>
        ))}
      </div>

      {/* Main content skeleton */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 lg:w-[60%] p-4 md:p-5 lg:p-6">
          <div className="max-w-2xl mx-auto">
            {/* Heading skeleton */}
            <div className="mb-5">
              <div className="h-5 w-48 bg-black/[0.06] dark:bg-white/[0.08] rounded mb-2" />
              <div className="h-4 w-72 bg-black/[0.04] dark:bg-white/[0.05] rounded" />
            </div>
            {/* Scene card skeletons */}
            {[1, 2, 3].map((i) => (
              <div key={i} className="mb-4 p-4 rounded-xl border border-border-light dark:border-[#333]">
                <div className="h-4 w-20 bg-black/[0.06] dark:bg-white/[0.08] rounded mb-3" />
                <div className="h-20 w-full bg-black/[0.04] dark:bg-white/[0.05] rounded-lg mb-2" />
                <div className="h-3 w-24 bg-black/[0.03] dark:bg-white/[0.04] rounded" />
              </div>
            ))}
          </div>
        </div>

        {/* Preview panel skeleton (desktop) */}
        <aside className="hidden lg:flex lg:w-[40%] border-l border-border-light dark:border-[#333] bg-surface dark:bg-[#111] flex-col p-5">
          <div className="h-3 w-16 bg-black/[0.06] dark:bg-white/[0.08] rounded mb-3" />
          <div className="w-full aspect-video bg-black/[0.04] dark:bg-white/[0.05] rounded-xl mb-4" />
          <div className="grid grid-cols-3 gap-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-black/[0.04] dark:bg-white/[0.05] rounded-lg" />
            ))}
          </div>
        </aside>
      </div>

      {/* Bottom nav skeleton */}
      <div className="border-t border-border-light dark:border-[#333] bg-white dark:bg-[#1e1e1e] px-5 py-3 flex items-center justify-between">
        <div className="w-16 h-8 bg-black/[0.04] dark:bg-white/[0.05] rounded-lg" />
        <div className="flex gap-1">{[1, 2, 3, 4, 5].map((i) => <div key={i} className="w-2 h-2 rounded-full bg-black/[0.06] dark:bg-white/[0.08]" />)}</div>
        <div className="w-16 h-8 bg-black/[0.04] dark:bg-white/[0.05] rounded-lg" />
      </div>
    </div>
  );
}

/** Video Generator — 5-step wizard for creating faceless videos. */
export default function VideoCreatePage() {
  const { step, setStep, nextStep, prevStep, scenes, title, aspectRatio } = useEditorStore();
  const safeScenes = scenes ?? [];
  const [isHydrated, setIsHydrated] = useState(false);
  const [loadingVideo, setLoadingVideo] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  /* Wait for client-side hydration before rendering the wizard */
  useEffect(() => {
    setIsHydrated(true);
  }, []);

  /* Backend remix→video bridge (F-41/F-12): /video/create?videoId=X lands here.
     If the wizard is empty, fetch that video and hydrate the store. Read the
     param from window (not useSearchParams) to stay static-export-safe. */
  useEffect(() => {
    const videoId = new URLSearchParams(window.location.search).get('videoId');
    if (!videoId) return;
    const store = useEditorStore.getState();
    if (!store.isEmpty()) return; // never clobber in-progress edits
    let cancelled = false;
    setLoadingVideo(true);
    setLoadError(null);
    store
      .hydrateFromVideoId(videoId)
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Could not open that video in the editor.');
        }
      })
      .finally(() => { if (!cancelled) setLoadingVideo(false); });
    return () => { cancelled = true; };
  }, []);

  /* Clean up on unmount */
  useEffect(() => {
    return () => {
      // Don't reset if user navigates away mid-edit — preserve state
    };
  }, []);

  const canNext = (() => {
    switch (step) {
      case 1: return safeScenes.some((s) => s.narration.trim());
      case 2: return true; // images optional at this stage
      case 3: return true; // voice optional until generate
      case 4: return true;
      default: return false;
    }
  })();

  if (!isHydrated || loadingVideo) return <WizardSkeleton />;

  return (
    <div className="flex flex-col h-[calc(100dvh-56px)] pb-16 md:pb-0 bg-white dark:bg-dark">
      {/* Step indicator bar */}
      <StepIndicator current={step} onChange={setStep} />

      {/* Main content area: left panel (script) + right panel (preview) */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left panel — 60% width on desktop, full on mobile */}
        <div className="flex-1 lg:w-[60%] overflow-y-auto p-4 md:p-5 lg:p-6">
          <div className="max-w-2xl mx-auto">
            {/* Honest failure if the ?videoId bridge could not load the record */}
            {loadError && (
              <div className="mb-5 flex items-start gap-2 p-3 rounded-xl bg-danger/[0.06] dark:bg-danger/[0.1] border border-danger/10">
                <span className="text-[12px] text-danger leading-relaxed flex-1">{loadError}</span>
                <button
                  type="button"
                  onClick={() => setLoadError(null)}
                  className="text-[11px] font-medium text-danger/70 hover:text-danger px-1.5"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* On-device voice model gate — informs + offers Kokoro download for narration */}
            <div className="mb-5">
              <ModelRequirements
                feature="video-create"
                description="Narration is synthesized on your device. Kokoro downloads once, then works offline."
              />
            </div>

            {/* Step heading */}
            <div className="mb-5">
              <h1 className="text-base md:text-lg font-semibold text-text dark:text-white">
                {step === 1 && 'Write Your Script'}
                {step === 2 && 'Add Visuals'}
                {step === 3 && 'Choose a Voice'}
                {step === 4 && 'Style & Format'}
                {step === 5 && 'Review & Generate'}
              </h1>
              <p className="text-[13px] md:text-sm text-muted mt-0.5">
                {step === 1 && 'Type your script or let AI generate one. Drag scenes to reorder.'}
                {step === 2 && 'Generate AI images for each scene or upload your own visuals.'}
                {step === 3 && 'Pick a natural-sounding voice for your narration. Preview before choosing.'}
                {step === 4 && 'Set subtitle style, aspect ratio, transitions, and background music.'}
                {step === 5 && 'Review your settings and start rendering. Browser does all the work.'}
              </p>
            </div>

            {/* Active step content */}
            {step === 1 && <ScriptStep />}
            {step === 2 && <VisualsStep />}
            {step === 3 && <VoiceStep />}
            {step === 4 && <StyleStep />}
            {step === 5 && <GenerateStep />}
          </div>
        </div>

        {/* Right panel — preview + settings summary (desktop only) */}
        <aside className="hidden lg:flex lg:w-[40%] border-l border-border-light dark:border-[#333] bg-surface dark:bg-[#111] flex-col overflow-y-auto">
          <div className="p-5 flex-1">
            {/* Video preview placeholder */}
            <div className="sticky top-5">
              <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Preview</h3>

              {/* Aspect-ratio-aware preview container — uses reactive aspectRatio from store */}
              <div
                className={`
                  relative bg-[#0A0A0A] rounded-xl overflow-hidden mx-auto
                  ${aspectRatio === '9:16' ? 'max-w-[220px] aspect-[9/16]' : ''}
                  ${aspectRatio === '16:9' ? 'w-full aspect-video' : ''}
                  ${aspectRatio === '1:1' ? 'max-w-[300px] aspect-square' : ''}
                `}
              >
                {/* Show first scene image if available */}
                {safeScenes[0]?.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={scenes[0].image_url}
                    alt="First scene preview"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4">
                    <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center mb-2">
                      <ArrowRight size={18} className="text-white/50" />
                    </div>
                    <p className="text-xs text-white/40">
                      {title || 'Your video preview will appear here'}
                    </p>
                  </div>
                )}

                {/* Subtitle preview overlay */}
                {safeScenes[0]?.narration && (
                  <div className="absolute bottom-4 left-3 right-3">
                    <p className="text-white text-xs font-medium text-center bg-black/60 rounded-lg px-3 py-2 line-clamp-2">
                      {safeScenes[0].narration.slice(0, 80)}{safeScenes[0].narration.length > 80 ? '...' : ''}
                    </p>
                  </div>
                )}
              </div>

              {/* Quick stats */}
              <div className="mt-4 grid grid-cols-3 gap-3">
                <QuickStat label="Scenes" value={String(safeScenes.length)} />
                <QuickStat label="Duration" value={`~${safeScenes.reduce((s, sc) => s + sc.duration, 0)}s`} />
                <QuickStat label="Format" value={aspectRatio} />
              </div>

              {/* Scene thumbnails strip */}
              {safeScenes.length > 1 && (
                <div className="mt-4">
                  <h4 className="text-[11px] font-medium text-muted mb-2">Scene Timeline</h4>
                  <div className="flex gap-1.5 overflow-x-auto pb-1">
                    {safeScenes.map((scene, i) => (
                      <div
                        key={scene.id}
                        className="flex-none w-14 h-10 rounded-md bg-[#1e1e1e] overflow-hidden border border-[#333] flex items-center justify-center"
                      >
                        {scene.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={scene.image_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-[10px] text-white/30">{i + 1}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* Bottom navigation bar */}
      <div className="border-t border-border-light dark:border-[#333] bg-white dark:bg-[#1e1e1e] px-5 py-3 flex items-center justify-between">
        <button
          type="button"
          onClick={prevStep}
          disabled={step === 1}
          className="flex items-center gap-1.5 px-4 py-2 min-h-[44px] md:min-h-0 text-sm font-medium text-muted hover:text-text dark:hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ArrowLeft size={16} />
          Back
        </button>

        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((s) => (
            <div
              key={s}
              className={`w-2 h-2 md:w-1.5 md:h-1.5 rounded-full transition-colors ${
                s === step ? 'bg-primary' : s < step ? 'bg-secondary' : 'bg-border dark:bg-[#444]'
              }`}
            />
          ))}
        </div>

        {step < 5 ? (
          <button
            type="button"
            onClick={nextStep}
            disabled={!canNext}
            className="flex items-center gap-1.5 px-4 py-2 min-h-[44px] md:min-h-0 bg-[#0A0A0A] dark:bg-white text-white dark:text-[#0A0A0A] rounded-lg text-sm font-medium hover:opacity-90 transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next
            <ArrowRight size={16} />
          </button>
        ) : (
          <div className="w-20" /> /* Spacer to keep layout balanced on last step */
        )}
      </div>
    </div>
  );
}

/** Mini stat card for the preview panel. */
function QuickStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface dark:bg-[#1e1e1e] border border-border-light dark:border-[#333] rounded-lg p-2.5 text-center">
      <p className="text-sm font-semibold text-text dark:text-white">{value}</p>
      <p className="text-[10px] text-muted mt-0.5">{label}</p>
    </div>
  );
}
