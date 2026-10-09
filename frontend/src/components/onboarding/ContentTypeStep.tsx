'use client';

import { useOnboardingStore } from '@/stores/onboarding-store';
import { Check, ArrowLeft } from 'lucide-react';

/** The 7 content type options for onboarding step 2. */
const CONTENT_TYPES = [
  {
    id: 'short_form',
    icon: '📱',
    label: 'Short-form video',
    description: 'TikTok, Reels, Shorts',
  },
  {
    id: 'long_form',
    icon: '🎬',
    label: 'Long-form video',
    description: 'YouTube, tutorials, courses',
  },
  {
    id: 'written',
    icon: '✍️',
    label: 'Written content',
    description: 'Blogs, newsletters, threads',
  },
  {
    id: 'remixing',
    icon: '🔀',
    label: 'Content remixing',
    description: 'Repurpose across platforms',
  },
  {
    id: 'marketing',
    icon: '📊',
    label: 'Marketing & ads',
    description: 'Campaigns, promos, creatives',
  },
  {
    id: 'educational',
    icon: '🎓',
    label: 'Educational content',
    description: 'Courses, explainers, how-tos',
  },
  {
    id: 'other',
    icon: '✨',
    label: 'Other',
    description: 'Something else entirely',
  },
] as const;

/** Step 2 — Content type multi-select grid. */
export default function ContentTypeStep() {
  const { contentTypes, toggleContentType, setStep } = useOnboardingStore();

  return (
    <div className="w-full max-w-lg mx-auto animate-fade-in">
      {/* Back button */}
      <button
        onClick={() => setStep(1)}
        className="flex items-center gap-1.5 text-[13px] text-text-secondary dark:text-[#AAA] hover:text-text dark:hover:text-white mb-6 transition-colors min-h-[44px] md:min-h-0 focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none rounded-lg px-1"
        aria-label="Go back to previous step"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back</span>
      </button>

      {/* Heading */}
      <h2 className="text-xl sm:text-2xl font-bold text-text dark:text-white mb-2 tracking-tight">
        What kind of content do you create?
      </h2>
      <p className="text-[14px] text-text-secondary dark:text-[#AAA] mb-8">
        Select all that apply. This helps us personalize your experience.
      </p>

      {/* Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {CONTENT_TYPES.map((type) => {
          const isSelected = contentTypes.includes(type.id);
          return (
            <button
              key={type.id}
              onClick={() => toggleContentType(type.id)}
              className={`
                bento-card relative flex flex-col items-start p-4 min-h-[44px] rounded-2xl text-left
                transition-all duration-200 cursor-pointer
                focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none
                ${isSelected
                  ? 'border-primary bg-primary-bg/40 dark:bg-primary/[0.08] !border-primary/50'
                  : 'hover:border-border dark:hover:border-white/[0.1]'
                }
              `}
              style={isSelected ? { borderColor: 'rgba(0,195,255,0.5)' } : undefined}
              aria-pressed={isSelected}
              role="checkbox"
              aria-checked={isSelected}
            >
              {/* Check mark */}
              {isSelected && (
                <div className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                  <Check className="w-3 h-3 text-white" strokeWidth={3} />
                </div>
              )}

              {/* Icon */}
              <span className="text-2xl mb-2" role="img" aria-hidden="true">
                {type.icon}
              </span>

              {/* Label */}
              <span className="text-[13px] font-semibold text-text dark:text-white leading-tight">
                {type.label}
              </span>

              {/* Description */}
              <span className="text-[11px] text-text-muted dark:text-[#888] mt-0.5 leading-snug">
                {type.description}
              </span>
            </button>
          );
        })}
      </div>

      {/* Continue button */}
      <div className="mt-8 flex justify-end">
        <button
          onClick={() => setStep(3)}
          disabled={contentTypes.length === 0}
          className="btn-primary px-6 disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
