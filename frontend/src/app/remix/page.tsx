'use client';

import { Suspense, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  ArrowLeft, ArrowRight, Check, Sparkles, Loader2,
  FileText, Target, Wand2, RotateCcw,
} from 'lucide-react';
import { useRemixStore } from '@/stores/remix-store';
import { useModelReadiness } from '@/hooks/use-model-readiness';
import { useToast } from '@/components/ui';
import ModelDownloadModal from '@/components/shared/ModelDownloadModal';
import SourcePanel from '@/components/remix/SourcePanel';
import PlatformSelector from '@/components/remix/PlatformSelector';
import OutputTabs from '@/components/remix/OutputTabs';
import RemixProjectList from '@/components/remix/RemixProjectList';
import ModelRequirements from '@/components/shared/ModelRequirements';
import { Skeleton } from '@/components/ui';

const STEPS = [
  { id: 1 as const, label: 'Add Sources', icon: FileText, desc: 'Content to remix' },
  { id: 2 as const, label: 'Select Platforms', icon: Target, desc: 'Where to publish' },
  { id: 3 as const, label: 'Results', icon: Wand2, desc: 'Edit & publish' },
];

/** Skeleton fallback for Suspense boundary. */
function RemixSkeleton() {
  return (
    <div className="max-w-4xl mx-auto px-4 md:px-0">
      <Skeleton className="h-7 w-48 md:h-8 md:w-64 mb-2" />
      <Skeleton className="h-4 w-64 md:w-96 mb-8" />
      <div className="flex items-center gap-4 md:gap-8 mb-8">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-2 md:gap-3">
            <Skeleton className="w-10 h-10 rounded-full" />
            <div className="hidden sm:block">
              <Skeleton className="h-4 w-16 md:w-24 mb-1" />
              <Skeleton className="h-3 w-12 md:w-16" />
            </div>
          </div>
        ))}
      </div>
      <Skeleton className="h-48 md:h-64 rounded-xl" />
    </div>
  );
}

/** Content Remix Hub — wrapped in Suspense for useSearchParams. */
export default function RemixPage() {
  return (
    <Suspense fallback={<RemixSkeleton />}>
      <RemixPageInner />
    </Suspense>
  );
}

/** Content Remix Hub — 3-step wizard to turn any content into multi-platform posts. */
function RemixPageInner() {
  const searchParams = useSearchParams();
  const projectIdParam = searchParams?.get('projectId');

  const {
    wizardStep, setWizardStep, localSources, selectedPlatforms,
    isGenerating, outputs, reset, currentProject, generateRemix, loadProject,
  } = useRemixStore();

  // SA-36: the remix lane inherited the model-requirements BANNER but not the
  // GATE, so "Generate" started with the weights absent and sat on
  // "Generating Remixes…" forever with no progress. Same primitive
  // CartoonScriptStep uses — readiness check, real-progress modal, honest toast.
  const readiness = useModelReadiness('remix');
  const { toast } = useToast();
  const model = readiness.missing[0];

  const safeSources = localSources ?? [];
  const safePlatforms = selectedPlatforms ?? [];

  // Set page title
  useEffect(() => {
    document.title = currentProject?.name
      ? `${currentProject.name} | Contentine Create`
      : 'Content Remix Hub | Contentine Create';
  }, [currentProject?.name]);

  // Load project from URL param or reset for fresh wizard
  useEffect(() => {
    if (projectIdParam) {
      const id = Number(projectIdParam);
      if (id && (!currentProject || currentProject.id !== id)) {
        loadProject(id);
      }
    } else if (!currentProject) {
      reset();
    }
  }, [projectIdParam]); // eslint-disable-line react-hooks/exhaustive-deps

  const canAdvance = useCallback(() => {
    switch (wizardStep) {
      case 1: return safeSources.length > 0;
      case 2: return safePlatforms.length > 0;
      case 3: return true;
      default: return false;
    }
  }, [wizardStep, safeSources.length, safePlatforms.length]);

  /**
   * Satisfy the on-device model gate BEFORE entering the generating state.
   * Returns false only when the user was told why we are not proceeding.
   *
   * No WebGPU is not a hard stop here (unlike cartoon drafting): `generateRemix`
   * tries the server first and only falls back to the browser engine, and that
   * fallback now reports its own reason per platform. So we download when the
   * device can actually run the model, and otherwise let the server try.
   */
  async function ensureModelReady(): Promise<boolean> {
    if (readiness.ready) return true;
    const gpu = (navigator as unknown as { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu;
    const gpuOk = !!gpu && !!(await gpu.requestAdapter().catch(() => null));
    if (!gpuOk) {
      toast({
        variant: 'info',
        title: 'On-device remixing needs WebGPU',
        description: 'Use Chrome or Edge on desktop to remix offline. Trying the server instead.',
      });
      return true;
    }
    const ok = await readiness.download();
    if (!ok) {
      toast({
        variant: 'error',
        title: 'Model download failed',
        description: readiness.error ?? 'Could not download the AI model. Please try again.',
      });
      return false;
    }
    return true;
  }

  async function handleNext() {
    if (wizardStep === 1 && canAdvance()) {
      setWizardStep(2);
    } else if (wizardStep === 2 && canAdvance()) {
      if (isGenerating || readiness.downloading) return;
      if (!(await ensureModelReady())) return;
      await generateRemix();
    }
  }

  function handleBack() {
    if (wizardStep === 2) setWizardStep(1);
    if (wizardStep === 3) setWizardStep(2);
  }

  function handleStartNew() {
    reset();
    // Clear URL params
    if (typeof window !== 'undefined' && window.history) {
      window.history.replaceState({}, '', '/remix');
    }
  }

  const showProjectList = wizardStep === 1 && safeSources.length === 0 && !currentProject;

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-0">
      {/* Real-progress model download modal — no more "is it hung or is it a
          763 MB download?" (SA-36) */}
      {model && (
        <ModelDownloadModal
          isVisible={readiness.downloading}
          progress={readiness.progress * 100}
          modelName={model.name}
          sizeLabel={readiness.missingSizeLabel}
        />
      )}

      {/* Page header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles size={20} className="text-accent" />
          <h1 className="text-xl md:text-2xl font-bold text-text dark:text-white">Content Remix Hub</h1>
        </div>
        <p className="text-sm text-muted">
          Turn any content into optimized posts for every platform — powered by AI
        </p>
      </div>

      {/* On-device model gate — informs + offers download; server fallback keeps remixing usable */}
      <div className="mb-6">
        <ModelRequirements
          feature="remix"
          description="Remixes are generated on your device. The model below downloads once, then works offline."
        />
      </div>

      {/* Step indicator */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {STEPS.map((step, i) => {
            const Icon = step.icon;
            const isActive = wizardStep === step.id;
            const isCompleted = wizardStep > step.id;
            const isClickable = step.id < wizardStep || (step.id === 2 && safeSources.length > 0);

            return (
              <div key={step.id} className="flex items-center flex-1">
                <button
                  type="button"
                  onClick={() => isClickable && setWizardStep(step.id)}
                  disabled={!isClickable}
                  className="flex items-center gap-3 group disabled:cursor-default focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none rounded-xl"
                >
                  <div className={`
                    w-10 h-10 rounded-full flex items-center justify-center transition-all
                    ${isActive
                      ? 'bg-accent text-white shadow-lg shadow-accent/20'
                      : isCompleted
                        ? 'bg-secondary text-white'
                        : 'bg-surface dark:bg-[#2a2a2a] text-muted'
                    }
                  `}>
                    {isCompleted ? <Check size={18} /> : <Icon size={18} />}
                  </div>
                  <div className="hidden sm:block text-left">
                    <p className={`text-sm font-medium ${
                      isActive ? 'text-text dark:text-white' : 'text-muted'
                    }`}>
                      {step.label}
                    </p>
                    <p className="text-[10px] text-muted">{step.desc}</p>
                  </div>
                </button>

                {i < STEPS.length - 1 && (
                  <div className="flex-1 mx-3">
                    <div className={`h-0.5 rounded-full transition-colors ${
                      wizardStep > step.id ? 'bg-secondary' : 'bg-border-light dark:bg-[#333]'
                    }`} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Step content */}
      <div className="min-h-[300px] md:min-h-[400px]">
        {wizardStep === 1 && (
          <div className="space-y-6">
            <SourcePanel />
            {showProjectList && <RemixProjectList />}
          </div>
        )}

        {wizardStep === 2 && <PlatformSelector />}

        {wizardStep === 3 && <OutputTabs />}
      </div>

      {/* Navigation buttons */}
      <div className="mt-6 md:mt-8 flex items-center justify-between gap-3">
        <div>
          {wizardStep > 1 && (
            <button
              type="button"
              onClick={handleBack}
              disabled={isGenerating || readiness.downloading}
              className="flex items-center gap-2 px-4 py-2.5 min-h-[44px] md:min-h-0 text-sm font-medium text-muted hover:text-text dark:hover:text-white transition-colors disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none rounded-lg"
            >
              <ArrowLeft size={16} />
              Back
            </button>
          )}
        </div>

        <div className="flex items-center gap-3">
          {wizardStep === 3 && (
            <button
              type="button"
              onClick={handleStartNew}
              className="flex items-center gap-2 px-4 py-2.5 min-h-[44px] md:min-h-0 bg-surface dark:bg-[#2a2a2a] text-text dark:text-white rounded-lg text-sm font-medium hover:bg-border-light dark:hover:bg-[#333] transition-colors focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
            >
              <RotateCcw size={14} />
              Start New Remix
            </button>
          )}

          {wizardStep < 3 && (
            <button
              type="button"
              onClick={handleNext}
              disabled={!canAdvance() || isGenerating || readiness.downloading}
              className={`
                flex items-center gap-2 px-6 py-3 min-h-[44px] md:min-h-0 rounded-xl text-sm font-semibold transition-all active:scale-[0.98]
                disabled:opacity-40 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none
                ${wizardStep === 2
                  ? 'bg-gradient-to-r from-accent via-primary to-secondary text-white shadow-lg shadow-accent/20 hover:opacity-90'
                  : 'bg-primary text-white hover:bg-primary-hover'
                }
              `}
            >
              {readiness.downloading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Downloading model...
                </>
              ) : isGenerating ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Generating Remixes...
                </>
              ) : wizardStep === 2 ? (
                <>
                  <Sparkles size={16} />
                  Generate Remixes
                </>
              ) : (
                <>
                  Continue
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
