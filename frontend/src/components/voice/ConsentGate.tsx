'use client';

/**
 * Contentine Create — Voice-clone consent gate UI (Law L7)  [WS-5]
 *
 * The recorded-consent checkbox flow that MUST be completed before any voice is
 * cloned. It builds a {@link VoiceConsentRecord}, persists it via the injected
 * transport (the C-M2 backend fills `POST /api/voice/consent`), and only then
 * calls `onConsent(recordId)`. No consent id ⇒ the caller cannot proceed.
 *
 * This is the client half of the interface contract in engine/voice/consent.ts.
 */

import { useState } from 'react';
import { ShieldCheck, Loader2, AlertTriangle } from 'lucide-react';
import {
  buildConsentRecord,
  submitConsent,
  CONSENT_STATEMENT,
  type ConsentTransport,
  type VoiceConsentRecord,
} from '@/engine/voice/consent';

interface ConsentGateProps {
  userId: string;
  voiceSampleId: string;
  /** Optional SHA-256 of the reference clip, ties consent to the exact sample. */
  sampleSha256?: string;
  /** Persists the record (backend seam). Returns the DB id. */
  transport: ConsentTransport;
  /** Called with the persisted consent record id once consent is recorded. */
  onConsent: (recordId: string, record: VoiceConsentRecord) => void;
  onCancel?: () => void;
}

/** Blocking consent step rendered before voice cloning is allowed. */
export default function ConsentGate({
  userId,
  voiceSampleId,
  sampleSha256,
  transport,
  onConsent,
  onCancel,
}: ConsentGateProps) {
  const [checked, setChecked] = useState(false);
  const [relationship, setRelationship] = useState<VoiceConsentRecord['relationship']>('self');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAgree = async () => {
    if (!checked || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const record = buildConsentRecord({ userId, voiceSampleId, relationship, sampleSha256 });
      const id = await submitConsent(record, transport);
      onConsent(id, { ...record, id });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record consent. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-[#1e1e1e] rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl">
        <div className="flex flex-col items-center text-center mb-4">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <ShieldCheck className="w-6 h-6 text-primary" />
          </div>
          <h3 className="text-lg font-semibold text-text dark:text-white mb-1">
            Voice consent required
          </h3>
          <p className="text-sm text-text-muted">
            Cloning a voice needs recorded consent. This is stored and can be revoked anytime.
          </p>
        </div>

        <fieldset className="mb-4">
          <legend className="text-xs font-medium text-text-muted mb-2">This voice is:</legend>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setRelationship('self')}
              className={`rounded-xl px-3 py-2 text-sm border transition-colors ${
                relationship === 'self'
                  ? 'border-primary bg-primary/10 text-text dark:text-white'
                  : 'border-black/[0.08] dark:border-white/[0.12] text-text-muted'
              }`}
            >
              My own voice
            </button>
            <button
              type="button"
              onClick={() => setRelationship('authorized-third-party')}
              className={`rounded-xl px-3 py-2 text-sm border transition-colors ${
                relationship === 'authorized-third-party'
                  ? 'border-primary bg-primary/10 text-text dark:text-white'
                  : 'border-black/[0.08] dark:border-white/[0.12] text-text-muted'
              }`}
            >
              Licensed third-party
            </button>
          </div>
        </fieldset>

        <label className="flex items-start gap-3 rounded-xl bg-black/[0.03] dark:bg-white/[0.04] p-4 cursor-pointer mb-4">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            className="mt-1 h-4 w-4 accent-[#00C3FF]"
          />
          <span className="text-sm text-text dark:text-white/90 text-left">{CONSENT_STATEMENT}</span>
        </label>

        {error && (
          <div className="flex items-start gap-2 text-sm text-red-500 mb-4">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex gap-3">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              disabled={submitting}
              className="flex-1 rounded-xl px-4 py-2.5 text-sm font-medium border border-black/[0.08] dark:border-white/[0.12] text-text-muted disabled:opacity-50"
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            onClick={handleAgree}
            disabled={!checked || submitting}
            className="flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold bg-gradient-to-r from-primary to-accent text-white disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Recording…
              </>
            ) : (
              'I agree — record consent'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
