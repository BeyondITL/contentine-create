import { create } from 'zustand';
import type { AvatarPreset, CharacterAnchor, AspectRatio, Scene, ScriptJSON, VoiceProfile } from '@/types';
import { api } from '@/lib/api';
import { scriptErrorMessage } from '@/lib/script-error';
import { LOCAL_AVATAR_PRESETS } from '@/data/avatar-presets';
import { VOICE_PRESETS } from '@/lib/voice-presets';

type AvatarEditorStep = 1 | 2 | 3 | 4 | 5;

/** Three-tier avatar strategy per CLAUDE.md. */
export type AvatarTier = 'quick' | 'photo' | 'pro';

interface AvatarEditorState {
  /* Wizard step */
  step: AvatarEditorStep;
  title: string;

  /** Active avatar rendering tier. */
  avatarTier: AvatarTier;

  /* Avatar selection */
  avatars: AvatarPreset[];
  avatarsLoaded: boolean;
  selectedAvatarId: number | null;
  customAvatarFile: File | null;
  customAvatarUrl: string | null;

  /* Characters */
  characters: CharacterAnchor[];
  charactersLoaded: boolean;
  selectedCharacterId: number | null;

  /* Script */
  scenes: Scene[];
  isGeneratingScript: boolean;
  /** Why the last AI script generation failed, or null (SA-33 — never silent). */
  scriptError: string | null;

  /* Voice */
  voiceId: number | null;
  voiceSpeed: number;
  voices: VoiceProfile[];
  voicesLoaded: boolean;

  /* Style */
  aspectRatio: AspectRatio;
  subtitleStyle: string;
  backgroundStyle: 'solid' | 'gradient' | 'blur';
  backgroundColor: string;

  /* Face detection state */
  faceDetected: boolean;
  faceDetectionProgress: number;
  faceDetectionMessage: string;

  /* Actions — navigation */
  setStep: (step: AvatarEditorStep) => void;
  nextStep: () => void;
  prevStep: () => void;

  /* Actions — tier */
  setAvatarTier: (tier: AvatarTier) => void;

  /* Actions — avatars */
  fetchAvatars: () => Promise<void>;
  selectAvatar: (id: number) => void;
  setCustomAvatar: (file: File) => void;
  clearCustomAvatar: () => void;

  /* Actions — characters */
  fetchCharacters: () => Promise<void>;
  selectCharacter: (id: number) => void;
  createCharacter: (data: Partial<CharacterAnchor>) => Promise<void>;
  deleteCharacter: (id: number) => Promise<void>;

  /* Actions — script */
  setTitle: (title: string) => void;
  setScenes: (scenes: Scene[]) => void;
  addScene: () => void;
  removeScene: (id: string) => void;
  updateScene: (id: string, data: Partial<Scene>) => void;
  generateScript: (topic: string, tone: string, length: string) => Promise<void>;

  /* Actions — voice */
  setVoiceId: (id: number | null) => void;
  setVoiceSpeed: (speed: number) => void;
  fetchVoices: () => Promise<void>;

  /* Actions — style */
  setAspectRatio: (ratio: AspectRatio) => void;
  setSubtitleStyle: (style: string) => void;
  setBackgroundStyle: (style: 'solid' | 'gradient' | 'blur') => void;
  setBackgroundColor: (color: string) => void;

  /* Face detection */
  setFaceDetected: (detected: boolean) => void;
  setFaceDetectionProgress: (percent: number, message: string) => void;

  /* Build ScriptJSON */
  toScriptJSON: () => ScriptJSON;

  /* Get selected avatar */
  getSelectedAvatar: () => AvatarPreset | null;

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

// Local preset data is shared from @/data/avatar-presets to avoid duplication

/** Zustand store for the Avatar Video Editor wizard. */
export const useAvatarStore = create<AvatarEditorState>((set, get) => ({
  step: 1,
  title: '',
  avatarTier: 'photo',
  avatars: [],
  avatarsLoaded: false,
  selectedAvatarId: null,
  customAvatarFile: null,
  customAvatarUrl: null,
  characters: [],
  charactersLoaded: false,
  selectedCharacterId: null,
  scenes: [defaultScene()],
  isGeneratingScript: false,
  scriptError: null,
  voiceId: null,
  voiceSpeed: 1,
  voices: [],
  voicesLoaded: false,
  aspectRatio: '9:16',
  subtitleStyle: 'modern-pop',
  backgroundStyle: 'blur',
  backgroundColor: '#0a0a0a',
  faceDetected: false,
  faceDetectionProgress: 0,
  faceDetectionMessage: '',

  /* Navigation */
  setStep: (step) => set({ step }),
  nextStep: () => set((s) => ({ step: Math.min(5, s.step + 1) as AvatarEditorStep })),
  prevStep: () => set((s) => ({ step: Math.max(1, s.step - 1) as AvatarEditorStep })),

  /* Tier */
  setAvatarTier: (tier) => set({ avatarTier: tier }),

  /* Avatars */
  fetchAvatars: async () => {
    if (get().avatarsLoaded) return;
    try {
      const res = await api.get<{ avatars: AvatarPreset[] }>('/avatars/presets');
      set({ avatars: res.avatars || [], avatarsLoaded: true });
    } catch {
      set({ avatars: LOCAL_AVATAR_PRESETS, avatarsLoaded: true });
    }
  },

  selectAvatar: (id) => set({ selectedAvatarId: id, customAvatarFile: null, customAvatarUrl: null, faceDetected: false }),

  setCustomAvatar: (file) => {
    const url = URL.createObjectURL(file);
    set({ customAvatarFile: file, customAvatarUrl: url, selectedAvatarId: null, faceDetected: false });
  },

  clearCustomAvatar: () => {
    const current = get().customAvatarUrl;
    if (current) URL.revokeObjectURL(current);
    set({ customAvatarFile: null, customAvatarUrl: null });
  },

  /* Characters */
  fetchCharacters: async () => {
    if (get().charactersLoaded) return;
    try {
      const res = await api.get<{ characters: CharacterAnchor[] }>('/characters');
      set({ characters: res.characters || [], charactersLoaded: true });
    } catch {
      set({ charactersLoaded: true });
    }
  },

  selectCharacter: (id) => set({ selectedCharacterId: id }),

  createCharacter: async (data) => {
    try {
      const res = await api.post<{ character: CharacterAnchor }>('/characters', data);
      if (res.character) {
        set((s) => ({ characters: [...s.characters, res.character] }));
      }
    } catch {
      // Silent fail — character creation is non-critical
    }
  },

  deleteCharacter: async (id) => {
    try {
      await api.delete(`/characters/${id}`);
      set((s) => ({
        characters: s.characters.filter((c) => c.id !== id),
        selectedCharacterId: s.selectedCharacterId === id ? null : s.selectedCharacterId,
      }));
    } catch {
      // Silent fail
    }
  },

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

  generateScript: async (topic, tone, length) => {
    set({ isGeneratingScript: true, scriptError: null });
    try {
      const res = await api.post<{
        title: string;
        scenes: { narration: string; visual_prompt: string; duration: number }[];
      }>('/scripts/generate', { topic, tone, length, platform: 'avatar' });

      const scenes: Scene[] = (res.scenes || []).map((s) => ({
        id: sceneId(),
        narration: s.narration,
        visual_prompt: s.visual_prompt,
        duration: s.duration || estimateDuration(s.narration),
        transition: 'crossfade' as const,
      }));

      set({ title: res.title || topic, scenes: scenes.length ? scenes : [defaultScene()] });
    } catch (err) {
      // SA-33: identical code shape to editor-store's — a `finally` with no
      // `catch`, awaited bare by AvatarScriptStep, so the failure showed up
      // only as the spinner stopping. Record the reason; do not rethrow into
      // a bare await (that is the unhandled rejection this replaces).
      set({ scriptError: scriptErrorMessage(err) });
    } finally {
      set({ isGeneratingScript: false });
    }
  },

  /* Voice */
  setVoiceId: (id) => set({ voiceId: id }),
  setVoiceSpeed: (speed) => set({ voiceSpeed: speed }),

  fetchVoices: async () => {
    if (get().voicesLoaded) return;
    // L2: creation must never depend on the backend. Fall back to the shared
    // client-side Kokoro VOICE_PRESETS whenever the backend is unavailable OR
    // returns no presets, so the avatar flow works offline like editor-store's
    // flows do (SA-28: this fallback was missing → "No voices available" dead-end).
    try {
      const res = await api.get<{ voices: VoiceProfile[] }>('/voices');
      const apiVoices = res.voices || [];
      set({ voices: apiVoices.length > 0 ? apiVoices : VOICE_PRESETS, voicesLoaded: true });
    } catch {
      set({ voices: VOICE_PRESETS, voicesLoaded: true });
    }
  },

  /* Style */
  setAspectRatio: (aspectRatio) => set({ aspectRatio }),
  setSubtitleStyle: (subtitleStyle) => set({ subtitleStyle }),
  setBackgroundStyle: (backgroundStyle) => set({ backgroundStyle }),
  setBackgroundColor: (backgroundColor) => set({ backgroundColor }),

  /* Face detection */
  setFaceDetected: (detected) => set({ faceDetected: detected }),
  setFaceDetectionProgress: (percent, message) =>
    set({ faceDetectionProgress: percent, faceDetectionMessage: message }),

  /* Build final ScriptJSON */
  toScriptJSON: () => {
    const s = get();
    return {
      scenes: s.scenes,
      settings: {
        aspect_ratio: s.aspectRatio,
        voice_id: String(s.voiceId || ''),
        subtitle_style: s.subtitleStyle,
      },
    };
  },

  /* Get selected avatar */
  getSelectedAvatar: () => {
    const s = get();
    if (s.selectedAvatarId) {
      return s.avatars.find((a) => a.id === s.selectedAvatarId) || null;
    }
    return null;
  },

  reset: () => {
    const current = get().customAvatarUrl;
    if (current) URL.revokeObjectURL(current);
    set({
      step: 1,
      title: '',
      avatarTier: 'photo',
      selectedAvatarId: null,
      customAvatarFile: null,
      customAvatarUrl: null,
      selectedCharacterId: null,
      scenes: [defaultScene()],
      isGeneratingScript: false,
      scriptError: null,
      voiceId: null,
      voiceSpeed: 1,
      aspectRatio: '9:16',
      subtitleStyle: 'modern-pop',
      backgroundStyle: 'blur',
      backgroundColor: '#0a0a0a',
      faceDetected: false,
      faceDetectionProgress: 0,
      faceDetectionMessage: '',
    });
  },
}));
