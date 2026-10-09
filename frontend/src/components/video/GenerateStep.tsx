'use client';

import { useState, useRef, useCallback } from 'react';
import {
  Play,
  Image as ImageIcon,
  Mic,
  Palette,
  Clock,
  FileText,
  Monitor,
  Smartphone,
  Square,
  Check,
  AlertCircle,
  AlertTriangle,
  Loader2,
  ExternalLink,
  RotateCcw,
  Download,
} from 'lucide-react';
import { useEditorStore } from '@/stores/editor-store';
import { useVideoStore } from '@/stores/video-store';
import { ProgressBar } from '@/components/ui';
import AiGeneratedBadge from '@/components/shared/AiGeneratedBadge';
import type { RenderPhase } from '@/types';

/** Phase-specific labels shown to the user during rendering. */
const PHASE_LABELS: Record<string, string> = {
  idle: 'Preparing...',
  tts: 'Generating voiceover...',
  images: 'Loading scene images...',
  compositing: 'Compositing video frames...',
  encoding: 'Encoding video...',
  muxing: 'Finalizing MP4...',
  uploading: 'Uploading your video...',
  complete: 'Video ready!',
  error: 'Something went wrong',
};

/** Step 5 -- Summary card + Generate button + render progress with error recovery. */
export default function GenerateStep() {
  const editor = useEditorStore();
  const videoStore = useVideoStore();
  const [isRendering, setIsRendering] = useState(false);
  const [renderComplete, setRenderComplete] = useState(false);
  const [videoId, setVideoId] = useState<number | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [renderWarnings, setRenderWarnings] = useState<string[]>([]);
  const mp4BlobRef = useRef<Blob | null>(null);

  const missingImages = editor.scenes.filter((s) => !s.image_url).length;
  const missingNarration = editor.scenes.filter((s) => !s.narration.trim()).length;
  const hasVoice = editor.voiceId !== null;
  const canGenerate = missingImages === 0 && missingNarration === 0 && hasVoice;

  const totalDuration = editor.scenes.reduce((sum, s) => sum + s.duration, 0);

  const aspectIcon = editor.aspectRatio === '9:16'
    ? <Smartphone size={14} />
    : editor.aspectRatio === '16:9'
      ? <Monitor size={14} />
      : <Square size={14} />;

  /** Resolve the numeric editor voiceId to a Kokoro voice ID string (e.g. 'af_sky'). */
  function resolveKokoroVoiceId(): string {
    const profile = editor.voices.find((v) => v.id === editor.voiceId);
    if (profile?.kokoro_voice_id) return profile.kokoro_voice_id;
    // For cloned voices, use the matched Kokoro ID for TTS synthesis
    if (profile?.matched_kokoro_id) return profile.matched_kokoro_id;
    return 'af_sky'; // Safe default
  }

  /** Reset render state for a fresh attempt. */
  const resetRenderState = useCallback(() => {
    setRenderError(null);
    setRenderWarnings([]);
    setRenderComplete(false);
    mp4BlobRef.current = null;
    videoStore.setRenderPhase('idle');
    videoStore.setRenderProgress(0);
  }, [videoStore]);

  async function handleGenerate() {
    if (!canGenerate) return;
    setIsRendering(true);
    resetRenderState();

    let backendVideoId: number | null = null;

    try {
      // Attempt to create video record in backend (non-blocking -- render proceeds if backend is down)
      try {
        const video = await videoStore.createVideo({
          title: editor.title || `Video ${new Date().toLocaleDateString()}`,
          type: 'faceless',
          aspect_ratio: editor.aspectRatio,
          script_json: editor.toScriptJSON(),
          voice_profile_id: editor.voiceId,
          status: 'rendering',
        });
        backendVideoId = video.id;
        setVideoId(video.id);
      } catch {
        // Backend unavailable -- render locally without server record
        console.warn('[GenerateStep] Backend unavailable, rendering locally');
      }

      // Build ScriptJSON for the render pipeline
      const scriptJSON = editor.toScriptJSON();

      // Resolve Kokoro voice ID from the selected voice profile
      const kokoroVoiceId = resolveKokoroVoiceId();

      // Dynamic import -- prevents kokoro-js/onnxruntime-node from being statically bundled by webpack.
      // The render pipeline and its dependencies (TTS, WebCodecs, Mediabunny) are loaded at runtime only.
      const { renderVideo, uploadVideo } = await import('@/engine/render-pipeline');

      // Run the real render pipeline (browser-side TTS -> Ken Burns -> WebCodecs -> Mediabunny)
      const renderResult = await renderVideo({
        script: scriptJSON,
        voiceId: kokoroVoiceId,
        voiceSpeed: editor.voiceSpeed,
        onPhaseChange: (phase: RenderPhase, message: string) => {
          videoStore.setRenderPhase(phase, message);
        },
        onProgress: (percent: number) => {
          videoStore.setRenderProgress(percent);
        },
      });

      mp4BlobRef.current = renderResult.blob;

      // Capture any warnings from partial failures (guard the shape — LT-02/LT-05)
      const renderWarnings = renderResult?.warnings ?? [];
      if (renderWarnings.length > 0) {
        setRenderWarnings(renderWarnings);
      }

      // Upload to backend if we have a video record
      if (backendVideoId !== null) {
        try {
          videoStore.setRenderPhase('uploading' as RenderPhase, 'Uploading your video...');
          videoStore.setRenderProgress(96);

          const mp4Path = await uploadVideo(backendVideoId, renderResult.blob);

          // Update video record with mp4 path and completion status
          await videoStore.updateVideo(backendVideoId, {
            status: 'completed',
            mp4_path: mp4Path,
            duration_seconds: totalDuration,
          });
        } catch {
          // Upload failed -- video is still available for local download
          console.warn('[GenerateStep] Upload failed, video available for local download');
        }
      }

      videoStore.setRenderPhase('complete', 'Video ready!');
      videoStore.setRenderProgress(100);
      setRenderComplete(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Render failed. Please try again.';
      videoStore.setRenderPhase('error', message);
      setRenderError(message);
    } finally {
      setIsRendering(false);
    }
  }

  function handleDownload() {
    if (!mp4BlobRef.current) return;
    const url = URL.createObjectURL(mp4BlobRef.current);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${editor.title || 'video'}.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function handleRetry() {
    // handleGenerate already calls resetRenderState() as its first action;
    // calling it directly avoids the state race and eliminates the 100ms delay.
    handleGenerate();
  }

  const rp = videoStore.renderProgress;
  const hasPartialWarnings = renderWarnings.length > 0;

  return (
    <div className="space-y-6">
      {/* Summary card */}
      <div className="bg-white dark:bg-[#1e1e1e] rounded-xl border border-border-light dark:border-[#333] overflow-hidden">
        <div className="px-4 md:px-5 py-4 border-b border-border-light dark:border-[#333]">
          <h3 className="text-base font-semibold text-text dark:text-white">
            {editor.title || `Video ${new Date().toLocaleDateString()}`}
          </h3>
          <p className="text-xs text-muted mt-0.5">Review your settings before generating</p>
        </div>

        <div className="divide-y divide-border-light dark:divide-[#333]">
          <SummaryRow
            icon={<FileText size={16} />}
            label="Script"
            value={`${editor.scenes.length} scenes, ~${totalDuration}s`}
            status={missingNarration === 0 ? 'ok' : 'warning'}
            warning={missingNarration > 0 ? `${missingNarration} scene${missingNarration > 1 ? 's' : ''} missing narration` : undefined}
          />
          <SummaryRow
            icon={<ImageIcon size={16} />}
            label="Visuals"
            value={`${editor.scenes.length - missingImages}/${editor.scenes.length} images`}
            status={missingImages === 0 ? 'ok' : 'warning'}
            warning={missingImages > 0 ? `${missingImages} scene${missingImages > 1 ? 's' : ''} need images` : undefined}
          />
          <SummaryRow
            icon={<Mic size={16} />}
            label="Voice"
            value={hasVoice
              ? `${editor.voices.find((v) => v.id === editor.voiceId)?.name || 'Selected'} (${editor.voiceSpeed}x)`
              : 'Not selected'
            }
            status={hasVoice ? 'ok' : 'error'}
            warning={!hasVoice ? 'Select a voice in Step 3' : undefined}
          />
          <SummaryRow
            icon={<Palette size={16} />}
            label="Style"
            value={`${editor.subtitleStyle} / ${editor.transitionStyle}`}
            status="ok"
          />
          <SummaryRow
            icon={aspectIcon}
            label="Format"
            value={editor.aspectRatio}
            status="ok"
          />
          <SummaryRow
            icon={<Clock size={16} />}
            label="Est. Duration"
            value={totalDuration >= 60 ? `${Math.floor(totalDuration / 60)}m ${totalDuration % 60}s` : `${totalDuration}s`}
            status="ok"
          />
        </div>
      </div>

      {/* Render progress */}
      {(isRendering || renderComplete || renderError) && rp.phase !== 'idle' && (
        <div className="bg-white dark:bg-[#1e1e1e] rounded-xl border border-border-light dark:border-[#333] p-4 md:p-5">
          <ProgressBar
            percent={rp.percent}
            message={rp.message || PHASE_LABELS[rp.phase] || 'Processing...'}
            subtitle={
              rp.phase === 'complete'
                ? (hasPartialWarnings ? 'Video ready (with warnings)' : 'Your video is ready')
                : rp.phase === 'error'
                  ? 'Something went wrong'
                  : PHASE_LABELS[rp.phase] || `Phase: ${rp.phase}`
            }
          />

          {/* Partial success warnings */}
          {renderComplete && hasPartialWarnings && (
            <div className="mt-4 p-3 bg-warning/5 border border-warning/20 rounded-lg">
              <div className="flex items-start gap-2 mb-2">
                <AlertTriangle size={16} className="text-warning mt-0.5 shrink-0" />
                <p className="text-sm font-medium text-warning">
                  Video rendered with {renderWarnings.length} warning{renderWarnings.length > 1 ? 's' : ''}
                </p>
              </div>
              <ul className="ml-6 space-y-1">
                {renderWarnings.map((warning, idx) => (
                  <li key={idx} className="text-xs text-muted list-disc">
                    {warning}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted mt-2">
                Your video is still available for download. Some scenes may have placeholder visuals or silent audio.
              </p>
            </div>
          )}

          {/* Error state with retry */}
          {renderError && (
            <div className="mt-4 p-3 bg-danger/5 border border-danger/20 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertCircle size={16} className="text-danger mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-danger">Render failed</p>
                  <p className="text-xs text-muted mt-1 break-words">{renderError}</p>
                  <div className="mt-3 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={handleRetry}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[44px] md:min-h-0 bg-primary text-white rounded-lg text-xs font-medium hover:bg-primary-hover transition-colors active:scale-[0.98]"
                    >
                      <RotateCcw size={13} />
                      Retry
                    </button>
                    <button
                      type="button"
                      onClick={resetRenderState}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[44px] md:min-h-0 text-xs text-muted hover:text-text dark:hover:text-white transition-colors"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* AI-generated disclosure (EU AI Act Art. 50) — visible on the result */}
          {renderComplete && (
            <div className="mt-4">
              <AiGeneratedBadge />
            </div>
          )}

          {/* Success actions */}
          {renderComplete && (
            <div className="mt-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <button
                type="button"
                onClick={handleDownload}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] md:min-h-0 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover transition-colors active:scale-[0.98]"
              >
                <Download size={16} />
                Download Video
              </button>
              {videoId && (
                <a
                  href={`/videos/`}
                  className="flex items-center justify-center gap-1.5 px-4 py-2.5 min-h-[44px] md:min-h-0 bg-surface dark:bg-[#2a2a2a] text-text dark:text-white rounded-lg text-sm font-medium hover:bg-border-light dark:hover:bg-[#333] transition-colors"
                >
                  <ExternalLink size={14} />
                  My Videos
                </a>
              )}
              <button
                type="button"
                onClick={() => {
                  mp4BlobRef.current = null;
                  editor.reset();
                  resetRenderState();
                  setVideoId(null);
                }}
                className="px-4 py-2.5 min-h-[44px] md:min-h-0 bg-surface dark:bg-[#2a2a2a] text-text dark:text-white rounded-lg text-sm font-medium hover:bg-border-light dark:hover:bg-[#333] transition-colors"
              >
                Create Another
              </button>
            </div>
          )}
        </div>
      )}

      {/* Generate button */}
      {!isRendering && !renderComplete && !renderError && (
        <button
          type="button"
          onClick={handleGenerate}
          disabled={!canGenerate}
          className="w-full flex items-center justify-center gap-2 py-4 min-h-[48px] bg-gradient-to-r from-primary via-accent to-secondary text-white rounded-xl text-base font-semibold hover:opacity-90 transition-all active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-primary/20"
        >
          <Play size={20} />
          Generate Video
        </button>
      )}

      {/* Rendering in progress button (disabled) */}
      {isRendering && (
        <button
          type="button"
          disabled
          className="w-full flex items-center justify-center gap-2 py-4 min-h-[48px] bg-gradient-to-r from-primary via-accent to-secondary text-white rounded-xl text-base font-semibold opacity-80 cursor-not-allowed"
        >
          <Loader2 size={20} className="animate-spin" />
          Rendering -- do not close this tab
        </button>
      )}

      {/* Warnings */}
      {!canGenerate && !isRendering && !renderComplete && !renderError && (
        <p className="text-xs text-warning text-center">
          Complete all required fields before generating
        </p>
      )}
    </div>
  );
}

/** Summary row for the pre-render checklist. */
function SummaryRow({
  icon,
  label,
  value,
  status,
  warning,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  status: 'ok' | 'warning' | 'error';
  warning?: string;
}) {
  return (
    <div className="flex items-center justify-between px-4 md:px-5 py-3 min-h-[44px] md:min-h-0">
      <div className="flex items-center gap-3">
        <div className="text-muted">{icon}</div>
        <div>
          <span className="text-sm font-medium text-text dark:text-white">{label}</span>
          {warning && (
            <p className={`text-[11px] mt-0.5 ${status === 'error' ? 'text-danger' : 'text-warning'}`}>
              {warning}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted">{value}</span>
        {status === 'ok' && <Check size={14} className="text-secondary" />}
        {status === 'warning' && <AlertCircle size={14} className="text-warning" />}
        {status === 'error' && <AlertCircle size={14} className="text-danger" />}
      </div>
    </div>
  );
}
