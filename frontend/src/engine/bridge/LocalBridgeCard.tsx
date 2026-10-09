'use client';

/**
 * Settings > Device — "Local AI services" card (WS-11, R6).
 *
 * Additive, minimal, house-style (Lucide, dark mode, bento-card). Shows the
 * HONEST detection state of local AI services on the user's machine. Detection
 * runs on an explicit user action only: when this card mounts (a settings/device
 * visit) and on the Detect button — never at app startup (Law L2). No capability
 * is shown unless the service actually reports it (Law L1).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Server, RefreshCw, Check, X, CircleSlash, HelpCircle,
  ShieldAlert, Sparkles, Clock, PlugZap,
} from 'lucide-react';
import {
  listBridgeServices, detectService, isProbeEnabled, setProbeEnabled,
  getBaseUrl, setBaseUrl,
} from './detector';
import type { BridgeServiceId, BridgeServiceState, BridgeMissReason } from './types';

const MISS_TEXT: Record<BridgeMissReason, string> = {
  unreachable: 'Not running — nothing is listening at this address.',
  timeout: 'No response — the probe timed out.',
  'blocked-by-cors': 'Reachable, but blocked by CORS. Enable CORS on the service to connect.',
  'unexpected-response': 'Something answered but was not recognised as this service.',
};

export default function LocalBridgeCard() {
  const services = listBridgeServices();
  const [states, setStates] = useState<Record<BridgeServiceId, BridgeServiceState | 'pending'>>(
    () => Object.fromEntries(services.map((s) => [s.serviceId, 'pending'])) as Record<BridgeServiceId, BridgeServiceState | 'pending'>,
  );
  const [enabled, setEnabled] = useState(true);
  const [detecting, setDetecting] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const runDetection = useCallback(async (force: boolean) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setDetecting(true);
    setStates((prev) => Object.fromEntries(Object.keys(prev).map((k) => [k, 'pending'])) as typeof prev);
    try {
      await Promise.all(
        services.map(async (svc) => {
          const st = await detectService(svc.serviceId, { force, signal: controller.signal });
          if (!controller.signal.aborted) {
            setStates((prev) => ({ ...prev, [svc.serviceId]: st }));
          }
        }),
      );
    } finally {
      if (!controller.signal.aborted) setDetecting(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Detect on mount — a settings/device visit is the explicit user action (L2).
  useEffect(() => {
    setEnabled(isProbeEnabled());
    if (isProbeEnabled()) runDetection(false);
    return () => abortRef.current?.abort();
  }, [runDetection]);

  const onToggleEnabled = (next: boolean) => {
    setProbeEnabled(next);
    setEnabled(next);
    if (next) runDetection(true);
    else setStates((prev) => Object.fromEntries(
      Object.entries(prev).map(([id, st]) => [
        id,
        typeof st === 'object' ? { status: 'probe-disabled', serviceId: st.serviceId, baseUrl: st.baseUrl } : st,
      ]),
    ) as typeof prev);
  };

  return (
    <div className="bento-card p-4 md:p-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <h3 className="text-[13px] font-bold text-text dark:text-white flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-black/[0.03] dark:bg-white/[0.06] flex items-center justify-center">
            <Server className="w-3.5 h-3.5 text-text-muted dark:text-white/50" strokeWidth={1.5} />
          </div>
          Local AI Services
        </h3>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowHelp((s) => !s)}
            aria-expanded={showHelp}
            aria-label="What is this"
            className="p-1.5 rounded-lg text-text-muted dark:text-white/50 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none"
          >
            <HelpCircle className="w-3.5 h-3.5" strokeWidth={1.75} />
          </button>
          <button
            onClick={() => runDetection(true)}
            disabled={detecting || !enabled}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-text-secondary dark:text-white/60 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-all duration-200 active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none"
          >
            <RefreshCw className={`w-3 h-3 ${detecting ? 'animate-spin' : ''}`} strokeWidth={2} />
            Detect
          </button>
        </div>
      </div>

      {/* What-is-this explainer */}
      {showHelp && (
        <div className="mb-4 rounded-xl bg-black/[0.02] dark:bg-white/[0.03] border border-black/[0.04] dark:border-white/[0.06] p-3.5 animate-fade-in">
          <p className="text-[11.5px] text-text-muted dark:text-white/55 leading-relaxed">
            Create runs entirely in your browser. If you also run an AI app on your own
            computer (Draw Things, ComfyUI), Create can detect it and offer extra,
            optional capabilities — nothing here is required, and Create works fully
            without it. Detection is a quick local check that runs only when you open
            this page or press Detect; it is never sent anywhere.
          </p>
        </div>
      )}

      {/* Per-service rows */}
      <div className="space-y-2.5">
        {services.map((svc) => (
          <ServiceRow
            key={svc.serviceId}
            label={svc.label}
            blurb={svc.blurb}
            state={states[svc.serviceId]}
            onSaveUrl={(url) => { setBaseUrl(svc.serviceId, url); runDetection(true); }}
            defaultUrl={getBaseUrl(svc.serviceId)}
          />
        ))}
      </div>

      {/* Probe opt-out */}
      <label className="mt-4 flex items-center gap-2.5 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onToggleEnabled(e.target.checked)}
          className="w-3.5 h-3.5 rounded accent-primary"
        />
        <span className="text-[11px] text-text-muted dark:text-white/45">
          Allow Create to check for local AI services on this page
        </span>
      </label>
    </div>
  );
}

function ServiceRow({
  label, blurb, state, defaultUrl, onSaveUrl,
}: {
  label: string;
  blurb: string;
  state: BridgeServiceState | 'pending';
  defaultUrl: string;
  onSaveUrl: (url: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [url, setUrl] = useState(defaultUrl);

  return (
    <div className="rounded-xl border border-black/[0.04] dark:border-white/[0.06] p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[12.5px] font-semibold text-text dark:text-white">{label}</span>
            <StatusPill state={state} />
          </div>
          <p className="text-[11px] text-text-muted dark:text-white/45 leading-relaxed mt-0.5">{blurb}</p>
        </div>
        <button
          onClick={() => setEditing((e) => !e)}
          className="shrink-0 text-[10.5px] font-semibold text-primary hover:text-primary-hover transition-colors"
        >
          {editing ? 'Close' : 'Address'}
        </button>
      </div>

      {/* Detected capabilities — only what the service actually reports (L1). */}
      {typeof state === 'object' && state.status === 'detected' && state.capabilities.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {state.capabilities.map((cap) => (
            <span
              key={cap.id}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold bg-secondary/[0.08] dark:bg-secondary/[0.14] text-secondary"
            >
              <Sparkles className="w-2.5 h-2.5" strokeWidth={2} />
              {cap.label} <span className="font-normal opacity-70">{cap.via}</span>
            </span>
          ))}
        </div>
      )}

      {/* Honest miss reason */}
      {typeof state === 'object' && state.status === 'not-detected' && (
        <p className="mt-2 text-[10.5px] text-text-muted/70 dark:text-white/35 flex items-center gap-1.5">
          {state.reason === 'blocked-by-cors'
            ? <ShieldAlert className="w-3 h-3 text-warning shrink-0" strokeWidth={2} />
            : <Clock className="w-3 h-3 shrink-0" strokeWidth={2} />}
          {MISS_TEXT[state.reason]}
        </p>
      )}

      {/* Address override */}
      {editing && (
        <div className="mt-2.5 flex items-center gap-2">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            spellCheck={false}
            className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg text-[11px] font-mono bg-black/[0.03] dark:bg-white/[0.05] border border-black/[0.06] dark:border-white/[0.08] text-text dark:text-white focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none"
            placeholder={defaultUrl}
          />
          <button
            onClick={() => { onSaveUrl(url); setEditing(false); }}
            className="shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-primary text-white hover:bg-primary-hover transition-colors active:scale-[0.97]"
          >
            Save
          </button>
        </div>
      )}
    </div>
  );
}

function StatusPill({ state }: { state: BridgeServiceState | 'pending' }) {
  if (state === 'pending') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9.5px] font-bold text-text-muted dark:text-white/40 bg-black/[0.04] dark:bg-white/[0.06]">
        <PlugZap className="w-2.5 h-2.5 animate-pulse" strokeWidth={2.5} /> Checking…
      </span>
    );
  }
  if (state.status === 'detected') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9.5px] font-bold text-secondary bg-secondary/[0.1] dark:bg-secondary/[0.16]">
        <Check className="w-2.5 h-2.5" strokeWidth={3} />
        Detected{state.version ? ` · v${state.version}` : ''}
      </span>
    );
  }
  if (state.status === 'probe-disabled') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9.5px] font-bold text-text-muted dark:text-white/40 bg-black/[0.04] dark:bg-white/[0.06]">
        <CircleSlash className="w-2.5 h-2.5" strokeWidth={2.5} /> Checks off
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9.5px] font-bold text-text-muted/60 dark:text-white/30 bg-black/[0.03] dark:bg-white/[0.05]">
      <X className="w-2.5 h-2.5" strokeWidth={2.5} /> Not detected
    </span>
  );
}
