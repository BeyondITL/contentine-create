'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { Play, Pause, Check, Loader2, Mic, Volume2, Plus } from 'lucide-react';
import { useEditorStore } from '@/stores/editor-store';
import { useTTSPreview } from '@/hooks/use-tts-preview';
import VoiceCloner from '@/components/voice/VoiceCloner';
import TTSInitModal from '@/components/voice/TTSInitModal';
import type { VoiceProfile } from '@/types';

/** Helper to render gender/tone tags. */
function VoiceTags({ voice }: { voice: VoiceProfile }) {
  const tags = [voice.gender, voice.tone, voice.style].filter(Boolean);
  return (
    <div className="flex flex-wrap gap-1 mt-1.5">
      {tags.map((tag) => (
        <span
          key={tag}
          className="px-1.5 py-0.5 text-[10px] font-medium bg-surface dark:bg-[#2a2a2a] text-muted rounded-md"
        >
          {tag}
        </span>
      ))}
    </div>
  );
}

/** Step 3 — Voice selection: grid of voice presets with preview. */
export default function VoiceStep() {
  const { voiceId, setVoiceId, voiceSpeed, setVoiceSpeed, voices, voicesLoaded, fetchVoices, addClonedVoice } = useEditorStore();
  const [playingId, setPlayingId] = useState<number | null>(null);
  const [filter, setFilter] = useState<'all' | 'female' | 'male'>('all');
  const [showCloner, setShowCloner] = useState(false);
  const tts = useTTSPreview();
  const ttsVoiceIdRef = useRef<number | null>(null);

  useEffect(() => {
    fetchVoices();
  }, [fetchVoices]);

  // Sync playingId with TTS playback state
  useEffect(() => {
    if (tts.isPlaying && ttsVoiceIdRef.current !== null) {
      setPlayingId(ttsVoiceIdRef.current);
    } else if (!tts.isPlaying && !tts.isLoading && ttsVoiceIdRef.current !== null) {
      setPlayingId(null);
      ttsVoiceIdRef.current = null;
    }
  }, [tts.isPlaying, tts.isLoading]);

  const filtered = voices.filter((v) => {
    if (filter === 'all') return true;
    return v.gender?.toLowerCase() === filter;
  });

  const presets = filtered.filter((v) => v.is_preset);
  const cloned = filtered.filter((v) => !v.is_preset);

  /** Preview a voice using Kokoro TTS engine. */
  const handlePlay = useCallback((voice: VoiceProfile) => {
    // If already playing this voice, stop
    if (playingId === voice.id) {
      tts.stop();
      ttsVoiceIdRef.current = null;
      setPlayingId(null);
      return;
    }

    // Stop any current playback
    tts.stop();

    const sampleText = `Hi, I'm ${voice.name}. I can narrate your videos with a ${voice.tone || 'natural'} tone.`;
    const kokoroId = voice.is_preset
      ? (voice.kokoro_voice_id || 'af_sky')
      : (voice.matched_kokoro_id || 'af_bella');

    ttsVoiceIdRef.current = voice.id;
    setPlayingId(voice.id);
    tts.preview(sampleText, kokoroId, voiceSpeed);
  }, [playingId, tts, voiceSpeed]);

  // Show TTS init modal when model is downloading
  const showInitModal = tts.isLoading && tts.progress < 100;

  if (!voicesLoaded) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="text-primary animate-spin" />
        <span className="ml-2 text-sm text-muted">Loading voices...</span>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* TTS Model Download Modal */}
      <TTSInitModal progress={tts.progress} isVisible={showInitModal} />

      {/* TTS error */}
      {tts.error && (
        <div className="p-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-xs" role="alert">
          Voice preview failed: {tts.error}
        </div>
      )}

      {/* Filter bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-surface dark:bg-[#1e1e1e] rounded-lg p-1">
            {(['all', 'female', 'male'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 min-h-[44px] md:min-h-0 text-xs font-medium rounded-md transition-all capitalize ${
                  filter === f
                    ? 'bg-white dark:bg-[#2a2a2a] text-text dark:text-white shadow-sm'
                    : 'text-muted hover:text-text dark:hover:text-white'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setShowCloner(!showCloner)}
            className="flex items-center gap-1.5 px-3 py-1.5 min-h-[44px] md:min-h-0 text-xs font-medium rounded-lg bg-secondary/10 text-secondary hover:bg-secondary/20 transition-colors"
          >
            <Plus size={14} />
            Clone Voice
          </button>
        </div>

        {/* Speed slider */}
        <div className="flex items-center gap-3">
          <label className="text-xs text-muted flex items-center gap-1">
            <Volume2 size={14} />
            Speed
          </label>
          <input
            type="range"
            min={0.75}
            max={1.5}
            step={0.05}
            value={voiceSpeed}
            onChange={(e) => setVoiceSpeed(parseFloat(e.target.value))}
            className="w-24 h-1 bg-border dark:bg-[#333] rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 md:[&::-webkit-slider-thumb]:w-3 md:[&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary"
          />
          <span className="text-xs text-muted w-8 text-right">{voiceSpeed.toFixed(2)}x</span>
        </div>
      </div>

      {/* Voice Cloner Panel */}
      {showCloner && (
        <VoiceCloner
          onCloneComplete={(result) => {
            addClonedVoice(result.name, result.sampleBlob, result.detectedGender, result.sampleDuration, result.cloneType);
            setShowCloner(false);
          }}
          onCancel={() => setShowCloner(false)}
        />
      )}

      {/* Presets grid */}
      <div>
        <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">
          Voice Presets ({presets.length})
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {presets.map((voice) => {
            const isSelected = voiceId === voice.id;
            const isPlaying = playingId === voice.id;
            const isTTSLoading = tts.isLoading && ttsVoiceIdRef.current === voice.id;

            return (
              <button
                key={voice.id}
                type="button"
                onClick={() => setVoiceId(voice.id)}
                className={`
                  relative flex flex-col p-3 min-h-[44px] rounded-xl border-2 text-left transition-all
                  ${isSelected
                    ? 'border-primary bg-primary-bg dark:bg-primary/10 ring-1 ring-primary/20'
                    : 'border-border-light dark:border-[#333] hover:border-border dark:hover:border-[#555]'
                  }
                `}
              >
                {/* Selected check */}
                {isSelected && (
                  <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                    <Check size={12} className="text-white" />
                  </div>
                )}

                {/* Voice icon + name */}
                <div className="flex items-center gap-2 mb-1">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    voice.gender?.toLowerCase() === 'female'
                      ? 'bg-accent/10 text-accent'
                      : 'bg-primary/10 text-primary'
                  }`}>
                    <Mic size={14} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-text dark:text-white truncate">{voice.name}</p>
                    <p className="text-[11px] text-muted">{voice.language}</p>
                  </div>
                </div>

                <VoiceTags voice={voice} />

                {/* Play preview via Kokoro TTS */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePlay(voice);
                  }}
                  disabled={isTTSLoading}
                  className="mt-2 flex items-center justify-center gap-1 w-full py-1.5 min-h-[44px] md:min-h-0 rounded-lg bg-surface dark:bg-[#151515] text-xs text-muted hover:text-text dark:hover:text-white transition-colors disabled:opacity-50 disabled:cursor-wait"
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
              </button>
            );
          })}
        </div>
      </div>

      {/* Cloned voices section */}
      {cloned.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">
            Your Cloned Voices ({cloned.length})
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {cloned.map((voice) => {
              const isSelected = voiceId === voice.id;
              const isPlaying = playingId === voice.id;
              const isTTSLoading = tts.isLoading && ttsVoiceIdRef.current === voice.id;

              return (
                <button
                  key={voice.id}
                  type="button"
                  onClick={() => setVoiceId(voice.id)}
                  className={`
                    relative flex flex-col p-3 min-h-[44px] rounded-xl border-2 text-left transition-all
                    ${isSelected
                      ? 'border-secondary bg-secondary/5 ring-1 ring-secondary/20'
                      : 'border-border-light dark:border-[#333] hover:border-border dark:hover:border-[#555]'
                    }
                  `}
                >
                  {isSelected && (
                    <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-secondary flex items-center justify-center">
                      <Check size={12} className="text-white" />
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-secondary/10 text-secondary flex items-center justify-center">
                      <Mic size={14} />
                    </div>
                    <p className="text-sm font-medium text-text dark:text-white truncate">{voice.name}</p>
                  </div>

                  {/* Play preview via Kokoro TTS */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePlay(voice);
                    }}
                    disabled={isTTSLoading}
                    className="mt-2 flex items-center justify-center gap-1 w-full py-1.5 min-h-[44px] md:min-h-0 rounded-lg bg-surface dark:bg-[#151515] text-xs text-muted hover:text-text dark:hover:text-white transition-colors disabled:opacity-50 disabled:cursor-wait"
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
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Filtered empty state */}
      {voices.length > 0 && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Mic size={24} className="text-muted mb-2" />
          <p className="text-sm text-muted">No {filter} voices found</p>
          <button
            type="button"
            onClick={() => setFilter('all')}
            className="mt-2 text-xs text-primary hover:underline"
          >
            Show all voices
          </button>
        </div>
      )}

      {/* Empty state if no voices from API */}
      {voices.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-12 h-12 rounded-full bg-surface dark:bg-[#1e1e1e] flex items-center justify-center mb-3">
            <Mic size={24} className="text-muted" />
          </div>
          <h3 className="text-sm font-semibold text-text dark:text-white mb-1">No voices available</h3>
          <p className="text-xs text-muted max-w-xs">
            Voice presets are loading. Refresh the page if they don&apos;t appear. Contentine Create supports 54+ natural-sounding AI voices.
          </p>
        </div>
      )}
    </div>
  );
}
