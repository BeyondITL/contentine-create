/**
 * Render identity (cache keys) — acceptance A04 logic. A scene's encoded
 * chunks may be reused only when everything that affects its frames is
 * unchanged: scene JSON, the PCM of its voice takes (mouth shapes), its
 * background asset bytes, and the global render settings.
 */
import { describe, expect, it } from 'vitest';
import { buildReferencePlan } from './harness/reference-plan';
import { renderSettingsKey, sceneRenderKey } from './cartoon-renderer';
import { takeKeyForLine } from './timing';
import type { VoiceTake } from './voice-takes';
import type { ScenePlan } from './scene-plan';

function takesFor(plan: ScenePlan, salt = ''): Map<string, VoiceTake> {
  const m = new Map<string, VoiceTake>();
  for (const s of plan.scenes)
    for (const d of s.dialogue)
      m.set(takeKeyForLine(d), { pcmHash: `pcm-${d.id}${salt}`, durationSec: 1 } as unknown as VoiceTake);
  return m;
}

describe('render identity', () => {
  const plan = buildReferencePlan();
  const duoIndex = plan.scenes.findIndex((s) => s.id === 'scene-duo');
  const introIndex = plan.scenes.findIndex((s) => s.id === 'scene-intro');

  it('is stable for identical inputs', async () => {
    const k = await renderSettingsKey(plan, {});
    expect(await sceneRenderKey(plan, duoIndex, { takes: takesFor(plan) }, k)).toBe(await sceneRenderKey(plan, duoIndex, { takes: takesFor(plan) }, k));
  });

  it('a re-voiced take (same text and duration) changes only its scene', async () => {
    const k = await renderSettingsKey(plan, {});
    const base = takesFor(plan);
    const revoiced = new Map(base);
    const line = plan.scenes[duoIndex].dialogue[0];
    revoiced.set(takeKeyForLine(line), { ...base.get(takeKeyForLine(line))!, pcmHash: 'new-pcm' });
    expect(await sceneRenderKey(plan, duoIndex, { takes: revoiced }, k)).not.toBe(await sceneRenderKey(plan, duoIndex, { takes: base }, k));
    expect(await sceneRenderKey(plan, introIndex, { takes: revoiced }, k)).toBe(await sceneRenderKey(plan, introIndex, { takes: base }, k));
  });

  it('replacing background bytes under the same ref changes the key; unknown bytes force re-render', async () => {
    const withAsset = structuredClone(plan);
    withAsset.scenes[duoIndex].background.assetRef = 'asset:bg-duo';
    const k = await renderSettingsKey(withAsset, {});
    const takes = takesFor(withAsset);
    const a = await sceneRenderKey(withAsset, duoIndex, { takes, assetHashes: new Map([['asset:bg-duo', 'aaa']]) }, k);
    const b = await sceneRenderKey(withAsset, duoIndex, { takes, assetHashes: new Map([['asset:bg-duo', 'bbb']]) }, k);
    expect(a).not.toBe(b);
    expect(await sceneRenderKey(withAsset, duoIndex, { takes }, k)).toBeNull();
  });

  it('a missing take makes the identity unknown', async () => {
    const k = await renderSettingsKey(plan, {});
    expect(await sceneRenderKey(plan, duoIndex, { takes: new Map() }, k)).toBeNull();
  });

  it('global settings (bitrate, resolution, fps) change every scene key', async () => {
    const takes = takesFor(plan);
    const k1 = await renderSettingsKey(plan, {});
    const k2 = await renderSettingsKey(plan, { bitrate: 4_000_000 });
    const k3 = await renderSettingsKey({ ...plan, resolution: { width: 1280, height: 720 } }, {});
    const k4 = await renderSettingsKey({ ...plan, fps: 24 }, {});
    expect(new Set([k1, k2, k3, k4]).size).toBe(4);
    expect(await sceneRenderKey(plan, introIndex, { takes }, k1)).not.toBe(await sceneRenderKey(plan, introIndex, { takes }, k2));
  });
});
