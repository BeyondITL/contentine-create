'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FolderOpen, HardDrive, RefreshCw, Trash2, Wrench, FolderSync,
  Database, AlertTriangle, ShieldCheck, Loader2, CheckCircle, Plug,
} from 'lucide-react';
import { useModelStore, formatBytes, type AIModel } from '@/stores/model-store';
import { MODEL_CATALOG, IMAGE_GEN_ENABLED } from '@/lib/model-catalog';
import {
  storageSnapshot, requestPersistentStorage, formatGB, type StorageSnapshot,
} from '@/lib/model-errors';
import {
  adoptFolder, chooseModelFolder, clearAllAppData, deleteCacheEntries,
  findOrphans, folderStorageSupported, getFolderHandle, getLastVerified,
  getStorageMode, isManagedModel, migrateStorage, queryFolderPermission,
  requestFolderPermission, useBrowserStorage,
  type AdoptProgress, type DownloadProgress, type FolderPermission,
  type OrphanReport, type StorageMode,
} from '@/lib/model-storage';

/** WebLLM base families from the catalog (orphan matching). */
const WEBLLM_FAMILIES = MODEL_CATALOG
  .filter((m) => m.engine === 'webllm')
  .map((m) => m.engineModelId.replace(/-q4f(16|32)_1-MLC$/, ''));

const STATUS_CHIP: Record<string, { label: string; cls: string }> = {
  ready: { label: 'Ready', cls: 'text-secondary bg-secondary/[0.08] dark:bg-secondary/[0.15]' },
  error: { label: 'Error', cls: 'text-danger bg-danger/[0.08] dark:bg-danger/[0.15]' },
  not_downloaded: { label: 'Not downloaded', cls: 'text-text-muted dark:text-white/40 bg-black/[0.03] dark:bg-white/[0.05]' },
  queued: { label: 'Queued', cls: 'text-warning bg-warning/[0.08] dark:bg-warning/[0.15]' },
  downloading: { label: 'Downloading', cls: 'text-primary bg-primary/[0.08] dark:bg-primary/[0.15]' },
  finalizing: { label: 'Finalizing', cls: 'text-primary bg-primary/[0.08] dark:bg-primary/[0.15]' },
  verifying: { label: 'Verifying', cls: 'text-primary bg-primary/[0.08] dark:bg-primary/[0.15]' },
};

/** Relative "x ago" for last-verified stamps. */
function timeAgo(ts: number | null): string {
  if (!ts) return '—';
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/**
 * Storage panel — model folder control, per-model storage rows, origin usage
 * totals, orphan cleanup, and the clear-all-app-data switch. Rendered on the
 * Models page and in Settings → Device.
 */
export default function StoragePanel() {
  const models = useModelStore((s) => s.models);
  const checkAllStatuses = useModelStore((s) => s.checkAllStatuses);
  const deleteModel = useModelStore((s) => s.deleteModel);
  const repairModel = useModelStore((s) => s.repairModel);

  const [mode, setMode] = useState<StorageMode>('browser');
  const [folderName, setFolderName] = useState<string | null>(null);
  const [permission, setPermission] = useState<FolderPermission>('none');
  const [snapshot, setSnapshot] = useState<StorageSnapshot | null>(null);
  const [orphans, setOrphans] = useState<OrphanReport | null>(null);
  const [adoptProgress, setAdoptProgress] = useState<AdoptProgress | null>(null);
  const [migrateProgress, setMigrateProgress] = useState<DownloadProgress | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [clearSummary, setClearSummary] = useState<string | null>(null);

  const totalsRef = useRef<HTMLDivElement>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);
  const supported = folderStorageSupported();

  const refresh = useCallback(async () => {
    setMode(getStorageMode());
    const handle = await getFolderHandle();
    setFolderName(handle?.name ?? null);
    setPermission(await queryFolderPermission());
    setSnapshot(await storageSnapshot());
    try {
      setOrphans(await findOrphans(WEBLLM_FAMILIES, IMAGE_GEN_ENABLED));
    } catch {
      setOrphans(null);
    }
  }, []);

  useEffect(() => {
    refresh();
    // Browsers without folder support keep everything in browser storage —
    // ask to protect it from eviction.
    if (!supported) requestPersistentStorage();
  }, [refresh, supported]);

  useEffect(() => {
    if (confirmOpen) confirmBtnRef.current?.focus();
  }, [confirmOpen]);

  /** Pick a folder, adopt existing model files in it, re-verify everything. */
  const handleChooseFolder = async () => {
    setBusy('choose');
    try {
      const handle = await chooseModelFolder();
      setAdoptProgress({ scanned: 0, totalFiles: 0, matched: 0, currentFile: '' });
      await adoptFolder(handle, setAdoptProgress);
      await checkAllStatuses();
      await refresh();
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError') console.warn('Choose folder failed:', err);
    } finally {
      setAdoptProgress(null);
      setBusy(null);
    }
  };

  const handleUseBrowser = async () => {
    setBusy('browser');
    try {
      // eslint-disable-next-line react-hooks/rules-of-hooks -- store action, not a React hook
      await useBrowserStorage();
      await checkAllStatuses();
      await refresh();
    } finally {
      setBusy(null);
    }
  };

  const handleReconnect = async () => {
    setBusy('reconnect');
    try {
      const p = await requestFolderPermission();
      setPermission(p);
      if (p === 'granted') await checkAllStatuses();
      await refresh();
    } finally {
      setBusy(null);
    }
  };

  const handleMigrate = async (direction: 'browser-to-folder' | 'folder-to-browser') => {
    setBusy(direction);
    setMigrateProgress({ loadedBytes: 0, totalBytes: 0, currentFile: '' });
    try {
      await migrateStorage(direction, setMigrateProgress);
      await checkAllStatuses();
      await refresh();
    } catch (err) {
      console.warn('Migration failed:', err);
    } finally {
      setMigrateProgress(null);
      setBusy(null);
    }
  };

  const handleCleanOrphans = async () => {
    if (!orphans || orphans.entries.length === 0) return;
    setBusy('orphans');
    try {
      await deleteCacheEntries(orphans.entries);
      await refresh();
    } finally {
      setBusy(null);
    }
  };

  const handleClearAll = async () => {
    setConfirmOpen(false);
    setBusy('clear');
    try {
      const report = await clearAllAppData();
      const handle = await getFolderHandle();
      if (handle && getStorageMode() === 'folder') {
        setAdoptProgress({ scanned: 0, totalFiles: 0, matched: 0, currentFile: '' });
        await adoptFolder(handle, setAdoptProgress);
      }
      await checkAllStatuses();
      await refresh();
      setClearSummary(
        `Cleared ${report.cachesDeleted.length} caches, ${report.databasesDeleted.length} databases` +
        `${report.opfsCleared ? ', private file storage' : ''}` +
        `${report.serviceWorkersUnregistered > 0 ? `, ${report.serviceWorkersUnregistered} service workers` : ''}.`,
      );
      setTimeout(() => setClearSummary(null), 8000);
    } finally {
      setAdoptProgress(null);
      setBusy(null);
    }
  };

  const scrollToTotals = () => totalsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });

  return (
    <div data-testid="storage-panel" className="bento-card p-4 md:p-5 mt-6">
      <h3 className="text-[13px] font-bold text-text dark:text-white mb-4 flex items-center gap-2">
        <div className="w-1 h-4 rounded-full bg-gradient-to-b from-primary to-accent" />
        Model Storage
      </h3>

      {/* ── Model folder control ── */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 py-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <span className="text-text-muted dark:text-white/50 mt-0.5">
            <FolderOpen className="w-4 h-4" strokeWidth={1.5} />
          </span>
          <div className="min-w-0">
            <p className="text-[12px] font-semibold text-text dark:text-white leading-tight">Model folder</p>
            <p className="text-[10.5px] text-text-muted dark:text-white/45 mt-0.5 leading-relaxed">
              {mode === 'folder' && folderName
                ? <>Models are stored in <span className="font-semibold text-text dark:text-white/80">{folderName}</span> on your device.</>
                : 'Models are stored in browser storage on this device.'}
            </p>
            {!supported && (
              <p className="text-[10.5px] text-warning mt-1 leading-relaxed">
                Your browser does not support choosing a real folder (File System Access API) —
                models are kept in browser storage. Chrome and Edge support folders.
              </p>
            )}
          </div>
        </div>
        {supported && (
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {mode === 'folder' && permission === 'prompt' && (
              <button
                onClick={handleReconnect}
                disabled={busy !== null}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold
                  text-warning bg-warning/[0.06] hover:bg-warning/[0.1]
                  transition-all duration-200 active:scale-[0.97] disabled:opacity-40
                  focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none"
              >
                <Plug className="w-3 h-3" strokeWidth={2} />
                Reconnect folder
              </button>
            )}
            <button
              data-testid="choose-folder"
              onClick={handleChooseFolder}
              disabled={busy !== null}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold
                text-primary bg-primary/[0.06] hover:bg-primary/[0.1]
                transition-all duration-200 active:scale-[0.97] disabled:opacity-40
                focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none"
            >
              {busy === 'choose' ? <Loader2 className="w-3 h-3 animate-spin" strokeWidth={2} /> : <FolderOpen className="w-3 h-3" strokeWidth={2} />}
              Choose folder…
            </button>
            {mode === 'folder' && (
              <button
                data-testid="use-browser-storage"
                onClick={handleUseBrowser}
                disabled={busy !== null}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold
                  text-text-secondary dark:text-white/60 hover:bg-black/[0.04] dark:hover:bg-white/[0.06]
                  transition-all duration-200 active:scale-[0.97] disabled:opacity-40
                  focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none"
              >
                <Database className="w-3 h-3" strokeWidth={2} />
                Use browser storage
              </button>
            )}
          </div>
        )}
      </div>

      {/* Adopt / migrate progress */}
      {adoptProgress && (
        <p data-testid="adopt-progress" className="text-[11px] text-primary flex items-center gap-1.5 pb-2" aria-live="polite">
          <Loader2 className="w-3 h-3 animate-spin" strokeWidth={2} />
          Scanning {adoptProgress.scanned}/{adoptProgress.totalFiles} — matched {adoptProgress.matched}
          {adoptProgress.currentFile ? ` · ${adoptProgress.currentFile}` : ''}
        </p>
      )}
      {migrateProgress && (
        <div className="pb-2" aria-live="polite">
          <p className="text-[11px] text-primary flex items-center gap-1.5 mb-1">
            <Loader2 className="w-3 h-3 animate-spin" strokeWidth={2} />
            Copying {migrateProgress.currentFile || '…'}
          </p>
          <div className="h-1 rounded-full bg-black/[0.05] dark:bg-white/[0.08] overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-200"
              style={{ width: migrateProgress.totalBytes > 0 ? `${(migrateProgress.loadedBytes / migrateProgress.totalBytes) * 100}%` : '0%' }}
            />
          </div>
        </div>
      )}

      {/* Migration actions */}
      {supported && folderName && permission === 'granted' && !migrateProgress && (
        <div className="flex items-center gap-2 pb-3 flex-wrap">
          <button
            onClick={() => handleMigrate('browser-to-folder')}
            disabled={busy !== null}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold
              text-text-secondary dark:text-white/60 hover:bg-black/[0.04] dark:hover:bg-white/[0.06]
              transition-all duration-200 active:scale-[0.97] disabled:opacity-40
              focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none"
          >
            <FolderSync className="w-3 h-3" strokeWidth={2} />
            Copy models to folder
          </button>
          <button
            onClick={() => handleMigrate('folder-to-browser')}
            disabled={busy !== null}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold
              text-text-secondary dark:text-white/60 hover:bg-black/[0.04] dark:hover:bg-white/[0.06]
              transition-all duration-200 active:scale-[0.97] disabled:opacity-40
              focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none"
          >
            <FolderSync className="w-3 h-3 rotate-180" strokeWidth={2} />
            Copy models to browser
          </button>
        </div>
      )}

      <div className="border-t border-black/[0.04] dark:border-white/[0.06]" />

      {/* ── Per-model rows ── */}
      <div className="py-2" role="table" aria-label="Model storage details">
        <div className="hidden sm:grid grid-cols-[1fr_70px_150px_90px_70px_130px] gap-2 px-1 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted/60 dark:text-white/30" role="row">
          <span>Model</span><span>Size</span><span>Location</span><span>State</span><span>Verified</span><span className="text-right">Actions</span>
        </div>
        {models.map((m) => (
          <ModelRow
            key={m.id}
            model={m}
            mode={mode}
            onDelete={() => deleteModel(m.id)}
            onRepair={() => repairModel(m.id)}
            onFreeSpace={scrollToTotals}
          />
        ))}
      </div>

      <div className="border-t border-black/[0.04] dark:border-white/[0.06]" />

      {/* ── Totals ── */}
      <div ref={totalsRef} className="flex items-center justify-between py-3">
        <div className="flex items-start gap-3">
          <span className="text-text-muted dark:text-white/50 mt-0.5">
            <HardDrive className="w-4 h-4" strokeWidth={1.5} />
          </span>
          <div>
            <p className="text-[12px] font-semibold text-text dark:text-white leading-tight">Site storage</p>
            <p className="text-[10.5px] text-text-muted dark:text-white/45 mt-0.5">
              {snapshot
                ? <>This site: {formatGB(snapshot.usageBytes)} used of {formatGB(snapshot.quotaBytes)} allowed
                    {' '}· persistent: {snapshot.persisted ? 'yes' : 'no'}</>
                : 'Storage usage unavailable in this browser.'}
            </p>
          </div>
        </div>
        <button
          onClick={refresh}
          aria-label="Refresh storage usage"
          className="p-1.5 rounded-lg text-text-muted/30 hover:text-primary hover:bg-primary/[0.05] transition-all duration-200 active:scale-95"
        >
          <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.5} />
        </button>
      </div>

      <div className="border-t border-black/[0.04] dark:border-white/[0.06]" />

      {/* ── Orphans ── */}
      <div className="flex items-center justify-between py-3">
        <div className="flex items-start gap-3">
          <span className="text-text-muted dark:text-white/50 mt-0.5">
            <AlertTriangle className="w-4 h-4" strokeWidth={1.5} />
          </span>
          <div>
            <p className="text-[12px] font-semibold text-text dark:text-white leading-tight">Orphaned data</p>
            <p className="text-[10.5px] text-text-muted dark:text-white/45 mt-0.5">
              {orphans && orphans.entries.length > 0
                ? `${orphans.entries.length} leftover entries (partial downloads, superseded variants) — ${formatBytes(orphans.totalBytes)}`
                : 'No orphaned model data found.'}
            </p>
          </div>
        </div>
        {orphans && orphans.entries.length > 0 && (
          <button
            onClick={handleCleanOrphans}
            disabled={busy !== null}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[11px] font-semibold
              text-warning bg-warning/[0.06] hover:bg-warning/[0.1]
              transition-all duration-200 active:scale-[0.97] disabled:opacity-40
              focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none"
          >
            {busy === 'orphans' ? <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} /> : <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />}
            Clean orphans
          </button>
        )}
      </div>

      <div className="border-t border-black/[0.04] dark:border-white/[0.06]" />

      {/* ── Clear all app data ── */}
      <div className="flex items-center justify-between py-3">
        <div className="flex items-start gap-3">
          <span className="text-danger/60 mt-0.5">
            <ShieldCheck className="w-4 h-4" strokeWidth={1.5} />
          </span>
          <div>
            <p className="text-[12px] font-semibold text-text dark:text-white leading-tight">Clear all app data</p>
            <p className="text-[10.5px] text-text-muted dark:text-white/45 mt-0.5 leading-relaxed">
              Wipes this site&apos;s caches, databases and private file storage.
              Models in your chosen folder are kept and re-detected.
            </p>
            {clearSummary && (
              <p className="text-[10.5px] text-secondary mt-1 flex items-center gap-1" aria-live="polite">
                <CheckCircle className="w-3 h-3" strokeWidth={2} />
                {clearSummary}
              </p>
            )}
          </div>
        </div>
        <button
          data-testid="clear-all-app-data"
          onClick={() => setConfirmOpen(true)}
          disabled={busy !== null}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[11px] font-semibold
            text-danger/70 hover:text-danger bg-danger/[0.04] hover:bg-danger/[0.08]
            transition-all duration-200 active:scale-[0.97] disabled:opacity-40
            focus-visible:ring-2 focus-visible:ring-danger/30 focus-visible:outline-none"
        >
          {busy === 'clear' ? <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} /> : <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />}
          Clear all
        </button>
      </div>

      {/* ── Confirm dialog ── */}
      {confirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in"
          role="dialog"
          aria-modal="true"
          aria-labelledby="clear-all-title"
          onKeyDown={(e) => { if (e.key === 'Escape') setConfirmOpen(false); }}
        >
          <div className="bento-card p-5 max-w-md mx-4 shadow-2xl">
            <h4 id="clear-all-title" className="text-[14px] font-bold text-text dark:text-white mb-2 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-danger" strokeWidth={2} />
              Clear all app data?
            </h4>
            <p className="text-[12px] text-text-muted dark:text-white/50 leading-relaxed mb-2">
              This wipes this site&apos;s Cache Storage, IndexedDB and OPFS (and any
              service-worker caches). Downloaded models in browser storage will be deleted.
            </p>
            <p className="text-[12px] text-text-muted dark:text-white/50 leading-relaxed mb-2">
              A website cannot clear Chrome&apos;s global browser cache — only this
              site&apos;s own data is affected.
            </p>
            <p className="text-[12px] text-text-muted dark:text-white/50 leading-relaxed mb-4">
              Models stored in your chosen folder are <span className="font-semibold text-text dark:text-white/80">not deleted</span> and
              will be re-detected automatically.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setConfirmOpen(false)}
                className="px-3.5 py-2 rounded-lg text-[11px] font-semibold text-text-secondary dark:text-white/60
                  hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-all duration-200 active:scale-[0.97]
                  focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none"
              >
                Cancel
              </button>
              <button
                ref={confirmBtnRef}
                data-testid="clear-all-confirm"
                onClick={handleClearAll}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[11px] font-semibold
                  text-white bg-danger hover:bg-danger/90 transition-all duration-200 active:scale-[0.97]
                  focus-visible:ring-2 focus-visible:ring-danger/40 focus-visible:outline-none"
              >
                <Trash2 className="w-3.5 h-3.5" strokeWidth={2} />
                Clear all app data
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** One model's storage row: size, location, state, last verified, actions. */
function ModelRow({
  model, mode, onDelete, onRepair, onFreeSpace,
}: {
  model: AIModel;
  mode: StorageMode;
  onDelete: () => void;
  onRepair: () => void;
  onFreeSpace: () => void;
}) {
  const managed = isManagedModel(model.id);
  const location = managed
    ? (mode === 'folder' ? 'Folder' : 'Browser')
    : 'Browser (engine-managed)';
  const chip = STATUS_CHIP[model.status] ?? STATUS_CHIP.not_downloaded;
  const canRepair = managed && (model.status === 'ready' || model.status === 'error');
  const canDelete = model.status === 'ready' || model.status === 'error';

  return (
    <div data-testid={`model-row-${model.id}`} className="border-b border-black/[0.03] dark:border-white/[0.04] last:border-b-0" role="row">
      <div className="grid grid-cols-2 sm:grid-cols-[1fr_70px_150px_90px_70px_130px] gap-2 items-center px-1 py-2">
        <span className="text-[12px] font-medium text-text dark:text-white/85 truncate">{model.name}</span>
        <span className="text-[11px] text-text-muted dark:text-white/45 tabular-nums">{formatBytes(model.sizeBytes)}</span>
        <span className="text-[11px] text-text-muted dark:text-white/45 truncate">{location}</span>
        <span className="flex items-center">
          {/* Raw status for E2E assertions; the styled chip is presentational. */}
          <span data-testid={`model-state-${model.id}`} className="sr-only">{model.status}</span>
          <span aria-hidden="true" className={`text-[10px] font-bold px-2 py-[3px] rounded-md uppercase tracking-[0.05em] leading-none w-fit ${chip.cls}`}>
            {chip.label}
          </span>
        </span>
        <span className="text-[11px] text-text-muted dark:text-white/45 tabular-nums">
          {model.status === 'ready' ? timeAgo(getLastVerified(model.id)) : '—'}
        </span>
        <span className="flex items-center justify-end gap-1">
          {canRepair && (
            <button
              data-testid={`repair-${model.id}`}
              onClick={onRepair}
              aria-label={`Repair ${model.name}`}
              title="Verify checksums and re-download damaged parts"
              className="p-1.5 rounded-lg text-text-muted/40 hover:text-primary hover:bg-primary/[0.05]
                transition-all duration-200 active:scale-95
                focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none"
            >
              <Wrench className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>
          )}
          {canDelete && (
            <button
              onClick={onDelete}
              aria-label={`Delete ${model.name}`}
              title="Delete from storage"
              className="p-1.5 rounded-lg text-text-muted/40 hover:text-danger hover:bg-danger/[0.05]
                transition-all duration-200 active:scale-95
                focus-visible:ring-2 focus-visible:ring-danger/30 focus-visible:outline-none"
            >
              <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>
          )}
        </span>
      </div>
      {model.status === 'error' && model.error && (
        <p className="text-[10.5px] text-danger leading-relaxed px-1 pb-2 -mt-0.5">
          {model.error}
          {model.errorKind === 'storage-quota' && (
            <button
              onClick={onFreeSpace}
              className="ml-1.5 font-semibold underline underline-offset-2 hover:text-danger/80
                focus-visible:ring-2 focus-visible:ring-danger/30 focus-visible:outline-none rounded"
            >
              Free up space
            </button>
          )}
        </p>
      )}
    </div>
  );
}
