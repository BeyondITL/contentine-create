'use client';

/**
 * Contentine Create — Voice-clone consent gate (Law L7)  [WS-5 interface contract]
 *
 * US right-of-publicity / ELVIS-Act-class shield: a voice may only be cloned
 * after the user records affirmative, informed consent that the sample is theirs
 * (or that they hold rights to it) and may be used to synthesise new speech. The
 * consent is a DB record, enforced client- AND server-side.
 *
 * Scope of THIS file (C-M1): the interface contract + client-side enforcement.
 * The persistence endpoint + server-side re-check land in C-M2 (backend/**,
 * owned by the lead). The record shape and transport contract below are the
 * hand-off; the backend implements `POST /api/voice/consent` to match it.
 *
 * Nothing here fakes success: without a persisted record id, `assertConsent`
 * throws and cloning cannot proceed (Law L1 — no facade, no silent bypass).
 */

/** The exact fields the consent DB row must carry. Backend mirrors this. */
export interface VoiceConsentRecord {
  /** Server-assigned id (present once persisted). */
  id?: string;
  /** Auth0 subject of the consenting user. */
  userId: string;
  /** Stable id of the voice sample this consent covers. */
  voiceSampleId: string;
  /** Verbatim consent statement the user affirmed (stored for evidence). */
  statement: string;
  /** ISO-8601 timestamp the checkbox was affirmed, client clock. */
  consentedAt: string;
  /** Relationship asserted: the user's own voice, or licensed third-party. */
  relationship: 'self' | 'authorized-third-party';
  /** App/consent-form version, so we can prove which terms were shown. */
  formVersion: string;
  /** Best-effort audit context (not PII beyond what auth already holds). */
  userAgent?: string;
  /** Optional hash of the reference clip, ties consent to a specific sample. */
  sampleSha256?: string;
}

/** The canonical consent statement (versioned — bump on any wording change). */
export const CONSENT_FORM_VERSION = '2026-07-03.1';
export const CONSENT_STATEMENT =
  'I confirm this voice is my own, or that I have the explicit rights and ' +
  'permission to use it, and I consent to Contentine using this recording to ' +
  'create a synthetic voice that can generate new speech. I understand I can ' +
  'revoke this consent and delete the voice at any time.';

/** Transport the client uses to persist consent. Injected so C-M1 has no backend dep. */
export type ConsentTransport = (record: VoiceConsentRecord) => Promise<{ id: string }>;

/** Build a record from a form affirmation. Does not persist. */
export function buildConsentRecord(params: {
  userId: string;
  voiceSampleId: string;
  relationship: VoiceConsentRecord['relationship'];
  sampleSha256?: string;
}): VoiceConsentRecord {
  return {
    userId: params.userId,
    voiceSampleId: params.voiceSampleId,
    relationship: params.relationship,
    statement: CONSENT_STATEMENT,
    consentedAt: new Date().toISOString(),
    formVersion: CONSENT_FORM_VERSION,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
    sampleSha256: params.sampleSha256,
  };
}

/**
 * Persist a consent record via the supplied transport and return the DB id.
 * The transport is the seam the C-M2 backend fills (`POST /api/voice/consent`).
 */
export async function submitConsent(record: VoiceConsentRecord, transport: ConsentTransport): Promise<string> {
  if (!record.userId) throw new Error('Consent requires an authenticated user.');
  if (!record.voiceSampleId) throw new Error('Consent requires a voice sample id.');
  const { id } = await transport(record);
  if (!id) throw new Error('Consent was not persisted (no record id returned).');
  return id;
}

/**
 * Hard gate: throws unless a persisted consent record covers this sample.
 * Call this immediately before any voice-clone synthesis. `lookup` is the
 * server-backed check (C-M2); until then a caller may pass an in-memory set of
 * ids obtained from `submitConsent` in the same session.
 */
export async function assertConsent(
  voiceSampleId: string,
  lookup: (voiceSampleId: string) => Promise<VoiceConsentRecord | null>,
): Promise<VoiceConsentRecord> {
  const rec = await lookup(voiceSampleId);
  if (!rec || !rec.id) {
    throw new Error(
      `Voice-clone blocked: no recorded consent for sample "${voiceSampleId}" (Law L7).`,
    );
  }
  return rec;
}
