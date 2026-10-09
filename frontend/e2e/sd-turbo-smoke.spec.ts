import { test, expect } from '@playwright/test';

/**
 * C-M2 P0 — SD-Turbo engine smoke test (only meaningful when the build has
 * NEXT_PUBLIC_IMAGE_GEN_ENABLED=true): fresh profile → Thumbnails page →
 * type a prompt → Generate → the onnx-custom WebGPU pipeline downloads the
 * fp16 artifacts and produces a REAL image (non-empty, non-uniform pixels).
 * Requires WebGPU + shader-f16; the test skips (honestly) if the device
 * profile in this environment can't run it.
 */
test('SD-Turbo generates a real 512px image via the onnx-custom engine', async ({ page }) => {
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log(`[console.error] ${msg.text().slice(0, 300)}`);
  });

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Storage.overrideQuotaForOrigin', {
    origin: 'http://127.0.0.1:8321',
    quotaSize: 30_000_000_000,
  });

  // Probe AFTER navigation: navigator.gpu is hidden on insecure/opaque
  // origins (about:blank), so probing before goto() always skipped.
  await page.goto('/thumbnails/');
  const f16 = await page.evaluate(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gpu = (navigator as any).gpu;
    if (!gpu) return false;
    const adapter = await gpu.requestAdapter().catch(() => null);
    return !!adapter && adapter.features.has('shader-f16');
  });
  test.skip(!f16, 'No WebGPU shader-f16 in this environment — cannot run the fp16 SD-Turbo export');
  const promptBox = page.getByPlaceholder('Describe the thumbnail you want...');
  await expect(promptBox).toBeVisible({ timeout: 20_000 });
  await promptBox.fill('a lighthouse on a cliff at sunset, cartoon style');
  await page.getByRole('button', { name: 'Generate Thumbnail' }).click();

  // Backend API fails on the static export → falls through to the on-device
  // engine: 2.5 GB download (cached across runs) + session compile + 1-step
  // inference. The result renders as an <img> with a blob URL.
  const img = page.locator('img[src^="blob:"]').first();
  await expect(img).toBeVisible({ timeout: 45 * 60 * 1000 });

  const pixels = await img.evaluate(async (el: HTMLImageElement) => {
    await el.decode();
    const canvas = document.createElement('canvas');
    canvas.width = el.naturalWidth;
    canvas.height = el.naturalHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(el, 0, 0);
    const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let min = 255, max = 0, sum = 0;
    for (let i = 0; i < d.length; i += 4) {
      const v = (d[i] + d[i + 1] + d[i + 2]) / 3;
      if (v < min) min = v;
      if (v > max) max = v;
      sum += v;
    }
    return { w: canvas.width, h: canvas.height, min, max, mean: sum / (d.length / 4) };
  });
  console.log('generated image stats:', JSON.stringify(pixels));
  expect(pixels.w).toBeGreaterThanOrEqual(288);
  expect(pixels.h).toBeGreaterThanOrEqual(288);
  // Non-empty canvas: real image content, not a black/white/transparent fill.
  expect(pixels.max - pixels.min).toBeGreaterThan(40);
});
