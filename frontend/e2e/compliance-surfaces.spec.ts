import { test, expect, chromium } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * R5 — Launch-compliance surfaces (Law L4 attribution + Law L7 / EU AI Act Art. 50
 * disclosure).
 *
 *  1. /notices renders the real license ledger: the "Built with Llama" callout,
 *     the AI-model-weights + libraries license tables (sourced from LICENSES.md,
 *     not invented), and the AI-content disclosure settings.
 *  2. The app-wide AppFooter carries "Built with Llama" + a Notices link on every
 *     page (mounted in AppShell), proven on two unrelated routes.
 *  3. AiGeneratedBadge is visible on a real generated-media result. All four badge
 *     surfaces (cartoon / video / thumbnails / writer) render the SAME shared
 *     component, and each only appears once real generated content exists — none
 *     is "render-free" (writer needs on-device Llama, thumbnails need image-gen
 *     which is flag-gated off, video needs the full pipeline). The cartoon result
 *     is the cheapest real proof (a ~seconds headless render on the shipped
 *     render-worker via the model mirror), so we drive that one for real and
 *     document the rest in reports/R5-e2e.md.
 *
 * No mocks (Law L1).
 */

const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{1F1E6}-\u{1F1FF}]/u;

test('notices: Built-with-Llama callout, license tables, disclosure settings', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  await page.goto('/notices');

  await expect(page.getByRole('heading', { name: 'Notices & Licenses', level: 1 })).toBeVisible({
    timeout: 20_000,
  });

  // Built with Llama callout (Meta Llama 3.2 Community — Law L4 mandated wording).
  await expect(page.getByRole('heading', { name: 'Built with Llama', level: 2 })).toBeVisible();
  await expect(page.getByText(/generated on-device by/)).toBeVisible();
  await expect(page.getByText('Meta Llama 3.2', { exact: true })).toBeVisible();

  // License tables — section titles + column headers + representative real rows.
  await expect(page.getByRole('heading', { name: 'AI model weights' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Libraries & runtimes' })).toBeVisible();
  for (const col of ['Component', 'Source', 'License']) {
    await expect(page.getByRole('columnheader', { name: col }).first()).toBeVisible();
  }
  // Rows straight from LICENSES.md — models + libs, with their governing licenses.
  await expect(page.getByRole('cell', { name: 'Kokoro TTS 82M', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Llama 3.2 (1B / 3B Instruct)' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'GSAP + plugins' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Mediabunny', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'MPL-2.0' })).toBeVisible();

  // AI-content disclosure settings (EU AI Act Art. 50) with its live toggle.
  await expect(page.getByRole('heading', { name: 'Content disclosure', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'AI-content disclosure' })).toBeVisible();
  await expect(page.getByText(/EU AI Act Art\. 50/)).toBeVisible();
  await expect(page.getByRole('switch')).toBeVisible();

  const bodyText = await page.locator('body').innerText();
  expect(bodyText, 'notices page must contain no emoji (Lucide-only brand)').not.toMatch(EMOJI);
  expect(pageErrors).toEqual([]);
});

test('footer: Built-with-Llama attribution present app-wide', async ({ page }) => {
  // Mounted in AppShell, so it rides under every page's content. Prove on two
  // unrelated routes that it is genuinely app-wide, not a one-page decoration.
  for (const route of ['/', '/billing']) {
    await page.goto(route);
    const footer = page.locator('footer');
    await expect(footer).toBeVisible({ timeout: 20_000 });
    const llama = footer.getByRole('link', { name: 'Built with Llama' });
    await expect(llama).toBeVisible();
    await expect(llama).toHaveAttribute('href', /\/notices\/?$/); // static export adds a trailing slash
    await expect(footer.getByRole('link', { name: 'Notices & Licenses' })).toBeVisible();
  }
});

// ── AiGeneratedBadge on a real cartoon render ────────────────────────────────
// Self-contained persistent context + the download-all mirror route hook, exactly
// like cartoon-timeline.spec.ts. Requires MODEL_MIRROR_URL (the seeded local
// mirror) — without it the render can't fetch Kokoro offline, so we skip loudly
// rather than pretend.
async function launch(): Promise<{ context: BrowserContext; page: Page; profileDir: string }> {
  const profileDir = mkdtempSync(join(tmpdir(), 'create-e2e-badge-'));
  const context = await chromium.launchPersistentContext(profileDir, {
    args: ['--enable-unsafe-webgpu', '--use-angle=metal'],
    ignoreHTTPSErrors: true,
    viewport: { width: 1280, height: 900 },
  });
  const page = context.pages()[0] ?? (await context.newPage());
  const mirror = process.env.MODEL_MIRROR_URL;
  if (mirror) {
    for (const host of ['huggingface.co', 'raw.githubusercontent.com']) {
      await context.route(`https://${host}/**`, async (route) => {
        const u = new URL(route.request().url());
        await route.continue({ url: `${mirror}/${host}${u.pathname}${u.search}` });
      });
    }
    console.log(`[e2e] model mirror ON → continue-redirect to ${mirror}`);
  }
  return { context, page, profileDir };
}

test('cartoon result: AiGeneratedBadge + Built-with-Llama on a real render', async () => {
  test.skip(!process.env.MODEL_MIRROR_URL, 'requires the seeded model mirror (MODEL_MIRROR_URL)');
  test.setTimeout(45 * 60 * 1000);
  const { context, page, profileDir } = await launch();
  try {
    await page.goto('http://127.0.0.1:8321/cartoon/');
    const textarea = page.locator('textarea').first();
    await expect(textarea).toBeVisible({ timeout: 20_000 });
    await textarea.fill('A little robot waters a single glowing flower on the moon.');
    await page.getByRole('button', { name: 'Next' }).click(); // → Style
    await page.getByRole('button', { name: 'Next' }).click(); // default style → Voice
    await page.waitForTimeout(1000);
    await page.locator('button', { hasText: /Sky|Bella|Adam|Michael|Emma/ }).first().click();
    await page.getByRole('button', { name: 'Next' }).click(); // → Generate

    const renderBtn = page.getByRole('button', { name: 'Render Cartoon' });
    await expect(renderBtn).toBeEnabled({ timeout: 20_000 });
    await renderBtn.click();

    // Result surface (stage === 'complete' && resultUrl) only mounts after a real
    // render finishes — the "Edit in Timeline" button is its tell.
    await expect(page.getByRole('button', { name: 'Edit in Timeline' })).toBeVisible({
      timeout: 45 * 60 * 1000,
    });

    // The rendered <video> carries the EU AI Act Art. 50 "AI-generated" corner
    // badge, and the on-device Llama attribution sits under it (Law L4/L7).
    await expect(page.getByText('AI-generated', { exact: true })).toBeVisible();
    await expect(page.locator('video')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Built with Llama' }).first()).toBeVisible();
    console.log('[e2e] AiGeneratedBadge + Built-with-Llama present on the completed cartoon result');
  } finally {
    await context.close();
    rmSync(profileDir, { recursive: true, force: true });
  }
});
