/**
 * Contentine Create — WebCodecs H.264 Video Encoder
 * Encodes canvas frames into H.264 video chunks using the browser's WebCodecs API.
 * Falls back to a software path if WebCodecs is unavailable.
 */

import type { AspectRatio } from '@/types';

/** Resolution map based on aspect ratio and device tier. */
const RESOLUTIONS: Record<AspectRatio, { width: number; height: number }> = {
  '9:16': { width: 1080, height: 1920 },
  '16:9': { width: 1920, height: 1080 },
  '1:1': { width: 1080, height: 1080 },
};

/** Lower resolutions for standard/mobile tiers. */
const RESOLUTIONS_LOW: Record<AspectRatio, { width: number; height: number }> = {
  '9:16': { width: 720, height: 1280 },
  '16:9': { width: 1280, height: 720 },
  '1:1': { width: 720, height: 720 },
};

export interface EncoderConfig {
  aspectRatio: AspectRatio;
  fps: number;
  bitrate: number;
  /** 'high' uses full resolution, 'standard' uses lower resolution. */
  tier: 'high' | 'standard' | 'mobile' | 'low';
}

export interface EncodedChunk {
  data: Uint8Array;
  type: 'key' | 'delta';
  timestamp: number;
  duration: number;
}

/**
 * Resolution-aware H.264 codec string. Baseline profile: level 4.0 (avc1.420028)
 * covers 1080p; level 3.1 (avc1.42001f) maxes out ~1280×720. Configuring L3.1 at
 * 1080×1920 is an over-level config that macOS Chrome/Safari correctly reject
 * (isConfigSupported=false) — so the codec MUST scale with resolution. Mirrors
 * `h264CodecFor` in engine/cartoon/render-worker.ts.
 */
export function h264CodecFor(width: number, height: number): string {
  return width * height > 1280 * 720 ? 'avc1.420028' : 'avc1.42001f';
}

/**
 * Check if the browser supports WebCodecs with H.264 encoding at the highest
 * resolution the app renders (1080×1920). Probes the exact codec that resolution
 * will use (L4.0) — probing L3.1 here false-negatived on strict platforms.
 */
export async function supportsWebCodecs(): Promise<boolean> {
  if (!('VideoEncoder' in globalThis)) return false;

  try {
    const support = await VideoEncoder.isConfigSupported({
      codec: h264CodecFor(1080, 1920), // resolution-appropriate (avc1.420028, L4.0)
      width: 1080,
      height: 1920,
      bitrate: 4_000_000,
      framerate: 30,
    });
    return support.supported === true;
  } catch {
    return false;
  }
}

/**
 * Get canvas resolution for the current config.
 */
export function getResolution(
  aspectRatio: AspectRatio,
  tier: 'high' | 'standard' | 'mobile' | 'low'
): { width: number; height: number } {
  return tier === 'high' ? RESOLUTIONS[aspectRatio] : RESOLUTIONS_LOW[aspectRatio];
}

/**
 * WebCodecs-based H.264 encoder.
 * Encodes VideoFrames from canvas into H.264 encoded chunks.
 */
export class H264Encoder {
  private encoder: VideoEncoder | null = null;
  private chunks: EncodedChunk[] = [];
  private frameCount = 0;
  private config: EncoderConfig;
  private resolution: { width: number; height: number };
  private firstMeta: EncodedVideoChunkMetadata | undefined = undefined;

  constructor(config: EncoderConfig) {
    this.config = config;
    this.resolution = getResolution(config.aspectRatio, config.tier);
  }

  get width(): number { return this.resolution.width; }
  get height(): number { return this.resolution.height; }

  /** Encoder metadata from the first chunk (contains decoderConfig for MP4 muxing). */
  get decoderMeta(): EncodedVideoChunkMetadata | undefined { return this.firstMeta; }

  /** Initialize the encoder. Must be called before encoding frames. */
  async init(): Promise<void> {
    // Probe the EXACT config we are about to configure (codec scaled to the
    // actual output resolution) rather than a fixed low-level guess — an
    // over-level codec at 1080×1920 makes isConfigSupported=false and export
    // impossible on strict platforms (macOS Chrome/Safari).
    const codec = h264CodecFor(this.resolution.width, this.resolution.height);
    if (!('VideoEncoder' in globalThis)) {
      throw new Error('WebCodecs H.264 encoding not supported in this browser');
    }
    const support = await VideoEncoder.isConfigSupported({
      codec,
      width: this.resolution.width,
      height: this.resolution.height,
      bitrate: this.config.bitrate,
      framerate: this.config.fps,
    });
    if (!support.supported) {
      throw new Error(
        `WebCodecs H.264 encoding not supported for ${codec} at ${this.resolution.width}×${this.resolution.height} in this browser`
      );
    }

    this.encoder = new VideoEncoder({
      output: (chunk, metadata) => {
        const data = new Uint8Array(chunk.byteLength);
        chunk.copyTo(data);

        // Preserve first chunk metadata (contains decoderConfig with SPS/PPS for MP4)
        if (!this.firstMeta && metadata?.decoderConfig) {
          this.firstMeta = metadata;
        }

        this.chunks.push({
          data,
          type: chunk.type,
          timestamp: chunk.timestamp,
          duration: chunk.duration ?? 0,
        });
      },
      error: (err) => {
        console.error('[WebCodecs Encoder] Error:', err);
      },
    });

    this.encoder.configure({
      codec, // resolution-aware: avc1.420028 (L4.0) >720p, avc1.42001f (L3.1) otherwise
      width: this.resolution.width,
      height: this.resolution.height,
      bitrate: this.config.bitrate,
      framerate: this.config.fps,
      latencyMode: 'quality',
      avc: { format: 'avc' }, // AVCC format for Mediabunny MP4 muxing
    });
  }

  /**
   * Encode a single canvas frame.
   * @param canvas — The canvas containing the rendered frame.
   * @param timestampMs — Frame timestamp in microseconds.
   */
  encodeFrame(canvas: OffscreenCanvas | HTMLCanvasElement, timestampUs: number): void {
    if (!this.encoder || this.encoder.state !== 'configured') {
      throw new Error('Encoder not initialized');
    }

    const frame = new VideoFrame(canvas, {
      timestamp: timestampUs,
      duration: Math.round(1_000_000 / this.config.fps), // microseconds per frame
    });

    // Insert keyframe every 2 seconds
    const keyFrame = this.frameCount % (this.config.fps * 2) === 0;
    this.encoder.encode(frame, { keyFrame });
    frame.close();

    this.frameCount++;
  }

  /** Flush remaining frames and return all encoded chunks. */
  async flush(): Promise<EncodedChunk[]> {
    if (!this.encoder) return [];

    await this.encoder.flush();
    const chunks = [...this.chunks];
    return chunks;
  }

  /** Get the raw H.264 bitstream as a single Uint8Array. */
  async finalize(): Promise<Uint8Array> {
    const chunks = await this.flush();

    // Calculate total size
    let totalSize = 0;
    for (const chunk of chunks) {
      totalSize += chunk.data.byteLength;
    }

    // Concatenate all chunks
    const result = new Uint8Array(totalSize);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk.data, offset);
      offset += chunk.data.byteLength;
    }

    return result;
  }

  /** Close the encoder and release resources. */
  close(): void {
    if (this.encoder && this.encoder.state !== 'closed') {
      this.encoder.close();
    }
    this.encoder = null;
    this.chunks = [];
    this.frameCount = 0;
  }
}
