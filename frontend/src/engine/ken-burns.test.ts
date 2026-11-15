/**
 * Unit tests for renderKenBurnsFrame (engine/ken-burns.ts).
 *
 * The function decides where every slideshow image is drawn in an exported
 * video, and it is a pure function of its arguments — so it is tested with a
 * fake 2D context (clearRect/drawImage as spies) and fake images, asserting
 * the exact drawImage arguments for known inputs (#52): the zoom-in preset
 * endpoints, t clamping outside [0, 1], the eased midpoint, one clearRect
 * per frame, and the cover-fit behaviour for wide and tall images.
 */
import { describe, it, expect, vi } from 'vitest';
import { renderKenBurnsFrame, KB_PRESETS } from './ken-burns';

function fakeCtx() {
  return { clearRect: vi.fn(), drawImage: vi.fn() };
}

function fakeImage(width: number, height: number) {
  return { width, height } as unknown as HTMLImageElement;
}

type Ctx = ReturnType<typeof fakeCtx>;

function render(
  ctx: Ctx,
  image: HTMLImageElement,
  canvasWidth: number,
  canvasHeight: number,
  preset: keyof typeof KB_PRESETS,
  t: number,
) {
  const { start, end } = KB_PRESETS[preset];
  renderKenBurnsFrame(
    ctx as unknown as CanvasRenderingContext2D,
    image,
    canvasWidth,
    canvasHeight,
    start,
    end,
    t,
  );
}

describe('renderKenBurnsFrame — zoom-in on a square canvas/image', () => {
  it('at t = 0 draws the image exactly over the canvas', () => {
    const ctx = fakeCtx();
    const img = fakeImage(1000, 1000);
    render(ctx, img, 1000, 1000, 'zoom-in', 0);
    expect(ctx.drawImage).toHaveBeenCalledTimes(1);
    expect(ctx.drawImage).toHaveBeenCalledWith(img, 0, 0, 1000, 1000);
  });

  it('at t = 1 draws at scale 1.2, centred', () => {
    const ctx = fakeCtx();
    const img = fakeImage(1000, 1000);
    render(ctx, img, 1000, 1000, 'zoom-in', 1);
    expect(ctx.drawImage).toHaveBeenCalledWith(img, -100, -100, 1200, 1200);
  });

  it('at t = 0.5 the ease-in-out midpoint gives scale 1.1', () => {
    const ctx = fakeCtx();
    const img = fakeImage(1000, 1000);
    render(ctx, img, 1000, 1000, 'zoom-in', 0.5);
    expect(ctx.drawImage).toHaveBeenCalledWith(img, -50, -50, 1100, 1100);
  });

  it('zoom-out is the exact reverse (t = 0 starts zoomed)', () => {
    const ctx = fakeCtx();
    const img = fakeImage(1000, 1000);
    render(ctx, img, 1000, 1000, 'zoom-out', 0);
    expect(ctx.drawImage).toHaveBeenCalledWith(img, -100, -100, 1200, 1200);
  });
});

describe('renderKenBurnsFrame — t is clamped to [0, 1]', () => {
  it('t = -0.5 produces the same drawImage arguments as t = 0', () => {
    const img = fakeImage(1000, 1000);
    const atZero = fakeCtx();
    render(atZero, img, 1000, 1000, 'zoom-in', 0);
    const below = fakeCtx();
    render(below, img, 1000, 1000, 'zoom-in', -0.5);
    expect(below.drawImage.mock.calls).toEqual(atZero.drawImage.mock.calls);
  });

  it('t = 1.5 produces the same drawImage arguments as t = 1', () => {
    const img = fakeImage(1000, 1000);
    const atOne = fakeCtx();
    render(atOne, img, 1000, 1000, 'zoom-in', 1);
    const above = fakeCtx();
    render(above, img, 1000, 1000, 'zoom-in', 1.5);
    expect(above.drawImage.mock.calls).toEqual(atOne.drawImage.mock.calls);
  });
});

describe('renderKenBurnsFrame — canvas clearing', () => {
  it('calls clearRect(0, 0, canvasWidth, canvasHeight) exactly once per frame', () => {
    const ctx = fakeCtx();
    const img = fakeImage(1000, 1000);
    render(ctx, img, 1000, 1000, 'zoom-in', 0.25);
    expect(ctx.clearRect).toHaveBeenCalledTimes(1);
    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 1000, 1000);
  });
});

describe('renderKenBurnsFrame — cover fit for non-square images', () => {
  it('a wide image (2000x1000) on a square canvas fills the canvas height', () => {
    const ctx = fakeCtx();
    const img = fakeImage(2000, 1000);
    render(ctx, img, 1000, 1000, 'zoom-in', 0);
    // scale is 1 at t = 0: drawH === canvasHeight * scale, drawW follows the aspect.
    expect(ctx.drawImage).toHaveBeenCalledWith(img, -500, 0, 2000, 1000);
  });

  it('a wide image at t = 1 keeps drawH === canvasHeight * scale', () => {
    const ctx = fakeCtx();
    const img = fakeImage(2000, 1000);
    render(ctx, img, 1000, 1000, 'zoom-in', 1);
    expect(ctx.drawImage).toHaveBeenCalledWith(img, -700, -100, 2400, 1200);
  });

  it('a tall image (500x1000) on a square canvas fills the canvas width', () => {
    const ctx = fakeCtx();
    const img = fakeImage(500, 1000);
    render(ctx, img, 1000, 1000, 'zoom-in', 0);
    expect(ctx.drawImage).toHaveBeenCalledWith(img, 0, -500, 1000, 2000);
  });
});
