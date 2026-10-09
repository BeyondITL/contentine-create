'use client';

import {
  Search,
  Play,
  Globe,
  Music2,
  Camera,
  AtSign,
  Pin,
  HelpCircle,
} from 'lucide-react';
import type { IdeaPlatform } from '@/types';

/** Platform configuration with icon, label, and brand color. */
const PLATFORMS: { id: IdeaPlatform; label: string; icon: typeof Search; color: string }[] = [
  { id: 'google', label: 'Google', icon: Search, color: '#4285F4' },
  { id: 'youtube', label: 'YouTube', icon: Play, color: '#FF0000' },
  { id: 'bing', label: 'Bing', icon: Globe, color: '#008373' },
  { id: 'tiktok', label: 'TikTok', icon: Music2, color: '#25F4EE' },
  { id: 'instagram', label: 'Instagram', icon: Camera, color: '#E1306C' },
  { id: 'twitter', label: 'Twitter', icon: AtSign, color: '#1DA1F2' },
  { id: 'pinterest', label: 'Pinterest', icon: Pin, color: '#E60023' },
  { id: 'quora', label: 'Quora', icon: HelpCircle, color: '#B92B27' },
];

interface PlatformTabsProps {
  active: IdeaPlatform;
  onChange: (platform: IdeaPlatform) => void;
}

/** Horizontally scrollable platform tabs for Discover Ideas. */
export default function PlatformTabs({ active, onChange }: PlatformTabsProps) {
  return (
    <div className="-mx-4 px-4 md:mx-0 md:px-0 overflow-x-auto scrollbar-hide">
      <div className="flex items-center gap-1.5" role="tablist" aria-label="Search platforms">
        {PLATFORMS.map(({ id, label, icon: Icon, color }) => {
          const isActive = active === id;

          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-label={`Search ${label}`}
              onClick={() => onChange(id)}
              className={`
                shrink-0 flex items-center gap-1.5 px-3 py-2 min-h-[44px] md:min-h-0
                rounded-xl text-[13px] md:text-[12px] font-medium
                transition-all duration-200 cursor-pointer
                focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none
                active:scale-[0.97]
                ${
                  isActive
                    ? 'bg-[#0A0A0A] dark:bg-white text-white dark:text-[#0A0A0A] shadow-sm'
                    : 'bg-surface dark:bg-[#1e1e1e] text-text-secondary dark:text-[#AAA] hover:bg-border-light dark:hover:bg-[#2a2a2a]'
                }
              `}
            >
              <Icon
                size={14}
                style={isActive ? undefined : { color }}
                className={isActive ? '' : ''}
              />
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export { PLATFORMS };
