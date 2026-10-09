import { api } from '@/lib/api';

/** Aspect ratio to pixel dimensions for SD Turbo (512-based for speed). */
const ASPECT_TO_DIMENSIONS: Record<string, { width: number; height: number }> = {
  '16:9': { width: 512, height: 288 },
  '9:16': { width: 288, height: 512 },
  '1:1':  { width: 512, height: 512 },
};

/**
 * Generate an image — tries backend API first (DALL-E 3), falls back to browser-native SD Turbo.
 * Returns a URL string (either a remote URL from the API or a blob: URL from SD Turbo).
 */
/** A selected character anchor's contribution to a generation (F-6 / F-34). */
export interface CharacterReference {
  /** Descriptor appended to the prompt so the same character recurs across scenes. */
  promptSuffix?: string;
  /** Reference photo URL, when the anchor has one. */
  referencePhoto?: string | null;
}

export async function generateImage(
  prompt: string,
  aspectRatio: string = '16:9',
  onProgress?: (fraction: number) => void,
  seed?: number,
  characterRef?: CharacterReference
): Promise<string> {
  // Character-anchor consumption (F-6): fold the anchor's descriptor into the
  // prompt so the character's traits carry across scenes on BOTH paths. The
  // seed lock (below) adds deterministic identity on the on-device path only.
  const suffix = characterRef?.promptSuffix?.trim();
  const effectivePrompt = suffix ? `${prompt.trim()}, ${suffix}` : prompt;

  // Attempt 1: Backend API (uses admin-configured DALL-E 3 key).
  // Note: `seed` only affects the browser-native SD-Turbo path below — the
  // DALL-E API does not expose seed control, so a locked seed is honest only
  // for on-device generation.
  try {
    const res = await api.post<{ url: string }>('/images/generate', {
      prompt: effectivePrompt,
      aspect_ratio: aspectRatio,
    });
    return res.url;
  } catch {
    // Backend unavailable or API key not configured — fall through to browser engine
  }

  // Attempt 2: Browser-native SD Turbo via WebGPU — only when the image-gen
  // tier is enabled (Deferral rule: SD-Turbo license go/no-go is a C-M2 gate;
  // until the operator's GO the on-device path is honestly OFF, never a
  // silent 2.5 GB download).
  const { IMAGE_GEN_ENABLED } = await import('@/lib/model-catalog');
  if (!IMAGE_GEN_ENABLED) {
    throw new Error(
      'On-device image generation is not available yet. Configure a DALL-E API key in settings to generate images.'
    );
  }
  const { sdTurboEngine } = await import('@/engine/sd-turbo-engine');

  const available = await sdTurboEngine.isAvailable();
  if (!available) {
    throw new Error(
      'Image generation failed. Configure a DALL-E API key in settings, or use a browser with WebGPU support and the shader-f16 feature (Chrome/Edge on a recent GPU).'
    );
  }

  await sdTurboEngine.initialize(onProgress);

  const dims = ASPECT_TO_DIMENSIONS[aspectRatio] || ASPECT_TO_DIMENSIONS['16:9'];
  const blob = await sdTurboEngine.generateImage(effectivePrompt, {
    width: dims.width,
    height: dims.height,
    // Seed-lock (Law L6): a fixed seed makes the same prompt reproduce the same
    // latents on any device. Undefined ⇒ SD-Turbo picks a random seed.
    seed,
  });

  return URL.createObjectURL(blob);
}
