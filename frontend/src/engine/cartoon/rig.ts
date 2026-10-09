/**
 * Contentine Create — Cartoon Engine: Rig format + tracer reference rig
 *
 * A rig is a puppet: a mutable numeric pose (which GSAP tweens), a
 * deterministic canvas draw function (pose → pixels), and a gesture
 * library (named functions that add tweens to a timeline).
 *
 * `tracer-stick` is the ORIGINAL built-in shape character used for the
 * C-M1 tracer bullet. Real character packs arrive from WS-3 in the same
 * format. No show/IP references anywhere (Law L4 originality rule).
 */

import type { VisemeId } from './visemes';

// ─── Pose (the tween target) ─────────────────────────────────────────────────

export interface RigPose {
  /** Feet-center position in canvas pixels. */
  x: number;
  y: number;
  /** Multiplier on the character's base scale (entrance pops etc.). 1 = natural. */
  scaleMul: number;
  /** Whole-body rotation, degrees. */
  rotation: number;
  opacity: number;
  /** 1 faces right, -1 faces left. */
  facing: number;
  /** Head tilt, degrees (positive nods forward). */
  headTilt: number;
  /** Arm swing from rest, degrees (positive raises away from body). */
  armL: number;
  armR: number;
  /** Leg swing for walk cycles, degrees. */
  legL: number;
  legR: number;
  /** Vertical body bob in rig units (breathing/talking life). */
  bob: number;
  /** Squash-and-stretch factor, 1 = none. */
  squash: number;
  /** Current mouth shape. */
  mouth: VisemeId;
  /** 0 = eyes open, 1 = eyes closed. */
  blink: number;
}

/** A fresh rest pose. */
export function createRestPose(): RigPose {
  return {
    x: 0, y: 0, scaleMul: 1, rotation: 0, opacity: 1, facing: 1,
    headTilt: 0, armL: 0, armR: 0, legL: 0, legR: 0,
    bob: 0, squash: 1, mouth: 'sil', blink: 0,
  };
}

// ─── Gesture + rig contracts ─────────────────────────────────────────────────

/**
 * Minimal timeline surface a gesture needs. `gsap.core.Timeline` satisfies
 * this structurally, so rigs stay free of a hard GSAP dependency.
 */
export interface GestureTimeline {
  to(target: object, vars: Record<string, unknown>, position?: number | string): unknown;
  set(target: object, vars: Record<string, unknown>, position?: number | string): unknown;
}

/** Adds the tweens for one gesture occurrence. `at` is absolute timeline seconds. */
export type GestureFn = (tl: GestureTimeline, pose: RigPose, at: number, duration: number) => void;

export interface RigDefinition {
  id: string;
  name: string;
  /** Law L4: every shipped rig is an original Contentine asset. */
  license: 'original';
  /** Character height as a fraction of stage height at scale 1. */
  baseHeightFrac: number;
  defaultPalette: Record<string, string>;
  gestures: Record<string, { defaultDuration: number; apply: GestureFn }>;
  /**
   * Paint the character for the given pose. Must be a pure function of its
   * arguments (Law L6) — no randomness, no time, no external state.
   * `heightPx` is the character's height in canvas pixels.
   */
  draw(
    ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
    pose: RigPose,
    palette: Record<string, string>,
    heightPx: number,
  ): void;
}

// ─── Mouth-shape table (viseme → geometry) ───────────────────────────────────

interface MouthShape {
  /** Width/height as fractions of head radius. */
  w: number;
  h: number;
  /** 0 = flat line, 1 = full ellipse. */
  open: number;
  /** Draw upper teeth bar. */
  teeth?: boolean;
  /** Draw tongue arc. */
  tongue?: boolean;
}

const MOUTH_SHAPES: Record<VisemeId, MouthShape> = {
  sil: { w: 0.55, h: 0.06, open: 0 },
  PP:  { w: 0.45, h: 0.08, open: 0 },
  FF:  { w: 0.60, h: 0.22, open: 0.6, teeth: true },
  TH:  { w: 0.55, h: 0.30, open: 0.8, tongue: true },
  DD:  { w: 0.50, h: 0.35, open: 0.9, teeth: true },
  kk:  { w: 0.45, h: 0.40, open: 1 },
  CH:  { w: 0.50, h: 0.30, open: 0.9 },
  SS:  { w: 0.60, h: 0.18, open: 0.7, teeth: true },
  nn:  { w: 0.50, h: 0.25, open: 0.8 },
  RR:  { w: 0.45, h: 0.35, open: 0.9 },
  aa:  { w: 0.60, h: 0.62, open: 1 },
  E:   { w: 0.70, h: 0.35, open: 1, teeth: true },
  I:   { w: 0.65, h: 0.25, open: 0.9, teeth: true },
  O:   { w: 0.42, h: 0.55, open: 1 },
  U:   { w: 0.30, h: 0.38, open: 1 },
};

// ─── The tracer reference rig ────────────────────────────────────────────────

const TRACER_PALETTE = {
  body: '#00C3FF',
  head: '#FFE3C4',
  limb: '#1B2A3A',
  accent: '#F3A6FF',
  outline: '#12202E',
  mouth: '#7A2E3B',
};

function deg(d: number): number {
  return (d * Math.PI) / 180;
}

/** Draw one limb as a two-segment stroke from a shoulder/hip point. */
function drawLimb(
  ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
  x0: number, y0: number, len: number, angleDeg: number, bendDeg: number,
  width: number, color: string,
): { x: number; y: number } {
  const a1 = deg(angleDeg);
  const midX = x0 + Math.sin(a1) * len * 0.5;
  const midY = y0 + Math.cos(a1) * len * 0.5;
  const a2 = deg(angleDeg + bendDeg);
  const endX = midX + Math.sin(a2) * len * 0.5;
  const endY = midY + Math.cos(a2) * len * 0.5;

  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(midX, midY);
  ctx.lineTo(endX, endY);
  ctx.stroke();
  return { x: endX, y: endY };
}

function drawTracerStick(
  ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
  pose: RigPose,
  palette: Record<string, string>,
  heightPx: number,
): void {
  const P = { ...TRACER_PALETTE, ...palette };
  const H = heightPx * pose.scaleMul;
  const headR = H * 0.16;
  const bodyLen = H * 0.34;
  const legLen = H * 0.30;
  const armLen = H * 0.26;
  const limbW = H * 0.045;

  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, pose.opacity));
  // Feet anchor; squash scales vertically around the feet.
  ctx.translate(pose.x, pose.y);
  ctx.rotate(deg(pose.rotation));
  ctx.scale(pose.facing * (2 - pose.squash), pose.squash);
  ctx.translate(0, pose.bob * (H / 100));

  const hipY = -legLen;
  const shoulderY = hipY - bodyLen;

  // Legs (walk swing; drawLimb angle 0 = straight down).
  drawLimb(ctx, 0, hipY, legLen, pose.legL, -pose.legL * 0.5, limbW, P.limb);
  drawLimb(ctx, 0, hipY, legLen, pose.legR, -pose.legR * 0.5, limbW, P.limb);

  // Body capsule.
  ctx.strokeStyle = P.body;
  ctx.lineWidth = H * 0.11;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, hipY);
  ctx.lineTo(0, shoulderY);
  ctx.stroke();

  // Accent scarf knot at the neck.
  ctx.fillStyle = P.accent;
  ctx.beginPath();
  ctx.arc(0, shoulderY + H * 0.02, H * 0.035, 0, Math.PI * 2);
  ctx.fill();

  // Arms — rest hangs down slightly outward; gestures swing them up/out.
  const handL = drawLimb(ctx, 0, shoulderY, armLen, 20 + pose.armL, 12, limbW, P.limb);
  const handR = drawLimb(ctx, 0, shoulderY, armLen, -(20 + pose.armR), -12, limbW, P.limb);
  ctx.fillStyle = P.head;
  for (const hand of [handL, handR]) {
    ctx.beginPath();
    ctx.arc(hand.x, hand.y, H * 0.032, 0, Math.PI * 2);
    ctx.fill();
  }

  // Head (tilt pivots at the neck).
  ctx.save();
  ctx.translate(0, shoulderY);
  ctx.rotate(deg(pose.headTilt));
  ctx.translate(0, -headR * 1.15);

  ctx.fillStyle = P.head;
  ctx.strokeStyle = P.outline;
  ctx.lineWidth = H * 0.015;
  ctx.beginPath();
  ctx.arc(0, 0, headR, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Eyes — blink closes them into lines.
  const eyeY = -headR * 0.15;
  const eyeDX = headR * 0.38;
  const eyeR = headR * 0.10;
  ctx.fillStyle = P.outline;
  for (const side of [-1, 1]) {
    const openness = 1 - pose.blink;
    if (openness > 0.15) {
      ctx.beginPath();
      ctx.ellipse(side * eyeDX + headR * 0.12, eyeY, eyeR, eyeR * openness, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.strokeStyle = P.outline;
      ctx.lineWidth = H * 0.012;
      ctx.beginPath();
      ctx.moveTo(side * eyeDX + headR * 0.12 - eyeR, eyeY);
      ctx.lineTo(side * eyeDX + headR * 0.12 + eyeR, eyeY);
      ctx.stroke();
    }
  }

  // Mouth — viseme-keyed shape swap.
  const shape = MOUTH_SHAPES[pose.mouth] ?? MOUTH_SHAPES.sil;
  const mouthY = headR * 0.45;
  const mouthX = headR * 0.15;
  const mw = shape.w * headR;
  const mh = Math.max(shape.h * headR, headR * 0.04);
  if (shape.open === 0) {
    ctx.strokeStyle = P.outline;
    ctx.lineWidth = H * 0.014;
    ctx.beginPath();
    ctx.moveTo(mouthX - mw / 2, mouthY);
    ctx.quadraticCurveTo(mouthX, mouthY + mh * 2, mouthX + mw / 2, mouthY);
    ctx.stroke();
  } else {
    ctx.fillStyle = P.mouth;
    ctx.beginPath();
    ctx.ellipse(mouthX, mouthY, mw / 2, mh / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    if (shape.teeth) {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(mouthX - mw * 0.35, mouthY - mh * 0.45, mw * 0.7, mh * 0.28);
    }
    if (shape.tongue) {
      ctx.fillStyle = '#C96A72';
      ctx.beginPath();
      ctx.ellipse(mouthX, mouthY + mh * 0.22, mw * 0.3, mh * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore(); // head

  ctx.restore();
}

export const TRACER_STICK_RIG: RigDefinition = {
  id: 'tracer-stick',
  name: 'Tracer Stick (reference)',
  license: 'original',
  baseHeightFrac: 0.42,
  defaultPalette: TRACER_PALETTE,
  draw: drawTracerStick,
  gestures: {
    wave: {
      defaultDuration: 1.2,
      apply: (tl, pose, at, duration) => {
        const up = duration * 0.25;
        const wiggles = 3;
        const wiggleDur = (duration - up * 2) / wiggles;
        tl.to(pose, { armR: 150, duration: up, ease: 'power2.out' }, at);
        for (let i = 0; i < wiggles; i++) {
          tl.to(pose, { armR: i % 2 === 0 ? 120 : 150, duration: wiggleDur, ease: 'sine.inOut' }, at + up + i * wiggleDur);
        }
        tl.to(pose, { armR: 0, duration: up, ease: 'power2.in' }, at + duration - up);
      },
    },
    nod: {
      defaultDuration: 0.8,
      apply: (tl, pose, at, duration) => {
        const q = duration / 4;
        tl.to(pose, { headTilt: 14, duration: q, ease: 'sine.inOut' }, at);
        tl.to(pose, { headTilt: -4, duration: q, ease: 'sine.inOut' }, at + q);
        tl.to(pose, { headTilt: 10, duration: q, ease: 'sine.inOut' }, at + q * 2);
        tl.to(pose, { headTilt: 0, duration: q, ease: 'sine.inOut' }, at + q * 3);
      },
    },
    point: {
      defaultDuration: 1.4,
      apply: (tl, pose, at, duration) => {
        const move = Math.min(0.35, duration * 0.25);
        tl.to(pose, { armR: 95, duration: move, ease: 'back.out(1.6)' }, at);
        tl.to(pose, { armR: 0, duration: move, ease: 'power2.in' }, at + duration - move);
      },
    },
    jump: {
      defaultDuration: 0.9,
      apply: (tl, pose, at, duration) => {
        const third = duration / 3;
        tl.to(pose, { squash: 0.85, duration: third * 0.6, ease: 'power2.in' }, at);
        tl.to(pose, { bob: -22, squash: 1.08, duration: third, ease: 'power2.out' }, at + third * 0.6);
        tl.to(pose, { bob: 0, squash: 1, duration: third * 1.4, ease: 'bounce.out' }, at + third * 1.6);
      },
    },
    shrug: {
      defaultDuration: 1.1,
      apply: (tl, pose, at, duration) => {
        const half = duration / 2;
        tl.to(pose, { armL: 55, armR: 55, headTilt: -8, duration: half, ease: 'sine.out' }, at);
        tl.to(pose, { armL: 0, armR: 0, headTilt: 0, duration: half, ease: 'sine.in' }, at + half);
      },
    },
  },
};

// ─── WS-3 style-pack rigs (R4, D2) ───────────────────────────────────────────
//
// Every pack below is an ORIGINAL Contentine asset (Law L4) — no show/IP
// reference in any name, face, palette, or comment. All draw() functions are
// pure (Law L6): no randomness, no time, no external state.
//
// The RigPose interface and the MOUTH_SHAPES table are rig-agnostic, so each
// pack drives the SAME pose fields — gestures and the full 15-viseme set stay
// portable across packs. A pack's identity is its draw() silhouette + palette;
// motion is shared by design (see SHARED_GESTURES). The scene-plan-builder
// triggers `wave` + `nod`, so every pack MUST expose at least those two, and a
// missing gesture throws in the timeline compiler — hence all packs ship the
// full library.
//
// Scoping honesty (task note): the engine paints a character puppet + a
// procedural background + captions per frame. It does NOT animate word-by-word
// typography, nor draw a self-revealing marker hand. So "Kinetic Type" ships as
// a bold typographic MASCOT rig and "Whiteboard" as a marker LINE-ART rig —
// each scoped to what the renderer does today. No new engine features added.

/** The gesture library is pose-based, so all packs reuse the proven tracer set. */
const SHARED_GESTURES = TRACER_STICK_RIG.gestures;

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/** Deterministic rounded-rect path (arcTo — no roundRect dependency). Calls beginPath. */
function pathRoundRect(
  ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
): void {
  const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Shared eye pair with blink. `mode` picks filled dots (solid) or line (marker). */
function drawEyes(
  ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
  cx: number, cy: number, spacing: number, r: number,
  blink: number, color: string, mode: 'fill' | 'line',
): void {
  const openness = 1 - blink;
  ctx.lineCap = 'round';
  for (const side of [-1, 1]) {
    const x = cx + side * spacing;
    if (openness > 0.15) {
      if (mode === 'line') {
        ctx.strokeStyle = color;
        ctx.lineWidth = r * 0.5;
        ctx.beginPath();
        ctx.ellipse(x, cy, r, r * openness, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.ellipse(x, cy, r, r * openness, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      ctx.strokeStyle = color;
      ctx.lineWidth = r * 0.4;
      ctx.beginPath();
      ctx.moveTo(x - r, cy);
      ctx.lineTo(x + r, cy);
      ctx.stroke();
    }
  }
}

interface MouthColors { line: string; fill: string; teeth: string; tongue: string; }

/**
 * Shared viseme mouth. Covers all 15 VisemeIds via the MOUTH_SHAPES table, so
 * every pack renders the full set identically-timed (Law L6). `mode` = 'fill'
 * for solid characters, 'line' for the marker line-art pack.
 */
function drawVisemeMouth(
  ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
  cx: number, cy: number, headR: number, viseme: VisemeId,
  mode: 'fill' | 'line', colors: MouthColors,
): void {
  const shape = MOUTH_SHAPES[viseme] ?? MOUTH_SHAPES.sil;
  const mw = shape.w * headR;
  const mh = Math.max(shape.h * headR, headR * 0.05);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  if (shape.open === 0) {
    ctx.strokeStyle = colors.line;
    ctx.lineWidth = headR * 0.09;
    ctx.beginPath();
    ctx.moveTo(cx - mw / 2, cy);
    ctx.quadraticCurveTo(cx, cy + mh * 2, cx + mw / 2, cy);
    ctx.stroke();
    return;
  }

  if (mode === 'line') {
    ctx.strokeStyle = colors.line;
    ctx.lineWidth = headR * 0.08;
    ctx.beginPath();
    ctx.ellipse(cx, cy, mw / 2, mh / 2, 0, 0, Math.PI * 2);
    ctx.stroke();
    if (shape.teeth) {
      ctx.beginPath();
      ctx.moveTo(cx - mw * 0.32, cy - mh * 0.1);
      ctx.lineTo(cx + mw * 0.32, cy - mh * 0.1);
      ctx.stroke();
    }
    return;
  }

  ctx.fillStyle = colors.fill;
  ctx.beginPath();
  ctx.ellipse(cx, cy, mw / 2, mh / 2, 0, 0, Math.PI * 2);
  ctx.fill();
  if (shape.teeth) {
    ctx.fillStyle = colors.teeth;
    ctx.fillRect(cx - mw * 0.35, cy - mh * 0.45, mw * 0.7, mh * 0.28);
  }
  if (shape.tongue) {
    ctx.fillStyle = colors.tongue;
    ctx.beginPath();
    ctx.ellipse(cx, cy + mh * 0.22, mw * 0.3, mh * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Apply the shared feet-anchored body transform (matches the tracer convention). */
function applyBodyTransform(
  ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
  pose: RigPose, H: number,
): void {
  ctx.globalAlpha = clamp01(pose.opacity);
  ctx.translate(pose.x, pose.y);
  ctx.rotate(deg(pose.rotation));
  ctx.scale(pose.facing * (2 - pose.squash), pose.squash);
  ctx.translate(0, pose.bob * (H / 100));
}

// ── Pack 2: Flat Explainer → rig `flat-presenter` ────────────────────────────
// A clean flat-design presenter: rounded-rect torso + sleeves, mitten hands,
// solid head with a hair cap. The explainer-video staple, drawn original.

const FLAT_PALETTE: Record<string, string> = {
  body: '#2FB3C9', head: '#F1C9A5', hair: '#33272A', limb: '#2A3A4A',
  hand: '#F1C9A5', accent: '#35C838', mouth: '#7A2E3B', eye: '#1B2430',
  teeth: '#FFFFFF', tongue: '#C96A72',
};

function drawFlatPresenter(
  ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
  pose: RigPose, palette: Record<string, string>, heightPx: number,
): void {
  const P = { ...FLAT_PALETTE, ...palette };
  const H = heightPx * pose.scaleMul;
  const headR = H * 0.15;
  const bodyW = H * 0.24, bodyH = H * 0.30;
  const legH = H * 0.26, legW = H * 0.078;
  const armLen = H * 0.24, armW = H * 0.072;

  ctx.save();
  applyBodyTransform(ctx, pose, H);
  const hipY = -legH;
  const shoulderY = hipY - bodyH;

  // Trouser legs (swing with legL/legR for the walk-in entrance).
  for (const [swing, sign] of [[pose.legL, -1], [pose.legR, 1]] as const) {
    ctx.save();
    ctx.translate(sign * bodyW * 0.22, hipY);
    ctx.rotate(deg(swing));
    ctx.fillStyle = P.limb;
    pathRoundRect(ctx, -legW / 2, 0, legW, legH, legW * 0.4);
    ctx.fill();
    ctx.fillStyle = P.eye;
    pathRoundRect(ctx, -legW / 2, legH - legW * 0.35, legW * 1.3, legW * 0.5, legW * 0.25);
    ctx.fill();
    ctx.restore();
  }

  // Sleeves + mitten hands (swing with armL/armR; pivot at the shoulders).
  for (const [swing, sign] of [[pose.armL, -1], [pose.armR, 1]] as const) {
    ctx.save();
    ctx.translate(sign * bodyW * 0.46, shoulderY + bodyH * 0.1);
    ctx.rotate(deg(-sign * (12 + swing)));
    ctx.fillStyle = P.body;
    pathRoundRect(ctx, -armW / 2, 0, armW, armLen, armW * 0.5);
    ctx.fill();
    ctx.fillStyle = P.hand;
    ctx.beginPath();
    ctx.arc(0, armLen, armW * 0.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Torso (shirt) + accent collar.
  ctx.fillStyle = P.body;
  pathRoundRect(ctx, -bodyW / 2, shoulderY, bodyW, bodyH, bodyW * 0.3);
  ctx.fill();
  ctx.fillStyle = P.accent;
  pathRoundRect(ctx, -bodyW * 0.16, shoulderY, bodyW * 0.32, bodyH * 0.2, bodyW * 0.08);
  ctx.fill();

  // Head (tilts at the neck).
  ctx.save();
  ctx.translate(0, shoulderY);
  ctx.rotate(deg(pose.headTilt));
  ctx.translate(0, -headR * 1.05);
  ctx.fillStyle = P.hair;
  ctx.beginPath();
  ctx.arc(0, -headR * 0.3, headR * 0.99, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = P.head;
  ctx.beginPath();
  ctx.arc(0, 0, headR, 0, Math.PI * 2);
  ctx.fill();
  drawEyes(ctx, 0, -headR * 0.08, headR * 0.42, headR * 0.12, pose.blink, P.eye, 'fill');
  drawVisemeMouth(ctx, 0, headR * 0.44, headR, pose.mouth, 'fill',
    { line: P.mouth, fill: P.mouth, teeth: P.teeth, tongue: P.tongue });
  ctx.restore();

  ctx.restore();
}

// ── Pack 3: Whiteboard → rig `marker-sketch` ─────────────────────────────────
// Marker line-art: dark ink strokes with a light second head pass for a
// hand-drawn feel, plus an accent ground underline. Scoped to a marker-STYLED
// rig (the engine has no self-drawing-hand reveal — noted above).

const MARKER_PALETTE: Record<string, string> = {
  body: '#243244', limb: '#243244', ink: '#243244',
  accent: '#00C3FF', head: '#243244', mouth: '#243244',
};

function drawMarkerSketch(
  ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
  pose: RigPose, palette: Record<string, string>, heightPx: number,
): void {
  const P = { ...MARKER_PALETTE, ...palette };
  const H = heightPx * pose.scaleMul;
  const headR = H * 0.15;
  const bodyLen = H * 0.32, legLen = H * 0.28, armLen = H * 0.24;
  const w = H * 0.02;

  ctx.save();
  applyBodyTransform(ctx, pose, H);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const hipY = -legLen;
  const shoulderY = hipY - bodyLen;

  // Ground underline (whiteboard marker motif) under the feet.
  ctx.strokeStyle = P.accent;
  ctx.lineWidth = w * 1.3;
  ctx.beginPath();
  ctx.moveTo(-headR * 0.9, w);
  ctx.lineTo(headR * 0.9, w);
  ctx.stroke();

  // Legs + body + arms as marker strokes.
  drawLimb(ctx, 0, hipY, legLen, pose.legL, -pose.legL * 0.5, w, P.ink);
  drawLimb(ctx, 0, hipY, legLen, pose.legR, -pose.legR * 0.5, w, P.ink);
  ctx.strokeStyle = P.ink;
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(0, hipY);
  ctx.lineTo(0, shoulderY);
  ctx.stroke();
  const handL = drawLimb(ctx, 0, shoulderY, armLen, 20 + pose.armL, 12, w, P.ink);
  const handR = drawLimb(ctx, 0, shoulderY, armLen, -(20 + pose.armR), -12, w, P.ink);
  for (const hand of [handL, handR]) {
    ctx.beginPath();
    ctx.arc(hand.x, hand.y, H * 0.02, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Head — a clean pass plus a slightly offset second pass (sketchy, deterministic).
  ctx.save();
  ctx.translate(0, shoulderY);
  ctx.rotate(deg(pose.headTilt));
  ctx.translate(0, -headR * 1.15);
  ctx.strokeStyle = P.ink;
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.arc(0, 0, headR, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(headR * 0.03, -headR * 0.02, headR * 0.97, 0, Math.PI * 2);
  ctx.stroke();
  drawEyes(ctx, 0, -headR * 0.1, headR * 0.4, headR * 0.12, pose.blink, P.ink, 'line');
  drawVisemeMouth(ctx, 0, headR * 0.42, headR, pose.mouth, 'line',
    { line: P.mouth, fill: P.mouth, teeth: P.ink, tongue: P.ink });
  ctx.restore();

  ctx.restore();
}

// ── Pack 4: Kinetic Type → rig `type-mascot` ─────────────────────────────────
// A bold typographic mascot: a poster-weight "type block" body with an accent
// baseline bar and a bright face panel. Scoped to a typographic-STYLED mascot
// (the engine does not animate word typography — noted above).

const TYPE_PALETTE: Record<string, string> = {
  body: '#1B1F2A', panel: '#FDFDF7', accent: '#F3A6FF',
  ink: '#1B1F2A', head: '#FDFDF7', mouth: '#1B1F2A',
};

function drawTypeMascot(
  ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
  pose: RigPose, palette: Record<string, string>, heightPx: number,
): void {
  const P = { ...TYPE_PALETTE, ...palette };
  const H = heightPx * pose.scaleMul;
  const blockW = H * 0.42, blockH = H * 0.5;
  const footH = H * 0.08, footW = H * 0.11;
  const armLen = H * 0.16, armW = H * 0.09;

  ctx.save();
  applyBodyTransform(ctx, pose, H);
  const blockTop = -(blockH + footH * 0.6);

  // Feet (bold blocks; small wiggle on legL/legR).
  for (const [swing, sign] of [[pose.legL, -1], [pose.legR, 1]] as const) {
    ctx.save();
    ctx.translate(sign * blockW * 0.22, -footH);
    ctx.rotate(deg(swing * 0.4));
    ctx.fillStyle = P.body;
    pathRoundRect(ctx, -footW / 2, 0, footW, footH, footH * 0.4);
    ctx.fill();
    ctx.restore();
  }

  // Nub arms behind the block (swing with armL/armR).
  for (const [swing, sign] of [[pose.armL, -1], [pose.armR, 1]] as const) {
    ctx.save();
    ctx.translate(sign * blockW * 0.48, blockTop + blockH * 0.5);
    ctx.rotate(deg(-sign * (35 + swing)));
    ctx.fillStyle = P.accent;
    pathRoundRect(ctx, -armW / 2, 0, armW, armLen, armW * 0.5);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, armLen, armW * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // The type block + accent baseline bar.
  ctx.fillStyle = P.body;
  pathRoundRect(ctx, -blockW / 2, blockTop, blockW, blockH, blockW * 0.16);
  ctx.fill();
  ctx.fillStyle = P.accent;
  pathRoundRect(ctx, -blockW / 2, blockTop + blockH * 0.82, blockW, blockH * 0.1, blockH * 0.03);
  ctx.fill();

  // Face panel (a bright inset; tilts subtly with headTilt).
  ctx.save();
  ctx.translate(0, blockTop + blockH * 0.4);
  ctx.rotate(deg(pose.headTilt * 0.6));
  const panelR = blockW * 0.34;
  ctx.fillStyle = P.panel;
  pathRoundRect(ctx, -panelR, -panelR, panelR * 2, panelR * 2, panelR * 0.5);
  ctx.fill();
  drawEyes(ctx, 0, -panelR * 0.15, panelR * 0.42, panelR * 0.16, pose.blink, P.ink, 'fill');
  drawVisemeMouth(ctx, 0, panelR * 0.45, panelR, pose.mouth, 'fill',
    { line: P.mouth, fill: P.mouth, teeth: '#FFFFFF', tongue: P.accent });
  ctx.restore();

  ctx.restore();
}

// ── Pack 5 (stretch): Chibi → rig `chibi-sprite` ─────────────────────────────
// Anime-lite chibi: oversized head, big shining eyes + blush, tiny body/limbs.
// Stylized proportions only — not cel animation (noted above). Original design.

const CHIBI_PALETTE: Record<string, string> = {
  hair: '#F3A6FF', head: '#FCE0C8', body: '#7FD1E3', limb: '#FCE0C8',
  eye: '#2A2340', eyeShine: '#FFFFFF', mouth: '#B65A6A', cheek: '#FBB6C1',
};

function drawChibiSprite(
  ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
  pose: RigPose, palette: Record<string, string>, heightPx: number,
): void {
  const P = { ...CHIBI_PALETTE, ...palette };
  const H = heightPx * pose.scaleMul;
  const headR = H * 0.26;
  const bodyW = H * 0.2, bodyH = H * 0.16;
  const legLen = H * 0.1, armLen = H * 0.12, limbW = H * 0.045;

  ctx.save();
  applyBodyTransform(ctx, pose, H);
  const hipY = -legLen;
  const shoulderY = hipY - bodyH;

  // Tiny legs + arms (drawLimb pattern, mirrored like the tracer).
  drawLimb(ctx, -bodyW * 0.2, hipY, legLen, pose.legL, 0, limbW, P.limb);
  drawLimb(ctx, bodyW * 0.2, hipY, legLen, pose.legR, 0, limbW, P.limb);
  ctx.fillStyle = P.body;
  pathRoundRect(ctx, -bodyW / 2, shoulderY, bodyW, bodyH, bodyW * 0.4);
  ctx.fill();
  drawLimb(ctx, 0, shoulderY + bodyH * 0.2, armLen, 25 + pose.armL, 8, limbW, P.limb);
  drawLimb(ctx, 0, shoulderY + bodyH * 0.2, armLen, -(25 + pose.armR), -8, limbW, P.limb);

  // Big head (tilts at the neck).
  ctx.save();
  ctx.translate(0, shoulderY);
  ctx.rotate(deg(pose.headTilt));
  ctx.translate(0, -headR * 0.92);

  ctx.fillStyle = P.hair;
  ctx.beginPath();
  ctx.arc(0, -headR * 0.18, headR * 1.06, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = P.head;
  ctx.beginPath();
  ctx.arc(0, 0, headR, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = P.cheek;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(s * headR * 0.5, headR * 0.28, headR * 0.16, headR * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Fringe bangs (deterministic overlapping arcs).
  ctx.fillStyle = P.hair;
  for (const fx of [-0.5, -0.17, 0.17, 0.5]) {
    ctx.beginPath();
    ctx.arc(fx * headR, -headR * 0.62, headR * 0.28, 0, Math.PI * 2);
    ctx.fill();
  }

  // Big eyes with a highlight; blink closes them into curved lids.
  const eyeY = headR * 0.02, spacing = headR * 0.46, eyeRx = headR * 0.2, eyeRy = headR * 0.26;
  const openness = 1 - pose.blink;
  for (const side of [-1, 1]) {
    const x = side * spacing;
    if (openness > 0.15) {
      ctx.fillStyle = P.eye;
      ctx.beginPath();
      ctx.ellipse(x, eyeY, eyeRx, eyeRy * openness, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = P.eyeShine;
      ctx.beginPath();
      ctx.arc(x - eyeRx * 0.3, eyeY - eyeRy * 0.35 * openness, eyeRx * 0.3, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.strokeStyle = P.eye;
      ctx.lineWidth = headR * 0.05;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x - eyeRx, eyeY);
      ctx.quadraticCurveTo(x, eyeY + eyeRy * 0.4, x + eyeRx, eyeY);
      ctx.stroke();
    }
  }

  drawVisemeMouth(ctx, 0, headR * 0.55, headR * 0.7, pose.mouth, 'fill',
    { line: P.mouth, fill: P.mouth, teeth: '#FFFFFF', tongue: '#E7899A' });
  ctx.restore();

  ctx.restore();
}

// ── Pack rig definitions ─────────────────────────────────────────────────────

export const FLAT_PRESENTER_RIG: RigDefinition = {
  id: 'flat-presenter',
  name: 'Flat Presenter',
  license: 'original',
  baseHeightFrac: 0.44,
  defaultPalette: FLAT_PALETTE,
  draw: drawFlatPresenter,
  gestures: SHARED_GESTURES,
};

export const MARKER_SKETCH_RIG: RigDefinition = {
  id: 'marker-sketch',
  name: 'Marker Sketch',
  license: 'original',
  baseHeightFrac: 0.44,
  defaultPalette: MARKER_PALETTE,
  draw: drawMarkerSketch,
  gestures: SHARED_GESTURES,
};

export const TYPE_MASCOT_RIG: RigDefinition = {
  id: 'type-mascot',
  name: 'Type Mascot',
  license: 'original',
  baseHeightFrac: 0.46,
  defaultPalette: TYPE_PALETTE,
  draw: drawTypeMascot,
  gestures: SHARED_GESTURES,
};

export const CHIBI_SPRITE_RIG: RigDefinition = {
  id: 'chibi-sprite',
  name: 'Chibi Sprite',
  license: 'original',
  baseHeightFrac: 0.42,
  defaultPalette: CHIBI_PALETTE,
  draw: drawChibiSprite,
  gestures: SHARED_GESTURES,
};

// ─── Registry ────────────────────────────────────────────────────────────────

const RIGS: Record<string, RigDefinition> = {
  [TRACER_STICK_RIG.id]: TRACER_STICK_RIG,
  [FLAT_PRESENTER_RIG.id]: FLAT_PRESENTER_RIG,
  [MARKER_SKETCH_RIG.id]: MARKER_SKETCH_RIG,
  [TYPE_MASCOT_RIG.id]: TYPE_MASCOT_RIG,
  [CHIBI_SPRITE_RIG.id]: CHIBI_SPRITE_RIG,
};

/** Resolve a rig by id. Throws on unknown rigs — silent fallbacks would break determinism. */
export function getRig(rigId: string): RigDefinition {
  const rig = RIGS[rigId];
  if (!rig) throw new Error(`Unknown rig '${rigId}'. Registered: ${Object.keys(RIGS).join(', ')}`);
  return rig;
}

/** Register a rig pack (WS-3 packs load through this). */
export function registerRig(rig: RigDefinition): void {
  RIGS[rig.id] = rig;
}
