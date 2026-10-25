/**
 * P0 close-out proof — SCRIPT GENERATION, LLM PRESENT AND ABSENT.
 *
 * Four states, driven in real Chrome against the rebuilt static export:
 *
 *   A. video wizard, backend UNREACHABLE   — the "LLM absent" case users hit offline
 *   B. video wizard, backend REACHABLE but no AI provider configured (HTTP 500)
 *   C. cartoon wizard, WebGPU ABSENT       — browser-native LLM unavailable
 *   D. cartoon wizard, WebGPU PRESENT      — browser-native LLM actually drafts
 *
 * The pass condition is NOT "generation succeeds" — offline with no model, it
 * must not. The condition is that the app is HONEST: either it produces a real
 * script, or it tells the user why it can't. A click that spins and then leaves
 * the page silently unchanged is a Law-L1 failure and this harness records it
 * as such (`honest: false`), rather than as a pass.
 *
 * Backend routing: the static export bakes NEXT_PUBLIC_API_URL to production, so
 * case B redirects http://localhost:8080/api/** to the local PHP server at
 * the network layer and injects the X-API-Key header. No app code or built
 * artifact is modified for the test.
 *
 * Usage: node scripts/verify-script-generation.mjs
 * Writes: artifacts/script-generation/{report.json,case-*.png,console-*.log}
 */
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = process.env.CONTENTINE_REPO_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FRONTEND = path.join(REPO_ROOT, 'frontend');
const ARTIFACTS = path.join(REPO_ROOT, 'artifacts', 'script-generation');
const PORT = 8324;
const BACKEND = 'http://127.0.0.1:8080';
const API_KEY = (process.env.CONTENTINE_API_KEY || process.env.OPENAI_API_KEY || '');
const PROD_API = 'http://localhost:8080/api';

const require = createRequire(path.join(FRONTEND, 'package.json'));
const { chromium } = require('@playwright/test');

const log = (m) => process.stdout.write(`[script-proof] ${m}\n`);
const TOPIC = 'Three surprising facts about deep sea squid';

/**
 * Records unhandled promise rejections — the fingerprint of a silent failure —
 * and every toast/alert that EVER appears. Toasts auto-dismiss after a few
 * seconds, so sampling the DOM once at the end of a long wait reports "no
 * message shown" for a flow that did in fact tell the user. A MutationObserver
 * is the only sound way to answer "was the user ever informed?".
 */
function instrument() {
  const w = /** @type {any} */ (window);
  w.__unhandled = [];
  w.__messages = [];
  window.addEventListener('unhandledrejection', (e) => {
    w.__unhandled.push(String(e.reason && e.reason.message ? e.reason.message : e.reason));
  });

  // The shared ToastProvider renders items into a bare fixed container carrying
  // NO role/aria-live and no class hook, so role-based selectors miss every
  // toast this app shows. Match the container structurally as well. (That the
  // toast has no aria-live is itself an accessibility defect — a screen-reader
  // user is never told the generation failed.)
  const SEL = '[role="alert"],[role="status"],[data-toast],.toast';
  // ToastProvider's container: `fixed bottom-20 … z-50 pointer-events-none`.
  // Match on `.fixed.bottom-20` — `.z-50.pointer-events-none` alone also matches
  // sidebar chrome and silently reports its text instead of the toast's.
  const TOAST_CONTAINER = 'div.fixed.bottom-20';
  const capture = (root) => {
    if (!(root instanceof HTMLElement)) return;
    const nodes = root.matches?.(SEL) || root.closest?.(TOAST_CONTAINER) ? [root] : [];
    nodes.push(...root.querySelectorAll?.(SEL) ?? []);
    for (const n of nodes) {
      const t = (n.textContent || '').replace(/\s+/g, ' ').trim();
      if (t && !w.__messages.includes(t)) w.__messages.push(t);
    }
  };
  new MutationObserver((muts) => {
    for (const m of muts) m.addedNodes.forEach(capture);
  }).observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', () => capture(document.body));
}

async function newPage(context, { blockWebGPU = false, routeBackend = false } = {}) {
  const page = await context.newPage();
  await page.addInitScript(instrument);
  if (blockWebGPU) {
    // Simulate a browser without WebGPU (Safari/Firefox/older Chrome).
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'gpu', { get: () => undefined, configurable: true });
    });
  }
  if (routeBackend) {
    await page.route(`${PROD_API}/**`, async (route) => {
      const req = route.request();
      const target = BACKEND + '/api' + req.url().slice(PROD_API.length);
      try {
        const res = await route.fetch({
          url: target,
          headers: { ...req.headers(), 'X-API-Key': API_KEY, origin: `http://127.0.0.1:${PORT}` },
        });
        const body = await res.body();
        await route.fulfill({
          status: res.status(),
          headers: { ...res.headers(), 'access-control-allow-origin': '*' },
          body,
        });
      } catch (err) {
        await route.abort();
      }
    });
  }
  return page;
}

/**
 * Toasts live ~4-6s and this app's toast carries no role/aria-live, so neither a
 * single end-of-wait DOM read nor a MutationObserver on role selectors sees it.
 * Poll the ToastProvider container for the whole wait and accumulate — verified
 * to capture the real "AI drafting needs WebGPU" toast.
 */
async function collectMessages(page, totalMs) {
  const seen = new Set();
  const deadline = Date.now() + totalMs;
  while (Date.now() < deadline) {
    const texts = await page.evaluate(() =>
      [...document.querySelectorAll('div.fixed.bottom-20')]
        .map((d) => (d.innerText || '').replace(/\s+/g, ' ').trim())
        .filter(Boolean),
    ).catch(() => []);
    texts.forEach((t) => seen.add(t));
    await page.waitForTimeout(400);
  }
  return [...seen];
}

/**
 * Narration textareas ONLY. The AI panel's "topic" textarea must be excluded:
 * the harness types the topic into it, so counting it makes "the page changed"
 * true in every case and reports a silent failure as a successful generation.
 */
async function sceneSnapshot(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('textarea')]
      .filter((t) => !/e\.g\./i.test(t.placeholder || ''))
      .map((t) => t.value.trim())
      .filter(Boolean),
  );
}

/**
 * Open the "Generate script with AI" disclosure, type the topic, click the
 * drafting button. Selectors are exact on purpose: both wizards also render a
 * permanently-disabled wizard-step button literally named "Generate", and a
 * loose regex silently targets THAT and times out on actionability instead of
 * ever exercising the feature.
 */
async function driveGenerate(page, beforeClick) {
  await page.getByRole('button', { name: 'Generate script with AI', exact: true }).click();
  await page.waitForTimeout(500);

  const topic = page.getByPlaceholder(/e\.g\./i).first();
  await topic.click();
  await topic.fill(TOPIC);
  await page.waitForTimeout(300);

  // The drafting button carries "Generate Script" and must be enabled by now.
  // The drafting button's LABEL is state-dependent — "Generate Script" once the
  // model is ready, but "Download AI model (…)" when it isn't, and "Drafting…"
  // mid-run. Matching on "generate script" therefore matches only the disclosure
  // and silently re-collapses the panel. Locate it structurally instead: the
  // action button inside the panel that owns the topic field.
  const btn = page.locator('button')
    .filter({ hasText: /Generate Script|Download .*\(|Drafting|Downloading/i })
    .filter({ hasNotText: /with AI/i }) // exclude the disclosure toggle
    .last();
  await btn.waitFor({ state: 'visible', timeout: 15_000 });
  const disabled = await btn.isDisabled();
  if (disabled) throw new Error('drafting button still disabled after typing a topic');
  if (beforeClick) await beforeClick(); // snapshot AFTER typing, immediately before the click
  await btn.click();
}

async function main() {
  fs.mkdirSync(ARTIFACTS, { recursive: true });
  const server = spawn('node', ['e2e/serve.mjs', String(PORT)], { cwd: FRONTEND, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 1200));
  log(`serving out/ on http://127.0.0.1:${PORT}`);

  const profileDir = path.join(os.tmpdir(), 'c-m1-chrome-profile');
  const context = await chromium.launchPersistentContext(profileDir, {
    channel: 'chrome', headless: true, viewport: { width: 1440, height: 1000 },
  });

  const cases = [];

  /** Run one case and classify it honest / silent. */
  async function runCase(id, { url, opts, waitMs, expect }) {
    log(`--- case ${id}: ${expect} ---`);
    const page = await newPage(context, opts);
    const console_ = [];
    page.on('console', (m) => console_.push(`[${m.type()}] ${m.text()}`));
    page.on('pageerror', (e) => console_.push(`[pageerror] ${e.message}`));

    let scenesBefore = [], scenesAfter = [], messages = [], unhandled = [], err = null;
    try {
      await page.goto(`http://127.0.0.1:${PORT}${url}`, { waitUntil: 'load', timeout: 60_000 });
      await page.waitForTimeout(1500);
      await driveGenerate(page, async () => { scenesBefore = await sceneSnapshot(page); });
      messages = await collectMessages(page, waitMs);
      scenesAfter = await sceneSnapshot(page);
      unhandled = await page.evaluate(() => window.__unhandled);
    } catch (e) {
      err = e.message.split('\n')[0];
    }

    const produced = JSON.stringify(scenesAfter) !== JSON.stringify(scenesBefore) && scenesAfter.length > 0;
    const told = messages.length > 0;
    const rec = {
      id, url, expect, harnessError: err,
      scenesBefore, scenesAfter, producedScript: produced,
      userVisibleMessages: messages, unhandledRejections: unhandled,
      // Honest = produced a real script, OR told the user why it couldn't.
      honest: produced || told,
    };
    cases.push(rec);
    log(`  produced=${produced} told=${told} honest=${rec.honest} msgs=${JSON.stringify(messages)} unhandled=${JSON.stringify(unhandled)}`);
    await page.screenshot({ path: path.join(ARTIFACTS, `case-${id}.png`), fullPage: true });
    fs.writeFileSync(path.join(ARTIFACTS, `console-${id}.log`), console_.join('\n'));
    await page.close();
  }

  try {
    await runCase('A-wizard-backend-unreachable', {
      url: '/video/create', opts: {}, waitMs: 12_000,
      expect: 'video wizard, backend unreachable (LLM absent)',
    });
    await runCase('B-wizard-backend-500', {
      url: '/video/create', opts: { routeBackend: true }, waitMs: 15_000,
      expect: 'video wizard, backend up but no AI provider (HTTP 500)',
    });
    await runCase('C-cartoon-no-webgpu', {
      url: '/cartoon', opts: { blockWebGPU: true }, waitMs: 8_000,
      expect: 'cartoon wizard, WebGPU absent (browser LLM unavailable)',
    });
    await runCase('D-cartoon-webgpu', {
      url: '/cartoon', opts: {}, waitMs: 900_000,
      expect: 'cartoon wizard, WebGPU present (browser LLM drafts for real)',
    });
  } finally {
    const report = {
      generatedBy: 'scripts/verify-script-generation.mjs',
      topic: TOPIC,
      dishonestCases: cases.filter((c) => !c.honest).map((c) => c.id),
      allHonest: cases.length > 0 && cases.every((c) => c.honest),
      cases,
    };
    fs.writeFileSync(path.join(ARTIFACTS, 'report.json'), JSON.stringify(report, null, 2));
    log(`RESULT: ${cases.filter((c) => c.honest).length}/${cases.length} cases honest`);
    if (report.dishonestCases.length) log(`SILENT FAILURES: ${report.dishonestCases.join(', ')}`);
    await context.close().catch(() => {});
    server.kill();
    process.exit(0); // findings are the product; a silent failure is data, not a crash
  }
}

main().catch((e) => { log(`FATAL: ${e.stack || e.message}`); process.exit(1); });
