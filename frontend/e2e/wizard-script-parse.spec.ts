import { test, expect } from '@playwright/test';

/**
 * R3 · D-56 — Wizard "Paste a script" auto-parse.
 * The video wizard (/video/create) splits a pasted script into one scene per
 * paragraph, and — when `---` rule lines are present — splits on those instead
 * (rule takes precedence over paragraph breaks). Real store logic
 * (editor-store.parseScriptIntoScenes), no mocks: we count the actual SceneCard
 * narration fields the parse produced.
 *
 * No model download needed — pure client parse, so this runs on the default
 * (ephemeral) profile in the fast lane.
 */

/** Number of SceneCards currently rendered (each has one narration textarea). */
const sceneCount = (page: import('@playwright/test').Page) =>
  page.getByPlaceholder('What the voiceover says for this scene...').count();

async function openPasteAndSplit(page: import('@playwright/test').Page, script: string) {
  await page.getByRole('button', { name: 'Paste a script' }).click();
  const paste = page.getByPlaceholder(/First scene narration/);
  await expect(paste).toBeVisible();
  await paste.fill(script);
  await page.getByRole('button', { name: 'Split into Scenes' }).click();
}

test('paragraph script → one scene per blank-line paragraph', async ({ page }) => {
  await page.goto('/video/create/');
  // Wizard hydrates client-side; the default single empty scene is present first.
  await expect(page.getByRole('heading', { name: 'Write Your Script' })).toBeVisible({ timeout: 20_000 });
  expect(await sceneCount(page)).toBe(1);

  await openPasteAndSplit(
    page,
    'Alpha — the opening hook that grabs attention.\n\n' +
      'Beta — the middle where the idea is explained.\n\n' +
      'Gamma — the payoff and call to action.',
  );

  // Three paragraphs ⇒ exactly three scenes.
  const narrationFields = page.getByPlaceholder('What the voiceover says for this scene...');
  await expect(narrationFields).toHaveCount(3);
  await expect(page.getByText('3 scenes', { exact: true })).toBeVisible();
  // Real content landed in the scene cards, split across paragraphs (the parse
  // put paragraph 1 in scene 1's narration field and paragraph 3 in scene 3's).
  await expect(narrationFields.nth(0)).toHaveValue(/the opening hook/);
  await expect(narrationFields.nth(2)).toHaveValue(/payoff and call to action/);
});

test('--- rule lines take precedence over paragraph breaks', async ({ page }) => {
  await page.goto('/video/create/');
  await expect(page.getByRole('heading', { name: 'Write Your Script' })).toBeVisible({ timeout: 20_000 });

  // Two `---`-delimited blocks; the first block itself contains a blank-line
  // paragraph break that must NOT cause a split once a rule is present.
  await openPasteAndSplit(
    page,
    'First block line one.\n\nFirst block line two, same scene.\n\n' +
      '---\n' +
      'Second block after the divider.',
  );

  // Rule split ⇒ two scenes (not three), proving `---` precedence.
  await expect(page.getByPlaceholder('What the voiceover says for this scene...')).toHaveCount(2);
  await expect(page.getByText('2 scenes', { exact: true })).toBeVisible();
});
