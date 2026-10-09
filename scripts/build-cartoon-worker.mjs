#!/usr/bin/env node
/**
 * build-cartoon-worker.mjs — bundle the cartoon deterministic render worker.
 *
 * The full-UI Cartoon Studio loads its render worker as a STATIC asset:
 * `CartoonGenerateStep.tsx` → renderCartoonProject(plan, { workerUrl: '/render-worker.js' }).
 * The engine's default `new Worker(new URL('./render-worker.ts', import.meta.url))`
 * does NOT compile under the Next static export (output: 'export'), so the worker
 * must be pre-bundled to `frontend/public/render-worker.js`. Without it the Worker
 * 404s and the cartoon render crashes at ~10% ("Render worker crashed: undefined").
 *
 * Same source + same esbuild shape the C-M1 harness (src/engine/cartoon/harness/
 * run-c-m1.mjs) uses to prove the render 4/4 (reports/R2-proofs.md); this emits the
 * single self-contained module file the app serves, mirroring the Kokoro TTS worker
 * bundling in scripts/setup-assets.sh. Idempotent: re-running overwrites the output.
 *
 * Run from the repo root: `node scripts/build-cartoon-worker.mjs`
 */
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FRONTEND = join(ROOT, 'frontend');

// Use the frontend's installed esbuild (same toolchain as the harness + setup-assets).
const require = createRequire(join(FRONTEND, 'package.json'));
const esbuild = require('esbuild');

const ENTRY = join(FRONTEND, 'src/engine/cartoon/render-worker.ts');
const OUTFILE = join(FRONTEND, 'public/render-worker.js');

await esbuild.build({
  entryPoints: [ENTRY],
  outfile: OUTFILE,
  bundle: true,
  format: 'esm',
  platform: 'browser',
  minify: true,
  target: 'es2022',
  absWorkingDir: FRONTEND,
  logLevel: 'info',
});

console.log(`  Cartoon render worker bundled: frontend/public/render-worker.js`);
