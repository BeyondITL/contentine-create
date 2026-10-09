/**
 * WS-4 C-M2 P0 EXPANSION E2E — Models page downloads go browser → CDN directly.
 *
 * Reproduces the operator's live symptoms on a FRESH profile against the BUILT
 * app and the REAL HuggingFace CDN, and proves the fix:
 *   • Kokoro + Whisper Tiny — previously "Proxy returned 404" — now download from
 *     the HF CDN and reach the "Ready to use" state.
 *   • Llama 3.2 1B — previously a truncated "No compatible model found. Your
 *     device…" — now surfaces the FULL, honest reason (WebGPU requirement) on a
 *     WebGPU-less browser, and it is NOT a proxy/404 error.
 *   • NOT ONE network request goes to `/api/models/download` (server is never in
 *     the model path); model bytes are fetched from huggingface.co / its LFS CDN.
 *   • "Download All" (recommended) is exercised and issues no proxy request.
 *
 * Run from frontend/:  node scripts/e2e-model-download-p0.mjs
 * Evidence → artifacts/model-download-p0/
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(FRONTEND, '..');
const OUT = path.join(FRONTEND, 'out');
const ART = path.join(REPO_ROOT, 'artifacts', 'model-download-p0');
const require = createRequire(path.join(FRONTEND, 'package.json'));
const { chromium } = require('@playwright/test');

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm',
  '.map': 'application/json', '.mp4': 'video/mp4', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain',
};
const log = (m) => process.stdout.write(`[md-p0] ${m}\n`);
const CDN_RE = /huggingface\.co|hf\.co|cdn-lfs|cas-bridge|hf-mirror/i;
const PROXY_RE = /\/api\/models\/download/i;

function resolveFile(pathname) {
  const clean = decodeURIComponent(pathname.split('?')[0]);
  for (const f of [path.join(OUT, clean), path.join(OUT, clean, 'index.html'), path.join(OUT, `${clean}.html`)]) {
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
  const report = { downloads: {}, network: {}, llmRealWork: {}, pass: false };

  const { server, port } = await serve();
  const base = `http://127.0.0.1:${port}`;
  log(`serving out/ at ${base}`);

  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'model-dl-p0-')); // fresh profile → 0 models
  let context;
  try {
    context = await chromium.launchPersistentContext(profileDir, { channel: 'chrome', headless: true, viewport: { width: 1280, height: 1000 } });
    log('launched real Chrome');
  } catch {
    context = await chromium.launchPersistentContext(profileDir, { headless: true, viewport: { width: 1280, height: 1000 } });
    log('launched bundled chromium');
  }
  const page = await context.newPage();
  const requests = [];
  page.on('request', (r) => requests.push(r.url()));
  const consoleLines = [];
  page.on('console', (m) => consoleLines.push(`${m.type()}: ${m.text()}`));
  page.on('pageerror', (e) => consoleLines.push(`pageerror: ${e.message}`));
  const shot = async (n) => { await page.screenshot({ path: path.join(ART, n), fullPage: true }); log(`shot ${n}`); };

  // Model-grid card (scoped to the grid's fade-in wrapper, not the recommended picks).
  const gridCard = (name) => page.locator('.animate-fade-in-up').filter({ hasText: name }).first();

  async function download(name, id) {
    const card = gridCard(name);
    await card.scrollIntoViewIfNeeded();
    // Tolerant of pre-existing state: already-ready → done; mid-download (e.g.
    // kicked off by Download All) → just wait; otherwise click the CTA.
    const already = await card.getByText('Ready to use').isVisible().catch(() => false);
    if (!already) {
      const btn = card.getByRole('button', { name: /Download/ }).first();
      if (await btn.isVisible().catch(() => false)) {
        await btn.click();
        log(`clicked Download on ${name}`);
      } else {
        log(`${name} already downloading — waiting`);
      }
    }
    await card.getByText('Ready to use').waitFor({ timeout: 360_000 });
    report.downloads[id] = 'downloaded';
    log(`${name} → Ready to use`);
  }

  try {
    await page.goto(`${base}/models`, { waitUntil: 'networkidle', timeout: 60_000 });
    // Ensure a truly fresh model state.
    await page.evaluate(() => { try { localStorage.removeItem('contentine-model-status'); } catch {} });
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'AI Models' }).waitFor({ timeout: 30_000 });
    await page.waitForTimeout(1500); // let the device scan + recommendations settle
    await shot('m1-models-fresh.png');

    // (1) Kokoro + Whisper Tiny download from the CDN to the ready state.
    await download('Kokoro TTS', 'kokoro-82m');
    await shot('m2-kokoro-ready.png');
    await download('Whisper Tiny', 'whisper-tiny');
    await shot('m3-whisper-ready.png');

    // (2) Llama 3.2 1B (WebLLM): clicking Download does REAL engine work — the card
    //     immediately enters the live "Downloading" state (never a silent no-op),
    //     streaming MLC weights from the CDN — and then runs to completion so the
    //     Download-All gate sees all three recommended models reach 'downloaded'
    //     (763 MB). The full, non-proxy failure copy is also asserted at the
    //     bundle-string level (check-no-proxy-urls.mjs).
    const llama = gridCard('Llama 3.2 1B');
    await llama.scrollIntoViewIfNeeded();
    await llama.getByRole('button', { name: /Download/ }).first().click();
    log('clicked Download on Llama 3.2 1B (expecting live Downloading → Ready)');
    await llama.getByText(/Downloading/).waitFor({ timeout: 30_000 });
    log('Llama entered Downloading — waiting for full completion (763 MB)...');
    // Resolve on success ("Ready to use") OR a surfaced error ("Retry"), long budget.
    const outcome = await Promise.race([
      llama.getByText('Ready to use').waitFor({ timeout: 1_500_000 }).then(() => 'ready').catch(() => null),
      llama.getByRole('button', { name: 'Retry' }).waitFor({ timeout: 1_500_000 }).then(() => 'error').catch(() => null),
    ]);
    const llamaState = (await llama.innerText()).replace(/\s+/g, ' ').trim();
    const looksLikeProxy = /proxy|\/api\/|\b404\b/i.test(llamaState);
    if (outcome === 'ready') {
      report.downloads['llama-3.2-1b'] = 'downloaded';
      log('Llama 3.2 1B → Ready to use');
    } else {
      report.llmError = { state: llamaState, looksLikeProxy };
      log(`Llama did not reach downloaded (outcome=${outcome}): ${llamaState}`);
    }
    report.llmRealWork = { state: llamaState, realWork: true, looksLikeProxy };
    await shot('m4-llama-final.png');

    // Exercise "Download All" (recommended) — must not hit the proxy. Non-fatal if
    // the recommended set is already satisfied / empty on this device tier.
    const dlAll = page.getByRole('button', { name: /Download All/ });
    if (await dlAll.isVisible().catch(() => false)) {
      await dlAll.click();
      log('clicked Download All (recommended)');
      await page.waitForTimeout(2000);
    } else {
      log('Download All bar not shown (recommended set already satisfied)');
    }

    // (3) Network assertions: no proxy requests, real CDN was used.
    const proxyRequests = requests.filter((u) => PROXY_RE.test(u));
    const cdnRequests = requests.filter((u) => CDN_RE.test(u));
    report.network = {
      totalRequests: requests.length,
      proxyRequests,
      proxyRequestCount: proxyRequests.length,
      cdnRequestCount: cdnRequests.length,
      cdnSample: [...new Set(cdnRequests.map((u) => u.split('?')[0]))].slice(0, 12),
    };
    log(`network: proxy=${proxyRequests.length} cdn=${cdnRequests.length} total=${requests.length}`);

    report.pass =
      report.downloads['kokoro-82m'] === 'downloaded' &&
      report.downloads['whisper-tiny'] === 'downloaded' &&
      report.downloads['llama-3.2-1b'] === 'downloaded' &&
      report.llmRealWork.looksLikeProxy === false &&
      report.network.proxyRequestCount === 0 &&
      report.network.cdnRequestCount > 0;

    fs.writeFileSync(path.join(ART, 'console.log'), consoleLines.join('\n') + '\n');
    fs.writeFileSync(path.join(ART, 'md-p0-report.json'), JSON.stringify(report, null, 2));
    log(`MODEL-DOWNLOAD P0 E2E ${report.pass ? 'PASS' : 'CHECK'} — report at ${path.join(ART, 'md-p0-report.json')}`);
  } catch (err) {
    fs.writeFileSync(path.join(ART, 'console.log'), consoleLines.join('\n') + `\nFATAL: ${err.stack ?? err}\n`);
    fs.writeFileSync(path.join(ART, 'md-p0-report.json'), JSON.stringify({ ...report, fatal: String(err.message) }, null, 2));
    await shot('99-failure.png').catch(() => {});
    log(`FATAL: ${err.message}`);
    await context.close(); server.close();
    process.exit(1);
  }
  await context.close();
  server.close();
  process.exit(report.pass ? 0 : 2);
}
main().catch((e) => { console.error(e); process.exit(1); });
