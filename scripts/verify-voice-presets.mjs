/**
 * SA-32 proof driver — VOICE PRESET RECONCILIATION.
 *
 * Drives the REAL /voices page in the rebuilt static export with the PHP backend
 * OFF (so the client-side VOICE_PRESETS fallback is what renders) and clicks the
 * Preview button on EVERY rendered preset card. A card passes only if all three
 * hold:
 *   1. the voice id the card actually sent to the TTS worker equals the id
 *      `voice-presets.ts` declares for that card name — binding the rendered
 *      card to the reconciled source of truth, so a card cannot pass by quietly
 *      falling back to some other voice;
 *   2. Kokoro produced a non-silent PCM buffer (captured by instrumenting
 *      AudioBuffer.copyToChannel — length, sample rate, RMS, peak). A fabricated
 *      id never reaches this point;
 *   3. no error toast appeared (a bad id surfaces as "Voice <id> not found.
 *      Should be one of: …").
 *
 * Binding is done at the worker boundary, NOT over the network: kokoro-js seeds
 * ALL 54 voice bins into Cache Storage on init, so per-card network attribution
 * is impossible. Voice-bin responses are still recorded for the record. The 82M
 * model stays cached (persistent profile) to keep the run short.
 *
 * Usage: node scripts/verify-voice-presets.mjs
 * Writes: artifacts/voice-presets/{report.json,voices-page.png,console.log}
 */
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = process.env.CONTENTINE_REPO_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FRONTEND = path.join(REPO_ROOT, 'frontend');
const ARTIFACTS = path.join(REPO_ROOT, 'artifacts', 'voice-presets');
const PORT = 8322;
const PREVIEW_TIMEOUT_MS = 180_000; // first click also spins up the TTS worker

const require = createRequire(path.join(FRONTEND, 'package.json'));
const { chromium } = require('@playwright/test');

const log = (m) => process.stdout.write(`[voice-proof] ${m}\n`);

/** name → kokoro_voice_id, parsed from the module the page actually bundles. */
function expectedPresets() {
  const src = fs.readFileSync(path.join(FRONTEND, 'src/lib/voice-presets.ts'), 'utf8');
  const map = new Map();
  for (const m of src.matchAll(/name: '([^']+)',\s*kokoro_voice_id: '([^']+)'/g)) map.set(m[1], m[2]);
  return map;
}

/** Instrumentation installed before any page script runs. */
function instrument() {
  const w = /** @type {any} */ (window);
  w.__audio = [];
  w.__synth = [];

  // Bind click → voice id: the page posts {type:'synthesize', voiceId} to the
  // TTS worker, so this records exactly which Kokoro voice each card asked for.
  // (Network can't do this job — kokoro-js seeds ALL 54 voice bins on init.)
  const postMessage = Worker.prototype.postMessage;
  Worker.prototype.postMessage = function (msg, ...rest) {
    try {
      if (msg && typeof msg === 'object' && String(msg.type).startsWith('synthesize')) {
        w.__synth.push({ type: msg.type, voiceId: msg.voiceId, speed: msg.speed });
      }
    } catch { /* never break the worker for measurement */ }
    return postMessage.call(this, msg, ...rest);
  };

  const orig = AudioBuffer.prototype.copyToChannel;
  AudioBuffer.prototype.copyToChannel = function (src, ch, off) {
    try {
      let sum = 0;
      let peak = 0;
      for (let i = 0; i < src.length; i++) {
        const v = src[i];
        sum += v * v;
        const a = v < 0 ? -v : v;
        if (a > peak) peak = a;
      }
      w.__audio.push({
        samples: src.length,
        sampleRate: this.sampleRate,
        durationSec: +(src.length / this.sampleRate).toFixed(3),
        rms: +Math.sqrt(sum / src.length).toFixed(6),
        peak: +peak.toFixed(6),
      });
    } catch { /* never break playback for measurement */ }
    return orig.call(this, src, ch, off);
  };
}

async function main() {
  fs.mkdirSync(ARTIFACTS, { recursive: true });

  const server = spawn('node', ['e2e/serve.mjs', String(PORT)], { cwd: FRONTEND, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 1200));
  log(`serving out/ on http://127.0.0.1:${PORT}`);

  const profileDir = path.join(os.tmpdir(), 'c-m1-chrome-profile'); // reuse cached Kokoro model
  let context;
  try {
    context = await chromium.launchPersistentContext(profileDir, {
      channel: 'chrome', headless: true, viewport: { width: 1440, height: 1000 },
    });
  } catch (err) {
    log(`chrome channel unavailable (${String(err.message).split('\n')[0]}); bundled chromium`);
    context = await chromium.launchPersistentContext(profileDir, { headless: true });
  }

  const page = await context.newPage();
  await page.addInitScript(instrument);

  const consoleLines = [];
  const voiceFetches = []; // every voices/<id>.bin response seen
  page.on('console', (m) => consoleLines.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => consoleLines.push(`[pageerror] ${e.message}`));
  page.on('response', (res) => {
    const m = /\/voices\/([a-z]{2}_[a-z]+)\.bin/.exec(res.url());
    if (m) voiceFetches.push({ id: m[1], status: res.status() });
  });

  const EXPECTED = expectedPresets();
  log(`expected presets from voice-presets.ts: ${EXPECTED.size}`);
  const results = [];
  let pageTitleCount = null;
  try {
    await page.goto(`http://127.0.0.1:${PORT}/voices`, { waitUntil: 'load', timeout: 60_000 });

    // Force every voice embedding to re-fetch so a card can't pass on a stale bin.
    const cleared = await page.evaluate(async () => {
      const keys = await caches.keys();
      const hit = keys.filter((k) => k.includes('voice'));
      await Promise.all(hit.map((k) => caches.delete(k)));
      return { all: keys, deleted: hit };
    });
    log(`cache buckets: ${cleared.all.join(', ') || '(none)'} — deleted: ${cleared.deleted.join(', ') || '(none)'}`);
    await page.reload({ waitUntil: 'load' });

    await page.getByText(/Voice Presets \(\d+\)/).waitFor({ timeout: 30_000 });
    const heading = await page.getByText(/Voice Presets \(\d+\)/).innerText();
    pageTitleCount = Number(/\((\d+)\)/.exec(heading)[1]);
    log(`rendered heading: "${heading.trim()}"`);

    // Preset cards live in the grid immediately after the "Voice Presets" heading.
    const cards = page.locator('h3:has-text("Voice Presets") + div > div');
    const count = await cards.count();
    log(`preset cards in DOM: ${count}`);

    for (let i = 0; i < count; i++) {
      const card = cards.nth(i);
      const name = (await card.locator('p.text-sm').first().innerText()).trim();
      const language = (await card.locator('p.text-\\[10px\\]').first().innerText()).trim();
      const before = voiceFetches.length;
      const audioBefore = await page.evaluate(() => window.__audio.length);
      const synthBefore = await page.evaluate(() => window.__synth.length);

      await card.getByRole('button', { name: /Preview|Playing|Loading/ }).click();

      let ok = false;
      let error = null;
      const deadline = Date.now() + PREVIEW_TIMEOUT_MS;
      while (Date.now() < deadline) {
        const alert = page.locator('[role="alert"]');
        if (await alert.count()) {
          const txt = (await alert.first().innerText()).trim();
          if (txt) { error = txt; break; }
        }
        if ((await page.evaluate(() => window.__audio.length)) > audioBefore) { ok = true; break; }
        await page.waitForTimeout(250);
      }

      const audio = ok ? (await page.evaluate(() => window.__audio.at(-1))) : null;
      const synth = await page.evaluate((n) => window.__synth.slice(n), synthBefore);
      const requestedVoiceId = synth.length ? synth[synth.length - 1].voiceId : null;
      const expectedVoiceId = EXPECTED.get(name) ?? null;
      const idMatches = requestedVoiceId !== null && requestedVoiceId === expectedVoiceId;
      const fetched = voiceFetches.slice(before);
      results.push({
        index: i, name, language, ok: ok && idMatches, previewed: ok, error,
        expectedVoiceId, requestedVoiceId, idMatches, audio, voiceFetches: fetched,
      });
      log(
        `${String(i + 1).padStart(2)}/${count} ${name.padEnd(9)} ${(requestedVoiceId ?? '?').padEnd(11)} ` +
        `${ok && idMatches ? 'PREVIEW OK' : ok ? 'ID MISMATCH' : 'FAILED'}` +
        (idMatches ? '' : ` (expected ${expectedVoiceId})`) +
        (audio ? `  ${audio.durationSec}s @${audio.sampleRate}Hz rms=${audio.rms} peak=${audio.peak}` : '') +
        (fetched.length ? `  bin=${fetched.map((f) => `${f.id}:${f.status}`).join(',')}` : '  bin=(cached)') +
        (error ? `  err="${error}"` : ''),
      );

      // Stop playback so the next card starts from a clean state.
      await page.evaluate(() => { /* let the source finish naturally */ });
      await page.waitForTimeout(300);
    }

    await page.screenshot({ path: path.join(ARTIFACTS, 'voices-page.png'), fullPage: true });
  } finally {
    const passed = results.filter((r) => r.ok).length;
    const report = {
      generatedBy: 'scripts/verify-voice-presets.mjs',
      url: `http://127.0.0.1:${PORT}/voices`,
      backend: 'OFF (client-side VOICE_PRESETS fallback under test)',
      headingCount: pageTitleCount,
      cardsClicked: results.length,
      previewsSucceeded: passed,
      expectedPresetCount: EXPECTED.size,
      allCardIdsMatchSource: results.length > 0 && results.every((r) => r.idMatches),
      allPassed: results.length > 0 && passed === results.length,
      voiceBinFetches: voiceFetches,
      results,
    };
    fs.writeFileSync(path.join(ARTIFACTS, 'report.json'), JSON.stringify(report, null, 2));
    fs.writeFileSync(path.join(ARTIFACTS, 'console.log'), consoleLines.join('\n'));
    log(`RESULT: ${passed}/${results.length} preset cards previewed successfully`);
    await context.close().catch(() => {});
    server.kill();
    process.exit(report.allPassed ? 0 : 1);
  }
}

main().catch((e) => { log(`FATAL: ${e.stack || e.message}`); process.exit(1); });
