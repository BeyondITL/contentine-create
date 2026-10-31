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

import fs from 'node:fs';
import path from 'node:path';
import {
  REPO_ROOT, buildPage, serve, session as launch, logger, freshProfile,
  ffprobe, decodedFrameMd5s, decodedAudioMd5, sha256File, structural, countDiff as diffCount,
} from './harness-runtime.mjs';

const ARTIFACTS = path.join(REPO_ROOT, 'artifacts', 'persistence');
const log = logger('persist-harness');

function session(profileDir, port, label, fn) {
  return launch({ profileDir, port, label, readyGlobal: '__persist', consolePrefix: '[persist]', log }, fn);
}

async function main() {
  fs.rmSync(ARTIFACTS, { recursive: true, force: true });
  fs.mkdirSync(ARTIFACTS, { recursive: true });
  const buildDir = await buildPage('persistence-page');
  const { server, port } = await serve(buildDir, ARTIFACTS);
  const profileDir = freshProfile('persist'); // fresh, empty IndexedDB
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
