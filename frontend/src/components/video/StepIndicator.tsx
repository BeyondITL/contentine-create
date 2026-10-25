'use client';

import { Check, FileText, Image as ImageIcon, Mic, Palette, Play } from 'lucide-react';
import type { ReactNode } from 'react';

type Step = 1 | 2 | 3 | 4 | 5;

interface StepIndicatorProps {
  current: Step;
  onChange: (step: Step) => void;
}

const steps: { label: string; icon: ReactNode; step: Step }[] = [
  { label: 'Script', icon: <FileText size={16} />, step: 1 },
  { label: 'Visuals', icon: <ImageIcon size={16} />, step: 2 },
  { label: 'Voice', icon: <Mic size={16} />, step: 3 },
  { label: 'Style', icon: <Palette size={16} />, step: 4 },
  { label: 'Generate', icon: <Play size={16} />, step: 5 },
];

/** 5-step wizard progress indicator for the Video Generator. */
export default function StepIndicator({ current, onChange }: StepIndicatorProps) {
  return (
    <nav className="flex items-center gap-1 px-4 py-3 bg-white dark:bg-dark-secondary border-b border-border-light dark:border-dark-secondary overflow-x-auto" aria-label="Video creation steps">
      {steps.map(({ label, icon, step }, i) => {
        const isActive = current === step;
        const isComplete = current > step;
        const isClickable = step <= current;

        return (
          <div key={step} className="flex items-center">
            {/* Step pill */}
            <button
              type="button"
              onClick={() => isClickable && onChange(step)}
              disabled={!isClickable}
              className={`
                flex items-center gap-2 px-3 py-1.5 min-h-[44px] md:min-h-0 rounded-full text-xs font-medium transition-all duration-200 shrink-0
                ${isActive
                  ? 'bg-[#0A0A0A] text-white dark:bg-white dark:text-[#0A0A0A] shadow-sm'
                  : isComplete
                    ? 'bg-secondary/10 text-secondary cursor-pointer hover:bg-secondary/20'
                    : 'bg-surface dark:bg-[#2a2a2a] text-muted cursor-default'
                }
                disabled:opacity-50
              `}
              aria-current={isActive ? 'step' : undefined}
            >
              {isComplete ? <Check size={14} className="text-secondary" /> : icon}
              <span className="hidden sm:inline">{label}</span>
              <span className="sm:hidden">{step}</span>
            </button>

            {/* Connector line */}
            {i < steps.length - 1 && (
              <div
                className={`w-6 lg:w-10 h-px mx-1 transition-colors duration-300 ${
                  isComplete ? 'bg-secondary' : 'bg-border-light dark:bg-[#333]'
                }`}
              />
            )}
          </div>
        );
      })}
    </nav>
  );
}
