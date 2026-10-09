import { test, expect, chromium } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

/**
 * R3 · F-8 + F-11 — Audio-to-Video, the honest pipeline.
 *
 * Two legs, split so each reports its own honest verdict:
 *   F-8  — upload a real WAV → on-device Whisper transcription meets the
 *          subtitle/scene renderer (transcript + scenes appear). Real Whisper
 *          model, no mocks. Provable on this hardware.
 *   F-11 — the transcript renders to a REAL MP4 with the ORIGINAL audio muxed
 *          back in (WebCodecs + Mediabunny, Law L6), inspected with ffprobe.
 *
 * F-11 requires the browser to WebCodecs-encode the pipeline's H.264 config.
 * The engine's capability gate (webcodecs-encoder.supportsWebCodecs) probes a
 * FIXED `avc1.42001f` (H.264 Baseline **Level 3.1**, whose max frame size is
 * ~1280×720) at **1080×1920**. That is an over-level config, and strict
 * platforms (macOS Chrome/Safari) correctly report it unsupported — so on this
 * hardware NO local browser can run the export leg. Rather than fake it, F-11
 * honest-SKIPS with that diagnosis when the platform can't encode the config
 * (same convention as sd-turbo-smoke's shader-f16 skip). See reports/R3-e2e.md
 * "gated items" + the escalation to WS-2 on the codec-level defect.
 *
 * Model-dependent ⇒ persistent profile + optional local-mirror lane
 * (MODEL_MIRROR_URL), mirroring download-all.spec.ts.
 */

const SOURCE_SECONDS = 4;

/** Mono 16-bit PCM WAV: `seconds` of a `freq`Hz sine at `rate`Hz. */
function makeWav(seconds = SOURCE_SECONDS, freq = 220, rate = 16_000): Buffer {
  const n = Math.floor(seconds * rate);
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const s = Math.sin(2 * Math.PI * freq * (i / rate)) * 0.3;
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s)) * 0x7fff), 44 + i * 2);
  }
  return buf;
}

/** Persistent context + the download-all mirror route hook. */
async function launch(): Promise<{ context: BrowserContext; page: Page; profileDir: string }> {
  const profileDir = mkdtempSync(join(tmpdir(), 'create-e2e-fromaudio-'));
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

async function uploadTone(page: Page) {
  await page.goto('http://127.0.0.1:8321/video/from-audio/');
  await expect(page.getByRole('heading', { name: 'Audio to Video' })).toBeVisible({ timeout: 30_000 });
  await page.locator('#audio-upload').setInputFiles({ name: 'tone.wav', mimeType: 'audio/wav', buffer: makeWav() });
  await expect(page.getByText('tone.wav')).toBeVisible();
}

test('F-8: uploaded audio is transcribed on-device and rendered into scenes', async () => {
  const { context, page, profileDir } = await launch();
  try {
    await uploadTone(page);
    await page.getByRole('button', { name: 'Create Video' }).click();

    // Whisper downloads (mirror/CDN) + transcribes on-device, then the transcript
    // is parsed into scenes and shown — this is the F-8 join (transcription →
    // subtitle/scene renderer). A tone clip yields little/no text; the pipeline
    // still produces ≥1 honest scene. We do NOT assert fabricated words.
    await expect(page.getByText(/Transcript ·/)).toBeVisible({ timeout: 15 * 60 * 1000 });
    const sceneHeader = await page.getByText(/Transcript · \d+ scene/).innerText();
    console.log(`[e2e] F-8 transcript panel: "${sceneHeader}"`);
    expect(sceneHeader).toMatch(/Transcript · [1-9]\d* scene/);
  } finally {
    await context.close();
    rmSync(profileDir, { recursive: true, force: true });
  }
});

test('F-11: transcript renders to a real MP4 carrying the original audio track', async () => {
  const { context, page, profileDir } = await launch();
  try {
    await page.goto('http://127.0.0.1:8321/video/from-audio/');
    // Probe the EXACT config the engine's export gate now uses (post-fix): the
    // resolution-appropriate codec from webcodecs-encoder.h264CodecFor — for
    // 1080×1920 that is avc1.420028 (H.264 Level 4.0), NOT the old over-level
    // avc1.42001f (L3.1). If a platform genuinely can't encode even the correct
    // codec, the honest pipeline refuses to export and we skip with a diagnosis
    // rather than fake an MP4.
    const canEncode = await page.evaluate(async () => {
      if (!('VideoEncoder' in globalThis)) return false;
      const codecFor = (w: number, h: number) => (w * h > 1280 * 720 ? 'avc1.420028' : 'avc1.42001f');
      try {
        const s = await (globalThis as unknown as {
          VideoEncoder: { isConfigSupported(c: unknown): Promise<{ supported?: boolean }> };
        }).VideoEncoder.isConfigSupported({
          codec: codecFor(1080, 1920), width: 1080, height: 1920, bitrate: 4_000_000, framerate: 30,
        });
        return s.supported === true;
      } catch {
        return false;
      }
    });
    test.skip(
      !canEncode,
      'WebCodecs cannot encode even the resolution-appropriate export config ' +
        '(avc1.420028 @1080×1920); real-MP4 export unprovable on this platform.',
    );

    await uploadTone(page);
    await page.getByRole('button', { name: 'Create Video' }).click();

    const video = page.locator('video').last();
    await expect(video).toBeVisible({ timeout: 30 * 60 * 1000 });
    await expect(page.getByRole('button', { name: 'Download MP4' })).toBeVisible();

    const b64 = await video.evaluate(async (el: HTMLVideoElement) => {
      const res = await fetch(el.src);
      const bytes = new Uint8Array(await res.arrayBuffer());
      let s = '';
      for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
      return btoa(s);
    });
    const mp4 = Buffer.from(b64, 'base64');
    expect(mp4.length).toBeGreaterThan(20_000);

    const mp4Path = join(profileDir, 'from-audio.mp4');
    writeFileSync(mp4Path, mp4);
    const probe = JSON.parse(
      execFileSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', mp4Path], {
        encoding: 'utf8',
      }),
    ) as { streams: Array<{ codec_type: string; duration?: string }>; format: { duration?: string } };
    const videoStreams = probe.streams.filter((s) => s.codec_type === 'video');
    const audioStreams = probe.streams.filter((s) => s.codec_type === 'audio');
    console.log(
      `[e2e] ffprobe: ${videoStreams.length} video + ${audioStreams.length} audio; ` +
        `container ${probe.format.duration}s, audio ${audioStreams[0]?.duration}s`,
    );
    expect(videoStreams.length).toBe(1);
    expect(audioStreams.length).toBe(1); // the ORIGINAL audio was muxed back (F-11)
    expect(Number(probe.format.duration)).toBeGreaterThan(SOURCE_SECONDS - 1.5);
    expect(Number(audioStreams[0]?.duration ?? probe.format.duration)).toBeGreaterThan(SOURCE_SECONDS - 1.5);
  } finally {
    await context.close();
    rmSync(profileDir, { recursive: true, force: true });
  }
});
