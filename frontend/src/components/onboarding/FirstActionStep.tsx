'use client';

import { useState } from 'react';
import { useOnboardingStore } from '@/stores/onboarding-store';
import { ArrowLeft, Video, Sparkles, Lightbulb, Loader2 } from 'lucide-react';

/** The three main first-action options. */
const ACTIONS = [
  {
    id: 'create_video',
    icon: Video,
    title: 'Create my first video',
    description: 'Jump straight into the AI video editor and produce a video in minutes.',
    accentColor: '#00C3FF',
    accentBg: 'rgba(0,195,255,0.08)',
    accentBgDark: 'rgba(0,195,255,0.06)',
    glowColor: 'rgba(0,195,255,0.15)',
  },
  {
    id: 'remix_content',
    icon: Sparkles,
    title: 'Remix existing content',
    description: 'Paste a URL, upload a document, or drop a video — repurpose it for every platform.',
    accentColor: '#F3A6FF',
    accentBg: 'rgba(243,166,255,0.08)',
    accentBgDark: 'rgba(243,166,255,0.06)',
    glowColor: 'rgba(243,166,255,0.15)',
  },
  {
    id: 'explore_ideas',
    icon: Lightbulb,
    title: 'Find content ideas',
    description: 'Discover trending topics and viral formats across 8 platforms with AI-powered search.',
    accentColor: '#35C838',
    accentBg: 'rgba(53,200,56,0.08)',
    accentBgDark: 'rgba(53,200,56,0.06)',
    glowColor: 'rgba(53,200,56,0.15)',
  },
] as const;

/** Step 4 — Choose first action to complete onboarding. */
export default function FirstActionStep() {
  const { setFirstAction, completeOnboarding, isSubmitting, setStep } = useOnboardingStore();
  const [error, setError] = useState<string | null>(null);

  /** Handle action selection — sets the action and completes onboarding. */
  const handleSelect = async (actionId: string) => {
    setError(null);
    setFirstAction(actionId);
    try {
      await completeOnboarding();
    } catch {
      setError('Something went wrong. Please try again.');
    }
  };

  /** Handle "Just explore the dashboard" — skip first action. */
  const handleExplore = async () => {
    setError(null);
    setFirstAction('explore_dashboard');
    try {
      await completeOnboarding();
    } catch {
      setError('Something went wrong. Please try again.');
    }
  };

  return (
    <div className="w-full max-w-lg mx-auto animate-fade-in">
      {/* Back button */}
      <button
        onClick={() => setStep(3)}
        className="flex items-center gap-1.5 text-[13px] text-text-secondary dark:text-[#AAA] hover:text-text dark:hover:text-white mb-6 transition-colors min-h-[44px] md:min-h-0 focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none rounded-lg px-1"
        aria-label="Go back to previous step"
        disabled={isSubmitting}
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back</span>
      </button>

      {/* Heading */}
      <h2 className="text-xl sm:text-2xl font-bold text-text dark:text-white mb-2 tracking-tight">
        What would you like to do first?
      </h2>
      <p className="text-[14px] text-text-secondary dark:text-[#AAA] mb-8">
        Pick one to get started. You can explore everything else anytime.
      </p>

      {/* Action cards */}
      <div className="flex flex-col gap-3">
        {ACTIONS.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.id}
              onClick={() => handleSelect(action.id)}
              disabled={isSubmitting}
              className="group bento-card-glow flex items-start gap-4 p-5 rounded-2xl text-left transition-all duration-200 cursor-pointer focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none min-h-[44px] disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {/* Icon container */}
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition-all duration-300 group-hover:scale-105"
                style={{
                  backgroundColor: action.accentBg,
                  boxShadow: `0 0 0 0 ${action.glowColor}`,
                }}
              >
                <Icon
                  className="w-6 h-6 transition-transform duration-200"
                  style={{ color: action.accentColor }}
                />
              </div>

              {/* Text */}
              <div className="flex-1 min-w-0">
                <h3 className="text-[14px] font-semibold text-text dark:text-white mb-0.5 group-hover:text-primary transition-colors">
                  {action.title}
                </h3>
                <p className="text-[12px] text-text-secondary dark:text-[#AAA] leading-relaxed">
                  {action.description}
                </p>
              </div>

              {/* Arrow indicator */}
              <svg
                className="w-5 h-5 text-text-muted dark:text-[#555] shrink-0 mt-1 transition-all duration-200 group-hover:text-primary group-hover:translate-x-0.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          );
        })}
      </div>

      {/* Error message */}
      {error && (
        <p className="mt-4 text-[13px] text-danger text-center" role="alert">
          {error}
        </p>
      )}

      {/* Loading indicator */}
      {isSubmitting && (
        <div className="mt-6 flex items-center justify-center gap-2 text-[13px] text-text-secondary dark:text-[#AAA]">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Setting up your workspace...</span>
        </div>
      )}

      {/* Explore dashboard link */}
      <div className="mt-8 text-center">
        <button
          onClick={handleExplore}
          disabled={isSubmitting}
          className="inline-flex items-center gap-1.5 text-[13px] text-text-secondary dark:text-[#AAA] hover:text-text dark:hover:text-white transition-colors min-h-[44px] md:min-h-0 focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none rounded-lg px-2 disabled:opacity-50"
        >
          <span>🏠</span>
          <span>Just explore the dashboard</span>
        </button>
      </div>
    </div>
  );
}
