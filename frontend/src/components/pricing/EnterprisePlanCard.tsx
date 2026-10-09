'use client';

import {
  Palette,
  Headphones,
  ShieldCheck,
  BarChart3,
  Users,
  ScanFace,
  Code2,
  UserCheck,
  Sparkles,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface FeatureItem {
  icon: LucideIcon;
  label: string;
}

const features: FeatureItem[] = [
  { icon: Palette, label: 'Custom branding' },
  { icon: Headphones, label: 'Priority support' },
  { icon: ShieldCheck, label: 'SLA guarantee' },
  { icon: BarChart3, label: 'Advanced analytics' },
  { icon: Users, label: 'Team management (unlimited)' },
  { icon: ScanFace, label: 'Custom avatar training' },
  { icon: Code2, label: 'API access' },
  { icon: UserCheck, label: 'Dedicated account manager' },
];

interface EnterprisePlanCardProps {
  /** Called when the CTA button is clicked. Scroll to or open the contact form. */
  onContactSales?: () => void;
}

/** Enterprise tier plan card with gradient accent border. */
export default function EnterprisePlanCard({ onContactSales }: EnterprisePlanCardProps) {
  function handleClick() {
    if (onContactSales) {
      onContactSales();
      return;
    }
    // Default: scroll to enterprise contact form
    const el = document.getElementById('enterprise-contact');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  return (
    <div className="bento-card-glow p-6 md:p-8 flex flex-col h-full relative overflow-hidden">
      {/* Badge */}
      <div className="flex items-center justify-between mb-5">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold tracking-wide bg-accent-bg text-purple-600 dark:bg-accent/15 dark:text-accent">
          <Sparkles size={12} />
          Best for teams
        </span>
      </div>

      {/* Title + Price */}
      <div className="mb-6">
        <h3 className="text-[20px] md:text-[18px] font-bold text-text dark:text-[#E0E0E0]">
          Enterprise
        </h3>
        <div className="mt-2 flex items-baseline gap-1">
          <span className="text-[32px] md:text-[28px] font-extrabold text-text dark:text-white tracking-tight">
            Custom
          </span>
        </div>
        <p className="mt-1.5 text-[13px] md:text-[12px] text-text-muted leading-relaxed">
          Tailored to your organization's scale and workflow.
        </p>
      </div>

      {/* Feature list */}
      <ul className="space-y-3 mb-8 flex-1" role="list">
        {features.map(({ icon: Icon, label }) => (
          <li key={label} className="flex items-center gap-3">
            <span className="shrink-0 w-7 h-7 rounded-lg bg-surface dark:bg-white/[0.06] flex items-center justify-center">
              <Icon size={14} className="text-text-secondary dark:text-[#AAA]" />
            </span>
            <span className="text-[13px] md:text-[12px] text-text dark:text-[#E0E0E0]">
              {label}
            </span>
          </li>
        ))}
      </ul>

      {/* CTA */}
      <button
        type="button"
        onClick={handleClick}
        className="
          w-full min-h-[44px] rounded-xl text-[14px] md:text-[13px] font-semibold
          transition-all duration-200 active:scale-[0.97] cursor-pointer
          focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none
          bg-gradient-to-r from-primary via-accent to-secondary
          text-white shadow-md shadow-primary/20
          hover:shadow-lg hover:shadow-primary/30
        "
      >
        Contact Sales
      </button>

      {/* Subtle background gradient accent */}
      <div
        className="absolute -top-24 -right-24 w-48 h-48 rounded-full opacity-[0.04] dark:opacity-[0.06] pointer-events-none"
        style={{
          background: 'radial-gradient(circle, #00C3FF 0%, #F3A6FF 50%, transparent 70%)',
        }}
      />
    </div>
  );
}
