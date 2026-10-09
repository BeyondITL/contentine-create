'use client';

import { useState, useMemo } from 'react';
import { Search, Check, ChevronDown, ChevronUp, X } from 'lucide-react';
import IndustryIcon from './IndustryIcon';
import industryPrompts from '@/data/industry-prompts.json';

/** Shape of prompts returned for a selected industry. */
export interface IndustryPrompts {
  script: string;
  remix: string;
  thumbnail: string;
  caption: string;
}

/** Single industry entry from the data file. */
interface IndustryEntry {
  id: string;
  industry: string;
  icon: string;
  description: string;
  prompts: IndustryPrompts;
}

interface IndustryPromptSelectorProps {
  /** Callback fired when an industry is selected, with its prompt templates. */
  onSelect: (prompts: IndustryPrompts) => void;
  /** Currently selected industry ID. */
  selectedId?: string;
}

/** Reusable industry selector — dropdown on mobile, grid of mini cards on desktop. */
export default function IndustryPromptSelector({ onSelect, selectedId }: IndustryPromptSelectorProps) {
  const [query, setQuery] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);

  const data = industryPrompts as IndustryEntry[];

  const filtered = useMemo(() => {
    if (!query.trim()) return data;
    const q = query.toLowerCase();
    return data.filter(
      (entry) =>
        entry.industry.toLowerCase().includes(q) ||
        entry.description.toLowerCase().includes(q)
    );
  }, [data, query]);

  const selectedEntry = data.find((e) => e.id === selectedId);

  function handleSelect(entry: IndustryEntry) {
    onSelect(entry.prompts);
    setMobileOpen(false);
    setQuery('');
  }

  return (
    <div className="w-full">
      {/* ── Mobile: Collapsible dropdown ── */}
      <div className="md:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(!mobileOpen)}
          className="
            w-full flex items-center justify-between gap-3
            px-3.5 py-3 min-h-[44px] rounded-xl
            border border-black/[0.08] dark:border-white/[0.08]
            bg-white dark:bg-dark-secondary
            text-left transition-all duration-200
            focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none
            cursor-pointer
          "
          aria-expanded={mobileOpen}
          aria-haspopup="listbox"
        >
          {selectedEntry ? (
            <span className="flex items-center gap-2.5 min-w-0">
              <span className="shrink-0 w-8 h-8 rounded-lg bg-primary-bg dark:bg-primary/10 flex items-center justify-center">
                <IndustryIcon name={selectedEntry.icon} size={16} className="text-primary" />
              </span>
              <span className="truncate text-[14px] font-medium text-text dark:text-[#E0E0E0]">
                {selectedEntry.industry}
              </span>
            </span>
          ) : (
            <span className="text-[14px] text-text-muted/50">Select your industry</span>
          )}
          {mobileOpen ? (
            <ChevronUp size={18} className="text-text-muted shrink-0" />
          ) : (
            <ChevronDown size={18} className="text-text-muted shrink-0" />
          )}
        </button>

        {mobileOpen && (
          <div className="mt-2 bento-card overflow-hidden animate-fade-in">
            {/* Search */}
            <div className="p-3 border-b border-black/[0.05] dark:border-white/[0.05]">
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted/40" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search industries..."
                  className="input-field w-full pl-9 pr-9"
                  aria-label="Search industries"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 min-w-[44px] min-h-[44px] flex items-center justify-center text-text-muted/40 hover:text-text-muted cursor-pointer"
                    aria-label="Clear search"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>

            {/* List */}
            <div className="max-h-[320px] overflow-y-auto scrollbar-hide" role="listbox">
              {filtered.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <p className="text-[13px] text-text-muted">No industries match your search.</p>
                </div>
              ) : (
                filtered.map((entry) => {
                  const isSelected = entry.id === selectedId;
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => handleSelect(entry)}
                      className={`
                        w-full flex items-center gap-3 px-4 py-3 min-h-[44px]
                        text-left transition-colors duration-150 cursor-pointer
                        ${isSelected
                          ? 'bg-primary-bg dark:bg-primary/10'
                          : 'hover:bg-surface dark:hover:bg-white/[0.03]'
                        }
                      `}
                    >
                      <span className={`
                        shrink-0 w-8 h-8 rounded-lg flex items-center justify-center
                        ${isSelected
                          ? 'bg-primary/15 dark:bg-primary/20'
                          : 'bg-surface dark:bg-white/[0.06]'
                        }
                      `}>
                        <IndustryIcon
                          name={entry.icon}
                          size={16}
                          className={isSelected ? 'text-primary' : 'text-text-muted'}
                        />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-[13px] font-medium text-text dark:text-[#E0E0E0] truncate">
                          {entry.industry}
                        </span>
                        <span className="block text-[11px] text-text-muted truncate">
                          {entry.description}
                        </span>
                      </span>
                      {isSelected && (
                        <Check size={16} className="shrink-0 text-primary" />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Desktop: Search + grid of mini cards ── */}
      <div className="hidden md:block">
        {/* Search */}
        <div className="relative mb-3">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted/40" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search industries..."
            className="input-field w-full pl-9 pr-9"
            aria-label="Search industries"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-muted/40 hover:text-text-muted cursor-pointer rounded-md focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Grid */}
        <div className="max-h-[400px] overflow-y-auto scrollbar-hide pr-1">
          {filtered.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-[13px] text-text-muted">No industries match your search.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
              {filtered.map((entry) => {
                const isSelected = entry.id === selectedId;
                return (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => handleSelect(entry)}
                    className={`
                      group relative flex flex-col items-start gap-2 p-3 rounded-xl
                      text-left transition-all duration-200 cursor-pointer
                      border focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none
                      ${isSelected
                        ? 'border-primary/30 bg-primary-bg dark:bg-primary/10 ring-1 ring-primary/10'
                        : 'border-black/[0.05] dark:border-white/[0.05] bg-white dark:bg-dark-secondary hover:border-black/[0.1] dark:hover:border-white/[0.1] hover:-translate-y-[1px]'
                      }
                    `}
                    aria-pressed={isSelected}
                  >
                    {/* Checkmark */}
                    {isSelected && (
                      <span className="absolute top-2 right-2">
                        <Check size={14} className="text-primary" />
                      </span>
                    )}

                    {/* Icon */}
                    <span className={`
                      w-8 h-8 rounded-lg flex items-center justify-center
                      ${isSelected
                        ? 'bg-primary/15 dark:bg-primary/20'
                        : 'bg-surface dark:bg-white/[0.06] group-hover:bg-primary-bg dark:group-hover:bg-primary/10'
                      }
                    `}>
                      <IndustryIcon
                        name={entry.icon}
                        size={16}
                        className={`transition-colors ${isSelected ? 'text-primary' : 'text-text-muted group-hover:text-primary'}`}
                      />
                    </span>

                    {/* Text */}
                    <span className="w-full min-w-0">
                      <span className="block text-[12px] font-semibold text-text dark:text-[#E0E0E0] truncate">
                        {entry.industry}
                      </span>
                      <span className="block text-[10px] text-text-muted leading-snug line-clamp-2 mt-0.5">
                        {entry.description}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
