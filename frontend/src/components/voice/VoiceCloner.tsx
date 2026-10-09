'use client';

import { useState, useRef, useCallback } from 'react';
import { Mic, Square, Play, Pause, Upload, Check, X, Loader2, Sparkles, User, Download, Volume2, Info, AlertCircle, CheckCircle } from 'lucide-react';

interface VoiceCloneResult {
  name: string;
  sampleBlob: Blob;
  sampleDuration: number;
  detectedGender: 'male' | 'female' | null;
  cloneType: 'f5tts' | 'kokoro-matched';
}

interface VoiceClonerProps {
  onCloneComplete: (result: VoiceCloneResult) => void;
  onCancel?: () => void;
}

/**
 * Detect gender from audio blob using pitch analysis (fundamental frequency).
 * Female voices typically have F0 > 165 Hz, male < 165 Hz.
 */
async function detectGenderFromAudio(blob: Blob): Promise<'male' | 'female'> {
  try {
    const audioCtx = new AudioContext({ sampleRate: 16000 });
    const arrayBuffer = await blob.arrayBuffer();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    const samples = audioBuffer.getChannelData(0);

    // Auto-correlation based pitch detection
    const sampleRate = audioBuffer.sampleRate;
    const minFreq = 60;  // Hz — lowest expected male voice
    const maxFreq = 400; // Hz — highest expected female voice
    const minLag = Math.floor(sampleRate / maxFreq);
    const maxLag = Math.floor(sampleRate / minFreq);

    // Use a 50ms window from a voiced section
    const windowSize = Math.floor(sampleRate * 0.05);
    let bestCorrelation = 0;
    let bestLag = minLag;

    // Find a high-energy section (skip silence at start/end)
    let startSample = 0;
    const rms = (start: number, length: number) => {
      let sum = 0;
      for (let i = start; i < start + length && i < samples.length; i++) {
        sum += samples[i] * samples[i];
      }
      return Math.sqrt(sum / length);
    };

    // Find first section with reasonable energy
    for (let i = 0; i < samples.length - windowSize; i += windowSize) {
      if (rms(i, windowSize) > 0.02) {
        startSample = i;
        break;
      }
    }

    // Auto-correlation on the voiced section
    for (let lag = minLag; lag <= maxLag && startSample + windowSize + lag < samples.length; lag++) {
      let correlation = 0;
      let norm1 = 0;
      let norm2 = 0;

      for (let i = 0; i < windowSize; i++) {
        const s1 = samples[startSample + i];
        const s2 = samples[startSample + i + lag];
        correlation += s1 * s2;
        norm1 += s1 * s1;
        norm2 += s2 * s2;
      }

      const denom = Math.sqrt(norm1 * norm2);
      if (denom > 0) {
        const normalized = correlation / denom;
        if (normalized > bestCorrelation) {
          bestCorrelation = normalized;
          bestLag = lag;
        }
      }
    }

    const fundamentalFreq = sampleRate / bestLag;
    await audioCtx.close();

    // Threshold: ~165 Hz is the typical crossover point
    return fundamentalFreq > 165 ? 'female' : 'male';
  } catch {
    // Default to female if detection fails
    return 'female';
  }
}

/** Voice cloning component — record or upload 3+ second audio sample for voice cloning. */
export default function VoiceCloner({ onCloneComplete, onCancel }: VoiceClonerProps) {
  const [mode, setMode] = useState<'idle' | 'recording' | 'recorded' | 'uploading' | 'analyzing' | 'processing'>('idle');
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string>('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [voiceName, setVoiceName] = useState('My Voice');
  const [error, setError] = useState('');
  const [detectedGender, setDetectedGender] = useState<'male' | 'female' | null>(null);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [f5ttsAvailable, setF5ttsAvailable] = useState<boolean | null>(null);
  const [kokoroAvailable, setKokoroAvailable] = useState<boolean | null>(null);
  const [clonedPreviewUrl, setClonedPreviewUrl] = useState<string>('');
  const [isPlayingCloned, setIsPlayingCloned] = useState(false);
  const [processingMessage, setProcessingMessage] = useState('');
  const [cloneCompleted, setCloneCompleted] = useState(false);
  const [finalCloneType, setFinalCloneType] = useState<'f5tts' | 'kokoro-matched' | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const clonedAudioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /** Start recording from microphone. */
  const startRecording = useCallback(async () => {
    try {
      setError('');
      setDetectedGender(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { sampleRate: 16000, channelCount: 1 } });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        stream.getTracks().forEach((t) => t.stop());

        // Auto-detect gender
        setMode('analyzing');
        setAnalysisProgress(0);
        const progressInterval = setInterval(() => {
          setAnalysisProgress((p) => Math.min(p + 15, 85));
        }, 200);

        const gender = await detectGenderFromAudio(blob);
        clearInterval(progressInterval);
        setAnalysisProgress(100);
        setDetectedGender(gender);

        // Yield for two animation frames so the browser paints the 100% state
        // before transitioning — gated on real completion, not a fixed timer.
        await new Promise<void>((r) => { requestAnimationFrame(() => { requestAnimationFrame(() => r()); }); });
        setMode('recorded');
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(100);
      setMode('recording');
      setRecordingTime(0);

      timerRef.current = setInterval(() => {
        setRecordingTime((t) => t + 0.1);
      }, 100);
    } catch {
      setError('Microphone access denied. Please allow microphone access and try again.');
    }
  }, []);

  /** Stop recording. */
  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  /** Upload audio file. */
  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('audio/')) {
      setError('Please upload an audio file (MP3, WAV, WebM, etc.)');
      return;
    }
    setError('');
    setDetectedGender(null);
    setAudioBlob(file);
    const url = URL.createObjectURL(file);
    setAudioUrl(url);

    // Get duration from audio element
    const audio = new Audio(url);
    audio.addEventListener('loadedmetadata', () => {
      setRecordingTime(audio.duration);
    });

    // Auto-detect gender
    setMode('analyzing');
    setAnalysisProgress(0);
    const progressInterval = setInterval(() => {
      setAnalysisProgress((p) => Math.min(p + 15, 85));
    }, 200);

    const gender = await detectGenderFromAudio(file);
    clearInterval(progressInterval);
    setAnalysisProgress(100);
    setDetectedGender(gender);

    // Yield for two animation frames so the browser paints the 100% state
    // before transitioning — gated on real completion, not a fixed timer.
    await new Promise<void>((r) => { requestAnimationFrame(() => { requestAnimationFrame(() => r()); }); });
    setMode('recorded');
  }, []);

  /** Toggle audio playback. */
  const togglePlayback = useCallback(() => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  }, [isPlaying]);

  /** Play or pause the F5-TTS cloned voice preview. */
  const toggleClonedPlayback = useCallback(() => {
    if (!clonedAudioRef.current) return;
    if (isPlayingCloned) {
      clonedAudioRef.current.pause();
      setIsPlayingCloned(false);
    } else {
      clonedAudioRef.current.play();
      setIsPlayingCloned(true);
    }
  }, [isPlayingCloned]);

  /** Process the voice clone — saves sample to IndexedDB, attempts F5-TTS real cloning, falls back to Kokoro matching. */
  const processClone = useCallback(async () => {
    if (!audioBlob) return;
    setMode('processing');
    setProcessingMessage('Saving voice sample...');

    const duration = recordingTime || 3;
    const matchedKokoroId = detectedGender === 'male' ? 'am_adam' : 'af_bella';
    const sampleId = `clone_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    let cloneType: 'f5tts' | 'kokoro-matched' = 'kokoro-matched';

    try {
      // Dynamically import voice-sample-store to avoid SSR issues
      const { saveVoiceSample } = await import('@/lib/voice-sample-store');

      // Persist the voice sample in IndexedDB for offline access
      await saveVoiceSample({
        id: sampleId,
        name: voiceName,
        gender: detectedGender,
        blob: audioBlob,
        duration,
        matchedKokoroId,
        createdAt: Date.now(),
      });

      // Attempt F5-TTS real voice cloning
      setProcessingMessage('Checking voice clone model...');
      const { f5ttsEngine } = await import('@/engine/f5tts-engine');
      const modelReady = await f5ttsEngine.isModelDownloaded();

      if (modelReady) {
        setProcessingMessage('Initializing F5-TTS engine...');
        await f5ttsEngine.init((pct) => {
          setProcessingMessage(`Loading voice clone model... ${pct}%`);
        });

        setProcessingMessage('Generating cloned voice preview...');
        const sampleBuffer = await audioBlob.arrayBuffer();
        const clonedAudioBuffer = await f5ttsEngine.cloneAndSpeak(
          sampleBuffer,
          'Hello, this is my cloned voice. How does it sound?'
        );

        // Create a playable blob URL for the cloned audio preview
        const clonedBlob = new Blob([clonedAudioBuffer], { type: 'audio/wav' });
        const previewUrl = URL.createObjectURL(clonedBlob);
        setClonedPreviewUrl(previewUrl);
        cloneType = 'f5tts';

        // Play the cloned audio automatically for verification
        const audio = new Audio(previewUrl);
        clonedAudioRef.current = audio;
        audio.onended = () => setIsPlayingCloned(false);
        audio.play().catch(() => { /* autoplay blocked — user can click play */ });
        setIsPlayingCloned(true);
        setF5ttsAvailable(true);
      } else {
        // Model not downloaded — fall back to Kokoro matching
        setF5ttsAvailable(false);
        cloneType = 'kokoro-matched';
      }
    } catch {
      // F5-TTS failed or IndexedDB failed — fall back to Kokoro matching
      setF5ttsAvailable(false);
      cloneType = 'kokoro-matched';
    }

    // Check Kokoro TTS availability for preview/feedback
    try {
      const { ttsManager } = await import('@/engine/tts-manager');
      setKokoroAvailable(ttsManager.isReady);
    } catch {
      setKokoroAvailable(false);
    }

    setFinalCloneType(cloneType);
    setCloneCompleted(true);

    onCloneComplete({
      name: voiceName,
      sampleBlob: audioBlob,
      sampleDuration: duration,
      detectedGender,
      cloneType,
    });
  }, [audioBlob, voiceName, recordingTime, onCloneComplete, detectedGender]);

  /** Reset to idle. */
  const reset = useCallback(() => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    if (clonedPreviewUrl) URL.revokeObjectURL(clonedPreviewUrl);
    clonedAudioRef.current?.pause();
    clonedAudioRef.current = null;
    setAudioBlob(null);
    setAudioUrl('');
    setMode('idle');
    setRecordingTime(0);
    setError('');
    setDetectedGender(null);
    setAnalysisProgress(0);
    setF5ttsAvailable(null);
    setKokoroAvailable(null);
    setClonedPreviewUrl('');
    setIsPlayingCloned(false);
    setProcessingMessage('');
    setCloneCompleted(false);
    setFinalCloneType(null);
  }, [audioUrl, clonedPreviewUrl]);

  return (
    <div className="rounded-xl border border-border dark:border-white/10 bg-white dark:bg-dark-secondary p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-accent/[0.08] dark:bg-accent/[0.15] flex items-center justify-center">
            <Sparkles className="w-[18px] h-[18px] text-accent" strokeWidth={2} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-text dark:text-white">Clone Your Voice</h3>
            <p className="text-xs text-text-muted mt-0.5">Record or upload a 3+ second voice sample — AI detects gender and creates a voice profile</p>
          </div>
        </div>
        {onCancel && (
          <button onClick={onCancel} className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors" aria-label="Cancel">
            <X className="w-4 h-4 text-text-muted" />
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-danger/10 text-danger text-xs" role="alert">{error}</div>
      )}

      {/* Recording / Upload UI */}
      {mode === 'idle' && (
        <div className="flex gap-3">
          <button
            onClick={startRecording}
            className="flex-1 flex flex-col items-center gap-2 py-6 rounded-xl border-2 border-dashed border-primary/20 hover:border-primary/40 hover:bg-primary/[0.02] dark:hover:bg-primary/[0.05] transition-all active:scale-[0.98]"
          >
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Mic className="w-5 h-5 text-primary" />
            </div>
            <span className="text-xs font-medium text-text dark:text-white">Record Voice</span>
            <span className="text-[10px] text-text-muted">Min. 3 seconds</span>
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex-1 flex flex-col items-center gap-2 py-6 rounded-xl border-2 border-dashed border-border dark:border-white/10 hover:border-primary/30 hover:bg-primary/[0.02] dark:hover:bg-primary/[0.05] transition-all active:scale-[0.98]"
          >
            <div className="w-10 h-10 rounded-full bg-black/5 dark:bg-white/10 flex items-center justify-center">
              <Upload className="w-5 h-5 text-text-muted" />
            </div>
            <span className="text-xs font-medium text-text dark:text-white">Upload Audio</span>
            <span className="text-[10px] text-text-muted">MP3, WAV, WebM</span>
          </button>
          <input ref={fileInputRef} type="file" accept="audio/*" className="hidden" onChange={handleFileUpload} />
        </div>
      )}

      {/* Recording in progress */}
      {mode === 'recording' && (
        <div className="text-center py-6">
          <div className="w-16 h-16 mx-auto rounded-full bg-danger/10 flex items-center justify-center mb-3 animate-pulse">
            <Mic className="w-7 h-7 text-danger" />
          </div>
          <p className="text-2xl font-mono font-bold text-text dark:text-white mb-1">{recordingTime.toFixed(1)}s</p>
          <p className="text-xs text-text-muted mb-4">{recordingTime < 3 ? 'Keep recording... (min 3s)' : 'Recording... Click stop when done'}</p>
          <button
            onClick={stopRecording}
            disabled={recordingTime < 3}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-danger text-white text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-danger/90 transition-colors"
          >
            <Square className="w-3.5 h-3.5" />
            Stop Recording
          </button>
        </div>
      )}

      {/* Analyzing audio — gender detection */}
      {mode === 'analyzing' && (
        <div className="text-center py-8">
          <div className="w-14 h-14 mx-auto rounded-full bg-accent/10 flex items-center justify-center mb-3">
            <Sparkles className="w-6 h-6 text-accent animate-pulse" />
          </div>
          <p className="text-sm font-medium text-text dark:text-white mb-1">Analyzing voice sample...</p>
          <p className="text-xs text-text-muted mb-4">Detecting voice characteristics and gender</p>
          <div className="max-w-xs mx-auto">
            <div className="h-1.5 bg-black/[0.06] dark:bg-white/[0.08] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all duration-300"
                style={{ width: `${analysisProgress}%` }}
              />
            </div>
            <p className="text-[10px] text-text-muted/60 mt-1.5 tabular-nums">{analysisProgress}%</p>
          </div>
        </div>
      )}

      {/* Recorded / Review */}
      {mode === 'recorded' && (
        <div className="space-y-4">
          {/* Gender detection result */}
          {detectedGender && (
            <div className={`flex items-center gap-2.5 p-3 rounded-lg border ${
              detectedGender === 'female'
                ? 'bg-accent/[0.04] dark:bg-accent/[0.08] border-accent/15'
                : 'bg-primary/[0.04] dark:bg-primary/[0.08] border-primary/15'
            }`}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center ${
                detectedGender === 'female'
                  ? 'bg-accent/10 text-accent'
                  : 'bg-primary/10 text-primary'
              }`}>
                <User className="w-3.5 h-3.5" strokeWidth={2} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold text-text dark:text-white leading-tight">
                  {detectedGender === 'female' ? 'Female' : 'Male'} Voice Detected
                </p>
                <p className="text-[10px] text-text-muted dark:text-white/45">
                  AI will use a {detectedGender === 'female' ? 'female' : 'male'} Kokoro voice model for TTS generation
                </p>
              </div>
              <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-1 rounded-md ${
                detectedGender === 'female'
                  ? 'text-accent bg-accent/[0.08]'
                  : 'text-primary bg-primary/[0.08]'
              }`}>
                {detectedGender}
              </span>
            </div>
          )}

          {/* Audio playback */}
          <div className="flex items-center gap-3 p-3 rounded-lg bg-black/[0.02] dark:bg-white/[0.04]">
            <button onClick={togglePlayback} className="w-9 h-9 rounded-full bg-primary flex items-center justify-center shrink-0 hover:bg-primary-hover transition-colors active:scale-95" aria-label={isPlaying ? 'Pause' : 'Play'}>
              {isPlaying ? <Pause className="w-4 h-4 text-white" /> : <Play className="w-4 h-4 text-white ml-0.5" />}
            </button>
            <div className="flex-1">
              <p className="text-[10px] font-medium text-text-muted mb-1">Reference Sample</p>
              <div className="h-1 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full w-1/2" />
              </div>
            </div>
            <span className="text-[10px] text-text-muted font-mono">{recordingTime.toFixed(1)}s</span>
          </div>
          <audio ref={audioRef} src={audioUrl} onEnded={() => setIsPlaying(false)} />

          {/* Voice name */}
          <div>
            <label className="block text-[11px] font-medium text-text-muted mb-1" htmlFor="voice-name">Voice Name</label>
            <input
              id="voice-name"
              type="text"
              value={voiceName}
              onChange={(e) => setVoiceName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border dark:border-white/10 bg-white dark:bg-dark text-sm text-text dark:text-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
              placeholder="e.g., My Voice, Narrator"
            />
          </div>

          {/* How it works note */}
          <div className="p-3 rounded-lg bg-info/[0.04] dark:bg-info/[0.08] border border-info/10">
            <p className="text-[10.5px] text-text-muted dark:text-white/50 leading-relaxed">
              <span className="font-semibold text-info">How it works:</span> Your voice sample is analyzed to detect characteristics.
              The cloned voice profile uses a matched Kokoro TTS voice to generate speech for your videos.
              When the F5-TTS model is downloaded, it will use your actual voice for synthesis.
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2">
            <button onClick={reset} className="flex-1 py-2 rounded-lg border border-border dark:border-white/10 text-xs font-medium text-text-muted hover:text-text dark:hover:text-white transition-colors active:scale-[0.98]">
              Re-record
            </button>
            <button onClick={processClone} className="flex-1 py-2 rounded-lg bg-primary text-white text-xs font-medium hover:bg-primary-hover transition-colors active:scale-[0.98]">
              <Sparkles className="w-3.5 h-3.5 inline mr-1" />
              Clone Voice
            </button>
          </div>
        </div>
      )}

      {/* Processing */}
      {mode === 'processing' && (
        <div className="text-center py-8">
          {/* Spinner while processing is in progress */}
          {!cloneCompleted && (
            <>
              <div className="relative w-14 h-14 mx-auto mb-3">
                <Loader2 className="w-14 h-14 text-primary/20 absolute inset-0" strokeWidth={1} />
                <Loader2 className="w-14 h-14 text-primary animate-spin absolute inset-0" strokeWidth={1.5} />
                <Sparkles className="w-5 h-5 text-accent absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
              </div>
              <p className="text-sm font-medium text-text dark:text-white">Creating voice profile...</p>
              <p className="text-xs text-text-muted mt-1">
                {processingMessage || (detectedGender
                  ? `Mapping ${detectedGender} voice characteristics to Kokoro TTS`
                  : 'Analyzing voice and creating profile')}
              </p>
            </>
          )}

          {/* Completed state with clear result labeling */}
          {cloneCompleted && (
            <div className="space-y-3">
              {/* Result type label */}
              {finalCloneType === 'f5tts' && (
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary/[0.08] dark:bg-secondary/[0.15] border border-secondary/20">
                  <CheckCircle className="w-4 h-4 text-secondary" />
                  <span className="text-xs font-semibold text-secondary">Voice Clone (F5-TTS)</span>
                </div>
              )}
              {finalCloneType === 'kokoro-matched' && (
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-warning/[0.08] dark:bg-warning/[0.15] border border-warning/20">
                  <AlertCircle className="w-4 h-4 text-warning" />
                  <span className="text-xs font-semibold text-warning">Voice Match (approximate)</span>
                </div>
              )}

              {/* Success message */}
              <p className="text-sm font-medium text-text dark:text-white">
                {finalCloneType === 'f5tts' ? 'Voice cloned successfully' : 'Voice profile created'}
              </p>
            </div>
          )}

          {/* F5-TTS cloned voice preview (shown when real clone completes) */}
          {clonedPreviewUrl && (
            <div className="mt-4 p-3 rounded-lg bg-secondary/[0.06] dark:bg-secondary/[0.12] border border-secondary/15 max-w-xs mx-auto">
              <div className="flex items-center gap-2 mb-1.5">
                <Volume2 className="w-3.5 h-3.5 text-secondary" />
                <span className="text-[11px] font-semibold text-secondary">Cloned Voice Preview</span>
              </div>
              <button
                onClick={toggleClonedPlayback}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-secondary text-white text-[11px] font-medium hover:bg-secondary-hover transition-colors active:scale-95"
              >
                {isPlayingCloned ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                {isPlayingCloned ? 'Pause' : 'Play Preview'}
              </button>
            </div>
          )}

          {/* F5-TTS not available -- prominent fallback banner */}
          {f5ttsAvailable === false && (
            <div className="mt-4 p-3 rounded-lg bg-warning/[0.06] dark:bg-warning/[0.1] border border-warning/15 max-w-sm mx-auto text-left">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-warning mt-0.5 shrink-0" />
                <div>
                  <p className="text-[11px] font-semibold text-text dark:text-white">
                    For real voice cloning, download the F5-TTS model from the Models page.
                  </p>
                  <p className="text-[10px] text-text-muted dark:text-white/50 mt-0.5 leading-relaxed">
                    Currently using voice matching (approximate). The matched Kokoro voice has similar characteristics but is not a true clone of your voice.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Kokoro TTS also not downloaded -- additional guidance */}
          {kokoroAvailable === false && (
            <div className="mt-3 p-3 rounded-lg bg-info/[0.05] dark:bg-info/[0.08] border border-info/15 max-w-sm mx-auto text-left">
              <div className="flex items-start gap-2">
                <Download className="w-4 h-4 text-info mt-0.5 shrink-0" />
                <div>
                  <p className="text-[11px] font-semibold text-text dark:text-white">
                    Kokoro TTS model not loaded
                  </p>
                  <p className="text-[10px] text-text-muted dark:text-white/50 mt-0.5 leading-relaxed">
                    Download Kokoro TTS from the Models page to preview voices. The voice profile has been saved and will work once the model is available.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
