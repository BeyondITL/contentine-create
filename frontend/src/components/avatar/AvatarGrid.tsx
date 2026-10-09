'use client';

import { useState } from 'react';
import { Search, Upload, SlidersHorizontal } from 'lucide-react';
import AvatarCard from './AvatarCard';
import type { AvatarPreset } from '@/types';

type GenderFilter = 'all' | 'male' | 'female';
type StyleFilter = 'all' | 'professional' | 'casual' | 'creative' | 'character';

interface AvatarGridProps {
  avatars: AvatarPreset[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onUploadCustom?: () => void;
}

/** Grid of avatar presets with search, gender filter, and style filter. */
export default function AvatarGrid({ avatars, selectedId, onSelect, onUploadCustom }: AvatarGridProps) {
  const [search, setSearch] = useState('');
  const [genderFilter, setGenderFilter] = useState<GenderFilter>('all');
  const [styleFilter, setStyleFilter] = useState<StyleFilter>('all');
  const [showFilters, setShowFilters] = useState(false);

  const filtered = avatars.filter((a) => {
    if (genderFilter !== 'all' && a.gender?.toLowerCase() !== genderFilter) return false;
    if (styleFilter !== 'all' && a.style?.toLowerCase() !== styleFilter) return false;
    if (search && !a.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 sm:max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search avatars..."
            className="w-full pl-8 pr-3 py-2.5 md:py-2 bg-surface dark:bg-[#1e1e1e] border border-border-light dark:border-[#333] rounded-lg text-[16px] md:text-sm text-text dark:text-white placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all min-h-[44px] md:min-h-0"
          />
        </div>

        {/* Gender chips */}
        <div className="flex items-center gap-1">
          {(['all', 'male', 'female'] as const).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGenderFilter(g)}
              className={`px-3 py-2 md:py-1.5 text-xs font-medium rounded-full transition-all capitalize min-h-[44px] md:min-h-0 ${
                genderFilter === g
                  ? 'bg-[#0A0A0A] dark:bg-white text-white dark:text-[#0A0A0A]'
                  : 'bg-surface dark:bg-[#1e1e1e] text-muted hover:text-text dark:hover:text-white'
              }`}
            >
              {g}
            </button>
          ))}
        </div>

        {/* Filter toggle + Upload button */}
        <div className="flex items-center gap-2 ml-auto">
          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            className={`p-2.5 md:p-2 rounded-lg transition-colors min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 flex items-center justify-center ${
              showFilters ? 'bg-primary/10 text-primary' : 'bg-surface dark:bg-[#1e1e1e] text-muted hover:text-text dark:hover:text-white'
            }`}
          >
            <SlidersHorizontal size={16} />
          </button>
          {onUploadCustom && (
            <button
              type="button"
              onClick={onUploadCustom}
              className="flex items-center gap-1.5 px-3 py-2.5 md:py-2 bg-surface dark:bg-[#1e1e1e] text-text dark:text-white rounded-lg text-xs font-medium hover:bg-border-light dark:hover:bg-[#2a2a2a] transition-colors border border-border-light dark:border-[#333] min-h-[44px] md:min-h-0"
            >
              <Upload size={14} />
              Upload Photo
            </button>
          )}
        </div>
      </div>

      {/* Style filter (collapsible) */}
      {showFilters && (
        <div className="flex items-center gap-1 pt-1 overflow-x-auto pb-1">
          <span className="text-[11px] text-muted font-medium mr-2 shrink-0">Style:</span>
          {(['all', 'professional', 'casual', 'creative', 'character'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStyleFilter(s)}
              className={`px-2.5 py-1.5 md:py-1 text-[11px] font-medium rounded-md transition-all capitalize shrink-0 min-h-[44px] md:min-h-0 ${
                styleFilter === s
                  ? 'bg-accent/10 text-accent border border-accent/20'
                  : 'bg-surface dark:bg-[#1e1e1e] text-muted hover:text-text dark:hover:text-white'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Grid */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {filtered.map((avatar) => (
            <AvatarCard
              key={avatar.id}
              avatar={avatar}
              isSelected={selectedId === avatar.id}
              onSelect={() => onSelect(avatar.id)}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Search size={24} className="text-muted mb-2" />
          <p className="text-sm text-muted">No avatars match your filters</p>
          <button
            type="button"
            onClick={() => { setSearch(''); setGenderFilter('all'); setStyleFilter('all'); }}
            className="mt-2 text-xs text-primary hover:underline min-h-[44px] md:min-h-0"
          >
            Clear filters
          </button>
        </div>
      )}

      {/* Count */}
      <p className="text-[11px] text-muted text-center">
        {filtered.length} of {avatars.length} avatar{avatars.length !== 1 ? 's' : ''}
      </p>
    </div>
  );
}
