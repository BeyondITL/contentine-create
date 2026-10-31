'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { FolderOpen, Download, Upload, Loader2, AlertCircle } from 'lucide-react';
import { useCartoonStore } from '@/stores/cartoon-store';
import { useToast } from '@/components/ui';
import type { ProjectSummary } from '@/lib/cartoon/project-store';

/**
 * Saved cartoon projects on this device (project store, IndexedDB). Reopens a
 * project with its pinned voice takes and render cache — no re-synthesis —
 * and offers a portable backup file, because browser storage can be cleared.
 * Renders nothing when there are no saved projects.
 */
export default function SavedCartoonProjects() {
  const { openEditor } = useCartoonStore();
  const { toast } = useToast();
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      const [store, ports] = await Promise.all([import('@/lib/cartoon/project-store'), import('@/lib/cartoon/commands/browser-ports')]);
      setProjects(await store.listProjects(ports.LOCAL_WORKSPACE));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read saved projects.');
      setProjects([]);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const open = async (projectId: string) => {
    setBusyId(projectId);
    setError(null);
    try {
      const [store, ports] = await Promise.all([import('@/lib/cartoon/project-store'), import('@/lib/cartoon/commands/browser-ports')]);
      const p = await store.loadProject(ports.LOCAL_WORKSPACE, projectId);
      if (!p.lastRender) throw new Error('This project has no saved render yet.');
      for (const w of p.warnings) toast({ variant: 'info', title: 'Opened with a note', description: w });
      openEditor({
        plan: p.lastRender.renderedPlan,
        takes: p.takes,
        result: p.lastRender.result,
        bgAssets: new Map<string, ImageBitmap>(),
        project: { workspaceId: ports.LOCAL_WORKSPACE, revision: p.revision, plan: p.plan },
      });
    } catch (err) {
      const code = (err as { code?: string }).code;
      setError(
        code === 'CORRUPT_ASSET' || code === 'MISSING_ASSET'
          ? `This project's saved voice audio is damaged or missing (${code}). Restore it from a backup file.`
          : err instanceof Error
            ? err.message
            : 'Could not open the project.',
      );
    } finally {
      setBusyId(null);
    }
  };

  const backup = async (projectId: string, title: string) => {
    setBusyId(projectId);
    try {
      const [store, ports] = await Promise.all([import('@/lib/cartoon/project-store'), import('@/lib/cartoon/commands/browser-ports')]);
      const blob = await store.exportProjectBundle(ports.LOCAL_WORKSPACE, projectId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title.replace(/[^\w-]+/g, '-') || 'cartoon'}.ccproj`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Backup failed.');
    } finally {
      setBusyId(null);
    }
  };

  const restore = async (file: File) => {
    setBusyId('import');
    setError(null);
    try {
      const [store, ports] = await Promise.all([import('@/lib/cartoon/project-store'), import('@/lib/cartoon/commands/browser-ports')]);
      await store.importProjectBundle(file, ports.LOCAL_WORKSPACE);
      toast({ variant: 'success', title: 'Project restored', description: file.name });
      await refresh();
    } catch (err) {
      const code = (err as { code?: string }).code;
      setError(code === 'REVISION_CONFLICT' ? 'A project with the same id is already saved on this device.' : err instanceof Error ? err.message : 'Restore failed.');
    } finally {
      setBusyId(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  if (projects === null) return null;

  return (
    <div className="bento-card p-4 mb-5 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-text dark:text-white">Saved on this device</h2>
          <p className="text-[11px] text-muted">Reopen with the same voices and render — nothing is regenerated.</p>
        </div>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busyId !== null}
          className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[44px] md:min-h-0 text-xs font-medium text-muted hover:text-text dark:hover:text-white transition-colors disabled:opacity-40"
        >
          {busyId === 'import' ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Restore backup
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".ccproj,application/x-contentine-project"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void restore(f);
          }}
        />
      </div>

      {error && (
        <div className="p-3 bg-danger/5 border border-danger/20 rounded-lg flex items-start gap-2">
          <AlertCircle size={15} className="text-danger mt-0.5 shrink-0" />
          <p className="text-xs text-danger break-words">{error}</p>
        </div>
      )}

      {projects.length === 0 ? (
        <p className="text-xs text-muted">No saved cartoons yet — your first render is saved here automatically.</p>
      ) : (
        <ul className="divide-y divide-border-light dark:divide-[#333]">
          {projects.map((p) => (
            <li key={p.projectId} className="py-2.5 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-text dark:text-white truncate">{p.title}</p>
                <p className="text-[11px] text-muted">
                  Revision {p.revision} · {new Date(p.savedAt).toLocaleString()}
                  {p.hasRender ? '' : ' · not rendered'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void backup(p.projectId, p.title)}
                disabled={busyId !== null}
                aria-label={`Download a backup of ${p.title}`}
                className="p-2 min-h-[44px] md:min-h-0 text-muted hover:text-text dark:hover:text-white transition-colors disabled:opacity-40"
              >
                <Download size={15} />
              </button>
              <button
                type="button"
                onClick={() => void open(p.projectId)}
                disabled={busyId !== null || !p.hasRender}
                className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[44px] md:min-h-0 bg-[#0A0A0A] dark:bg-white text-white dark:text-[#0A0A0A] rounded-lg text-xs font-medium hover:opacity-90 transition-all disabled:opacity-40"
              >
                {busyId === p.projectId ? <Loader2 size={13} className="animate-spin" /> : <FolderOpen size={13} />} Open
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
