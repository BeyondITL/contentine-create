'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Megaphone, Settings, Star, Check } from 'lucide-react';
import { useScheduleStore } from '@/stores/schedule-store';
import type { CTATemplate } from '@/types';

interface CTATemplateSelectProps {
  value: number | null;
  onChange: (id: number | null) => void;
  onManageClick?: () => void;
  className?: string;
}

/** Dropdown selector for CTA templates with preview and "Manage Templates" link. */
export default function CTATemplateSelect({
  value,
  onChange,
  onManageClick,
  className = '',
}: CTATemplateSelectProps) {
  const { ctaTemplates, fetchCTATemplates } = useScheduleStore();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ctaTemplates.length === 0) {
      fetchCTATemplates().catch(() => {});
    }
  }, [ctaTemplates.length, fetchCTATemplates]);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Sort: default first, then alphabetical
  const sorted = [...ctaTemplates].sort((a, b) => {
    if (a.is_default && !b.is_default) return -1;
    if (!a.is_default && b.is_default) return 1;
    return a.name.localeCompare(b.name);
  });

  const selectedTemplate = value ? ctaTemplates.find((t) => t.id === value) : null;

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <label className="block text-[12px] font-medium text-text dark:text-[#E0E0E0] mb-1.5">
        CTA Template (optional)
      </label>

      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3.5 py-2.5 min-h-[44px] text-[16px] md:text-[13px] rounded-xl bg-white dark:bg-dark-secondary text-text dark:text-[#E0E0E0] border border-black/[0.08] dark:border-white/[0.08] focus:outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary/30 transition-all duration-200 cursor-pointer"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Megaphone className="w-4 h-4 text-text-muted/50 shrink-0" />
          <span className={`truncate ${selectedTemplate ? '' : 'text-text-muted/40'}`}>
            {selectedTemplate ? selectedTemplate.name : 'None'}
          </span>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-text-muted/40 shrink-0 transition-transform duration-200 ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* Preview of selected template */}
      {selectedTemplate && (
        <div className="mt-2 px-3 py-2 rounded-lg bg-accent/[0.04] dark:bg-accent/[0.08] border border-accent/10">
          <p className="text-[11px] text-text-muted leading-relaxed line-clamp-2">
            {selectedTemplate.cta_text}
          </p>
        </div>
      )}

      {/* Dropdown */}
      {open && (
        <div className="absolute z-40 w-full mt-1 bg-white dark:bg-[#1e1e1e] rounded-xl border border-black/[0.08] dark:border-white/[0.08] shadow-lg overflow-hidden animate-[fadeIn_150ms_ease-out]">
          <div className="max-h-[240px] overflow-y-auto">
            {/* None option */}
            <button
              type="button"
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
              className="w-full flex items-center gap-2 px-4 py-2.5 min-h-[44px] md:min-h-0 text-[12px] text-left hover:bg-surface dark:hover:bg-[#252525] transition-colors cursor-pointer"
            >
              <span className="w-4 h-4 flex items-center justify-center shrink-0">
                {value === null && <Check className="w-3.5 h-3.5 text-primary" />}
              </span>
              <span className="text-text-muted">None</span>
            </button>

            {sorted.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  onChange(t.id);
                  setOpen(false);
                }}
                className="w-full flex items-start gap-2 px-4 py-2.5 min-h-[44px] md:min-h-0 text-left hover:bg-surface dark:hover:bg-[#252525] transition-colors cursor-pointer"
              >
                <span className="w-4 h-4 flex items-center justify-center shrink-0 mt-0.5">
                  {value === t.id && <Check className="w-3.5 h-3.5 text-primary" />}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[12px] font-medium text-text dark:text-[#E0E0E0] truncate">
                      {t.name}
                    </span>
                    {t.is_default && (
                      <Star className="w-3 h-3 text-warning shrink-0" fill="currentColor" />
                    )}
                  </div>
                  <p className="text-[10px] text-text-muted truncate mt-0.5">
                    {t.cta_text}
                  </p>
                </div>
              </button>
            ))}
          </div>

          {/* Manage Templates link */}
          {onManageClick && (
            <div className="border-t border-black/[0.04] dark:border-white/[0.06]">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onManageClick();
                }}
                className="w-full flex items-center gap-2 px-4 py-2.5 min-h-[44px] md:min-h-0 text-[11px] font-medium text-primary hover:bg-primary/[0.04] transition-colors cursor-pointer"
              >
                <Settings className="w-3.5 h-3.5" />
                Manage Templates
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
