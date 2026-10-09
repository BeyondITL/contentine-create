/**
 * Contentine Create — Cartoon Engine: Render worker
 *
 * The Law-L6 export path, in a Worker:
 *   plan → GSAP master timeline → seek() per frame → OffscreenCanvas 2D →
 *   WebCodecs H.264 encode → Mediabunny MP4 mux (video splice + AAC audio).
 *
 * Frame-accurate and deterministic: the timeline is advanced by explicit
 * seek(frame / fps) — wall-clock time never touches the pipeline. Keyframes
 * are forced at every scene start so scene windows are splice points for
 * partial re-renders.
 *
 * Ops:
 *   render-frames — render an inclusive-exclusive frame range to encoded
 *                   H.264 chunks (+ optional per-frame raw-pixel SHA-256s).
 *   mux           — splice encoded chunk groups + mixed PCM into an MP4
 *                   with embedded provenance metadata (Law L7).
 */

import type { ScenePlan } from './scene-plan';
import type { TakeTimingInfo } from './timeline-compiler';
import type { VisemeStamp } from './visemes';

// ─── Message contracts (shared with cartoon-renderer.ts) ─────────────────────

export interface WorkerChunk {
  data: Uint8Array;
  type: 'key' | 'delta';
  /** Microseconds, absolute on the project timeline. */
  timestamp: number;
  duration: number;
}

export interface WorkerDecoderConfig {
  codec: string;
  codedWidth: number;
  codedHeight: number;
  description?: Uint8Array;
}

export interface RenderFramesRequest {
  op: 'render-frames';
  id: number;
  plan: ScenePlan;
  /** Serialized take timing map: [takeKey, { durationSec, visemes }]. */
  takeInfo: Array<[string, { durationSec: number; visemes: VisemeStamp[] }]>;
  /** Frame range [startFrame, endFrame) at plan fps. */
  startFrame: number;
  endFrame: number;
  bitrate: number;
  collectFrameHashes: boolean;
  /** Decoded background assets, keyed by assetRef. */
  backgroundAssets: Array<[string, ImageBitmap]>;
}

export interface MuxRequest {
  op: 'mux';
  id: number;
  chunks: WorkerChunk[];
  decoderConfig: WorkerDecoderConfig;
  audio: { left: Float32Array; right: Float32Array; sampleRate: number } | null;
  fps: number;
  width: number;
  height: number;
  /** Law L7 provenance payload embedded into the MP4 metadata. */
  provenance: { title: string; planHash: string; generator: string; aiDisclosure?: string };
}

export type WorkerRequest = RenderFramesRequest | MuxRequest;

export type WorkerResponse =
  | { op: 'progress'; id: number; phase: string; percent: number }
  | { op: 'frames-done'; id: number; chunks: WorkerChunk[]; decoderConfig: WorkerDecoderConfig; frameHashes: string[] }
  | { op: 'mux-done'; id: number; mp4: ArrayBuffer; audioCodec: string | null }
  | { op: 'error'; id: number; error: string };

// Minimal worker-scope surface (tsconfig uses the DOM lib, not webworker).
interface WorkerScope {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage(message: WorkerResponse, transfer?: Transferable[]): void;
}
const scope = self as unknown as WorkerScope;

function post(message: WorkerResponse, transfer?: Transferable[]): void {
  scope.postMessage(message, transfer);
}

// ─── H.264 encoding ──────────────────────────────────────────────────────────

/** Baseline profile: level 4.0 covers 1080p30; 3.1 for ≤720p. */
function h264CodecFor(width: number, height: number): string {
  return width * height > 1280 * 720 ? 'avc1.420028' : 'avc1.42001f';
}

async function renderFrames(req: RenderFramesRequest): Promise<void> {
  const { compileTimeline, seekTimeline } = await import('./timeline-compiler');
  const { paintFrame } = await import('./paint');

  const { width, height } = req.plan.resolution;
  const fps = req.plan.fps;
  const compiled = compileTimeline(req.plan, new Map<string, TakeTimingInfo>(req.takeInfo));
  const assets = { backgrounds: new Map(req.backgroundAssets) };

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: req.collectFrameHashes });
  if (!ctx) throw new Error('OffscreenCanvas 2d context unavailable in worker');

  const codec = h264CodecFor(width, height);
  const support = await VideoEncoder.isConfigSupported({ codec, width, height, bitrate: req.bitrate, framerate: fps });
  if (!support.supported) {
    throw new Error(`WebCodecs H.264 encode unsupported in this browser (${codec} ${width}x${height}@${fps})`);
  }

  const chunks: WorkerChunk[] = [];
  let decoderConfig: WorkerDecoderConfig | null = null;
  let encodeError: Error | null = null;

  const encoder = new VideoEncoder({
    output: (chunk, metadata) => {
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      if (!decoderConfig && metadata?.decoderConfig) {
        const dc = metadata.decoderConfig;
        let description: Uint8Array | undefined;
        if (dc.description) {
          description = ArrayBuffer.isView(dc.description)
            ? new Uint8Array(dc.description.buffer.slice(dc.description.byteOffset, dc.description.byteOffset + dc.description.byteLength))
            : new Uint8Array((dc.description as ArrayBuffer).slice(0));
        }
        decoderConfig = {
          codec: dc.codec,
          codedWidth: dc.codedWidth ?? width,
          codedHeight: dc.codedHeight ?? height,
          description,
        };
      }
      chunks.push({ data, type: chunk.type, timestamp: chunk.timestamp, duration: chunk.duration ?? 0 });
    },
    error: (err) => { encodeError = err instanceof Error ? err : new Error(String(err)); },
  });
  encoder.configure({
    codec,
    width,
    height,
    bitrate: req.bitrate,
    framerate: fps,
    latencyMode: 'quality',
    // Software encode is byte-reproducible run-to-run (C-M1 harness measured a
    // 1-byte drift in the first keyframe without this pin); hardware paths may
    // also differ across driver versions. Determinism beats speed here (L6).
    hardwareAcceleration: 'prefer-software',
    avc: { format: 'avc' },
  });

  // Scene starts are forced keyframes — splice points for partial re-renders.
  const sceneStartFrames = new Set(compiled.timing.scenes.map((s) => s.startFrame));
  const gopFrames = fps * 2;

  const frameHashes: string[] = [];
  const totalFrames = req.endFrame - req.startFrame;
  const frameDurUs = Math.round(1_000_000 / fps);

  for (let f = req.startFrame; f < req.endFrame; f++) {
    if (encodeError) throw encodeError;

    seekTimeline(compiled, f / fps);
    paintFrame(ctx, width, height, compiled.stage, compiled.timing, assets, f / fps);

    if (req.collectFrameHashes) {
      const pixels = ctx.getImageData(0, 0, width, height);
      const digest = await crypto.subtle.digest('SHA-256', pixels.data as unknown as BufferSource);
      frameHashes.push(Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join(''));
    }

    const keyFrame = f === req.startFrame || sceneStartFrames.has(f) || (f - req.startFrame) % gopFrames === 0;
    const frame = new VideoFrame(canvas, { timestamp: f * frameDurUs, duration: frameDurUs });
    encoder.encode(frame, { keyFrame });
    frame.close();

    // Respect encoder backpressure.
    if (encoder.encodeQueueSize > 8) {
      await new Promise<void>((resolve) => encoder.addEventListener('dequeue', () => resolve(), { once: true }));
    }

    const done = f - req.startFrame + 1;
    if (done % fps === 0 || done === totalFrames) {
      post({ op: 'progress', id: req.id, phase: 'compositing', percent: Math.round((done / totalFrames) * 100) });
    }
  }

  await encoder.flush();
  encoder.close();
  if (encodeError) throw encodeError;
  if (!decoderConfig) throw new Error('Encoder produced no decoder configuration');

  post(
    { op: 'frames-done', id: req.id, chunks, decoderConfig, frameHashes },
    chunks.map((c) => c.data.buffer),
  );
}

// ─── Muxing ──────────────────────────────────────────────────────────────────

/**
 * Zero the creation/modification wall-clock stamps in mvhd/tkhd/mdhd boxes so
 * identical inputs produce byte-identical MP4s (Law L6; reproducible-build
 * practice). Walks the box tree in place.
 */
function zeroMp4Dates(bytes: Uint8Array): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const boxType = (off: number) =>
    String.fromCharCode(bytes[off], bytes[off + 1], bytes[off + 2], bytes[off + 3]);

  const walk = (start: number, end: number): void => {
    let off = start;
    while (off + 8 <= end) {
      let size = view.getUint32(off);
      let header = 8;
      const type = boxType(off + 4);
      if (size === 1) {
        size = Number(view.getBigUint64(off + 8));
        header = 16;
      } else if (size === 0) {
        size = end - off;
      }
      if (size < header || off + size > end) break;

      if (type === 'moov' || type === 'trak' || type === 'mdia') {
        walk(off + header, off + size);
      } else if (type === 'mvhd' || type === 'tkhd' || type === 'mdhd') {
        // version(1) + flags(3), then creation_time + modification_time
        // (2 × 4 bytes at version 0, 2 × 8 bytes at version 1).
        const fieldBytes = bytes[off + header] === 1 ? 8 : 4;
        bytes.fill(0, off + header + 4, off + header + 4 + fieldBytes * 2);
      }
      off += size;
    }
  };
  walk(0, bytes.byteLength);
}

async function mux(req: MuxRequest): Promise<void> {
  const {
    Output,
    Mp4OutputFormat,
    BufferTarget,
    EncodedVideoPacketSource,
    AudioSampleSource,
    AudioSample,
    EncodedPacket,
    getFirstEncodableAudioCodec,
  } = await import('mediabunny');

  const target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat(), target });

  // Law L7 — provenance embedded in the container metadata. aiDisclosure is
  // omitted when the user disabled Art. 50 marking (empty/absent from the payload).
  const provenanceComment: Record<string, string> = {
    generator: req.provenance.generator,
    planHash: req.provenance.planHash,
  };
  if (req.provenance.aiDisclosure) {
    provenanceComment.aiDisclosure = req.provenance.aiDisclosure;
  }
  output.setMetadataTags({
    title: req.provenance.title,
    comment: JSON.stringify(provenanceComment),
  });

  const videoSource = new EncodedVideoPacketSource('avc');
  output.addVideoTrack(videoSource, { frameRate: req.fps });

  // AAC preferred; Opus fallback for browsers without an AAC encoder.
  let audioSource: InstanceType<typeof AudioSampleSource> | null = null;
  let audioCodec: 'aac' | 'opus' | null = null;
  if (req.audio) {
    audioCodec = (await getFirstEncodableAudioCodec(['aac', 'opus'], {
      numberOfChannels: 2,
      sampleRate: req.audio.sampleRate,
    })) as 'aac' | 'opus' | null;
    if (!audioCodec) throw new Error('No AAC/Opus audio encoder available — cannot mux audio');
    audioSource = new AudioSampleSource({ codec: audioCodec, bitrate: 160_000 });
    output.addAudioTrack(audioSource);
  }

  await output.start();

  const decoderMeta: EncodedVideoChunkMetadata = {
    decoderConfig: {
      codec: req.decoderConfig.codec,
      codedWidth: req.decoderConfig.codedWidth,
      codedHeight: req.decoderConfig.codedHeight,
      description: req.decoderConfig.description,
    },
  };

  for (let i = 0; i < req.chunks.length; i++) {
    const chunk = req.chunks[i];
    const packet = new EncodedPacket(chunk.data, chunk.type, chunk.timestamp / 1_000_000, chunk.duration / 1_000_000);
    await videoSource.add(packet, i === 0 ? decoderMeta : undefined);
    if (i % 60 === 0 || i === req.chunks.length - 1) {
      post({ op: 'progress', id: req.id, phase: 'muxing', percent: Math.round((i / req.chunks.length) * 80) });
    }
  }
  videoSource.close();

  if (audioSource && req.audio) {
    // Feed planar stereo PCM in one-second samples.
    const { left, right, sampleRate } = req.audio;
    const chunkFrames = sampleRate;
    for (let offset = 0; offset < left.length; offset += chunkFrames) {
      const frames = Math.min(chunkFrames, left.length - offset);
      const planar = new Float32Array(frames * 2);
      planar.set(left.subarray(offset, offset + frames), 0);
      planar.set(right.subarray(offset, offset + frames), frames);
      const sample = new AudioSample({
        data: planar,
        format: 'f32-planar',
        numberOfChannels: 2,
        sampleRate,
        timestamp: offset / sampleRate,
      });
      await audioSource.add(sample);
      sample.close();
    }
    audioSource.close();
  }

  await output.finalize();
  post({ op: 'progress', id: req.id, phase: 'muxing', percent: 100 });

  const mp4 = target.buffer!;
  zeroMp4Dates(new Uint8Array(mp4));
  post({ op: 'mux-done', id: req.id, mp4, audioCodec }, [mp4]);
}

// ─── Dispatch ────────────────────────────────────────────────────────────────

scope.onmessage = (event: MessageEvent) => {
  const req = event.data as WorkerRequest;
  const run = req.op === 'render-frames' ? renderFrames(req) : mux(req);
  run.catch((err: unknown) => {
    post({ op: 'error', id: req.id, error: err instanceof Error ? err.message : String(err) });
  });
};
