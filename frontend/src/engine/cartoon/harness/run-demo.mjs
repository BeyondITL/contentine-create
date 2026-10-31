/**
 * Contentine Create — recorded demo of the supported workflow (real UI)
 *
 * Production static build in Chrome, fresh profile, Playwright video:
 *   1. Open the versioned sample (samples/cartoon/dot-and-dash.plan.json)
 *   2. Open it → the app voices (Kokoro, on-device) and renders it
 *   3. Preview, then a visual-only edit: new background for scene 2
 *   4. Re-roll → partial re-render (only scene 2), timing preserved
 *   5. Download the MP4 and verify it with ffprobe
 * The raw recording is kept; a labelled cut replaces long waits with title
 * cards stating the measured elapsed time. Writes artifacts/demo/.
 *
 * Usage (repo root, after `cd frontend && npm run build`):
 *   node frontend/src/engine/cartoon/harness/run-demo.mjs
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { REPO_ROOT, FRONTEND, logger, ffprobe, decodedFrameMd5s, decodedAudioMd5, countDiff, sha256File } from './harness-runtime.mjs';

const log = logger('demo');
const require = createRequire(path.join(FRONTEND, 'package.json'));
const { chromium } = require('@playwright/test');
const ART = path.join(REPO_ROOT, 'artifacts', 'demo');
const SAMPLE = path.join(REPO_ROOT, 'samples', 'cartoon', 'dot-and-dash.plan.json');
const FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
const PORT = 3000;

function startApp() {
  const p = spawn(process.execPath, [path.join(FRONTEND, 'e2e', 'serve.mjs'), String(PORT)], { stdio: ['ignore', 'pipe', 'pipe'] });
  return new Promise((resolve, reject) => {
    p.stdout.on('data', (d) => String(d).includes('static server') && resolve(p));
    p.on('exit', (c) => reject(new Error(`app server exited ${c}`)));
  });
}

async function main() {
  fs.rmSync(ART, { recursive: true, force: true });
  fs.mkdirSync(ART, { recursive: true });
  const app = await startApp();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-profile-'));
  const videoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-video-'));
  const opts = { headless: true, viewport: { width: 1440, height: 900 }, recordVideo: { dir: videoDir, size: { width: 1440, height: 900 } }, acceptDownloads: true };
  let context;
  try {
    context = await chromium.launchPersistentContext(profile, { channel: 'chrome', ...opts });
  } catch {
    context = await chromium.launchPersistentContext(profile, opts);
  }
  const page = await context.newPage();
  const t0 = Date.now();
  const marks = [];
  const mark = (label) => {
    const t = (Date.now() - t0) / 1000;
    marks.push({ label, t });
    log(`${t.toFixed(1)}s  ${label}`);
  };
  const result = {};
  try {
    await page.goto(`http://127.0.0.1:${PORT}/cartoon/`, { waitUntil: 'networkidle' });
    await page.getByText('Saved on this device').waitFor({ timeout: 30_000 });
    mark('Cartoon Studio — open the sample scene plan');
    await page.waitForTimeout(1500);
    await page.locator('input[type=file][accept*="ccproj"]').setInputFiles(SAMPLE);
    await page.getByText('renders when opened').waitFor({ timeout: 30_000 });
    await page.waitForTimeout(1500);
    mark('Open → voices on-device (Kokoro) and renders');
    await page.getByRole('button', { name: 'Open', exact: true }).first().click();
    await page.getByText('· Timeline').waitFor({ timeout: 900_000 });
    mark('Editor: the first render, ready to preview');
    await page.waitForTimeout(1000);
    await page.getByRole('button', { name: /play/i }).first().click().catch(() => {});
    await page.waitForTimeout(6000);
    mark('Visual-only edit: new background for scene 2');
    await page.locator('[role=listitem][aria-label^="Scene 2,"]').click();
    await page.waitForTimeout(1200);
    await page.getByRole('button', { name: /^Re-roll$/ }).click();
    await page.waitForTimeout(2500);
    mark('Re-roll → only scene 2 re-renders');
    await page.getByRole('button', { name: /Re-roll 1 edited scene/ }).click();
    await page.getByRole('button', { name: 'No edits to re-roll' }).waitFor({ timeout: 300_000 });
    mark('Done: re-rendered 1 scene, reused 2');
    result.report = await page.getByText(/Last re-roll:/).textContent();
    await page.waitForTimeout(2500);
    mark('Download the MP4');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Download MP4/ }).click()]);
    const mp4 = path.join(ART, 'demo-export.mp4');
    await dl.saveAs(mp4);
    await page.waitForTimeout(2000);
    mark('End');
  } finally {
    const video = page.video();
    await context.close().catch(() => {});
    app.kill();
    if (video) fs.copyFileSync(await video.path(), path.join(ART, 'demo-raw.webm'));
  }

  // Verify the downloaded export.
  const mp4 = path.join(ART, 'demo-export.mp4');
  const probe = ffprobe(mp4);
  fs.writeFileSync(path.join(ART, 'ffprobe-demo-export.txt'), probe);

  // Labelled cut: keep short stretches around each step; replace long waits
  // with a 2 s card stating what was cut and how long it really took.
  const raw = path.join(ART, 'demo-raw.webm');
  const dur = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', raw], { encoding: 'utf8' }).trim());
  const offset = dur - (marks.at(-1).t); // recording starts slightly before t0
  const segs = [];
  for (let i = 0; i < marks.length - 1; i++) {
    const a = marks[i].t + offset;
    const b = marks[i + 1].t + offset;
    const keep = Math.min(b - a, 9);
    segs.push({ label: marks[i].label, start: a, end: a + keep, cut: b - a - keep > 1 ? { seconds: b - a - keep, during: marks[i].label } : null, elapsedAt: marks[i].t });
  }
  const esc = (s) => s.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, '\u2019').replace(/%/g, '\\%');
  const parts = [];
  let n = 0;
  for (const s of segs) {
    const clip = path.join(ART, `part-${n++}.mp4`);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', s.start.toFixed(2), '-to', s.end.toFixed(2), '-i', raw, '-vf',
      `drawbox=x=0:y=ih-64:w=iw:h=64:color=black@0.72:t=fill,` +
      `drawtext=fontfile=${FONT}:text='${esc(s.label)}':x=24:y=h-46:fontsize=26:fontcolor=white,` +
      `drawtext=fontfile=${FONT}:text='real time %{eif\\:${s.elapsedAt.toFixed(1)}+t\\:d}s':x=w-tw-24:y=h-46:fontsize=26:fontcolor=white`,
      '-r', '25', '-pix_fmt', 'yuv420p', '-an', clip]);
    parts.push(clip);
    if (s.cut) {
      const card = path.join(ART, `part-${n++}.mp4`);
      execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0x111111:s=1440x900:d=2:r=25', '-vf',
        `drawtext=fontfile=${FONT}:text='cut — ${Math.round(s.cut.seconds)} s of waiting (${esc(s.cut.during.split('—')[0].trim())})':x=(w-tw)/2:y=(h-th)/2:fontsize=34:fontcolor=white`,
        '-pix_fmt', 'yuv420p', card]);
      parts.push(card);
    }
  }
  const list = path.join(ART, 'parts.txt');
  fs.writeFileSync(list, parts.map((p) => `file '${p}'`).join('\n'));
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(ART, 'demo-labelled.mp4')]);
  for (const p of parts) fs.rmSync(p);
  fs.rmSync(list);

  const report = {
    generatedBy: 'run-demo.mjs',
    marks,
    rerollReport: result.report,
    export: { sha256: sha256File(mp4), bytes: fs.statSync(mp4).size, hasVideo: /codec_type=video/.test(probe), hasAudio: /codec_type=audio/.test(probe), duration: probe.match(/^duration=([\d.]+)/m)?.[1] },
    recordings: { raw: 'demo-raw.webm', labelled: 'demo-labelled.mp4' },
  };
  fs.writeFileSync(path.join(ART, 'demo-report.json'), JSON.stringify(report, null, 2));
  log(`export ok=${report.export.hasVideo && report.export.hasAudio} · ${result.report}`);
  if (!(report.export.hasVideo && report.export.hasAudio && /re-rendered 1, reused 2/.test(result.report ?? ''))) process.exit(1);
}

main().catch((err) => {
  log(`FATAL: ${err.stack ?? err}`);
  process.exit(1);
});
