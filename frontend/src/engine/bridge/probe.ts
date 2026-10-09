/**
 * Generic localhost health-probe. Short-timeout, honest failure taxonomy.
 *
 * Distinguishing "service down" from "service up but not sharing CORS" is real,
 * not cosmetic: a browser `fetch` throws the same opaque TypeError for a refused
 * connection and a CORS-blocked one. We disambiguate with a follow-up `no-cors`
 * request — if the opaque request succeeds, something IS listening and merely
 * withheld CORS headers (actionable: the user can enable CORS on their service);
 * if it also fails, nothing is listening. This lets the card tell the honest
 * truth instead of a flat "not found".
 *
 * NOTE on mixed content: an https page fetching http://localhost / http://127.0.0.1
 * is permitted — loopback is treated as a potentially-trustworthy secure context
 * by browsers, so these probes are not blocked as mixed content.
 */

import type { BridgeMissReason } from './types';

/** Low-level outcome of a single endpoint probe. */
export type ProbeOutcome =
  | { ok: true; body: string; contentType: string | null }
  | { ok: false; reason: BridgeMissReason };

const DEFAULT_TIMEOUT_MS = 1500;

/** True if an error is (or wraps) an AbortError. */
function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

/**
 * Fetch `url` with a hard timeout, honouring an optional external abort signal.
 * Returns the resolved Response or throws — timeouts and external aborts both
 * surface as AbortError, disambiguated by the `timedOut` closure flag.
 */
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  external?: AbortSignal,
): Promise<{ res: Response | null; timedOut: boolean; aborted: boolean }> {
  const controller = new AbortController();
  let timedOut = false;

  const onExternalAbort = () => controller.abort();
  if (external) {
    if (external.aborted) return { res: null, timedOut: false, aborted: true };
    external.addEventListener('abort', onExternalAbort, { once: true });
  }

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    return { res, timedOut: false, aborted: false };
  } catch (err) {
    if (isAbort(err)) {
      // External abort wins over timeout for reporting (caller-cancelled, not a miss).
      const aborted = !timedOut && !!external?.aborted;
      return { res: null, timedOut, aborted };
    }
    // Network-layer failure (refused, DNS, or CORS pre-flight rejection).
    return { res: null, timedOut: false, aborted: false };
  } finally {
    clearTimeout(timer);
    external?.removeEventListener('abort', onExternalAbort);
  }
}

/**
 * Probe a single URL and classify the outcome honestly.
 *
 * @param url        endpoint to GET
 * @param baseUrl    service origin, used for the CORS-disambiguation follow-up
 * @param timeoutMs  short per-probe budget
 * @param external   caller abort (component unmount etc.)
 */
export async function probeEndpoint(
  url: string,
  baseUrl: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
  external?: AbortSignal,
): Promise<ProbeOutcome> {
  // 1) Real request — we want to READ the body to confirm identity + version.
  const primary = await fetchWithTimeout(
    url,
    { method: 'GET', mode: 'cors', cache: 'no-store', credentials: 'omit' },
    timeoutMs,
    external,
  );

  if (primary.aborted) return { ok: false, reason: 'timeout' }; // caller cancelled; treat as inconclusive
  if (primary.res && primary.res.ok) {
    const contentType = primary.res.headers.get('content-type');
    const body = await primary.res.text();
    return { ok: true, body, contentType };
  }
  if (primary.res && !primary.res.ok) {
    // Something answered but rejected the request — reachable, wrong shape.
    return { ok: false, reason: 'unexpected-response' };
  }
  if (primary.timedOut) return { ok: false, reason: 'timeout' };

  // 2) Primary threw a network error. Disambiguate down-vs-CORS with an opaque probe.
  const opaque = await fetchWithTimeout(
    baseUrl,
    { method: 'GET', mode: 'no-cors', cache: 'no-store', credentials: 'omit' },
    timeoutMs,
    external,
  );

  if (opaque.res) {
    // An opaque response means the socket connected and the server replied —
    // it just didn't share CORS headers with this origin.
    return { ok: false, reason: 'blocked-by-cors' };
  }
  if (opaque.timedOut) return { ok: false, reason: 'timeout' };
  return { ok: false, reason: 'unreachable' };
}
