'use client';

import { useState, useEffect, useRef } from 'react';
import {
  LayoutDashboard, Plus, Sparkles, CalendarDays, MoreHorizontal,
  Lightbulb, PenLine, Video, BarChart3, Users, Settings, X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/** Primary bottom nav items (always visible). */
const PRIMARY_ITEMS: { Icon: LucideIcon; label: string; href: string }[] = [
  { Icon: LayoutDashboard, label: 'Home', href: '/' },
  { Icon: Plus, label: 'Create', href: '/video/create' },
  { Icon: Sparkles, label: 'Remix', href: '/remix' },
  { Icon: CalendarDays, label: 'Schedule', href: '/calendar' },
];

/** Items shown in the "More" sheet. */
const MORE_ITEMS: { Icon: LucideIcon; label: string; href: string }[] = [
  { Icon: Lightbulb, label: 'Discover', href: '/discover' },
  { Icon: PenLine, label: 'AI Writer', href: '/writer' },
  { Icon: Video, label: 'My Videos', href: '/videos' },
  { Icon: BarChart3, label: 'Analytics', href: '/analytics' },
  { Icon: Users, label: 'Team', href: '/team' },
  { Icon: Settings, label: 'Settings', href: '/settings' },
];

interface BottomNavProps {
  pathname: string;
}

/** Mobile bottom navigation bar — fixed at bottom, hidden on md+. */
export default function BottomNav({ pathname }: BottomNavProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);

  // Close the More sheet on route change
  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  // Close on outside click
  useEffect(() => {
    if (!moreOpen) return;
    function handleClick(e: MouseEvent) {
      if (sheetRef.current && !sheetRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [moreOpen]);

  // Close on Escape
  useEffect(() => {
    if (!moreOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMoreOpen(false);
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [moreOpen]);

  const isMoreActive = MORE_ITEMS.some((item) => pathname.startsWith(item.href));

  return (
    <>
      {/* Backdrop for More sheet */}
      {moreOpen && (
        <div
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 md:hidden animate-fade-in"
          aria-hidden="true"
        />
      )}

      {/* More sheet — slides up from bottom */}
      {moreOpen && (
        <div
          ref={sheetRef}
          className="fixed bottom-[60px] left-0 right-0 z-50 bg-white dark:bg-dark-secondary border-t border-black/[0.06] dark:border-white/[0.06] rounded-t-2xl shadow-2xl md:hidden animate-slide-up safe-area-bottom"
          role="dialog"
          aria-label="More navigation options"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-black/[0.04] dark:border-white/[0.04]">
            <span className="text-[13px] font-semibold text-text dark:text-white">
              More
            </span>
            <button
              type="button"
              onClick={() => setMoreOpen(false)}
              className="flex items-center justify-center w-8 h-8 min-w-[44px] min-h-[44px] rounded-lg text-text-muted hover:text-text dark:hover:text-white hover:bg-black/[0.04] dark:hover:bg-white/[0.04] transition-colors cursor-pointer"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
          <div className="px-2 py-2">
            {MORE_ITEMS.map((item) => {
              const isActive = pathname.startsWith(item.href);
              return (
                <a
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-3 min-h-[48px] rounded-xl transition-all duration-150 ${
                    isActive
                      ? 'bg-primary/[0.06] dark:bg-primary/[0.1] text-primary font-medium'
                      : 'text-text dark:text-[#E0E0E0] hover:bg-black/[0.03] dark:hover:bg-white/[0.04]'
                  }`}
                >
                  <item.Icon size={20} strokeWidth={isActive ? 2 : 1.5} />
                  <span className="text-[14px]">{item.label}</span>
                </a>
              );
            })}
          </div>
        </div>
      )}

      {/* Bottom nav bar */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-dark-secondary border-t border-black/[0.06] dark:border-white/[0.06] safe-area-bottom md:hidden"
        role="navigation"
        aria-label="Bottom navigation"
      >
        <div className="flex items-center justify-around h-[60px] px-2">
          {PRIMARY_ITEMS.map((item) => {
            const isActive = item.href === '/'
              ? pathname === '/'
              : pathname.startsWith(item.href);
            return (
              <a
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center justify-center gap-0.5 min-w-[56px] min-h-[44px] rounded-xl transition-colors duration-150 ${
                  isActive
                    ? 'text-primary'
                    : 'text-text-muted dark:text-white/40'
                }`}
                aria-current={isActive ? 'page' : undefined}
              >
                <item.Icon size={22} strokeWidth={isActive ? 2 : 1.5} />
                <span className="text-[10px] font-medium">{item.label}</span>
              </a>
            );
          })}

          {/* More button */}
          <button
            type="button"
            onClick={() => setMoreOpen(!moreOpen)}
            className={`flex flex-col items-center justify-center gap-0.5 min-w-[56px] min-h-[44px] rounded-xl transition-colors duration-150 cursor-pointer ${
              moreOpen || isMoreActive
                ? 'text-primary'
                : 'text-text-muted dark:text-white/40'
            }`}
            aria-expanded={moreOpen}
            aria-label="More navigation"
          >
            <MoreHorizontal size={22} strokeWidth={moreOpen || isMoreActive ? 2 : 1.5} />
            <span className="text-[10px] font-medium">More</span>
          </button>
        </div>
      </nav>
    </>
  );
}
