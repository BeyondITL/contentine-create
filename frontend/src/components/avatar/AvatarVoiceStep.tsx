'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Play, Pause, Check, Loader2, Mic, Volume2 } from 'lucide-react';
import { useAvatarStore } from '@/stores/avatar-store';
import { useTTSPreview } from '@/hooks/use-tts-preview';
import TTSInitModal from '@/components/voice/TTSInitModal';
import type { VoiceProfile } from '@/types';

/** Step 3 — Voice selection for avatar videos. */
export default function AvatarVoiceStep() {
  const { voiceId, setVoiceId, voiceSpeed, setVoiceSpeed, voices } = useAvatarStore();
  const [playingId, setPlayingId] = useState<number | null>(null);
  const [filter, setFilter] = useState<'all' | 'female' | 'male'>('all');
  const tts = useTTSPreview();
  const ttsVoiceIdRef = useRef<number | null>(null);

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

  return (
    <div className="space-y-5">
      {/* TTS Model Download Modal */}
      <TTSInitModal progress={tts.progress} isVisible={showInitModal} />

      {/* Info banner */}
      <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 flex items-start gap-2">
        <Mic size={14} className="text-primary mt-0.5 shrink-0" />
        <p className="text-xs text-muted leading-relaxed">
          The selected voice will narrate your avatar video. Mouth movements are automatically synced to the audio for natural-looking speech.
        </p>
      </div>

      {/* TTS error */}
      {tts.error && (
        <div className="p-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-xs" role="alert">
          Voice preview failed: {tts.error}
        </div>
      )}

      {/* Filter + Speed */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1 bg-surface dark:bg-[#1e1e1e] rounded-lg p-1">
          {(['all', 'female', 'male'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`px-3 py-2 md:py-1.5 text-xs font-medium rounded-md transition-all capitalize min-h-[44px] md:min-h-0 ${
                filter === f
                  ? 'bg-white dark:bg-[#2a2a2a] text-text dark:text-white shadow-sm'
                  : 'text-muted hover:text-text dark:hover:text-white'
              }`}
            >
              {f}
            </button>
          ))}
        </div>

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
            className="w-24 h-6 md:h-1 bg-border dark:bg-[#333] rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 md:[&::-webkit-slider-thumb]:w-3 md:[&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary"
          />
          <span className="text-xs text-muted w-8 text-right">{voiceSpeed.toFixed(2)}x</span>
        </div>
      </div>

      {/* Voice grid */}
      {presets.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">
            Voice Presets ({presets.length})
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {presets.map((voice) => (
              <VoiceCard
                key={voice.id}
                voice={voice}
                isSelected={voiceId === voice.id}
                isPlaying={playingId === voice.id}
                isTTSLoading={tts.isLoading && ttsVoiceIdRef.current === voice.id}
                onSelect={() => setVoiceId(voice.id)}
                onPlay={() => handlePlay(voice)}
              />
            ))}
          </div>
        </div>
      )}

      {cloned.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">
            Your Cloned Voices ({cloned.length})
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {cloned.map((voice) => (
              <VoiceCard
                key={voice.id}
                voice={voice}
                isSelected={voiceId === voice.id}
                isPlaying={playingId === voice.id}
                isTTSLoading={tts.isLoading && ttsVoiceIdRef.current === voice.id}
                onSelect={() => setVoiceId(voice.id)}
                onPlay={() => handlePlay(voice)}
                isCloned
              />
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
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

      {voices.length > 0 && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Mic size={24} className="text-muted mb-2" />
          <p className="text-sm text-muted">No {filter} voices found</p>
          <button
            type="button"
            onClick={() => setFilter('all')}
            className="mt-2 text-xs text-primary hover:underline min-h-[44px] md:min-h-0 flex items-center justify-center"
          >
            Show all voices
          </button>
        </div>
      )}
    </div>
  );
}

/** Voice card component with Kokoro TTS preview. */
function VoiceCard({
  voice,
  isSelected,
  isPlaying,
  isTTSLoading,
  onSelect,
  onPlay,
  isCloned,
}: {
  voice: VoiceProfile;
  isSelected: boolean;
  isPlaying: boolean;
  isTTSLoading: boolean;
  onSelect: () => void;
  onPlay: () => void;
  isCloned?: boolean;
}) {
  const tags = [voice.gender, voice.tone, voice.style].filter(Boolean);

  // Use full class strings — Tailwind JIT cannot detect dynamically constructed class names
  const selectedBorder = isCloned
    ? 'border-secondary bg-secondary/5 dark:bg-secondary/10 ring-1 ring-secondary/20'
    : 'border-primary bg-primary-bg dark:bg-primary/10 ring-1 ring-primary/20';
  const selectedBadgeBg = isCloned ? 'bg-secondary' : 'bg-primary';

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`
        relative flex flex-col p-3 rounded-xl border-2 text-left transition-all min-h-[44px]
        ${isSelected
          ? selectedBorder
          : 'border-border-light dark:border-[#333] hover:border-border dark:hover:border-[#555]'
        }
      `}
    >
      {isSelected && (
        <div className={`absolute top-2 right-2 w-5 h-5 rounded-full ${selectedBadgeBg} flex items-center justify-center`}>
          <Check size={12} className="text-white" />
        </div>
      )}

      <div className="flex items-center gap-2 mb-1">
        <div className={`w-10 h-10 md:w-8 md:h-8 rounded-full flex items-center justify-center shrink-0 ${
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

      <div className="flex flex-wrap gap-1 mt-1.5">
        {tags.map((tag) => (
          <span
            key={tag}
            className="px-2 py-0.5 text-[10px] font-medium bg-surface dark:bg-[#2a2a2a] text-muted rounded-md"
          >
            {tag}
          </span>
        ))}
      </div>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onPlay();
        }}
        disabled={isTTSLoading}
        className="mt-2 flex items-center justify-center gap-1 w-full py-2.5 md:py-1.5 rounded-lg bg-surface dark:bg-[#151515] text-xs text-muted hover:text-text dark:hover:text-white transition-colors min-h-[44px] md:min-h-0 disabled:opacity-50 disabled:cursor-wait"
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
}
