import { DeviceCapabilities } from '@/types';

export function detectCapabilities(): DeviceCapabilities {
  const ram = (navigator as any).deviceMemory || 4;
  const cores = navigator.hardwareConcurrency || 4;
  const hasWebGPU = 'gpu' in navigator;
  const hasWebCodecs = 'VideoEncoder' in window;
  const hasSharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined';
  const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);

  if (hasWebGPU && ram >= 8 && cores >= 8 && !isMobile) {
    return {
      tier: 'high', hasWebGPU: true, hasWebCodecs, hasSharedArrayBuffer,
      ramGB: ram, cores, maxWorkers: 4, maxResolution: '4k',
      ttsDevice: 'webgpu', ttsQuantization: 'fp32',
    };
  }

  if (ram >= 4 && cores >= 4 && !isMobile) {
    return {
      tier: 'standard', hasWebGPU: false, hasWebCodecs, hasSharedArrayBuffer,
      ramGB: ram, cores, maxWorkers: 2, maxResolution: '1080p',
      ttsDevice: 'wasm', ttsQuantization: 'q8',
    };
  }

  if (ram >= 4 && isMobile) {
    return {
      tier: 'mobile', hasWebGPU: false, hasWebCodecs, hasSharedArrayBuffer,
      ramGB: ram, cores, maxWorkers: 1, maxResolution: '720p',
      ttsDevice: 'wasm', ttsQuantization: 'q8',
    };
  }

  return {
    tier: 'low', hasWebGPU: false, hasWebCodecs, hasSharedArrayBuffer,
    ramGB: ram, cores, maxWorkers: 1, maxResolution: '720p',
    ttsDevice: 'wasm', ttsQuantization: 'q4',
  };
}

let cached: DeviceCapabilities | null = null;

export function getCapabilities(): DeviceCapabilities {
  if (!cached) {
    cached = detectCapabilities();
    console.log(`[Contentine] Device tier: ${cached.tier} | RAM: ${cached.ramGB}GB | Cores: ${cached.cores} | WebGPU: ${cached.hasWebGPU} | WebCodecs: ${cached.hasWebCodecs}`);
  }
  return cached;
}
