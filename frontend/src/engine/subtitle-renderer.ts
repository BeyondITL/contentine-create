/**
 * Contentine Create — Subtitle Renderer
 * Draws word-by-word or phrase-by-phrase subtitles onto a canvas frame.
 * Supports multiple visual styles defined in the UI_UX_SPEC.
 */

export interface SubtitleStyle {
  fontFamily: string;
  fontSize: number;
  fontWeight: string;
  color: string;
  strokeColor?: string;
  strokeWidth?: number;
  backgroundColor?: string;
  backgroundPadding?: number;
  position: 'bottom' | 'center' | 'top';
  maxWidth: number; // percentage of canvas width (0.0 - 1.0)
}

/** Built-in subtitle style presets. */
export const SUBTITLE_PRESETS: Record<string, SubtitleStyle> = {
  'modern-pop': {
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 36,
    fontWeight: '800',
    color: '#FFFFFF',
    strokeColor: '#000000',
    strokeWidth: 4,
    position: 'bottom',
    maxWidth: 0.85,
  },
  'minimal-white': {
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 28,
    fontWeight: '500',
    color: '#FFFFFF',
    strokeColor: 'rgba(0,0,0,0.3)',
    strokeWidth: 2,
    position: 'bottom',
    maxWidth: 0.8,
  },
  'bold-yellow': {
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 38,
    fontWeight: '900',
    color: '#FFD700',
    strokeColor: '#000000',
    strokeWidth: 5,
    position: 'center',
    maxWidth: 0.8,
  },
  'news-ticker': {
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 24,
    fontWeight: '500',
    color: '#FFFFFF',
    backgroundColor: 'rgba(220, 38, 38, 0.9)',
    backgroundPadding: 12,
    position: 'bottom',
    maxWidth: 1.0,
  },
  'karaoke': {
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 32,
    fontWeight: '700',
    color: '#00C3FF',
    strokeColor: '#000000',
    strokeWidth: 3,
    position: 'bottom',
    maxWidth: 0.85,
  },
  'typewriter': {
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: 22,
    fontWeight: '400',
    color: '#FFFFFF',
    backgroundColor: 'rgba(0,0,0,0.7)',
    backgroundPadding: 10,
    position: 'bottom',
    maxWidth: 0.9,
  },
  'outline': {
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 36,
    fontWeight: '800',
    color: 'transparent',
    strokeColor: '#FFFFFF',
    strokeWidth: 2,
    position: 'bottom',
    maxWidth: 0.85,
  },
  'none': {
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 0,
    fontWeight: '400',
    color: 'transparent',
    position: 'bottom',
    maxWidth: 0,
  },
};

/**
 * Word timing for karaoke-style highlighting.
 */
export interface WordTiming {
  word: string;
  startTime: number; // seconds
  endTime: number;   // seconds
}

/** A single transcription segment with a real [start, end] time span (Whisper chunk shape). */
export interface TranscriptChunk {
  text: string;
  timestamp: [number, number];
}

/**
 * Build word timings from real Whisper transcription chunks instead of the
 * proportional estimate in {@link generateWordTimings}. Each chunk carries a
 * true [start, end] span from the ASR model; the chunk's words are distributed
 * evenly across that span so captions land on the actual spoken timing of
 * uploaded media (F-8: join Whisper → subtitle renderer).
 *
 * Chunks with a missing/degenerate end timestamp (Whisper occasionally emits a
 * null end on the final chunk) fall back to a fixed per-word duration so the
 * segment still renders rather than collapsing to zero length.
 */
export function wordTimingsFromChunks(
  chunks: TranscriptChunk[],
  fallbackWordDuration = 0.4,
): WordTiming[] {
  const timings: WordTiming[] = [];

  for (const chunk of chunks) {
    const words = chunk.text.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;

    const start = Number.isFinite(chunk.timestamp?.[0]) ? chunk.timestamp[0] : (timings.at(-1)?.endTime ?? 0);
    const rawEnd = chunk.timestamp?.[1];
    const end = Number.isFinite(rawEnd) && (rawEnd as number) > start
      ? (rawEnd as number)
      : start + words.length * fallbackWordDuration;

    const perWord = (end - start) / words.length;
    for (let i = 0; i < words.length; i++) {
      timings.push({
        word: words[i],
        startTime: start + i * perWord,
        endTime: start + (i + 1) * perWord,
      });
    }
  }

  return timings;
}

/**
 * Generate approximate word timings from narration text and total duration.
 * Uses word count for proportional distribution.
 */
export function generateWordTimings(text: string, startTime: number, duration: number): WordTiming[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const timings: WordTiming[] = [];
  const wordDuration = duration / words.length;

  for (let i = 0; i < words.length; i++) {
    timings.push({
      word: words[i],
      startTime: startTime + i * wordDuration,
      endTime: startTime + (i + 1) * wordDuration,
    });
  }

  return timings;
}

/**
 * Get the current display text at a given timestamp.
 * Shows a sliding window of words (typically 5-8 words visible at once).
 */
export function getCurrentSubtitleText(
  timings: WordTiming[],
  currentTime: number,
  windowSize: number = 6
): { text: string; activeWordIndex: number } {
  // Find the active word
  const activeIdx = timings.findIndex(
    (w) => currentTime >= w.startTime && currentTime < w.endTime
  );

  if (activeIdx === -1) return { text: '', activeWordIndex: -1 };

  // Show a window of words around the active word
  const halfWindow = Math.floor(windowSize / 2);
  const start = Math.max(0, activeIdx - halfWindow);
  const end = Math.min(timings.length, start + windowSize);

  const visibleWords = timings.slice(start, end).map((w) => w.word);

  return {
    text: visibleWords.join(' '),
    activeWordIndex: activeIdx - start,
  };
}

/**
 * Render subtitles onto a canvas context at a given time.
 */
export function renderSubtitle(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  text: string,
  style: SubtitleStyle,
  activeWordIndex?: number
): void {
  if (style.fontSize === 0 || !text) return;

  // Scale font size based on canvas resolution
  const scaleFactor = canvasWidth / 1080; // Normalize to 1080p
  const fontSize = Math.round(style.fontSize * scaleFactor);

  ctx.font = `${style.fontWeight} ${fontSize}px ${style.fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const maxTextWidth = canvasWidth * style.maxWidth;

  // Word wrap
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxTextWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);

  // Position
  const lineHeight = fontSize * 1.4;
  const totalHeight = lines.length * lineHeight;
  let baseY: number;

  switch (style.position) {
    case 'top':
      baseY = canvasHeight * 0.1 + totalHeight / 2;
      break;
    case 'center':
      baseY = canvasHeight * 0.5;
      break;
    case 'bottom':
    default:
      baseY = canvasHeight * 0.85 - totalHeight / 2;
      break;
  }

  const startY = baseY - (totalHeight - lineHeight) / 2;

  // Background (if any)
  if (style.backgroundColor) {
    const pad = (style.backgroundPadding || 8) * scaleFactor;
    const bgWidth = style.maxWidth === 1.0 ? canvasWidth : maxTextWidth + pad * 2;
    const bgHeight = totalHeight + pad * 2;
    const bgX = (canvasWidth - bgWidth) / 2;
    const bgY = startY - lineHeight / 2 - pad;

    ctx.fillStyle = style.backgroundColor;
    ctx.fillRect(bgX, bgY, bgWidth, bgHeight);
  }

  // Draw each line
  for (let i = 0; i < lines.length; i++) {
    const y = startY + i * lineHeight;
    const x = canvasWidth / 2;

    // Stroke (outline)
    if (style.strokeColor && style.strokeWidth) {
      ctx.strokeStyle = style.strokeColor;
      ctx.lineWidth = style.strokeWidth * scaleFactor;
      ctx.lineJoin = 'round';
      ctx.strokeText(lines[i], x, y);
    }

    // Fill
    if (style.color !== 'transparent') {
      ctx.fillStyle = style.color;
      ctx.fillText(lines[i], x, y);
    }
  }
}
