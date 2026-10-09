import { test, expect, chromium } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * R4 · D3 — Cartoon TIMELINE EDITOR to spec (WS-4).
 *
 * The editor is gated behind a LIVE in-memory RenderSession — it only mounts
 * after a real cartoon render completes and the user clicks "Edit in Timeline"
 * (no store/session is exposed on window and the session is tab-lifetime, never
 * persisted). So this drives ONE real render (Kokoro TTS + deterministic MP4)
 * and then reuses that single session for every editor assertion:
 *
 *   • scrub — the range control repaints the preview and advances the
 *     MM:SS:FF / MM:SS:FF readout (the exact export inner loop, Law L6 parity);
 *   • scene strip — each cell's flex-grow equals round(duration × 10)
 *     (flexGrow/10 ≈ compiled scene duration);
 *   • background-seed re-roll → a PARTIAL re-render report line
 *     ("Last re-roll: re-rendered 1, reused N untouched.");
 *   • narration edit → a FULL re-render with the exact fullRenderReason
 *     ("scene frame windows shifted (dialogue/duration edit changed timing)");
 *   • plan history — snapshots are shown and, because the editor session is
 *     tab-lifetime, survive reload ONLY as IndexedDB rows
 *     (contentine-cartoon-history / plan_snapshots), asserted via page.evaluate;
 *   • below the lg breakpoint (<1024px) the editor defers with its panel.
 *
 * Real engines, no mocks. Persistent profile + the download-all mirror route
 * hook (MODEL_MIRROR_URL); viewport starts wide enough for the editor grid.
 */

async function launch(): Promise<{ context: BrowserContext; page: Page; profileDir: string }> {
  const profileDir = mkdtempSync(join(tmpdir(), 'create-e2e-timeline-'));
  const context = await chromium.launchPersistentContext(profileDir, {
    args: ['--enable-unsafe-webgpu', '--use-angle=metal'],
    ignoreHTTPSErrors: true,
    viewport: { width: 1280, height: 900 }, // ≥ lg (1024) so the editor grid shows
  });
  const page = context.pages()[0] ?? (await context.newPage());
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !/notifications|CORS|Access-Control|ERR_FAILED/i.test(msg.text())) {
      console.log(`[console.error] ${msg.text().slice(0, 300)}`);
    }
  });
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

const readout = (page: Page) =>
  page.locator('span', { hasText: /\d\d:\d\d:\d\d \/ \d\d:\d\d:\d\d/ }).first();

test('timeline editor: scrub, strip widths, partial vs full re-roll, history persistence, deferral', async () => {
  test.setTimeout(55 * 60 * 1000);
  const { context, page, profileDir } = await launch();
  try {
    // ---- Drive one real render to a completed session -----------------------
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

    // The editor button only appears once the real render fully completes.
    const editBtn = page.getByRole('button', { name: 'Edit in Timeline' });
    await expect(editBtn).toBeVisible({ timeout: 45 * 60 * 1000 });
    console.log('[e2e] render completed; opening the timeline editor');
    await editBtn.click();

    // ---- Editor is mounted --------------------------------------------------
    const scrub = page.getByLabel('Scrub timeline');
    await expect(scrub).toBeVisible({ timeout: 30_000 });
    await expect(page.getByLabel('Cartoon timeline preview frame')).toBeVisible();

    // 1) Scrubbing advances the time readout (real seek + repaint).
    const before = await readout(page).innerText();
    await scrub.focus();
    for (let i = 0; i < 40; i++) await page.keyboard.press('ArrowRight');
    await expect
      .poll(async () => (await readout(page).innerText()) !== before, { timeout: 15_000 })
      .toBe(true);
    console.log(`[e2e] scrub readout moved: "${before}" → "${await readout(page).innerText()}"`);

    // 2) Scene-strip cell width tracks compiled duration (flexGrow ≈ dur×10).
    const strip = page.getByLabel('Scene strip');
    await expect(strip).toBeVisible();
    const cells = strip.getByRole('listitem');
    expect(await cells.count()).toBeGreaterThanOrEqual(1);
    const cell0 = cells.first();
    const durLabel = (await cell0.getAttribute('aria-label')) ?? '';
    const dur = Number(durLabel.match(/([\d.]+) seconds/)?.[1] ?? '0');
    const flexGrow = Number(await cell0.evaluate((el) => getComputedStyle(el as HTMLElement).flexGrow));
    console.log(`[e2e] scene 0: duration ${dur}s, flexGrow ${flexGrow} (expected ≈ ${Math.round(dur * 10)})`);
    expect(dur).toBeGreaterThan(0);
    expect(Math.abs(flexGrow - Math.round(dur * 10))).toBeLessThanOrEqual(1);

    // Select scene 0 so the inspector targets it.
    await cell0.click();

    // 3) Background-seed re-roll → PARTIAL re-render.
    const seedReroll = page.getByRole('button', { name: 'Re-roll', exact: true });
    await expect(seedReroll).toBeVisible();
    await seedReroll.click(); // marks scene dirty 'visual'
    const commit1 = page.getByRole('button', { name: /Re-roll \d+ edited scene/ });
    await expect(commit1).toBeEnabled({ timeout: 15_000 });
    await commit1.click();
    await expect(page.getByText(/Last re-roll: re-rendered 1, reused \d+ untouched\./)).toBeVisible({
      timeout: 20 * 60 * 1000,
    });
    console.log(`[e2e] partial re-render: "${await page.getByText(/Last re-roll: re-rendered/).innerText()}"`);

    // 4) Narration edit → FULL re-render with the exact reason.
    await cell0.click();
    const narration = page.locator('textarea').first();
    await expect(narration).toBeVisible();
    await narration.fill(
      'A little robot waters a single glowing flower on the moon, then plants a whole quiet garden of them.',
    );
    const commit2 = page.getByRole('button', { name: /Re-roll \d+ edited scene/ });
    await expect(commit2).toBeEnabled({ timeout: 15_000 });
    await commit2.click();
    await expect(
      page.getByText(
        'Last re-roll: full render — scene frame windows shifted (dialogue/duration edit changed timing).',
      ),
    ).toBeVisible({ timeout: 25 * 60 * 1000 });
    console.log('[e2e] full re-render reason surfaced verbatim');

    // 5) Version history shows restorable snapshots.
    await expect(page.getByText('Version history')).toBeVisible();
    expect(await page.getByLabel(/^Restore /).count()).toBeGreaterThanOrEqual(1);

    // 6) Deferral panel below the lg breakpoint.
    await page.setViewportSize({ width: 1000, height: 900 });
    await expect(page.getByText('Open the timeline editor on a larger screen')).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(scrub).toBeVisible();

    // 7) Snapshots survive reload ONLY as IndexedDB rows (session is tab-lifetime).
    await page.reload();
    const snapCount = await page.evaluate(
      () =>
        new Promise<number>((resolve, reject) => {
          const req = indexedDB.open('contentine-cartoon-history');
          req.onerror = () => reject(req.error);
          req.onsuccess = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains('plan_snapshots')) return resolve(0);
            const tx = db.transaction('plan_snapshots', 'readonly');
            const c = tx.objectStore('plan_snapshots').count();
            c.onsuccess = () => resolve(c.result);
            c.onerror = () => reject(c.error);
          };
        }),
    );
    console.log(`[e2e] plan_snapshots rows after reload: ${snapCount}`);
    expect(snapCount).toBeGreaterThan(0);
  } finally {
    await context.close();
    rmSync(profileDir, { recursive: true, force: true });
  }
});
