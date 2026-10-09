'use client';

import type { ReactNode, HTMLAttributes } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  interactive?: boolean;
  selected?: boolean;
  glow?: boolean;
  className?: string;
}

/** Composable card with optional hover, selection, and gradient border effects. */
export default function Card({ children, interactive = false, selected, glow, className = '', ...rest }: CardProps) {
  const base = glow ? 'bento-card-glow' : 'bento-card';

  return (
    <div
      className={`
        ${base} p-4 md:p-5
        ${interactive ? 'cursor-pointer' : 'cursor-default'}
        ${selected ? 'ring-2 ring-primary/20 border-primary/30' : ''}
        ${className}
      `}
      {...rest}
    >
      {children}
    </div>
  );
}
