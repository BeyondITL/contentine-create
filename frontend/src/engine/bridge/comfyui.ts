/**
 * ComfyUI detector (localhost :8188 by default).
 *
 * Honest detection only. We confirm ComfyUI via /system_stats, then read
 * /object_info (its installed-node catalog) to surface capabilities that are
 * ACTUALLY present:
 *   - ToonCrafter (R-25, Apache): only if a ToonCrafter-class node is installed.
 *     The ~10GB model is served by the user's ComfyUI — never a browser download.
 *   - image-generation: only if the core sampler node exists.
 *
 * ComfyUI must be started with CORS enabled (`--enable-cors-header`) for the
 * browser to read these responses; otherwise the probe honestly reports
 * blocked-by-cors and the card tells the user exactly that.
 */

import { probeEndpoint } from './probe';
import type { BridgeCapability, BridgeServiceState } from './types';

export const COMFYUI_DEFAULT_URL = 'http://localhost:8188';

/** ComfyUI node class names whose presence proves a ToonCrafter pipeline is installed. */
const TOONCRAFTER_NODE_RE = /tooncrafter|toon_crafter/i;
/** The core sampler node — present in every functional ComfyUI install. */
const SAMPLER_NODE_KEY = 'KSampler';

function trimBase(url: string): string {
  return url.replace(/\/+$/, '');
}

/** Extract a version string from /system_stats if the build reports one; else null. */
function versionFromStats(body: string): string | null {
  try {
    const stats = JSON.parse(body);
    const v = stats?.system?.comfyui_version;
    return typeof v === 'string' && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

/** Map the /object_info node catalog to the capabilities we can honestly surface. */
function capabilitiesFromObjectInfo(body: string): BridgeCapability[] {
  const caps: BridgeCapability[] = [];
  let info: Record<string, unknown>;
  try {
    info = JSON.parse(body) as Record<string, unknown>;
  } catch {
    return caps;
  }
  const keys = Object.keys(info);

  if (keys.some((k) => TOONCRAFTER_NODE_RE.test(k))) {
    caps.push({ id: 'tooncrafter', label: 'ToonCrafter interpolation', via: 'via your local ComfyUI' });
  }
  if (keys.includes(SAMPLER_NODE_KEY)) {
    caps.push({ id: 'image-generation', label: 'Image generation', via: 'via your local ComfyUI' });
  }
  return caps;
}

/**
 * Detect a local ComfyUI. Returns an honest BridgeServiceState — never throws.
 */
export async function detectComfyUI(
  baseUrl: string = COMFYUI_DEFAULT_URL,
  timeoutMs?: number,
  signal?: AbortSignal,
): Promise<BridgeServiceState> {
  const base = trimBase(baseUrl);
  const probedAt = Date.now();

  const stats = await probeEndpoint(`${base}/system_stats`, base, timeoutMs, signal);
  if (!stats.ok) {
    return { status: 'not-detected', serviceId: 'comfyui', baseUrl: base, reason: stats.reason, probedAt };
  }

  const version = versionFromStats(stats.body);

  // Reachable — enumerate capabilities from the node catalog. A failure here does
  // not un-detect the service; it just means we surface no extra capabilities.
  let capabilities: BridgeCapability[] = [];
  const objectInfo = await probeEndpoint(`${base}/object_info`, base, timeoutMs, signal);
  if (objectInfo.ok) capabilities = capabilitiesFromObjectInfo(objectInfo.body);

  return { status: 'detected', serviceId: 'comfyui', baseUrl: base, version, capabilities, probedAt };
}
