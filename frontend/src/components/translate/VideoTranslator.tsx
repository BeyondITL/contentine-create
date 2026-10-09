'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Languages, Upload, Loader2, Check, ArrowRight, Volume2,
  AlertTriangle, Download, FileText, RefreshCcw, X, Mic, HardDriveDownload,
} from 'lucide-react';
import type { TranslationProgress, TranslationLanguage, EngineReadiness } from '@/engine/translation-pipeline';
import type { WhisperStatus } from '@/engine/whisper-engine';

const LANGUAGES = [
  { code: 'en', name: 'English', flag: '\u{1F1FA}\u{1F1F8}' },
  { code: 'es', name: 'Spanish', flag: '\u{1F1EA}\u{1F1F8}' },
  { code: 'fr', name: 'French', flag: '\u{1F1EB}\u{1F1F7}' },
  { code: 'de', name: 'German', flag: '\u{1F1E9}\u{1F1EA}' },
  { code: 'zh', name: 'Chinese', flag: '\u{1F1E8}\u{1F1F3}' },
  { code: 'ja', name: 'Japanese', flag: '\u{1F1EF}\u{1F1F5}' },
  { code: 'ko', name: 'Korean', flag: '\u{1F1F0}\u{1F1F7}' },
  { code: 'pt', name: 'Portuguese', flag: '\u{1F1E7}\u{1F1F7}' },
  { code: 'it', name: 'Italian', flag: '\u{1F1EE}\u{1F1F9}' },
  { code: 'hi', name: 'Hindi', flag: '\u{1F1EE}\u{1F1F3}' },
] as const;

/** Video translator component — translate video audio to another language with lip-sync. */
export default function VideoTranslator() {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [targetLang, setTargetLang] = useState<TranslationLanguage>('es');
  const [useVoiceClone, setUseVoiceClone] = useState(false);
  const [progress, setProgress] = useState<TranslationProgress | null>(null);
  const [resultUrl, setResultUrl] = useState('');
  const [error, setError] = useState('');
  const [engineStatus, setEngineStatus] = useState<EngineReadiness | null>(null);
  const [checkingEngines, setCheckingEngines] = useState(false);
  const [showSourceText, setShowSourceText] = useState(false);
  const [sourceText, setSourceText] = useState('');
  const [isTranslating, setIsTranslating] = useState(false);
  const [whisperStatus, setWhisperStatus] = useState<WhisperStatus>('not-downloaded');
  const [whisperProgress, setWhisperProgress] = useState(0);
  const [isDownloadingWhisper, setIsDownloadingWhisper] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Check engine readiness on mount
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      setCheckingEngines(true);
      try {
        const { checkEngineReadiness } = await import('@/engine/translation-pipeline');
        const status = await checkEngineReadiness();
        if (!cancelled) setEngineStatus(status);
      } catch {
        // Non-critical — the pipeline will handle missing engines gracefully
      }
      if (!cancelled) setCheckingEngines(false);
    };
    check();
    return () => { cancelled = true; };
  }, []);

  // Subscribe to Whisper engine status changes
  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    const setup = async () => {
      try {
        const { whisperEngine } = await import('@/engine/whisper-engine');
        setWhisperStatus(whisperEngine.getStatus());
        unsubscribe = whisperEngine.onStatusChange((status, progress) => {
          setWhisperStatus(status);
          if (typeof progress === 'number') setWhisperProgress(progress);
          if (status === 'ready' || status === 'error' || status === 'not-downloaded') {
            setIsDownloadingWhisper(false);
          }
        });
      } catch {
        // Whisper engine module not available
      }
    };
    setup();
    return () => { unsubscribe?.(); };
  }, []);

  const handleFileDrop = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('video/')) {
      setError('Please upload a video file (MP4, WebM, or MOV).');
      return;
    }
    if (file.size > 500 * 1024 * 1024) {
      setError('Video is too large. Maximum file size is 500MB.');
      return;
    }
    // Clean up previous object URLs
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    setVideoFile(file);
    setVideoUrl(URL.createObjectURL(file));
    setError('');
    setResultUrl('');
    setProgress(null);
  }, [videoUrl, resultUrl]);

  const resetState = useCallback(() => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    setVideoFile(null);
    setVideoUrl('');
    setResultUrl('');
    setProgress(null);
    setError('');
    setSourceText('');
    setShowSourceText(false);
    setIsTranslating(false);
  }, [videoUrl, resultUrl]);

  const startTranslation = useCallback(async () => {
    if (!videoFile || isTranslating) return;
    setError('');
    setResultUrl('');
    setIsTranslating(true);
    setProgress({ stage: 'checking', progress: 0, message: 'Preparing pipeline...' });

    try {
      const { TranslationPipeline } = await import('@/engine/translation-pipeline');
      const pipeline = new TranslationPipeline((p: TranslationProgress) => setProgress(p));
      const result = await pipeline.translate(videoFile, targetLang, {
        useVoiceClone,
        sourceText: showSourceText ? sourceText : undefined,
      });
      const blobUrl = URL.createObjectURL(result);
      setResultUrl(blobUrl);
      setProgress({ stage: 'complete', progress: 100, message: 'Translation complete!' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Translation failed. Please try again.';
      setError(message);
      setProgress(null);
    } finally {
      setIsTranslating(false);
    }
  }, [videoFile, targetLang, useVoiceClone, showSourceText, sourceText, isTranslating]);

  /** Pre-download the Whisper model so transcription is instant later. */
  const downloadWhisperModel = useCallback(async () => {
    if (isDownloadingWhisper || whisperStatus === 'ready') return;
    setIsDownloadingWhisper(true);
    setWhisperProgress(0);
    try {
      const { whisperEngine } = await import('@/engine/whisper-engine');
      await whisperEngine.init((p) => setWhisperProgress(p));
    } catch {
      setIsDownloadingWhisper(false);
    }
  }, [isDownloadingWhisper, whisperStatus]);

  const stageLabels: Record<string, string> = {
    checking: 'Preparing',
    extracting: 'Extracting Audio',
    transcribing: 'Transcribing',
    translating: 'Translating',
    synthesizing: 'Generating Speech',
    animating: 'Re-syncing Lips',
    compositing: 'Compositing Video',
    complete: 'Complete',
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-accent/10 flex items-center justify-center">
          <Languages className="w-5 h-5 text-accent" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-text dark:text-white">Video Translator</h2>
          <p className="text-xs text-text-muted">Translate video audio with automatic lip-sync</p>
        </div>
      </div>

      {/* Engine Status Banner */}
      {engineStatus && !isTranslating && !resultUrl && (
        <div className="p-3 rounded-lg bg-black/[0.02] dark:bg-white/[0.04] space-y-2">
          <p className="text-[10px] font-medium text-text-muted uppercase tracking-wider">Engine Status</p>
          <div className="flex flex-wrap gap-2">
            <EngineStatusBadge label="TTS (Kokoro)" status={engineStatus.tts} />
            <EngineStatusBadge label="Lip-Sync (Wav2Lip)" status={engineStatus.wav2lip} />
            <EngineStatusBadge label="WebCodecs" status={engineStatus.webcodecs} />
            <WhisperStatusBadge status={whisperStatus} />
          </div>
          {engineStatus.tts === 'needs-download' && (
            <p className="text-[10px] text-text-muted">
              TTS voice model (~87MB) will be downloaded on first use. This only happens once.
            </p>
          )}
          {engineStatus.wav2lip === 'unavailable' && (
            <p className="text-[10px] text-text-muted">
              Lip-sync model not available. Translation will replace audio only (no lip animation).
            </p>
          )}

          {/* Whisper download section */}
          {whisperStatus === 'not-downloaded' && !isDownloadingWhisper && (
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={downloadWhisperModel}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[10px] font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
              >
                <HardDriveDownload className="w-3 h-3" />
                Download Whisper STT (~40MB)
              </button>
              <span className="text-[10px] text-text-muted">
                Enables in-browser transcription without server
              </span>
            </div>
          )}
          {(whisperStatus === 'downloading' || isDownloadingWhisper) && (
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center gap-2">
                <Loader2 className="w-3 h-3 text-primary animate-spin" />
                <span className="text-[10px] font-medium text-text dark:text-white">
                  Downloading Whisper model... {Math.round(whisperProgress * 100)}%
                </span>
              </div>
              <div className="h-1.5 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all duration-300"
                  style={{ width: `${Math.round(whisperProgress * 100)}%` }}
                />
              </div>
              <p className="text-[10px] text-text-muted">This only happens once. The model is cached in your browser.</p>
            </div>
          )}
          {whisperStatus === 'ready' && (
            <p className="text-[10px] text-secondary flex items-center gap-1 pt-1">
              <Check className="w-3 h-3" />
              Whisper STT ready. Transcription will run in your browser.
            </p>
          )}
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="p-3 rounded-lg bg-danger/10 text-danger text-xs flex items-start gap-2" role="alert">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p>{error}</p>
            {error.includes('transcript') && !showSourceText && (
              <button
                onClick={() => setShowSourceText(true)}
                className="mt-2 text-primary underline text-[10px] font-medium"
              >
                Provide transcript manually
              </button>
            )}
          </div>
          <button onClick={() => setError('')} className="shrink-0 p-0.5 hover:bg-danger/10 rounded">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Video Upload */}
      {!videoFile ? (
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full py-12 rounded-xl border-2 border-dashed border-border dark:border-white/10 hover:border-primary/30 hover:bg-primary/[0.02] dark:hover:bg-primary/[0.05] transition-all flex flex-col items-center gap-3"
          aria-label="Upload a video file to translate"
        >
          <Upload className="w-8 h-8 text-text-muted" />
          <span className="text-sm font-medium text-text dark:text-white">Upload a video to translate</span>
          <span className="text-xs text-text-muted">MP4, WebM, MOV supported (max 500MB)</span>
        </button>
      ) : (
        <div className="relative rounded-xl overflow-hidden bg-black group">
          <video src={videoUrl} controls className="w-full max-h-[300px]" />
          {!isTranslating && (
            <button
              onClick={resetState}
              className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity"
              aria-label="Remove video"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}
      <input ref={fileInputRef} type="file" accept="video/*" className="hidden" onChange={handleFileDrop} />

      {/* Configuration (only when video is loaded and not translating) */}
      {videoFile && !isTranslating && !resultUrl && (
        <>
          {/* Language Selection */}
          <div>
            <label className="block text-xs font-medium text-text-muted mb-2">Target Language</label>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {LANGUAGES.map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => setTargetLang(lang.code as TranslationLanguage)}
                  className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                    targetLang === lang.code
                      ? 'bg-primary text-white ring-2 ring-primary/20'
                      : 'bg-black/[0.03] dark:bg-white/[0.06] text-text dark:text-white hover:bg-black/[0.06] dark:hover:bg-white/[0.1]'
                  }`}
                  aria-pressed={targetLang === lang.code}
                >
                  {lang.flag} {lang.name}
                </button>
              ))}
            </div>
          </div>

          {/* Source Text Input (optional — bypasses transcription) */}
          <div>
            <button
              onClick={() => setShowSourceText(!showSourceText)}
              className="flex items-center gap-2 text-xs font-medium text-primary hover:text-primary-hover transition-colors"
            >
              <FileText className="w-3.5 h-3.5" />
              {showSourceText ? 'Hide transcript input' : 'I have the transcript (skip transcription)'}
            </button>
            {showSourceText && (
              <textarea
                value={sourceText}
                onChange={(e) => setSourceText(e.target.value)}
                placeholder="Paste the original transcript here. This will be translated directly, skipping the transcription step."
                className="mt-2 w-full h-28 p-3 rounded-lg border border-border dark:border-white/10 bg-white dark:bg-white/[0.04] text-sm text-text dark:text-white placeholder:text-text-muted resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            )}
          </div>

          {/* Voice Clone Toggle */}
          <label className="flex items-center gap-3 p-3 rounded-lg bg-black/[0.02] dark:bg-white/[0.04] cursor-pointer">
            <input
              type="checkbox"
              checked={useVoiceClone}
              onChange={(e) => setUseVoiceClone(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-black/10 dark:bg-white/10 rounded-full peer-checked:bg-primary relative transition-colors">
              <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${useVoiceClone ? 'translate-x-4' : ''}`} />
            </div>
            <div>
              <span className="text-xs font-medium text-text dark:text-white flex items-center gap-1">
                <Volume2 className="w-3.5 h-3.5" /> Clone original speaker voice
              </span>
              <span className="text-[10px] text-text-muted">Uses F5-TTS to match the original speaker (requires F5-TTS model)</span>
            </div>
          </label>

          {/* Translate Button */}
          <button
            onClick={startTranslation}
            disabled={showSourceText && !sourceText.trim()}
            className="w-full py-3 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            Translate Video <ArrowRight className="w-4 h-4" />
          </button>
        </>
      )}

      {/* Progress */}
      {progress && progress.stage !== 'complete' && (
        <div className="space-y-3 p-4 rounded-xl bg-black/[0.02] dark:bg-white/[0.04]">
          <div className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 text-primary animate-spin" />
            <span className="text-xs font-medium text-text dark:text-white">
              {stageLabels[progress.stage] || progress.stage}
            </span>
          </div>
          <div className="h-2 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary via-accent to-secondary transition-all duration-500"
              style={{ width: `${progress.progress}%` }}
              role="progressbar"
              aria-valuenow={progress.progress}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
          <p className="text-[10px] text-text-muted">{progress.message}</p>
        </div>
      )}

      {/* Result */}
      {resultUrl && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-secondary">
            <Check className="w-4 h-4" />
            <span className="text-xs font-medium">Translation complete!</span>
          </div>
          <div className="rounded-xl overflow-hidden bg-black">
            <video src={resultUrl} controls className="w-full max-h-[300px]" />
          </div>
          <div className="flex gap-2">
            <a
              href={resultUrl}
              download={`translated_${targetLang}.mp4`}
              className="flex-1 py-2.5 rounded-lg bg-secondary text-white text-xs font-medium text-center hover:bg-secondary-hover transition-colors flex items-center justify-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              Download Translated Video
            </a>
            <button
              onClick={resetState}
              className="px-4 py-2.5 rounded-lg border border-border dark:border-white/10 text-xs font-medium text-text dark:text-white hover:bg-black/[0.03] dark:hover:bg-white/[0.06] transition-colors flex items-center gap-1.5"
            >
              <RefreshCcw className="w-3.5 h-3.5" />
              New Translation
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Small badge showing Whisper engine readiness status. */
function WhisperStatusBadge({ status }: { status: WhisperStatus }) {
  const config: Record<WhisperStatus, { bg: string; text: string; dot: string; label: string }> = {
    'not-downloaded': { bg: 'bg-warning/10', text: 'text-warning', dot: 'bg-warning', label: 'Will download' },
    downloading: { bg: 'bg-info/10', text: 'text-info', dot: 'bg-info', label: 'Downloading' },
    loading: { bg: 'bg-info/10', text: 'text-info', dot: 'bg-info', label: 'Loading' },
    ready: { bg: 'bg-secondary/10', text: 'text-secondary', dot: 'bg-secondary', label: 'Ready' },
    error: { bg: 'bg-danger/10', text: 'text-danger', dot: 'bg-danger', label: 'Error' },
  };
  const c = config[status] || config['not-downloaded'];

  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-medium ${c.bg} ${c.text}`}>
      <Mic className="w-2.5 h-2.5" />
      STT (Whisper): {c.label}
    </span>
  );
}

/** Small badge showing engine readiness status. */
function EngineStatusBadge({ label, status }: { label: string; status: string }) {
  const config = {
    ready: { bg: 'bg-secondary/10', text: 'text-secondary', dot: 'bg-secondary' },
    'needs-download': { bg: 'bg-warning/10', text: 'text-warning', dot: 'bg-warning' },
    unavailable: { bg: 'bg-black/[0.04] dark:bg-white/[0.06]', text: 'text-text-muted', dot: 'bg-text-muted' },
  }[status] || { bg: 'bg-black/[0.04]', text: 'text-text-muted', dot: 'bg-text-muted' };

  const statusLabel = {
    ready: 'Ready',
    'needs-download': 'Will download',
    unavailable: 'Not available',
  }[status] || 'Unknown';

  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-medium ${config.bg} ${config.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      {label}: {statusLabel}
    </span>
  );
}
