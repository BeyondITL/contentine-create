'use client';

import { useEffect } from 'react';
import {
  Cpu, HardDrive, RefreshCw, Sparkles, Shield, Monitor, Layers,
  Globe, Trash2, CheckCircle, AlertTriangle, Brain,
  Volume2, Image as ImageIcon, Scan, Mic, Copy,
} from 'lucide-react';
import { useDeviceStore } from '@/stores/device-store';
import { useModelStore, formatBytes, type AIModel } from '@/stores/model-store';
import type { DeviceProfile } from '@/engine/device-scanner';
import ModelGrid from '@/components/models/ModelGrid';
import DownloadAllBar from '@/components/models/DownloadAllBar';
import StoragePanel from '@/components/models/StoragePanel';

const TIER_BADGE: Record<string, { label: string; color: string; bg: string; border: string }> = {
  high: { label: 'High Performance', color: 'text-secondary', bg: 'bg-secondary/[0.08] dark:bg-secondary/[0.15]', border: 'border-secondary/15' },
  medium: { label: 'Standard', color: 'text-warning', bg: 'bg-warning/[0.08] dark:bg-warning/[0.15]', border: 'border-warning/15' },
  low: { label: 'Basic', color: 'text-[#E67E22]', bg: 'bg-[#E67E22]/[0.08] dark:bg-[#E67E22]/[0.15]', border: 'border-[#E67E22]/15' },
  unsupported: { label: 'Unsupported', color: 'text-danger', bg: 'bg-danger/[0.08] dark:bg-danger/[0.15]', border: 'border-danger/15' },
};

/** Category icons for the recommendation section. */
const CATEGORY_ICON: Record<string, React.ElementType> = {
  llm: Brain,
  tts: Volume2,
  image: ImageIcon,
  lipsync: Scan,
  stt: Mic,
  voiceclone: Copy,
};

const CATEGORY_COLOR: Record<string, string> = {
  llm: 'text-primary',
  tts: 'text-secondary',
  image: 'text-accent',
  lipsync: 'text-warning',
  stt: 'text-info',
  voiceclone: 'text-[#C084FC]',
};

/** AI Model Manager — download and manage browser-native AI models. Flagship page. */
export default function ModelsPage() {
  const { profile, isScanning, scan, rescan } = useDeviceStore();
  const { models, isChecking, initWithProfile, checkAllStatuses } = useModelStore();

  /* Scan device + check model statuses on mount */
  useEffect(() => {
    if (!profile) scan();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (profile) {
      initWithProfile(profile);
      checkAllStatuses();
    }
  }, [profile]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    document.title = 'AI Models \u2014 Contentine Create';
  }, []);

  const isLoading = isScanning || (!profile && !isChecking);
  const tier = profile ? TIER_BADGE[profile.tier] : null;
  const safeModels = models ?? [];
  const downloaded = safeModels.filter((m) => m.status === 'ready');
  const totalCached = downloaded.reduce((sum, m) => sum + m.sizeBytes, 0);
  const totalModels = safeModels.length;

  // Build recommended models list from device profile
  const recommendedModels = profile?.recommendedModels ?? null;
  const TIER_ORDER: Record<string, number> = { high: 3, medium: 2, low: 1, unsupported: 0 };
  const deviceTierValue = TIER_ORDER[profile?.tier || 'unsupported'] || 0;

  // Categorize models by VRAM compatibility
  const compatibleModels = profile
    ? safeModels.filter((m) => TIER_ORDER[m.minTier] <= deviceTierValue && deviceTierValue > 0)
    : [];
  const incompatibleModels = profile
    ? safeModels.filter((m) => TIER_ORDER[m.minTier] > deviceTierValue || deviceTierValue === 0)
    : [];

  return (
    <div className="max-w-[1100px] mx-auto animate-fade-in">
      {/* -- Page header -- */}
      <div className="mb-8">
        <div className="flex items-center gap-2.5 mb-1.5">
          <div className="w-8 h-8 rounded-xl bg-accent/[0.08] dark:bg-accent/[0.15] flex items-center justify-center">
            <Sparkles className="w-[18px] h-[18px] text-accent" strokeWidth={2} />
          </div>
          <h1 className="text-[20px] md:text-[24px] font-bold text-text dark:text-white tracking-[-0.02em]">
            AI Models
          </h1>
        </div>
        <p className="text-[13px] text-text-muted dark:text-white/50 ml-[42px]">
          Download AI models to run script generation, TTS, and image creation directly in your browser.
        </p>
      </div>

      {/* -- Device status overview -- */}
      {isLoading ? (
        <div className="bento-card p-5 md:p-6 mb-6 animate-pulse">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-black/[0.05] dark:bg-white/[0.07]" />
            <div className="flex-1">
              <div className="w-36 h-4 rounded-md bg-black/[0.05] dark:bg-white/[0.07] mb-2.5" />
              <div className="w-52 h-3 rounded-md bg-black/[0.04] dark:bg-white/[0.05]" />
            </div>
          </div>
        </div>
      ) : profile ? (
        <div className="bento-card p-4 md:p-5 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            {/* Left -- device info */}
            <div className="flex items-center gap-3.5 flex-1 min-w-0">
              <div className="w-11 h-11 rounded-[13px] bg-black/[0.03] dark:bg-white/[0.06] flex items-center justify-center shrink-0">
                <Cpu className="w-[22px] h-[22px] text-text-muted dark:text-white/50" strokeWidth={1.5} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  {tier && (
                    <span className={`text-[10px] font-bold ${tier.color} ${tier.bg} px-2 py-[3px] rounded-md uppercase tracking-[0.06em] leading-none`}>
                      {tier.label}
                    </span>
                  )}
                  <span className="text-[11px] text-text-muted/50 dark:text-white/30 truncate">
                    {profile.gpu.renderer
                      ? profile.gpu.renderer.replace(/ANGLE \(|, Direct3D.*|, OpenGL.*|\)/g, '').trim().substring(0, 40)
                      : 'Unknown GPU'}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-[11px] text-text-muted dark:text-white/50 flex-wrap">
                  {profile.gpu.vramEstimateMB > 0 && (
                    <span className="flex items-center gap-1">
                      <Monitor className="w-3 h-3 shrink-0" strokeWidth={1.5} />
                      {profile.gpu.unifiedMemory
                        ? `≈${(profile.gpu.vramEstimateMB / 1024).toFixed(0)} GB GPU-addressable, shared`
                        : profile.gpu.vramEstimateMB >= 1024
                          ? `${(profile.gpu.vramEstimateMB / 1024).toFixed(1)} GB VRAM`
                          : `${profile.gpu.vramEstimateMB} MB VRAM`}
                    </span>
                  )}
                  {profile.system.ramGB > 0 && <span>{profile.system.ramGB} GB RAM</span>}
                  <span>{profile.system.cpuCores} cores</span>
                </div>
              </div>
            </div>

            {/* Right -- stats + rescan */}
            <div className="flex items-center gap-4 shrink-0">
              <div className="flex items-center gap-4 text-[11px]">
                <div className="flex items-center gap-1.5 text-text-muted dark:text-white/50">
                  <Layers className="w-3.5 h-3.5" strokeWidth={1.5} />
                  <span className="font-medium tabular-nums">{downloaded.length}/{totalModels}</span>
                </div>
                <div className="flex items-center gap-1.5 text-text-muted dark:text-white/50">
                  <HardDrive className="w-3.5 h-3.5" strokeWidth={1.5} />
                  <span className="font-medium">{formatBytes(totalCached)}</span>
                </div>
              </div>
              <button
                onClick={rescan}
                disabled={isScanning}
                className="
                  flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                  text-[11px] font-semibold text-text-secondary dark:text-white/60
                  hover:bg-black/[0.04] dark:hover:bg-white/[0.06]
                  transition-all duration-200 active:scale-[0.97]
                  focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none
                  disabled:opacity-40 disabled:cursor-not-allowed
                "
              >
                <RefreshCw className={`w-3 h-3 ${isScanning ? 'animate-spin' : ''}`} strokeWidth={2} />
                Re-scan
              </button>
            </div>
          </div>

          {/* Warnings */}
          {(profile.warnings ?? []).length > 0 && (
            <div className="mt-3.5 pt-3.5 border-t border-black/[0.04] dark:border-white/[0.06]">
              {(profile.warnings ?? []).slice(0, 2).map((w, i) => (
                <p key={i} className="text-[11px] text-warning flex items-start gap-1.5 mb-1 last:mb-0">
                  <Shield className="w-3 h-3 shrink-0 mt-[1px]" strokeWidth={2} />
                  <span className="leading-relaxed">{w}</span>
                </p>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {/* -- Recommended for your device -- */}
      {profile && recommendedModels && deviceTierValue > 0 && (
        <RecommendedSection
          profile={profile}
          recommendedModels={recommendedModels}
          models={models}
          compatibleCount={compatibleModels.length}
          incompatibleCount={incompatibleModels.length}
        />
      )}

      {/* -- Download recommended bar -- */}
      <DownloadAllBar />

      {/* -- Model grid -- */}
      <ModelGrid />

      {/* -- Storage: folder control, per-model rows, orphans, clear switch -- */}
      <StoragePanel />

      {/* -- Advanced options -- */}
      <div className="mt-8 bento-card p-4 md:p-5">
        <h3 className="text-[13px] font-bold text-text dark:text-white mb-4 flex items-center gap-2">
          <div className="w-1 h-4 rounded-full bg-gradient-to-b from-primary to-accent" />
          Advanced Options
        </h3>
        <div className="space-y-0">
          {/* -- Download Source (informational) -- models stream directly from the
               HuggingFace CDN into on-device storage; no server is in the model
               path (Law L2). -- */}
          <div className="flex items-start gap-3 py-3">
            <span className="text-text-muted dark:text-white/50 mt-0.5">
              <Globe className="w-4 h-4" strokeWidth={1.5} />
            </span>
            <div>
              <p className="text-[12px] font-semibold text-text dark:text-white leading-tight">Download Source</p>
              <p className="text-[10.5px] text-text-muted dark:text-white/45 mt-0.5 leading-relaxed">
                Models download directly from the HuggingFace CDN to your device and are cached for
                offline use. Nothing is uploaded and no data passes through Contentine servers.
              </p>
            </div>
          </div>

          <div className="border-t border-black/[0.04] dark:border-white/[0.06]" />

          {/* -- Clear All Cached Data -- (model storage details live in the
               Storage panel above; this clears only evictable app assets) */}
          <div className="flex items-center justify-between py-3">
            <div>
              <p className="text-[12px] font-semibold text-text dark:text-white leading-tight">Clear Non-Model Cache</p>
              <p className="text-[10.5px] text-text-muted dark:text-white/45 mt-0.5">
                Remove cached generated images and audio. Model weights are kept.
              </p>
            </div>
            <button
              onClick={async () => {
                try {
                  const { assetCache } = await import('@/engine/asset-cache');
                  await assetCache.clearEvictable();
                } catch { /* ignore */ }
              }}
              className="
                flex items-center gap-1.5 px-3.5 py-2 rounded-lg
                text-[11px] font-semibold text-danger/70 hover:text-danger
                bg-danger/[0.04] hover:bg-danger/[0.08]
                transition-all duration-200 active:scale-[0.97]
              "
            >
              <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
              Clear
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Recommended models section -- shows device-specific model picks based on VRAM and capabilities. */
function RecommendedSection({
  profile,
  recommendedModels,
  models,
  compatibleCount,
  incompatibleCount,
}: {
  profile: DeviceProfile;
  recommendedModels: DeviceProfile['recommendedModels'];
  models: AIModel[];
  compatibleCount: number;
  incompatibleCount: number;
}) {
  // Build display data from recommendedModels
  const picks: { category: string; label: string; modelId: string | null; modelName: string | null; status: string }[] = [
    { category: 'llm', label: 'Script & Writing', modelId: recommendedModels.llm, modelName: null, status: 'none' },
    { category: 'tts', label: 'Text-to-Speech', modelId: recommendedModels.tts, modelName: null, status: 'none' },
    { category: 'image', label: 'Image Generation', modelId: recommendedModels.imageGen, modelName: null, status: 'none' },
    { category: 'lipsync', label: 'Lip-Sync', modelId: recommendedModels.lipSync, modelName: null, status: 'none' },
    { category: 'stt', label: 'Speech-to-Text', modelId: recommendedModels.stt, modelName: null, status: 'none' },
  ].map((pick) => {
    if (!pick.modelId) return { ...pick, modelName: null, status: 'unavailable' };
    const model = (models ?? []).find((m) => m.id === pick.modelId);
    // A recommendation id with no catalog entry is treated as unavailable —
    // NEVER rendered raw. A stale cached device profile once resurrected the
    // quarantined 'wav2lip' id into this strip that way (C-M2 P0 round two).
    if (!model) return { ...pick, modelName: null, status: 'unavailable' };
    return {
      ...pick,
      modelName: model.name,
      status: model.status,
    };
  });

  const allReady = picks.every((p) => p.status === 'ready' || p.status === 'unavailable');

  return (
    <div className="bento-card p-4 md:p-5 mb-6 animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[13px] font-bold text-text dark:text-white flex items-center gap-2">
          <div className="w-1 h-4 rounded-full bg-gradient-to-b from-primary to-secondary" />
          Recommended for Your Device
        </h3>
        <div className="flex items-center gap-3 text-[10.5px] text-text-muted dark:text-white/40">
          <span className="flex items-center gap-1">
            <CheckCircle className="w-3 h-3 text-secondary" strokeWidth={2} />
            {compatibleCount} compatible
          </span>
          {incompatibleCount > 0 && (
            <span className="flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 text-text-muted/30" strokeWidth={2} />
              {incompatibleCount} may need override
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
        {picks.map((pick) => {
          const Icon = CATEGORY_ICON[pick.category] || Brain;
          const color = CATEGORY_COLOR[pick.category] || 'text-primary';
          const isDownloaded = pick.status === 'ready';
          const isUnavailable = pick.status === 'unavailable';

          return (
            <div
              key={pick.category}
              className={`
                flex items-center gap-2.5 p-3 rounded-xl transition-all duration-200
                ${isDownloaded
                  ? 'bg-secondary/[0.04] dark:bg-secondary/[0.08] border border-secondary/10'
                  : isUnavailable
                    ? 'bg-black/[0.015] dark:bg-white/[0.02] border border-transparent opacity-50'
                    : 'bg-black/[0.02] dark:bg-white/[0.03] border border-transparent'}
              `}
            >
              <Icon className={`w-4 h-4 shrink-0 ${isDownloaded ? 'text-secondary' : isUnavailable ? 'text-text-muted/30' : color}`} strokeWidth={1.5} />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-semibold text-text-muted dark:text-white/40 uppercase tracking-wider leading-none mb-1">
                  {pick.label}
                </p>
                <p className={`text-[11px] font-medium truncate leading-tight ${isDownloaded ? 'text-secondary' : isUnavailable ? 'text-text-muted/40' : 'text-text dark:text-white/80'}`}>
                  {isUnavailable
                    ? (pick.category === 'lipsync' || pick.category === 'image' ? 'Coming later' : 'Not recommended')
                    : pick.modelName}
                </p>
              </div>
              {isDownloaded && (
                <CheckCircle className="w-3.5 h-3.5 text-secondary shrink-0" strokeWidth={2} />
              )}
            </div>
          );
        })}
      </div>

      {/* VRAM summary */}
      {profile.gpu.vramEstimateMB > 0 && (
        <div className="mt-3 pt-3 border-t border-black/[0.04] dark:border-white/[0.06]">
          <p className="text-[10.5px] text-text-muted dark:text-white/40">
            <Monitor className="w-3 h-3 inline-block mr-1 -mt-[1px]" strokeWidth={1.5} />
            {profile.gpu.unifiedMemory
              ? `Unified memory: ≈${(profile.gpu.vramEstimateMB / 1024).toFixed(0)} GB is GPU-addressable, shared with the system — large models compete with your apps for the same memory.`
              : `Your GPU has approximately ${profile.gpu.vramEstimateMB >= 1024 ? `${(profile.gpu.vramEstimateMB / 1024).toFixed(1)} GB` : `${profile.gpu.vramEstimateMB} MB`} VRAM.`}
            {profile.tier === 'high' && ' All AI models can run on this device.'}
            {profile.tier === 'medium' && ' Most AI models can run. Large image generation models may be slow.'}
            {profile.tier === 'low' && ' Only lightweight models are recommended. Large models may fail to load.'}
          </p>
        </div>
      )}
    </div>
  );
}
