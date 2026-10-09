#!/usr/bin/env node
/**
 * Contentine Create — R1 exit-gate runner (PR-04, THE permanent deploy blocker).
 *
 * Runs the fresh-profile model-download acceptance suite against the REAL
 * static export served with production COOP/COEP headers, driving real engines
 * against the real HuggingFace / MLC CDN. No mocks (Law L1) — model downloads
 * are live (several GB), so this is slow (~25m in July) and must never fake a
 * pass. Green here is the only thing that lets a deploy proceed.
 *
 * Specs run (all use their own launchPersistentContext fresh temp profile):
 *   - e2e/download-all.spec.ts     fresh profile → Download All → every catalog
 *                                  model reaches READY, survives a reload
 *   - e2e/storage-upgrade.spec.ts  legacy cache + legacy status → READY, zero refetch
 *   - e2e/storage-folder.spec.ts   adopt-folder → delta repair → clear-all → re-adopt
 *
 * Steps:
 *   (a) verify frontend/node_modules exists (else exit 1 with instruction)
 *   (b) verify frontend/.env.local exists (next build needs it — see verify.sh)
 *   (c) build frontend/out/ if absent or stale vs build inputs
 *   (d) run the three specs via `npx playwright test` (cwd = frontend/)
 *   (e) exit non-zero on any failure with a clear one-line verdict
 *
 * Playwright's own webServer (config: `node e2e/serve.mjs 8321`) serves out/
 * with COOP/COEP; reuseExistingServer keeps a running one. This runner does
 * not start a server itself — it only guarantees out/ is fresh first.
 *
 * On macOS the Playwright run is wrapped in `caffeinate -i` so an hour-long
 * gate run on battery cannot be frozen by system idle-sleep (the browser only
 * holds a display-on assertion by itself). This is a no-op on other platforms
 * and changes nothing about the tests themselves.
 *
 * Lanes:
 *   (default) MIRROR — seed + serve the local model mirror (scripts/model-mirror.mjs)
 *             and point the download-all spec at it via MODEL_MIRROR_URL. Fast,
 *             deterministic, off the public internet. The routine deploy gate.
 *   --canary  REAL CDN — no mirror; the download-all spec hits HuggingFace/MLC
 *             directly. The flaky ~50-min path, kept as a lower-frequency reality
 *             check for CDN/CORS/URL drift. Runs 1-4 (reports/R2-model-gate-runs.md)
 *             are its baseline datapoints.
 *
 * Run from repo root:  node scripts/e2e-model-download-p0.mjs [--canary]
 */

import { spawn } from 'node:child_process';
import { existsSync, statSync, readdirSync, mkdirSync, createWriteStream } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect } from 'node:net';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FRONTEND = join(ROOT, 'frontend');
const OUT = join(FRONTEND, 'out');
const NODE_MODULES = join(FRONTEND, 'node_modules');
const ENV_LOCAL = join(FRONTEND, '.env.local');
const LOG_DIR = join(ROOT, 'test-results');
const LOG_FILE = join(LOG_DIR, 'e2e-model-download-p0.log');

const SPECS = [
  'e2e/download-all.spec.ts',
  'e2e/storage-upgrade.spec.ts',
  'e2e/storage-folder.spec.ts',
];

// Build inputs whose mtime, if newer than out/, means out/ is stale.
const BUILD_INPUTS = ['src', 'public', 'next.config.js', 'next.config.mjs', 'package.json', '.env.local', 'tailwind.config.ts', 'tailwind.config.js', 'postcss.config.js', 'tsconfig.json'];

// Lane: default = local mirror (fast, deterministic); --canary = real HF/MLC CDN.
const CANARY = process.argv.includes('--canary');
const MIRROR_PORT = 8099;
const MIRROR_URL = `https://127.0.0.1:${MIRROR_PORT}`;

const t0 = Date.now();
let mirrorProc = null;
const killMirror = () => { if (mirrorProc) { try { mirrorProc.kill('SIGKILL'); } catch { /* already gone */ } mirrorProc = null; } };
const fail = (msg, code = 1) => {
  killMirror();
  console.error(`\n✗ VERDICT: ${msg}`);
  process.exit(code);
};
const secs = (ms) => `${(ms / 1000).toFixed(0)}s`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** True if something is already listening on the port (a second runner instance). */
function portInUse(port, host = '127.0.0.1') {
  return new Promise((res) => {
    const s = connect({ port, host });
    s.setTimeout(1000);
    s.once('connect', () => { s.destroy(); res(true); });
    s.once('timeout', () => { s.destroy(); res(false); });
    s.once('error', () => res(false));
  });
}
async function waitForMirror(url, deadlineMs = 15_000) {
  const end = Date.now() + deadlineMs;
  while (Date.now() < end) {
    try { if ((await fetch(url)).ok) return true; } catch { /* not up yet */ }
    await sleep(300);
  }
  return false;
}

/** Newest mtime (ms) under a path, recursing into directories (skips node_modules). */
function newestMtime(p) {
  if (!existsSync(p)) return 0;
  const st = statSync(p);
  if (!st.isDirectory()) return st.mtimeMs;
  let max = st.mtimeMs;
  for (const entry of readdirSync(p, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next') continue;
    max = Math.max(max, newestMtime(join(p, entry.name)));
  }
  return max;
}

/** Spawn a command, streaming stdout+stderr to console AND appending to the log. */
function run(cmd, args, opts, logStream) {
  return new Promise((resolvePromise) => {
    const child = spawn(cmd, args, { cwd: opts.cwd, env: process.env });
    const pipe = (stream, out) => {
      stream.on('data', (chunk) => {
        out.write(chunk);
        logStream.write(chunk);
      });
    };
    pipe(child.stdout, process.stdout);
    pipe(child.stderr, process.stderr);
    child.on('error', (err) => {
      logStream.write(`\n[runner] spawn error: ${err.message}\n`);
      resolvePromise(1);
    });
    child.on('close', (code) => resolvePromise(code ?? 1));
  });
}

async function main() {
  console.log('=== R1 exit-gate: model-download P0 (PR-04 deploy blocker) ===');

  // (a) node_modules
  if (!existsSync(NODE_MODULES)) {
    fail('frontend/node_modules missing — run `npm ci` in frontend/ first, then re-run this script.');
  }
  console.log('✓ frontend/node_modules present');

  // (b) .env.local (next build reads it; verify.sh guards on the same file)
  if (!existsSync(ENV_LOCAL)) {
    fail('frontend/.env.local missing — next build cannot run without it. Copy .env.local.template and fill it in.');
  }
  console.log('✓ frontend/.env.local present');

  mkdirSync(LOG_DIR, { recursive: true });
  const logStream = createWriteStream(LOG_FILE, { flags: 'w' });
  logStream.write(`# e2e-model-download-p0 run @ ${new Date().toISOString()}\n`);

  // (c) build if out/ absent or stale
  const outMtime = existsSync(join(OUT, 'index.html')) ? newestMtime(OUT) : 0;
  const inputMtime = Math.max(...BUILD_INPUTS.map((f) => newestMtime(join(FRONTEND, f))));
  const needBuild = outMtime === 0 || inputMtime > outMtime;

  if (needBuild) {
    const why = outMtime === 0 ? 'out/ absent' : 'out/ stale vs build inputs';
    console.log(`\n→ Building static export (${why})…  \`npm run build\` in frontend/`);
    const bt = Date.now();
    const buildCode = await run('npm', ['run', 'build'], { cwd: FRONTEND }, logStream);
    if (buildCode !== 0) {
      logStream.end();
      fail(`next build failed (exit ${buildCode}) after ${secs(Date.now() - bt)} — cannot run gate. See ${LOG_FILE}.`);
    }
    if (!existsSync(join(OUT, 'index.html'))) {
      logStream.end();
      fail(`next build reported success but out/index.html is absent — static export broken. See ${LOG_FILE}.`);
    }
    console.log(`✓ build complete in ${secs(Date.now() - bt)}`);
  } else {
    console.log('✓ frontend/out/ present and newer than build inputs — skipping build');
  }

  // (c.5) Local model mirror lane (default). --canary skips it → real CDN, which
  // is the flaky ~50-min path kept only as a lower-frequency reality check.
  if (CANARY) {
    console.log('\n→ Canary lane: NO mirror — hitting the real HuggingFace/MLC CDN.');
  } else {
    // Single-instance guard: a second runner would bind-fail on :8099 and its
    // gate would then race the first instance's mirror — masquerading as a spec
    // failure (the runner-collision incident, 2026-08-03). Refuse to double-launch.
    if (await portInUse(MIRROR_PORT)) {
      logStream.end();
      fail(`:${MIRROR_PORT} is already in use — another mirror/runner instance is likely running. Refusing to double-launch (a collision masquerades as a spec failure). Kill it, or pass --canary to skip the mirror.`);
    }
    console.log('\n→ Mirror lane: seeding local model mirror (server-side, resumable)…');
    const st = Date.now();
    const seedCode = await run('node', ['scripts/model-mirror.mjs', 'seed'], { cwd: ROOT }, logStream);
    if (seedCode !== 0) {
      logStream.end();
      fail(`model mirror seed failed (exit ${seedCode}) — re-run to resume, or pass --canary for the real CDN. See ${LOG_FILE}.`);
    }
    console.log(`✓ mirror seeded in ${secs(Date.now() - st)}`);
    mirrorProc = spawn('node', ['scripts/model-mirror.mjs', 'serve', String(MIRROR_PORT)], { cwd: ROOT });
    mirrorProc.stdout.on('data', (c) => logStream.write(c));
    mirrorProc.stderr.on('data', (c) => logStream.write(c));
    // The mirror uses a self-signed localhost cert; allow it for the node-side
    // healthz poll only (the browser trusts it via ignoreHTTPSErrors in the spec).
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    if (!(await waitForMirror(`${MIRROR_URL}/healthz`))) {
      logStream.end();
      fail(`model mirror server never became healthy on ${MIRROR_URL} — see ${LOG_FILE}.`);
    }
    process.env.MODEL_MIRROR_URL = MIRROR_URL;
    console.log(`✓ mirror serving on ${MIRROR_URL}; MODEL_MIRROR_URL set for the gate`);
  }

  // (d) run the specs. On macOS, hold an idle-sleep assertion for the whole
  // Playwright run via `caffeinate -i` (no-op elsewhere) so a battery machine
  // can't sleep mid-gate.
  const onDarwin = process.platform === 'darwin';
  const testCmd = onDarwin ? 'caffeinate' : 'npx';
  const testArgs = onDarwin
    ? ['-i', 'npx', 'playwright', 'test', ...SPECS]
    : ['playwright', 'test', ...SPECS];
  console.log(
    `\n→ Running Playwright gate on ${SPECS.length} specs ` +
      `(${CANARY ? 'real CDN downloads, expect ~25m+' : 'local mirror, expect a few minutes'})` +
      `${onDarwin ? ' [sleep-held via caffeinate -i]' : ''}…\n`,
  );
  const et = Date.now();
  const testCode = await run(testCmd, testArgs, { cwd: FRONTEND }, logStream);
  const testDur = Date.now() - et;
  killMirror();
  logStream.write(`\n[runner] playwright exit=${testCode} dur=${secs(testDur)} total=${secs(Date.now() - t0)}\n`);
  logStream.end();

  // (e) verdict
  const lane = CANARY ? 'canary/real-CDN' : 'mirror';
  console.log(`\n=== gate finished in ${secs(Date.now() - t0)} (tests: ${secs(testDur)}) [${lane} lane] ===`);
  if (testCode !== 0) {
    fail(`R1 GATE RED [${lane} lane] — Playwright exited ${testCode} on the model-download suite. Nothing ships. Full output: ${LOG_FILE}.`, testCode);
  }
  console.log(`\n✓ VERDICT: R1 GATE GREEN [${lane} lane] — all ${SPECS.length} model-download specs passed. Log: ${LOG_FILE}.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  fail(`runner crashed: ${err.message}`);
});
