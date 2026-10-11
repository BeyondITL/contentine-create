'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Image as ImageIcon,
  Sparkles,
  Loader2,
  RefreshCw,
  Upload,
  Check,
  Wand2,
  AlertCircle,
  Download,
  Search,
  Plus,
  ExternalLink,
  Lock,
  Unlock,
  Dice5,
  AlertTriangle,
  UserCircle,
} from 'lucide-react';
import { useEditorStore } from '@/stores/editor-store';
import { useStockStore } from '@/stores/stock-store';
import { useAvatarStore } from '@/stores/avatar-store';
import type { StockItem } from '@/stores/stock-store';
import { IMAGE_GEN_ENABLED } from '@/lib/model-catalog';

type VisualMode = 'ai_visuals' | 'stock' | 'upload';

/** Check if WebGPU is available in this browser. */
async function checkWebGPU(): Promise<boolean> {
  if (typeof navigator === 'undefined') return false;
  if (!('gpu' in navigator)) return false;
  try {
    const adapter = await (navigator as any).gpu.requestAdapter();
    return !!adapter;
  } catch {
    return false;
  }
}

/** Step 2 — Visuals: generate/upload images for each scene. */
export default function VisualsStep() {
  const {
    scenes,
    updateScene,
    generateImage,
    generateAllImages,
    generatingImageIds,
    imageProgress,
    imageErrors,
    seedLocked,
    imageSeed,
    setSeedLocked,
    setImageSeed,
    randomizeSeed,
  } = useEditorStore();

  // Default to Stock when on-device AI images are gated off, so URL→video lands
  // on the source that actually produces visuals (AI needs a DALL-E key when off).
  const [mode, setMode] = useState<VisualMode>(IMAGE_GEN_ENABLED ? 'ai_visuals' : 'stock');
  const [webGpuAvailable, setWebGpuAvailable] = useState<boolean | null>(null);
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);

  // Active character anchor (F-6/F-34): if one is selected, it's folded into
  // every AI-generated scene so the same character recurs. Read for display only.
  const activeCharacter = useAvatarStore((s) =>
    (s.characters ?? []).find((c) => c.id === s.selectedCharacterId) ?? null
  );

  const allHaveImages = scenes.every((s) => s.image_url);
  const someGenerating = generatingImageIds.size > 0;

  useEffect(() => {
    checkWebGPU().then(setWebGpuAvailable);
  }, []);

  /** Generate images for all scenes sequentially. */
  const handleGenerateAll = useCallback(async () => {
    setIsGeneratingAll(true);
    try {
      await generateAllImages();
    } finally {
      setIsGeneratingAll(false);
    }
  }, [generateAllImages]);

  /** Dismiss an error for a specific scene. */
  const dismissError = useCallback(
    (sceneId: string) => {
      useEditorStore.setState((s) => {
        const next = new Map(s.imageErrors);
        next.delete(sceneId);
        return { imageErrors: next };
      });
    },
    []
  );

  return (
    <div className="space-y-5">
      {/* Style mode selector */}
      <div>
        <h3 className="text-sm font-semibold text-text dark:text-white mb-3">Visual Source</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {([
            { key: 'ai_visuals' as const, label: 'AI Generated', desc: IMAGE_GEN_ENABLED ? 'SD Turbo (on-device) or DALL-E' : 'Needs a DALL-E API key', icon: <Sparkles size={18} className="text-[#F3A6FF]" /> },
            { key: 'stock' as const, label: 'Stock Footage', desc: 'Free & open-licensed', icon: <ImageIcon size={18} className="text-primary" /> },
            { key: 'upload' as const, label: 'Upload Your Own', desc: 'Custom images/video', icon: <Upload size={18} className="text-secondary" /> },
          ]).map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setMode(opt.key)}
              className={`
                flex flex-col items-center gap-2 p-4 min-h-[44px] rounded-xl border-2 text-center transition-all
                ${mode === opt.key
                  ? 'border-primary bg-primary-bg dark:bg-primary/10'
                  : 'border-border-light dark:border-[#333] hover:border-border dark:hover:border-[#555]'
                }
              `}
            >
              {opt.icon}
              <span className="text-sm font-medium text-text dark:text-white">{opt.label}</span>
              <span className="text-[11px] text-muted">{opt.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* WebGPU not supported notice */}
      {mode === 'ai_visuals' && webGpuAvailable === false && (
        <div className="flex items-start gap-3 p-3 rounded-lg bg-warning/10 border border-warning/30">
          <AlertCircle size={18} className="text-warning mt-0.5 shrink-0" />
          <div className="text-xs text-text dark:text-white">
            <p className="font-semibold mb-1">WebGPU not available</p>
            <p className="text-muted">
              Browser-native SD Turbo image generation requires WebGPU (Chrome 121+, Edge 121+).
              Images will be generated via the DALL-E API if configured. Otherwise, upload your own visuals.
            </p>
          </div>
        </div>
      )}

      {/* Generate all button */}
      {mode === 'ai_visuals' && (
        <button
          type="button"
          onClick={handleGenerateAll}
          disabled={allHaveImages || someGenerating || isGeneratingAll}
          className="flex items-center gap-2 px-4 py-2.5 min-h-[44px] md:min-h-0 bg-[#F3A6FF] hover:bg-[#F3A6FF]/80 text-dark rounded-lg text-sm font-medium transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {someGenerating || isGeneratingAll ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Generating {generatingImageIds.size} image{generatingImageIds.size !== 1 ? 's' : ''}...
            </>
          ) : allHaveImages ? (
            <>
              <Check size={16} className="text-secondary" />
              All scenes have visuals
            </>
          ) : (
            <>
              <Wand2 size={16} />
              <span className="text-[#F3A6FF] font-bold mr-0.5" aria-hidden="true">&#10022;</span>
              Generate All Images
            </>
          )}
        </button>
      )}

      {/* Seed-lock control (Law L6) — reproducible on-device SD-Turbo images */}
      {mode === 'ai_visuals' && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-xl border border-border-light dark:border-[#333] bg-surface dark:bg-[#1e1e1e]">
          <button
            type="button"
            onClick={() => setSeedLocked(!seedLocked)}
            aria-pressed={seedLocked}
            className={`flex items-center gap-1.5 px-3 py-1.5 min-h-[40px] rounded-lg text-xs font-medium transition-all ${
              seedLocked
                ? 'bg-primary/10 text-primary border border-primary/30'
                : 'bg-white dark:bg-[#151515] text-muted border border-border-light dark:border-[#333] hover:text-text dark:hover:text-white'
            }`}
          >
            {seedLocked ? <Lock size={14} /> : <Unlock size={14} />}
            {seedLocked ? 'Seed locked' : 'Lock seed'}
          </button>

          <div className={`flex items-center gap-2 flex-1 transition-opacity ${seedLocked ? '' : 'opacity-40 pointer-events-none'}`}>
            <label htmlFor="image-seed" className="text-[11px] text-muted whitespace-nowrap">Seed</label>
            <input
              id="image-seed"
              type="number"
              min={0}
              value={imageSeed}
              onChange={(e) => setImageSeed(parseInt(e.target.value, 10) || 0)}
              className="w-32 px-2 py-1.5 min-h-[40px] rounded-lg border border-border-light dark:border-[#444] bg-white dark:bg-[#151515] text-xs text-text dark:text-white focus:outline-none focus:ring-1 focus:ring-primary/30"
            />
            <button
              type="button"
              onClick={randomizeSeed}
              className="flex items-center gap-1 px-2.5 py-1.5 min-h-[40px] rounded-lg bg-white dark:bg-[#151515] border border-border-light dark:border-[#333] text-xs text-muted hover:text-text dark:hover:text-white transition-colors"
              title="Pick a new random seed"
            >
              <Dice5 size={14} />
              Randomize
            </button>
          </div>

          <p className="text-[10px] text-muted sm:max-w-[220px] leading-snug">
            {seedLocked
              ? 'Same seed + prompt reproduces the same on-device image every time. The DALL-E API path ignores the seed.'
              : 'Unlocked: each generation uses a fresh random seed.'}
          </p>
        </div>
      )}

      {/* Active character anchor — folded into every AI-generated scene (F-6/F-34) */}
      {mode === 'ai_visuals' && activeCharacter && (
        <div className="flex items-center gap-2.5 p-3 rounded-xl border border-secondary/20 bg-secondary/[0.04]">
          <div className="w-8 h-8 rounded-full bg-secondary/10 text-secondary flex items-center justify-center shrink-0 overflow-hidden">
            {activeCharacter.photo_path ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={activeCharacter.photo_path} alt="" className="w-full h-full object-cover" />
            ) : (
              <UserCircle size={16} />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-text dark:text-white truncate">
              Character: {activeCharacter.name}
            </p>
            <p className="text-[10px] text-muted leading-snug">
              {seedLocked
                ? 'Kept in every scene via prompt. Your locked seed overrides the character seed.'
                : 'Kept in every scene via prompt + a locked identity seed on the on-device path.'}
            </p>
          </div>
        </div>
      )}

      {/* Stock media inline search panel */}
      {mode === 'stock' && <StockMediaPanel />}

      {/* Scene image grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {scenes.map((scene, i) => {
          const isGenerating = generatingImageIds.has(scene.id);
          const progress = imageProgress.get(scene.id);
          const error = imageErrors.get(scene.id);

          return (
            <div
              key={scene.id}
              className="bg-white dark:bg-[#1e1e1e] rounded-xl border border-border-light dark:border-[#333] overflow-hidden"
            >
              {/* Image area */}
              <div className="aspect-video bg-surface dark:bg-[#151515] relative">
                {scene.image_url ? (
                  <div className="relative w-full h-full group">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={scene.image_url}
                      alt={`Scene ${i + 1}`}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={() => generateImage(scene.id)}
                        disabled={isGenerating}
                        className="p-3 md:p-2 rounded-full bg-white/90 text-text hover:bg-white transition-colors"
                        title="Regenerate with AI"
                      >
                        <RefreshCw size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => updateScene(scene.id, { image_url: undefined })}
                        className="p-3 md:p-2 rounded-full bg-white/90 text-danger hover:bg-white transition-colors"
                        title="Remove"
                      >
                        <ImageIcon size={16} />
                      </button>
                    </div>
                  </div>
                ) : isGenerating ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-4">
                    {/* Progress indicator */}
                    {progress !== undefined && progress > 0 ? (
                      <>
                        <Download size={20} className="text-[#F3A6FF] animate-bounce" />
                        <span className="text-xs text-muted text-center">
                          Downloading AI Image Model...
                        </span>
                        <div className="w-full max-w-[200px] h-2 rounded-full bg-border-light dark:bg-[#333] overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-300"
                            style={{
                              width: `${Math.round(progress * 100)}%`,
                              background: 'linear-gradient(90deg, #00C3FF, #F3A6FF)',
                            }}
                          />
                        </div>
                        <span className="text-[11px] text-muted">{Math.round(progress * 100)}% (~250MB)</span>
                      </>
                    ) : (
                      <>
                        <Loader2 size={24} className="text-[#F3A6FF] animate-spin" />
                        <span className="text-xs text-muted">Generating visual...</span>
                      </>
                    )}
                  </div>
                ) : error ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4">
                    <AlertCircle size={22} className="text-danger shrink-0" />
                    <p className="text-xs text-danger text-center leading-snug max-w-[220px]">
                      {error.includes('WebGPU') || error.includes('DALL-E') || error.includes('Configure')
                        ? error
                        : 'Image generation failed. Configure a DALL-E API key in Admin, or ensure WebGPU is supported.'}
                    </p>
                    <div className="flex gap-2 mt-1">
                      <button
                        type="button"
                        onClick={() => generateImage(scene.id)}
                        className="px-3 py-1 min-h-[36px] bg-[#F3A6FF]/10 text-[#F3A6FF] text-xs font-medium rounded-full hover:bg-[#F3A6FF]/20 transition-colors"
                      >
                        Retry
                      </button>
                      <button
                        type="button"
                        onClick={() => dismissError(scene.id)}
                        className="px-3 py-1 min-h-[36px] bg-surface dark:bg-[#333] text-muted text-xs font-medium rounded-full hover:bg-border-light dark:hover:bg-[#444] transition-colors"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                    <ImageIcon size={24} className="text-muted" />
                    <span className="text-xs text-muted">No image yet</span>
                    {scene.visual_prompt && mode === 'ai_visuals' && (
                      <button
                        type="button"
                        onClick={() => generateImage(scene.id)}
                        className="mt-1 flex items-center gap-1.5 px-3 py-1 min-h-[44px] md:min-h-0 bg-[#F3A6FF]/10 text-[#F3A6FF] text-xs font-medium rounded-full hover:bg-[#F3A6FF]/20 transition-colors"
                      >
                        <Sparkles size={12} />
                        <span className="font-bold mr-0.5" aria-hidden="true">&#10022;</span>
                        Generate with AI
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Caption */}
              <div className="p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-text dark:text-white">Scene {i + 1}</span>
                  <span className="text-[11px] text-muted">~{scene.duration}s</span>
                </div>
                <p className="text-xs text-muted line-clamp-2">
                  {scene.visual_prompt || 'No visual prompt -- add one in the Script step'}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Compact inline stock media search panel for the video editor. */
function StockMediaPanel() {
  const {
    query,
    results,
    isSearching,
    searchError,
    totalResults,
    isDemoFallback,
    setQuery,
    search,
    clearResults,
  } = useStockStore();
  const { updateScene, scenes } = useEditorStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedSceneId, setSelectedSceneId] = useState<string>(scenes[0]?.id || '');

  const handleSearch = useCallback(() => {
    if (query.trim()) {
      // Force media type to photo for visuals
      useStockStore.setState({ mediaType: 'photo', source: 'all' });
      search();
    }
  }, [query, search]);

  /** Apply a stock image to the currently selected scene. */
  const handleApplyToScene = useCallback(
    (item: StockItem) => {
      if (!selectedSceneId) return;
      updateScene(selectedSceneId, { image_url: item.preview_url || item.download_url });
    },
    [selectedSceneId, updateScene]
  );

  return (
    <div className="rounded-xl border border-border-light dark:border-[#333] bg-white dark:bg-[#1e1e1e] overflow-hidden">
      {/* Search bar */}
      <div className="p-3 border-b border-border-light dark:border-[#333]">
        <div className="flex items-center gap-2 mb-2">
          <ImageIcon size={14} className="text-primary shrink-0" />
          <h4 className="text-[12px] font-semibold text-text dark:text-white">
            Stock Photos
          </h4>
          <span className="text-[10px] text-text-muted ml-auto">Openverse &amp; more</span>
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Search stock photos..."
              className="w-full pl-8 pr-3 py-2 min-h-[40px] rounded-lg border border-border-light dark:border-[#444] bg-surface dark:bg-[#2a2a2a] text-[12px] text-text dark:text-white placeholder:text-text-muted/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
            />
          </div>
          <button
            type="button"
            onClick={handleSearch}
            disabled={!query.trim() || isSearching}
            className="px-3 py-2 min-h-[40px] rounded-lg bg-[#0A0A0A] dark:bg-white text-white dark:text-[#0A0A0A] text-[11px] font-semibold disabled:opacity-40 transition-all cursor-pointer"
          >
            {isSearching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
          </button>
        </div>

        {/* Scene selector */}
        {scenes.length > 1 && (
          <div className="mt-2">
            <label className="text-[10px] text-text-muted mb-1 block">Apply to scene:</label>
            <select
              value={selectedSceneId}
              onChange={(e) => setSelectedSceneId(e.target.value)}
              className="w-full py-1.5 px-2 rounded-md border border-border-light dark:border-[#444] bg-surface dark:bg-[#2a2a2a] text-[11px] text-text dark:text-white cursor-pointer appearance-none"
            >
              {scenes.map((s, i) => (
                <option key={s.id} value={s.id}>Scene {i + 1}{s.image_url ? ' (has image)' : ''}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Results area */}
      <div className="max-h-[280px] overflow-y-auto">
        {isSearching && (
          <div className="grid grid-cols-3 gap-1.5 p-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="aspect-video bg-black/[0.04] dark:bg-white/[0.06] rounded animate-pulse" />
            ))}
          </div>
        )}

        {!isSearching && searchError && (
          <div className="p-4 text-center">
            <AlertCircle size={18} className="text-danger mx-auto mb-1" />
            <p className="text-[11px] text-text-muted">{searchError.split('\n')[0]}</p>
          </div>
        )}

        {!isSearching && !searchError && results.length === 0 && query.trim() && (
          <div className="p-6 text-center">
            <Search size={18} className="text-text-muted mx-auto mb-1" />
            <p className="text-[11px] text-text-muted">No photos found. Try different keywords.</p>
          </div>
        )}

        {!isSearching && !searchError && results.length === 0 && !query.trim() && (
          <div className="p-6 text-center">
            <ImageIcon size={18} className="text-text-muted mx-auto mb-1" />
            <p className="text-[11px] text-text-muted">Search for stock photos to use in your video scenes.</p>
          </div>
        )}

        {!isSearching && results.length > 0 && (
          <>
            {/* Demo fallback label — mirrors app/stock-media (offline placeholder data) */}
            {isDemoFallback && (
              <div className="flex items-center gap-2 px-3 pt-3">
                <AlertTriangle size={12} className="text-warning shrink-0" />
                <span className="text-[10px] font-medium text-text-muted dark:text-[#888]">
                  demo items — offline
                </span>
              </div>
            )}
            <div className="grid grid-cols-3 gap-1.5 p-3">
              {results.slice(0, 12).map((item) => (
                <button
                  key={`${item.source}-${item.id}`}
                  type="button"
                  onClick={() => handleApplyToScene(item)}
                  className="relative aspect-video rounded-md overflow-hidden group cursor-pointer focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
                  title={`${item.title} - Click to apply to selected scene`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.preview_url}
                    alt={item.title}
                    loading="lazy"
                    className="w-full h-full object-cover transition-transform group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                    <Plus size={16} className="text-white" />
                  </div>
                  <span
                    className="absolute bottom-0.5 left-0.5 text-[8px] px-1 py-px rounded bg-black/60 text-white/80 capitalize"
                  >
                    {item.source}
                  </span>
                </button>
              ))}
            </div>
            {totalResults > 12 && (
              <div className="px-3 pb-3">
                <a
                  href="/stock-media"
                  className="flex items-center justify-center gap-1 py-1.5 rounded-md bg-surface dark:bg-[#2a2a2a] text-[11px] text-primary font-medium hover:bg-primary/5 transition-colors"
                >
                  <ExternalLink size={11} />
                  Browse all {(totalResults ?? 0).toLocaleString()} results
                </a>
              </div>
            )}
          </>
        )}
      </div>

      {/* Attribution — surface the source each provider's terms expect (Pexels requires a visible link). */}
      <div className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5 px-3 py-2 border-t border-border-light dark:border-[#333] text-[10px] text-text-muted">
        <span>Photos via</span>
        <a href="https://openverse.org" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Openverse</a>
        <span>,</span>
        <a href="https://www.pexels.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Pexels</a>
        <span>&amp;</span>
        <a href="https://pixabay.com" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-primary hover:underline">
          Pixabay <ExternalLink size={9} />
        </a>
      </div>
    </div>
  );
}
