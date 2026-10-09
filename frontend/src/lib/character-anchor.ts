/**
 * Contentine Create — character-anchor → image-generation plumbing (F-6 / F-34).
 *
 * A selected character anchor contributes two things to the image-gen call path
 * (`lib/image-generator.ts`, which already consumes `seed` from F-13):
 *   1. a LOCKED SEED  → deterministic identity, so the same character recurs
 *      across scenes on the on-device SD-Turbo path (Law L6).
 *   2. a DESCRIPTOR + REFERENCE PHOTO → injected into each scene prompt so the
 *      character's traits stay consistent even on the DALL-E path (which ignores
 *      the seed).
 *
 * This module is pure — it turns an anchor into those parameters. Consumption is
 * gated: the seed-locked cross-scene consistency only materialises on the
 * on-device path, which is behind IMAGE_GEN_ENABLED (default off). Nothing here
 * generates anything or fakes a result.
 */

import type { CharacterAnchor } from '@/types';

export interface AnchorGeneration {
  /** Locked seed for a repeatable identity (on-device SD-Turbo path only). */
  seed?: number;
  /** Descriptor appended to a scene prompt so the same character recurs. */
  promptSuffix: string;
  /** Reference photo URL when the anchor has one (img2img-ready / shown to user). */
  referencePhoto: string | null;
}

/** Build the generation-time parameters a selected character anchor contributes. */
export function anchorGenerationParams(anchor: CharacterAnchor | null | undefined): AnchorGeneration {
  if (!anchor) return { promptSuffix: '', referencePhoto: null };

  const traits: string[] = [];
  if (anchor.gender) traits.push(anchor.gender);
  if (anchor.age_range) traits.push(anchor.age_range);
  if (anchor.ethnicity) traits.push(anchor.ethnicity);
  const who = traits.length ? `${traits.join(', ')} ` : '';
  const style = anchor.art_style || anchor.style;
  const desc = anchor.description_text ? `, ${anchor.description_text}` : '';

  // e.g. "featuring Nova, a female, 30s character, cartoon style, wearing a red jacket"
  const promptSuffix =
    `featuring ${anchor.name}, a ${who}character${style ? `, ${style} style` : ''}${desc}`.trim();

  return {
    seed: anchor.seed_value ?? undefined,
    promptSuffix,
    referencePhoto: anchor.photo_path ?? null,
  };
}

/**
 * Whether an anchor's seed-locked cross-scene consistency actually applies in
 * this build. The locked seed only affects the on-device SD-Turbo path, which is
 * behind IMAGE_GEN_ENABLED (default off). When off, the anchor's descriptor still
 * guides a DALL-E-configured backend, but the deterministic seed lock does not —
 * so the UI must gate the promise honestly rather than imply consistency it can't
 * deliver yet.
 */
export async function anchorSeedConsumptionEnabled(): Promise<boolean> {
  const { IMAGE_GEN_ENABLED } = await import('@/lib/model-catalog');
  return IMAGE_GEN_ENABLED;
}
