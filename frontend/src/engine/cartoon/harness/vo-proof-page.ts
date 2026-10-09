/**
 * Contentine Create — C-M1 proof (c): VO Match-Tone (page side).
 *
 * Exercises the SHIPPING voice path for real:
 *   1. synthesize a real Kokoro take for one reference-plan line (tts-manager)
 *   2. run the shipping deterministic Match-Tone DSP chain on that take
 *      (match-tone.ts — HP → spectral denoise → EQ → compression → shared room
 *       → EBU-R128 loudness normalise → peak-safe limiter)
 *   3. run it a SECOND time on the identical input → prove byte-identical output
 *      (Law L6 determinism for the audio path)
 *   4. encode before/after WAVs with the shipping encoder and upload them
 *
 * No reimplementation: matchTone + encodeWav are imported from the real engine.
 * Driven by run-vo-proof.mjs through window.__voproof.run().
 */

import { buildReferencePlan } from './reference-plan';
import { synthesizeTakes } from '../voice-takes';
import { matchTone, type MatchToneOptions } from '../../voice/match-tone';
import { encodeWav } from '../../voice/vo-replace';

function log(msg: string): void {
  console.log(`[vo-proof] ${msg}`);
}

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function upload(name: string, blob: Blob): Promise<void> {
  const res = await fetch(`/artifact/${name}`, { method: 'PUT', body: blob });
  if (!res.ok) throw new Error(`artifact upload failed for ${name}: ${res.status}`);
  log(`uploaded ${name} (${(blob.size / 1024).toFixed(1)} KB)`);
}

export interface VoProofEvidence {
  userAgent: string;
  takeId: string;
  text: string;
  voiceProfileRef: string;
  sampleRate: number;
  durationSec: number;
  rawTakePcmHash: string;
  matchTone: {
    options: MatchToneOptions;
    before: unknown;
    after: unknown;
    outputPcmHashRun1: string;
    outputPcmHashRun2: string;
    deterministic: boolean;
  };
}

async function run(): Promise<VoProofEvidence> {
  const plan = buildReferencePlan();

  log('synthesizing real Kokoro take for VO-replace input line...');
  const takes = await synthesizeTakes(plan, undefined, (done, total, text) => {
    log(`take ${done}/${total} ${text ? `"${text.slice(0, 32)}..."` : 'done'}`);
  });

  // Use the first dialogue line's real take as the VO-replace input.
  const first = Array.from(takes.values())[0];
  if (!first) throw new Error('no takes synthesized');
  log(`input take: id=${first.id} voice=${first.voiceProfileRef} ${first.durationSec.toFixed(2)}s @ ${first.sampleRate}Hz`);

  const rawBytes = new Uint8Array(first.pcm.buffer, first.pcm.byteOffset, first.pcm.byteLength);
  const rawTakePcmHash = await sha256Hex(rawBytes.slice().buffer);

  // vo-before.wav = the raw take, exactly as the VO-replace loop receives it.
  const beforeWav = encodeWav(first.pcm, first.sampleRate);
  await upload('vo-before.wav', beforeWav);
  await upload('vo-raw-take.wav', beforeWav);

  const options: MatchToneOptions = {
    sampleRate: first.sampleRate,
    targetLufs: -16,
    room: 'booth',
  };

  log('Match-Tone run #1...');
  const r1 = matchTone(first.pcm, options);
  log('Match-Tone run #2 (identical input → determinism check)...');
  const r2 = matchTone(first.pcm, options);

  const h1 = await sha256Hex(new Uint8Array(r1.audio.buffer, r1.audio.byteOffset, r1.audio.byteLength).slice().buffer);
  const h2 = await sha256Hex(new Uint8Array(r2.audio.buffer, r2.audio.byteOffset, r2.audio.byteLength).slice().buffer);
  const deterministic = h1 === h2;
  log(`before LUFS=${r1.before.integratedLufs.toFixed(2)} after LUFS=${r1.after.integratedLufs.toFixed(2)} deterministic=${deterministic}`);

  // vo-after.wav = the tone-matched take.
  const afterWav = encodeWav(r1.audio, first.sampleRate);
  await upload('vo-after.wav', afterWav);

  return {
    userAgent: navigator.userAgent,
    takeId: first.id,
    text: first.text,
    voiceProfileRef: first.voiceProfileRef,
    sampleRate: first.sampleRate,
    durationSec: first.durationSec,
    rawTakePcmHash,
    matchTone: {
      options,
      before: r1.before,
      after: r1.after,
      outputPcmHashRun1: h1,
      outputPcmHashRun2: h2,
      deterministic,
    },
  };
}

declare global {
  interface Window {
    __voproof: { run: () => Promise<VoProofEvidence> };
  }
}

window.__voproof = { run };
log('vo-proof ready');
