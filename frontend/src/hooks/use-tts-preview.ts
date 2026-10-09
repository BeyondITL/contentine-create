'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

interface TTSPreviewState {
  isLoading: boolean;
  isPlaying: boolean;
  progress: number;
  error: string | null;
}

/** Hook that manages Kokoro TTS engine lifecycle for voice preview playback. */
export function useTTSPreview() {
  const [state, setState] = useState<TTSPreviewState>({
    isLoading: false,
    isPlaying: false,
    progress: 0,
    error: null,
  });
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // Cleanup on unmount
      if (sourceRef.current) {
        try { sourceRef.current.stop(); } catch { /* already stopped */ }
        sourceRef.current = null;
      }
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
    };
  }, []);

  const stop = useCallback(() => {
    if (sourceRef.current) {
      try { sourceRef.current.stop(); } catch { /* already stopped */ }
      sourceRef.current = null;
    }
    if (mountedRef.current) {
      setState((s) => ({ ...s, isPlaying: false }));
    }
  }, []);

  const preview = useCallback(
    async (text: string, voiceId: string = 'af_sky', speed: number = 1.0) => {
      stop();
      setState({ isLoading: true, isPlaying: false, progress: 0, error: null });

      try {
        // Dynamic import to avoid SSR issues with static Next.js export
        const { ttsManager } = await import('@/engine/tts-manager');

        // Init if needed (downloads ~87MB model on first use)
        await ttsManager.init((p) => {
          if (mountedRef.current) {
            setState((s) => ({ ...s, progress: p.percent }));
          }
        });

        if (!mountedRef.current) return;
        setState((s) => ({ ...s, progress: 100, isLoading: false }));

        // Synthesize speech
        const result = await ttsManager.synthesize(text, voiceId, speed);

        if (!mountedRef.current) return;

        // Play via Web Audio API
        if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
          audioCtxRef.current = new AudioContext();
        }
        const ctx = audioCtxRef.current;

        // Resume if suspended (browser autoplay policy)
        if (ctx.state === 'suspended') {
          await ctx.resume();
        }

        const buffer = ctx.createBuffer(1, result.buffer.length, result.sampleRate);
        // Ensure the Float32Array is backed by a plain ArrayBuffer (not SharedArrayBuffer)
        const pcm = new Float32Array(result.buffer.length);
        pcm.set(result.buffer);
        buffer.copyToChannel(pcm, 0);

        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        sourceRef.current = source;

        setState((s) => ({ ...s, isPlaying: true }));
        source.onended = () => {
          sourceRef.current = null;
          if (mountedRef.current) {
            setState((s) => ({ ...s, isPlaying: false }));
          }
        };
        source.start();
      } catch (err) {
        if (!mountedRef.current) return;
        const msg = err instanceof Error ? err.message : 'TTS preview failed';
        setState({ isLoading: false, isPlaying: false, progress: 0, error: msg });
      }
    },
    [stop]
  );

  return { ...state, preview, stop };
}
