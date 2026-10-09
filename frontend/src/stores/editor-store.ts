import { create } from 'zustand';
import type { Scene, ScriptJSON, AspectRatio, VoiceProfile, Video } from '@/types';
import { api } from '@/lib/api';
import { scriptErrorMessage } from '@/lib/script-error';
import { useAvatarStore } from '@/stores/avatar-store';
import { anchorGenerationParams } from '@/lib/character-anchor';
import { VOICE_PRESETS } from '@/lib/voice-presets';

type EditorStep = 1 | 2 | 3 | 4 | 5;
type TransitionStyle = 'crossfade' | 'cut' | 'slide';

/* ── localStorage keys for cloned voice persistence ── */
const CLONED_VOICES_KEY = 'contentine-cloned-voices';

/** Map detected gender to a default Kokoro voice for TTS preview. */
const GENDER_KOKORO_MAP: Record<string, string> = {
  female: 'af_bella',
  male: 'am_adam',
};

interface ClonedVoiceMeta {
  id: number;
  name: string;
  gender: string | null;
  matched_kokoro_id: string | null;
  sample_duration: number;
  clone_type: 'f5tts' | 'kokoro-matched';
}

/** Persist cloned voice metadata to localStorage. */
function persistClonedVoices(voices: VoiceProfile[]): void {
  try {
    const cloned = voices.filter((v) => !v.is_preset);
    const meta: ClonedVoiceMeta[] = cloned.map((v) => ({
      id: v.id,
      name: v.name,
      gender: v.gender,
      matched_kokoro_id: v.matched_kokoro_id ?? null,
      sample_duration: v.sample_duration ?? 0,
      clone_type: v.cloneType ?? 'kokoro-matched',
    }));
    localStorage.setItem(CLONED_VOICES_KEY, JSON.stringify(meta));
  } catch { /* quota exceeded — ignore */ }
}

/** Read persisted cloned voice metadata from localStorage. */
function readPersistedClonedVoices(): ClonedVoiceMeta[] {
  try {
    const raw = localStorage.getItem(CLONED_VOICES_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ClonedVoiceMeta[];
  } catch {
    return [];
  }
}

interface EditorState {
  /* Wizard step */
  step: EditorStep;
  title: string;

  /* Script */
  scenes: Scene[];
  isGeneratingScript: boolean;
  /** Why the last AI script generation failed, or null (SA-33 — never silent). */
  scriptError: string | null;
  generatingImageIds: Set<string>;
  imageProgress: Map<string, number>;
  imageErrors: Map<string, string>;

  /* Seed-lock (Law L6) — when locked, on-device SD-Turbo images reproduce exactly */
  seedLocked: boolean;
  imageSeed: number;

  /* Voice */
  voiceId: number | null;
  voiceSpeed: number;
  voices: VoiceProfile[];
  voicesLoaded: boolean;

  /* Style */
  aspectRatio: AspectRatio;
  subtitleStyle: string;
  transitionStyle: TransitionStyle;
  musicUrl: string | null;
  musicVolume: number;

  /* Actions — navigation */
  setStep: (step: EditorStep) => void;
  nextStep: () => void;
  prevStep: () => void;

  /* Actions — script */
  setTitle: (title: string) => void;
  setScenes: (scenes: Scene[]) => void;
  addScene: () => void;
  removeScene: (id: string) => void;
  updateScene: (id: string, data: Partial<Scene>) => void;
  reorderScenes: (fromIndex: number, toIndex: number) => void;
  generateScript: (topic: string, tone: string, length: string, platform: string) => Promise<void>;

  /** Split a pasted script into scenes on `---` rules or blank-line paragraph breaks (D-54). */
  parseScriptIntoScenes: (text: string) => void;

  /* Actions — images */
  generateImage: (sceneId: string) => Promise<void>;
  generateAllImages: () => Promise<void>;

  /* Actions — seed-lock */
  setSeedLocked: (locked: boolean) => void;
  setImageSeed: (seed: number) => void;
  randomizeSeed: () => void;

  /* Actions — voice */
  setVoiceId: (id: number | null) => void;
  setVoiceSpeed: (speed: number) => void;
  fetchVoices: () => Promise<void>;
  addClonedVoice: (name: string, sampleBlob: Blob, gender?: string | null, sampleDuration?: number, cloneType?: 'f5tts' | 'kokoro-matched') => void;

  /** Synthesize narration for a scene using the selected voice (F5-TTS or Kokoro). */
  synthesizeNarration: (text: string) => Promise<ArrayBuffer | null>;

  /* Actions — style */
  setAspectRatio: (ratio: AspectRatio) => void;
  setSubtitleStyle: (style: string) => void;
  setTransitionStyle: (style: TransitionStyle) => void;
  setMusicUrl: (url: string | null) => void;
  setMusicVolume: (volume: number) => void;

  /* Build ScriptJSON payload */
  toScriptJSON: () => ScriptJSON;

  /** Load scenes from a raw video script text (e.g., from Content Remix Hub). */
  loadFromRemixScript: (scriptText: string) => void;

  /** Hydrate the wizard from a backend video record (F-41/F-12 remix→video bridge). Throws on failure. */
  hydrateFromVideoId: (videoId: string) => Promise<void>;

  /** True when the wizard holds no user work yet (safe to hydrate over). */
  isEmpty: () => boolean;

  /* Reset */
  reset: () => void;
}

/** Generate a unique scene ID. */
function sceneId(): string {
  return `scene_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Estimate scene duration from narration word count (~150 wpm). */
function estimateDuration(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(3, Math.round((words / 150) * 60));
}

const defaultScene = (): Scene => ({
  id: sceneId(),
  narration: '',
  visual_prompt: '',
  duration: 5,
  transition: 'crossfade',
});

/** Convert Float32Array PCM samples to a WAV ArrayBuffer. */
function float32ToWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
  return buffer;
}

/** Zustand store for the Video Generator wizard. */
export const useEditorStore = create<EditorState>((set, get) => ({
  step: 1,
  title: '',
  scenes: [defaultScene()],
  isGeneratingScript: false,
  scriptError: null,
  generatingImageIds: new Set(),
  imageProgress: new Map(),
  imageErrors: new Map(),
  seedLocked: false,
  imageSeed: 42,
  voiceId: null,
  voiceSpeed: 1,
  voices: [],
  voicesLoaded: false,
  aspectRatio: '9:16',
  subtitleStyle: 'modern-pop',
  transitionStyle: 'crossfade',
  musicUrl: null,
  musicVolume: 0.3,

  /* Navigation */
  setStep: (step) => set({ step }),
  nextStep: () => set((s) => ({ step: Math.min(5, s.step + 1) as EditorStep })),
  prevStep: () => set((s) => ({ step: Math.max(1, s.step - 1) as EditorStep })),

  /* Script */
  setTitle: (title) => set({ title }),
  setScenes: (scenes) => set({ scenes }),

  addScene: () =>
    set((s) => ({ scenes: [...s.scenes, defaultScene()] })),

  removeScene: (id) =>
    set((s) => ({
      scenes: s.scenes.length > 1 ? s.scenes.filter((sc) => sc.id !== id) : s.scenes,
    })),

  updateScene: (id, data) =>
    set((s) => ({
      scenes: s.scenes.map((sc) =>
        sc.id === id
          ? {
              ...sc,
              ...data,
              duration: data.narration !== undefined ? estimateDuration(data.narration) : sc.duration,
            }
          : sc
      ),
    })),

  reorderScenes: (fromIndex, toIndex) =>
    set((s) => {
      const next = [...s.scenes];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return { scenes: next };
    }),

  generateScript: async (topic, tone, length, platform) => {
    set({ isGeneratingScript: true, scriptError: null });
    try {
      const res = await api.post<{
        title: string;
        scenes: { narration: string; visual_prompt: string; duration: number }[];
      }>('/scripts/generate', { topic, tone, length, platform });

      const scenes: Scene[] = (res.scenes || []).map((s) => ({
        id: sceneId(),
        narration: s.narration,
        visual_prompt: s.visual_prompt,
        duration: s.duration || estimateDuration(s.narration),
        transition: 'crossfade' as const,
      }));

      set({ title: res.title || topic, scenes: scenes.length ? scenes : [defaultScene()] });
    } catch (err) {
      // SA-33: this used to be `finally` with NO `catch`, so the rejection
      // escaped to an unhandled promise rejection and the ONLY visible change
      // was the spinner switching off — indistinguishable from success.
      // It records the reason instead of rethrowing: callers `await` this bare,
      // and a throw here just recreates the unhandled rejection it replaced.
      set({ scriptError: scriptErrorMessage(err) });
    } finally {
      set({ isGeneratingScript: false });
    }
  },

  /* Split a pasted script into scenes on `---` rules or paragraph breaks (D-54) */
  parseScriptIntoScenes: (text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    // Prefer explicit `---` separators; otherwise split on blank lines (paragraphs).
    const hasRule = /(^|\n)\s*---\s*(\n|$)/.test(trimmed);
    const blocks = (hasRule
      ? trimmed.split(/(?:^|\n)\s*---\s*(?:\n|$)/)
      : trimmed.split(/\n\s*\n/)
    )
      .map((b) => b.replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    if (blocks.length === 0) return;
    const scenes: Scene[] = blocks.map((block, idx) => ({
      ...defaultScene(),
      id: `paste_${Date.now()}_${idx}`,
      narration: block,
      visual_prompt: '',
      duration: estimateDuration(block),
    }));
    set({ scenes });
  },

  /* Images — uses two-tier generator (API -> SD Turbo fallback) */
  generateImage: async (sid) => {
    const scene = get().scenes.find((s) => s.id === sid);
    if (!scene?.visual_prompt) return;

    set((s) => {
      const next = new Set(s.generatingImageIds);
      next.add(sid);
      const nextProgress = new Map(s.imageProgress);
      nextProgress.set(sid, 0);
      return { generatingImageIds: next, imageProgress: nextProgress };
    });

    try {
      const { generateImage: generate } = await import('@/lib/image-generator');
      const st = get();
      const sceneIndex = st.scenes.findIndex((s) => s.id === sid);

      // Character anchor (F-6/F-34): a selected anchor contributes a prompt
      // descriptor (both paths) + an identity seed (on-device path). Read the
      // selection straight from the avatar store — no hook needed here.
      const avatar = useAvatarStore.getState();
      const anchor = avatar.characters?.find((c) => c.id === avatar.selectedCharacterId) ?? null;
      const anchorParams = anchorGenerationParams(anchor);

      // Seed precedence: an explicit user seed-lock (F-13) ALWAYS wins over the
      // anchor's identity seed. When the user locks, derive a per-scene seed
      // (project seed + scene position) so scenes stay distinct yet reproducible.
      // Otherwise, if an anchor is selected, use its identity seed UNCHANGED
      // across scenes so the same character recurs (Law L6). Neither ⇒ undefined
      // ⇒ SD-Turbo picks a fresh random seed.
      const seed = st.seedLocked
        ? (st.imageSeed + Math.max(0, sceneIndex)) >>> 0
        : anchorParams.seed;

      const url = await generate(
        scene.visual_prompt,
        get().aspectRatio,
        (fraction) => {
          set((s) => {
            const nextProgress = new Map(s.imageProgress);
            nextProgress.set(sid, fraction);
            return { imageProgress: nextProgress };
          });
        },
        seed,
        anchor ? { promptSuffix: anchorParams.promptSuffix, referencePhoto: anchorParams.referencePhoto } : undefined
      );
      get().updateScene(sid, { image_url: url });
      set((s) => {
        const nextErr = new Map(s.imageErrors);
        nextErr.delete(sid);
        return { imageErrors: nextErr };
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Image generation failed';
      set((s) => {
        const nextErr = new Map(s.imageErrors);
        nextErr.set(sid, message);
        return { imageErrors: nextErr };
      });
    } finally {
      set((s) => {
        const next = new Set(s.generatingImageIds);
        next.delete(sid);
        const nextProgress = new Map(s.imageProgress);
        nextProgress.delete(sid);
        return { generatingImageIds: next, imageProgress: nextProgress };
      });
    }
  },

  generateAllImages: async () => {
    const scenes = get().scenes.filter((s) => s.visual_prompt && !s.image_url);
    // Generate sequentially to avoid overloading GPU/API
    for (const scene of scenes) {
      await get().generateImage(scene.id);
    }
  },

  /* Seed-lock */
  setSeedLocked: (seedLocked) => set({ seedLocked }),
  setImageSeed: (imageSeed) => set({ imageSeed: (imageSeed || 0) >>> 0 }),
  randomizeSeed: () => set({ imageSeed: Math.floor(Math.random() * 0xffffffff) >>> 0 }),

  /* Voice */
  setVoiceId: (id) => set({ voiceId: id }),
  setVoiceSpeed: (speed) => set({ voiceSpeed: speed }),

  fetchVoices: async () => {
    if (get().voicesLoaded) return;
    /** Reconstruct VoiceProfile objects from persisted cloned voice metadata. */
    const hydrateCloned = (metas: ClonedVoiceMeta[]): VoiceProfile[] =>
      metas.map((m) => ({
        id: m.id,
        user_id: null,
        name: m.name,
        kokoro_voice_id: null,
        source: 'cloned' as const,
        language: 'English',
        gender: m.gender,
        tone: 'custom',
        speed: 1,
        pitch: 1,
        style: 'cloned',
        is_preset: false,
        matched_kokoro_id: m.matched_kokoro_id ?? undefined,
        sample_duration: m.sample_duration,
        cloneType: m.clone_type ?? 'kokoro-matched',
      }));

    try {
      const res = await api.get<{ voices: VoiceProfile[] }>('/voices');
      const apiVoices = res.voices || [];
      const cloned = hydrateCloned(readPersistedClonedVoices());
      set({ voices: [...apiVoices, ...cloned], voicesLoaded: true });
    } catch {
      // Backend unavailable — use hardcoded presets + persisted cloned voices
      const cloned = hydrateCloned(readPersistedClonedVoices());
      set({ voices: [...VOICE_PRESETS, ...cloned], voicesLoaded: true });
    }
  },

  addClonedVoice: (name, sampleBlob, gender, sampleDuration, cloneType) => {
    const previewUrl = URL.createObjectURL(sampleBlob);
    const detectedGender = gender || null;
    const matchedKokoroId = detectedGender
      ? GENDER_KOKORO_MAP[detectedGender] || 'af_bella'
      : 'af_bella';

    const cloned: VoiceProfile = {
      id: Date.now(),
      user_id: null,
      name,
      kokoro_voice_id: null,
      source: 'cloned',
      language: 'English',
      gender: detectedGender,
      tone: 'custom',
      speed: 1,
      pitch: 1,
      style: 'cloned',
      is_preset: false,
      preview_url: previewUrl,
      matched_kokoro_id: matchedKokoroId,
      sample_blob: sampleBlob,
      sample_duration: sampleDuration || 0,
      cloneType: cloneType ?? 'kokoro-matched',
    };
    const voices = [...get().voices, cloned];
    set({ voices, voiceId: cloned.id });
    persistClonedVoices(voices);
  },

  synthesizeNarration: async (text: string): Promise<ArrayBuffer | null> => {
    const state = get();
    const voice = state.voices.find((v) => v.id === state.voiceId);
    if (!voice) return null;

    // F5-TTS cloned voice — use the cloned voice sample for synthesis
    if (voice.cloneType === 'f5tts' && voice.sample_blob) {
      try {
        const { f5ttsEngine } = await import('@/engine/f5tts-engine');
        const modelReady = await f5ttsEngine.isModelDownloaded();
        if (modelReady) {
          await f5ttsEngine.init();
          const sampleBuffer = await voice.sample_blob.arrayBuffer();
          return f5ttsEngine.cloneAndSpeak(sampleBuffer, text);
        }
      } catch {
        // Fall through to Kokoro fallback below
      }
    }

    // Kokoro TTS fallback — use matched Kokoro voice ID or the voice's own kokoro_voice_id
    const kokoroId = voice.matched_kokoro_id || voice.kokoro_voice_id || 'af_bella';
    try {
      const { ttsManager } = await import('@/engine/tts-manager');
      const result = await ttsManager.synthesize(text, kokoroId);
      // Convert Float32Array PCM to WAV ArrayBuffer for consistent return type
      return float32ToWav(result.buffer, result.sampleRate);
    } catch {
      return null;
    }
  },

  /* Style */
  setAspectRatio: (aspectRatio) => set({ aspectRatio }),
  setSubtitleStyle: (subtitleStyle) => set({ subtitleStyle }),
  setTransitionStyle: (transitionStyle) => set({ transitionStyle }),
  setMusicUrl: (musicUrl) => set({ musicUrl }),
  setMusicVolume: (musicVolume) => set({ musicVolume }),

  /* Build final ScriptJSON */
  toScriptJSON: () => {
    const s = get();
    return {
      scenes: s.scenes,
      music: s.musicUrl ? { url: s.musicUrl, volume: s.musicVolume } : undefined,
      settings: {
        aspect_ratio: s.aspectRatio,
        voice_id: String(s.voiceId || ''),
        subtitle_style: s.subtitleStyle,
      },
    };
  },

  isEmpty: () => {
    const s = get();
    return !s.title.trim() && (s.scenes ?? []).length <= 1 && !(s.scenes?.[0]?.narration?.trim());
  },

  hydrateFromVideoId: async (videoId: string) => {
    // Accept both {video: Video} and a bare Video body.
    const res = await api.get<{ video?: Video } & Partial<Video>>(`/videos/${videoId}`);
    const video = (res.video ?? res) as Video | undefined;
    const rawScenes = video?.script_json?.scenes;
    if (!video || !Array.isArray(rawScenes) || rawScenes.length === 0) {
      throw new Error('This video could not be opened in the editor (no scenes found).');
    }
    // ws8's server-side normalizers guarantee the canonical scene shape.
    const scenes: Scene[] = rawScenes.map((sc, idx) => ({
      id: sc.id || `loaded_${Date.now()}_${idx}`,
      narration: sc.narration || '',
      visual_prompt: sc.visual_prompt || '',
      duration: sc.duration || estimateDuration(sc.narration || ''),
      transition: sc.transition || 'crossfade',
      image_url: sc.image_url,
      ken_burns: sc.ken_burns,
    }));
    set({
      scenes,
      title: video.title || 'Imported video',
      aspectRatio: video.aspect_ratio || video.script_json?.settings?.aspect_ratio || '9:16',
      subtitleStyle: video.script_json?.settings?.subtitle_style || get().subtitleStyle,
      step: 1,
    });
  },

  /** Load scenes from a raw video script text (e.g., from Content Remix Hub). */
  loadFromRemixScript: (scriptText: string) => {
    // The video_script prompt outputs: "SCENE N: [visual description]\n[narration text]\n---"
    // Split by "---" or "SCENE N:" markers
    const rawBlocks = scriptText
      .split(/(?:^|\n)---\s*\n/m)
      .map((b) => b.trim())
      .filter(Boolean);

    // Further split by "SCENE N:" if needed (handles case where --- separators are missing)
    const blocks: string[] = [];
    for (const raw of rawBlocks) {
      const parts = raw.split(/(?=SCENE\s+\d+\s*:)/i).map((p) => p.trim()).filter(Boolean);
      blocks.push(...parts);
    }

    if (blocks.length === 0) {
      // Fallback: split by double newline
      const fallback = scriptText.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
      if (fallback.length === 0) return;
      const scenes: Scene[] = fallback.map((block, idx) => ({
        ...defaultScene(),
        id: `remix-${Date.now()}-${idx}`,
        narration: block,
        visual_prompt: `Visual for: ${block.slice(0, 80)}`,
        duration: estimateDuration(block),
      }));
      set({ scenes, step: 1, title: 'Remixed Video Script', isGeneratingScript: false, scriptError: null });
      return;
    }

    const newScenes: Scene[] = blocks.map((block, idx) => {
      // Strip "SCENE N:" prefix and extract visual description + narration
      const cleaned = block.replace(/^SCENE\s+\d+\s*:\s*/i, '').trim();
      const lines = cleaned.split('\n').map((l) => l.trim()).filter(Boolean);

      // First line is often the visual description (in brackets), rest is narration
      let visualPrompt = '';
      let narration = cleaned;

      if (lines.length >= 2) {
        const firstLine = lines[0];
        // Check if first line looks like a visual description (in brackets or starts with "[")
        if (/^\[.*\]$/.test(firstLine) || firstLine.toLowerCase().startsWith('visual:')) {
          visualPrompt = firstLine.replace(/^\[|\]$/g, '').replace(/^visual:\s*/i, '').trim();
          narration = lines.slice(1).join(' ').trim();
        } else {
          narration = lines.join(' ').trim();
          visualPrompt = `Visual for: ${narration.slice(0, 80)}`;
        }
      }

      return {
        ...defaultScene(),
        id: `remix-${Date.now()}-${idx}`,
        narration,
        visual_prompt: visualPrompt || `Visual for scene ${idx + 1}`,
        duration: estimateDuration(narration),
      };
    });

    set({
      scenes: newScenes.length > 0 ? newScenes : [defaultScene()],
      step: 1,
      title: 'Remixed Video Script',
      isGeneratingScript: false,
      scriptError: null,
    });
  },

  reset: () =>
    set({
      step: 1,
      title: '',
      scenes: [defaultScene()],
      isGeneratingScript: false,
      scriptError: null,
      generatingImageIds: new Set(),
      imageProgress: new Map(),
      imageErrors: new Map(),
      seedLocked: false,
      imageSeed: 42,
      voiceId: null,
      voiceSpeed: 1,
      aspectRatio: '9:16',
      subtitleStyle: 'modern-pop',
      transitionStyle: 'crossfade',
      musicUrl: null,
      musicVolume: 0.3,
    }),
}));
