'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { Play, Pause, Loader2, Mic, Volume2, Sparkles, Music } from 'lucide-react';
import { useEditorStore } from '@/stores/editor-store';
import { useTTSPreview } from '@/hooks/use-tts-preview';
import VoiceCloner from '@/components/voice/VoiceCloner';
import TTSInitModal from '@/components/voice/TTSInitModal';
import ModelRequirements from '@/components/shared/ModelRequirements';
import type { VoiceProfile } from '@/types';

/** Voices page — browse voice presets, clone custom voices with gender detection. */
export default function VoicesPage() {
  const { voices, voicesLoaded, fetchVoices, addClonedVoice } = useEditorStore();
  const [playingId, setPlayingId] = useState<number | null>(null);
  const [filter, setFilter] = useState<'all' | 'female' | 'male'>('all');
  const [showCloner, setShowCloner] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const tts = useTTSPreview();

  // Track which voice triggered the TTS preview
  const ttsVoiceIdRef = useRef<number | null>(null);

  useEffect(() => {
    fetchVoices();
  }, [fetchVoices]);

  useEffect(() => {
    document.title = 'Voice Studio \u2014 Contentine Create';
  }, []);

  // Sync playingId with TTS playback state
  useEffect(() => {
    if (tts.isPlaying && ttsVoiceIdRef.current !== null) {
      setPlayingId(ttsVoiceIdRef.current);
    } else if (!tts.isPlaying && !tts.isLoading && ttsVoiceIdRef.current !== null) {
      setPlayingId(null);
      ttsVoiceIdRef.current = null;
    }
  }, [tts.isPlaying, tts.isLoading]);

  /** Stop all audio playback (both reference samples and TTS). */
  const stopAll = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    tts.stop();
    ttsVoiceIdRef.current = null;
    setPlayingId(null);
  }, [tts]);

  /** Play reference sample for cloned voice (the actual recorded audio). */
  const playReferenceSample = useCallback((voice: VoiceProfile) => {
    if (playingId === voice.id) {
      stopAll();
      return;
    }

    stopAll();

    // Play recorded sample via HTMLAudioElement
    if (voice.preview_url) {
      const audio = new Audio(voice.preview_url);
      audioRef.current = audio;
      setPlayingId(voice.id);
      audio.onended = () => setPlayingId(null);
      audio.onerror = () => setPlayingId(null);
      audio.play().catch(() => setPlayingId(null));
    }
  }, [playingId, stopAll]);

  /** Preview a voice using Kokoro TTS — generates new speech with the voice model. */
  const handlePreview = useCallback((voice: VoiceProfile) => {
    // If already playing this voice, stop
    if (playingId === voice.id) {
      stopAll();
      return;
    }

    stopAll();

    const sampleText = `Hi, I'm ${voice.name}. I can narrate your videos with a ${voice.tone || 'natural'} tone.`;

    // Determine which Kokoro voice ID to use
    const kokoroId = voice.is_preset
      ? (voice.kokoro_voice_id || 'af_sky')
      : (voice.matched_kokoro_id || 'af_bella');

    ttsVoiceIdRef.current = voice.id;
    setPlayingId(voice.id);
    tts.preview(sampleText, kokoroId, voice.speed || 1.0);
  }, [playingId, stopAll, tts]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const safeVoices = voices ?? [];

  const filtered = safeVoices.filter((v) => {
    if (filter === 'all') return true;
    return v.gender?.toLowerCase() === filter;
  });

  const presets = filtered.filter((v) => v.is_preset);
  const cloned = filtered.filter((v) => !v.is_preset);

  // Show TTS init modal when model is downloading
  const showInitModal = tts.isLoading && tts.progress < 100;

  if (!voicesLoaded) {
    return (
      <div className="max-w-[900px] mx-auto animate-fade-in">
        <div className="mb-6">
          <div className="flex items-center gap-2.5 mb-1.5">
            <div className="w-8 h-8 rounded-xl bg-accent/[0.08] dark:bg-accent/[0.15] flex items-center justify-center">
              <Music className="w-[18px] h-[18px] text-accent" strokeWidth={2} />
            </div>
            <h1 className="text-[20px] md:text-[24px] font-bold text-text dark:text-white tracking-[-0.02em]">Voice Studio</h1>
          </div>
          <p className="text-[13px] text-text-muted dark:text-white/50 ml-[42px]">
            Browse AI voices or create a voice profile from a 3-second sample.
          </p>
        </div>
        {/* Filter skeleton */}
        <div className="flex items-center gap-2 mb-5">
          <div className="flex items-center gap-1 bg-surface dark:bg-[#1e1e1e] rounded-lg p-1">
            {['all', 'female', 'male'].map((f) => (
              <div key={f} className="w-14 h-8 rounded-md bg-black/[0.04] dark:bg-white/[0.06] animate-pulse" />
            ))}
          </div>
          <div className="w-24 h-8 rounded-lg bg-black/[0.04] dark:bg-white/[0.06] animate-pulse" />
        </div>
        {/* Voice card skeletons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex flex-col p-3 rounded-xl border border-border dark:border-[#333] bg-white dark:bg-dark-secondary animate-pulse">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-full bg-black/[0.06] dark:bg-white/[0.08]" />
                <div className="flex-1">
                  <div className="h-3.5 w-20 bg-black/[0.06] dark:bg-white/[0.08] rounded mb-1" />
                  <div className="h-2.5 w-12 bg-black/[0.04] dark:bg-white/[0.05] rounded" />
                </div>
              </div>
              <div className="flex gap-1 mb-2">
                <div className="h-4 w-10 bg-black/[0.04] dark:bg-white/[0.05] rounded-md" />
                <div className="h-4 w-14 bg-black/[0.04] dark:bg-white/[0.05] rounded-md" />
              </div>
              <div className="h-7 w-full bg-black/[0.04] dark:bg-white/[0.05] rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[900px] mx-auto animate-fade-in">
      {/* TTS Model Download Modal */}
      <TTSInitModal progress={tts.progress} isVisible={showInitModal} />

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2.5 mb-1.5">
          <div className="w-8 h-8 rounded-xl bg-accent/[0.08] dark:bg-accent/[0.15] flex items-center justify-center">
            <Music className="w-[18px] h-[18px] text-accent" strokeWidth={2} />
          </div>
          <h1 className="text-[20px] md:text-[24px] font-bold text-text dark:text-white tracking-[-0.02em]">Voice Studio</h1>
        </div>
        <p className="text-[13px] text-text-muted dark:text-white/50 ml-[42px]">
          Browse {presets.length > 0 ? `${safeVoices.filter((v) => v.is_preset).length}` : '20'}+ AI voices or create a voice profile from a 3-second sample.
        </p>
      </div>

      {/* On-device voice model gate — informs + offers Kokoro download */}
      <div className="mb-5">
        <ModelRequirements
          feature="voices"
          description="Voice previews synthesize on your device. Kokoro downloads once, then works offline."
        />
      </div>

      {/* TTS error toast */}
      {tts.error && (
        <div className="mb-4 p-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-xs" role="alert">
          Voice preview failed: {tts.error}
        </div>
      )}

      {/* Filter + Clone button */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-5">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-surface dark:bg-[#1e1e1e] rounded-lg p-1">
            {(['all', 'female', 'male'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 min-h-[44px] md:min-h-0 text-xs font-medium rounded-md transition-all capitalize active:scale-[0.97] ${
                  filter === f
                    ? 'bg-white dark:bg-[#2a2a2a] text-text dark:text-white shadow-sm'
                    : 'text-text-muted hover:text-text dark:hover:text-white'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setShowCloner(!showCloner)}
            className="flex items-center gap-1.5 px-3 py-1.5 min-h-[44px] md:min-h-0 text-xs font-medium rounded-lg bg-accent/10 text-accent hover:bg-accent/20 transition-colors active:scale-[0.97]"
          >
            <Sparkles size={14} />
            Clone Voice
          </button>
        </div>
        <p className="text-xs text-text-muted">{filtered.length} voices</p>
      </div>

      {/* Voice Cloner */}
      {showCloner && (
        <div className="mb-5">
          <VoiceCloner
            onCloneComplete={(result) => {
              addClonedVoice(
                result.name,
                result.sampleBlob,
                result.detectedGender,
                result.sampleDuration,
                result.cloneType
              );
              setShowCloner(false);
            }}
            onCancel={() => setShowCloner(false)}
          />
        </div>
      )}

      {/* Cloned voices — show first so user sees their new voice immediately */}
      {cloned.length > 0 && (
        <div className="mb-6">
          <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3 flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-accent" />
            Your Voices ({cloned.length})
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {cloned.map((voice) => (
              <ClonedVoiceCard
                key={voice.id}
                voice={voice}
                isPlaying={playingId === voice.id}
                isTTSLoading={tts.isLoading && ttsVoiceIdRef.current === voice.id}
                onPlaySample={() => playReferenceSample(voice)}
                onPreview={() => handlePreview(voice)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Preset voices */}
      {presets.length > 0 && (
        <div className="mb-6">
          <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3 flex items-center gap-2">
            <Mic className="w-3.5 h-3.5" />
            Voice Presets ({presets.length})
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {presets.map((voice) => (
              <PresetVoiceCard
                key={voice.id}
                voice={voice}
                isPlaying={playingId === voice.id}
                isTTSLoading={tts.isLoading && ttsVoiceIdRef.current === voice.id}
                onPlay={() => handlePreview(voice)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {safeVoices.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 rounded-full bg-surface dark:bg-[#1e1e1e] flex items-center justify-center mb-3">
            <Mic size={28} className="text-text-muted" />
          </div>
          <h3 className="text-sm font-semibold text-text dark:text-white mb-1">No voices available</h3>
          <p className="text-xs text-text-muted max-w-xs">
            Voice presets are loading. Refresh the page if they don&apos;t appear.
          </p>
        </div>
      )}
    </div>
  );
}

/** Preset voice card — clean design with preview button. */
function PresetVoiceCard({ voice, isPlaying, isTTSLoading, onPlay }: {
  voice: VoiceProfile; isPlaying: boolean; isTTSLoading: boolean; onPlay: () => void;
}) {
  const tags = [voice.gender, voice.tone, voice.style].filter(Boolean);
  return (
    <div className={`flex flex-col p-3 rounded-xl border transition-all duration-200
      border-border dark:border-[#333] bg-white dark:bg-dark-secondary
      ${isPlaying ? 'ring-2 ring-primary/20 border-primary/30' : ''}`}>
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all duration-200 ${
          isPlaying
            ? 'bg-primary/15 text-primary scale-110'
            : voice.gender?.toLowerCase() === 'female'
              ? 'bg-accent/10 text-accent'
              : 'bg-primary/10 text-primary'
        }`}>
          {isPlaying ? <Volume2 size={14} className="animate-pulse" /> : <Mic size={14} />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-text dark:text-white truncate">{voice.name}</p>
          <p className="text-[10px] text-text-muted">{voice.language}</p>
        </div>
      </div>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {tags.map((tag) => (
            <span key={tag} className="px-1.5 py-0.5 text-[10px] font-medium bg-surface dark:bg-[#2a2a2a] text-text-muted rounded-md">{tag}</span>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={onPlay}
        disabled={isTTSLoading}
        className={`flex items-center justify-center gap-1 w-full py-1.5 min-h-[44px] md:min-h-0 rounded-lg text-xs font-medium transition-all duration-200 active:scale-[0.97] disabled:opacity-50 disabled:cursor-wait ${
          isPlaying
            ? 'bg-primary/10 text-primary'
            : 'bg-surface dark:bg-[#151515] text-text-muted hover:text-text dark:hover:text-white hover:bg-black/[0.04] dark:hover:bg-white/[0.06]'
        }`}
      >
        {isTTSLoading ? (
          <Loader2 size={12} className="animate-spin" />
        ) : isPlaying ? (
          <Pause size={12} />
        ) : (
          <Play size={12} />
        )}
        {isTTSLoading ? 'Loading...' : isPlaying ? 'Playing...' : 'Preview'}
      </button>
    </div>
  );
}

/** Cloned voice card — shows gender, reference sample, and TTS preview. */
function ClonedVoiceCard({ voice, isPlaying, isTTSLoading, onPlaySample, onPreview }: {
  voice: VoiceProfile;
  isPlaying: boolean;
  isTTSLoading: boolean;
  onPlaySample: () => void;
  onPreview: () => void;
}) {
  return (
    <div className={`flex flex-col p-3 rounded-xl border transition-all duration-200
      border-accent/20 bg-accent/[0.02] dark:bg-accent/[0.04]
      ${isPlaying ? 'ring-2 ring-accent/20 border-accent/30' : ''}`}>
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all duration-200 ${
          isPlaying
            ? 'bg-accent/15 text-accent scale-110'
            : 'bg-accent/10 text-accent'
        }`}>
          {isPlaying ? <Volume2 size={14} className="animate-pulse" /> : <Sparkles size={14} />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-text dark:text-white truncate">{voice.name}</p>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-text-muted">{voice.language}</span>
            {voice.gender && (
              <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md ${
                voice.gender === 'female'
                  ? 'text-accent bg-accent/[0.08]'
                  : 'text-primary bg-primary/[0.08]'
              }`}>
                {voice.gender}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Tags */}
      <div className="flex flex-wrap gap-1 mb-2">
        <span className="px-1.5 py-0.5 text-[10px] font-medium bg-accent/[0.06] text-accent rounded-md">{voice.cloneType === 'f5tts' ? 'cloned' : 'voice match'}</span>
        {voice.sample_duration ? (
          <span className="px-1.5 py-0.5 text-[10px] font-medium bg-surface dark:bg-[#2a2a2a] text-text-muted rounded-md tabular-nums">
            {voice.sample_duration.toFixed(1)}s sample
          </span>
        ) : null}
      </div>

      {/* Two action buttons: Play Sample (hear original recording) and Preview TTS (generate new speech) */}
      <div className="flex gap-1.5">
        {/* Play reference sample — this plays the actual recorded audio blob */}
        {voice.preview_url && (
          <button
            type="button"
            onClick={onPlaySample}
            className={`flex-1 flex items-center justify-center gap-1 py-1.5 min-h-[44px] md:min-h-0 rounded-lg text-[11px] font-medium transition-all duration-200 active:scale-[0.97] ${
              isPlaying
                ? 'bg-accent/10 text-accent'
                : 'bg-surface dark:bg-[#151515] text-text-muted hover:text-text dark:hover:text-white hover:bg-black/[0.04] dark:hover:bg-white/[0.06]'
            }`}
            title="Play your original voice recording"
          >
            {isPlaying ? <Pause size={11} /> : <Mic size={11} />}
            {isPlaying ? 'Stop' : 'Sample'}
          </button>
        )}

        {/* Generate TTS preview using Kokoro engine */}
        <button
          type="button"
          onClick={onPreview}
          disabled={isTTSLoading}
          className={`flex-1 flex items-center justify-center gap-1 py-1.5 min-h-[44px] md:min-h-0 rounded-lg text-[11px] font-medium transition-all duration-200 active:scale-[0.97] disabled:opacity-50 disabled:cursor-wait ${
            isTTSLoading
              ? 'bg-primary/10 text-primary'
              : 'bg-primary/[0.06] text-primary hover:bg-primary/[0.12]'
          }`}
          title="Hear AI-generated speech using this cloned voice"
        >
          {isTTSLoading ? <Loader2 size={11} className="animate-spin" /> : <Play size={11} />}
          {isTTSLoading ? 'Loading...' : 'Preview TTS'}
        </button>
      </div>
    </div>
  );
}
