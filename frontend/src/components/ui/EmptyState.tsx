'use client';

import { isValidElement, createElement, forwardRef } from 'react';
import type { ReactNode, ElementType } from 'react';

interface EmptyStateProps {
  /** Pass a rendered ReactNode (e.g. <Building className="w-6 h-6" />) or a Lucide icon component. */
  icon: ReactNode | ElementType;
  /** Primary heading — accepts `headline` or `title` for convenience. */
  headline?: string;
  title?: string;
  description: string;
  ctaLabel?: string;
  ctaHref?: string;
  onCTA?: () => void;
  className?: string;
}

/** Centered empty state with icon, headline, description, and optional CTA. */
const EmptyState = forwardRef<HTMLDivElement, EmptyStateProps>(function EmptyState(
  { icon, headline, title, description, ctaLabel, ctaHref, onCTA, className = '' },
  ref
) {
  const displayHeadline = headline || title || '';

  // Support passing Lucide icon components (forwardRef objects) or rendered ReactNodes
  const renderedIcon = isValidElement(icon)
    ? icon
    : createElement(icon as ElementType, { className: 'w-6 h-6 text-primary' });

  return (
    <div ref={ref} className={`flex flex-col items-center justify-center py-12 md:py-20 text-center ${className}`}>
      <div className="w-14 h-14 rounded-2xl bg-primary/[0.06] flex items-center justify-center mb-4">
        {renderedIcon}
      </div>
      {displayHeadline && (
        <h3 className="text-[16px] md:text-[15px] font-semibold text-dark dark:text-white mb-1">{displayHeadline}</h3>
      )}
      <p className="text-[12px] text-dark/50 dark:text-white/50 max-w-[280px] md:max-w-[320px] mb-5 leading-relaxed">{description}</p>
      {ctaLabel && (
        (() => {
          const Tag = ctaHref ? 'a' : 'button';
          return (
            <Tag
              {...(ctaHref ? { href: ctaHref } : { onClick: onCTA })}
              className="inline-flex items-center gap-2 px-5 py-3 md:px-4 md:py-2 min-h-[44px] md:min-h-0 rounded-xl bg-dark dark:bg-white text-white dark:text-dark text-[12.5px] font-semibold hover:opacity-90 active:scale-[0.97] transition-all duration-200 cursor-pointer focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
              style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.15), 0 0 0 0.5px rgba(0,0,0,0.08)' }}
            >
              {ctaLabel}
            </Tag>
          );
        })()
      )}
    </div>
  );
});

export default EmptyState;
