import { statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Global preflight — fail the whole run FAST and HONESTLY if a referenced build
 * asset is missing from out/. Without this, an absent worker/wasm file is served
 * as the SPA index.html fallback (serve.mjs), so the engine that fetches it gets
 * HTML instead of code and hangs on a long model-gated timeout — a silent stall
 * that reads identical to a hang (this is the SA-22-class recurrence: setup-assets.sh
 * declares the copy but a build ran without it). A cheap fs check converts that
 * whole class into an instant, legible failure at suite start.
 */
// Playwright always runs from the frontend/ package dir, so out/ is under cwd.
const OUT = join(process.cwd(), 'out');

// path (relative to out/) → minimum plausible byte size (guards against a 0-byte
// or SPA-fallback stand-in; real assets are far larger).
const REQUIRED: Array<[string, number]> = [
  ['workers/tts-worker.js', 100_000],
  ['workers/pdf.worker.min.mjs', 100_000],
  ['render-worker.js', 100_000],
  ['wasm/transformers/ort-wasm-simd-threaded.jsep.wasm', 1_000_000],
];

export default function preflight(): void {
  const problems: string[] = [];
  for (const [rel, min] of REQUIRED) {
    try {
      const size = statSync(join(OUT, rel)).size;
      if (size < min) problems.push(`${rel}: ${size}B (< ${min}B min — likely a fallback stub)`);
    } catch {
      problems.push(`${rel}: MISSING from out/`);
    }
  }
  if (problems.length) {
    throw new Error(
      `E2E preflight failed — required build assets absent from out/:\n  - ${problems.join('\n  - ')}\n` +
        `Run scripts/setup-assets.sh (then rebuild) before the E2E suite. ` +
        `A missing worker/wasm is served as the SPA index.html fallback and hangs the engine.`,
    );
  }
}
