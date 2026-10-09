'use client';

import { Check, Sparkles } from 'lucide-react';
import type { AvatarPreset } from '@/types';

interface AvatarCardProps {
  avatar: AvatarPreset;
  isSelected: boolean;
  onSelect: () => void;
}

/** Clickable avatar preset card with hover zoom and selection state. */
export default function AvatarCard({ avatar, isSelected, onSelect }: AvatarCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`
        group relative flex flex-col items-center p-3 rounded-xl border-2 transition-all duration-200 text-left min-h-[44px]
        ${isSelected
          ? 'border-primary bg-primary-bg dark:bg-primary/10 ring-1 ring-primary/20'
          : 'border-border-light dark:border-[#333] hover:border-border dark:hover:border-[#555] hover:shadow-md active:scale-[0.97]'
        }
      `}
    >
      {/* Selection indicator */}
      {isSelected && (
        <div className="absolute top-2 right-2 z-10 w-5 h-5 rounded-full bg-primary flex items-center justify-center shadow-sm">
          <Check size={12} className="text-white" />
        </div>
      )}

      {/* Avatar image — hover zoom */}
      <div className="relative w-full aspect-square rounded-lg overflow-hidden bg-surface dark:bg-[#151515] mb-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={avatar.photo_path}
          alt={avatar.name}
          className="w-full h-full object-cover transition-transform duration-200 ease-out group-hover:scale-105 group-active:scale-105"
        />
        {/* AI badge */}
        <div className="absolute top-1.5 left-1.5 flex items-center gap-0.5 bg-accent/90 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
          <Sparkles size={8} />
          AI
        </div>
      </div>

      {/* Name + tags */}
      <p className="text-xs font-medium text-text dark:text-white truncate w-full text-center">{avatar.name}</p>
      <div className="flex items-center gap-1 mt-1 flex-wrap">
        {avatar.gender && (
          <span className="px-2 py-0.5 text-[9px] font-medium bg-surface dark:bg-[#2a2a2a] text-muted rounded-md capitalize">
            {avatar.gender}
          </span>
        )}
        {avatar.style && (
          <span className="px-2 py-0.5 text-[9px] font-medium bg-surface dark:bg-[#2a2a2a] text-muted rounded-md capitalize">
            {avatar.style}
          </span>
        )}
      </div>
    </button>
  );
}
