/**
 * Contentine Create — command layer harness (Node driver)
 *
 * Real Chrome, real Kokoro, real WebCodecs, real IndexedDB, through the same
 * CartoonCommandService the editor uses. Session 1 runs the command flow and
 * starts a render that is killed by quitting the browser; session 2 relaunches
 * on the same profile and must report that run as `interrupted`, then render
 * again. Node re-verifies every MP4 with ffprobe and decoded-frame diffs and
 * writes artifacts/commands/commands-report.json.
 *
 * Run from repo root:  node frontend/src/engine/cartoon/harness/run-commands.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  REPO_ROOT, buildPage, serve, session, logger, freshProfile,
  ffprobe, decodedFrameMd5s, decodedAudioMd5, countDiff, sha256File,
} from './harness-runtime.mjs';

const log = logger('cmd-harness');
const ARTIFACTS = path.join(REPO_ROOT, 'artifacts', 'commands');

async function main() {
  fs.rmSync(ARTIFACTS, { recursive: true, force: true });
  fs.mkdirSync(ARTIFACTS, { recursive: true });
  const buildDir = await buildPage('commands-page');
  const { server, port } = await serve(buildDir, ARTIFACTS);
  const profileDir = freshProfile('cmd');
  const opts = (label) => ({ profileDir, port, label, readyGlobal: '__cmd', consolePrefix: '[cmd]', log });
  const t0 = Date.now();
  let flow, orphan, recovery;
  try {
    ({ flow, orphan } = await session(opts('session1'), async (page) => ({
      flow: await page.evaluate(() => window.__cmd.flow()),
      orphan: await page.evaluate(() => window.__cmd.startOrphan()),
    })));
    log(`killed browser with run ${orphan.runId} ${orphan.stateWhenKilled} at ${orphan.progress}%`);
    recovery = await session(opts('session2'), (page) =>
      page.evaluate(([id, rev]) => window.__cmd.recover(id, rev), [orphan.runId, orphan.revision]),
    );
  } finally {
    server.close();
  }

  const files = ['cmd-1-full', 'cmd-2-move', 'cmd-3-asset', 'cmd-4-speed', 'cmd-5-after-restart'];
  const probes = {};
  const frames = {};
  const audio = {};
  const sha = {};
  for (const f of files) {
    const file = path.join(ARTIFACTS, `${f}.mp4`);
    probes[f] = ffprobe(file);
    fs.writeFileSync(path.join(ARTIFACTS, `ffprobe-${f}.txt`), probes[f]);
    frames[f] = decodedFrameMd5s(file);
    audio[f] = decodedAudioMd5(file);
    sha[f] = sha256File(file);
  }
  const perScene = (a, b) =>
    Object.fromEntries(flow.sceneWindows.map((w) => [w.sceneId, countDiff(frames[a], frames[b], w.startFrame, w.startFrame + w.frameCount)]));
  const s = flow.steps;
  const deltas = {
    moveVsFull: perScene('cmd-1-full', 'cmd-2-move'),
    assetVsMove: perScene('cmd-2-move', 'cmd-3-asset'),
  };
  const artifactShaMatches = files.slice(0, 4).every((f, i) => {
    const step = [s.render1, s.render2, s.render3AssetSwap, s.render4][i];
    return step.artifact.sha256 === sha[f];
  });

  const checks = {
    renderRefusedWithoutTakes: s.renderWithoutTakes === 'TAKES_MISSING',
    voicedAllLines: s.voiceAll.synthesized.length === 6,
    firstRenderSucceeded: s.render1.state === 'succeeded' && s.render1.events.join() === 'queued,running,succeeded',
    proposalPredictsSceneTwoOnly: s.proposal.changedScenes.join() === 'scene-duo' && s.proposal.linesNeedingVoice.length === 0,
    applyIdempotent: s.apply.replayed && s.apply.sameOutcome,
    moveRenderPartialSceneTwo: s.render2.partial.mode === 'partial' && s.render2.partial.rerenderedScenes.join() === 'scene-duo',
    moveDecodedDeltaConfined: deltas.moveVsFull['scene-intro'] === 0 && deltas.moveVsFull['scene-outro'] === 0 && deltas.moveVsFull['scene-duo'] > 0,
    narrationUnchangedByVisualEdits: audio['cmd-1-full'] === audio['cmd-2-move'] && audio['cmd-2-move'] === audio['cmd-3-asset'],
    assetSwapRerendersIntro: s.render3AssetSwap.partial.mode === 'partial' &&
      s.render3AssetSwap.partial.rerenderedScenes.includes('scene-intro') &&
      s.render3AssetSwap.partial.rerenderedScenes.includes('scene-outro') &&
      !s.render3AssetSwap.partial.rerenderedScenes.includes('scene-duo'),
    assetSwapDecodedDelta: deltas.assetVsMove['scene-intro'] > 0 && deltas.assetVsMove['scene-duo'] === 0,
    speedChangeResynthesizesOneTake: s.voiceSpeedChange.staleBefore.join() === 'outro-1:stale' && s.voiceSpeedChange.synthesized.length === 1,
    conflictOnStaleRevision: s.conflict.code === 'REVISION_CONFLICT',
    cancelIdempotent: s.cancel.first.state === 'cancelled' && s.cancel.second.alreadyTerminal === true && s.cancel.finalState === 'cancelled',
    cancelledRunHasNoArtifact: s.cancel.artifactAfterCancel === 'RUN_NOT_SUCCEEDED',
    previousOutputKept: s.cancel.previousArtifactStillValid,
    scopeEnforced: s.scope.inspect === 'FORBIDDEN' && s.scope.runInspect === 'FORBIDDEN' && s.scope.unknownCommand === 'INVALID_ARGUMENT',
    orphanInterruptedAfterRestart: recovery.orphan.state === 'interrupted' && recovery.interrupted.includes(orphan.runId),
    renderAfterRestartSucceeds: recovery.rerender.state === 'succeeded',
    artifactsMatchStoredHashes: artifactShaMatches,
    allMp4sHaveVideoAndAudio: files.every((f) => /codec_type=video/.test(probes[f]) && /codec_type=audio/.test(probes[f])),
  };

  const report = {
    generatedBy: 'run-commands.mjs',
    wallClockSec: Math.round((Date.now() - t0) / 1000),
    userAgent: flow.userAgent,
    sceneWindows: flow.sceneWindows,
    steps: flow.steps,
    orphan,
    recovery,
    decodedFrameDeltas: deltas,
    decodedAudioMd5: audio,
    mp4Sha256: sha,
    checks,
  };
  fs.writeFileSync(path.join(ARTIFACTS, 'commands-report.json'), JSON.stringify(report, null, 2));
  log('──────────── command layer gate ────────────');
  for (const [k, v] of Object.entries(checks)) log(`${v ? 'PASS' : 'FAIL'}  ${k}`);
  log(`artifacts: ${ARTIFACTS}`);
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
