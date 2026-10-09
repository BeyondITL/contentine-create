'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useEditorStore } from '@/stores/editor-store';
import { useCartoonStore } from '@/stores/cartoon-store';
import CartoonStepIndicator from '@/components/cartoon/CartoonStepIndicator';
import CartoonScriptStep from '@/components/cartoon/CartoonScriptStep';
import CartoonStyleStep from '@/components/cartoon/CartoonStyleStep';
import CartoonGenerateStep from '@/components/cartoon/CartoonGenerateStep';
import CartoonTimelineEditor from '@/components/cartoon/CartoonTimelineEditor';
import VoiceStep from '@/components/video/VoiceStep';

const HEADINGS: Record<number, { title: string; subtitle: string }> = {
  1: { title: 'Write Your Script', subtitle: 'Type each scene or let AI draft it. One spoken line per scene.' },
  2: { title: 'Pick a Style', subtitle: 'Choose a built-in cartoon style and output format.' },
  3: { title: 'Choose a Voice', subtitle: 'Pick a natural voice for your narrator. Preview before choosing.' },
  4: { title: 'Render & Download', subtitle: 'Your browser downloads the voice model, plans the scenes, and renders the MP4.' },
};

/** Cartoon Studio — 4-step wizard that renders a cartoon MP4 fully on-device (C-M1 engine). */
export default function CartoonPage() {
  const { step, setStep, nextStep, prevStep, editorOpen, session } = useCartoonStore();
  const { scenes, voiceId } = useEditorStore();
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  const safeScenes = scenes ?? [];
  const canNext = (() => {
    switch (step) {
      case 1: return safeScenes.some((s) => s.narration.trim());
      case 2: return true;
      case 3: return voiceId !== null;
      default: return false;
    }
  })();

  if (!isHydrated) {
    return (
      <div className="flex flex-col h-[calc(100dvh-56px)] pb-16 md:pb-0 bg-white dark:bg-dark animate-pulse">
        <div className="h-[52px] border-b border-border-light dark:border-[#333]" />
        <div className="flex-1" />
      </div>
    );
  }

  // Post-generate timeline editor takes over the surface once opened.
  if (editorOpen && session) {
    return <CartoonTimelineEditor />;
  }

  return (
    <div className="flex flex-col h-[calc(100dvh-56px)] pb-16 md:pb-0 bg-white dark:bg-dark">
      <CartoonStepIndicator current={step} onChange={setStep} />

      <div className="flex-1 overflow-y-auto p-4 md:p-5 lg:p-6">
        <div className="max-w-2xl mx-auto">
          <div className="mb-5">
            <h1 className="text-base md:text-lg font-semibold text-text dark:text-white">{HEADINGS[step].title}</h1>
            <p className="text-[13px] md:text-sm text-muted mt-0.5">{HEADINGS[step].subtitle}</p>
          </div>

          {step === 1 && <CartoonScriptStep />}
          {step === 2 && <CartoonStyleStep />}
          {step === 3 && <VoiceStep />}
          {step === 4 && <CartoonGenerateStep />}
        </div>
      </div>

      {/* Bottom navigation */}
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
          {[1, 2, 3, 4].map((s) => (
            <div
              key={s}
              className={`w-2 h-2 md:w-1.5 md:h-1.5 rounded-full transition-colors ${
                s === step ? 'bg-primary' : s < step ? 'bg-secondary' : 'bg-border dark:bg-[#444]'
              }`}
            />
          ))}
        </div>

        {step < 4 ? (
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
          <div className="w-20" />
        )}
      </div>
    </div>
  );
}
