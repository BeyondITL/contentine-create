import { test, expect } from '@playwright/test';

/**
 * R3 · F-13 / SA-08 — Seed-lock UI + honest image-gen gating.
 *
 * Two things proven, no mocks:
 *  1. The seed-lock control (Law L6 reproducibility) renders on the Visuals
 *     step and is really interactive — toggling flips aria-pressed and enables
 *     the seed number input + Randomize.
 *  2. With IMAGE_GEN_ENABLED unset in the build (the default), triggering image
 *     generation does NOT fabricate an image: the request honestly fails to an
 *     error card (the DALL-E backend is absent on the static export, and the
 *     browser-native SD-Turbo path is flag-gated), leaving the scene image-less.
 *
 * Pure client + a no-op backend on the static export, so this runs on the
 * default (ephemeral) profile in the fast lane — no model download.
 */
test('seed-lock control renders and toggles; image gen is honestly gated', async ({ page }) => {
  await page.goto('/video/create/');
  await expect(page.getByRole('heading', { name: 'Write Your Script' })).toBeVisible({ timeout: 20_000 });

  // Give the single default scene narration (unblocks Next) + a visual prompt
  // (so the Visuals step will offer per-scene "Generate with AI").
  await page.getByPlaceholder('What the voiceover says for this scene...').first()
    .fill('A lighthouse keeper watches a storm roll in over the sea.');
  await page.getByPlaceholder(/Describe what the viewer sees/).first()
    .fill('a lighthouse on a cliff at sunset, dramatic clouds, cartoon style');

  // Advance to step 2 (Visuals).
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('heading', { name: 'Add Visuals' })).toBeVisible({ timeout: 20_000 });

  // ── 1. Seed-lock control renders and is interactive ──────────────────────
  const lockBtn = page.getByRole('button', { name: /Lock seed|Seed locked/ });
  await expect(lockBtn).toBeVisible();
  await expect(lockBtn).toHaveAttribute('aria-pressed', 'false');

  const seedInput = page.locator('#image-seed');
  await expect(seedInput).toBeVisible();

  // Lock it → aria-pressed flips, control becomes editable, value round-trips.
  await lockBtn.click();
  await expect(page.getByRole('button', { name: 'Seed locked' })).toHaveAttribute('aria-pressed', 'true');
  await seedInput.fill('12345');
  await expect(seedInput).toHaveValue('12345');
  await page.getByRole('button', { name: 'Randomize' }).click();
  await expect(seedInput).not.toHaveValue('12345'); // real randomize, real state

  // ── 2. Honest gating: generation fails loudly, never fabricates an image ──
  await page.getByRole('button', { name: 'Generate with AI' }).first().click();

  // An honest error card appears (DALL-E not configured / WebGPU-gated) with the
  // user's real Retry + Dismiss affordances — not a silent fake success.
  await expect(page.getByText(/DALL-E|WebGPU|Configure|Image generation failed/i).first())
    .toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Retry' }).first()).toBeVisible();

  // The scene stayed image-less — no fabricated pixels were injected.
  const sceneImages = page.locator('img[src^="blob:"], img[src^="data:"]');
  expect(await sceneImages.count()).toBe(0);
});
