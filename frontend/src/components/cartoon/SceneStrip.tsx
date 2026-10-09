'use client';

import { Pencil, RefreshCw } from 'lucide-react';
import type { ScenePlan, PlanTiming } from '@/engine/cartoon';

/**
 * Horizontal scene strip for the timeline editor. Cell widths are proportional
 * to each scene's REAL compiled duration (from `PlanTiming.scenes`), so the
 * strip is a faithful map of the timeline, not a cosmetic list. Selecting a
 * cell seeks the preview to that scene's start.
 *
 * Two edit states are surfaced honestly:
 *   - "voice"  — dialogue text changed; the scene must be re-voiced + re-rolled
 *                before the preview/MP4 reflects it (its take is stale).
 *   - "visual" — a caption / background / entrance change already shown live in
 *                the preview, awaiting an MP4 re-roll to bake it into the file.
 */

export type SceneDirtyKind = 'voice' | 'visual';

interface SceneStripProps {
  plan: ScenePlan;
  timing: PlanTiming | null;
  selectedSceneId: string | null;
  activeSceneId: string | null;
  /** sceneId → why it's dirty vs the last rendered MP4. */
  dirty: Map<string, SceneDirtyKind>;
  onSelect: (sceneId: string) => void;
}

export default function SceneStrip({
  plan,
  timing,
  selectedSceneId,
  activeSceneId,
  dirty,
  onSelect,
}: SceneStripProps) {
  const durationOf = (sceneId: string): number =>
    timing?.scenes.find((s) => s.sceneId === sceneId)?.duration ?? 0;

  return (
    <div className="bento-card p-3">
      <div className="flex items-center justify-between mb-2 px-1">
        <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wide">Scenes</span>
        {timing && (
          <span className="text-[11px] text-text-muted tabular-nums">
            {plan.scenes.length} · {timing.totalDuration.toFixed(1)}s
          </span>
        )}
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1" role="list" aria-label="Scene strip">
        {plan.scenes.map((scene, i) => {
          const dur = durationOf(scene.id);
          const isSelected = scene.id === selectedSceneId;
          const isActive = scene.id === activeSceneId;
          const kind = dirty.get(scene.id);
          const text = scene.dialogue[0]?.text ?? '';
          // Weight the width by duration so the strip mirrors the timeline.
          const grow = Math.max(1, Math.round(dur * 10));

          return (
            <button
              key={scene.id}
              type="button"
              role="listitem"
              onClick={() => onSelect(scene.id)}
              style={{ flexGrow: grow, flexBasis: 0 }}
              className={`
                relative shrink-0 min-w-[104px] min-h-[64px] text-left rounded-lg border p-2.5 transition-all active:scale-[0.99]
                ${isSelected
                  ? 'border-primary bg-primary/[0.08] ring-1 ring-primary'
                  : 'border-white/10 bg-surface dark:bg-[#242424] hover:border-white/20'}
              `}
              aria-current={isSelected ? 'true' : undefined}
              aria-label={`Scene ${i + 1}, ${dur.toFixed(1)} seconds${kind ? ', edited' : ''}`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-[11px] font-semibold text-text dark:text-white">Scene {i + 1}</span>
                <span className="text-[10px] tabular-nums text-text-muted">{dur.toFixed(1)}s</span>
              </div>
              <p className="mt-1 text-[10px] leading-snug text-text-muted line-clamp-2 break-words">
                {text || <span className="italic opacity-60">No narration</span>}
              </p>

              {/* Playhead marker */}
              {isActive && (
                <span
                  className="absolute left-0 top-0 h-full w-0.5 bg-[#00C3FF] rounded-l-lg"
                  aria-hidden
                />
              )}

              {/* Dirty badge */}
              {kind && (
                <span
                  className={`absolute top-1.5 right-1.5 inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[9px] font-medium ${
                    kind === 'voice' ? 'bg-accent/15 text-accent' : 'bg-secondary/15 text-secondary'
                  }`}
                  title={kind === 'voice' ? 'Text changed — re-roll to re-voice' : 'Visual edit — re-roll to bake into MP4'}
                >
                  {kind === 'voice' ? <RefreshCw size={9} /> : <Pencil size={9} />}
                  {kind === 'voice' ? 'voice' : 'edit'}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
