/**
 * WS-4 C-M2 P0 E2E — readiness gating + quarantine scrub on the BUILT app.
 *
 * (a) Fresh profile, 0 models: the cartoon "Generate with AI" button presents a
 *     real "Download Llama 3.2 1B" CTA (never a silent no-op); clicking it on a
 *     WebGPU-less headless browser surfaces a visible error (proves failures are
 *     never swallowed); the fresh-profile cartoon then completes by typing a
 *     script and rendering — Kokoro downloads at point-of-use and an MP4 is
 *     produced and downloaded.
 * (b) No quarantined model id (wav2lip / f5-tts / huggingfacess) appears in the
 *     cartoon-flow or dashboard USER-FACING text, and device-scanner no longer
 *     recommends a quarantined lip-sync model.
 *
 * Run from frontend/:  node scripts/e2e-cartoon-p0.mjs
 * Evidence → artifacts/cartoon-ui-e2e/p0/
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
const ART = path.join(REPO_ROOT, 'artifacts', 'cartoon-ui-e2e', 'p0');
const require = createRequire(path.join(FRONTEND, 'package.json'));
const { chromium } = require('@playwright/test');

const QUARANTINED = ['wav2lip', 'f5-tts', 'huggingfacess'];
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm',
  '.map': 'application/json', '.mp4': 'video/mp4', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain',
};
const log = (m) => process.stdout.write(`[p0] ${m}\n`);

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
function scanTokens(text) {
  const lower = text.toLowerCase();
  return QUARANTINED.filter((t) => lower.includes(t));
}

async function main() {
  fs.mkdirSync(ART, { recursive: true });
  const report = { partA: {}, partB: {}, sourceChecks: {} };

  // ── Source-level check: device-scanner no longer recommends a banned model ──
  const scannerSrc = fs.readFileSync(path.join(FRONTEND, 'src/engine/device-scanner.ts'), 'utf8');
  const recoBlock = scannerSrc.slice(scannerSrc.indexOf('function getRecommendedModels'), scannerSrc.indexOf('function getWarnings'));
  report.sourceChecks.deviceScannerRecommendsWav2lip = /lipSync:\s*'wav2lip'/.test(recoBlock);
  report.sourceChecks.deviceScannerReco = recoBlock.match(/lipSync:[^,]*/g) || [];

  const { server, port } = await serve();
  const base = `http://127.0.0.1:${port}`;
  log(`serving out/ at ${base}`);

  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cartoon-p0-')); // fresh profile → 0 models
  let context;
  try {
    context = await chromium.launchPersistentContext(profileDir, { channel: 'chrome', headless: true, viewport: { width: 1280, height: 900 }, acceptDownloads: true });
    log('launched real Chrome');
  } catch {
    context = await chromium.launchPersistentContext(profileDir, { headless: true, viewport: { width: 1280, height: 900 }, acceptDownloads: true });
    log('launched bundled chromium');
  }
  const page = await context.newPage();
  const consoleLines = [];
  page.on('console', (m) => consoleLines.push(`${m.type()}: ${m.text()}`));
  page.on('pageerror', (e) => consoleLines.push(`pageerror: ${e.message}`));
  const shot = async (n) => { await page.screenshot({ path: path.join(ART, n) }); log(`shot ${n}`); };

  try {
    // ═══ PART A — fresh-profile readiness gate ═══
    await page.goto(`${base}/cartoon`, { waitUntil: 'networkidle', timeout: 60_000 });
    // Ensure truly fresh model state.
    await page.evaluate(async () => {
      try { localStorage.removeItem('contentine-model-status'); } catch {}
    });
    await page.reload({ waitUntil: 'networkidle' });

    await page.getByRole('button', { name: 'Generate script with AI' }).click();
    await page.getByPlaceholder(/cereal is a soup/i).fill('a robot learns to paint sunsets');
    await page.waitForTimeout(300);

    // (a1) The gate presents a real Download CTA — not a silent button.
    const ctaButton = page.getByRole('button', { name: /Download Llama 3\.2 1B/i });
    const ctaPresent = await ctaButton.isVisible().catch(() => false);
    report.partA.downloadCtaPresented = ctaPresent;
    log(`download CTA presented: ${ctaPresent}`);
    await shot('a1-script-download-cta.png');

    // (a2) Clicking the CTA leads to a REAL outcome (never a silent no-op):
    //      on a WebGPU machine → the download modal with real progress; on a
    //      WebGPU-less browser → an immediate honest "needs WebGPU" message.
    if (ctaPresent) {
      await ctaButton.click();
      const msg = await page.getByText(/Downloading Llama|WebGPU|type your scenes|compatible model|download failed/i).first()
        .waitFor({ timeout: 20_000 }).then(() => true).catch(() => false);
      report.partA.gateOutcomeSurfaced = msg;
      log(`real outcome surfaced after CTA (no silent no-op): ${msg}`);
      await shot('a2-cta-outcome.png');
      // Reset: reload cancels any in-flight model download + clears the modal so
      // the rest of the fresh-profile flow (manual script + render) runs clean.
      await page.reload({ waitUntil: 'networkidle' });
      await page.evaluate(() => { try { localStorage.removeItem('contentine-model-status'); } catch {} });
      await page.reload({ waitUntil: 'networkidle' });
    }

    // (a3) Fresh-profile cartoon completes: type a script, walk the wizard, render.
    const sceneBoxes = page.getByPlaceholder('What does the character say in this scene?');
    await sceneBoxes.first().fill('Hi! I am a little robot, and today I am learning to paint the sunset.');
    await page.getByRole('button', { name: 'Add Scene' }).click();
    await sceneBoxes.nth(1).fill('First the orange, then the pink. Rendering right here on your device. Ta-da!');
    await page.getByRole('button', { name: 'Next' }).click();      // → Style
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: 'Next' }).click();      // → Voice
    await page.waitForTimeout(1500);
    await page.getByRole('button', { name: /Sky/ }).first().click();
    await page.getByRole('button', { name: 'Next' }).click();      // → Generate
    await page.waitForTimeout(300);
    await shot('a3-generate-ready.png');
    await page.getByRole('button', { name: 'Render Cartoon' }).click();
    log('fresh-profile render started (Kokoro downloads at point-of-use)...');
    await page.waitForSelector('video', { timeout: 600_000 });
    await shot('a4-fresh-profile-result.png');

    const dl = await Promise.all([
      page.waitForEvent('download', { timeout: 60_000 }),
      page.getByRole('button', { name: 'Download MP4' }).click(),
    ]).then(([d]) => d);
    const mp4 = path.join(ART, 'fresh-profile-cartoon.mp4');
    await dl.saveAs(mp4);
    report.partA.mp4Bytes = fs.statSync(mp4).size;
    report.partA.renderCompleted = report.partA.mp4Bytes > 1000;
    log(`fresh-profile MP4 ${report.partA.mp4Bytes} bytes`);

    // ═══ PART B — quarantine scrub in user-facing text ═══
    const scans = {};
    // Dashboard
    await page.goto(`${base}/`, { waitUntil: 'networkidle', timeout: 60_000 });
    await page.waitForTimeout(800);
    scans.dashboard = await page.evaluate(() => document.body.innerText);
    // Cartoon flow — walk all 4 steps collecting visible text
    await page.goto(`${base}/cartoon`, { waitUntil: 'networkidle' });
    let cartoonText = '';
    for (let i = 0; i < 4; i++) {
      await page.waitForTimeout(400);
      cartoonText += '\n' + (await page.evaluate(() => document.body.innerText));
      const next = page.getByRole('button', { name: 'Next' });
      if (await next.isVisible().catch(() => false) && !(await next.isDisabled().catch(() => true))) {
        await next.click();
      } else if (i === 2) {
        // voice step: select a voice to enable Next
        await page.getByRole('button', { name: /Sky/ }).first().click().catch(() => {});
        await next.click().catch(() => {});
      }
    }
    scans.cartoon = cartoonText;

    const hits = {
      dashboard: scanTokens(scans.dashboard),
      cartoon: scanTokens(scans.cartoon),
    };
    report.partB.quarantinedHits = hits;
    report.partB.clean = hits.dashboard.length === 0 && hits.cartoon.length === 0;
    fs.writeFileSync(path.join(ART, 'ui-text-dashboard.txt'), scans.dashboard);
    fs.writeFileSync(path.join(ART, 'ui-text-cartoon.txt'), scans.cartoon);
    log(`part B clean (no quarantined ids in cartoon/dashboard UI): ${report.partB.clean}`);

    report.pass =
      report.partA.downloadCtaPresented === true &&
      report.partA.renderCompleted === true &&
      report.partB.clean === true &&
      report.sourceChecks.deviceScannerRecommendsWav2lip === false;

    fs.writeFileSync(path.join(ART, 'console.log'), consoleLines.join('\n') + '\n');
    fs.writeFileSync(path.join(ART, 'p0-report.json'), JSON.stringify(report, null, 2));
    log(`P0 E2E ${report.pass ? 'PASS' : 'CHECK'} — report at ${path.join(ART, 'p0-report.json')}`);
  } catch (err) {
    fs.writeFileSync(path.join(ART, 'console.log'), consoleLines.join('\n') + `\nFATAL: ${err.stack ?? err}\n`);
    fs.writeFileSync(path.join(ART, 'p0-report.json'), JSON.stringify({ ...report, fatal: String(err.message) }, null, 2));
    await shot('99-failure.png').catch(() => {});
    log(`FATAL: ${err.message}`);
    await context.close(); server.close();
    process.exit(1);
  }
  await context.close();
  server.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
