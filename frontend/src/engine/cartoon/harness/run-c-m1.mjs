/**
 * Contentine Create — Cartoon Engine: C-M1 determinism harness (Node driver)
 *
 * Builds the browser harness with esbuild, serves it (plus frontend/public
 * for the Kokoro TTS worker) from a local static server, drives a real
 * Chrome via Playwright, and writes the C-M1 evidence bundle to
 * artifacts/c-m1/:
 *   render1.mp4 / render2.mp4 / edited-partial.mp4 / reference.mp4
 *   render1-frame-hashes.txt / render2-frame-hashes.txt
 *   determinism-report.json / partial-rerender-report.json / evidence.json
 *   ffprobe-*.txt (stream-level probe via ffprobe when installed)
 *
 * Run from repo root:  node frontend/src/engine/cartoon/harness/run-c-m1.mjs
 * Exit code 0 = determinism + partial-re-render gates green.
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../../../..');
const FRONTEND = path.join(REPO_ROOT, 'frontend');
const PUBLIC_DIR = path.join(FRONTEND, 'public');
const ARTIFACTS = path.join(REPO_ROOT, 'artifacts', 'c-m1');
const BUILD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'c-m1-harness-'));

const require = createRequire(path.join(FRONTEND, 'package.json'));
const esbuild = require('esbuild');
const { chromium } = require('@playwright/test');

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.wasm': 'application/wasm', '.json': 'application/json', '.map': 'application/json',
};

function log(msg) {
  process.stdout.write(`[harness] ${msg}\n`);
}

async function build() {
  log(`building harness bundles → ${BUILD_DIR}`);
  await esbuild.build({
    entryPoints: [
      path.join(__dirname, 'harness-page.ts'),
      path.join(__dirname, '../render-worker.ts'),
    ],
    bundle: true,
    format: 'esm',
    splitting: true,
    outdir: BUILD_DIR,
    outbase: path.join(__dirname, '..'),
    absWorkingDir: FRONTEND,
    sourcemap: false,
    logLevel: 'warning',
    target: 'es2022',
  });
  fs.writeFileSync(
    path.join(BUILD_DIR, 'index.html'),
    '<!doctype html><html><head><meta charset="utf-8"><title>C-M1 harness</title></head>' +
    '<body><script type="module" src="/harness/harness-page.js"></script></body></html>',
  );
}

function serve() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const pathname = decodeURIComponent(url.pathname);

    if (req.method === 'PUT' && pathname.startsWith('/artifact/')) {
      const name = path.basename(pathname); // no traversal
      const target = path.join(ARTIFACTS, name);
      const out = fs.createWriteStream(target);
      req.pipe(out);
      out.on('finish', () => { res.writeHead(200); res.end('ok'); });
      out.on('error', (err) => { res.writeHead(500); res.end(String(err)); });
      return;
    }

    const rel = pathname === '/' ? '/index.html' : pathname;
    for (const root of [BUILD_DIR, PUBLIC_DIR]) {
      const file = path.join(root, rel);
      if (!file.startsWith(root)) continue;
      if (fs.existsSync(file) && fs.statSync(file).isFile()) {
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream' });
        fs.createReadStream(file).pipe(res);
        return;
      }
    }
    res.writeHead(404);
    res.end('not found');
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

function ffprobe(file) {
  for (const bin of ['/opt/homebrew/bin/ffprobe', '/usr/local/bin/ffprobe', 'ffprobe']) {
    try {
      return execFileSync(bin, ['-v', 'error', '-show_format', '-show_streams', file], {
        encoding: 'utf8',
        stdio: 'pipe',
      });
    } catch (err) {
      if (err.code === 'ENOENT') continue;
      throw err;
    }
  }
  return '(no ffprobe binary found — mediabunny probe in evidence.json is the stream-level record)';
}

/** Drop the filename line so probes of the two renders are directly diffable. */
function normalizeProbe(text) {
  return text
    .split('\n')
    .filter((line) => !line.startsWith('filename='))
    .join('\n');
}

function md5(file) {
  return execFileSync('md5', ['-q', file], { encoding: 'utf8' }).trim();
}

async function main() {
  fs.mkdirSync(ARTIFACTS, { recursive: true });
  await build();
  const { server, port } = await serve();
  log(`server on http://127.0.0.1:${port}`);

  const profileDir = path.join(os.tmpdir(), 'c-m1-chrome-profile');
  fs.mkdirSync(profileDir, { recursive: true });

  let context;
  try {
    context = await chromium.launchPersistentContext(profileDir, {
      channel: 'chrome',
      headless: true,
      viewport: { width: 1280, height: 800 },
    });
  } catch (err) {
    log(`chrome channel unavailable (${err.message?.split('\n')[0]}); falling back to bundled chromium`);
    context = await chromium.launchPersistentContext(profileDir, { headless: true });
  }

  const page = await context.newPage();
  page.on('console', (msg) => {
    const text = msg.text();
    if (text.startsWith('[c-m1]') || msg.type() === 'error') log(`page: ${text}`);
  });
  page.on('pageerror', (err) => log(`pageerror: ${err.message}`));

  let evidence;
  try {
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
    await page.waitForFunction(() => Boolean(window.__cm1), null, { timeout: 30_000 });
    log('running tracer bullet in-page (TTS model download on first run — this can take minutes)...');
    evidence = await page.evaluate(() => window.__cm1.run());
  } finally {
    await context.close();
    server.close();
  }

  // ── Write evidence bundle ──────────────────────────────────────────────────
  const h1 = evidence.render1.frameHashes;
  const h2 = evidence.render2.frameHashes;
  fs.writeFileSync(path.join(ARTIFACTS, 'render1-frame-hashes.txt'), h1.join('\n') + '\n');
  fs.writeFileSync(path.join(ARTIFACTS, 'render2-frame-hashes.txt'), h2.join('\n') + '\n');
  fs.copyFileSync(path.join(ARTIFACTS, 'render1.mp4'), path.join(ARTIFACTS, 'reference.mp4'));

  const probes = {};
  const md5s = {};
  for (const name of ['render1', 'render2', 'edited-partial']) {
    const file = path.join(ARTIFACTS, `${name}.mp4`);
    const raw = ffprobe(file);
    fs.writeFileSync(path.join(ARTIFACTS, `ffprobe-${name}.txt`), raw);
    probes[name] = normalizeProbe(raw);
    md5s[name] = md5(file);
  }

  // Node-side re-verification (don't trust a single comparison site).
  const framesIdentical = h1.length === h2.length && h1.every((h, i) => h === h2[i]);
  const ffprobeIdentical = probes.render1 === probes.render2 && probes.render1.length > 0;
  const bytesIdentical = md5s.render1 === md5s.render2;
  const mb1 = JSON.stringify(evidence.render1.probe);
  const mb2 = JSON.stringify(evidence.render2.probe);

  const determinismReport = {
    generatedBy: 'run-c-m1.mjs',
    userAgent: evidence.userAgent,
    planHash: evidence.plan.hash,
    frameCount: h1.length,
    framesIdentical,
    firstMismatch: evidence.determinism.firstMismatch,
    audioMixIdentical: evidence.determinism.audioMixIdentical,
    audioPcmHash: { render1: evidence.render1.audioPcmHash, render2: evidence.render2.audioPcmHash },
    mediabunnyProbesIdentical: mb1 === mb2,
    mediabunnyProbe: evidence.render1.probe,
    ffprobeIdentical,
    mp4BytesIdentical: bytesIdentical,
    mp4Md5: md5s,
    takes: evidence.takes,
  };
  fs.writeFileSync(path.join(ARTIFACTS, 'determinism-report.json'), JSON.stringify(determinismReport, null, 2));

  const partialReport = {
    generatedBy: 'run-c-m1.mjs',
    editedPlanHash: evidence.partial.editedPlanHash,
    referencePlanHash: evidence.plan.hash,
    sceneWindows: evidence.plan.scenes,
    ...evidence.partial.report,
    sceneFrameHashDeltasVsRender1: evidence.partial.sceneDeltasVsRender1,
    editedProbe: evidence.partial.probe,
  };
  fs.writeFileSync(path.join(ARTIFACTS, 'partial-rerender-report.json'), JSON.stringify(partialReport, null, 2));
  fs.writeFileSync(path.join(ARTIFACTS, 'evidence.json'), JSON.stringify(evidence, null, 2));

  // ── Gate summary ───────────────────────────────────────────────────────────
  const deltas = evidence.partial.sceneDeltasVsRender1;
  const editedScenes = new Set(evidence.partial.report.rerenderedScenes);
  const deltasConfined =
    evidence.partial.report.mode === 'partial' &&
    deltas.every((d) => (editedScenes.has(d.sceneId) ? d.differingFrames > 0 : d.differingFrames === 0));

  log('──────────── C-M1 gate summary ────────────');
  log(`frames rendered           : ${h1.length} @ ${evidence.plan.scenes.length} scenes`);
  log(`2× frame hashes identical : ${framesIdentical}`);
  log(`2× audio mix identical    : ${evidence.determinism.audioMixIdentical}`);
  log(`stream probes identical   : mediabunny=${mb1 === mb2} ffprobe=${ffprobeIdentical}`);
  log(`mp4 byte-identical (md5)  : ${bytesIdentical}`);
  log(`partial re-render mode    : ${evidence.partial.report.mode} (${evidence.partial.report.rerenderedScenes.join(', ') || '-'})`);
  log(`hash deltas confined      : ${deltasConfined}`);
  log(`artifacts                 : ${ARTIFACTS}`);

  if (!framesIdentical || !evidence.determinism.audioMixIdentical || mb1 !== mb2 || !ffprobeIdentical || !deltasConfined) {
    log('GATE: RED');
    process.exit(1);
  }
  log('GATE: GREEN');
}

main().catch((err) => {
  log(`FATAL: ${err.stack ?? err}`);
  process.exit(1);
});
