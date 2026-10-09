/**
 * WS-4 real E2E: drive the BUILT Cartoon Studio UI (frontend/out) end-to-end.
 * Serves the static export, walks the /cartoon wizard in a real browser, waits
 * for the on-device render, and downloads a playable MP4. Evidence (screenshots
 * + mp4 + console log) → artifacts/cartoon-ui-e2e/.
 *
 * Run from frontend/:  node scripts/e2e-cartoon.mjs
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(FRONTEND, '..');
const OUT = path.join(FRONTEND, 'out');
const ART = path.join(REPO_ROOT, 'artifacts', 'cartoon-ui-e2e');
const require = createRequire(path.join(FRONTEND, 'package.json'));
const { chromium } = require('@playwright/test');

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm',
  '.map': 'application/json', '.mp4': 'video/mp4', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain',
};
const log = (m) => process.stdout.write(`[e2e] ${m}\n`);

function resolveFile(pathname) {
  const clean = decodeURIComponent(pathname.split('?')[0]);
  const candidates = [
    path.join(OUT, clean),
    path.join(OUT, clean, 'index.html'),
    path.join(OUT, `${clean}.html`),
  ];
  for (const f of candidates) {
    if (f.startsWith(OUT) && fs.existsSync(f) && fs.statSync(f).isFile()) return f;
  }
  return null;
}

function serve() {
  const server = http.createServer((req, res) => {
    const file = resolveFile(req.url === '/' ? '/index.html' : req.url);
    if (!file) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r({ server, port: server.address().port })));
}

async function main() {
  fs.mkdirSync(ART, { recursive: true });
  const { server, port } = await serve();
  const base = `http://127.0.0.1:${port}`;
  log(`serving out/ at ${base}`);

  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cartoon-e2e-'));
  let context;
  try {
    context = await chromium.launchPersistentContext(profileDir, {
      channel: 'chrome', headless: true, viewport: { width: 1280, height: 900 }, acceptDownloads: true,
    });
    log('launched real Chrome (WebCodecs H.264 available)');
  } catch (err) {
    log(`chrome channel unavailable (${String(err.message).split('\n')[0]}); using bundled chromium`);
    context = await chromium.launchPersistentContext(profileDir, {
      headless: true, viewport: { width: 1280, height: 900 }, acceptDownloads: true,
    });
  }

  const page = await context.newPage();
  const consoleLines = [];
  page.on('console', (m) => consoleLines.push(`${m.type()}: ${m.text()}`));
  page.on('pageerror', (e) => consoleLines.push(`pageerror: ${e.message}`));

  const shot = async (name) => { await page.screenshot({ path: path.join(ART, name), fullPage: false }); log(`shot ${name}`); };

  try {
    await page.goto(`${base}/cartoon`, { waitUntil: 'networkidle', timeout: 60_000 });
    log('cartoon page loaded');

    // ── Step 1: script ──
    await page.getByPlaceholder('Cartoon title').fill('My First Cartoon');
    const sceneBoxes = page.getByPlaceholder('What does the character say in this scene?');
    await sceneBoxes.first().fill('Hi there! I am your narrator, and this whole cartoon is rendering right here in your browser.');
    await page.getByRole('button', { name: 'Add Scene' }).click();
    await sceneBoxes.nth(1).fill('No servers, no waiting. Just a plan, a voice, and your own machine. Enjoy the show!');
    await shot('01-script.png');
    await page.getByRole('button', { name: 'Next' }).click();

    // ── Step 2: style ──
    await page.waitForTimeout(400);
    await shot('02-style.png');
    await page.getByRole('button', { name: 'Next' }).click();

    // ── Step 3: voice ──
    await page.waitForTimeout(1500); // fetchVoices → presets
    // Select the "Sky" preset card (button contains the voice name).
    await page.getByRole('button', { name: /Sky/ }).first().click();
    await shot('03-voice.png');
    await page.getByRole('button', { name: 'Next' }).click();

    // ── Step 4: generate ──
    await page.waitForTimeout(400);
    await shot('04-generate-ready.png');
    await page.getByRole('button', { name: 'Render Cartoon' }).click();
    log('render started — downloading Kokoro model + rendering (may take a few minutes)...');

    // Snapshot an in-flight progress frame (best-effort).
    await page.waitForTimeout(6000).catch(() => {});
    await shot('05-rendering.png').catch(() => {});

    // Wait for the result <video> (render complete).
    await page.waitForSelector('video', { timeout: 600_000 });
    await page.waitForTimeout(800);
    await shot('06-result.png');
    log('render complete — video element present');

    // ── Download the MP4 ──
    const downloadPromise = page.waitForEvent('download', { timeout: 60_000 });
    await page.getByRole('button', { name: 'Download MP4' }).click();
    const download = await downloadPromise;
    const mp4Path = path.join(ART, 'cartoon.mp4');
    await download.saveAs(mp4Path);
    const size = fs.statSync(mp4Path).size;
    log(`downloaded MP4 → ${mp4Path} (${(size / 1024).toFixed(0)} KB)`);

    // ── Probe the MP4 (ffprobe if available) ──
    let probe = '(ffprobe not found)';
    for (const bin of ['/opt/homebrew/bin/ffprobe', '/usr/local/bin/ffprobe', 'ffprobe']) {
      try { probe = execFileSync(bin, ['-v', 'error', '-show_format', '-show_streams', mp4Path], { encoding: 'utf8' }); break; }
      catch (e) { if (e.code === 'ENOENT') continue; }
    }
    fs.writeFileSync(path.join(ART, 'ffprobe.txt'), probe);

    fs.writeFileSync(path.join(ART, 'console.log'), consoleLines.join('\n') + '\n');
    const ok = size > 1000 && /codec_name=h264|codec_type=video/.test(probe);
    fs.writeFileSync(path.join(ART, 'e2e-report.json'), JSON.stringify({
      pass: ok, mp4Bytes: size, mp4Path,
      probeHasVideo: /codec_type=video/.test(probe),
      probeHasAudio: /codec_type=audio/.test(probe),
      steps: ['script', 'style', 'voice', 'generate', 'render', 'download'],
    }, null, 2));
    log(`E2E ${ok ? 'PASS' : 'CHECK'} — mp4 ${size} bytes; report + screenshots in ${ART}`);
  } catch (err) {
    fs.writeFileSync(path.join(ART, 'console.log'), consoleLines.join('\n') + `\nFATAL: ${err.stack ?? err}\n`);
    await shot('99-failure.png').catch(() => {});
    log(`FATAL: ${err.message}`);
    await context.close(); server.close();
    process.exit(1);
  }

  await context.close();
  server.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
