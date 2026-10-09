'use client';

/** Device capability scanner — detects GPU, system, and API support for browser-native AI. */

import { CATALOG_VERSION, isCatalogId, recommendForTier } from '@/lib/model-catalog';

export interface DeviceProfile {
  gpu: {
    available: boolean;
    vendor: string;
    architecture: string;
    vramEstimateMB: number;
    /**
     * Unified-memory device (Apple Silicon): vramEstimateMB is GPU-ADDRESSABLE
     * memory SHARED with the system, not dedicated VRAM — UI must label it so
     * and the runtime budgeter must treat it as a shared ceiling.
     */
    unifiedMemory: boolean;
    renderer: string;
    webgpuSupported: boolean;
  };
  system: {
    ramGB: number;
    cpuCores: number;
    platform: string;
    isMobile: boolean;
    browser: string;
    browserVersion: string;
  };
  apis: {
    webgpu: boolean;
    webgl2: boolean;
    webcodecs: boolean;
    sharedArrayBuffer: boolean;
    serviceWorker: boolean;
    indexedDB: boolean;
    offscreenCanvas: boolean;
    wasmSimd: boolean;
    wasmThreads: boolean;
  };
  tier: 'high' | 'medium' | 'low' | 'unsupported';
  recommendedModels: {
    llm: string | null;
    tts: string | null;
    imageGen: string | null;
    lipSync: string | null;
    stt: string | null;
  };
  warnings: string[];
  scannedAt: number;
  /**
   * Model-catalog version this profile was built against. Profiles cached
   * before a catalog change are discarded on read, so a stale localStorage
   * profile can never resurrect removed/quarantined model recommendations
   * (the live "wav2lip in the Recommended strip" leak — C-M2 P0 round two).
   */
  catalogVersion?: number;
}

const CACHE_KEY = 'contentine_device_profile';
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/** Detect GPU vendor from renderer string. */
function detectGPUVendor(renderer: string): string {
  const r = renderer.toLowerCase();
  if (r.includes('apple')) return 'apple';
  if (r.includes('nvidia') || r.includes('geforce') || r.includes('rtx') || r.includes('gtx')) return 'nvidia';
  if (r.includes('amd') || r.includes('radeon')) return 'amd';
  if (r.includes('intel') || r.includes('iris') || r.includes('uhd')) return 'intel';
  return 'unknown';
}

/** Detect GPU architecture from renderer string. */
function detectGPUArchitecture(renderer: string, vendor: string): string {
  const r = renderer.toLowerCase();
  if (vendor === 'apple') {
    if (r.includes('m4')) return 'm4';
    if (r.includes('m3')) return 'm3';
    if (r.includes('m2')) return 'm2';
    if (r.includes('m1')) return 'm1';
    if (r.includes('a17') || r.includes('a16') || r.includes('a15')) return 'a-series';
    return 'apple-gpu';
  }
  if (vendor === 'nvidia') {
    if (r.includes('ada') || r.includes('4090') || r.includes('4080') || r.includes('4070') || r.includes('4060')) return 'ada-lovelace';
    if (r.includes('ampere') || r.includes('3090') || r.includes('3080') || r.includes('3070') || r.includes('3060')) return 'ampere';
    if (r.includes('turing') || r.includes('2080') || r.includes('2070') || r.includes('2060')) return 'turing';
    return 'nvidia-gpu';
  }
  if (vendor === 'amd') {
    if (r.includes('rdna3') || r.includes('7900') || r.includes('7800') || r.includes('7700')) return 'rdna3';
    if (r.includes('rdna2') || r.includes('6900') || r.includes('6800') || r.includes('6700')) return 'rdna2';
    return 'amd-gpu';
  }
  if (vendor === 'intel') {
    if (r.includes('arc')) return 'arc';
    if (r.includes('iris xe')) return 'iris-xe';
    return 'intel-integrated';
  }
  return 'unknown';
}

/** Detect browser name and version. */
function detectBrowser(): { browser: string; version: string } {
  if (typeof navigator === 'undefined') return { browser: 'Unknown', version: '' };
  const ua = navigator.userAgent;
  if (ua.includes('Edg/')) {
    const m = ua.match(/Edg\/([\d.]+)/);
    return { browser: 'Edge', version: m?.[1] || '' };
  }
  if (ua.includes('Chrome/') && !ua.includes('Edg/')) {
    const m = ua.match(/Chrome\/([\d.]+)/);
    return { browser: 'Chrome', version: m?.[1] || '' };
  }
  if (ua.includes('Firefox/')) {
    const m = ua.match(/Firefox\/([\d.]+)/);
    return { browser: 'Firefox', version: m?.[1] || '' };
  }
  if (ua.includes('Safari/') && !ua.includes('Chrome')) {
    const m = ua.match(/Version\/([\d.]+)/);
    return { browser: 'Safari', version: m?.[1] || '' };
  }
  return { browser: 'Unknown', version: '' };
}

/** Detect OS platform. */
function detectPlatform(): { platform: string; isMobile: boolean } {
  if (typeof navigator === 'undefined') return { platform: 'Unknown', isMobile: false };
  const ua = navigator.userAgent;
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  if (ua.includes('Mac OS X') || ua.includes('Macintosh')) return { platform: 'macOS', isMobile: false };
  if (ua.includes('Windows')) return { platform: 'Windows', isMobile: false };
  if (ua.includes('Linux') && !ua.includes('Android')) return { platform: 'Linux', isMobile: false };
  if (ua.includes('Android')) return { platform: 'Android', isMobile: true };
  if (/iPhone|iPad|iPod/.test(ua)) return { platform: 'iOS', isMobile: true };
  return { platform: 'Unknown', isMobile };
}

/** Check WASM SIMD support. */
async function checkWasmSimd(): Promise<boolean> {
  try {
    // Minimal WASM binary with SIMD v128 type
    const bytes = new Uint8Array([0,97,115,109,1,0,0,0,1,5,1,96,0,1,123,3,2,1,0,10,10,1,8,0,65,0,253,15,253,98,11]);
    const valid = WebAssembly.validate(bytes);
    return valid;
  } catch {
    return false;
  }
}

/** Check WASM threads support. */
function checkWasmThreads(): boolean {
  try {
    return typeof SharedArrayBuffer !== 'undefined';
  } catch {
    return false;
  }
}

/** Get WebGL2 renderer info. */
function getWebGL2Renderer(): { renderer: string; vendor: string } {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return { renderer: '', vendor: '' };
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (!ext) return { renderer: gl.getParameter(gl.RENDERER) || '', vendor: '' };
    return {
      renderer: gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '',
      vendor: gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) || '',
    };
  } catch {
    return { renderer: '', vendor: '' };
  }
}

/** Detect if running on Apple Silicon via WebGL renderer string. */
function isAppleSiliconGPU(renderer: string): boolean {
  const r = renderer.toLowerCase();
  return r.includes('apple') &&
    (r.includes('m1') || r.includes('m2') || r.includes('m3') || r.includes('m4') || r.includes('apple gpu'));
}

/** Estimate VRAM from WebGPU maxBufferSize, with Apple Silicon unified memory correction. */
async function estimateVRAM(): Promise<number> {
  try {
    if (!('gpu' in navigator)) return 0;
    const adapter = await (navigator as any).gpu.requestAdapter();
    if (!adapter) return 0;
    const device = await adapter.requestDevice();
    const maxBuffer = device.limits.maxBufferSize;
    device.destroy();
    // maxBufferSize is the max single allocation, VRAM is typically 2-4x that
    let vramMB = Math.round((maxBuffer / (1024 * 1024)) * 2);

    // Apple Silicon uses unified memory — WebGPU buffer limit doesn't reflect
    // actual available GPU memory. Use ~75% of system RAM instead.
    const renderer = getWebGL2Renderer().renderer;
    if (isAppleSiliconGPU(renderer)) {
      const systemRAM = (navigator as any).deviceMemory || 0; // GB
      if (systemRAM > 0) {
        const unifiedVRAM = Math.round(systemRAM * 0.75 * 1024); // 75% of RAM in MB
        vramMB = Math.max(vramMB, unifiedVRAM);
      } else {
        // deviceMemory API unavailable — assume at least 4GB for Apple Silicon
        vramMB = Math.max(vramMB, 4096);
      }
    }

    return vramMB;
  } catch {
    return 0;
  }
}

/** Calculate device tier from capabilities. */
function calculateTier(profile: Omit<DeviceProfile, 'tier' | 'recommendedModels' | 'warnings'>): DeviceProfile['tier'] {
  const { gpu, system, apis } = profile;

  if (!apis.webgpu && !apis.webgl2) return 'unsupported';
  if (system.isMobile && profile.system.browser === 'Safari') return 'unsupported';

  // Apple Silicon with unified memory is always at least medium
  if (isAppleSiliconGPU(gpu.renderer) && apis.webgpu) {
    if (system.ramGB >= 8) return 'high'; // M-series with 8GB+ can handle all models
    return 'medium'; // Even low-RAM Apple Silicon is medium at worst
  }

  // Generic tier calculation for non-Apple-Silicon
  if (apis.webgpu && gpu.vramEstimateMB >= 4096 && system.ramGB >= 8 && system.cpuCores >= 4) return 'high';
  if (apis.webgpu && gpu.vramEstimateMB >= 2048 && system.ramGB >= 4) return 'medium';
  if (apis.webgpu || apis.webgl2) return 'low';

  return 'unsupported';
}

/**
 * Recommended models come ONLY from the catalog (single-catalog rule, C-M2 P0
 * round two) — no hardcoded id mapping here. Quarantined models (Wav2Lip,
 * F5-TTS — Law L4) have no catalog entries, so they can never be recommended;
 * the Lip-Sync slot is honestly null until WS-5 lands a commercially-clean
 * path (the MIT TalkingHead 3D avatar tier is separate and remains live).
 */
function getRecommendedModels(tier: DeviceProfile['tier']): DeviceProfile['recommendedModels'] {
  return recommendForTier(tier);
}

/** Generate warnings based on device profile. */
function getWarnings(profile: Omit<DeviceProfile, 'warnings'>): string[] {
  const w: string[] = [];
  if (!profile.apis.webgpu) w.push('WebGPU not available — AI features require Chrome 113+ or Edge 113+.');
  if (!profile.apis.webgl2) w.push('WebGL2 not supported — basic rendering may be affected.');
  if (!profile.apis.webcodecs) w.push('WebCodecs not available — video encoding will use fallback (slower).');
  if (!profile.apis.indexedDB) w.push('IndexedDB not available — model caching will not work.');
  if (profile.system.ramGB > 0 && profile.system.ramGB < 4) w.push('Less than 4GB RAM detected — AI models may struggle.');
  if (profile.system.isMobile) w.push('Mobile device detected — browser AI features are limited. Backend APIs will be used instead.');
  // Only warn about low VRAM on non-Apple-Silicon devices (Apple Silicon uses unified memory)
  if (profile.gpu.vramEstimateMB > 0 && profile.gpu.vramEstimateMB < 2048 && !isAppleSiliconGPU(profile.gpu.renderer)) {
    w.push('Low GPU memory — large AI models (image gen, 3B LLM) unavailable.');
  }
  return w;
}

/** Device scanner singleton. */
class DeviceScanner {
  /** Run a full device capability scan. */
  async scan(): Promise<DeviceProfile> {
    const { browser, version } = detectBrowser();
    const { platform, isMobile } = detectPlatform();
    const webgl = getWebGL2Renderer();
    const vramEstimateMB = await estimateVRAM();
    const hasWebGPU = typeof navigator !== 'undefined' && 'gpu' in navigator;
    let webgpuSupported = false;

    if (hasWebGPU) {
      try {
        const adapter = await (navigator as any).gpu.requestAdapter();
        webgpuSupported = adapter !== null;
      } catch { /* no-op */ }
    }

    const renderer = webgl.renderer || 'Unknown GPU';
    const vendor = detectGPUVendor(renderer);
    const architecture = detectGPUArchitecture(renderer, vendor);

    const wasmSimd = await checkWasmSimd();

    const partial = {
      gpu: {
        available: webgpuSupported || !!webgl.renderer,
        vendor,
        architecture,
        vramEstimateMB,
        unifiedMemory: isAppleSiliconGPU(renderer),
        renderer,
        webgpuSupported,
      },
      system: {
        ramGB: (navigator as any).deviceMemory || 0,
        cpuCores: navigator.hardwareConcurrency || 1,
        platform,
        isMobile,
        browser,
        browserVersion: version,
      },
      apis: {
        webgpu: webgpuSupported,
        webgl2: !!document.createElement('canvas').getContext('webgl2'),
        webcodecs: typeof VideoEncoder !== 'undefined',
        sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
        serviceWorker: 'serviceWorker' in navigator,
        indexedDB: 'indexedDB' in window,
        offscreenCanvas: typeof OffscreenCanvas !== 'undefined',
        wasmSimd,
        wasmThreads: checkWasmThreads(),
      },
      scannedAt: Date.now(),
    };

    const tier = calculateTier(partial);
    const recommendedModels = getRecommendedModels(tier);
    const profile: DeviceProfile = { ...partial, tier, recommendedModels, warnings: [], catalogVersion: CATALOG_VERSION };
    profile.warnings = getWarnings(profile);

    // Cache
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(profile));
    } catch { /* quota exceeded — ignore */ }

    return profile;
  }

  /**
   * Get cached profile from localStorage. Profiles from an older catalog
   * version are discarded (forces a re-scan → fresh recommendations), and the
   * recommendation ids are re-validated against the current catalog anyway —
   * a cached profile can never surface a model id the catalog doesn't have.
   */
  getCached(): DeviceProfile | null {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const profile = JSON.parse(raw) as DeviceProfile;
      if (profile.catalogVersion !== CATALOG_VERSION) return null;
      const rec = profile.recommendedModels ?? ({} as DeviceProfile['recommendedModels']);
      profile.recommendedModels = {
        llm: isCatalogId(rec.llm) ? rec.llm : null,
        tts: isCatalogId(rec.tts) ? rec.tts : null,
        imageGen: isCatalogId(rec.imageGen) ? rec.imageGen : null,
        lipSync: isCatalogId(rec.lipSync) ? rec.lipSync : null,
        stt: isCatalogId(rec.stt) ? rec.stt : null,
      };
      return profile;
    } catch {
      return null;
    }
  }

  /** Get cached profile if fresh, otherwise scan. */
  async getOrScan(): Promise<DeviceProfile> {
    const cached = this.getCached();
    if (cached) {
      const age = Date.now() - cached.scannedAt;
      const coresMatch = navigator.hardwareConcurrency === cached.system.cpuCores;
      const ramMatch = ((navigator as any).deviceMemory || 0) === cached.system.ramGB || cached.system.ramGB === 0;
      // GPU renderer distinguishes machines that share CPU-core count AND the
      // (Chrome-capped-at-8) deviceMemory value — e.g. two different Apple-
      // Silicon Macs. Without it, a machine swap silently serves a stale profile
      // (deploy-lane §B.6). Same 'Unknown GPU' fallback the scan writes.
      const currentRenderer = getWebGL2Renderer().renderer || 'Unknown GPU';
      const rendererMatch = currentRenderer === cached.gpu.renderer;
      if (age < CACHE_MAX_AGE_MS && coresMatch && ramMatch && rendererMatch) {
        return cached;
      }
    }
    return this.scan();
  }

  /** Clear cached profile. */
  clearCache(): void {
    try { localStorage.removeItem(CACHE_KEY); } catch { /* ignore */ }
  }
}

export const deviceScanner = new DeviceScanner();
