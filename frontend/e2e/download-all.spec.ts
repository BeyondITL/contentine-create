import { test, expect, chromium } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * C-M2 P0 round-two ACCEPTANCE: fresh profile → Models page → "Download All"
 * → EVERY catalog model reaches state READY, against the real HF/MLC CDN
 * through each model's real engine (WebLLM / kokoro-js / transformers.js /
 * onnx-custom). Exercises the whole state machine: queued → downloading →
 * finalizing → verifying → ready — including the previously-stuck second LLM
 * (Qwen "Downloading 100%") and the previously-broken SD-Turbo path.
 *
 * Runs in a PERSISTENT context (fresh temp profile dir): Playwright's
 * ephemeral contexts get a small storage quota and a flaky Cache Storage
 * backend at multi-GB scale ("Quota exceeded" / "Unexpected internal error"
 * on put) — failure modes real Chrome profiles don't have. Transient CDN /
 * storage errors surface as honest error cards; the test uses the same Retry
 * button a user has, at most 3 times, loudly logged.
 */
test('fresh profile: Download All reaches READY on all catalog models', async () => {
  const profileDir = mkdtempSync(join(tmpdir(), 'create-e2e-profile-'));
  // ignoreHTTPSErrors: the local mirror (MODEL_MIRROR_URL) serves HTTPS with a
  // self-signed localhost cert; without this the browser would reject it. No
  // effect on the real-CDN (canary) lane.
  const context = await chromium.launchPersistentContext(profileDir, {
    args: ['--enable-unsafe-webgpu', '--use-angle=metal'],
    ignoreHTTPSErrors: true,
  });
  try {
    const page = context.pages()[0] ?? (await context.newPage());
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !/notifications|CORS|Access-Control/i.test(msg.text())) {
        console.log(`[console.error] ${msg.text().slice(0, 300)}`);
      }
    });

    // Optional local-mirror lane (deploy-lane-fixes/MODEL_MIRROR_PLAN.md): when
    // MODEL_MIRROR_URL is set, redirect every model-byte host to the local
    // mirror by REWRITING THE REQUEST URL (route.continue), so the browser
    // fetches the bytes directly from the mirror — streaming, with backpressure,
    // exactly like a real CDN. This changes ONLY the byte source; the full
    // browser download→store→READY pipeline runs unchanged. Production is
    // untouched (a test-harness route hook, not app config). Unset = real CDN.
    //
    // We use continue({url}) — NOT fulfill — deliberately: routing multi-GB
    // model responses back through Playwright's CDP fulfill (buffered or
    // path-streamed) crashes the browser context on the first ~90 MB body. The
    // mirror is HTTPS so the origin switch keeps the same protocol, which
    // continue requires.
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

    await page.goto('http://127.0.0.1:8321/models/');
    await expect(page.getByText('Recommended for Your Device')).toBeVisible({ timeout: 30_000 });

    const downloadAll = page.getByRole('button', { name: /Download All/ });
    await expect(downloadAll).toBeVisible({ timeout: 20_000 });
    await downloadAll.click();

    // Poll toward the all-ready bar; generous deadline — several GB over the
    // network + three sequential GPU loads are real work.
    const allReadyBar = page.getByText('All recommended models ready');
    const deadline = Date.now() + 50 * 60 * 1000;
    let retriesUsed = 0;
    for (;;) {
      if (await allReadyBar.isVisible().catch(() => false)) break;
      if (Date.now() > deadline) break;
      // Retry any errored download even while other models are still queued or
      // in-flight: a stalled model can sit in `error` right next to a sibling
      // stuck in `queued`, so gating retries on a fully-idle page (inFlight === 0)
      // would never fire. Clicking Retry clears the card back to queued/downloading,
      // which paces retries naturally; the cap stays at 3 passes.
      const inFlight = await page
        .locator('text=/Downloading|Queued|Finalizing|Verifying/')
        .count()
        .catch(() => 0);
      const retryButtons = page.getByRole('button', { name: 'Retry' });
      const errCount = await retryButtons.count().catch(() => 0);
      if (errCount > 0 && retriesUsed < 3) {
        retriesUsed++;
        const errors = await page
          .locator('.bento-card', { has: retryButtons })
          .allInnerTexts()
          .catch(() => []);
        console.log(`[e2e] retry pass ${retriesUsed}: ${errCount} errored download(s), ${inFlight} still in-flight:\n${errors.join('\n---\n').slice(0, 800)}`);
        for (const b of await retryButtons.all()) await b.click();
      }
      await page.waitForTimeout(5_000);
    }

    await expect(allReadyBar).toBeVisible();
    console.log(`[e2e] all models ready (retry passes used: ${retriesUsed})`);

    const cardCount = await page.getByText('Ready to use').count();
    const expected = await page.evaluate(() => {
      const m = document.body.innerText.match(/(\d+)\/(\d+)/);
      return m ? Number(m[2]) : -1;
    });
    console.log(`[e2e] ready cards: ${cardCount}, catalog total: ${expected}`);
    expect(expected).toBeGreaterThan(0);
    expect(cardCount).toBe(expected);

    const bodyText = await page.evaluate(() => document.body.innerText);
    expect(bodyText).not.toMatch(/Download failed|Stalled while|failed the on-device cache check/i);

    // Restart-safety: a fresh page load re-verifies from the REAL caches and
    // still reports every model ready (no trust in localStorage alone).
    await page.reload();
    await expect(allReadyBar).toBeVisible({ timeout: 120_000 });
  } finally {
    await context.close();
    rmSync(profileDir, { recursive: true, force: true });
  }
});
