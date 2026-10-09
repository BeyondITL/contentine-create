'use client';

import { useState, useEffect, useCallback } from 'react';
import { Sun, Moon } from 'lucide-react';

const STORAGE_KEY = 'contentine_theme';

/** Dark mode toggle — reads/writes localStorage, toggles .dark on <html>. */
export default function ThemeToggle({ className = '' }: { className?: string }) {
  const [isDark, setIsDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Sync state from DOM on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const dark = stored === 'dark' || (!stored && prefersDark);
    setIsDark(dark);
    setMounted(true);
  }, []);

  const toggle = useCallback(() => {
    setIsDark((prev) => {
      const next = !prev;
      if (next) {
        document.documentElement.classList.add('dark');
        localStorage.setItem(STORAGE_KEY, 'dark');
      } else {
        document.documentElement.classList.remove('dark');
        localStorage.setItem(STORAGE_KEY, 'light');
      }
      return next;
    });
  }, []);

  // Prevent hydration mismatch — render nothing until mounted
  if (!mounted) {
    return (
      <div
        className={`w-[44px] h-[44px] md:w-8 md:h-8 rounded-lg ${className}`}
        aria-hidden="true"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className={`
        relative p-2 min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 md:w-8 md:h-8
        flex items-center justify-center
        text-text-muted/50 hover:text-text-secondary dark:hover:text-white
        hover:bg-black/[0.03] dark:hover:bg-white/[0.05]
        rounded-lg transition-all duration-150 cursor-pointer
        focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none
        ${className}
      `}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Light mode' : 'Dark mode'}
    >
      {/* Sun icon — shown in dark mode */}
      <Sun
        size={18}
        strokeWidth={1.75}
        className={`
          absolute transition-all duration-300 ease-in-out
          ${isDark
            ? 'opacity-100 rotate-0 scale-100'
            : 'opacity-0 -rotate-90 scale-0'
          }
        `}
      />
      {/* Moon icon — shown in light mode */}
      <Moon
        size={18}
        strokeWidth={1.75}
        className={`
          absolute transition-all duration-300 ease-in-out
          ${isDark
            ? 'opacity-0 rotate-90 scale-0'
            : 'opacity-100 rotate-0 scale-100'
          }
        `}
      />
    </button>
  );
}
