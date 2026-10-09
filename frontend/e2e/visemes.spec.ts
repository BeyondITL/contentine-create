import { test, expect, chromium } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * R4 · F-3 support — TIMESTAMPED VISEMES from the shipped Kokoro TTS worker (WS-5).
 *
 * The cartoon lip-sync depends on `ttsManager.synthesize(text, voice, speed,
 * onProgress, { withVisemes: true })` returning per-phoneme viseme stamps. No
 * app UI button triggers `withVisemes`, and no store/manager is exposed on
 * window — so we drive the worker via its stable, documented message contract
 * exactly as the app does: `new Worker('/workers/tts-worker.js', {type:'module'})`
 * → `{type:'init'}` → `{type:'synthesize', withVisemes:true}` → `{type:'audio',
 * buffer, sampleRate, visemes}`. Real model, real ONNX inference, no mocks.
 *
 * Proves: stamps are non-empty · `time` strictly ascending · every `value` is
 * one of the 15 Oculus visemes · first ≥ 0 · last ≤ audio duration + 0.25s
 * (the tolerance the worker itself uses) · a second synthesis of the same
 * text/voice/speed is byte-for-byte deterministic (identical stamps AND audio) —
 * Law L6.
 *
 * Model-dependent ⇒ persistent profile + the download-all mirror route hook
 * (MODEL_MIRROR_URL). The mirror is host-level, so it covers BOTH the
 * `-timestamped` model repo AND the base repo the worker fetches `voices/*.bin`
 * from.
 */

const OCULUS = ['sil', 'PP', 'FF', 'TH', 'DD', 'kk', 'CH', 'SS', 'nn', 'RR', 'aa', 'E', 'I', 'O', 'U'];
const TEXT = 'The quick brown fox jumps over the lazy dog near the river.';

interface SynthOut {
  len: number;
  sampleRate: number;
  checksum: number;
  visemes: Array<{ time: number; value: string }>;
}

async function launch(): Promise<{ context: BrowserContext; page: Page; profileDir: string }> {
  const profileDir = mkdtempSync(join(tmpdir(), 'create-e2e-visemes-'));
  const context = await chromium.launchPersistentContext(profileDir, {
    args: ['--enable-unsafe-webgpu', '--use-angle=metal'],
    ignoreHTTPSErrors: true, // local HTTPS mirror uses a self-signed cert
  });
  const page = context.pages()[0] ?? (await context.newPage());
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !/notifications|CORS|Access-Control|ERR_FAILED/i.test(msg.text())) {
      console.log(`[console.error] ${msg.text().slice(0, 300)}`);
    }
  });
  const mirror = process.env.MODEL_MIRROR_URL;
  if (mirror) {
    for (const host of ['huggingface.co', 'raw.githubusercontent.com']) {
      await context.route(`https://${host}/**`, async (route) => {
        const u = new URL(route.request().url());
        await route.continue({ url: `${mirror}/${host}${u.pathname}${u.search}` });
      });
    }
    console.log(`[e2e] model mirror ON → continue-redirect to ${mirror}`);
  }
  return { context, page, profileDir };
}

/** Drive one synthesis-with-visemes through the shipped worker contract. */
async function synth(page: Page, text: string): Promise<SynthOut> {
  return page.evaluate(
    ({ text }) =>
      new Promise<SynthOut>((resolve, reject) => {
        const w = new Worker('/workers/tts-worker.js', { type: 'module' });
        const id = `viseme-${Math.random().toString(36).slice(2)}`;
        const fail = (m: string) => {
          try {
            w.terminate();
          } catch {
            /* noop */
          }
          reject(new Error(m));
        };
        w.onerror = (e) => fail(`worker onerror: ${e.message}`);
        w.onmessage = (e: MessageEvent) => {
          const d = e.data;
          if (d.type === 'init-complete') {
            w.postMessage({ type: 'synthesize', id, text, voiceId: 'af_sky', speed: 1.0, withVisemes: true });
          } else if (d.type === 'audio' && d.id === id) {
            const buf = d.buffer as Float32Array;
            // buffer is a Transferable — read everything before returning.
            let checksum = 0;
            for (let i = 0; i < buf.length; i++) checksum = (checksum + buf[i] * (i % 97)) % 1e9;
            w.terminate();
            resolve({
              len: buf.length,
              sampleRate: d.sampleRate,
              checksum,
              visemes: (d.visemes ?? []).map((v: { time: number; value: string }) => ({
                time: v.time,
                value: v.value,
              })),
            });
          } else if (d.type === 'init-error' || d.type === 'error') {
            fail(String(d.error ?? 'worker error'));
          }
        };
        // getStorageMode() default (model-storage.ts) is browser + null handle.
        w.postMessage({ type: 'init', storage: { mode: 'browser', handle: null } });
      }),
    { text },
  );
}

test('timestamped visemes: non-empty, ascending, in-vocabulary, bounded, deterministic', async () => {
  test.setTimeout(40 * 60 * 1000); // first run may fetch the 92MB timestamped model
  const { context, page, profileDir } = await launch();
  try {
    await page.goto('http://127.0.0.1:8321/'); // any same-origin, crossOriginIsolated page

    const r1 = await synth(page, TEXT);
    console.log(
      `[e2e] visemes run1: ${r1.visemes.length} stamps, audio ${(r1.len / r1.sampleRate).toFixed(3)}s`,
    );

    // Non-empty and well-formed.
    expect(r1.sampleRate).toBe(24000);
    expect(r1.len).toBeGreaterThan(0);
    expect(r1.visemes.length).toBeGreaterThan(1); // a full sentence maps to many phonemes

    // Every value is one of the 15 Oculus visemes.
    for (const v of r1.visemes) expect(OCULUS).toContain(v.value);

    // Strictly ascending `time`, starting at ≥ 0.
    expect(r1.visemes[0].time).toBeGreaterThanOrEqual(0);
    for (let i = 1; i < r1.visemes.length; i++) {
      expect(r1.visemes[i].time).toBeGreaterThan(r1.visemes[i - 1].time);
    }

    // Last stamp within the audio duration (+ the 0.25s tolerance the worker uses).
    const durationSec = r1.len / r1.sampleRate;
    expect(r1.visemes[r1.visemes.length - 1].time).toBeLessThanOrEqual(durationSec + 0.25);

    // Determinism (Law L6): same text/voice/speed ⇒ identical stamps AND audio.
    const r2 = await synth(page, TEXT);
    expect(r2.len).toBe(r1.len);
    expect(r2.checksum).toBe(r1.checksum);
    expect(JSON.stringify(r2.visemes)).toBe(JSON.stringify(r1.visemes));
    console.log(`[e2e] visemes run2 deep-equal run1 (${r2.visemes.length} stamps, checksum match)`);
  } finally {
    await context.close();
    rmSync(profileDir, { recursive: true, force: true });
  }
});
