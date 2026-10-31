'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Download, Wand2, Loader2, AlertCircle, Monitor, RefreshCw, X } from 'lucide-react';
import { useCartoonStore } from '@/stores/cartoon-store';
import { ProgressBar, useToast } from '@/components/ui';
import AiGeneratedBadge from '@/components/shared/AiGeneratedBadge';
import TimelinePreview from './TimelinePreview';
import SceneStrip, { type SceneDirtyKind } from './SceneStrip';
import SceneInspector from './SceneInspector';
import PlanHistoryPanel from './PlanHistoryPanel';
import type {
  ScenePlan,
  ScenePlanScene,
  CharacterBlock,
  CompiledTimeline,
  VoiceTake,
  CartoonRenderResult,
  PartialRenderReport,
} from '@/engine/cartoon';
import type { PlanSnapshot } from '@/lib/cartoon/plan-history-db';
import { takeMatchesLine } from '@/lib/cartoon/take-identity';

type EngineModule = typeof import('@/engine/cartoon');
type EntranceType = NonNullable<CharacterBlock['entrance']>['type'];

const clonePlan = (p: ScenePlan): ScenePlan => JSON.parse(JSON.stringify(p)) as ScenePlan;
const newIdempotencyKey = () => `ui-${crypto.randomUUID()}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const takeKey = (line: { id: string; takeRef?: string }) => line.takeRef ?? line.id;

/** True when a line's on-screen text no longer matches its synthesized take. */
function hasStaleTake(scene: ScenePlanScene, takes: Map<string, VoiceTake>): boolean {
  return scene.dialogue.some((line) => !takeMatchesLine(takes.get(takeKey(line)), line));
}

/**
 * Build the plan the PREVIEW compiles from: identical to the working plan for
 * every visual field, but each dialogue line's text is pinned to the text that
 * was actually voiced (the take's text). This keeps captions, mouth visemes and
 * timing mutually consistent — an unvoiced text edit never shows a caption the
 * audio/timing doesn't match. The scene is separately badged "re-roll to voice".
 */
function buildPreviewPlan(plan: ScenePlan, takes: Map<string, VoiceTake>): ScenePlan {
  const clone = clonePlan(plan);
  for (const scene of clone.scenes) {
    for (const line of scene.dialogue) {
      const t = takes.get(takeKey(line));
      if (t) line.text = t.text;
    }
  }
  return clone;
}

function summarizeDiff(d: {
  changedSceneIds: string[];
  addedSceneIds: string[];
  removedSceneIds: string[];
  structureChanged: boolean;
}): string {
  const parts: string[] = [];
  if (d.changedSceneIds.length) parts.push(`${d.changedSceneIds.length} changed`);
  if (d.addedSceneIds.length) parts.push(`${d.addedSceneIds.length} added`);
  if (d.removedSceneIds.length) parts.push(`${d.removedSceneIds.length} removed`);
  if (!parts.length) return 'Identical to the current draft';
  return (d.structureChanged ? 'Reordered · ' : '') + parts.join(' · ');
}

export default function CartoonTimelineEditor() {
  const { session, updateSession, closeEditor, history, historyLoading, loadHistory, pushSnapshot, removeSnapshot } =
    useCartoonStore();
  const { toast } = useToast();

  // ── Live render objects (non-serializable; seeded once from the session) ──
  const takesRef = useRef<Map<string, VoiceTake>>(session ? new Map(session.takes) : new Map());
  const resultRef = useRef<CartoonRenderResult | null>(session?.result ?? null);
  const renderedPlanRef = useRef<ScenePlan | null>(session ? clonePlan(session.plan) : null);
  const bgAssetsRef = useRef<Map<string, ImageBitmap>>(session?.bgAssets ?? new Map());
  const engineRef = useRef<EngineModule | null>(null);
  /** Saved-project base (revision + plan) — the CAS precondition for the next commit. */
  const projectRef = useRef(session?.project ?? null);
  const activeRunRef = useRef<string | null>(null);

  // ── Working editing state ────────────────────────────────────────────────
  const [workingPlan, setWorkingPlan] = useState<ScenePlan | null>(
    session ? clonePlan(session.project?.plan ?? session.plan) : null,
  );
  const [conflict, setConflict] = useState<string | null>(null);
  const [engineReady, setEngineReady] = useState(false);
  const [compiled, setCompiled] = useState<CompiledTimeline | null>(null);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(session?.plan.scenes[0]?.id ?? null);
  const [activeSceneId, setActiveSceneId] = useState<string | null>(null);
  const [seekReq, setSeekReq] = useState<{ t: number; nonce: number } | null>(null);
  const [dirty, setDirty] = useState<Map<string, SceneDirtyKind>>(new Map());
  const [diffSummaries, setDiffSummaries] = useState<Map<string, string>>(new Map());
  const [renderedHash, setRenderedHash] = useState<string | null>(session?.result.planHash ?? null);

  // ── Re-roll lifecycle ────────────────────────────────────────────────────
  const [busy, setBusy] = useState(false);
  const [busyPct, setBusyPct] = useState(0);
  const [busyMsg, setBusyMsg] = useState('');
  const [rerollError, setRerollError] = useState<string | null>(null);
  const [lastReport, setLastReport] = useState<PartialRenderReport | null>(null);

  // Load the engine (dynamic import — Law L8) and the project's history once.
  useEffect(() => {
    let alive = true;
    (async () => {
      const engine = await import('@/engine/cartoon');
      if (!alive) return;
      engineRef.current = engine;
      setEngineReady(true);
    })().catch((err) => {
      if (alive) setRerollError(err instanceof Error ? err.message : 'Failed to load the cartoon engine.');
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (session?.plan.id) void loadHistory(session.plan.id);
  }, [session?.plan.id, loadHistory]);

  // Recompile the preview whenever the plan or takes change. Compilation is a
  // pure sync engine call once loaded — same compiler the export worker uses.
  const recompile = useCallback(() => {
    const engine = engineRef.current;
    if (!engine || !workingPlan) return;
    try {
      const previewPlan = buildPreviewPlan(workingPlan, takesRef.current);
      const takeInfo = engine.takeTimingInfo(takesRef.current);
      setCompiled(engine.compileTimeline(previewPlan, takeInfo));
    } catch (err) {
      // A missing take (should not happen post-render) → keep the last good frame.
      setRerollError(err instanceof Error ? err.message : 'Could not compile the timeline.');
    }
  }, [workingPlan]);

  useEffect(() => {
    if (engineReady) recompile();
  }, [engineReady, recompile]);

  // Recompute per-scene dirty state vs the last rendered MP4.
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !workingPlan || !renderedPlanRef.current) return;
    let alive = true;
    (async () => {
      const d = await engine.diffScenePlans(renderedPlanRef.current!, workingPlan);
      if (!alive) return;
      const ids = new Set([...d.changedSceneIds, ...d.addedSceneIds]);
      const map = new Map<string, SceneDirtyKind>();
      for (const scene of workingPlan.scenes) {
        if (ids.has(scene.id)) map.set(scene.id, hasStaleTake(scene, takesRef.current) ? 'voice' : 'visual');
      }
      setDirty(map);
    })();
    return () => {
      alive = false;
    };
  }, [workingPlan]);

  // Diff summaries for the history panel (snapshot vs current working plan).
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !workingPlan || history.length === 0) {
      setDiffSummaries(new Map());
      return;
    }
    let alive = true;
    (async () => {
      const map = new Map<string, string>();
      for (const snap of history) {
        const d = await engine.diffScenePlans(snap.plan, workingPlan);
        map.set(snap.id, summarizeDiff(d));
      }
      if (alive) setDiffSummaries(map);
    })();
    return () => {
      alive = false;
    };
  }, [history, workingPlan]);

  // ── Scene editing (real plan mutations) ──────────────────────────────────
  const mutateSelectedScene = useCallback(
    (fn: (scene: ScenePlanScene) => void) => {
      setWorkingPlan((prev) => {
        if (!prev) return prev;
        const next = clonePlan(prev);
        const scene = next.scenes.find((s) => s.id === selectedSceneId);
        if (scene) fn(scene);
        return next;
      });
    },
    [selectedSceneId],
  );

  const onChangeText = (text: string) =>
    mutateSelectedScene((scene) => {
      if (scene.dialogue[0]) scene.dialogue[0].text = text;
    });

  const onToggleCaption = (enabled: boolean) =>
    mutateSelectedScene((scene) => {
      scene.captions.enabled = enabled;
    });

  const onSetEntrance = (type: EntranceType) =>
    mutateSelectedScene((scene) => {
      const ch = scene.characters[0];
      if (!ch) return;
      if (type === 'none') ch.entrance = { type: 'none', duration: 0 };
      else ch.entrance = { type, from: 'left', duration: type === 'walk-in' ? 1.4 : 0.5 };
    });

  const onRerollBackground = () =>
    mutateSelectedScene((scene) => {
      // A fresh deterministic seed → a different procedural background. Timing is
      // untouched, so this is the canonical single-scene partial re-render.
      scene.background.seed = Math.floor(Math.random() * 100000);
    });

  const onSelectScene = (sceneId: string) => {
    setSelectedSceneId(sceneId);
    const w = compiled?.timing.scenes.find((s) => s.sceneId === sceneId);
    if (w) setSeekReq({ t: w.start, nonce: Date.now() });
  };

  // ── Scoped re-roll: re-voice stale lines, then partial re-render ─────────
  const dirtyCount = dirty.size;

  /**
   * Re-roll = commit the draft through the SAME command path an assistant
   * uses: scene_apply_patch (CAS on the saved revision) → voice_synthesize
   * (only lines whose take identity changed) → render_start → run_inspect.
   * The new baseline is read back from the project store, so what the editor
   * shows is exactly what was saved.
   */
  const handleReroll = useCallback(async () => {
    if (!workingPlan || !resultRef.current || !renderedPlanRef.current || busy) return;

    setBusy(true);
    setRerollError(null);
    setConflict(null);
    setLastReport(null);
    setBusyPct(0);

    try {
      const [ports, { planToPatch }, store] = await Promise.all([
        import('@/lib/cartoon/commands/browser-ports'),
        import('@/lib/cartoon/commands/plan-diff'),
        import('@/lib/cartoon/project-store'),
      ]);
      const svc = ports.getCartoonCommands();
      const ctx = ports.localOwnerContext();
      const projectId = workingPlan.id;

      const base =
        projectRef.current ??
        (await ports.ensureLocalProject({ plan: renderedPlanRef.current, takes: takesRef.current, result: resultRef.current }));
      let revision = base.revision;

      // 1) Commit the draft as a bounded patch against the saved revision.
      const ops = planToPatch(base.plan, workingPlan);
      if (ops.length > 0) {
        setBusyMsg('Saving edits…');
        const applied = await svc.applyPatch(ctx, {
          projectId,
          expectedRevision: revision,
          ops,
          idempotencyKey: newIdempotencyKey(),
          note: 'timeline editor re-roll',
        });
        revision = applied.revision;
      }
      projectRef.current = { workspaceId: ports.LOCAL_WORKSPACE, revision, plan: clonePlan(workingPlan) };

      // 2) Re-voice only lines whose text/voice/speed no longer match their take.
      setBusyMsg('Re-voicing edited lines…');
      setBusyPct(5);
      const voiced = await svc.voiceSynthesize(ctx, { projectId, expectedRevision: revision, idempotencyKey: newIdempotencyKey() });
      revision = voiced.revision;
      projectRef.current = { ...projectRef.current, revision };

      // 3) Render run bound to this revision; partial when the cache allows it.
      setBusyMsg('Re-rendering edited scenes…');
      const ack = await svc.renderStart(ctx, { projectId, expectedRevision: revision, idempotencyKey: newIdempotencyKey() });
      activeRunRef.current = ack.runId;
      let run = await svc.runInspect(ctx, { runId: ack.runId });
      while (!run.terminal) {
        setBusyPct(25 + Math.round(run.progress * 0.75));
        await sleep(300);
        run = await svc.runInspect(ctx, { runId: ack.runId });
      }
      activeRunRef.current = null;
      if (run.state !== 'succeeded') {
        throw new Error(
          run.state === 'cancelled'
            ? 'Re-roll cancelled — your previous render is unchanged.'
            : `Render ${run.state}: ${run.failure?.message ?? 'unknown reason'}`,
        );
      }

      // 4) Read the committed baseline back from the store.
      const loaded = await store.loadProject(ports.LOCAL_WORKSPACE, projectId);
      const rendered = loaded.lastRender;
      if (!rendered || rendered.result.planHash !== run.inputPlanHash) {
        throw new Error('The render finished but its cache was not saved for this revision.');
      }
      const result = rendered.result;
      const partial: PartialRenderReport = {
        mode: run.partial?.mode ?? 'full',
        rerenderedScenes: run.partial?.rerenderedScenes ?? [],
        rerenderedFrameRanges: [],
        reusedScenes: run.partial?.reusedScenes ?? [],
        fullRenderReason: run.partial?.fullRenderReason ?? undefined,
      };
      takesRef.current = loaded.takes;
      resultRef.current = result;
      renderedPlanRef.current = clonePlan(rendered.renderedPlan);
      projectRef.current = { workspaceId: ports.LOCAL_WORKSPACE, revision: loaded.revision, plan: clonePlan(loaded.plan) };
      setRenderedHash(result.planHash);
      setLastReport(partial);
      setBusyPct(100);
      setDirty(new Map());
      recompile();

      const label =
        partial.mode === 'partial'
          ? `Re-rolled ${partial.rerenderedScenes.length} scene${partial.rerenderedScenes.length !== 1 ? 's' : ''}`
          : 'Full re-render';
      await pushSnapshot({
        projectId: workingPlan.id,
        planHash: result.planHash,
        label,
        plan: workingPlan,
      });

      updateSession({
        plan: clonePlan(rendered.renderedPlan),
        takes: takesRef.current,
        result,
        bgAssets: bgAssetsRef.current,
        project: projectRef.current,
      });

      const reused = partial.reusedScenes.length;
      toast({
        variant: 'success',
        title: partial.mode === 'partial' ? 'Scenes re-rolled' : 'Re-rendered',
        description:
          partial.mode === 'partial'
            ? `${partial.rerenderedScenes.length} re-rendered · ${reused} reused untouched.`
            : `Full render: ${partial.fullRenderReason ?? 'timing changed'}.`,
      });
    } catch (err) {
      activeRunRef.current = null;
      const code = (err as { code?: string }).code;
      if (code === 'REVISION_CONFLICT') {
        const msg = 'This project was changed somewhere else (for example by your assistant) since you opened it. Load the latest saved version to continue — your unsaved edits here will be replaced.';
        setConflict(msg);
        toast({ variant: 'error', title: 'Project changed elsewhere', description: 'Load the latest saved version to continue.' });
      } else {
        const msg = err instanceof Error ? err.message : 'Re-roll failed. Please try again.';
        setRerollError(msg);
        toast({ variant: 'error', title: 'Re-roll failed', description: msg });
      }
    } finally {
      setBusy(false);
      setBusyMsg('');
    }
  }, [workingPlan, busy, recompile, pushSnapshot, updateSession, toast]);

  const handleCancelRun = useCallback(async () => {
    const runId = activeRunRef.current;
    if (!runId) return;
    const ports = await import('@/lib/cartoon/commands/browser-ports');
    await ports.getCartoonCommands().runCancel(ports.localOwnerContext(), { runId });
  }, []);

  /** Replace the editor state with the latest saved revision (after a conflict). */
  const handleLoadLatest = useCallback(async () => {
    if (!workingPlan) return;
    try {
      const [ports, store] = await Promise.all([import('@/lib/cartoon/commands/browser-ports'), import('@/lib/cartoon/project-store')]);
      const loaded = await store.loadProject(ports.LOCAL_WORKSPACE, workingPlan.id);
      if (!loaded.lastRender) throw new Error('The saved project has no render yet.');
      takesRef.current = loaded.takes;
      resultRef.current = loaded.lastRender.result;
      renderedPlanRef.current = clonePlan(loaded.lastRender.renderedPlan);
      projectRef.current = { workspaceId: ports.LOCAL_WORKSPACE, revision: loaded.revision, plan: clonePlan(loaded.plan) };
      setRenderedHash(loaded.lastRender.result.planHash);
      setWorkingPlan(clonePlan(loaded.plan));
      setConflict(null);
      updateSession({
        plan: clonePlan(loaded.lastRender.renderedPlan),
        takes: loaded.takes,
        result: loaded.lastRender.result,
        bgAssets: bgAssetsRef.current,
        project: projectRef.current,
      });
      toast({ variant: 'info', title: `Loaded revision ${loaded.revision}`, description: 'You are editing the latest saved version.' });
    } catch (err) {
      setRerollError(err instanceof Error ? err.message : 'Could not load the saved project.');
    }
  }, [workingPlan, updateSession, toast]);

  // ── History ──────────────────────────────────────────────────────────────
  const handleRestore = useCallback((snap: PlanSnapshot) => {
    setWorkingPlan(clonePlan(snap.plan));
    setSelectedSceneId(snap.plan.scenes[0]?.id ?? null);
    setRerollError(null);
    setLastReport(null);
    toast({
      variant: 'info',
      title: `Restored "${snap.label}"`,
      description: 'Loaded as your working draft — re-roll to render it into the MP4.',
    });
  }, [toast]);

  const handleDelete = useCallback((id: string) => void removeSnapshot(id), [removeSnapshot]);

  const handleDownload = useCallback(() => {
    const result = resultRef.current;
    if (!result) return;
    const url = URL.createObjectURL(result.mp4);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(workingPlan?.title || 'cartoon').replace(/[^\w-]+/g, '-')}.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [workingPlan?.title]);

  const selectedScene = useMemo(
    () => workingPlan?.scenes.find((s) => s.id === selectedSceneId) ?? null,
    [workingPlan, selectedSceneId],
  );
  const selectedIndex = useMemo(
    () => workingPlan?.scenes.findIndex((s) => s.id === selectedSceneId) ?? -1,
    [workingPlan, selectedSceneId],
  );

  if (!session || !workingPlan) return null;

  return (
    <div className="flex flex-col h-[calc(100dvh-56px)] bg-white dark:bg-dark">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 md:px-5 py-3 border-b border-border-light dark:border-[#333]">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={closeEditor}
            className="flex items-center gap-1.5 px-3 py-2 min-h-[44px] md:min-h-0 text-sm font-medium text-muted hover:text-text dark:hover:text-white transition-colors"
          >
            <ArrowLeft size={16} /> Back
          </button>
          <div className="min-w-0">
            <h1 className="text-sm md:text-base font-semibold text-text dark:text-white truncate">
              {workingPlan.title} · Timeline
            </h1>
            <p className="text-[11px] text-muted">Edit scenes, scrub the real render, and re-roll only what changed.</p>
          </div>
        </div>
        {/* EU AI Act Art. 50 disclosure at the point the user obtains the media. */}
        <div className="hidden lg:flex items-center gap-3 shrink-0">
          <AiGeneratedBadge />
          <button
            type="button"
            onClick={handleDownload}
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-surface dark:bg-[#2a2a2a] text-text dark:text-white rounded-lg text-sm font-medium hover:bg-border-light dark:hover:bg-[#333] transition-colors active:scale-[0.98]"
          >
            <Download size={15} /> Download MP4
          </button>
        </div>
      </div>

      {/* Small-screen honest deferral (editor is a lg+ surface) */}
      <div className="lg:hidden flex-1 grid place-items-center p-8 text-center">
        <div className="max-w-xs">
          <Monitor size={32} className="mx-auto text-muted mb-3" />
          <p className="text-sm font-medium text-text dark:text-white">Open the timeline editor on a larger screen</p>
          <p className="text-xs text-muted mt-1.5">
            Scrubbing, the scene strip and per-scene re-rolls need at least a small-laptop width. Your render is safe —
            reopen this on a wider screen to keep editing.
          </p>
        </div>
      </div>

      {/* Editor grid (lg+) */}
      <div className="hidden lg:grid flex-1 min-h-0 grid-cols-[1fr_320px] gap-4 p-4 xl:p-5 overflow-hidden">
        {/* Left: preview + scene strip + re-roll */}
        <div className="flex flex-col min-h-0 gap-4 overflow-y-auto pr-1">
          <TimelinePreview
            compiled={compiled}
            width={workingPlan.resolution.width}
            height={workingPlan.resolution.height}
            bgAssets={bgAssetsRef.current}
            seekRequest={seekReq}
            onActiveSceneChange={setActiveSceneId}
            statusNote={!engineReady ? 'Loading engine…' : undefined}
          />

          <SceneStrip
            plan={workingPlan}
            timing={compiled?.timing ?? null}
            selectedSceneId={selectedSceneId}
            activeSceneId={activeSceneId}
            dirty={dirty}
            onSelect={onSelectScene}
          />

          {/* Re-roll control */}
          <div className="bento-card p-4 space-y-3">
            {busy && (
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <ProgressBar percent={busyPct} message={busyMsg || 'Working…'} />
                </div>
                <button
                  type="button"
                  onClick={handleCancelRun}
                  className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[44px] md:min-h-0 text-xs font-medium text-muted hover:text-text dark:hover:text-white transition-colors"
                >
                  <X size={14} /> Cancel
                </button>
              </div>
            )}

            {conflict && (
              <div className="p-3 bg-danger/5 border border-danger/20 rounded-lg space-y-2">
                <div className="flex items-start gap-2">
                  <AlertCircle size={15} className="text-danger mt-0.5 shrink-0" />
                  <p className="text-xs text-danger break-words">{conflict}</p>
                </div>
                <button
                  type="button"
                  onClick={handleLoadLatest}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface dark:bg-[#2a2a2a] text-xs font-medium text-text dark:text-white hover:bg-border-light dark:hover:bg-[#333] transition-colors"
                >
                  <RefreshCw size={13} /> Load latest saved version
                </button>
              </div>
            )}

            {rerollError && (
              <div className="p-3 bg-danger/5 border border-danger/20 rounded-lg flex items-start gap-2">
                <AlertCircle size={15} className="text-danger mt-0.5 shrink-0" />
                <p className="text-xs text-danger break-words">{rerollError}</p>
              </div>
            )}

            {lastReport && !busy && (
              <p className="text-[11px] text-text-muted">
                {lastReport.mode === 'partial'
                  ? `Last re-roll: re-rendered ${lastReport.rerenderedScenes.length}, reused ${lastReport.reusedScenes.length} untouched.`
                  : `Last re-roll: full render — ${lastReport.fullRenderReason ?? 'timing changed'}.`}
              </p>
            )}

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleReroll}
                disabled={busy || dirtyCount === 0}
                className="flex-1 inline-flex items-center justify-center gap-2 py-3 min-h-[44px] bg-gradient-to-r from-primary via-accent to-secondary text-white rounded-xl text-sm font-semibold hover:opacity-90 transition-all active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {busy ? <Loader2 size={17} className="animate-spin" /> : <Wand2 size={17} />}
                {busy
                  ? 'Re-rolling…'
                  : dirtyCount === 0
                    ? 'No edits to re-roll'
                    : `Re-roll ${dirtyCount} edited scene${dirtyCount !== 1 ? 's' : ''}`}
              </button>
            </div>
            <p className="text-[10px] text-text-muted">
              Only edited scenes re-render; untouched scenes keep their encoded frames. Text edits shift timing and
              trigger a full re-render — the engine reports which path it took.
            </p>
          </div>
        </div>

        {/* Right: inspector + history */}
        <div className="flex flex-col min-h-0 gap-4 overflow-y-auto">
          <SceneInspector
            scene={selectedScene}
            sceneIndex={selectedIndex}
            dirtyKind={selectedSceneId ? dirty.get(selectedSceneId) : undefined}
            disabled={busy}
            onChangeText={onChangeText}
            onToggleCaption={onToggleCaption}
            onSetEntrance={onSetEntrance}
            onRerollBackground={onRerollBackground}
          />
          <PlanHistoryPanel
            history={history}
            loading={historyLoading}
            currentPlanHash={renderedHash}
            diffSummaries={diffSummaries}
            busy={busy}
            onRestore={handleRestore}
            onDelete={handleDelete}
          />
        </div>
      </div>
    </div>
  );
}
