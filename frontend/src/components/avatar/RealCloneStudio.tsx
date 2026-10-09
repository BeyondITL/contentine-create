'use client';

/**
 * Real Clone Studio submission (Professional tier, D-24 · SA-12 / F-35) [WS-5]
 *
 * Law L7 consent gate: no request can be submitted without an affirmative,
 * recorded consent that the person shown is the user (or licensed) and consents
 * to a synthetic likeness — a right-of-publicity / ELVIS-Act-class shield. The
 * checkbox is REQUIRED to enable submit, and the affirmation is persisted in the
 * DB by the backend (AvatarController@realClone → real_clone_requests). Nothing
 * here fakes success: the request is a real row the admin review queue works.
 */

import { useState, useRef } from 'react';
import { ShieldCheck, Upload, Loader2, Check, AlertCircle, Video, Crown } from 'lucide-react';
import { getToken } from '@/lib/auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api';
const MAX_VIDEO_BYTES = 100 * 1024 * 1024; // 100 MB — mirrors the backend limit
const ACCEPTED = 'video/mp4,video/webm,video/quicktime';

/** Versioned consent — bump on any wording change (evidence of what was shown). */
export const REAL_CLONE_CONSENT_VERSION = '2026-08-04.1';
export const REAL_CLONE_CONSENT_STATEMENT =
  'I confirm that I am the person shown in this video, or that I have the explicit ' +
  'rights and permission to use their likeness, and I consent to Contentine creating ' +
  'a synthetic likeness that can generate new video of this person. I understand this ' +
  'is a right-of-publicity decision, that I can revoke consent, and that I can request ' +
  'deletion of the source material and the resulting clone at any time.';

type Relationship = 'self' | 'authorized-third-party';
type Phase = 'idle' | 'submitting' | 'submitted' | 'error';

function tooBig(f: File): boolean {
  return f.size > MAX_VIDEO_BYTES;
}

export default function RealCloneStudio() {
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [consentFile, setConsentFile] = useState<File | null>(null);
  const [consentChecked, setConsentChecked] = useState(false);
  const [relationship, setRelationship] = useState<Relationship>('self');
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);

  const sourceRef = useRef<HTMLInputElement>(null);
  const consentRef = useRef<HTMLInputElement>(null);

  const canSubmit = !!sourceFile && consentChecked && phase !== 'submitting';

  function pickSource(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (tooBig(f)) { setError('Source video too large. Maximum 100MB — trim the clip and try again.'); return; }
    setError(null);
    setSourceFile(f);
  }

  function pickConsent(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (tooBig(f)) { setError('Consent recording too large. Maximum 100MB.'); return; }
    setError(null);
    setConsentFile(f);
  }

  async function submit() {
    if (!sourceFile || !consentChecked) return;
    setPhase('submitting');
    setError(null);
    try {
      const token = await getToken();
      let csrf = '';
      try {
        const r = await fetch(`${API_URL}/auth/csrf-token`);
        if (r.ok) csrf = (await r.json()).token || '';
      } catch { /* CSRF fetch best-effort; backend returns 403 with a clear reason if required */ }

      const fd = new FormData();
      fd.append('consent', 'true');
      fd.append('consent_statement', REAL_CLONE_CONSENT_STATEMENT);
      fd.append('consent_version', REAL_CLONE_CONSENT_VERSION);
      fd.append('consent_relationship', relationship);
      fd.append('source_video', sourceFile, sourceFile.name);
      if (consentFile) fd.append('consent_video', consentFile, consentFile.name);

      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      if (csrf) headers['X-CSRF-Token'] = csrf;

      const res = await fetch(`${API_URL}/avatars/real-clone`, { method: 'POST', headers, body: fd });
      if (!res.ok) {
        const b = await res.json().catch(() => ({} as { error?: string }));
        throw new Error(b.error || `Submission failed (${res.status}).`);
      }
      setPhase('submitted');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed. Check your connection and try again.');
      setPhase('error');
    }
  }

  if (phase === 'submitted') {
    return (
      <div className="flex items-start gap-3 p-4 rounded-xl border bg-secondary/5 border-secondary/20">
        <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
          <Check size={16} className="text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-secondary">Submitted for review</p>
          <p className="text-xs text-muted mt-0.5 leading-relaxed">
            Your Real Clone request is in the queue with your recorded consent. Our team builds the
            photorealistic clone by hand and notifies you when it is ready. You can revoke consent or
            request deletion at any time.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-accent/10 text-accent flex items-center justify-center">
          <Crown size={16} />
        </div>
        <div>
          <p className="text-sm font-semibold text-text dark:text-white">Real Clone Studio</p>
          <p className="text-[11px] text-muted">Hand-built photorealistic talking-head from your video. Professional plan.</p>
        </div>
      </div>

      {/* Source video */}
      <div>
        <label className="block text-xs font-medium text-text dark:text-white mb-1.5">Source video</label>
        <button
          type="button"
          onClick={() => sourceRef.current?.click()}
          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border border-border-light dark:border-[#333] hover:border-primary text-left transition-colors min-h-[44px]"
        >
          <Video size={15} className="text-primary shrink-0" />
          <span className="text-xs text-text dark:text-white truncate">
            {sourceFile ? sourceFile.name : 'Choose a clear video of the person (MP4, WebM, or MOV · max 100MB)'}
          </span>
          <Upload size={14} className="text-muted ml-auto shrink-0" />
        </button>
        <input ref={sourceRef} type="file" accept={ACCEPTED} onChange={pickSource} className="hidden" aria-label="Source video" />
      </div>

      {/* Optional consent recording */}
      <div>
        <label className="block text-xs font-medium text-text dark:text-white mb-1.5">
          On-camera consent recording <span className="text-muted font-normal">(optional, recommended)</span>
        </label>
        <button
          type="button"
          onClick={() => consentRef.current?.click()}
          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border border-border-light dark:border-[#333] hover:border-primary text-left transition-colors min-h-[44px]"
        >
          <ShieldCheck size={15} className="text-secondary shrink-0" />
          <span className="text-xs text-text dark:text-white truncate">
            {consentFile ? consentFile.name : 'A short clip of the person stating they consent (strongest evidence)'}
          </span>
          <Upload size={14} className="text-muted ml-auto shrink-0" />
        </button>
        <input ref={consentRef} type="file" accept={ACCEPTED} onChange={pickConsent} className="hidden" aria-label="Consent recording" />
      </div>

      {/* Relationship */}
      <div>
        <label className="block text-xs font-medium text-text dark:text-white mb-1.5">This person is</label>
        <div className="grid grid-cols-2 gap-2">
          {([
            { id: 'self' as const, label: 'Me' },
            { id: 'authorized-third-party' as const, label: 'Someone who authorized me' },
          ]).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setRelationship(opt.id)}
              className={`px-3 py-2 rounded-lg border text-xs font-medium text-left transition-colors min-h-[44px] ${
                relationship === opt.id
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border-light dark:border-[#333] text-text dark:text-white hover:border-border dark:hover:border-[#555]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* L7 consent gate */}
      <label className="flex items-start gap-2.5 p-3 rounded-xl border border-border-light dark:border-[#333] cursor-pointer hover:border-border dark:hover:border-[#555] transition-colors">
        <input
          type="checkbox"
          checked={consentChecked}
          onChange={(e) => setConsentChecked(e.target.checked)}
          className="mt-0.5 w-4 h-4 accent-primary shrink-0"
        />
        <span className="text-[11px] text-muted leading-relaxed">{REAL_CLONE_CONSENT_STATEMENT}</span>
      </label>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-danger/5 border border-danger/20">
          <AlertCircle size={15} className="text-danger shrink-0" />
          <p className="text-xs text-danger">{error}</p>
        </div>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={!canSubmit}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-white text-sm font-semibold transition-all min-h-[44px] disabled:opacity-40 disabled:cursor-not-allowed hover:enabled:brightness-110 active:enabled:scale-[0.99]"
      >
        {phase === 'submitting' ? (
          <>
            <Loader2 size={15} className="animate-spin" />
            Submitting…
          </>
        ) : (
          <>
            <ShieldCheck size={15} />
            Submit for Real Clone review
          </>
        )}
      </button>
      {!consentChecked && (
        <p className="text-[11px] text-muted text-center">Recorded consent is required before submitting (Law L7).</p>
      )}
    </div>
  );
}
