import { test, expect } from '@playwright/test';
import { buildCartoonScenePlan } from '../src/lib/cartoon/scene-plan-builder';
import { getCartoonStyle, DEFAULT_STYLE_ID, CARTOON_STYLES } from '../src/lib/cartoon/styles';

/**
 * R4 · D2 — Cartoon STYLE selection to spec (WS-3).
 *
 * Two honest proofs, no model download (pure client wizard + the real plan
 * builder):
 *
 *  1. DOM E2E — the Style step renders exactly the 5 shipped style cards as
 *     PLAIN buttons (no ARIA tab/selected semantics), the default selection is
 *     `cutout-comedy` ("Cutout Comedy"), clicking a different card ("Flat
 *     Explainer") moves the selection (check icon + border-primary), and the
 *     chosen style carries all the way into the Step-4 generate summary "Style"
 *     row. Real `useCartoonStore.setStyleId`; no store is exposed on window, so
 *     everything is asserted through the DOM the user sees.
 *
 *  2. Real-builder unit — the SHIPPING decomposition `buildCartoonScenePlan`
 *     maps the selected style's `rigId` onto every scene's first character
 *     (`plan.scenes[0].characters[0].rigId`): default → `tracer-stick`,
 *     `flat-explainer` → `flat-presenter`. This is the exact code the render
 *     path runs; calling it directly proves the style→rig wiring without
 *     needing a full ~87MB render just to inspect the plan.
 */

/** Enter one narrated scene on Step 1, then advance into the Style step. */
async function reachStyleStep(page: import('@playwright/test').Page) {
  await page.goto('/cartoon/');
  const textarea = page.locator('textarea').first();
  await expect(textarea).toBeVisible({ timeout: 20_000 });
  await textarea.fill('A curious robot finds a garden on the moon and grows flowers.');
  await page.getByRole('button', { name: 'Next' }).click();
  // "5 styles available — each renders fully on your device." anchors the step.
  await expect(page.getByText(/styles available/)).toBeVisible();
}

test('Style step: 5 plain-button cards, cutout-comedy default, selection moves to Flat Explainer', async ({
  page,
}) => {
  await reachStyleStep(page);

  // Exactly the 5 shipped style cards, each a plain <button> (no ARIA tabs).
  const names = ['Cutout Comedy', 'Flat Explainer', 'Whiteboard', 'Kinetic Type', 'Chibi'];
  for (const n of names) await expect(page.getByRole('button', { name: new RegExp(n) })).toBeVisible();
  expect(await page.getByRole('tab').count()).toBe(0);
  expect(await page.getByText(`${CARTOON_STYLES.length} styles available`, { exact: false })).toBeVisible();

  const cutout = page.getByRole('button', { name: /Cutout Comedy/ });
  const flat = page.getByRole('button', { name: /Flat Explainer/ });

  // Selection is conveyed by class + injected check icon only — NOT aria-selected.
  expect(await cutout.getAttribute('aria-selected')).toBeNull();
  expect(await flat.getAttribute('aria-selected')).toBeNull();

  // Default = cutout-comedy (styles.ts DEFAULT_STYLE_ID / store init). Selection
  // shows as border-primary + an injected check badge (a div.bg-primary that
  // only renders when isSelected) — this lucide build emits no `lucide-check`
  // class, so assert the badge wrapper, not the svg class.
  await expect(cutout).toHaveClass(/border-primary/);
  expect(await cutout.locator('div.bg-primary').count()).toBeGreaterThan(0);
  await expect(flat).not.toHaveClass(/border-primary/);
  expect(await flat.locator('div.bg-primary').count()).toBe(0);

  // Pick a non-default card → selection moves (real setStyleId).
  await flat.click();
  await expect(flat).toHaveClass(/border-primary/);
  expect(await flat.locator('div.bg-primary').count()).toBeGreaterThan(0);
  await expect(cutout).not.toHaveClass(/border-primary/);
  expect(await cutout.locator('div.bg-primary').count()).toBe(0);

  // The chosen style must survive into the Step-4 generate summary. Advance
  // Style → Voice (pick a preset, no model needed to select) → Generate.
  await page.getByRole('button', { name: 'Next' }).click();
  await page.waitForTimeout(1000); // voice presets hydrate
  const voiceCard = page.locator('button', { hasText: /Sky|Bella|Adam|Michael|Emma/ }).first();
  await expect(voiceCard).toBeVisible({ timeout: 20_000 });
  await voiceCard.click();
  await page.getByRole('button', { name: 'Next' }).click();

  // Step 4 summary shows the selected style's NAME in its "Style" row.
  await expect(page.getByRole('heading', { name: 'Render & Download' })).toBeVisible();
  await expect(page.getByText('Flat Explainer')).toBeVisible();
});

test('real builder: selected style rigId lands on scene character (plan.scenes[0].characters[0].rigId)', () => {
  const base = {
    title: 'Rig proof',
    scenes: [{ id: 's1', narration: 'Hello there, this is a rig-mapping check.' }],
    kokoroVoiceId: 'af_sky',
    voiceSpeed: 1,
    resolution: { width: 1080, height: 1920 },
  };

  // Sanity: the default is what the DOM test relies on.
  expect(DEFAULT_STYLE_ID).toBe('cutout-comedy');

  const def = buildCartoonScenePlan({ ...base, style: getCartoonStyle(DEFAULT_STYLE_ID) });
  expect(def.scenes[0].characters[0].rigId).toBe('tracer-stick');

  const flat = buildCartoonScenePlan({ ...base, style: getCartoonStyle('flat-explainer') });
  expect(flat.scenes[0].characters[0].rigId).toBe('flat-presenter');

  // The style NAME (asserted in the DOM summary) and rigId are distinct
  // namespaces — guard against anyone collapsing them.
  expect(getCartoonStyle('flat-explainer').name).toBe('Flat Explainer');
  expect(getCartoonStyle('flat-explainer').rigId).toBe('flat-presenter');
});
