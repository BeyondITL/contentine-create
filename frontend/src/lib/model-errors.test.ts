/**
 * Unit tests for the model-error taxonomy (model-errors.ts).
 *
 * Regression being pinned (#26): GPU_RE used to contain a bare `oom`, so any
 * message containing "bloom", "zoom" or "room" was classified as a GPU error.
 * Because GPU is checked before network, a plain fetch failure on a URL like
 * `…/model_bloom.onnx` told the user to close GPU-heavy tabs. The classifier
 * decides which recovery message a user sees, so every branch is pinned here:
 * quota (name, code 22, message), genuine GPU signals, network signals,
 * unknown fallthrough, formatGB, and every describeModelError branch.
 */
import { describe, it, expect } from 'vitest';
import {
  classifyModelError,
  describeModelError,
  formatGB,
  type StorageSnapshot,
} from './model-errors';

describe('classifyModelError — storage-quota wins first', () => {
  it('classifies a QuotaExceededError DOMException-like by name', () => {
    expect(classifyModelError({ name: 'QuotaExceededError' })).toBe('storage-quota');
  });

  it('classifies a bare {code: 22} as storage-quota', () => {
    expect(classifyModelError({ code: 22 })).toBe('storage-quota');
  });

  it('classifies quota wording in the message as storage-quota', () => {
    expect(classifyModelError(new Error('Insufficient storage for this operation'))).toBe(
      'storage-quota',
    );
    expect(classifyModelError(new Error('Failed to write: no space left on device'))).toBe(
      'storage-quota',
    );
  });

  it('keeps quota ahead of a GPU-looking message', () => {
    const err = new Error('QuotaExceededError while allocating GPU buffer');
    err.name = 'QuotaExceededError';
    expect(classifyModelError(err)).toBe('storage-quota');
  });
});

describe('classifyModelError — gpu', () => {
  it('classifies "device lost" as gpu', () => {
    expect(classifyModelError(new Error('WebGPU device lost'))).toBe('gpu');
  });

  it('classifies "shader-f16" as gpu', () => {
    expect(classifyModelError(new Error('shader-f16 not supported by this adapter'))).toBe('gpu');
  });

  it('still classifies a genuine out-of-memory message as gpu', () => {
    expect(classifyModelError(new Error('GPU out of memory while allocating tensor'))).toBe('gpu');
  });

  it('still classifies a standalone "oom" token as gpu', () => {
    expect(classifyModelError(new Error('onnxruntime: OOM when allocating tensor'))).toBe('gpu');
  });
});

describe('classifyModelError — the `oom` false positive (#26)', () => {
  it('does not classify a fetch failure for a "bloom" model URL as gpu', () => {
    expect(
      classifyModelError(new Error('Failed to fetch https://cdn.example/models/model_bloom.onnx')),
    ).toBe('network');
  });

  it('does not classify a fetch failure for a "zoom" model URL as gpu', () => {
    expect(
      classifyModelError(new Error('Failed to fetch https://cdn.example/models/zoom_v2.onnx')),
    ).toBe('network');
  });

  it('does not classify a message merely containing "room" as gpu', () => {
    expect(classifyModelError(new Error('Failed to fetch the room tone sample pack'))).toBe(
      'network',
    );
  });
});

describe('classifyModelError — network and unknown', () => {
  it('classifies "Failed to fetch" as network', () => {
    expect(classifyModelError(new Error('Failed to fetch'))).toBe('network');
  });

  it('classifies an HTTP 503 message as network', () => {
    expect(classifyModelError(new Error('HTTP 503 from model CDN'))).toBe('network');
  });

  it('classifies an unrecognized error as unknown', () => {
    expect(classifyModelError(new Error('something entirely different went wrong'))).toBe(
      'unknown',
    );
  });

  it('classifies a non-Error value as unknown', () => {
    expect(classifyModelError('a plain string failure')).toBe('unknown');
    expect(classifyModelError(null)).toBe('unknown');
  });
});

describe('formatGB', () => {
  it('formats 1.5 GiB as "1.5 GB"', () => {
    expect(formatGB(1.5 * 2 ** 30)).toBe('1.5 GB');
  });

  it('formats whole and zero values with one decimal', () => {
    expect(formatGB(2 * 2 ** 30)).toBe('2.0 GB');
    expect(formatGB(0)).toBe('0.0 GB');
  });
});

describe('describeModelError', () => {
  const snapshot: StorageSnapshot = {
    usageBytes: 1.5 * 2 ** 30,
    quotaBytes: 2 * 2 ** 30,
    freeBytes: 0.5 * 2 ** 30,
    persisted: false,
  };

  it('storage-quota without a snapshot omits the usage numbers', () => {
    const msg = describeModelError('storage-quota', 'Kokoro', 'quota');
    expect(msg).toContain('Not enough browser storage to download Kokoro.');
    expect(msg).not.toContain('This site is using');
  });

  it('storage-quota with a snapshot includes the real usage numbers', () => {
    const msg = describeModelError('storage-quota', 'Kokoro', 'quota', snapshot);
    expect(msg).toContain(
      'This site is using 1.5 GB of its 2.0 GB browser storage allowance (0.5 GB free).',
    );
  });

  it('gpu branch includes the raw message and the GPU remedy', () => {
    const msg = describeModelError('gpu', 'Kokoro', 'device lost');
    expect(msg).toContain('Kokoro could not load on your GPU: device lost');
    expect(msg).toContain('Close other GPU-heavy tabs');
  });

  it('network branch includes the raw message and the retry remedy', () => {
    const msg = describeModelError('network', 'Kokoro', 'Failed to fetch');
    expect(msg).toContain('Network problem while downloading Kokoro: Failed to fetch');
  });

  it('verify-fail branch points at repair', () => {
    const msg = describeModelError('verify-fail', 'Kokoro', 'checksum mismatch');
    expect(msg).toContain('did not match the expected checksums');
  });

  it('unknown branch is the plain failure message', () => {
    expect(describeModelError('unknown', 'Kokoro', 'boom')).toBe('Kokoro failed: boom');
  });
});
