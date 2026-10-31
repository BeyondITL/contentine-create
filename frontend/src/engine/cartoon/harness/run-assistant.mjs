/**
 * Contentine Create — G5: a REAL assistant completes edit-to-export
 *
 * Real components: the production static build of the app (out/) served with
 * COOP/COEP, real Chrome, the real IndexedDB project store, the contentine-
 * bridge companion (MCP over stdio + paired WebSocket), and Claude Code
 * (`claude -p`) as the assistant — restricted to the contentine MCP tools
 * (all built-in tools disabled: no shell, no file access).
 *
 *  1. Restore a sample project from a .ccproj backup in the UI and open it.
 *  2. Assistant session A: wait for pairing, inspect, propose the scene-two
 *     edit; the person enters the pairing code in the editor panel.
 *  3. The person edits the same project in the UI and re-rolls (new revision).
 *  4. Assistant session B (--resume A): apply against the revision it saw →
 *     must hit REVISION_CONFLICT, re-inspect, re-apply, render, wait, save MP4.
 *  5. Verify: audit log order, saved MP4 (ffprobe + sha256), the person's
 *     edit preserved, and the revision history attributes the assistant.
 *
 * Usage (repo root, after `cd frontend && npm run build` and bridge `npm ci`):
 *   node frontend/src/engine/cartoon/harness/run-assistant.mjs [path/to/project.ccproj]
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { REPO_ROOT, FRONTEND, logger, ffprobe, sha256File } from './harness-runtime.mjs';

const log = logger('g5');
const require = createRequire(path.join(FRONTEND, 'package.json'));
const { chromium } = require('@playwright/test');

const ART = path.join(REPO_ROOT, 'artifacts', 'assistant');
const BUNDLE = path.resolve(process.argv[2] ?? path.join(REPO_ROOT, 'artifacts', 'persistence', 'project-bundle.ccproj'));
const PROJECT_ID = 'c-m1-reference';
const APP_PORT = 3000;
const BRIDGE_PORT = 47821;

function startApp() {
  const p = spawn(process.execPath, [path.join(FRONTEND, 'e2e', 'serve.mjs'), String(APP_PORT)], { stdio: ['ignore', 'pipe', 'pipe'] });
  return new Promise((resolve, reject) => {
    p.stdout.on('data', (d) => String(d).includes('static server') && resolve(p));
    p.on('exit', (c) => reject(new Error(`app server exited ${c}`)));
  });
}

function runClaude(label, prompt, mcpConfig, resumeId) {
  const args = [
    '-p', prompt,
    '--mcp-config', mcpConfig, '--strict-mcp-config',
    '--tools', '',
    '--allowedTools', 'mcp__contentine',
    '--disable-slash-commands',
    '--output-format', 'stream-json', '--verbose',
    ...(resumeId ? ['--resume', resumeId] : []),
  ];
  const transcript = path.join(ART, `claude-${label}.jsonl`);
  const out = fs.createWriteStream(transcript);
  return new Promise((resolve, reject) => {
    const p = spawn('claude', args, { cwd: os.tmpdir(), stdio: ['ignore', 'pipe', 'pipe'] });
    let buf = '';
    let sessionId = null;
    let result = null;
    const toolCalls = [];
    p.stdout.on('data', (d) => {
      out.write(d);
      buf += String(d);
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 1);
        if (!line.trim()) continue;
        try {
          const ev = JSON.parse(line);
          if (ev.session_id) sessionId = ev.session_id;
          if (ev.type === 'assistant') {
            for (const c of ev.message?.content ?? []) {
              if (c.type === 'tool_use') {
                toolCalls.push(c.name);
                log(`${label} → ${c.name} ${JSON.stringify(c.input).slice(0, 160)}`);
              } else if (c.type === 'text' && c.text.trim()) log(`${label} says: ${c.text.trim().slice(0, 300)}`);
            }
          }
          if (ev.type === 'result') result = ev;
        } catch {
          // partial line
        }
      }
    });
    p.stderr.on('data', (d) => fs.appendFileSync(path.join(ART, `claude-${label}.stderr.txt`), d));
    p.on('exit', (code) => {
      out.end();
      if (code !== 0 && !result) reject(new Error(`claude ${label} exited ${code}`));
      else resolve({ sessionId, result, toolCalls, transcript });
    });
  });
}

async function readProjectFromPage(page) {
  return page.evaluate(
    ([pid]) =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open('contentine-cartoon-projects');
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction(['manifests', 'revisions'], 'readonly');
          const m = tx.objectStore('manifests').get(['local', pid]);
          const r = tx.objectStore('revisions').getAll();
          tx.oncomplete = () => {
            const man = m.result;
            const duo = man.plan.scenes.find((s) => s.id === 'scene-duo');
            resolve({
              revision: man.revision,
              dashX: duo.characters.find((c) => c.instanceId === 'dash').position.x,
              duoCaptions: duo.captions.enabled,
              history: r.result.filter((x) => x.projectId === pid).map((x) => ({ revision: x.revision, actorId: x.actorId, note: x.note })),
              cacheMatchesPlan: man.lastRender?.renderedPlanHash === man.planHash,
            });
            db.close();
          };
          tx.onerror = () => reject(tx.error);
        };
        open.onerror = () => reject(open.error);
      }),
    [PROJECT_ID],
  );
}

async function main() {
  if (!fs.existsSync(path.join(FRONTEND, 'out', 'cartoon'))) throw new Error('build the app first: cd frontend && npm run build');
  if (!fs.existsSync(BUNDLE)) throw new Error(`no project bundle at ${BUNDLE} (run run-persistence.mjs first)`);
  fs.rmSync(ART, { recursive: true, force: true });
  fs.mkdirSync(path.join(ART, 'exports'), { recursive: true });
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'g5-bridge-state-'));
  const pairingFile = path.join(stateDir, 'pairing.txt');
  const mcpConfig = path.join(ART, 'mcp-config.json');
  fs.writeFileSync(mcpConfig, JSON.stringify({
    mcpServers: {
      contentine: {
        command: process.execPath,
        args: [path.join(REPO_ROOT, 'bridge', 'src', 'companion.mjs'), '--port', String(BRIDGE_PORT), '--state-dir', stateDir, '--export-dir', path.join(ART, 'exports'), '--pairing-file', pairingFile],
      },
    },
  }, null, 2));

  const app = await startApp();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'g5-profile-'));
  let context;
  try {
    context = await chromium.launchPersistentContext(profile, { channel: 'chrome', headless: true, viewport: { width: 1440, height: 900 } });
  } catch {
    context = await chromium.launchPersistentContext(profile, { headless: true, viewport: { width: 1440, height: 900 } });
  }
  const page = await context.newPage();
  page.on('console', (m) => m.type() === 'error' && !/ERR_CONNECTION_REFUSED|WebSocket connection/.test(m.text()) && log(`page error: ${m.text().slice(0, 200)}`));
  const shot = (name) => page.screenshot({ path: path.join(ART, `${name}.png`) });
  const t0 = Date.now();
  const report = { steps: {} };

  try {
    // 1. Restore + open in the real UI.
    await page.goto(`http://127.0.0.1:${APP_PORT}/cartoon/`, { waitUntil: 'networkidle' });
    await page.getByText('Saved on this device').waitFor({ timeout: 30_000 });
    await page.locator('input[type=file][accept*="ccproj"]').setInputFiles(BUNDLE);
    await page.getByRole('button', { name: /Open/ }).first().waitFor({ timeout: 30_000 });
    await page.getByRole('button', { name: /Open/ }).first().click();
    await page.getByText('· Timeline').waitFor({ timeout: 30_000 });
    await shot('1-editor-opened');
    report.steps.opened = await readProjectFromPage(page);
    log(`project open in editor at revision ${report.steps.opened.revision}`);

    // 2. Session A: pair, inspect, propose. The person enters the code shown.
    const promptA = [
      'You are helping edit a cartoon in Contentine Create through the `contentine` MCP tools.',
      '1) Call bridge_status with waitSeconds 120. If it is not paired, tell me the pairing code and call it again until paired is true.',
      `2) Inspect project "${PROJECT_ID}".`,
      '3) Propose (do not apply) this change: in scene "scene-duo", move the character "dash" horizontally to x = 0.3, keeping y, and change nothing else — narration and timing must stay the same.',
      'Report the revision you inspected and the predicted impact. Stop after proposing; do not apply.',
    ].join('\n');
    const pA = runClaude('A', promptA, mcpConfig);
    for (let i = 0; i < 120 && !fs.existsSync(pairingFile); i++) await new Promise((r) => setTimeout(r, 500));
    const code = fs.readFileSync(pairingFile, 'utf8').trim();
    await page.getByLabel('Pairing code').fill(code);
    await page.getByRole('button', { name: /^Connect$/ }).click();
    await page.getByText('Connected', { exact: true }).waitFor({ timeout: 30_000 });
    await shot('2-assistant-connected');
    const A = await pA;
    report.steps.sessionA = { toolCalls: A.toolCalls, final: A.result?.result, isError: A.result?.is_error ?? null, numTurns: A.result?.num_turns };
    report.steps.afterA = await readProjectFromPage(page);

    // 3. The person edits the same project in the UI and re-rolls.
    await page.locator('[role=listitem][aria-label^="Scene 2,"]').click();
    await page.getByLabel('Toggle burned-in captions for this scene').click();
    await page.getByRole('button', { name: /Re-roll 1 edited scene/ }).click();
    await page.getByRole('button', { name: 'No edits to re-roll' }).waitFor({ timeout: 240_000 });
    await shot('3-user-rerolled');
    report.steps.afterUserEdit = await readProjectFromPage(page);
    log(`person's edit committed as revision ${report.steps.afterUserEdit.revision}`);

    // 4. Session B continues A; the bridge restarts and the tab re-pairs by itself.
    const promptB = [
      'Now apply the change you proposed, using the revision you inspected as expectedRevision.',
      'If the project changed meanwhile, re-inspect and re-plan on the latest revision — keep the other person’s edits, never overwrite them.',
      'Then make sure voice takes are up to date, start a render, wait for it with run_inspect (waitSeconds 60, repeat until terminal), and save the MP4 with artifact_save.',
      'Report: the final revision, the run id, whether the render was partial or full, and the saved file path.',
    ].join('\n');
    const B = await runClaude('B', promptB, mcpConfig, A.sessionId);
    report.steps.sessionB = { toolCalls: B.toolCalls, final: B.result?.result, isError: B.result?.is_error ?? null, numTurns: B.result?.num_turns };
    await shot('4-after-assistant');
    report.steps.final = await readProjectFromPage(page);
  } finally {
    await context.close().catch(() => {});
    app.kill();
  }

  // 5. Verify.
  const audit = fs.readFileSync(path.join(stateDir, 'audit.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  fs.writeFileSync(path.join(ART, 'bridge-audit.jsonl'), audit.map((a) => JSON.stringify(a)).join('\n') + '\n');
  const calls = audit.filter((a) => a.event === 'call');
  const saved = audit.find((a) => a.event === 'artifact-saved');
  const conflictIdx = calls.findIndex((c) => c.command === 'scene_apply_patch' && !c.ok && c.error?.code === 'REVISION_CONFLICT');
  const okApplyIdx = calls.findIndex((c) => c.command === 'scene_apply_patch' && c.ok);
  const renderIdx = calls.findIndex((c) => c.command === 'render_start' && c.ok);
  let probe = null;
  let fileSha = null;
  if (saved && fs.existsSync(saved.path)) {
    probe = ffprobe(saved.path);
    fs.writeFileSync(path.join(ART, 'ffprobe-assistant-export.txt'), probe);
    fileSha = sha256File(saved.path);
  }
  const f = report.steps.final;
  const u = report.steps.afterUserEdit;
  const lastRun = calls.filter((c) => c.command === 'run_inspect' && c.ok).pop();
  const checks = {
    assistantOnlyUsedContentineTools: [...report.steps.sessionA.toolCalls, ...report.steps.sessionB.toolCalls].every((n) => n.startsWith('mcp__contentine__')),
    pairedThroughUi: audit.some((a) => a.event === 'paired'),
    tabResumedForSecondSession: audit.some((a) => a.event === 'resumed'),
    sessionAProposedWithoutApplying: report.steps.afterA.revision === report.steps.opened.revision && calls.some((c) => c.command === 'scene_propose_patch' && c.ok),
    personEditCreatedNewRevision: u.revision > report.steps.afterA.revision && u.duoCaptions !== report.steps.opened.duoCaptions,
    staleApplyRejectedWithConflict: conflictIdx >= 0,
    reinspectedAfterConflict: conflictIdx >= 0 && calls.slice(conflictIdx + 1, okApplyIdx).some((c) => c.command === 'project_inspect'),
    appliedOnLatestRevision: okApplyIdx > conflictIdx && f.dashX === 0.3,
    personEditPreserved: f.duoCaptions === u.duoCaptions,
    historyAttributesAssistant: f.history.some((h) => h.actorId.startsWith('assistant:')),
    renderStartedAfterApply: renderIdx > okApplyIdx,
    runSucceeded: lastRun?.result?.state === 'succeeded',
    mp4SavedAndVerified: Boolean(saved && fileSha === saved.sha256 && /codec_type=video/.test(probe ?? '') && /codec_type=audio/.test(probe ?? '')),
    renderCacheMatchesFinalPlan: f.cacheMatchesPlan === true,
  };
  Object.assign(report, {
    generatedBy: 'run-assistant.mjs',
    wallClockSec: Math.round((Date.now() - t0) / 1000),
    assistant: 'Claude Code (claude -p) — built-in tools disabled; only mcp__contentine allowed',
    bridgeCalls: calls.map((c) => ({ command: c.command, ok: c.ok, error: c.error?.code, ms: c.ms })),
    savedArtifact: saved ?? null,
    savedFileSha256: fileSha,
    checks,
  });
  fs.writeFileSync(path.join(ART, 'g5-report.json'), JSON.stringify(report, null, 2));
  log('──────────── G5 gate ────────────');
  for (const [k, v] of Object.entries(checks)) log(`${v ? 'PASS' : 'FAIL'}  ${k}`);
  if (!Object.values(checks).every(Boolean)) {
    log('GATE: RED');
    process.exit(1);
  }
  log('GATE: GREEN');
}

main().catch((err) => {
  log(`FATAL: ${err.stack ?? err}`);
  process.exit(1);
});
