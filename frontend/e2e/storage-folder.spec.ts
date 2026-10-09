import { test, expect, chromium } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MODEL_ARTIFACTS } from '../src/lib/model-artifacts';

/**
 * Model Storage acceptance (operator spec, 2026-07-05) — the exact sequence
 * the operator will run live, against the real HF CDN:
 *
 *  1. Seed a folder with whisper-tiny's real artifacts in a NON-canonical
 *     layout (the "I already downloaded models somewhere" case).
 *  2. Point the app at that folder → adopt: hash-verify → READY with ZERO
 *     network fetches of present artifacts.
 *  3. Corrupt ONE byte of one shard → Repair re-downloads ONLY that shard
 *     (per-shard delta, not whole-model refetch).
 *  4. "Clear all app data" → folder models survive and re-verify to READY,
 *     again with zero artifact fetches.
 *
 * The "folder" is an OPFS-backed directory handle: FS Access pickers cannot
 * be driven headlessly, so `showDirectoryPicker` is stubbed to return it.
 * The handle API (getFileHandle/createWritable/permissions) is identical to
 * a real directory's, and clearAllAppData explicitly protects the configured
 * model folder subtree, exactly as it protects real directories.
 */

const MODEL_ID = 'whisper-tiny';
const SEED_DIR = 'e2e-model-folder';
const SEED_PREFIX = 'my old downloads'; // non-canonical, with a space
const CORRUPT_PATH = 'onnx/encoder_model_quantized.onnx';

const artifacts = MODEL_ARTIFACTS[MODEL_ID].artifacts.map((a) => ({
  path: a.path,
  url: `https://huggingface.co/${MODEL_ARTIFACTS[MODEL_ID].repo}/resolve/${MODEL_ARTIFACTS[MODEL_ID].revision}/${a.path}`,
  sizeBytes: a.sizeBytes,
}));

test('adopt-folder → zero-refetch READY → 1-byte corrupt → delta repair → clear-all → re-adopt', async () => {
  test.setTimeout(20 * 60 * 1000);
  const profileDir = mkdtempSync(join(tmpdir(), 'create-e2e-storage-'));
  const context = await chromium.launchPersistentContext(profileDir, {
    args: ['--enable-unsafe-webgpu', '--use-angle=metal'],
  });
  try {
    const page = context.pages()[0] ?? (await context.newPage());

    // Every HF request is recorded; `counting` gates the assertion window so
    // the seeding phase (which legitimately downloads) is excluded.
    let counting = false;
    const fetched: string[] = [];
    await context.route('https://huggingface.co/**', (route) => {
      if (counting) fetched.push(route.request().url());
      void route.continue();
    });

    // The picker stub must survive reloads.
    await page.addInitScript(
      ({ seedDir }) => {
        (window as unknown as { showDirectoryPicker: () => Promise<unknown> }).showDirectoryPicker =
          async () => {
            const root = await navigator.storage.getDirectory();
            return root.getDirectoryHandle(seedDir, { create: true });
          };
      },
      { seedDir: SEED_DIR },
    );

    await page.goto('/models/');

    // ── Phase 1: seed the folder (real artifacts, non-canonical layout) ──
    console.log('[e2e] seeding folder with real whisper-tiny artifacts…');
    await page.evaluate(
      async ({ seedDir, seedPrefix, files }) => {
        const root = await navigator.storage.getDirectory();
        const dir = await root.getDirectoryHandle(seedDir, { create: true });
        for (const f of files) {
          const res = await fetch(f.url);
          if (!res.ok || !res.body) throw new Error(`seed fetch failed: ${res.status} ${f.url}`);
          const parts = `${seedPrefix}/${f.path}`.split('/');
          let d = dir;
          for (let i = 0; i < parts.length - 1; i++) d = await d.getDirectoryHandle(parts[i], { create: true });
          const fh = await d.getFileHandle(parts[parts.length - 1], { create: true });
          const w = await fh.createWritable();
          await res.body.pipeTo(w);
        }
      },
      { seedDir: SEED_DIR, seedPrefix: SEED_PREFIX, files: artifacts },
    );

    // ── Phase 2: adopt — READY with zero fetches of present artifacts ──
    counting = true;
    await page.getByTestId('choose-folder').click();
    await expect(page.getByTestId(`model-state-${MODEL_ID}`)).toHaveText('ready', { timeout: 5 * 60 * 1000 });
    const artifactFetches = fetched.filter((u) => artifacts.some((a) => u.includes(a.path)));
    expect(artifactFetches, `adopt must not refetch present artifacts, got:\n${artifactFetches.join('\n')}`).toHaveLength(0);
    console.log('[e2e] adopted to READY with zero artifact fetches');

    // Reload — folder-backed presence re-verify keeps READY, still no fetches.
    await page.reload();
    await expect(page.getByTestId(`model-state-${MODEL_ID}`)).toHaveText('ready', { timeout: 60_000 });
    const afterReload = fetched.filter((u) => artifacts.some((a) => u.includes(a.path)));
    expect(afterReload, 'reload must not refetch folder-stored artifacts').toHaveLength(0);
    console.log('[e2e] reload re-verified READY, zero fetches');

    // ── Phase 3: corrupt ONE byte → Repair fetches ONLY that shard ──
    await page.evaluate(
      async ({ seedDir, seedPrefix, corruptPath }) => {
        const root = await navigator.storage.getDirectory();
        let d = await root.getDirectoryHandle(seedDir);
        const parts = `${seedPrefix}/${corruptPath}`.split('/');
        for (let i = 0; i < parts.length - 1; i++) d = await d.getDirectoryHandle(parts[i]);
        const fh = await d.getFileHandle(parts[parts.length - 1]);
        const file = await fh.getFile();
        const bytes = new Uint8Array(await file.arrayBuffer());
        bytes[100] = bytes[100] ^ 0xff; // flip one byte, size unchanged
        const w = await fh.createWritable();
        await w.write(bytes);
        await w.close();
      },
      { seedDir: SEED_DIR, seedPrefix: SEED_PREFIX, corruptPath: CORRUPT_PATH },
    );
    fetched.length = 0;
    await page.getByTestId(`repair-${MODEL_ID}`).click();
    await expect(page.getByTestId(`model-state-${MODEL_ID}`)).toHaveText('ready', { timeout: 5 * 60 * 1000 });
    const repairFetches = fetched.filter((u) => artifacts.some((a) => u.includes(a.path)));
    expect(repairFetches.length, `delta repair must fetch exactly the corrupted shard, got:\n${repairFetches.join('\n')}`).toBe(1);
    expect(repairFetches[0]).toContain(CORRUPT_PATH);
    console.log('[e2e] delta repair refetched only the corrupted shard');

    // ── Phase 4: Clear all app data → folder models survive, re-adopt ──
    fetched.length = 0;
    await page.getByTestId('clear-all-app-data').click();
    await page.getByTestId('clear-all-confirm').click();
    await expect(page.getByTestId(`model-state-${MODEL_ID}`)).toHaveText('ready', { timeout: 5 * 60 * 1000 });
    const postClear = fetched.filter((u) => artifacts.some((a) => u.includes(a.path)));
    expect(postClear, 'post-clear re-adopt must not refetch folder artifacts').toHaveLength(0);
    console.log('[e2e] clear-all → folder models re-adopted to READY, zero fetches');
  } finally {
    await context.close();
  }
});
