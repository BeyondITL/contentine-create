import { test, expect, chromium } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * R6 · WS-11 — the load-bearing bridge claim: the local-AI-bridge subtree is
 * OPTIONAL and ZERO-IMPACT. With NO local bridge service running:
 *
 *   (1) a full cartoon create → export (real render → Download MP4) works
 *       unchanged, and the cartoon path makes ZERO bridge probes (the bridge is
 *       never on the core-creation path, Law L2);
 *   (2) Settings → Device renders every bridge service as "Not detected" with an
 *       honest miss reason, within the short probe budget — no hang, no crash;
 *   (3) opting out via the checkbox yields the "Checks off" state and issues ZERO
 *       probe network requests (the opt-out attempts no network at all).
 *
 * "No bridge running" is modelled deterministically by refusing the connection to
 * the two probe origins (Draw Things :7860, ComfyUI :8188) — exactly what the
 * browser sees when nothing is listening. No product mocks (Law L1); the bridge
 * engine and UI run for real.
 */

// The bridge probes these loopback origins (detector.ts BRIDGE_SERVICES).
const BRIDGE_ORIGIN_RE = /^http:\/\/localhost:(7860|8188)(\/|$)/;

/** Route the two bridge origins to a refused connection, counting every hit. */
async function armBridgeRefusal(
  target: BrowserContext | Page,
  counter: { n: number },
): Promise<void> {
  await target.route(BRIDGE_ORIGIN_RE, async (route) => {
    counter.n += 1;
    await route.abort('connectionrefused');
  });
}

// ── (1) cartoon create → export, no bridge, zero bridge probes ───────────────
async function launchCartoon(): Promise<{ context: BrowserContext; page: Page; profileDir: string }> {
  const profileDir = mkdtempSync(join(tmpdir(), 'create-e2e-bridge-'));
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
  }
  return { context, page, profileDir };
}

test('cartoon create → export completes unchanged with no local bridge (zero bridge probes)', async () => {
  test.skip(!process.env.MODEL_MIRROR_URL, 'requires the seeded model mirror (MODEL_MIRROR_URL)');
  test.setTimeout(45 * 60 * 1000);
  const probes = { n: 0 };
  const { context, page, profileDir } = await launchCartoon();
  await armBridgeRefusal(context, probes); // nothing is listening on 7860/8188
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

    const downloadBtn = page.getByRole('button', { name: 'Download MP4' });
    await expect(downloadBtn).toBeVisible({ timeout: 45 * 60 * 1000 });

    // Export: the real blob download (handleDownload → <a download> click).
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      downloadBtn.click(),
    ]);
    const savePath = join(profileDir, 'out.mp4');
    await download.saveAs(savePath);
    const size = statSync(savePath).size;
    expect(download.suggestedFilename()).toMatch(/\.mp4$/);
    expect(size, 'exported MP4 is a real, non-trivial file').toBeGreaterThan(1000);
    console.log(`[e2e] cartoon exported ${size} bytes; bridge probes during create+export = ${probes.n}`);

    // Zero-impact: the entire create+export path never touched the bridge.
    expect(probes.n, 'cartoon flow must issue zero bridge probes').toBe(0);
  } finally {
    await context.close();
    rmSync(profileDir, { recursive: true, force: true });
  }
});

// ── (2) Device tab: every service "Not detected", within budget, no crash ────
test('device tab: every bridge service resolves to "Not detected" within budget, no hang/crash', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  const probes = { n: 0 };
  await armBridgeRefusal(page, probes);

  await page.goto('/settings?tab=device');

  await expect(page.getByRole('heading', { name: 'Local AI Services' })).toBeVisible({ timeout: 20_000 });
  // Both registered services are shown as rows.
  await expect(page.getByText('Draw Things', { exact: true })).toBeVisible();
  await expect(page.getByText('ComfyUI', { exact: true })).toBeVisible();

  // Pills transition Checking… → Not detected within the short probe budget
  // (1.5s/probe; refusal is instant). Bounded wait proves no hang.
  await expect(page.getByText('Not detected')).toHaveCount(2, { timeout: 15_000 });
  // Honest miss reason (unreachable → nothing listening).
  await expect(
    page.getByText('Not running — nothing is listening at this address.').first(),
  ).toBeVisible();

  // It genuinely probed (the detection ran), and the page did not crash.
  expect(probes.n, 'the device visit should have probed the bridge origins').toBeGreaterThan(0);
  expect(pageErrors, 'no uncaught page errors').toEqual([]);
});

// ── (3) opt-out → "Checks off" with ZERO probe network requests ──────────────
test('device tab: opt-out yields "Checks off" and issues zero probe requests', async ({ page }) => {
  const probes = { n: 0 };
  await armBridgeRefusal(page, probes);

  await page.goto('/settings?tab=device');
  await expect(page.getByRole('heading', { name: 'Local AI Services' })).toBeVisible({ timeout: 20_000 });
  // Wait until the mount probe has resolved both rows.
  await expect(page.getByText('Not detected')).toHaveCount(2, { timeout: 15_000 });

  // From here, count only what the OPT-OUT does.
  probes.n = 0;
  await page.getByRole('checkbox').uncheck();

  // Both rows flip to the honest "Checks off" state…
  await expect(page.getByText('Checks off')).toHaveCount(2);
  // …the Detect button is disabled (no way to trigger a probe while off)…
  await expect(page.getByRole('button', { name: 'Detect' })).toBeDisabled();

  // …and the opt-out issued ZERO network probes. Wait longer than one probe
  // budget (1.5s) so any stray fetch would have been counted.
  await page.waitForTimeout(2500);
  expect(probes.n, 'opt-out must attempt no bridge network at all').toBe(0);
});
