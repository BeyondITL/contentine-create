import { test, expect, chromium } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MODEL_ARTIFACTS } from '../src/lib/model-artifacts';

/**
 * Existing-profile upgrade path (operator spec, 2026-07-05): a profile whose
 * models were downloaded by a PREVIOUS app version — artifacts in the
 * 'transformers-cache' Cache under main-revision URLs, and a legacy
 * pre-state-machine localStorage status value ('downloaded') — must
 * re-verify to READY on load with ZERO re-downloads. Never brick, never
 * silently refetch.
 */

const MODEL_ID = 'whisper-tiny';
const set = MODEL_ARTIFACTS[MODEL_ID];
const artifacts = set.artifacts.map((a) => ({
  path: a.path,
  // Legacy caches were keyed by main-revision URLs — exactly what the
  // previous app version's transformers.js wrote.
  cacheUrl: `https://huggingface.co/${set.repo}/resolve/main/${a.path}`,
  fetchUrl: `https://huggingface.co/${set.repo}/resolve/${set.revision}/${a.path}`,
}));

test('existing-profile upgrade: legacy cache + legacy status re-verify to READY, zero refetch', async () => {
  test.setTimeout(15 * 60 * 1000);
  const profileDir = mkdtempSync(join(tmpdir(), 'create-e2e-upgrade-'));
  const context = await chromium.launchPersistentContext(profileDir, {
    args: ['--enable-unsafe-webgpu', '--use-angle=metal'],
  });
  try {
    const page = context.pages()[0] ?? (await context.newPage());

    let counting = false;
    const fetched: string[] = [];
    await context.route('https://huggingface.co/**', (route) => {
      if (counting) fetched.push(route.request().url());
      void route.continue();
    });

    await page.goto('/models/');

    // Simulate the previous app version's on-disk state.
    console.log('[e2e] seeding legacy transformers-cache + legacy status…');
    await page.evaluate(
      async ({ files, modelId }) => {
        const cache = await caches.open('transformers-cache');
        for (const f of files) {
          const res = await fetch(f.fetchUrl);
          if (!res.ok) throw new Error(`seed fetch failed: ${res.status} ${f.fetchUrl}`);
          await cache.put(f.cacheUrl, res);
        }
        // Pre-state-machine persisted value.
        localStorage.setItem('contentine-model-status', JSON.stringify({ [modelId]: 'downloaded' }));
      },
      { files: artifacts, modelId: MODEL_ID },
    );

    counting = true;
    await page.reload();
    await expect(page.getByTestId(`model-state-${MODEL_ID}`)).toHaveText('ready', { timeout: 2 * 60 * 1000 });
    const refetches = fetched.filter((u) => artifacts.some((a) => u.includes(a.path)));
    expect(refetches, `upgrade must not refetch cached artifacts, got:\n${refetches.join('\n')}`).toHaveLength(0);
    console.log('[e2e] legacy profile re-verified to READY with zero refetches');
  } finally {
    await context.close();
  }
});
