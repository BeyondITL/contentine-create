'use client';

import { Download, Check, Trash2, X, AlertTriangle, Brain, Volume2, Image, Scan, Mic, Copy, RefreshCw } from 'lucide-react';
import type { AIModel } from '@/stores/model-store';
import { formatBytes, isInFlight } from '@/stores/model-store';
import { useDeviceStore } from '@/stores/device-store';
import type { LucideIcon } from 'lucide-react';

/** Professional Lucide icons per model category — NO emoji. */
const CATEGORY_CONFIG: Record<AIModel['category'], { icon: LucideIcon; label: string; color: string; bg: string; gradient: string }> = {
  llm:        { icon: Brain,   label: 'LLM',         color: 'text-primary',    bg: 'bg-primary/[0.07] dark:bg-primary/[0.14]',    gradient: 'from-primary/80 to-primary' },
  tts:        { icon: Volume2, label: 'TTS',         color: 'text-secondary',  bg: 'bg-secondary/[0.07] dark:bg-secondary/[0.14]', gradient: 'from-secondary/80 to-secondary' },
  image:      { icon: Image,   label: 'Image Gen',   color: 'text-accent',     bg: 'bg-accent/[0.07] dark:bg-accent/[0.14]',      gradient: 'from-accent/80 to-accent' },
  lipsync:    { icon: Scan,    label: 'Lip-Sync',    color: 'text-warning',    bg: 'bg-warning/[0.07] dark:bg-warning/[0.14]',    gradient: 'from-warning/80 to-warning' },
  stt:        { icon: Mic,     label: 'STT',         color: 'text-info',       bg: 'bg-info/[0.07] dark:bg-info/[0.14]',          gradient: 'from-info/80 to-info' },
  voiceclone: { icon: Copy,    label: 'Voice Clone', color: 'text-[#C084FC]',  bg: 'bg-[#C084FC]/[0.07] dark:bg-[#C084FC]/[0.14]', gradient: 'from-[#C084FC]/80 to-[#C084FC]' },
};

const TIER_ORDER: Record<string, number> = { high: 3, medium: 2, low: 1, unsupported: 0 };

interface ModelCardProps {
  model: AIModel;
  onDownload: (id: string) => void;
  onCancel: (id: string) => void;
  onDelete: (id: string) => void;
}

/** Individual model card for the AI Model Manager — premium app-store style. */
export default function ModelCard({ model, onDownload, onCancel, onDelete }: ModelCardProps) {
  const profile = useDeviceStore((s) => s.profile);
  const cat = CATEGORY_CONFIG[model.category];
  const CatIcon = cat.icon;

  const deviceTier = profile?.tier || 'unsupported';
  const isCompatible = TIER_ORDER[deviceTier] >= TIER_ORDER[model.minTier];
  const isDownloaded = model.status === 'ready';
  const isDownloading = isInFlight(model.status);
  const isError = model.status === 'error';

  /* Honest per-phase progress label (download state machine, C-M2 P0 round two). */
  const phaseLabel =
    model.status === 'queued' ? 'Queued…'
    : model.status === 'finalizing' ? (model.statusText || 'Finalizing — preparing model…')
    : model.status === 'verifying' ? 'Verifying download…'
    : `Downloading${model.downloadProgress > 0 ? ` ${Math.round(model.downloadProgress * 100)}%` : '...'}`;

  return (
    <div
      className={`
        group relative bento-card overflow-hidden transition-all duration-300
        ${model.isRecommended && !isDownloaded && isCompatible ? 'ring-1 ring-primary/15 dark:ring-primary/25 hover:ring-primary/30 dark:hover:ring-primary/40' : ''}
        ${!isCompatible ? 'opacity-70' : ''}
        ${isDownloaded ? 'ring-1 ring-secondary/10 dark:ring-secondary/20' : ''}
      `}
    >
      {/* Ambient glow on recommended cards */}
      {model.isRecommended && !isDownloaded && isCompatible && (
        <div className="absolute -top-12 -right-12 w-32 h-32 bg-gradient-to-br from-primary/[0.04] to-accent/[0.03] dark:from-primary/[0.08] dark:to-accent/[0.06] rounded-full pointer-events-none transition-opacity duration-500 opacity-60 group-hover:opacity-100" />
      )}

      {/* Downloaded success glow */}
      {isDownloaded && (
        <div className="absolute -top-8 -right-8 w-24 h-24 bg-secondary/[0.03] dark:bg-secondary/[0.06] rounded-full pointer-events-none" />
      )}

      {/* Content */}
      <div className="relative p-4 md:p-5">
        {/* Header: Category icon + model info */}
        <div className="flex items-start gap-3.5 mb-4">
          <div className={`w-11 h-11 rounded-[13px] ${cat.bg} flex items-center justify-center shrink-0 transition-transform duration-300 group-hover:scale-105`}>
            <CatIcon className={`w-[19px] h-[19px] ${cat.color}`} strokeWidth={1.5} />
          </div>
          <div className="flex-1 min-w-0 pt-0.5">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-[13.5px] font-semibold text-text dark:text-white truncate leading-tight">{model.name}</h3>
              {model.isRecommended && isCompatible && !isDownloaded && (
                <span className="text-[8px] font-bold text-primary bg-primary/[0.08] dark:bg-primary/[0.15] px-1.5 py-[3px] rounded-[5px] uppercase tracking-[0.08em] shrink-0 leading-none">
                  Best fit
                </span>
              )}
            </div>
            <p className="text-[11.5px] text-text-muted dark:text-white/45 leading-[1.5] line-clamp-2">{model.description}</p>
          </div>
        </div>

        {/* Feature pills */}
        <div className="flex flex-wrap gap-1.5 mb-3.5">
          {model.requiredFor.map((f) => (
            <span
              key={f}
              className="text-[9.5px] font-medium text-text-muted/60 dark:text-white/35 bg-black/[0.025] dark:bg-white/[0.05] px-2 py-[3px] rounded-md leading-none"
            >
              {f}
            </span>
          ))}
        </div>

        {/* Meta row: Size + VRAM + Category */}
        <div className="flex items-center gap-2.5 mb-4">
          <span className="text-[10.5px] font-semibold text-text-secondary dark:text-white/60 bg-black/[0.035] dark:bg-white/[0.07] px-2.5 py-[3px] rounded-md leading-none">
            {formatBytes(model.sizeBytes)}
          </span>
          <span className="text-[10px] text-text-muted/40 dark:text-white/25">
            {model.vramRequiredMB >= 1024 ? `${(model.vramRequiredMB / 1024).toFixed(1)} GB` : `${model.vramRequiredMB} MB`} VRAM
          </span>
          <span className={`ml-auto text-[9px] font-semibold uppercase tracking-[0.06em] ${cat.color} opacity-50`}>
            {cat.label}
          </span>
        </div>

        {/* Divider */}
        <div className="border-t border-black/[0.04] dark:border-white/[0.04] -mx-4 md:-mx-5 mb-4" />

        {/* Status + Action — the interaction zone. Order matters: an in-flight,
            downloaded, or FAILED download always surfaces first — even for a
            device-incompatible model — so an engine error is never swallowed
            behind the "Download Anyway" advisory (C-M2 P0, Law L1/point-4). */}
        {isDownloaded ? (
          /* Downloaded — ready state with re-download and clear cache actions */
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-secondary/[0.08] dark:bg-secondary/[0.15] flex items-center justify-center">
                <Check className="w-3.5 h-3.5 text-secondary" strokeWidth={2.5} />
              </div>
              <span className="text-[12px] font-semibold text-secondary">Ready to use</span>
            </div>
            <div className="flex items-center gap-0.5">
              <button
                onClick={async () => { await onDelete(model.id); onDownload(model.id); }}
                className="p-2 rounded-xl text-text-muted/25 hover:text-primary hover:bg-primary/[0.05] dark:hover:bg-primary/[0.1] transition-all duration-200 active:scale-95"
                aria-label={`Re-download ${model.name}`}
                title="Re-download"
              >
                <RefreshCw className="w-4 h-4" strokeWidth={1.5} />
              </button>
              <button
                onClick={() => onDelete(model.id)}
                className="p-2 -mr-1 rounded-xl text-text-muted/25 hover:text-danger hover:bg-danger/[0.05] dark:hover:bg-danger/[0.1] transition-all duration-200 active:scale-95"
                aria-label={`Remove ${model.name} from cache`}
                title="Clear cache"
              >
                <Trash2 className="w-4 h-4" strokeWidth={1.5} />
              </button>
            </div>
          </div>
        ) : isDownloading ? (
          /* Downloading — progress state */
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
                <span className="text-[11.5px] font-medium text-text-secondary dark:text-white/60 truncate max-w-[200px]">
                  {phaseLabel}
                </span>
              </div>
              <button
                onClick={() => onCancel(model.id)}
                className="p-1.5 rounded-lg text-text-muted/40 hover:text-danger hover:bg-danger/[0.05] transition-all duration-200 active:scale-95"
                aria-label="Cancel download"
                title="Cancel"
              >
                <X className="w-4 h-4" strokeWidth={1.75} />
              </button>
            </div>
            <div className="w-full h-[6px] rounded-full bg-black/[0.04] dark:bg-white/[0.06] overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all duration-500 ease-out"
                style={{ width: `${Math.max(2, Math.round(model.downloadProgress * 100))}%` }}
              />
            </div>
          </div>
        ) : isError ? (
          /* Error state — show the FULL reason (never truncated), so the user
             sees the real requirement, e.g. a WebGPU/GPU-memory shortfall. */
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2 min-w-0">
              <div className="w-5 h-5 rounded-full bg-danger/[0.08] flex items-center justify-center shrink-0 mt-0.5">
                <X className="w-3 h-3 text-danger" strokeWidth={2.5} />
              </div>
              <span className="text-[11px] text-danger/80 font-medium break-words leading-relaxed">
                {model.error || 'Download failed'}
              </span>
            </div>
            <button
              onClick={() => onDownload(model.id)}
              className="text-[11.5px] font-semibold text-primary hover:text-primary-hover px-3 py-1.5 rounded-lg hover:bg-primary/[0.05] transition-all duration-200 active:scale-[0.97] shrink-0"
            >
              Retry
            </button>
          </div>
        ) : !isCompatible ? (
          /* Incompatible (pristine) — advisory warning with override download */
          <div>
            <div className="flex items-center gap-2 mb-2.5">
              <AlertTriangle className="w-3.5 h-3.5 text-warning/60 shrink-0" strokeWidth={1.5} />
              <span className="text-[10.5px] text-text-muted/60 dark:text-white/35">
                Requires {model.minTier === 'high' ? 'high-end' : model.minTier} GPU — may be slow on this device
              </span>
            </div>
            <button
              onClick={() => onDownload(model.id)}
              className="
                flex items-center justify-center gap-2 w-full py-2 rounded-xl text-[11.5px] font-semibold
                text-text-muted/60 dark:text-white/40 bg-black/[0.03] dark:bg-white/[0.04]
                hover:bg-black/[0.06] dark:hover:bg-white/[0.08] hover:text-text dark:hover:text-white/70
                transition-all duration-200 active:scale-[0.97] min-h-[36px]
              "
            >
              <Download className="w-3.5 h-3.5" strokeWidth={2} />
              Download Anyway
            </button>
          </div>
        ) : (
          /* Default — download CTA */
          <button
            onClick={() => onDownload(model.id)}
            className={`
              flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-[12.5px] font-semibold
              transition-all duration-200 active:scale-[0.97] min-h-[40px]
              ${model.isRecommended
                ? 'bg-[#0A0A0A] dark:bg-white text-white dark:text-[#0A0A0A] hover:bg-[#1A1A1A] dark:hover:bg-[#E8E8E8] shadow-sm shadow-black/10'
                : 'text-primary bg-primary/[0.06] hover:bg-primary/[0.1] dark:bg-primary/[0.08] dark:hover:bg-primary/[0.14]'}
            `}
          >
            <Download className="w-3.5 h-3.5" strokeWidth={2} />
            {model.isRecommended ? 'Download' : 'Download'}
          </button>
        )}
      </div>
    </div>
  );
}
