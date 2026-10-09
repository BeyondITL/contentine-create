/**
 * C-M1 proof (c) driver: VO Match-Tone. Builds vo-proof-page.ts + render-worker
 * with esbuild, serves it plus frontend/public (TTS worker + WASM), drives real
 * Chrome, writes artifacts/c-m1/{vo-before,vo-after,vo-raw-take}.wav +
 * match-tone-metrics.json. Reuses the persistent Chrome profile from the render
 * harness so the Kokoro model is already cached.
 */
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const REPO_ROOT = '/Users/mossaddiqueahsan/Downloads/contentine-create-canonical';
const FRONTEND = path.join(REPO_ROOT, 'frontend');
const HARNESS = path.join(FRONTEND, 'src/engine/cartoon/harness');
const PUBLIC_DIR = path.join(FRONTEND, 'public');
const ARTIFACTS = path.join(REPO_ROOT, 'artifacts', 'c-m1');
const BUILD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-proof-'));

const require = createRequire(path.join(FRONTEND, 'package.json'));
const esbuild = require('esbuild');
const { chromium } = require('@playwright/test');

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.wasm': 'application/wasm', '.json': 'application/json', '.map': 'application/json',
  '.bin': 'application/octet-stream', '.wav': 'audio/wav',
};
const log = (m) => process.stdout.write(`[vo-runner] ${m}\n`);

async function build() {
  log(`building vo-proof bundles -> ${BUILD_DIR}`);
  await esbuild.build({
    entryPoints: [
      path.join(HARNESS, 'vo-proof-page.ts'),
      path.join(FRONTEND, 'src/engine/cartoon/render-worker.ts'),
    ],
    bundle: true, format: 'esm', splitting: true, outdir: BUILD_DIR,
    outbase: path.join(FRONTEND, 'src/engine/cartoon'),
    absWorkingDir: FRONTEND, sourcemap: false, logLevel: 'warning', target: 'es2022',
  });
  fs.writeFileSync(path.join(BUILD_DIR, 'index.html'),
    '<!doctype html><meta charset="utf-8"><title>vo-proof</title>' +
    '<script type="module" src="/harness/vo-proof-page.js"></script>');
}

function serve() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const pathname = decodeURIComponent(url.pathname);
    if (req.method === 'PUT' && pathname.startsWith('/artifact/')) {
      const target = path.join(ARTIFACTS, path.basename(pathname));
      const out = fs.createWriteStream(target);
      req.pipe(out);
      out.on('finish', () => { res.writeHead(200); res.end('ok'); });
      out.on('error', (e) => { res.writeHead(500); res.end(String(e)); });
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
    res.writeHead(404); res.end('not found');
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r({ server, port: server.address().port })));
}

async function main() {
  fs.mkdirSync(ARTIFACTS, { recursive: true });
  await build();
  const { server, port } = await serve();
  log(`server on http://127.0.0.1:${port}`);

  const profileDir = path.join(os.tmpdir(), 'c-m1-chrome-profile'); // reuse cached Kokoro model
  let context;
  try {
    context = await chromium.launchPersistentContext(profileDir, { channel: 'chrome', headless: true, viewport: { width: 1280, height: 800 } });
  } catch (err) {
    log(`chrome channel unavailable (${err.message?.split('\n')[0]}); bundled chromium`);
    context = await chromium.launchPersistentContext(profileDir, { headless: true });
  }
  const page = await context.newPage();
  page.on('console', (m) => { const t = m.text(); if (t.startsWith('[vo-proof]') || m.type() === 'error') log(`page: ${t}`); });
  page.on('pageerror', (e) => log(`pageerror: ${e.message}`));

  let ev;
  try {
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
    await page.waitForFunction(() => Boolean(window.__voproof), null, { timeout: 30_000 });
    log('running VO Match-Tone proof in-page...');
    ev = await page.evaluate(() => window.__voproof.run());
  } finally {
    await context.close();
    server.close();
  }

  fs.writeFileSync(path.join(ARTIFACTS, 'match-tone-metrics.json'), JSON.stringify({ generatedBy: 'run-vo-proof.mjs', ...ev }, null, 2));

  log('---------------- VO Match-Tone gate ----------------');
  log(`take                 : ${ev.takeId} (${ev.voiceProfileRef}) ${ev.durationSec.toFixed(2)}s`);
  log(`before LUFS/peak/floor: ${ev.matchTone.before.integratedLufs.toFixed(2)} / ${ev.matchTone.before.peakDbfs.toFixed(2)} / ${ev.matchTone.before.noiseFloorDbfs.toFixed(2)} dBFS`);
  log(`after  LUFS/peak/floor: ${ev.matchTone.after.integratedLufs.toFixed(2)} / ${ev.matchTone.after.peakDbfs.toFixed(2)} / ${ev.matchTone.after.noiseFloorDbfs.toFixed(2)} dBFS`);
  log(`output deterministic : ${ev.matchTone.deterministic} (h1==h2)`);
  log(`artifacts            : ${ARTIFACTS}`);
  if (!ev.matchTone.deterministic) { log('GATE: RED'); process.exit(1); }
  log('GATE: GREEN');
}
main().catch((e) => { log(`FATAL: ${e.stack ?? e}`); process.exit(1); });
