'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Play, Pause, SkipBack } from 'lucide-react';
import type { CompiledTimeline } from '@/engine/cartoon';

/**
 * Deterministic scrub preview for the cartoon timeline editor.
 *
 * The preview is NOT a separate render path — it runs the EXACT inner loop of
 * the export worker (`render-worker.ts`): `seekTimeline(compiled, t)` then
 * `paintFrame(ctx, …, t)` onto a 2-D canvas. The engine's painter accepts a
 * main-thread `CanvasRenderingContext2D`, so a scrubbed preview frame is the
 * same pixels the exported MP4 carries at that frame (Law L6 — preview ==
 * export). Scrubbing snaps to whole frames so the readout is a real frame.
 *
 * Audio is not mixed in the preview (it needs the offline audio pass) — the
 * preview is silent by design; the rendered MP4 carries the mixed audio. This
 * is stated honestly in the UI, not faked (Law L1).
 *
 * `paintFrame` is not on the engine's public barrel (`engine/cartoon/index.ts`)
 * — it is consumed here via a deep dynamic import (read-only; no engine edit;
 * Law L8-safe). Flagged to WS-2 to promote to the barrel.
 */

type PaintFrameFn = typeof import('@/engine/cartoon/paint')['paintFrame'];
type SeekFn = typeof import('@/engine/cartoon')['seekTimeline'];

interface TimelinePreviewProps {
  /** Compiled timeline for the current plan+takes, or null while (re)compiling. */
  compiled: CompiledTimeline | null;
  /** Plan output resolution — the canvas renders at these pixels (export parity). */
  width: number;
  height: number;
  /** Decoded background images keyed by assetRef (empty for procedural backgrounds). */
  bgAssets: Map<string, ImageBitmap>;
  /** Imperative seek from the parent (e.g. clicking a scene). */
  seekRequest?: { t: number; nonce: number } | null;
  /** Fires only when the active scene under the playhead changes (low churn). */
  onActiveSceneChange?: (sceneId: string | null, t: number) => void;
  /** Human note under the transport (e.g. compile status). */
  statusNote?: string;
}

function fmtTime(t: number, fps: number): string {
  const safe = Math.max(0, t);
  const totalFrames = Math.round(safe * fps);
  const frames = totalFrames % fps;
  const secs = Math.floor(safe) % 60;
  const mins = Math.floor(safe / 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}:${String(frames).padStart(2, '0')}`;
}

function activeSceneId(compiled: CompiledTimeline, t: number): string | null {
  const { scenes, totalDuration } = compiled.timing;
  for (const s of scenes) if (t >= s.start && t < s.end) return s.sceneId;
  if (t >= totalDuration && scenes.length) return scenes[scenes.length - 1].sceneId;
  return scenes.length ? scenes[0].sceneId : null;
}

export default function TimelinePreview({
  compiled,
  width,
  height,
  bgAssets,
  seekRequest,
  onActiveSceneChange,
  statusNote,
}: TimelinePreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const paintFrameRef = useRef<PaintFrameFn | null>(null);
  const seekRef = useRef<SeekFn | null>(null);
  const [enginesReady, setEnginesReady] = useState(false);

  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const rafRef = useRef<number | null>(null);
  const playAnchorRef = useRef<{ wall: number; t: number } | null>(null);
  const lastSceneRef = useRef<string | null>(null);

  const duration = compiled?.timing.totalDuration ?? 0;
  const fps = compiled?.timing.fps ?? 30;

  // Load the paint + seek functions once (deep import for the un-barrelled painter).
  useEffect(() => {
    let alive = true;
    (async () => {
      const [engine, paint] = await Promise.all([
        import('@/engine/cartoon'),
        import('@/engine/cartoon/paint'),
      ]);
      if (!alive) return;
      seekRef.current = engine.seekTimeline;
      paintFrameRef.current = paint.paintFrame;
      setEnginesReady(true);
    })().catch(() => {
      /* import failure surfaces as a blank canvas + the parent's error path */
    });
    return () => {
      alive = false;
    };
  }, []);

  // Paint the frame at absolute time `t` — the export loop, one frame.
  const paintAt = useCallback(
    (t: number) => {
      const canvas = canvasRef.current;
      const paintFrame = paintFrameRef.current;
      const seek = seekRef.current;
      if (!canvas || !compiled || !paintFrame || !seek) return;
      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) return;
      const w = canvas.width;
      const h = canvas.height;
      // Snap to a whole frame so the preview shows a real rendered frame.
      const snapped = Math.min(Math.max(0, Math.round(t * fps) / fps), Math.max(0, duration - 1e-6));
      seek(compiled, snapped);
      paintFrame(ctx, w, h, compiled.stage, compiled.timing, { backgrounds: bgAssets }, snapped);

      const scene = activeSceneId(compiled, snapped);
      if (scene !== lastSceneRef.current) {
        lastSceneRef.current = scene;
        onActiveSceneChange?.(scene, snapped);
      }
    },
    [compiled, bgAssets, fps, duration, onActiveSceneChange],
  );

  // Repaint whenever the compiled timeline, playhead, or engines change.
  useEffect(() => {
    if (enginesReady) paintAt(time);
  }, [enginesReady, compiled, time, paintAt]);

  // Keep the playhead in range across recompiles (edits) rather than snapping
  // back to 0 — a caption toggle or a keystroke shouldn't lose your position.
  useEffect(() => {
    lastSceneRef.current = null;
    setTime((t) => Math.min(t, Math.max(0, duration - 1e-6)));
  }, [compiled, duration]);

  // Imperative seek from the parent (scene selection).
  useEffect(() => {
    if (!seekRequest) return;
    setPlaying(false);
    setTime(Math.min(Math.max(0, seekRequest.t), Math.max(0, duration - 1e-6)));
  }, [seekRequest, duration]);

  // Playback: advance the playhead by real elapsed time, snapped to frames.
  useEffect(() => {
    if (!playing || !compiled) return;
    playAnchorRef.current = { wall: performance.now(), t: time >= duration ? 0 : time };

    const step = () => {
      const anchor = playAnchorRef.current;
      if (!anchor) return;
      const elapsed = (performance.now() - anchor.wall) / 1000;
      const next = anchor.t + elapsed;
      if (next >= duration) {
        setTime(duration);
        setPlaying(false);
        return;
      }
      setTime(next);
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // `time` intentionally omitted — the anchor captures the start; including it
    // would restart the loop every frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, compiled, duration]);

  const onScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPlaying(false);
    setTime(parseFloat(e.target.value));
  };

  const canPlay = !!compiled && duration > 0;

  return (
    <div className="bento-card p-0 overflow-hidden">
      {/* Canvas stage */}
      <div className="relative bg-black flex items-center justify-center min-h-[220px]">
        {compiled ? (
          <canvas
            ref={canvasRef}
            width={width}
            height={height}
            className="max-w-full max-h-[52vh] w-auto h-auto block"
            aria-label="Cartoon timeline preview frame"
          />
        ) : (
          <div className="py-16 text-center text-xs text-text-muted">
            {statusNote ?? 'Building preview…'}
          </div>
        )}
      </div>

      {/* Transport */}
      <div className="px-4 py-3 border-t border-white/10 space-y-2">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setTime(0)}
            disabled={!canPlay}
            className="w-10 h-10 md:w-9 md:h-9 shrink-0 grid place-items-center rounded-lg bg-surface dark:bg-[#2a2a2a] text-text dark:text-white hover:bg-border-light dark:hover:bg-[#333] transition-colors disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
            aria-label="Jump to start"
          >
            <SkipBack size={16} />
          </button>
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            disabled={!canPlay}
            className="w-11 h-11 md:w-10 md:h-10 shrink-0 grid place-items-center rounded-lg bg-primary text-white hover:bg-primary-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
            aria-label={playing ? 'Pause preview' : 'Play preview'}
          >
            {playing ? <Pause size={18} /> : <Play size={18} />}
          </button>

          <input
            type="range"
            min={0}
            max={Math.max(0.001, duration)}
            step={1 / fps}
            value={Math.min(time, duration)}
            onChange={onScrub}
            disabled={!canPlay}
            className="flex-1 h-2 accent-[#00C3FF] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Scrub timeline"
          />

          <span className="shrink-0 tabular-nums text-[11px] text-text-muted font-medium min-w-[92px] text-right">
            {fmtTime(time, fps)} / {fmtTime(duration, fps)}
          </span>
        </div>

        <p className="text-[10px] text-text-muted">
          Silent preview — scrub to inspect motion, mouth timing and captions frame-by-frame.
          This is the exact frame the exported MP4 carries; audio is mixed into the download.
          {statusNote ? ` · ${statusNote}` : ''}
        </p>
      </div>
    </div>
  );
}
