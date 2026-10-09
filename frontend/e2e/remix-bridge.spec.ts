import { test, expect } from '@playwright/test';

/**
 * R3 · F-12 / F-41 — Remix → video client bridge.
 *
 * There is no backend in the E2E harness (static out/ + serve.mjs), so we
 * exercise the parts of the bridge that are honestly reachable client-side and
 * document the part that can only be proven against a live backend.
 *
 * PROVEN HERE (client bridge, no backend):
 *   /video/create?videoId=<bogus> hydration error path. The wizard tries to
 *   hydrate the store from a non-existent video id, that lookup yields no
 *   scenes, and the UI degrades HONESTLY — a dismissible error banner, no
 *   crash, and the empty wizard is preserved (nothing was clobbered).
 *
 * GATED (needs a live backend — NOT stubbed to green):
 *   The success path (real videoId → store hydrated with scenes) and the
 *   Remix-Hub → editor population (OutputTabs.loadFromRemixScript) both require
 *   the backend/LLM to produce a video record / generated video-script first.
 *   Those are proven against a live backend + on-device LLM, not faked here.
 */
test('?videoId bridge: bogus id degrades to an honest banner, wizard preserved', async ({ page }) => {
  await page.goto('/video/create/?videoId=bogus-nonexistent-9999');

  // The wizard still comes up (no crash) on the empty script step.
  await expect(page.getByRole('heading', { name: 'Write Your Script' })).toBeVisible({ timeout: 30_000 });

  // Honest failure banner from the bridge. The bridge caught the failed lookup
  // and surfaced a dismissible danger banner (the Dismiss control lives ONLY
  // inside that banner) — no fake success, no crash. In this backend-less
  // harness the lookup fails at the network layer ("Failed to fetch"); against
  // a live backend a bogus id returns a real 404 message. Either way the
  // client bridge's honest-degrade behaviour is identical, so we assert the
  // banner + log whatever message rendered rather than pin backend-specific text.
  const dismiss = page.getByRole('button', { name: 'Dismiss' }).first();
  await expect(dismiss).toBeVisible({ timeout: 30_000 });
  const bannerMsg = await dismiss.locator('xpath=preceding-sibling::span').first().innerText().catch(() => '');
  console.log(`[e2e] bridge honest-degrade banner message: ${JSON.stringify(bannerMsg)}`);
  expect(bannerMsg.trim().length).toBeGreaterThan(0);

  // The empty wizard was preserved: the single default (empty) scene is intact
  // (the bridge never clobbers an empty wizard with junk).
  const narration = page.getByPlaceholder('What the voiceover says for this scene...');
  await expect(narration).toHaveCount(1);
  await expect(narration.first()).toHaveValue('');

  // The banner is dismissible (real control, not a dead panel).
  await dismiss.click();
  await expect(page.getByRole('button', { name: 'Dismiss' })).toHaveCount(0);
});
