/**
 * Voice-clone consent gate (Law L7) — unit tests for consent.ts.
 *
 * The gate blocks cloning unless a consent record has been persisted. Its
 * three functions take an injected transport/lookup, so they are testable
 * without a backend. A regression here would silently allow cloning
 * without consent, so every throw path is pinned.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  buildConsentRecord,
  submitConsent,
  assertConsent,
  CONSENT_STATEMENT,
  CONSENT_FORM_VERSION,
  type VoiceConsentRecord,
} from './consent';

describe('buildConsentRecord', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('copies the inputs and stamps statement, form version, and an ISO-8601 time', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-03T12:00:00.000Z'));

    const rec = buildConsentRecord({
      userId: 'auth0|user-1',
      voiceSampleId: 'sample-1',
      relationship: 'self',
      sampleSha256: 'abc123',
    });

    expect(rec.userId).toBe('auth0|user-1');
    expect(rec.voiceSampleId).toBe('sample-1');
    expect(rec.relationship).toBe('self');
    expect(rec.sampleSha256).toBe('abc123');
    expect(rec.statement).toBe(CONSENT_STATEMENT);
    expect(rec.formVersion).toBe(CONSENT_FORM_VERSION);
    expect(rec.consentedAt).toBe('2026-07-03T12:00:00.000Z');
  });
});

describe('submitConsent', () => {
  const base: VoiceConsentRecord = {
    userId: 'auth0|user-1',
    voiceSampleId: 'sample-1',
    statement: CONSENT_STATEMENT,
    consentedAt: '2026-07-03T12:00:00.000Z',
    relationship: 'self',
    formVersion: CONSENT_FORM_VERSION,
  };

  it('rejects on an empty userId and never calls the transport', async () => {
    const transport = vi.fn(async () => ({ id: 'rec-1' }));
    await expect(submitConsent({ ...base, userId: '' }, transport)).rejects.toThrow(
      'Consent requires an authenticated user.',
    );
    expect(transport).not.toHaveBeenCalled();
  });

  it('rejects on an empty voiceSampleId and never calls the transport', async () => {
    const transport = vi.fn(async () => ({ id: 'rec-1' }));
    await expect(submitConsent({ ...base, voiceSampleId: '' }, transport)).rejects.toThrow(
      'Consent requires a voice sample id.',
    );
    expect(transport).not.toHaveBeenCalled();
  });

  it('rejects when the transport returns an empty id', async () => {
    const transport = vi.fn(async () => ({ id: '' }));
    await expect(submitConsent(base, transport)).rejects.toThrow(
      'Consent was not persisted (no record id returned).',
    );
    expect(transport).toHaveBeenCalledWith(base);
  });

  it('resolves to the id the transport returns', async () => {
    const transport = vi.fn(async () => ({ id: 'rec-42' }));
    await expect(submitConsent(base, transport)).resolves.toBe('rec-42');
    expect(transport).toHaveBeenCalledWith(base);
  });
});

describe('assertConsent', () => {
  it('rejects with the sample id in the message when the lookup returns null', async () => {
    const lookup = vi.fn(async () => null);
    await expect(assertConsent('sample-9', lookup)).rejects.toThrow(/sample-9/);
    expect(lookup).toHaveBeenCalledWith('sample-9');
  });

  it('rejects with the sample id in the message when the record has no id', async () => {
    const lookup = vi.fn(async (): Promise<VoiceConsentRecord> => ({
      userId: 'auth0|user-1',
      voiceSampleId: 'sample-9',
      statement: CONSENT_STATEMENT,
      consentedAt: '2026-07-03T12:00:00.000Z',
      relationship: 'self',
      formVersion: CONSENT_FORM_VERSION,
    }));
    await expect(assertConsent('sample-9', lookup)).rejects.toThrow(/sample-9/);
  });

  it('resolves to the record when it has an id', async () => {
    const record: VoiceConsentRecord = {
      id: 'rec-7',
      userId: 'auth0|user-1',
      voiceSampleId: 'sample-9',
      statement: CONSENT_STATEMENT,
      consentedAt: '2026-07-03T12:00:00.000Z',
      relationship: 'self',
      formVersion: CONSENT_FORM_VERSION,
    };
    const lookup = vi.fn(async () => record);
    await expect(assertConsent('sample-9', lookup)).resolves.toBe(record);
  });
});
