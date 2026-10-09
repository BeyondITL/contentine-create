/**
 * GPU memory budgeter (C-M2 P0 round two, step 3).
 *
 * On unified-memory devices (Apple Silicon) the scanner's vramEstimateMB is a
 * SHARED ceiling — GPU allocations compete with the OS and every open app for
 * the same physical RAM. A 16 GB-class machine cannot hold a multi-GB LLM and
 * the 2.5 GB SD-Turbo session set at once without paging/device-loss.
 *
 * `reserveGpuBudget(requester)` is called by each heavy engine right before it
 * creates GPU residency: on shared-ceiling devices it unloads the OTHER heavy
 * engine first (least-recently-requested loses — with two heavy engines this
 * IS the LRU policy). Engines re-load transparently from the on-device cache
 * on their next use, so nothing re-downloads; only GPU residency moves.
 * Dynamic imports keep engine→engine edges lazy (no static cycles, Law L8).
 */

type HeavyEngine = 'webllm' | 'sd-turbo';

/** Shared-ceiling test: unified memory with ≤ ~16 GB-class GPU-addressable budget. */
function isSharedCeilingDevice(): boolean {
  try {
    const raw = localStorage.getItem('contentine_device_profile');
    if (!raw) return false;
    const profile = JSON.parse(raw) as {
      gpu?: { unifiedMemory?: boolean; vramEstimateMB?: number };
    };
    return !!profile.gpu?.unifiedMemory && (profile.gpu?.vramEstimateMB ?? 0) <= 16_384;
  } catch {
    return false;
  }
}

/** Serialize unload work so concurrent loads don't race the budgeter. */
let pending: Promise<void> = Promise.resolve();

export function reserveGpuBudget(requester: HeavyEngine): Promise<void> {
  const run = pending.then(async () => {
    if (!isSharedCeilingDevice()) return;
    try {
      if (requester === 'webllm') {
        const { sdTurboEngine } = await import('./sd-turbo-engine');
        if (sdTurboEngine.isReady()) {
          console.info('[memory-budgeter] shared ceiling: releasing SD-Turbo GPU sessions for WebLLM');
          await sdTurboEngine.dispose();
        }
      } else {
        const { webllmEngine } = await import('./webllm-engine');
        if (webllmEngine.isReady()) {
          console.info('[memory-budgeter] shared ceiling: releasing WebLLM GPU memory for SD-Turbo');
          await webllmEngine.dispose();
        }
      }
    } catch { /* other engine not loaded — nothing to release */ }
  });
  pending = run.catch(() => undefined);
  return run;
}
