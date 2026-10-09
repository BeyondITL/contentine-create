'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Music,
  Upload,
  Loader2,
  Download,
  AlertTriangle,
  Check,
  Film,
  Type,
  Smartphone,
  Monitor,
  Square,
} from 'lucide-react';
import ModelRequirements from '@/components/shared/ModelRequirements';
import type { AspectRatio, RenderPhase } from '@/types';
import type { AudioScene } from '@/engine/render-pipeline';

/** Subtitle presets exposed here mirror the 8 in subtitle-renderer. */
const SUBTITLE_STYLES = [
  { id: 'modern-pop', name: 'Modern Pop' },
  { id: 'minimal-white', name: 'Minimal White' },
  { id: 'bold-yellow', name: 'Bold Yellow' },
  { id: 'news-ticker', name: 'News Ticker' },
  { id: 'karaoke', name: 'Karaoke' },
  { id: 'typewriter', name: 'Typewriter' },
  { id: 'outline', name: 'Outline' },
  { id: 'none', name: 'No Subtitles' },
] as const;

const ASPECT_RATIOS: { ratio: AspectRatio; label: string; desc: string; icon: React.ReactNode }[] = [
  { ratio: '9:16', label: '9:16', desc: 'TikTok, Reels, Shorts', icon: <Smartphone size={18} /> },
  { ratio: '16:9', label: '16:9', desc: 'YouTube, Landscape', icon: <Monitor size={18} /> },
  { ratio: '1:1', label: '1:1', desc: 'Feed, Square', icon: <Square size={18} /> },
];

/** Audio to Video — transcribe an uploaded audio file and render a captioned MP4 (F-11). */
export default function AudioToVideoPage() {
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('9:16');
  const [subtitleStyle, setSubtitleStyle] = useState<string>('modern-pop');

  const [isRendering, setIsRendering] = useState(false);
  const [phase, setPhase] = useState<RenderPhase>('idle');
  const [phaseMessage, setPhaseMessage] = useState('');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const [transcript, setTranscript] = useState<string>('');
  const [scenes, setScenes] = useState<AudioScene[]>([]);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.title = 'Audio to Video — Contentine Create';
  }, []);

  useEffect(() => {
    return () => {
      if (audioUrl?.startsWith('blob:')) URL.revokeObjectURL(audioUrl);
      if (videoUrl?.startsWith('blob:')) URL.revokeObjectURL(videoUrl);
    };
  }, [audioUrl, videoUrl]);

  const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (audioUrl?.startsWith('blob:')) URL.revokeObjectURL(audioUrl);
    setAudioFile(file);
    setAudioUrl(URL.createObjectURL(file));
    setVideoUrl(null);
    setTranscript('');
    setScenes([]);
    setError(null);
    setWarnings([]);
  }, [audioUrl]);

  const handleGenerate = useCallback(async () => {
    if (!audioFile) return;
    setIsRendering(true);
    setError(null);
    setWarnings([]);
    setVideoUrl(null);
    setTranscript('');
    setScenes([]);
    setProgress(0);
    setPhase('transcribing');

    try {
      const { renderAudioToVideo } = await import('@/engine/render-pipeline');
      const result = await renderAudioToVideo({
        audioBlob: audioFile,
        aspectRatio,
        subtitleStyle,
        onPhaseChange: (p, msg) => { setPhase(p); setPhaseMessage(msg); },
        onProgress: setProgress,
        onTranscript: (text, parsed) => { setTranscript(text); setScenes(parsed); },
      });
      const url = URL.createObjectURL(result.blob);
      setVideoUrl(url);
      setWarnings(result.warnings);
      setPhase('complete');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create video from audio.');
      setPhase('error');
    } finally {
      setIsRendering(false);
    }
  }, [audioFile, aspectRatio, subtitleStyle]);

  const handleDownload = useCallback(() => {
    if (!videoUrl) return;
    const link = document.createElement('a');
    link.href = videoUrl;
    link.download = `audio-video-${aspectRatio.replace(':', 'x')}.mp4`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [videoUrl, aspectRatio]);

  return (
    <div className="max-w-[1180px] mx-auto animate-fade-in">
      {/* Header */}
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-0.5">
          <Music size={20} className="text-primary" />
          <h1 className="text-xl font-semibold text-text dark:text-white tracking-[-0.02em]">
            Audio to Video
          </h1>
        </div>
        <p className="text-sm text-text-muted">
          Upload a voiceover or podcast clip. It is transcribed on your device with Whisper, then
          rendered into a captioned MP4 with subtitles timed to the words you spoke.
        </p>
      </div>

      {/* On-device Whisper gate */}
      <div className="mb-5">
        <ModelRequirements
          feature="captions"
          description="Transcription runs on your device with Whisper. It downloads once, then works offline."
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Left: controls */}
        <div className="lg:col-span-3 space-y-4">
          {/* Upload */}
          <div className="bento-card p-4 md:p-5">
            <h2 className="text-[13px] font-semibold text-text dark:text-[#E0E0E0] mb-3">1. Upload audio</h2>
            {!audioFile ? (
              <label
                htmlFor="audio-upload"
                className="flex flex-col items-center justify-center gap-2 py-8 border-2 border-dashed border-black/[0.08] dark:border-white/[0.08] rounded-xl cursor-pointer hover:border-primary/30 hover:bg-primary/[0.02] dark:hover:bg-primary/[0.04] transition-all"
              >
                <div className="w-10 h-10 rounded-xl bg-primary/[0.06] flex items-center justify-center">
                  <Upload size={18} className="text-primary" />
                </div>
                <div className="text-center">
                  <p className="text-[13px] font-medium text-text dark:text-[#E0E0E0]">Upload an audio file</p>
                  <p className="text-[11px] text-text-muted mt-0.5">MP3, WAV, M4A, or OGG</p>
                </div>
                <input
                  ref={fileInputRef}
                  id="audio-upload"
                  type="file"
                  accept="audio/*"
                  onChange={handleFile}
                  className="sr-only"
                />
              </label>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface dark:bg-[#1e1e1e] border border-black/[0.06] dark:border-white/[0.06]">
                  <Music size={14} className="text-primary shrink-0" />
                  <span className="text-[12px] text-text dark:text-[#E0E0E0] truncate flex-1">{audioFile.name}</span>
                  <span className="text-[11px] text-text-muted">{(audioFile.size / (1024 * 1024)).toFixed(1)} MB</span>
                  <button
                    type="button"
                    onClick={() => { setAudioFile(null); setAudioUrl(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                    className="text-[11px] text-primary hover:text-primary-hover font-medium px-1.5"
                  >
                    Change
                  </button>
                </div>
                {audioUrl && <audio src={audioUrl} controls className="w-full" />}
              </div>
            )}
          </div>

          {/* Aspect ratio */}
          <div className={`bento-card p-4 md:p-5 ${!audioFile ? 'opacity-50 pointer-events-none' : ''}`}>
            <h2 className="text-[13px] font-semibold text-text dark:text-[#E0E0E0] mb-3">2. Aspect ratio</h2>
            <div className="grid grid-cols-3 gap-2">
              {ASPECT_RATIOS.map((ar) => {
                const active = aspectRatio === ar.ratio;
                return (
                  <button
                    key={ar.ratio}
                    type="button"
                    onClick={() => setAspectRatio(ar.ratio)}
                    aria-pressed={active}
                    className={`flex flex-col items-center gap-1.5 px-3 py-3 min-h-[44px] rounded-xl text-[12px] font-medium transition-all ${
                      active
                        ? 'bg-primary/[0.08] dark:bg-primary/[0.12] text-primary border border-primary/20 dark:border-primary/30'
                        : 'bg-surface dark:bg-[#1e1e1e] text-text-secondary dark:text-[#AAA] border border-transparent hover:bg-border-light dark:hover:bg-[#2a2a2a]'
                    }`}
                  >
                    {ar.icon}
                    <span className="font-semibold">{ar.label}</span>
                    <span className="text-[10px] opacity-60">{ar.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Subtitle style */}
          <div className={`bento-card p-4 md:p-5 ${!audioFile ? 'opacity-50 pointer-events-none' : ''}`}>
            <h2 className="text-[13px] font-semibold text-text dark:text-[#E0E0E0] mb-3 flex items-center gap-1.5">
              <Type size={14} /> 3. Subtitle style
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {SUBTITLE_STYLES.map((s) => {
                const active = subtitleStyle === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSubtitleStyle(s.id)}
                    aria-pressed={active}
                    className={`px-2 py-2 min-h-[40px] rounded-lg text-[11px] font-medium transition-all ${
                      active
                        ? 'bg-primary/[0.08] dark:bg-primary/[0.12] text-primary border border-primary/20 dark:border-primary/30'
                        : 'bg-surface dark:bg-[#1e1e1e] text-text-secondary dark:text-[#AAA] border border-transparent hover:bg-border-light dark:hover:bg-[#2a2a2a]'
                    }`}
                  >
                    {s.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-danger/[0.06] dark:bg-danger/[0.1] border border-danger/10">
              <AlertTriangle size={14} className="text-danger shrink-0 mt-0.5" />
              <p className="text-[12px] text-danger leading-relaxed">{error}</p>
            </div>
          )}

          {/* Generate */}
          <button
            type="button"
            onClick={handleGenerate}
            disabled={!audioFile || isRendering}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 min-h-[44px] rounded-xl text-[13px] font-semibold text-white bg-gradient-to-r from-primary to-accent hover:opacity-90 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {isRendering ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                {phaseMessage || 'Working...'}
              </>
            ) : (
              <>
                <Film size={16} />
                Create Video
              </>
            )}
          </button>

          {/* Progress */}
          {isRendering && (
            <div>
              <div className="w-full h-2 rounded-full bg-surface dark:bg-[#1e1e1e] overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-primary via-accent to-secondary transition-all duration-500 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-[11px] text-text-muted mt-1 text-center capitalize">
                {phase} · {progress}%
              </p>
            </div>
          )}
        </div>

        {/* Right: result + transcript */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bento-card p-4 md:p-5 lg:sticky lg:top-4">
            <h2 className="text-[13px] font-semibold text-text dark:text-[#E0E0E0] mb-3">Result</h2>
            {videoUrl ? (
              <div>
                <div className="rounded-xl overflow-hidden border border-black/[0.06] dark:border-white/[0.06] bg-black mb-3">
                  <video src={videoUrl} className="w-full max-h-[420px] object-contain" controls playsInline autoPlay />
                </div>
                {warnings.length > 0 && (
                  <ul className="mb-3 space-y-1">
                    {warnings.map((w, i) => (
                      <li key={i} className="text-[11px] text-warning flex items-start gap-1.5">
                        <AlertTriangle size={11} className="mt-0.5 shrink-0" /> {w}
                      </li>
                    ))}
                  </ul>
                )}
                <button type="button" onClick={handleDownload} className="w-full flex items-center justify-center gap-2 px-4 py-3 min-h-[44px] btn-primary">
                  <Download size={16} /> Download MP4
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center text-center py-10">
                <div className="w-14 h-14 rounded-2xl bg-primary/[0.06] flex items-center justify-center mb-3">
                  <Film size={24} className="text-primary/40" />
                </div>
                <p className="text-[13px] font-medium text-text dark:text-[#E0E0E0] mb-1">No video yet</p>
                <p className="text-[12px] text-text-muted max-w-[220px]">
                  {audioFile ? 'Click Create Video to transcribe and render.' : 'Upload an audio file to begin.'}
                </p>
              </div>
            )}
          </div>

          {/* Transcript / scenes */}
          {(transcript || scenes.length > 0) && (
            <div className="bento-card p-4 md:p-5">
              <div className="flex items-center gap-1.5 mb-2">
                <Check size={13} className="text-secondary" />
                <h3 className="text-[12px] font-semibold text-text dark:text-[#E0E0E0]">
                  Transcript · {scenes.length} scene{scenes.length !== 1 ? 's' : ''}
                </h3>
              </div>
              <div className="max-h-[240px] overflow-y-auto space-y-2">
                {scenes.map((s) => (
                  <div key={s.index} className="text-[12px] leading-relaxed">
                    <span className="text-[10px] text-text-muted mr-1.5">
                      {s.start.toFixed(1)}–{s.end.toFixed(1)}s
                    </span>
                    <span className="text-text dark:text-[#D0D0D0]">{s.text || <em className="text-text-muted">(no speech)</em>}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
