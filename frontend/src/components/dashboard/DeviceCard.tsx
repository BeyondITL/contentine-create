'use client';

import { Cpu, ChevronRight, Monitor } from 'lucide-react';
import { useDeviceStore } from '@/stores/device-store';
import { useModelStore } from '@/stores/model-store';

/** Tier config for display — each tier gets a unique visual identity. */
const TIER_CONFIG = {
  high: { dot: 'bg-secondary', ring: 'ring-secondary/20', label: 'Ready for AI', color: 'text-secondary' },
  medium: { dot: 'bg-warning', ring: 'ring-warning/20', label: 'Partially Ready', color: 'text-warning' },
  low: { dot: 'bg-[#E67E22]', ring: 'ring-[#E67E22]/20', label: 'Limited Support', color: 'text-[#E67E22]' },
  unsupported: { dot: 'bg-danger', ring: 'ring-danger/20', label: 'Not Supported', color: 'text-danger' },
} as const;

/** Compact device readiness card for the dashboard — elegant personality. */
export default function DeviceCard() {
  const { profile, isScanning } = useDeviceStore();
  const models = useModelStore((s) => s.models);

  /* ── Skeleton ── */
  if (!profile || isScanning) {
    return (
      <div className="bento-card p-4 md:p-5 animate-pulse">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-9 h-9 rounded-xl bg-black/[0.05] dark:bg-white/[0.07]" />
          <div className="flex-1">
            <div className="w-24 h-3.5 rounded-md bg-black/[0.05] dark:bg-white/[0.07] mb-2" />
            <div className="w-36 h-2.5 rounded-md bg-black/[0.04] dark:bg-white/[0.05]" />
          </div>
        </div>
        <div className="w-full h-1.5 rounded-full bg-black/[0.04] dark:bg-white/[0.05]" />
      </div>
    );
  }

  const tier = TIER_CONFIG[profile.tier];
  const downloaded = models.filter((m) => m.status === 'ready').length;
  const recommended = models.filter((m) => m.isRecommended).length;
  const progress = recommended > 0 ? downloaded / recommended : 0;
  const allReady = recommended > 0 && downloaded >= recommended;

  /* Friendly GPU name */
  const gpuShort = profile.gpu.renderer
    ? profile.gpu.renderer.replace(/ANGLE \(|, Direct3D.*|, OpenGL.*|\)/g, '').trim()
    : 'Unknown GPU';
  const gpuDisplay = gpuShort.length > 28 ? gpuShort.substring(0, 28) + '\u2026' : gpuShort;

  return (
    <div className="bento-card p-4 md:p-5 group cursor-default">
      {/* Header — icon + tier indicator */}
      <div className="flex items-start gap-3 mb-4">
        <div className="w-9 h-9 rounded-xl bg-black/[0.03] dark:bg-white/[0.06] flex items-center justify-center shrink-0 transition-transform duration-300 group-hover:scale-105">
          <Cpu className="w-[18px] h-[18px] text-text-muted dark:text-white/50" strokeWidth={1.5} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <h3 className="text-[13px] font-semibold text-text dark:text-white leading-tight">Device</h3>
            <div className="flex items-center gap-1.5">
              <span className={`relative w-2 h-2 rounded-full ${tier.dot} shrink-0`}>
                <span className={`absolute inset-0 rounded-full ${tier.dot} animate-pulse-dot`} />
              </span>
              <span className={`text-[10.5px] font-semibold ${tier.color}`}>{tier.label}</span>
            </div>
          </div>
          <p className="text-[11px] text-text-muted dark:text-white/45 flex items-center gap-1 leading-tight">
            <Monitor className="w-3 h-3 shrink-0" strokeWidth={1.5} />
            <span className="truncate">{gpuDisplay}</span>
          </p>
        </div>

        <a
          href="/settings?tab=device"
          className="p-1.5 rounded-lg text-text-muted/30 hover:text-primary hover:bg-primary/[0.05] dark:hover:bg-primary/[0.1] transition-all duration-200 active:scale-95 shrink-0"
          title="Device details"
        >
          <ChevronRight className="w-4 h-4" strokeWidth={1.5} />
        </a>
      </div>

      {/* Model progress bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10.5px] font-medium text-text-muted dark:text-white/50">
            {allReady ? 'All models ready' : `${downloaded}/${recommended} models`}
          </span>
          {!allReady && (
            <span className="text-[10px] font-semibold tabular-nums text-text-muted/60 dark:text-white/35">
              {Math.round(progress * 100)}%
            </span>
          )}
        </div>
        <div className="w-full h-[5px] rounded-full bg-black/[0.04] dark:bg-white/[0.06] overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ease-out ${
              allReady
                ? 'bg-secondary'
                : 'bg-gradient-to-r from-primary to-accent'
            }`}
            style={{ width: `${Math.max(allReady ? 100 : 2, Math.round(progress * 100))}%` }}
          />
        </div>
      </div>

      {/* CTA link */}
      <a
        href="/models"
        className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-primary hover:text-primary-hover transition-colors duration-150 group/link"
      >
        {allReady ? 'Manage Models' : 'Set Up AI Models'}
        <ChevronRight className="w-3.5 h-3.5 transition-transform duration-200 group-hover/link:translate-x-0.5" strokeWidth={2} />
      </a>
    </div>
  );
}
