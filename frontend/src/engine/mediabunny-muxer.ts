/**
 * Contentine Create — Mediabunny Muxer
 * Combines H.264 video stream + audio into an MP4 container.
 * Pure TypeScript, WebCodecs GPU-accelerated, ~5KB. No WASM, no SharedArrayBuffer needed.
 * Replaces FFmpeg.wasm (v2.2 migration).
 */

import {
  Output,
  Mp4OutputFormat,
  BufferTarget,
  EncodedVideoPacketSource,
  AudioBufferSource,
  EncodedPacket,
  Input,
  BlobSource,
  Conversion,
  WAVE,
} from 'mediabunny';
import type { EncodedChunk } from './webcodecs-encoder';

export interface MuxConfig {
  /** Individual encoded H.264 chunks from the WebCodecs encoder. */
  videoChunks: EncodedChunk[];
  /** Encoder metadata from the first chunk (contains decoderConfig for MP4). */
  decoderMeta?: EncodedVideoChunkMetadata;
  /** PCM audio as Float32Array. */
  audioData: Float32Array;
  audioSampleRate: number;
  fps: number;
  width: number;
  height: number;
  onProgress?: (percent: number) => void;
  /**
   * Optional Law L7 / EU AI Act Art. 50(2) provenance. When a non-empty string
   * is supplied, it is embedded as MP4 container metadata (machine-readable
   * "detectable as artificially generated"). Callers that omit it get no tag, so
   * non-AI lanes (e.g. the aspect-ratio converter) are unaffected.
   */
  aiDisclosure?: string;
  /** Optional container title tag (defaults to the app name when a disclosure is set). */
  title?: string;
}

/**
 * Mux H.264 video chunks + PCM audio into an MP4 file using Mediabunny.
 * Returns the MP4 as a Blob.
 */
export async function muxToMP4(config: MuxConfig): Promise<Blob> {
  config.onProgress?.(10);

  const target = new BufferTarget();
  const output = new Output({
    format: new Mp4OutputFormat(),
    target,
  });

  // Law L7 / EU AI Act Art. 50(2) — machine-readable provenance in container
  // metadata, mirroring the cartoon lane (engine/cartoon/render-worker.ts). Only
  // written when the caller supplies a disclosure (user preset enabled), so
  // non-AI lanes embed nothing. Two renders of the same project with the same
  // preset produce the same tag ⇒ run-twice determinism is preserved.
  if (config.aiDisclosure) {
    output.setMetadataTags({
      title: config.title || 'Contentine Create',
      comment: JSON.stringify({ generator: 'Contentine Create', aiDisclosure: config.aiDisclosure }),
    });
  }

  // Video track — pre-encoded H.264 (AVCC format from WebCodecs encoder)
  const videoSource = new EncodedVideoPacketSource('avc');
  output.addVideoTrack(videoSource, { frameRate: config.fps });

  // Audio track — encode PCM to AAC via Mediabunny
  let audioSource: AudioBufferSource | null = null;
  if (config.audioData.length > 0) {
    audioSource = new AudioBufferSource({
      codec: 'aac',
      bitrate: 128_000,
    });
    output.addAudioTrack(audioSource);
  }

  await output.start();
  config.onProgress?.(20);

  // Feed all video chunks as EncodedPacket instances
  const totalChunks = config.videoChunks.length;
  for (let i = 0; i < totalChunks; i++) {
    const chunk = config.videoChunks[i];
    const packet = new EncodedPacket(
      chunk.data,
      chunk.type,
      chunk.timestamp / 1_000_000, // microseconds → seconds
      chunk.duration / 1_000_000,  // microseconds → seconds
    );
    // Pass decoder metadata for the first chunk (SPS/PPS for MP4 header)
    const meta = (i === 0) ? config.decoderMeta : undefined;
    await videoSource.add(packet, meta);

    // Report progress for video feed phase (20-70%)
    if (i % 30 === 0 || i === totalChunks - 1) {
      config.onProgress?.(20 + Math.round((i / totalChunks) * 50));
    }
  }
  videoSource.close();

  // Feed audio as AudioBuffer
  if (audioSource && config.audioData.length > 0) {
    const audioCtx = new OfflineAudioContext(1, config.audioData.length, config.audioSampleRate);
    const audioBuffer = audioCtx.createBuffer(1, config.audioData.length, config.audioSampleRate);
    audioBuffer.getChannelData(0).set(config.audioData);
    await audioSource.add(audioBuffer);
    audioSource.close();
  }

  config.onProgress?.(80);

  // Finalize the MP4
  await output.finalize();

  config.onProgress?.(100);

  // BufferTarget.buffer is an ArrayBuffer after finalization
  return new Blob([target.buffer!], { type: 'video/mp4' });
}

/**
 * Mux video-only (no audio) into MP4 using Mediabunny.
 */
export async function muxVideoOnly(
  videoChunks: EncodedChunk[],
  fps: number,
  decoderMeta?: EncodedVideoChunkMetadata,
  onProgress?: (percent: number) => void
): Promise<Blob> {
  onProgress?.(10);

  const target = new BufferTarget();
  const output = new Output({
    format: new Mp4OutputFormat(),
    target,
  });

  const videoSource = new EncodedVideoPacketSource('avc');
  output.addVideoTrack(videoSource, { frameRate: fps });

  await output.start();

  for (let i = 0; i < videoChunks.length; i++) {
    const chunk = videoChunks[i];
    const packet = new EncodedPacket(
      chunk.data,
      chunk.type,
      chunk.timestamp / 1_000_000,
      chunk.duration / 1_000_000,
    );
    const meta = (i === 0) ? decoderMeta : undefined;
    await videoSource.add(packet, meta);
  }
  videoSource.close();

  await output.finalize();
  onProgress?.(100);

  return new Blob([target.buffer!], { type: 'video/mp4' });
}

/**
 * Convert a media file to a different format using Mediabunny Conversion API.
 */
export async function convertFormat(
  inputBlob: Blob,
  targetFormat: 'mp4' | 'webm' | 'wav' | 'mp3',
  onProgress?: (percent: number) => void
): Promise<Blob> {
  // Dynamically select the output format
  const { Mp4OutputFormat, WebMOutputFormat, WavOutputFormat, Mp3OutputFormat } = await import('mediabunny');

  const formatMap = {
    mp4: () => new Mp4OutputFormat(),
    webm: () => new WebMOutputFormat(),
    wav: () => new WavOutputFormat(),
    mp3: () => new Mp3OutputFormat(),
  } as const;

  const formatFactory = formatMap[targetFormat];
  if (!formatFactory) {
    throw new Error(`Unsupported target format: ${targetFormat}`);
  }

  const target = new BufferTarget();
  const input = new Input({
    source: new BlobSource(inputBlob),
    formats: [WAVE],
  });

  const output = new Output({
    format: formatFactory(),
    target,
  });

  const conversion = await Conversion.init({ input, output });

  if (onProgress) {
    conversion.onProgress = (p) => onProgress(Math.round(p * 100));
  }

  await conversion.execute();

  return new Blob([target.buffer!], { type: `video/${targetFormat}` });
}

/** Terminate — no-op for Mediabunny (pure TS, no WASM instance to clean up). */
export function terminateMuxer(): void {
  // Mediabunny is pure TypeScript, no persistent instance to terminate.
}
