/**
 * Bridge detection orchestrator.
 *
 * Law L2 discipline baked in:
 *   - Detection is NEVER run at import/startup. It runs only when a caller (the
 *     settings card, on an explicit user visit/click) asks for it.
 *   - Results are cached per session (module-level Map) so a settings visit
 *     re-uses a recent probe instead of re-hammering localhost.
 *   - The whole subtree is optional: no export here is imported by any core
 *     creation flow. If every probe fails, core creation is untouched.
 *
 * User preferences (opt-out + custom base URLs) persist in localStorage. When
 * the user opts out, we return the honest `probe-disabled` state and attempt no
 * network at all.
 */

import { detectComfyUI, COMFYUI_DEFAULT_URL } from './comfyui';
import { detectDrawThings, DRAW_THINGS_DEFAULT_URL } from './draw-things';
import type {
  BridgeProbeOptions,
  BridgeServiceConfig,
  BridgeServiceId,
  BridgeServiceState,
} from './types';

/** Static registry of the services the bridge can probe. */
export const BRIDGE_SERVICES: Record<BridgeServiceId, BridgeServiceConfig> = {
  'draw-things': {
    serviceId: 'draw-things',
    label: 'Draw Things',
    defaultBaseUrl: DRAW_THINGS_DEFAULT_URL,
    blurb: 'A free on-device image/video generation app for Apple Silicon. Enable its API Server to let Create detect it.',
  },
  comfyui: {
    serviceId: 'comfyui',
    label: 'ComfyUI',
    defaultBaseUrl: COMFYUI_DEFAULT_URL,
    blurb: 'A local node-based generation server. Start it with CORS enabled to let Create detect installed pipelines like ToonCrafter.',
  },
};

export function listBridgeServices(): BridgeServiceConfig[] {
  return Object.values(BRIDGE_SERVICES);
}

// ─── Persistence (localStorage, SSR/static-export safe) ──────────────────────

const LS_ENABLED = 'contentine.bridge.probeEnabled';
const LS_BASEURL = (id: BridgeServiceId) => `contentine.bridge.baseUrl.${id}`;

function hasStorage(): boolean {
  return typeof window !== 'undefined' && !!window.localStorage;
}

/** Probing is opt-OUT: enabled unless the user explicitly turned it off. */
export function isProbeEnabled(): boolean {
  if (!hasStorage()) return true;
  return window.localStorage.getItem(LS_ENABLED) !== 'false';
}

export function setProbeEnabled(enabled: boolean): void {
  if (!hasStorage()) return;
  window.localStorage.setItem(LS_ENABLED, enabled ? 'true' : 'false');
  if (!enabled) clearSessionCache();
}

export function getBaseUrl(id: BridgeServiceId): string {
  const fallback = BRIDGE_SERVICES[id].defaultBaseUrl;
  if (!hasStorage()) return fallback;
  const saved = window.localStorage.getItem(LS_BASEURL(id));
  return saved && saved.trim().length > 0 ? saved.trim() : fallback;
}

export function setBaseUrl(id: BridgeServiceId, url: string): void {
  if (!hasStorage()) return;
  const trimmed = url.trim();
  if (trimmed.length === 0 || trimmed === BRIDGE_SERVICES[id].defaultBaseUrl) {
    window.localStorage.removeItem(LS_BASEURL(id));
  } else {
    window.localStorage.setItem(LS_BASEURL(id), trimmed);
  }
  sessionCache.delete(id); // a URL change invalidates the cached result
}

// ─── Per-session result cache ────────────────────────────────────────────────

const sessionCache = new Map<BridgeServiceId, BridgeServiceState>();

export function getCachedState(id: BridgeServiceId): BridgeServiceState | undefined {
  return sessionCache.get(id);
}

export function clearSessionCache(): void {
  sessionCache.clear();
}

// ─── Detection ───────────────────────────────────────────────────────────────

function disabledState(id: BridgeServiceId, baseUrl: string): BridgeServiceState {
  return { status: 'probe-disabled', serviceId: id, baseUrl };
}

/**
 * Detect one service. Honours the opt-out preference, the per-session cache, and
 * the caller's abort signal. Never throws; always resolves to an honest state.
 */
export async function detectService(
  id: BridgeServiceId,
  opts: BridgeProbeOptions = {},
): Promise<BridgeServiceState> {
  const baseUrl = opts.baseUrl ?? getBaseUrl(id);

  if (!isProbeEnabled()) {
    const state = disabledState(id, baseUrl);
    return state;
  }

  if (!opts.force) {
    const cached = sessionCache.get(id);
    if (cached && cached.status !== 'probe-disabled') return cached;
  }

  const state =
    id === 'comfyui'
      ? await detectComfyUI(baseUrl, opts.timeoutMs, opts.signal)
      : await detectDrawThings(baseUrl, opts.timeoutMs, opts.signal);

  sessionCache.set(id, state);
  return state;
}

/** Detect all known services in parallel (used by the settings card on visit). */
export async function detectAll(opts: BridgeProbeOptions = {}): Promise<BridgeServiceState[]> {
  const ids = Object.keys(BRIDGE_SERVICES) as BridgeServiceId[];
  return Promise.all(ids.map((id) => detectService(id, opts)));
}
