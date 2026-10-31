/**
 * Contentine Create — Cartoon Engine: project persistence harness (Node driver)
 *
 * Acceptance A05 (reopen after a FULL browser restart) and A06 (storage
 * failure injection) in a real Chrome:
 *   session 1  fresh profile → real Kokoro voice → render → saveProject → QUIT Chrome
 *   session 2  relaunch on the same profile → loadProject → verify take hashes,
 *              zero TTS calls, full render from restored state, partial
 *              re-render from the restored render cache, save revision 2
 *              → failure matrix (stale CAS, write failure, eviction, bit-rot,
 *              missing take, workspace isolation, tampered bundle)
 * Node then re-verifies with ffprobe + decoded-frame comparison (ffmpeg framemd5)
 * and writes artifacts/persistence/.
 *
 * Run from repo root:  node frontend/src/engine/cartoon/harness/run-persistence.mjs
 * Exit 0 = gate green.
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../../../..');
const FRONTEND = path.join(REPO_ROOT, 'frontend');
const PUBLIC_DIR = path.join(FRONTEND, 'public');
const ARTIFACTS = path.join(REPO_ROOT, 'artifacts', 'persistence');
const BUILD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'persist-harness-'));

const require = createRequire(path.join(FRONTEND, 'package.json'));
const esbuild = require('esbuild');
const { chromium } = require('@playwright/test');

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.wasm': 'application/wasm', '.json': 'application/json', '.map': 'application/json',
};

const log = (msg) => process.stdout.write(`[persist-harness] ${msg}\n`);

async function build() {
  await esbuild.build({
    entryPoints: [path.join(__dirname, 'persistence-page.ts'), path.join(__dirname, '../render-worker.ts')],
    bundle: true,
    format: 'esm',
    splitting: true,
    outdir: BUILD_DIR,
    outbase: path.join(__dirname, '..'),
    absWorkingDir: FRONTEND,
    logLevel: 'warning',
    target: 'es2022',
  });
  fs.writeFileSync(
    path.join(BUILD_DIR, 'index.html'),
    '<!doctype html><html><head><meta charset="utf-8"><title>persistence harness</title></head>' +
      '<body><script type="module" src="/harness/persistence-page.js"></script></body></html>',
  );
}

function serve() {
  const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (req.method === 'PUT' && pathname.startsWith('/artifact/')) {
      const out = fs.createWriteStream(path.join(ARTIFACTS, path.basename(pathname)));
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
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port })));
}

async function session(profileDir, port, label, fn) {
  let context;
  try {
    context = await chromium.launchPersistentContext(profileDir, { channel: 'chrome', headless: true });
  } catch (err) {
    log(`chrome channel unavailable (${err.message?.split('\n')[0]}); using bundled chromium`);
    context = await chromium.launchPersistentContext(profileDir, { headless: true });
  }
  const page = await context.newPage();
  page.on('console', (m) => { const t = m.text(); if (t.startsWith('[persist]') || m.type() === 'error') log(`${label}: ${t}`); });
  page.on('pageerror', (e) => log(`${label} pageerror: ${e.message}`));
  try {
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
    await page.waitForFunction(() => Boolean(window.__persist), null, { timeout: 30_000 });
    return await fn(page);
  } finally {
    await context.close(); // persistent context: this quits the Chrome process
    log(`${label}: browser closed`);
  }
}

/** ffprobe output minus fields that vary with encoded bytes (filename, bit_rate, size). */
const structural = (text) => text.split('\n').filter((l) => !/^(filename|bit_rate|size)=/.test(l)).join('\n');

const sha256File = (f) => createHash('sha256').update(fs.readFileSync(f)).digest('hex');

function ffprobe(file) {
  return execFileSync('ffprobe', ['-v', 'error', '-show_format', '-show_streams', file], { encoding: 'utf8' });
}

/** Per-frame MD5 of the decoded video stream. */
function decodedFrameMd5s(file) {
  const out = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-map', '0:v:0', '-f', 'framemd5', '-'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return out.split('\n').filter((l) => l && !l.startsWith('#')).map((l) => l.split(',').pop().trim());
}

function decodedAudioMd5(file) {
  return execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-map', '0:a:0', '-f', 'md5', '-'], { encoding: 'utf8' }).trim();
}

async function main() {
  fs.rmSync(ARTIFACTS, { recursive: true, force: true });
  fs.mkdirSync(ARTIFACTS, { recursive: true });
  await build();
  const { server, port } = await serve();
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'persist-profile-')); // fresh, empty IndexedDB
  const t0 = Date.now();
  let s1, s2, failures;
  try {
    s1 = await session(profileDir, port, 'session1', (page) => page.evaluate(() => window.__persist.create()));
    ({ s2, failures } = await session(profileDir, port, 'session2', async (page) => ({
      s2: await page.evaluate(() => window.__persist.reopen()),
      failures: await page.evaluate(() => window.__persist.failures()),
    })));
  } finally {
    server.close();
  }

  const mp4 = (n) => path.join(ARTIFACTS, n);
  const files = ['session1-render.mp4', 'session2-restored-full.mp4', 'session2-restored-edited.mp4'];
  const probes = {};
  const sha = {};
  for (const f of files) {
    probes[f] = ffprobe(mp4(f));
    fs.writeFileSync(mp4(`ffprobe-${f.replace('.mp4', '')}.txt`), probes[f]);
    sha[f] = sha256File(mp4(f));
  }
  const d1 = decodedFrameMd5s(mp4('session1-render.mp4'));
  const dFull = decodedFrameMd5s(mp4('session2-restored-full.mp4'));
  const dEdit = decodedFrameMd5s(mp4('session2-restored-edited.mp4'));
  const audio = Object.fromEntries(files.map((f) => [f, decodedAudioMd5(mp4(f))]));

  const diffCount = (a, b, from, to) => { let n = 0; for (let i = from; i < to; i++) if (a[i] !== b[i]) n++; return n; };

  const editedSceneDeltas = s1.sceneWindows.map((w) => ({
    ...w,
    differingDecodedFrames: diffCount(d1, dEdit, w.startFrame, w.startFrame + w.frameCount),
  }));
  const rerendered = new Set(s2.partial.rerenderedScenes);

  const takesEqual = JSON.stringify(Object.entries(s1.takes).sort()) === JSON.stringify(Object.entries(s2.loaded.takes).sort());
  const checks = {
    savedThenListed: s2.listed.some((p) => p.projectId === s1.projectId && p.revision === 1 && p.hasRender),
    planHashRestored: s2.loaded.planHash === s1.planHash,
    takeHashesRestored: takesEqual,
    noReSynthesis: s2.ttsCallsAfterReopen === 0,
    noLoadWarnings: s2.loaded.warnings.length === 0,
    renderCacheRestoredBitExact: s2.loaded.lastRenderMp4Sha256 === sha['session1-render.mp4'],
    restoredFullRenderFramesIdentical:
      s2.restoredFullRender.frameHashes.length === s1.frameHashes.length &&
      s2.restoredFullRender.frameHashes.every((h, i) => h === s1.frameHashes[i]),
    restoredFullRenderAudioIdentical: s2.restoredFullRender.audioPcmHash === s1.audioPcmHash,
    // Independent re-encodes are NOT compared decoded-frame-for-frame: the Linux
    // Chromium software H.264 encoder is not run-to-run reproducible (evidence
    // ENC-01). Pre-encode frame hashes (above) prove identical content; the
    // container/stream structure must match exactly.
    restoredFullStructureIdentical: structural(probes['session1-render.mp4']) === structural(probes['session2-restored-full.mp4']),
    restoredFullDecodedFrameCountEqual: d1.length === dFull.length,
    restoredDecodedAudioIdentical: audio['session1-render.mp4'] === audio['session2-restored-full.mp4'] &&
      audio['session1-render.mp4'] === audio['session2-restored-edited.mp4'],
    partialFromRestoredCache: s2.partial.mode === 'partial' && s2.partial.rerenderedScenes.join() === 'scene-duo',
    editedDeltasConfinedToEditedScene:
      dEdit.length === d1.length &&
      editedSceneDeltas.every((d) => (rerendered.has(d.sceneId) ? d.differingDecodedFrames > 0 : d.differingDecodedFrames === 0)),
    editedSavedAsRevision2: s2.savedEditRevision === 2,
    allMp4sProbeValid: files.every((f) => /codec_type=video/.test(probes[f]) && /codec_type=audio/.test(probes[f])),
    failureMatrixGreen: failures.every((f) => f.pass),
  };

  const report = {
    generatedBy: 'run-persistence.mjs',
    wallClockSec: Math.round((Date.now() - t0) / 1000),
    userAgent: s2.userAgent,
    projectId: s1.projectId,
    session1: { revision: s1.revision, planHash: s1.planHash, ttsCalls: s1.ttsCalls, bytesWritten: s1.bytesWritten, storageEstimate: s1.storageEstimate, frames: s1.frameHashes.length },
    session2: { listed: s2.listed, loaded: s2.loaded, ttsCallsAfterReopen: s2.ttsCallsAfterReopen, partial: { ...s2.partial, probe: undefined }, savedEditRevision: s2.savedEditRevision },
    decodedFrames: {
      session1: d1.length,
      // Informational (ENC-01): independent re-encode of identical pre-encode frames.
      restoredFullDiffering: diffCount(d1, dFull, 0, Math.max(d1.length, dFull.length)),
      restoredEditedDiffering: diffCount(d1, dEdit, 0, Math.max(d1.length, dEdit.length)),
      editedSceneDeltas,
    },
    decodedAudioMd5: audio,
    mp4Sha256: sha,
    failures,
    checks,
  };
  fs.writeFileSync(path.join(ARTIFACTS, 'persistence-report.json'), JSON.stringify(report, null, 2));

  log('──────────── persistence gate ────────────');
  for (const [k, v] of Object.entries(checks)) log(`${v ? 'PASS' : 'FAIL'}  ${k}`);
  for (const f of failures) log(`${f.pass ? 'PASS' : 'FAIL'}  failure:${f.case} → ${f.observed}`);
  log(`artifacts: ${ARTIFACTS}`);
  if (!Object.values(checks).every(Boolean)) { log('GATE: RED'); process.exit(1); }
  log('GATE: GREEN');
}

main().catch((err) => { log(`FATAL: ${err.stack ?? err}`); process.exit(1); });
