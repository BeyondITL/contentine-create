/**
 * Contentine Create — Ken Burns Effect Engine
 * Renders animated pan/zoom on a canvas from start to end positions.
 * Each frame interpolates between start and end KenBurnsPos values.
 */

import type { KenBurnsPos } from '@/types';

interface KenBurnsConfig {
  image: HTMLImageElement | ImageBitmap;
  canvas: OffscreenCanvas | HTMLCanvasElement;
  start: KenBurnsPos;
  end: KenBurnsPos;
  durationMs: number;
  fps: number;
}

/** Linear interpolation. */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Ease-in-out cubic for smoother motion. */
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Render a single Ken Burns frame at progress t (0..1).
 * Draws the image onto the canvas with the interpolated transform.
 */
export function renderKenBurnsFrame(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  image: HTMLImageElement | ImageBitmap,
  canvasWidth: number,
  canvasHeight: number,
  start: KenBurnsPos,
  end: KenBurnsPos,
  t: number
): void {
  const eased = easeInOutCubic(Math.max(0, Math.min(1, t)));

  const x = lerp(start.x, end.x, eased);
  const y = lerp(start.y, end.y, eased);
  const scale = lerp(start.scale, end.scale, eased);

  ctx.clearRect(0, 0, canvasWidth, canvasHeight);

  const imgW = image.width;
  const imgH = image.height;

  // Calculate source rectangle based on pan/zoom position
  const visibleW = canvasWidth / scale;
  const visibleH = canvasHeight / scale;

  const srcX = x * imgW - visibleW / 2;
  const srcY = y * imgH - visibleH / 2;

  // Scale image to fill canvas while maintaining aspect ratio
  const imgAspect = imgW / imgH;
  const canvasAspect = canvasWidth / canvasHeight;

  let drawW: number, drawH: number;
  if (imgAspect > canvasAspect) {
    drawH = canvasHeight * scale;
    drawW = drawH * imgAspect;
  } else {
    drawW = canvasWidth * scale;
    drawH = drawW / imgAspect;
  }

  const drawX = (canvasWidth - drawW) / 2 - (x - 0.5) * drawW * (scale - 1) / scale;
  const drawY = (canvasHeight - drawH) / 2 - (y - 0.5) * drawH * (scale - 1) / scale;

  ctx.drawImage(image, drawX, drawY, drawW, drawH);
}

/**
 * Generate all frames for a Ken Burns scene.
 * Returns an array of ImageData for each frame.
 */
export function generateKenBurnsFrames(config: KenBurnsConfig): ImageData[] {
  const { image, canvas, start, end, durationMs, fps } = config;
  const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D | null;
  if (!ctx) throw new Error('Failed to get canvas 2d context');

  const totalFrames = Math.ceil((durationMs / 1000) * fps);
  const frames: ImageData[] = [];

  for (let i = 0; i < totalFrames; i++) {
    const t = i / Math.max(1, totalFrames - 1);
    renderKenBurnsFrame(ctx, image, canvas.width, canvas.height, start, end, t);
    frames.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
  }

  return frames;
}

/** Default Ken Burns positions for common directions. */
export const KB_PRESETS = {
  'zoom-in': {
    start: { x: 0.5, y: 0.5, scale: 1.0 },
    end: { x: 0.5, y: 0.5, scale: 1.2 },
  },
  'zoom-out': {
    start: { x: 0.5, y: 0.5, scale: 1.2 },
    end: { x: 0.5, y: 0.5, scale: 1.0 },
  },
  'pan-left': {
    start: { x: 0.6, y: 0.5, scale: 1.1 },
    end: { x: 0.4, y: 0.5, scale: 1.1 },
  },
  'pan-right': {
    start: { x: 0.4, y: 0.5, scale: 1.1 },
    end: { x: 0.6, y: 0.5, scale: 1.1 },
  },
  'pan-up': {
    start: { x: 0.5, y: 0.6, scale: 1.1 },
    end: { x: 0.5, y: 0.4, scale: 1.1 },
  },
  'pan-down': {
    start: { x: 0.5, y: 0.4, scale: 1.1 },
    end: { x: 0.5, y: 0.6, scale: 1.1 },
  },
} as const;
