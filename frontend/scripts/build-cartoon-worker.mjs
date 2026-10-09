/**
 * Build the cartoon render worker into a standalone module bundle served at
 * /render-worker.js (WS-4 build helper — NOT an engine edit).
 *
 * WHY THIS EXISTS (engine-API gap noted for WS-2):
 * The engine instantiates its worker as
 *   new Worker(workerUrl ?? new URL('./render-worker.ts', import.meta.url), { type: 'module' })
 * The `??` fallback defeats webpack's `new Worker(new URL(...))` detection in the
 * Next.js static export, so `next build` copies render-worker.ts as a RAW .ts
 * asset (unparseable by the browser) instead of compiling it. The engine's own
 * C-M1 harness sidesteps this by esbuild-bundling the worker and passing an
 * explicit `workerUrl: '/render-worker.js'`. This script does the same for the
 * production UI; CartoonGenerateStep passes the matching workerUrl.
 *
 * Run from frontend/:  node scripts/build-cartoon-worker.mjs
 * Emits: frontend/public/render-worker.js (copied to out/ by next build).
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { build } from 'esbuild';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.resolve(__dirname, '..');
const ENTRY = path.join(FRONTEND, 'src/engine/cartoon/render-worker.ts');
const OUT = path.join(FRONTEND, 'public/render-worker.js');

await build({
  entryPoints: [ENTRY],
  outfile: OUT,
  bundle: true,
  format: 'esm',       // engine creates the worker with { type: 'module' }
  splitting: false,    // single self-contained file (dynamic imports inlined)
  sourcemap: false,
  target: 'es2022',
  absWorkingDir: FRONTEND,
  logLevel: 'info',
});

process.stdout.write(`[build-cartoon-worker] wrote ${path.relative(FRONTEND, OUT)}\n`);
