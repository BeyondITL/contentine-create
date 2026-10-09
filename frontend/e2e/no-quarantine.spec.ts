import { test, expect } from '@playwright/test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * C-M2 P0 — quarantine + Law-L2 bundle gates (the "no-quarantined-IDs E2E",
 * now actually running).
 *
 * 1. No quarantined model id (wav2lip, f5-tts — Law L4) renders on any P0
 *    surface (dashboard, models, cartoon), on a FRESH profile.
 * 2. Regression for the live leak: a STALE cached device profile that still
 *    recommends 'wav2lip' must be discarded/sanitized, never rendered.
 * 3. Bundle check: no model URL goes through the server (`/api/models/`),
 *    and the dead transformers.js 'text-to-image' pipeline call is gone.
 */

const QUARANTINED = /wav2lip|f5[-\s]?tts/i;
const P0_SURFACES = ['/', '/models/', '/cartoon/'];

test.describe('quarantine scrub @quick', () => {
  for (const path of P0_SURFACES) {
    test(`fresh profile: ${path} renders no quarantined model id`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const text = await page.evaluate(() => document.body.innerText);
      expect(text).not.toMatch(QUARANTINED);
    });
  }

  test('stale cached device profile recommending wav2lip is never rendered', async ({ page }) => {
    // Seed the EXACT pre-scrub artifact: an old profile (no catalogVersion)
    // whose recommendedModels still names the quarantined id.
    await page.addInitScript(() => {
      localStorage.setItem(
        'contentine_device_profile',
        JSON.stringify({
          gpu: { available: true, vendor: 'apple', architecture: 'm2', vramEstimateMB: 12288, renderer: 'ANGLE (Apple, Apple M2)', webgpuSupported: true },
          system: { ramGB: 16, cpuCores: 8, platform: 'macOS', isMobile: false, browser: 'Chrome', browserVersion: '140' },
          apis: { webgpu: true, webgl2: true, webcodecs: true, sharedArrayBuffer: true, serviceWorker: true, indexedDB: true, offscreenCanvas: true, wasmSimd: true, wasmThreads: true },
          tier: 'high',
          recommendedModels: { llm: 'llama-3.2-3b', tts: 'kokoro-82m', imageGen: 'sd-turbo', lipSync: 'wav2lip', stt: 'whisper-base' },
          warnings: [],
          scannedAt: Date.now(),
        }),
      );
    });
    await page.goto('/models/');
    await page.waitForLoadState('networkidle');
    // The Recommended strip must exist…
    await expect(page.getByText('Recommended for Your Device')).toBeVisible({ timeout: 20_000 });
    // …and never contain the quarantined id (raw-id fallback removed + stale
    // profile discarded by catalogVersion check).
    const text = await page.evaluate(() => document.body.innerText);
    expect(text).not.toMatch(QUARANTINED);
  });
});

test('bundle: no server-proxied model URL, no text-to-image pipeline call @quick', () => {
  const chunksDir = join(__dirname, '..', 'out', '_next', 'static', 'chunks');
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.name.endsWith('.js')) {
        const src = readFileSync(p, 'utf8');
        if (src.includes('/api/models/')) offenders.push(`${entry.name}: /api/models/ (Law L2 — server in model path)`);
        if (src.includes("'text-to-image'") || src.includes('"text-to-image"')) {
          offenders.push(`${entry.name}: transformers.js 'text-to-image' pipeline (does not exist)`);
        }
      }
    }
  };
  walk(chunksDir);
  expect(offenders).toEqual([]);
});
