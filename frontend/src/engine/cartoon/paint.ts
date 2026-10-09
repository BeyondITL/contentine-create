/**
 * Contentine Create — Cartoon Engine: Stage painter
 *
 * Pure canvas drawing: (compiled stage state at time t) → pixels.
 * Everything here is a deterministic function of its inputs (Law L6) —
 * no Date, no Math.random, no async raciness. Backgrounds without a
 * generated asset are painted procedurally from the plan's seed.
 */

import type { ScenePlanScene } from './scene-plan';
import type { PlanTiming, DialogueWindow, SceneWindow } from './timing';
import type { CompiledStage } from './timeline-compiler';

export type Ctx2D = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

// ─── Seeded PRNG (mulberry32) — deterministic procedural backgrounds ─────────

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Flat-style procedural background: sky band, sun, rolling hills, ground. */
export function paintProceduralBackground(ctx: Ctx2D, width: number, height: number, seed: number): void {
  const rand = mulberry32(seed);

  // Sky — hue picked from the seed, dark-to-light vertical gradient.
  const hue = Math.floor(rand() * 360);
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, `hsl(${hue}, 45%, 22%)`);
  sky.addColorStop(1, `hsl(${hue}, 55%, 48%)`);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  // Sun / moon disc.
  const sunX = width * (0.15 + rand() * 0.7);
  const sunY = height * (0.12 + rand() * 0.2);
  const sunR = height * (0.05 + rand() * 0.04);
  ctx.fillStyle = `hsl(${(hue + 40) % 360}, 80%, 78%)`;
  ctx.beginPath();
  ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
  ctx.fill();

  // Two layers of rolling hills.
  for (let layer = 0; layer < 2; layer++) {
    const baseY = height * (0.62 + layer * 0.12);
    const light = 30 - layer * 8;
    ctx.fillStyle = `hsl(${(hue + 140) % 360}, 35%, ${light}%)`;
    ctx.beginPath();
    ctx.moveTo(0, height);
    ctx.lineTo(0, baseY);
    const bumps = 3 + Math.floor(rand() * 3);
    for (let b = 0; b <= bumps; b++) {
      const bx = (width / bumps) * b;
      const by = baseY - height * (0.03 + rand() * 0.08);
      ctx.quadraticCurveTo(bx - width / bumps / 2, by, bx, baseY);
    }
    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.fill();
  }

  // Ground strip the characters stand on.
  ctx.fillStyle = `hsl(${(hue + 140) % 360}, 30%, 16%)`;
  ctx.fillRect(0, height * 0.86, width, height * 0.14);
}

// ─── Captions ────────────────────────────────────────────────────────────────

function paintCaption(ctx: Ctx2D, width: number, height: number, text: string, style: string): void {
  const fontSize = Math.round(height * 0.042);
  ctx.font = `600 ${fontSize}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const metrics = ctx.measureText(text);
  const padX = fontSize * 0.9;
  const padY = fontSize * 0.55;
  const barW = Math.min(width * 0.92, metrics.width + padX * 2);
  const barH = fontSize + padY * 2;
  const cx = width / 2;
  const cy = height * (style === 'top-bar' ? 0.08 : 0.92);

  ctx.fillStyle = 'rgba(10, 16, 24, 0.78)';
  ctx.beginPath();
  const r = barH / 2;
  ctx.roundRect(cx - barW / 2, cy - barH / 2, barW, barH, r);
  ctx.fill();

  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(text, cx, cy + fontSize * 0.04);
}

// ─── Frame painter ───────────────────────────────────────────────────────────

export interface PaintAssets {
  /** Content-addressed decoded background images, keyed by assetRef. */
  backgrounds: Map<string, ImageBitmap>;
}

function activeWindow<T extends { start: number; end: number }>(windows: T[], t: number): T | undefined {
  for (const w of windows) if (t >= w.start && t < w.end) return w;
  return undefined;
}

/**
 * Paint the frame at absolute time `t`. The GSAP timeline must already be
 * seeked to `t`; this reads the tweened pose objects out of `stage`.
 */
export function paintFrame(
  ctx: Ctx2D,
  width: number,
  height: number,
  stage: CompiledStage,
  timing: PlanTiming,
  assets: PaintAssets,
  t: number,
): void {
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, width, height);

  const sceneWindow: SceneWindow | undefined =
    activeWindow(timing.scenes, t) ?? (t >= timing.totalDuration ? timing.scenes[timing.scenes.length - 1] : undefined);
  if (!sceneWindow) return;

  const runtime = stage.scenes.get(sceneWindow.sceneId);
  if (!runtime) return;
  const scene: ScenePlanScene = runtime.scene;

  // Background — generated asset when present, procedural otherwise.
  const asset = scene.background.assetRef ? assets.backgrounds.get(scene.background.assetRef) : undefined;
  if (asset) {
    ctx.drawImage(asset, 0, 0, width, height);
  } else {
    paintProceduralBackground(ctx, width, height, scene.background.seed);
  }

  // Characters, in plan order (later = closer to camera).
  for (const char of runtime.characters) {
    if (char.pose.opacity <= 0) continue;
    char.rig.draw(ctx, char.pose, char.palette, char.heightPx);
  }

  // Captions track the active dialogue line.
  if (scene.captions.enabled) {
    const line: DialogueWindow | undefined = activeWindow(timing.dialogue, t);
    if (line && line.sceneId === scene.id) {
      paintCaption(ctx, width, height, line.text, scene.captions.style);
    }
  }
}
