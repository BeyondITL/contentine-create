'use client';

import { History, RotateCcw, Trash2, Check } from 'lucide-react';
import type { PlanSnapshot } from '@/lib/cartoon/plan-history-db';

/**
 * Version history for the scene plan. Each entry is a persisted plan snapshot
 * (IndexedDB). Restore rewinds the editor's working plan to that version; the
 * diff summary (computed by the editor from `diffScenePlans`) states what
 * changed versus the plan currently loaded.
 */

interface PlanHistoryPanelProps {
  history: PlanSnapshot[];
  loading: boolean;
  /** Hash of the working plan — the row that matches is the current version. */
  currentPlanHash: string | null;
  /** snapshotId → one-line diff vs the current working plan. */
  diffSummaries: Map<string, string>;
  busy: boolean;
  onRestore: (snapshot: PlanSnapshot) => void;
  onDelete: (id: string) => void;
}

function relTime(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export default function PlanHistoryPanel({
  history,
  loading,
  currentPlanHash,
  diffSummaries,
  busy,
  onRestore,
  onDelete,
}: PlanHistoryPanelProps) {
  return (
    <div className="bento-card p-3">
      <div className="flex items-center gap-1.5 mb-2 px-1">
        <History size={13} className="text-text-muted" />
        <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wide">Version history</span>
      </div>

      {loading ? (
        <p className="px-1 py-6 text-center text-[11px] text-text-muted">Loading history…</p>
      ) : history.length === 0 ? (
        <p className="px-1 py-6 text-center text-[11px] text-text-muted">
          No versions yet. Each render saves a restorable snapshot here.
        </p>
      ) : (
        <ul className="space-y-1.5 max-h-[40vh] overflow-y-auto">
          {history.map((snap) => {
            const isCurrent = snap.planHash === currentPlanHash;
            const summary = diffSummaries.get(snap.id);
            return (
              <li
                key={snap.id}
                className={`rounded-lg border p-2.5 ${
                  isCurrent ? 'border-primary/50 bg-primary/[0.06]' : 'border-white/10 bg-surface dark:bg-[#242424]'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[12px] font-medium text-text dark:text-white truncate">{snap.label}</span>
                      {isCurrent && (
                        <span className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[9px] font-semibold bg-secondary/15 text-secondary shrink-0">
                          <Check size={9} /> current
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-text-muted tabular-nums">
                      {relTime(snap.createdAt)} · {snap.plan.scenes.length} scenes · {snap.planHash.slice(0, 8)}
                    </span>
                    {summary && !isCurrent && (
                      <p className="mt-0.5 text-[10px] text-text-muted">{summary}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => onRestore(snap)}
                      disabled={busy || isCurrent}
                      className="w-9 h-9 grid place-items-center rounded-lg text-text-muted hover:text-text dark:hover:text-white hover:bg-white/5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed active:scale-95"
                      aria-label={`Restore ${snap.label}`}
                      title={isCurrent ? 'Already the current version' : 'Restore this version'}
                    >
                      <RotateCcw size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(snap.id)}
                      disabled={busy}
                      className="w-9 h-9 grid place-items-center rounded-lg text-text-muted hover:text-danger hover:bg-danger/5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed active:scale-95"
                      aria-label={`Delete ${snap.label}`}
                      title="Delete this version"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
