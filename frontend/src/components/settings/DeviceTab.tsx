'use client';

import { Cpu, Monitor, Globe, RefreshCw, Check, X, ExternalLink, ChevronRight, HardDrive } from 'lucide-react';
import { useDeviceStore } from '@/stores/device-store';
import StoragePanel from '@/components/models/StoragePanel';
import LocalBridgeCard from '@/engine/bridge/LocalBridgeCard';

const TIER_CONFIG = {
  high: { label: 'High Performance', desc: 'Your device supports all browser-native AI features including large LLMs and image generation.', color: 'text-secondary', bg: 'bg-secondary/[0.06] dark:bg-secondary/[0.1]', border: 'border-secondary/15 dark:border-secondary/20', dot: 'bg-secondary' },
  medium: { label: 'Standard', desc: 'Your device supports most AI features. Image generation may not be available.', color: 'text-warning', bg: 'bg-warning/[0.06] dark:bg-warning/[0.1]', border: 'border-warning/15 dark:border-warning/20', dot: 'bg-warning' },
  low: { label: 'Basic', desc: 'Limited AI support. Only small models and TTS will work in-browser. Backend APIs handle the rest.', color: 'text-[#E67E22]', bg: 'bg-[#E67E22]/[0.06] dark:bg-[#E67E22]/[0.1]', border: 'border-[#E67E22]/15 dark:border-[#E67E22]/20', dot: 'bg-[#E67E22]' },
  unsupported: { label: 'Unsupported', desc: 'Your browser does not support browser-native AI. All AI features will use backend APIs instead.', color: 'text-danger', bg: 'bg-danger/[0.06] dark:bg-danger/[0.1]', border: 'border-danger/15 dark:border-danger/20', dot: 'bg-danger' },
} as const;

/** Settings > Device tab — full device details with clean info hierarchy. */
export default function DeviceTab() {
  const { profile, isScanning, rescan } = useDeviceStore();

  /* ── Skeleton ── */
  if (!profile) {
    return (
      <div className="animate-pulse space-y-5">
        <div className="bento-card p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-black/[0.05] dark:bg-white/[0.07]" />
            <div className="flex-1">
              <div className="w-36 h-4 rounded-md bg-black/[0.05] dark:bg-white/[0.07] mb-2" />
              <div className="w-52 h-3 rounded-md bg-black/[0.04] dark:bg-white/[0.05]" />
            </div>
          </div>
          <div className="w-full h-16 rounded-xl bg-black/[0.03] dark:bg-white/[0.04]" />
        </div>
        <div className="bento-card p-5">
          <div className="w-full h-24 rounded-xl bg-black/[0.03] dark:bg-white/[0.04]" />
        </div>
      </div>
    );
  }

  const tier = TIER_CONFIG[profile.tier];

  const gpuName = profile.gpu.renderer
    ? profile.gpu.renderer.replace(/ANGLE \(|, Direct3D.*|, OpenGL.*|\)/g, '').trim()
    : 'Not detected';

  const apiChecks: { label: string; supported: boolean }[] = [
    { label: 'WebGPU', supported: profile.apis.webgpu },
    { label: 'WebGL 2', supported: profile.apis.webgl2 },
    { label: 'WebCodecs', supported: profile.apis.webcodecs },
    { label: 'SharedArrayBuffer', supported: profile.apis.sharedArrayBuffer },
    { label: 'Service Worker', supported: profile.apis.serviceWorker },
    { label: 'IndexedDB', supported: profile.apis.indexedDB },
    { label: 'OffscreenCanvas', supported: profile.apis.offscreenCanvas },
    { label: 'WASM SIMD', supported: profile.apis.wasmSimd },
    { label: 'WASM Threads', supported: profile.apis.wasmThreads },
  ];

  const supportedCount = apiChecks.filter((a) => a.supported).length;

  return (
    <div className="space-y-5 animate-fade-in">
      {/* ── Tier card ── */}
      <div className={`bento-card p-4 md:p-5 border ${tier.border}`}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5">
            <div className={`w-9 h-9 rounded-xl ${tier.bg} flex items-center justify-center shrink-0`}>
              <Cpu className={`w-[18px] h-[18px] ${tier.color}`} strokeWidth={1.75} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className={`text-[14px] font-bold ${tier.color} leading-tight`}>{tier.label} Tier</h3>
                <span className={`w-2 h-2 rounded-full ${tier.dot} animate-pulse-dot`} />
              </div>
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
              disabled:opacity-40 disabled:cursor-not-allowed
              focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none
            "
          >
            <RefreshCw className={`w-3 h-3 ${isScanning ? 'animate-spin' : ''}`} strokeWidth={2} />
            Re-scan
          </button>
        </div>
        <p className="text-[12px] text-text-muted dark:text-white/50 leading-relaxed mb-3">{tier.desc}</p>
        <a
          href="/models"
          className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-primary hover:text-primary-hover transition-colors duration-150 group/link"
        >
          Manage AI Models
          <ChevronRight className="w-3.5 h-3.5 transition-transform duration-200 group-hover/link:translate-x-0.5" strokeWidth={2} />
        </a>
      </div>

      {/* ── GPU ── */}
      <div className="bento-card p-4 md:p-5">
        <h3 className="text-[13px] font-bold text-text dark:text-white mb-4 flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-black/[0.03] dark:bg-white/[0.06] flex items-center justify-center">
            <Monitor className="w-3.5 h-3.5 text-text-muted dark:text-white/50" strokeWidth={1.5} />
          </div>
          GPU
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 gap-x-8">
          <InfoRow label="Renderer" value={gpuName.length > 50 ? gpuName.substring(0, 50) + '\u2026' : gpuName} />
          <InfoRow label="Vendor" value={profile.gpu.vendor.charAt(0).toUpperCase() + profile.gpu.vendor.slice(1)} />
          <InfoRow label="Architecture" value={profile.gpu.architecture} />
          <InfoRow label="VRAM Estimate" value={profile.gpu.vramEstimateMB > 0 ? `${profile.gpu.vramEstimateMB >= 1024 ? (profile.gpu.vramEstimateMB / 1024).toFixed(1) + ' GB' : profile.gpu.vramEstimateMB + ' MB'}` : 'N/A'} />
          <InfoRow label="WebGPU" value={profile.gpu.webgpuSupported ? 'Supported' : 'Not available'} highlight={profile.gpu.webgpuSupported} />
        </div>
      </div>

      {/* ── System ── */}
      <div className="bento-card p-4 md:p-5">
        <h3 className="text-[13px] font-bold text-text dark:text-white mb-4 flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-black/[0.03] dark:bg-white/[0.06] flex items-center justify-center">
            <Cpu className="w-3.5 h-3.5 text-text-muted dark:text-white/50" strokeWidth={1.5} />
          </div>
          System
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 gap-x-8">
          <InfoRow label="Platform" value={profile.system.platform} />
          <InfoRow label="Browser" value={`${profile.system.browser} ${profile.system.browserVersion}`} />
          <InfoRow label="RAM" value={profile.system.ramGB > 0 ? `${profile.system.ramGB} GB` : 'Not reported'} />
          <InfoRow label="CPU Cores" value={String(profile.system.cpuCores)} />
          <InfoRow label="Device Type" value={profile.system.isMobile ? 'Mobile' : 'Desktop'} />
        </div>
      </div>

      {/* ── API Support ── */}
      <div className="bento-card p-4 md:p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[13px] font-bold text-text dark:text-white flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-black/[0.03] dark:bg-white/[0.06] flex items-center justify-center">
              <Globe className="w-3.5 h-3.5 text-text-muted dark:text-white/50" strokeWidth={1.5} />
            </div>
            Browser API Support
          </h3>
          <span className="text-[10.5px] font-semibold text-text-muted dark:text-white/40 tabular-nums">
            {supportedCount}/{apiChecks.length} available
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2.5 gap-x-8">
          {apiChecks.map((api) => (
            <div key={api.label} className="flex items-center gap-2.5 py-0.5">
              {api.supported ? (
                <div className="w-5 h-5 rounded-full bg-secondary/[0.08] dark:bg-secondary/[0.15] flex items-center justify-center shrink-0">
                  <Check className="w-3 h-3 text-secondary" strokeWidth={2.5} />
                </div>
              ) : (
                <div className="w-5 h-5 rounded-full bg-danger/[0.08] dark:bg-danger/[0.15] flex items-center justify-center shrink-0">
                  <X className="w-3 h-3 text-danger" strokeWidth={2.5} />
                </div>
              )}
              <span className={`text-[12px] font-medium ${api.supported ? 'text-text dark:text-white' : 'text-text-muted/50 dark:text-white/30'}`}>
                {api.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Warnings ── */}
      {profile.warnings.length > 0 && (
        <div className="bento-card p-4 md:p-5 border border-warning/15 dark:border-warning/20">
          <h3 className="text-[13px] font-bold text-warning mb-3 flex items-center gap-2">
            <HardDrive className="w-4 h-4" strokeWidth={1.75} />
            Compatibility Notes
          </h3>
          <ul className="space-y-2">
            {profile.warnings.map((w, i) => (
              <li key={i} className="text-[11.5px] text-text-muted dark:text-white/50 leading-relaxed pl-4 relative before:content-['\u2022'] before:absolute before:left-0 before:text-warning before:font-bold">
                {w}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Model storage (folder control, usage, clear switch) ── */}
      <StoragePanel />

      {/* ── Local AI services bridge (WS-11 R6, optional/additive — Law L2) ── */}
      <LocalBridgeCard />

      {/* ── Scan timestamp ── */}
      <p className="text-[10px] text-text-muted/35 dark:text-white/20 text-right tabular-nums">
        Last scanned: {new Date(profile.scannedAt).toLocaleString()}
      </p>
    </div>
  );
}

/** Key-value info row with optional highlight for positive values. */
function InfoRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span className="text-[11.5px] text-text-muted dark:text-white/45 shrink-0">{label}</span>
      <span className={`text-[12px] font-semibold text-right truncate max-w-[60%] ${
        highlight ? 'text-secondary' : 'text-text dark:text-white'
      }`}>
        {value}
      </span>
    </div>
  );
}
