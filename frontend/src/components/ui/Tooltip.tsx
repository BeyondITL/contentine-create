'use client';

import { useState, useRef, useCallback } from 'react';
import type { ReactNode } from 'react';

interface TooltipProps {
  content: string;
  children: ReactNode;
  side?: 'top' | 'bottom';
  className?: string;
}

/** Lightweight tooltip — shows on hover (desktop) or tap (touch devices) after 300ms delay. */
export default function Tooltip({ content, children, side = 'top', className = '' }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = () => {
    timerRef.current = setTimeout(() => setVisible(true), 300);
  };

  const hide = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(false);
  };

  /** Toggle on tap for touch devices where hover is unavailable. */
  const handleTap = useCallback(() => {
    setVisible((prev) => !prev);
  }, []);

  return (
    <div
      className={`relative inline-flex ${className}`}
      onMouseEnter={show}
      onMouseLeave={hide}
      onTouchStart={handleTap}
    >
      {children}
      {visible && (
        <div
          className={`absolute left-1/2 -translate-x-1/2 z-50 whitespace-nowrap
            px-2.5 py-1.5 rounded-lg bg-[#1A1A1A] text-white text-[11px] font-medium
            shadow-lg animate-[fadeIn_150ms_ease-out] pointer-events-none
            ${side === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'}
          `}
        >
          {content}
        </div>
      )}
    </div>
  );
}
