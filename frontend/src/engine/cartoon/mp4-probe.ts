/**
 * Contentine Create — Cartoon Engine: MP4 probe
 *
 * Structured stream inspection of a rendered MP4 via Mediabunny's demuxer
 * (ffprobe-equivalent evidence for the determinism gate: duration, track
 * layout, codecs, packet counts, embedded provenance). Runs anywhere the
 * engine runs — browser main thread or worker.
 */

export interface Mp4TrackProbe {
  type: 'video' | 'audio';
  codec: string | null;
  durationSec: number;
  packetCount: number;
  /** Video only. */
  width?: number;
  height?: number;
  /** Audio only. */
  sampleRate?: number;
  channels?: number;
}

export interface Mp4Probe {
  durationSec: number;
  trackCount: number;
  tracks: Mp4TrackProbe[];
  /** Container metadata (Law-L7 provenance lands in `comment`). */
  title?: string;
  comment?: string;
}

/** Probe an MP4 blob: duration, per-track codec/shape/packet counts, metadata. */
export async function probeMp4(blob: Blob): Promise<Mp4Probe> {
  const { Input, BlobSource, MP4 } = await import('mediabunny');

  const input = new Input({ source: new BlobSource(blob), formats: [MP4] });
  const durationSec = await input.computeDuration();
  const tags = await input.getMetadataTags();

  const tracks: Mp4TrackProbe[] = [];
  for (const track of await input.getTracks()) {
    const stats = await track.computePacketStats();
    if (track.isVideoTrack()) {
      tracks.push({
        type: 'video',
        codec: track.codec,
        durationSec: await track.computeDuration(),
        packetCount: stats.packetCount,
        width: track.displayWidth,
        height: track.displayHeight,
      });
    } else if (track.isAudioTrack()) {
      tracks.push({
        type: 'audio',
        codec: track.codec,
        durationSec: await track.computeDuration(),
        packetCount: stats.packetCount,
        sampleRate: track.sampleRate,
        channels: track.numberOfChannels,
      });
    }
  }

  return {
    durationSec,
    trackCount: tracks.length,
    tracks,
    title: tags.title,
    comment: tags.comment,
  };
}
