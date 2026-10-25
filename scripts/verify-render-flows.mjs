/**
 * P0 close-out proof — REMAINING RENDER FLOWS TO MP4.
 *
 * Drives each flow through the REAL UI in the rebuilt static export, captures
 * the file the user would actually download, and ffprobes it. Same standard as
 * the SA-26(a) avatar close-out: a flow is proven only by a downloaded MP4 whose
 * streams ffprobe can read, never by a green spinner.
 *
 *   node scripts/verify-render-flows.mjs audio     # Audio to Video  → MP4
 *   node scripts/verify-render-flows.mjs cartoon   # Cartoon Studio  → MP4
 *   node scripts/verify-render-flows.mjs url       # URL → remix → video → MP4
 *
 * The `url` flow is the only one needing the PHP backend (D-42: URL extraction
 * is server-side because CORS blocks browser-side scraping); it redirects the
 * baked-in production API origin to the local server at the network layer and
 * injects an X-API-Key. Everything else runs fully offline/browser-native.
 *
 * Writes: artifacts/<flow>/{output.mp4,ffprobe.txt,report.json,*.png,console.log}
 */
import { createRequire } from 'node:module';
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = process.env.CONTENTINE_REPO_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FRONTEND = path.join(REPO_ROOT, 'frontend');
const PORT = 8330;
const BACKEND = 'http://127.0.0.1:8080';
const PROD_API = 'http://localhost:8080/api';
const SPEECH_WAV = path.join(REPO_ROOT, 'artifacts/c-m1/vo-after.wav'); // real Kokoro speech
const SOURCE_URL = 'https://en.wikipedia.org/wiki/Deep-sea_gigantism';

const require = createRequire(path.join(FRONTEND, 'package.json'));
const { chromium } = require('@playwright/test');

const FLOW = process.argv[2];
if (!['audio', 'cartoon', 'url'].includes(FLOW)) {
  console.error('usage: verify-render-flows.mjs <audio|cartoon|url>');
  process.exit(2);
}
const ARTIFACTS = path.join(REPO_ROOT, 'artifacts', `${FLOW}-e2e`);
const log = (m) => process.stdout.write(`[${FLOW}-proof] ${m}\n`);

/** ffprobe the captured file — the same fields the avatar close-out reported. */
function probe(file) {
  const raw = execFileSync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'stream=index,codec_name,profile,codec_type,width,height,sample_rate,channels',
    '-show_entries', 'format=format_name,duration,size',
    '-of', 'default=noprint_wrappers=0', file,
  ]).toString();
  fs.writeFileSync(path.join(ARTIFACTS, 'ffprobe.txt'), raw);
  const get = (k) => (new RegExp(`^${k}=(.*)$`, 'm').exec(raw) || [])[1];
  const codecs = [...raw.matchAll(/^codec_name=(.*)$/gm)].map((m) => m[1]);
  return {
    codecs,
    hasVideo: /codec_type=video/.test(raw),
    hasAudio: /codec_type=audio/.test(raw),
    format: get('format_name'),
    duration: Number(get('duration')),
    size: Number(get('size')),
    raw,
  };
}

async function routeToLocalBackend(page, apiKey) {
  await page.route(`${PROD_API}/**`, async (route) => {
    const req = route.request();
    const target = BACKEND + '/api' + req.url().slice(PROD_API.length);
    try {
      const res = await route.fetch({
        url: target,
        headers: { ...req.headers(), 'X-API-Key': apiKey },
      });
      await route.fulfill({
        status: res.status(),
        headers: { ...res.headers(), 'access-control-allow-origin': '*' },
        body: await res.body(),
      });
    } catch {
      await route.abort();
    }
  });
}

/**
 * Read the generated video script out of the Remix results panel, or '' if the
 * app has not produced one yet.
 *
 * MEASUREMENT NOTE (this detector has been wrong before — see P0-CLOSE-OUT §5).
 * `OutputTabs.VideoScriptView` renders the script two different ways:
 *   1. parsed scenes  → scene CARDS (real DOM text, visible to innerText)
 *   2. unparsed text  → a <textarea value={text}> (placeholder "Video script
 *      will appear here…")
 * A textarea's *value* is a DOM property, never a text node, so
 * `document.body.innerText` cannot see case 2. The previous run hit exactly that:
 * the browser LLM wrote a real 6-scene script, the screenshot proves it was on
 * screen, and the old `/SCENE\s*1/i.test(document.body.innerText)` check still
 * reported `produced: false` for the full 15-minute deadline. Reading innerText
 * alone under-reports; reading every textarea over-reports (the §5 bug that
 * counted the AI panel's own topic box as generated output). So: match the two
 * OUTPUT textareas by their "…will appear here" placeholders — an allowlist the
 * source-paste and custom-instructions boxes cannot satisfy — and accept scene
 * cards from innerText.
 */
async function readVideoScript(page) {
  return page.evaluate(() => {
    const fromTextarea = [...document.querySelectorAll('textarea')]
      .filter((t) => /will appear here/i.test(t.placeholder || ''))
      .map((t) => (t.value || '').trim())
      .find((v) => v.length > 80);
    if (fromTextarea) return fromTextarea;
    // Scene-card branch: only count it when a scene actually rendered.
    const body = document.body.innerText || '';
    return /scene\s*1\b/i.test(body) ? body : '';
  });
}

/** Click a wizard Next once it becomes enabled; throw an honest error if it never does. */
async function next(page, label, timeout = 30_000) {
  const btn = page.getByRole('button', { name: /^Next/ }).last();
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await btn.isEnabled().catch(() => false)) {
      await btn.click();
      await page.waitForTimeout(900);
      return;
    }
    await page.waitForTimeout(400);
  }
  throw new Error(`Next stayed disabled at step "${label}" — flow is gated here`);
}

async function main() {
  fs.mkdirSync(ARTIFACTS, { recursive: true });
  const server = spawn('node', ['e2e/serve.mjs', String(PORT)], { cwd: FRONTEND, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 1200));
  log(`serving out/ on http://127.0.0.1:${PORT}`);

  const context = await chromium.launchPersistentContext(
    path.join(os.tmpdir(), 'c-m1-chrome-profile'),
    { channel: 'chrome', headless: true, viewport: { width: 1440, height: 1000 }, acceptDownloads: true },
  );
  const page = await context.newPage();
  const console_ = [];
  page.on('console', (m) => console_.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => console_.push(`[pageerror] ${e.message}`));

  const steps = [];
  const note = (m) => { steps.push(`${new Date().toISOString().slice(11, 19)} ${m}`); log(m); };

  let mp4 = null, error = null;
  const downloads = [];
  page.on('download', (d) => downloads.push(d));

  try {
    if (FLOW === 'url') {
      const apiKey = (process.env.CONTENTINE_API_KEY || process.env.OPENAI_API_KEY || '');
      await routeToLocalBackend(page, apiKey);
    }

    if (FLOW === 'audio') {
      await page.goto(`http://127.0.0.1:${PORT}/video/from-audio`, { waitUntil: 'load' });
      await page.waitForTimeout(1500);
      note('uploading real Kokoro speech WAV');
      await page.locator('input[type=file]').first().setInputFiles(SPEECH_WAV);
      await page.waitForTimeout(1200);
      note('clicking Create Video (Whisper transcribe → render → mux)');
      await page.getByRole('button', { name: /Create Video/i }).click();
    }

    if (FLOW === 'cartoon') {
      await page.goto(`http://127.0.0.1:${PORT}/cartoon`, { waitUntil: 'load' });
      await page.waitForTimeout(1500);
      await page.getByPlaceholder('Cartoon title').fill('Deep Sea Facts');
      const line = page.getByPlaceholder(/What does the character say/i).first();
      await line.fill('The giant squid has eyes the size of dinner plates.');
      await page.waitForTimeout(500);
      note('script step filled; advancing');
      await next(page, 'script');
      note('style step; advancing');
      await next(page, 'style');
      note('voice step; picking a preset then advancing');
      const voice = page.locator('button', { hasText: /Preview|Select/i }).first();
      if (await voice.count()) await voice.click().catch(() => {});
      await page.waitForTimeout(600);
      await next(page, 'voice');
      // The action is "Render Cartoon". /^Generate/ matches the step TAB at the
      // top of the wizard instead, so the render never starts and the harness
      // waits out its whole timeout against an idle page.
      note('generate step; clicking Render Cartoon');
      await page.getByRole('button', { name: /Render Cartoon/i }).click();
    }

    if (FLOW === 'url') {
      const shot = (n) => page.screenshot({ path: path.join(ARTIFACTS, `${n}.png`), fullPage: true });

      await page.goto(`http://127.0.0.1:${PORT}/remix`, { waitUntil: 'load' });
      await page.waitForTimeout(2000);

      note(`adding URL source: ${SOURCE_URL}`);
      await page.getByPlaceholder(/Paste a URL/i).fill(SOURCE_URL);
      await page.getByRole('button', { name: 'Add', exact: true }).click();
      // Server-side extraction (D-42) — the one step that genuinely needs PHP.
      await page.waitForTimeout(12_000);
      await shot('1-after-extract');
      const extracted = await page.evaluate(() => document.body.innerText);
      note(`extracted source present: ${/word|Word|chars/.test(extracted)}`);

      note('advancing to platform selection');
      await page.getByRole('button', { name: /^Continue$/ }).click();
      await page.waitForTimeout(1500);
      await shot('2-platforms');

      note('selecting the Video Script platform');
      await page.locator('button', { hasText: /Video Script/i }).first().click();
      await page.waitForTimeout(800);
      await page.getByRole('button', { name: /^Continue$|Generate/i }).last().click();
      await shot('3-generating');

      // Browser-native WebLLM writes the script (remix generation is client-side;
      // only extraction and the to-video bridge are server-side).
      note('waiting for the browser LLM to write the video script…');
      const genDeadline = Date.now() + 900_000;
      let scriptText = '';
      while (Date.now() < genDeadline) {
        scriptText = await readVideoScript(page).catch(() => '');
        if (scriptText) break;
        await page.waitForTimeout(5000);
      }
      await shot('4-after-generate');
      note(`video_script produced: ${!!scriptText}${scriptText ? ` (${scriptText.length} chars)` : ''}`);
      if (!scriptText) throw new Error('browser LLM never produced a video script (see 4-after-generate.png)');
      // Record the evidence, not just the boolean — a bare `true` is exactly what
      // the two §5 measurement bugs produced while being wrong.
      fs.writeFileSync(path.join(ARTIFACTS, 'video-script.txt'), scriptText);
      note(`script evidence: ${JSON.stringify(scriptText.slice(0, 120))}…`);

      note('bridging remix → video wizard');
      await page.getByRole('button', { name: /Send to video|Create video|To video/i }).first().click();
      await page.waitForTimeout(6000);
      await shot('5-wizard-hydrated');

      // The wizard is Script → Visuals → Voice → Style → Generate, so reaching the
      // render control takes FOUR Next clicks from Script, not three. The previous
      // run clicked three, parked on Style, and then clicked a render button that
      // does not exist on that step — and because BOTH the Next calls and that click
      // were `.catch(() => {})`, nothing was reported: the harness sat out its full
      // 25-minute download deadline against an idle page and blamed the app for
      // producing no MP4. A step that will not advance IS the finding; let it throw.
      note('driving the video wizard: script → visuals');
      await next(page, 'script→visuals', 60_000);

      // GenerateStep gates on `missingImages === 0 && missingNarration === 0 && hasVoice`.
      // A remixed script lands as image-less scenes with no voice picked, so the
      // render button is (honestly) disabled until that work is done. Do what a user
      // would do rather than clicking a dead control.
      note('generating all scene images on-device (SD-Turbo)');
      const genAll = page.getByRole('button', { name: /Generate All Images/i });
      if (await genAll.count().catch(() => 0)) {
        await genAll.click();
        const imgDeadline = Date.now() + 1_200_000;
        while (Date.now() < imgDeadline) {
          if (await page.getByText(/All scenes have visuals/i).count().catch(() => 0)) break;
          await page.waitForTimeout(5000);
        }
      }
      await shot('6-visuals');
      note(`all scenes have visuals: ${!!(await page.getByText(/All scenes have visuals/i).count().catch(() => 0))}`);
      await next(page, 'visuals→voice', 60_000);

      note('picking a voice preset');
      const pickVoice = page.getByRole('button', { name: /^Select$/ }).first();
      if (await pickVoice.count().catch(() => 0)) await pickVoice.click().catch(() => {});
      await page.waitForTimeout(1000);
      await next(page, 'voice→style', 60_000);
      await next(page, 'style→generate', 60_000);
      await shot('7-generate-step');

      note('clicking Generate Video');
      const renderBtn = page.getByRole('button', { name: /^Generate Video$/ });
      if (!(await renderBtn.isEnabled().catch(() => false))) {
        throw new Error('"Generate Video" is disabled on the Generate step — required fields incomplete (see 7-generate-step.png)');
      }
      await renderBtn.click();
    }

    // Wait for a download (the user-visible artifact) or an explicit Download button.
    note('waiting for rendered MP4 download…');
    const deadline = Date.now() + 1_500_000;
    while (Date.now() < deadline && downloads.length === 0) {
      const dl = page.getByRole('button', { name: /Download MP4|Download Video|Download/i }).last();
      if (await dl.count().catch(() => 0)) {
        if (await dl.isEnabled().catch(() => false)) {
          await dl.click().catch(() => {});
          await page.waitForTimeout(2500);
        }
      }
      if (downloads.length) break;
      await page.waitForTimeout(3000);
    }

    if (!downloads.length) throw new Error('no MP4 was produced within the timeout');
    mp4 = path.join(ARTIFACTS, 'output.mp4');
    await downloads[0].saveAs(mp4);
    note(`saved ${mp4}`);
  } catch (e) {
    error = e.message.split('\n')[0];
    log(`FLOW ERROR: ${error}`);
  } finally {
    await page.screenshot({ path: path.join(ARTIFACTS, 'final.png'), fullPage: true }).catch(() => {});
    fs.writeFileSync(path.join(ARTIFACTS, 'console.log'), console_.join('\n'));

    let probed = null;
    if (mp4 && fs.existsSync(mp4)) {
      try { probed = probe(mp4); } catch (e) { error = error || `ffprobe failed: ${e.message}`; }
    }
    const report = {
      flow: FLOW,
      generatedBy: 'scripts/verify-render-flows.mjs',
      backend: FLOW === 'url' ? 'local PHP + MySQL 8 (routed)' : 'OFF (browser-native only)',
      steps,
      error,
      mp4: mp4 && fs.existsSync(mp4) ? path.relative(REPO_ROOT, mp4) : null,
      ffprobe: probed && { ...probed, raw: undefined },
      // Proven = a real MP4 with a decodable video stream came out of the UI.
      proven: !!(probed && probed.hasVideo && probed.duration > 0 && probed.size > 0),
    };
    fs.writeFileSync(path.join(ARTIFACTS, 'report.json'), JSON.stringify(report, null, 2));
    log(`RESULT: proven=${report.proven}${probed ? ` codecs=${probed.codecs} dur=${probed.duration}s size=${probed.size}B` : ''}`);
    await context.close().catch(() => {});
    server.kill();
    process.exit(report.proven ? 0 : 1);
  }
}

main().catch((e) => { log(`FATAL: ${e.stack || e.message}`); process.exit(1); });
