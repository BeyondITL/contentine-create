/**
 * Draw Things detector (localhost :7860 by default).
 *
 * Draw Things exposes an Automatic1111-compatible HTTP API when its "API Server"
 * mode is switched on in the app (off by default, so absence is the common case).
 * We confirm it via /sdapi/v1/sd-models, which returns a JSON array of the user's
 * installed checkpoints. Draw Things does not report a stable version string on
 * that endpoint, so we honestly leave version null rather than invent one.
 *
 * Reference R-43: Draw Things runs video/image models on Apple Silicon locally.
 * The bridge only DETECTS it — generation stays on the user's machine, and no
 * core Contentine flow depends on its presence (Law L2).
 */

import { probeEndpoint } from './probe';
import type { BridgeCapability, BridgeServiceState } from './types';

export const DRAW_THINGS_DEFAULT_URL = 'http://localhost:7860';

function trimBase(url: string): string {
  return url.replace(/\/+$/, '');
}

/** A JSON array response from /sdapi/v1/sd-models is the identity signal. */
function looksLikeSdModels(body: string, contentType: string | null): boolean {
  if (contentType && !contentType.includes('json')) return false;
  try {
    return Array.isArray(JSON.parse(body));
  } catch {
    return false;
  }
}

/**
 * Detect a local Draw Things API server. Returns an honest BridgeServiceState —
 * never throws.
 */
export async function detectDrawThings(
  baseUrl: string = DRAW_THINGS_DEFAULT_URL,
  timeoutMs?: number,
  signal?: AbortSignal,
): Promise<BridgeServiceState> {
  const base = trimBase(baseUrl);
  const probedAt = Date.now();

  const models = await probeEndpoint(`${base}/sdapi/v1/sd-models`, base, timeoutMs, signal);
  if (!models.ok) {
    return { status: 'not-detected', serviceId: 'draw-things', baseUrl: base, reason: models.reason, probedAt };
  }
  if (!looksLikeSdModels(models.body, models.contentType)) {
    return { status: 'not-detected', serviceId: 'draw-things', baseUrl: base, reason: 'unexpected-response', probedAt };
  }

  const capabilities: BridgeCapability[] = [
    { id: 'image-generation', label: 'Image generation', via: 'via your local Draw Things' },
  ];

  return { status: 'detected', serviceId: 'draw-things', baseUrl: base, version: null, capabilities, probedAt };
}
