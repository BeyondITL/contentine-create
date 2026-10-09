'use client';

import { useOnboardingStore } from '@/stores/onboarding-store';
import ContentineLogo from '@/components/shared/ContentineLogo';
import WelcomeStep from '@/components/onboarding/WelcomeStep';
import ContentTypeStep from '@/components/onboarding/ContentTypeStep';
import ConnectPlatformsStep from '@/components/onboarding/ConnectPlatformsStep';
import FirstActionStep from '@/components/onboarding/FirstActionStep';

/** Full-screen 4-step onboarding wizard. Does NOT use AppShell. */
export default function OnboardingPage() {
  const { step } = useOnboardingStore();

  return (
    <div className="min-h-screen min-h-[100dvh] bg-[#F7F8FA] dark:bg-dark flex flex-col relative overflow-hidden">
      {/* Top bar with logo + step indicator */}
      <header className="relative z-10 flex items-center justify-between px-4 md:px-8 py-4">
        <div className="flex items-center gap-2">
          <ContentineLogo size={26} />
          <span className="text-[13px] font-bold text-text dark:text-white hidden sm:inline tracking-tight">
            Contentine Create
          </span>
        </div>

        {/* Step dots */}
        <nav aria-label="Onboarding progress" className="flex gap-1.5">
          {([1, 2, 3, 4] as const).map((s) => (
            <div
              key={s}
              className={`w-2 h-2 rounded-full transition-all duration-300 ${
                s === step
                  ? 'bg-primary scale-110'
                  : s < step
                    ? 'bg-secondary'
                    : 'bg-border-light dark:bg-[#333]'
              }`}
              role="img"
              aria-label={
                s === step
                  ? `Step ${s} of 4 — current`
                  : s < step
                    ? `Step ${s} of 4 — completed`
                    : `Step ${s} of 4 — upcoming`
              }
            />
          ))}
        </nav>
      </header>

      {/* Step content — centered */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-4 py-8">
        {step === 1 && <WelcomeStep />}
        {step === 2 && <ContentTypeStep />}
        {step === 3 && <ConnectPlatformsStep />}
        {step === 4 && <FirstActionStep />}
      </main>

      {/* Footer */}
      <footer className="relative z-10 text-center pb-4 px-4">
        <p className="text-[11px] text-text-muted dark:text-[#555]">
          Step {step} of 4
        </p>
      </footer>
    </div>
  );
}
