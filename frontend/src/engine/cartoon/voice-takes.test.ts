import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ScenePlan } from './scene-plan';
import type { VoiceTake } from './voice-takes';

// Contract test: the TTS engine is substituted so we can count which lines get
// (re)synthesized. It does not exercise Kokoro itself.
const synthesize = vi.fn(async (text: string, voiceId: string, speed: number) => ({
  buffer: new Float32Array(2400).fill(text.length / 100 + speed),
  sampleRate: 24000,
  voiceId,
}));
vi.mock('../tts-manager', () => ({ ttsManager: { synthesize } }));

const { synthesizeTakes, takeMatchesLine } = await import('./voice-takes');

function planWith(lines: Array<{ id: string; text: string; voiceProfileRef: string; takeRef?: string }>): ScenePlan {
  return {
    scenes: [{ id: 's1', dialogue: lines.map((l) => ({ ...l, speaker: 'a' })) }],
  } as unknown as ScenePlan;
}

function take(id: string, text: string, voiceProfileRef: string): VoiceTake {
  return {
    id, dialogueId: id, text, voiceProfileRef, sampleRate: 24000,
    pcm: new Float32Array(1), durationSec: 0.1, visemes: [], pcmHash: `old-${id}`,
  };
}

describe('takeMatchesLine', () => {
  const line = { text: 'Hello', voiceProfileRef: 'kokoro:af_sky@1.0' };
  it('matches only identical text and voice profile', () => {
    expect(takeMatchesLine({ text: 'Hello', voiceProfileRef: 'kokoro:af_sky@1.0' }, line)).toBe(true);
  });
  it('rejects a missing take', () => {
    expect(takeMatchesLine(undefined, line)).toBe(false);
  });
  it('rejects a text change', () => {
    expect(takeMatchesLine({ text: 'Hello!', voiceProfileRef: 'kokoro:af_sky@1.0' }, line)).toBe(false);
  });
  it('rejects a voice change with unchanged text', () => {
    expect(takeMatchesLine({ text: 'Hello', voiceProfileRef: 'kokoro:am_adam@1.0' }, line)).toBe(false);
  });
  it('rejects a speed change with unchanged text', () => {
    expect(takeMatchesLine({ text: 'Hello', voiceProfileRef: 'kokoro:af_sky@1.2' }, line)).toBe(false);
  });
});

describe('synthesizeTakes take reuse', () => {
  beforeEach(() => {
    synthesize.mockClear();
  });

  it('re-voices a line whose voice changed and keeps matching takes untouched', async () => {
    const plan = planWith([
      { id: 'l1', text: 'Same line', voiceProfileRef: 'kokoro:am_adam@1.0' }, // voice changed
      { id: 'l2', text: 'Untouched', voiceProfileRef: 'kokoro:af_sky@1.0' },
    ]);
    const existing = new Map([
      ['l1', take('l1', 'Same line', 'kokoro:af_sky@1.0')],
      ['l2', take('l2', 'Untouched', 'kokoro:af_sky@1.0')],
    ]);

    const out = await synthesizeTakes(plan, existing);

    expect(synthesize).toHaveBeenCalledTimes(1);
    expect(synthesize).toHaveBeenCalledWith('Same line', 'am_adam', 1, undefined, { withVisemes: true });
    expect(out.get('l1')!.voiceProfileRef).toBe('kokoro:am_adam@1.0');
    expect(out.get('l1')!.pcmHash).not.toBe('old-l1');
    expect(out.get('l2')!.pcmHash).toBe('old-l2');
  });

  it('re-voices a line whose speed changed', async () => {
    const plan = planWith([{ id: 'l1', text: 'Same line', voiceProfileRef: 'kokoro:af_sky@1.25' }]);
    const existing = new Map([['l1', take('l1', 'Same line', 'kokoro:af_sky@1.0')]]);

    const out = await synthesizeTakes(plan, existing);

    expect(synthesize).toHaveBeenCalledWith('Same line', 'af_sky', 1.25, undefined, { withVisemes: true });
    expect(out.get('l1')!.voiceProfileRef).toBe('kokoro:af_sky@1.25');
  });

  it('does not call TTS when every take matches', async () => {
    const plan = planWith([{ id: 'l1', text: 'Same line', voiceProfileRef: 'kokoro:af_sky@1.0' }]);
    const existing = new Map([['l1', take('l1', 'Same line', 'kokoro:af_sky@1.0')]]);

    const out = await synthesizeTakes(plan, existing);

    expect(synthesize).not.toHaveBeenCalled();
    expect(out.get('l1')!.pcmHash).toBe('old-l1');
  });
});
