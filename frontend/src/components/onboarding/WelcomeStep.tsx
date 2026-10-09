'use client';

import ContentineLogo from '@/components/shared/ContentineLogo';
import { useOnboardingStore } from '@/stores/onboarding-store';
import { Sparkles } from 'lucide-react';

/** Step 1 — Welcome screen with animated logo and brand CTA. */
export default function WelcomeStep() {
  const { setStep } = useOnboardingStore();

  return (
    <div className="w-full max-w-md mx-auto flex flex-col items-center text-center animate-fade-in">
      {/* Gradient mesh background orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <div
          className="absolute top-1/4 left-1/4 w-64 h-64 rounded-full opacity-20 blur-3xl"
          style={{
            background: 'radial-gradient(circle, rgba(0,195,255,0.4), transparent 70%)',
            animation: 'meshDrift 12s ease-in-out infinite',
          }}
        />
        <div
          className="absolute bottom-1/4 right-1/4 w-72 h-72 rounded-full opacity-15 blur-3xl"
          style={{
            background: 'radial-gradient(circle, rgba(243,166,255,0.35), transparent 70%)',
            animation: 'meshDrift 10s ease-in-out infinite reverse',
          }}
        />
        <div
          className="absolute top-1/2 right-1/3 w-48 h-48 rounded-full opacity-10 blur-3xl"
          style={{
            background: 'radial-gradient(circle, rgba(53,200,56,0.3), transparent 70%)',
            animation: 'meshDrift 14s ease-in-out infinite 2s',
          }}
        />
      </div>

      {/* Floating logo */}
      <div className="relative mb-8">
        <div
          className="absolute -inset-6 rounded-full opacity-30 blur-2xl"
          style={{
            background: 'radial-gradient(circle, rgba(0,195,255,0.3) 0%, rgba(243,166,255,0.15) 50%, transparent 70%)',
            animation: 'logoPulseGlow 4s ease-in-out infinite',
          }}
          aria-hidden="true"
        />
        <ContentineLogo size={72} />
      </div>

      {/* Heading */}
      <h1 className="text-2xl sm:text-3xl font-bold text-text dark:text-white mb-3 tracking-tight">
        Welcome to Contentine Create
      </h1>

      {/* Subtitle */}
      <p className="text-[15px] sm:text-base text-text-secondary dark:text-[#AAA] mb-10 max-w-sm leading-relaxed">
        Create unlimited AI-powered videos, repurpose content across platforms, and publish everywhere — all from your browser.
      </p>

      {/* Brand gradient CTA */}
      <button
        onClick={() => setStep(2)}
        className="group relative inline-flex items-center gap-2 px-8 py-3.5 min-h-[44px] rounded-2xl text-white font-semibold text-[15px] transition-all duration-300 active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
        style={{
          background: 'linear-gradient(135deg, #00C3FF 0%, #F3A6FF 50%, #35C838 100%)',
          boxShadow: '0 4px 20px rgba(0,195,255,0.25), 0 2px 8px rgba(243,166,255,0.15)',
        }}
      >
        <span>Get Started</span>
        <svg
          className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
        </svg>
      </button>

      {/* AI sparkle badge */}
      <div className="flex items-center gap-1.5 mt-6 text-[12px] text-accent dark:text-accent font-medium">
        <Sparkles className="w-3.5 h-3.5" />
        <span>Powered by AI — no credits, no limits</span>
      </div>
    </div>
  );
}
