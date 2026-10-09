import { create } from 'zustand';
import { Video, ScriptJSON, Scene, RenderProgress, RenderPhase } from '@/types';
import { api } from '@/lib/api';
import { localDB } from '@/lib/local-db';

interface VideoState {
  videos: Video[];
  currentVideo: Video | null;
  script: ScriptJSON | null;
  renderProgress: RenderProgress;
  isGenerating: boolean;

  fetchVideos: () => Promise<void>;
  createVideo: (data: Partial<Video>) => Promise<Video>;
  updateVideo: (id: number, data: Partial<Video>) => Promise<void>;
  deleteVideo: (id: number) => Promise<void>;
  setScript: (script: ScriptJSON) => void;
  updateScene: (sceneId: string, data: Partial<Scene>) => void;
  setRenderPhase: (phase: RenderPhase, message?: string) => void;
  setRenderProgress: (percent: number) => void;
}

export const useVideoStore = create<VideoState>((set, get) => ({
  videos: [],
  currentVideo: null,
  script: null,
  isGenerating: false,
  renderProgress: {
    phase: 'idle',
    currentScene: 0,
    totalScenes: 0,
    percent: 0,
    message: '',
  },

  fetchVideos: async () => {
    try {
      const data = await api.get<{ videos: Video[] }>('/videos');
      const videos = Array.isArray(data?.videos) ? data.videos : [];
      set({ videos });
      // Sync to local
      for (const v of videos) await localDB.put('videos', v);
    } catch {
      // Fallback to localDB
      try {
        const videos = await localDB.getAll<Video>('videos');
        set({ videos });
      } catch {
        set({ videos: [] });
      }
    }
  },

  createVideo: async (data) => {
    const video: Video = {
      ...data,
      id: Date.now(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as Video;
    const saved = await localDB.put<Video>('videos', video);
    set((s) => ({ videos: [saved, ...(s.videos ?? [])], currentVideo: saved }));
    // Sync to backend in background
    api.post<{ video: Video }>('/videos', data)
      .then((res) => {
        if (res?.video) {
          // Update local with server-assigned id/data
          localDB.put('videos', res.video).catch(() => {});
          set((s) => ({
            videos: s.videos.map((v) => (v.id === saved.id ? res.video : v)),
            currentVideo: s.currentVideo?.id === saved.id ? res.video : s.currentVideo,
          }));
        }
      })
      .catch(() => {});
    return saved;
  },

  updateVideo: async (id, data) => {
    const existing = await localDB.get<Video>('videos', id);
    if (existing) {
      await localDB.put('videos', { ...existing, ...data, updated_at: new Date().toISOString() });
    }
    set((s) => ({
      videos: s.videos.map((v) => (v.id === id ? { ...v, ...data } : v)),
      currentVideo: s.currentVideo?.id === id ? { ...s.currentVideo, ...data } : s.currentVideo,
    }));
    // Sync to backend in background
    api.put(`/videos/${id}`, data).catch(() => {});
  },

  deleteVideo: async (id) => {
    await localDB.delete('videos', id);
    set((s) => ({
      videos: s.videos.filter((v) => v.id !== id),
      currentVideo: s.currentVideo?.id === id ? null : s.currentVideo,
    }));
    // Sync to backend in background
    api.delete(`/videos/${id}`).catch(() => {});
  },

  setScript: (script) => set({ script }),

  updateScene: (sceneId, data) => {
    const script = get().script;
    if (!script) return;
    set({
      script: {
        ...script,
        scenes: script.scenes.map((s) => (s.id === sceneId ? { ...s, ...data } : s)),
      },
    });
  },

  setRenderPhase: (phase, message = '') => {
    set((s) => ({ renderProgress: { ...s.renderProgress, phase, message } }));
  },

  setRenderProgress: (percent) => {
    set((s) => ({ renderProgress: { ...s.renderProgress, percent } }));
  },
}));
