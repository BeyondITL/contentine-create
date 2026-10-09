'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  UserSquare2,
  ShieldCheck,
  Hammer,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Film,
  FileVideo,
} from 'lucide-react';
import { api } from '@/lib/api';

type CloneStatus = 'pending' | 'approved' | 'building' | 'complete' | 'rejected';

interface CloneRequest {
  id: number;
  user_id: number;
  user_name: string | null;
  user_email: string;
  user_plan: string;
  consent_recorded: boolean | number;
  consent_video_path: string | null;
  source_video_path: string | null;
  status: CloneStatus;
  avatar_id: number | null;
  notes: string | null;
  admin_notes: string | null;
  created_at: string;
}

/** The L7 consent affirmation WS-5 records as JSON in `notes` at submission. */
interface ConsentAffirmation {
  statement?: string;
  form_version?: string;
  relationship?: string;
  signed_at?: string;
  ip?: string;
  user_agent?: string;
  has_consent_recording?: boolean;
}

/** Parse the consent affirmation JSON; returns null when notes is absent or plain text. */
function parseConsent(notes: string | null): ConsentAffirmation | null {
  if (!notes) return null;
  try {
    const parsed = JSON.parse(notes);
    if (parsed && typeof parsed === 'object' && parsed.consent && typeof parsed.consent === 'object') {
      return parsed.consent as ConsentAffirmation;
    }
    return null;
  } catch {
    return null;
  }
}

interface QueueResponse {
  requests: CloneRequest[];
  counts: Partial<Record<CloneStatus, number>>;
}

const STATUS_META: Record<CloneStatus, { label: string; icon: typeof Clock; className: string }> = {
  pending:  { label: 'Pending',  icon: Clock,        className: 'text-warning bg-warning/10' },
  approved: { label: 'Approved', icon: ShieldCheck,  className: 'text-primary bg-primary/10' },
  building: { label: 'Building', icon: Hammer,       className: 'text-info bg-info/10' },
  complete: { label: 'Complete', icon: CheckCircle2, className: 'text-secondary bg-secondary/10' },
  rejected: { label: 'Rejected', icon: XCircle,      className: 'text-danger bg-danger/10' },
};

const FILTERS: Array<{ value: CloneStatus | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'building', label: 'Building' },
  { value: 'complete', label: 'Complete' },
  { value: 'rejected', label: 'Rejected' },
];

/** Admin review queue for Real Clone Studio requests (SA-12/F-35). */
export default function RealCloneQueuePage() {
  const [requests, setRequests] = useState<CloneRequest[]>([]);
  const [counts, setCounts] = useState<Partial<Record<CloneStatus, number>>>({});
  const [filter, setFilter] = useState<CloneStatus | 'all'>('pending');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const qs = filter === 'all' ? '' : `?status=${filter}`;
      const data = await api.get<QueueResponse>(`/admin/real-clone${qs}`);
      setRequests(Array.isArray(data?.requests) ? data.requests : []);
      setCounts(data?.counts ?? {});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load the clone queue');
    } finally {
      setIsLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const act = useCallback(
    async (id: number, status: CloneStatus, notes?: string) => {
      setActingId(id);
      try {
        await api.post(`/admin/real-clone/${id}/status`, { status, notes });
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Action failed');
      } finally {
        setActingId(null);
      }
    },
    [load],
  );

  const handleReject = useCallback(
    (id: number) => {
      const reason = typeof window !== 'undefined' ? window.prompt('Reason for rejection (shared with the user):') : '';
      if (reason === null) return; // cancelled
      act(id, 'rejected', reason || 'Request could not be approved.');
    },
    [act],
  );

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <UserSquare2 className="w-8 h-8 text-secondary" />
        <div>
          <h1 className="text-2xl font-bold text-dark dark:text-white">Real Clone Queue</h1>
          <p className="text-sm text-dark/60 dark:text-white/60">
            Review consented clone requests, approve, and track the build.
          </p>
        </div>
      </div>

      {/* Filters + counts */}
      <div className="flex flex-wrap gap-2 mb-6">
        {FILTERS.map((f) => {
          const active = filter === f.value;
          const count = f.value === 'all' ? undefined : counts[f.value];
          return (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? 'bg-primary text-white'
                  : 'bg-surface dark:bg-white/5 text-dark/70 dark:text-white/70 hover:bg-black/[0.06] dark:hover:bg-white/10'
              }`}
            >
              {f.label}
              {count !== undefined && count > 0 && (
                <span className={`ml-1.5 ${active ? 'text-white/80' : 'text-dark/40 dark:text-white/40'}`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-4 mb-6 rounded-xl bg-danger/10 text-danger text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Loading */}
      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-28 bg-white dark:bg-dark/60 border border-border dark:border-white/10 rounded-xl animate-pulse"
            />
          ))}
        </div>
      ) : requests.length === 0 ? (
        /* Empty */
        <div className="flex flex-col items-center text-center py-16">
          <div className="w-12 h-12 rounded-2xl bg-surface dark:bg-white/5 flex items-center justify-center mb-4">
            <UserSquare2 className="w-6 h-6 text-dark/40 dark:text-white/40" />
          </div>
          <h2 className="text-[15px] font-semibold text-dark dark:text-white mb-1">No requests here</h2>
          <p className="text-[13px] text-dark/60 dark:text-white/60">
            {filter === 'all'
              ? 'No Real Clone requests have been submitted yet.'
              : `No requests with status "${filter}".`}
          </p>
        </div>
      ) : (
        /* List */
        <div className="space-y-4">
          {requests.map((req) => {
            const meta = STATUS_META[req.status];
            const StatusIcon = meta.icon;
            const busy = actingId === req.id;
            return (
              <div
                key={req.id}
                className="p-5 bg-white dark:bg-dark/60 border border-border dark:border-white/10 rounded-xl"
              >
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-dark dark:text-white truncate">
                        {req.user_name || req.user_email}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-surface dark:bg-white/5 text-dark/60 dark:text-white/60 capitalize">
                        {req.user_plan}
                      </span>
                    </div>
                    <p className="text-sm text-dark/60 dark:text-white/60 truncate">{req.user_email}</p>
                    <p className="text-xs text-dark/40 dark:text-white/40 mt-1">
                      Submitted {new Date(req.created_at).toLocaleString()}
                    </p>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${meta.className}`}
                  >
                    <StatusIcon className="w-3.5 h-3.5" />
                    {meta.label}
                  </span>
                </div>

                {/* Consent + assets */}
                <div className="flex flex-wrap gap-3 mt-4">
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs ${
                      req.consent_recorded
                        ? 'bg-secondary/10 text-secondary'
                        : 'bg-danger/10 text-danger'
                    }`}
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    {req.consent_recorded ? 'Consent recorded (L7)' : 'No consent on file'}
                  </span>
                  {req.consent_video_path && (
                    <AssetLink
                      icon={ShieldCheck}
                      label="Consent recording"
                      path={req.consent_video_path}
                      missingLabel="No consent video"
                    />
                  )}
                  <AssetLink
                    icon={FileVideo}
                    label="Source video"
                    path={req.source_video_path}
                    missingLabel="No source video"
                  />
                </div>

                {/* L7 consent affirmation (parsed) or raw submission notes */}
                {(() => {
                  const consent = parseConsent(req.notes);
                  if (consent) {
                    return (
                      <div className="mt-3 text-xs bg-surface dark:bg-white/5 rounded-lg p-3 space-y-1">
                        {consent.statement && (
                          <p className="text-dark/80 dark:text-white/80">{consent.statement}</p>
                        )}
                        <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-dark/50 dark:text-white/50">
                          {consent.signed_at && <span>Signed {new Date(consent.signed_at).toLocaleString()}</span>}
                          {consent.relationship && <span>Relationship: {consent.relationship}</span>}
                          {consent.form_version && <span>Form {consent.form_version}</span>}
                          {consent.ip && <span>IP {consent.ip}</span>}
                        </div>
                      </div>
                    );
                  }
                  return req.notes ? (
                    <p className="mt-3 text-sm text-dark/70 dark:text-white/70 bg-surface dark:bg-white/5 rounded-lg p-3">
                      {req.notes}
                    </p>
                  ) : null;
                })()}

                {req.admin_notes && (
                  <p className="mt-2 text-sm text-dark/70 dark:text-white/70 border-l-2 border-primary/40 pl-3">
                    <span className="text-[11px] uppercase tracking-wide text-dark/40 dark:text-white/40 block">Admin note</span>
                    {req.admin_notes}
                  </p>
                )}

                {/* Actions — reflect the review lifecycle */}
                <div className="flex flex-wrap gap-2 mt-4">
                  {req.status === 'pending' && (
                    <>
                      <ActionButton
                        onClick={() => act(req.id, 'approved')}
                        disabled={busy || !req.consent_recorded}
                        icon={ShieldCheck}
                        label="Approve"
                        variant="primary"
                        title={req.consent_recorded ? undefined : 'Cannot approve without recorded consent (L7)'}
                      />
                      <ActionButton onClick={() => handleReject(req.id)} disabled={busy} icon={XCircle} label="Reject" variant="danger" />
                    </>
                  )}
                  {req.status === 'approved' && (
                    <ActionButton onClick={() => act(req.id, 'building')} disabled={busy} icon={Hammer} label="Start build" variant="info" />
                  )}
                  {req.status === 'building' && (
                    <ActionButton onClick={() => act(req.id, 'complete')} disabled={busy} icon={CheckCircle2} label="Mark complete" variant="secondary" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** A link to an uploaded asset, or an honest "missing" chip when absent. */
function AssetLink({
  icon: Icon,
  label,
  path,
  missingLabel,
}: {
  icon: typeof Film;
  label: string;
  path: string | null;
  missingLabel: string;
}) {
  if (!path) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs bg-surface dark:bg-white/5 text-dark/40 dark:text-white/40">
        <Icon className="w-3.5 h-3.5" />
        {missingLabel}
      </span>
    );
  }
  return (
    <a
      href={path}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </a>
  );
}

type Variant = 'primary' | 'secondary' | 'info' | 'danger';

const VARIANT_CLASS: Record<Variant, string> = {
  primary: 'bg-primary text-white hover:bg-primary/90',
  secondary: 'bg-secondary text-white hover:bg-secondary/90',
  info: 'bg-info text-white hover:bg-info/90',
  danger: 'bg-danger/10 text-danger hover:bg-danger/20',
};

/** A queue action button with a disabled/busy state. */
function ActionButton({
  onClick,
  disabled,
  icon: Icon,
  label,
  variant,
  title,
}: {
  onClick: () => void;
  disabled?: boolean;
  icon: typeof Film;
  label: string;
  variant: Variant;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${VARIANT_CLASS[variant]}`}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );
}
