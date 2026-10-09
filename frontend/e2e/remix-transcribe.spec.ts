import { test, expect, chromium } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * R4 · F-9 model lane — Remix Audio input behind the on-device Whisper gate (WS-8).
 *
 * The Audio/Video tabs wrap their dropzone in `ModelRequirements feature="captions"`
 * (→ whisper-tiny). Until the model is ready the dropzone is absent and a
 * download banner shows; once ready, a real upload is transcribed on-device by
 * the shipped `whisperEngine` and becomes a source card badged with its real
 * type ("audio") plus a word count.
 *
 * To prove the SUCCESS path honestly (not a tone that Whisper would reject as
 * silence), we first synthesize real speech through the shipped Kokoro TTS
 * worker, wrap it as a WAV, and feed THAT to the Whisper path — real model in,
 * real model out, no fabricated transcript.
 *
 * Persistent profile + the download-all mirror route hook (MODEL_MIRROR_URL).
 */

async function launch(): Promise<{ context: BrowserContext; page: Page; profileDir: string }> {
  const profileDir = mkdtempSync(join(tmpdir(), 'create-e2e-remix-tr-'));
  const context = await chromium.launchPersistentContext(profileDir, {
    args: ['--enable-unsafe-webgpu', '--use-angle=metal'],
    ignoreHTTPSErrors: true,
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

/** Synthesize real speech via the shipped Kokoro worker; return 24 kHz PCM. */
async function synthSpeech(page: Page, text: string): Promise<{ pcm: number[]; sampleRate: number }> {
  return page.evaluate(
    ({ text }) =>
      new Promise<{ pcm: number[]; sampleRate: number }>((resolve, reject) => {
        const w = new Worker('/workers/tts-worker.js', { type: 'module' });
        const id = 'remix-speech';
        w.onerror = (e) => reject(new Error(`worker onerror: ${e.message}`));
        w.onmessage = (e: MessageEvent) => {
          const d = e.data;
          if (d.type === 'init-complete') {
            w.postMessage({ type: 'synthesize', id, text, voiceId: 'af_sky', speed: 1.0, withVisemes: true });
          } else if (d.type === 'audio' && d.id === id) {
            const buf = d.buffer as Float32Array;
            const pcm = Array.from(buf);
            w.terminate();
            resolve({ pcm, sampleRate: d.sampleRate });
          } else if (d.type === 'init-error' || d.type === 'error') {
            reject(new Error(String(d.error ?? 'worker error')));
          }
        };
        w.postMessage({ type: 'init', storage: { mode: 'browser', handle: null } });
      }),
    { text },
  );
}

/** Mono 16-bit PCM WAV from float samples. */
function pcmToWav(pcm: number[], rate: number): Buffer {
  const n = pcm.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    buf.writeInt16LE(Math.round(s * 0x7fff), 44 + i * 2);
  }
  return buf;
}

test('Audio tab: Whisper gate → real on-device transcription → "audio" source card', async () => {
  test.setTimeout(50 * 60 * 1000); // may fetch Kokoro (92MB) + whisper-tiny on first miss
  const { context, page, profileDir } = await launch();
  try {
    // 1) Make genuine speech with the shipped TTS engine.
    await page.goto('http://127.0.0.1:8321/');
    const { pcm, sampleRate } = await synthSpeech(
      page,
      'Testing the remix transcription pipeline with one two three four five.',
    );
    expect(pcm.length).toBeGreaterThan(sampleRate); // ≥ ~1s of audio
    const wav = pcmToWav(pcm, sampleRate);

    // 2) Remix Audio tab — the dropzone is gated behind the captions model.
    await page.goto('http://127.0.0.1:8321/remix/');
    await page.getByRole('button', { name: 'Audio' }).click();
    await expect(page.getByText('Download the transcription model')).toBeVisible({ timeout: 30_000 });

    // 3) Download the whisper model via the banner CTA, then the dropzone appears.
    // Scope to the captions gate card specifically — the remix page ALSO renders a
    // page-level feature="remix" (Llama) gate whose own "Download" button would
    // otherwise be matched first and pull the wrong (generation) model.
    const captionsGate = page.locator('.bento-card').filter({ hasText: 'Download the transcription model' });
    await captionsGate.getByRole('button', { name: /Download/ }).click();
    await expect(page.getByText('Upload an audio file to transcribe')).toBeVisible({ timeout: 20 * 60 * 1000 });

    // 4) Feed the real speech WAV → on-device Whisper → a real "audio" card.
    await page.locator('input[accept*="audio"]').setInputFiles({
      name: 'speech.wav',
      mimeType: 'audio/wav',
      buffer: wav,
    });

    await expect(page.getByText('Sources (1/10)')).toBeVisible({ timeout: 15 * 60 * 1000 });
    await expect(page.getByText('audio', { exact: true })).toBeVisible(); // real source.type badge
    const words = await page.getByText(/\d+ words/).first().innerText();
    console.log(`[e2e] remix transcription card: "${words}"`);
    expect(Number(words.match(/(\d+) words/)?.[1] ?? 0)).toBeGreaterThan(0);
  } finally {
    await context.close();
    rmSync(profileDir, { recursive: true, force: true });
  }
});
