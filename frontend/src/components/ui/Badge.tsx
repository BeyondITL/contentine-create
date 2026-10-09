'use client';

import type { ReactNode } from 'react';

export type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'accent' | 'primary' | 'default';

interface BadgeProps {
  variant: BadgeVariant;
  /** Text label — or use children. */
  label?: string;
  children?: ReactNode;
  icon?: ReactNode;
  animated?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  success: 'bg-emerald-50 text-emerald-600 dark:bg-secondary/15 dark:text-secondary',
  warning: 'bg-amber-50 text-amber-600 dark:bg-warning/15 dark:text-warning',
  danger: 'bg-red-50 text-red-600 dark:bg-danger/15 dark:text-danger',
  info: 'bg-blue-50 text-blue-600 dark:bg-info/15 dark:text-info',
  accent: 'bg-accent-bg text-purple-600 dark:bg-accent/15 dark:text-accent',
  primary: 'bg-primary/10 text-primary dark:bg-primary/15 dark:text-primary',
  default: 'bg-surface text-dark/60 dark:bg-white/10 dark:text-white/60',
};

/** Colored status badge with optional icon, pulse animation, size, and dark mode support. */
export default function Badge({ variant, label, children, icon, animated, size = 'md', className = '' }: BadgeProps) {
  const sizeClasses = size === 'sm'
    ? 'px-1.5 py-0.5 text-[10px] rounded-md'
    : 'px-2.5 py-1 md:px-2 md:py-0.5 rounded-lg md:rounded-md text-[12px] md:text-[10px]';

  const content = children ?? label;

  return (
    <span
      className={`
        inline-flex items-center gap-1 font-semibold tracking-wide
        ${sizeClasses} ${variantStyles[variant]} ${className}
      `}
    >
      {icon ? (
        icon
      ) : (
        <span className={`w-1.5 h-1.5 rounded-full bg-current shrink-0 ${animated ? 'animate-pulse' : ''}`} />
      )}
      {variant === 'accent' && !icon && <span className="text-[10px] md:text-[9px]">&#10022;</span>}
      {content}
    </span>
  );
}
