'use client';

import { useState, useMemo } from 'react';
import { SlidersHorizontal, Search } from 'lucide-react';
import { useModelStore, type AIModel } from '@/stores/model-store';
import ModelCard from './ModelCard';

type CategoryFilter = AIModel['category'] | 'all';
type SortMode = 'recommended' | 'size' | 'status';

const CATEGORIES: { id: CategoryFilter; label: string }[] = [
  { id: 'all', label: 'All Models' },
  { id: 'llm', label: 'LLM' },
  { id: 'tts', label: 'TTS' },
  { id: 'image', label: 'Image' },
  { id: 'lipsync', label: 'Lip-Sync' },
  { id: 'stt', label: 'STT' },
  { id: 'voiceclone', label: 'Voice Clone' },
];

const SORT_OPTIONS: { id: SortMode; label: string }[] = [
  { id: 'recommended', label: 'Recommended' },
  { id: 'size', label: 'Largest first' },
  { id: 'status', label: 'Status' },
];

const STATUS_ORDER: Record<string, number> = {
  downloading: 0,
  error: 1,
  not_downloaded: 2,
  downloaded: 3,
  ready: 4,
};

/** Filterable/sortable model grid — app-store quality layout with staggered entrance. */
export default function ModelGrid() {
  const { models, downloadModel, cancelDownload, deleteModel } = useModelStore();
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [sort, setSort] = useState<SortMode>('recommended');

  const filtered = useMemo(() => {
    const base = category === 'all' ? [...models] : models.filter((m) => m.category === category);
    base.sort((a, b) => {
      if (sort === 'recommended') {
        if (a.isRecommended !== b.isRecommended) return a.isRecommended ? -1 : 1;
        return (STATUS_ORDER[a.status] || 99) - (STATUS_ORDER[b.status] || 99);
      }
      if (sort === 'size') return b.sizeBytes - a.sizeBytes;
      if (sort === 'status') return (STATUS_ORDER[a.status] || 99) - (STATUS_ORDER[b.status] || 99);
      return 0;
    });
    return base;
  }, [models, category, sort]);

  return (
    <div>
      {/* ── Filter + Sort toolbar ── */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
        {/* Category pills — horizontal scroll on mobile */}
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide -mx-1 px-1 pb-1 sm:pb-0">
          {CATEGORIES.map((cat) => {
            const count = cat.id === 'all' ? models.length : models.filter((m) => m.category === cat.id).length;
            const isActive = category === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setCategory(cat.id)}
                className={`
                  flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[11.5px] font-semibold whitespace-nowrap
                  transition-all duration-200 cursor-pointer shrink-0 active:scale-[0.97]
                  focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none
                  ${isActive
                    ? 'bg-[#0A0A0A] dark:bg-white text-white dark:text-[#0A0A0A] shadow-sm shadow-black/10'
                    : 'bg-black/[0.03] dark:bg-white/[0.06] text-text-secondary dark:text-white/60 hover:text-text dark:hover:text-white hover:bg-black/[0.06] dark:hover:bg-white/[0.1]'}
                `}
              >
                {cat.label}
                <span className={`
                  text-[9px] font-bold tabular-nums min-w-[14px] text-center
                  ${isActive ? 'text-white/50 dark:text-[#0A0A0A]/50' : 'text-text-muted/40 dark:text-white/30'}
                `}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Sort controls */}
        <div className="flex items-center gap-2 sm:ml-auto shrink-0">
          <SlidersHorizontal className="w-3.5 h-3.5 text-text-muted/40 dark:text-white/25" strokeWidth={1.5} />
          {SORT_OPTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => setSort(s.id)}
              className={`
                text-[10.5px] font-semibold px-2.5 py-1.5 rounded-lg transition-all duration-200 cursor-pointer
                active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none
                ${sort === s.id
                  ? 'text-primary bg-primary/[0.07] dark:bg-primary/[0.12]'
                  : 'text-text-muted/50 dark:text-white/35 hover:text-text-secondary dark:hover:text-white/60 hover:bg-black/[0.03] dark:hover:bg-white/[0.04]'}
              `}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Model grid — staggered entrance animation ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((model, i) => (
          <div
            key={model.id}
            className="animate-fade-in-up"
            style={{ animationDelay: `${i * 50}ms` }}
          >
            <ModelCard
              model={model}
              onDownload={downloadModel}
              onCancel={cancelDownload}
              onDelete={deleteModel}
            />
          </div>
        ))}
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 animate-fade-in">
          <div className="w-12 h-12 rounded-2xl bg-black/[0.03] dark:bg-white/[0.06] flex items-center justify-center mb-4">
            <Search className="w-5 h-5 text-text-muted/40 dark:text-white/25" strokeWidth={1.5} />
          </div>
          <p className="text-[14px] font-semibold text-text dark:text-white mb-1">No models found</p>
          <p className="text-[12px] text-text-muted dark:text-white/50">
            No models match the selected category.
          </p>
        </div>
      )}
    </div>
  );
}
