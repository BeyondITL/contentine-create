/**
 * Anime-style WebGPU post-filter (R-72 slot) — REAL, self-contained, no deps.
 *
 * This is a genuine WebGPU render pass: a linear upscale followed by a
 * Contrast-Adaptive-Sharpening (CAS) pass tuned for flat-shaded / line-art
 * ("anime") content. Shader-only, no model download, MIT-clean (written here,
 * inspired by the Anime4K/CAS approach — no GPL app code embedded, per R-89).
 *
 * ── Determinism gate (Law L6 — READ BEFORE WIRING TO EXPORT) ─────────────────
 * L6 requires the exported MP4 to be byte-identical for the same project file on
 * ANY device. The cartoon export encoder is SOFTWARE precisely to guarantee that
 * (render-worker.ts). A GPU pass is deterministic run-to-run on the SAME device,
 * but WebGPU does NOT guarantee bit-identical rasterization/texture-sampling
 * across GPU vendors and drivers. Therefore this filter MUST NOT be baked into
 * the deterministic export path — doing so would break the cross-device golden.
 * It is exposed as a PREVIEW-time enhancement only. If a future project-scoped,
 * same-device-only export mode is introduced, it must record that the Anime4K
 * pass was applied and downgrade its determinism claim honestly.
 *
 * Consumers (WS-2, preview surfaces) get a clean interface; see the report for
 * the exact one-line consumption diff. Dynamic-import only (Law L8).
 */

/** Deterministic (same-device) filter parameters. */
export interface AnimeFilterParams {
  /** Integer upscale factor applied to width/height. 1 = sharpen in place. */
  scale: number;
  /** CAS strength in [0,1]. 0 = passthrough sharpen off, 1 = maximum. */
  sharpness: number;
}

export const DEFAULT_ANIME_PARAMS: AnimeFilterParams = { scale: 2, sharpness: 0.5 };

/** Honest, surfaced everywhere this filter is offered. */
export const ANIME4K_DETERMINISM_NOTE =
  'GPU post-filter: deterministic on this device, but not guaranteed identical across GPUs. ' +
  'Preview-only — not applied to the deterministic export (Law L6).';

export interface AnimeFilter {
  /** Run the filter, returning a freshly-allocated OffscreenCanvas with the result. */
  filter(
    source: ImageBitmap | HTMLCanvasElement | OffscreenCanvas | VideoFrame,
    params?: Partial<AnimeFilterParams>,
  ): Promise<OffscreenCanvas>;
  dispose(): void;
}

type SourceImage = ImageBitmap | HTMLCanvasElement | OffscreenCanvas | VideoFrame;

// WebGPU has no ambient types in this repo (@webgpu/types is not a dependency —
// adding one is WS-12's package.json gate). We follow the existing convention
// (sd-turbo-engine.ts, device-scanner.ts): reach WebGPU through `any`.
function webgpu(): any {
  return typeof navigator !== 'undefined' ? (navigator as any).gpu : undefined;
}

function sourceSize(src: SourceImage): { w: number; h: number } {
  const anySrc = src as any;
  if (typeof VideoFrame !== 'undefined' && src instanceof VideoFrame) {
    return { w: anySrc.displayWidth, h: anySrc.displayHeight };
  }
  return { w: anySrc.width, h: anySrc.height };
}

/** True when this browser/device can run the filter (WebGPU + a usable adapter). */
export async function isAnimeFilterSupported(): Promise<boolean> {
  const gpu = webgpu();
  if (!gpu) return false;
  try {
    const adapter = await gpu.requestAdapter();
    return !!adapter;
  } catch {
    return false;
  }
}

const SHADER = /* wgsl */ `
struct Params {
  texel : vec2<f32>,   // 1 / sourceSize, for neighbour sampling
  sharpness : f32,
  _pad : f32,
};

@group(0) @binding(0) var srcTex : texture_2d<f32>;
@group(0) @binding(1) var srcSampler : sampler;
@group(0) @binding(2) var<uniform> params : Params;

struct VOut {
  @builtin(position) pos : vec4<f32>,
  @location(0) uv : vec2<f32>,
};

@vertex
fn vs(@builtin(vertex_index) vid : u32) -> VOut {
  // Full-screen triangle.
  var p = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>( 3.0, -1.0),
    vec2<f32>(-1.0,  3.0),
  );
  var out : VOut;
  let xy = p[vid];
  out.pos = vec4<f32>(xy, 0.0, 1.0);
  out.uv = vec2<f32>((xy.x + 1.0) * 0.5, (1.0 - xy.y) * 0.5);
  return out;
}

fn luma(c : vec3<f32>) -> f32 {
  return dot(c, vec3<f32>(0.2126, 0.7152, 0.0722));
}

@fragment
fn fs(in : VOut) -> @location(0) vec4<f32> {
  let uv = in.uv;
  let t = params.texel;

  // 3x3 neighbourhood (linear-sampled source = the upscale step).
  let e = textureSample(srcTex, srcSampler, uv).rgb;             // center
  let b = textureSample(srcTex, srcSampler, uv + vec2<f32>(0.0, -t.y)).rgb;
  let d = textureSample(srcTex, srcSampler, uv + vec2<f32>(-t.x, 0.0)).rgb;
  let f = textureSample(srcTex, srcSampler, uv + vec2<f32>( t.x, 0.0)).rgb;
  let h = textureSample(srcTex, srcSampler, uv + vec2<f32>(0.0,  t.y)).rgb;

  // Contrast-Adaptive Sharpening (per-channel), amount driven by local contrast.
  let mn = min(e, min(min(b, d), min(f, h)));
  let mx = max(e, max(max(b, d), max(f, h)));
  let amp = clamp(min(mn, 1.0 - mx) / max(mx, 1e-4), 0.0, 1.0);
  let w = sqrt(amp) * (-0.2 * params.sharpness); // negative-lobe weight
  let sharpened = (e + (b + d + f + h) * w) / (1.0 + 4.0 * w);

  return vec4<f32>(clamp(sharpened, vec3<f32>(0.0), vec3<f32>(1.0)), 1.0);
}
`;

/**
 * Create the filter. Acquires its own GPUDevice; call dispose() to release it.
 * Throws if WebGPU is unavailable — callers gate on isAnimeFilterSupported().
 */
export async function createAnimeFilter(): Promise<AnimeFilter> {
  const gpu = webgpu();
  if (!gpu) {
    throw new Error('WebGPU unavailable: the anime post-filter cannot run on this device.');
  }
  const adapter = await gpu.requestAdapter();
  if (!adapter) throw new Error('No WebGPU adapter: the anime post-filter cannot run on this device.');
  const device: any = await adapter.requestDevice();
  const format: string = gpu.getPreferredCanvasFormat();

  // Runtime WebGPU flag/usage globals (untyped in this repo — see webgpu() note).
  const BufferUsage: any = (globalThis as any).GPUBufferUsage;
  const TextureUsage: any = (globalThis as any).GPUTextureUsage;

  const module = device.createShaderModule({ code: SHADER });
  const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
  const uniformBuffer = device.createBuffer({
    size: 16, // vec2 texel + f32 sharpness + f32 pad
    usage: BufferUsage.UNIFORM | BufferUsage.COPY_DST,
  });

  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module, entryPoint: 'vs' },
    fragment: { module, entryPoint: 'fs', targets: [{ format }] },
    primitive: { topology: 'triangle-list' },
  });

  let disposed = false;

  return {
    async filter(source, partial) {
      if (disposed) throw new Error('AnimeFilter used after dispose().');
      const params: AnimeFilterParams = { ...DEFAULT_ANIME_PARAMS, ...partial };
      const scale = Math.max(1, Math.floor(params.scale));
      const { w: sw, h: sh } = sourceSize(source);
      const dw = sw * scale;
      const dh = sh * scale;

      // Upload source into a sampled texture.
      const srcTex = device.createTexture({
        size: [sw, sh],
        format: 'rgba8unorm',
        usage: TextureUsage.TEXTURE_BINDING | TextureUsage.COPY_DST | TextureUsage.RENDER_ATTACHMENT,
      });
      device.queue.copyExternalImageToTexture(
        { source: source as any },
        { texture: srcTex },
        [sw, sh],
      );

      // Output canvas is the render target.
      const out = new OffscreenCanvas(dw, dh);
      const ctx = out.getContext('webgpu') as any;
      if (!ctx) throw new Error('OffscreenCanvas webgpu context unavailable.');
      ctx.configure({ device, format, alphaMode: 'opaque' });

      device.queue.writeBuffer(
        uniformBuffer,
        0,
        new Float32Array([1 / sw, 1 / sh, params.sharpness, 0]),
      );

      const bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: srcTex.createView() },
          { binding: 1, resource: sampler },
          { binding: 2, resource: { buffer: uniformBuffer } },
        ],
      });

      const encoder = device.createCommandEncoder();
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: ctx.getCurrentTexture().createView(),
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],
      });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.draw(3);
      pass.end();
      device.queue.submit([encoder.finish()]);
      await device.queue.onSubmittedWorkDone();

      srcTex.destroy();
      return out;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      uniformBuffer.destroy();
      device.destroy();
    },
  };
}
