import { create } from 'zustand';
import { RemixProject, RemixSource, RemixOutput, RemixTarget, SourceType } from '@/types';
import { api, APIError } from '@/lib/api';
import { localDB } from '@/lib/local-db';

/** Local source before saving to backend. */
export interface LocalSource {
  id: string;
  type: SourceType;
  title: string;
  text: string;
  url?: string;
  wordCount: number;
}

// ── Platform-Specific Remix Prompts (browser-native WebLLM fallback) ──
//
// These mirror the platform system prompts in docs/IMPLEMENTATION_SUPPLEMENT.md
// S3.2–S3.11 (the backend LLMService uses the full-length versions). They are
// condensed to fit a small on-device model's context window while preserving
// every load-bearing constraint from S3: character/word limits, hashtag rules,
// required structure, and the output format each platform expects.

/** System prompts for browser-native WebLLM fallback, keyed by target platform. */
const REMIX_SYSTEM_PROMPTS: Record<RemixTarget, string> = {
  // S3.2 Twitter/X
  twitter: 'You are a Twitter/X specialist. Transform the source into native Twitter content. Max 280 characters per tweet. If the material warrants it, write a thread of 3-7 tweets with [1/N] numbering; the first tweet MUST be a hook (surprising, contrarian, or curiosity-driven). Max 3 hashtags, at the end. Short, punchy sentences. Avoid links. End a thread with a CTA. Return only the tweet text (or the numbered thread).',
  // S3.3 LinkedIn
  linkedin: 'You are a LinkedIn strategist. Write a native LinkedIn post from the source. 1200-3000 characters. The first 2 lines must hook (they show before "…see more"). Professional but human, first person. Short 1-3 sentence paragraphs. Use "→" for list items, never bullets. End with a question CTA to drive comments, then 3-5 hashtags on their own lines. Avoid buzzwords (synergy, leverage, ecosystem). Return only the post text.',
  // S3.4 Instagram
  instagram: 'You are an Instagram caption writer. Write a caption from the source. 150-2200 characters (aim 500-1000). The first line must hook (shows before "…more"). Use 5-10 contextual emojis as visual breaks. Warm, conversational. Include a CTA (save, share, or tag). End with a block of up to 30 relevant hashtags (mix broad + niche), separated from the caption. Return only the caption followed by the hashtag block.',
  // S3.5 Facebook
  facebook: 'You are a Facebook creator. Write a conversational, shareable post from the source. 100-500 characters. Lead with emotion or curiosity; use "you" language. Short paragraphs, 1-3 emojis max. End with an open question to drive comments. No more than 1-2 hashtags. Return only the post text.',
  // S3.6 TikTok
  tiktok: 'You are a TikTok caption specialist. Write a caption that accompanies a video, from the source. Max 150 characters — keep it SHORT and hook-first to stop the scroll (e.g. "POV:", "Things nobody tells you about…", "Wait for it…"). 1-2 emojis max. Add 3-5 hashtags mixing trending + niche, always including #fyp. Return only the caption followed by the hashtags.',
  // S3.7 Threads
  threads: 'You are a Threads (Meta) writer. Write a native Threads post from the source. Max 500 characters per post; for longer material write a connected thread of 3-7 posts. Casual and personal, like texting a smart friend. Hot takes and questions work. No hashtags (Threads deprioritizes them), no link previews. Return only the post text (or the connected posts).',
  // S3.8 Blog Article
  blog: 'You are an SEO content strategist. Write a 1000-2000 word blog article from the source in Markdown. Start with an SEO title (≤60 chars) and a 155-char meta description line, then the article. Hook within the first 2 sentences. Use ## H2 headings every 200-300 words, active voice, 8th-grade reading level, and specific examples from the source. End with a conclusion and clear CTA. Return the article in Markdown.',
  // S3.9 Email Newsletter
  newsletter: 'You are an email newsletter writer. Write a 300-800 word newsletter from the source. First line: a curiosity-driven subject (6-10 words). Second line: 40-90 char preview text. Then a personal opener, the core insight reformatted for email, 3-5 key takeaways as bullets, one clear CTA, and a brief personal sign-off. Personal tone, "you" and "I", short paragraphs. Return the subject line first, then the body.',
  // S3.10 Video Script — kept in the "SCENE N:" text form the remix→video bridge parses
  video_script: 'You are a video script specialist. Turn the source into a short-form video script. Hook in the first 3 seconds. Write 4-8 scenes, each 5-15 seconds: conversational narration plus a specific, art-style-agnostic visual prompt (subject, action, setting, mood, camera angle). Always end with a CTA scene. Format each scene EXACTLY as:\nSCENE N: [visual prompt]\n[narration text]\n---',
};

/** Generate remixed content for a single platform using the browser engine manager (Gemini Nano or WebLLM). */
async function generateSingleViaBrowserEngine(
  platform: RemixTarget,
  sourceText: string,
  customInstructions: string,
): Promise<string> {
  const { browserEngineManager } = await import('@/engine/browser-engine-manager');
  const textEngine = await browserEngineManager.getTextEngine();

  let systemPrompt = REMIX_SYSTEM_PROMPTS[platform];
  if (customInstructions) {
    systemPrompt += `\n\nAdditional instructions: ${customInstructions}`;
  }

  // Truncate source text for smaller browser-native models (context window ~4K tokens)
  const truncated = sourceText.length > 6000
    ? sourceText.slice(0, 6000) + '\n\n[Content truncated for processing]'
    : sourceText;

  const userPrompt = `Here is the source content to remix:\n\n${truncated}`;

  return textEngine.generate(systemPrompt, userPrompt, {
    temperature: platform === 'video_script' ? 0.6 : 0.75,
    maxTokens: ['blog', 'newsletter'].includes(platform) ? 2048 : 1024,
  });
}

/**
 * "Generation failed: … Click Regenerate to try again." is this product's shared
 * convention for an output that is a failure NOTICE rather than content — it is
 * written verbatim by `RemixController::generate`'s catch AND by the browser
 * fallback in `generateRemix`. Treat such a body, or an empty one, as no answer.
 */
function isUsableOutput(text: string | null | undefined): boolean {
  const t = (text ?? '').trim();
  return t.length > 0 && !/^Generation failed:/.test(t);
}

/** Counter for generating local-only output IDs when backend is unavailable. */
let localOutputCounter = -1;

interface RemixState {
  // Wizard step
  wizardStep: 1 | 2 | 3;
  setWizardStep: (step: 1 | 2 | 3) => void;

  // Projects
  projects: RemixProject[];
  currentProject: RemixProject | null;
  isLoading: boolean;

  // Step 1: Sources
  localSources: LocalSource[];
  isExtracting: boolean;
  extractionError: string | null;
  /** An audio/video source is being transcribed on-device by Whisper. */
  isTranscribing: boolean;
  /** Whisper model download/transcription progress, 0..1. */
  transcribeProgress: number;

  // Step 2: Platforms
  selectedPlatforms: RemixTarget[];
  customInstructions: string;

  // Step 3: Results
  isGenerating: boolean;
  generateError: string | null;
  outputs: RemixOutput[];
  activeOutputTab: RemixTarget | null;

  // Project CRUD
  fetchProjects: () => Promise<void>;
  createProject: (name: string) => Promise<RemixProject>;
  loadProject: (id: number) => Promise<void>;
  deleteProject: (id: number) => Promise<void>;

  // Source management
  addTextSource: (title: string, text: string) => void;
  addUrlSource: (type: SourceType, url: string) => Promise<void>;
  /** Transcribe an uploaded audio/video file on-device (Whisper) and add its text. */
  transcribeSource: (file: File, type: 'audio' | 'video') => Promise<void>;
  removeSource: (id: string) => void;
  clearSources: () => void;

  // Platform management
  togglePlatform: (platform: RemixTarget) => void;
  selectAllPlatforms: () => void;
  deselectAllPlatforms: () => void;
  setCustomInstructions: (text: string) => void;

  // Generation
  generateRemix: () => Promise<void>;
  regenerateOutput: (platform: RemixTarget) => Promise<void>;
  updateOutput: (outputId: number, text: string) => void;
  setActiveOutputTab: (platform: RemixTarget) => void;

  // Video bridge
  toVideo: (projectId: number) => Promise<{ videoId: number; redirectTo: string }>;

  // Reset
  reset: () => void;
}

const ALL_PLATFORMS: RemixTarget[] = [
  'twitter', 'linkedin', 'instagram', 'facebook', 'tiktok',
  'threads', 'blog', 'newsletter', 'video_script',
];

let sourceCounter = 0;
let saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;

export const useRemixStore = create<RemixState>((set, get) => ({
  wizardStep: 1,
  projects: [],
  currentProject: null,
  isLoading: false,
  localSources: [],
  isExtracting: false,
  extractionError: null,
  isTranscribing: false,
  transcribeProgress: 0,
  selectedPlatforms: [],
  customInstructions: '',
  isGenerating: false,
  generateError: null,
  outputs: [],
  activeOutputTab: null,

  setWizardStep: (step) => set({ wizardStep: step }),

  // ── Project CRUD ──────────────────────────────────────────

  fetchProjects: async () => {
    set({ isLoading: true });
    try {
      const data = await api.get<{ projects: RemixProject[] }>('/remix/projects');
      const projects = Array.isArray(data?.projects) ? data.projects : [];
      set({ projects });
      // Sync to local
      for (const p of projects) await localDB.put('remix_projects', p);
    } catch {
      // Fallback to localDB
      try {
        const projects = await localDB.getAll<RemixProject>('remix_projects');
        set({ projects });
      } catch {
        set({ projects: [] });
      }
    } finally {
      set({ isLoading: false });
    }
  },

  createProject: async (name) => {
    const state = get();
    const sources = state.localSources.map((s, i) => ({
      source_type: s.type,
      source_url: s.url || null,
      source_title: s.title,
      extracted_text: s.text,
      sort_order: i,
    }));

    // Create locally first
    const localProject: RemixProject = {
      id: Date.now(),
      user_id: 0,
      name,
      custom_instructions: state.customInstructions || null,
      target_platforms: state.selectedPlatforms,
      status: 'draft',
      sources: sources as unknown as RemixSource[],
      outputs: [],
      created_at: new Date().toISOString(),
    };
    const saved = await localDB.put<RemixProject>('remix_projects', localProject);
    set((s) => ({ projects: [saved, ...(s.projects ?? [])], currentProject: saved }));

    // Sync to backend in background
    api.post<{ project: RemixProject }>('/remix/projects', {
      name,
      sources,
      target_platforms: state.selectedPlatforms,
      custom_instructions: state.customInstructions || null,
    })
      .then((res) => {
        if (res?.project) {
          localDB.put('remix_projects', res.project).catch(() => {});
          set((s) => ({
            projects: s.projects.map((p) => (p.id === saved.id ? res.project : p)),
            currentProject: s.currentProject?.id === saved.id ? res.project : s.currentProject,
          }));
        }
      })
      .catch(() => {});

    return saved;
  },

  loadProject: async (id) => {
    set({ isLoading: true });
    try {
      let project: RemixProject | null = null;

      try {
        const data = await api.get<{ project: RemixProject }>(`/remix/projects/${id}`);
        project = data?.project || null;
        if (project) {
          await localDB.put('remix_projects', project);
        }
      } catch {
        // Fallback to localDB
        project = await localDB.get<RemixProject>('remix_projects', id);
      }

      if (!project) throw new Error('Project not found');

      // Hydrate local sources from project
      const localSources: LocalSource[] = (project.sources || []).map((s: RemixSource) => ({
        id: `src-${++sourceCounter}`,
        type: s.source_type,
        title: s.source_title || 'Source',
        text: s.extracted_text || '',
        url: s.source_url || undefined,
        wordCount: (s.extracted_text || '').split(/\s+/).filter(Boolean).length,
      }));

      const outputs = project.outputs || [];
      const activeTab = outputs.length > 0 ? outputs[0].target_platform : null;

      // Also sync outputs to local
      for (const o of outputs) await localDB.put('remix_outputs', o).catch(() => {});

      set({
        currentProject: project,
        localSources,
        selectedPlatforms: project.target_platforms || [],
        customInstructions: project.custom_instructions || '',
        outputs,
        activeOutputTab: activeTab,
        wizardStep: outputs.length > 0 ? 3 : localSources.length > 0 ? 2 : 1,
      });
    } finally {
      set({ isLoading: false });
    }
  },

  deleteProject: async (id) => {
    await localDB.delete('remix_projects', id);
    set((s) => ({
      projects: s.projects.filter((p) => p.id !== id),
      currentProject: s.currentProject?.id === id ? null : s.currentProject,
    }));
    // Sync to backend in background
    api.delete(`/remix/projects/${id}`).catch(() => {});
  },

  // ── Source Management ─────────────────────────────────────

  addTextSource: (title, text) => {
    const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
    const source: LocalSource = {
      id: `src-${++sourceCounter}`,
      type: 'text',
      title: title || 'Pasted Text',
      text,
      wordCount,
    };
    set((s) => ({ localSources: [...s.localSources, source], extractionError: null }));
  },

  addUrlSource: async (type, url) => {
    set({ isExtracting: true, extractionError: null });
    try {
      let result: { title: string; text: string };

      try {
        // Backend ContentExtractor handles every URL source type: generic articles
        // (extractFromUrl), YouTube transcripts, and TikTok captions — per D-42, we do
        // NOT scrape browser-side (CORS blocks arbitrary fetches; readability is banned here).
        result = await api.post('/remix/extract', { type, url });
      } catch (apiErr) {
        // A real HTTP response from the backend (4xx/5xx) carries an honest failure reason
        // (e.g. "No captions available", "The URL returned HTTP 403"). Surface it as-is
        // instead of masking it behind a generic "backend required" message.
        if (apiErr instanceof APIError) throw apiErr;

        // Otherwise the backend was genuinely unreachable (offline / network error).
        // Guide the user to the browser-native path that fits their source type.
        if (type === 'url') {
          throw new Error(
            'Could not reach the extraction service. Copy the article text and add it with the "Paste Text" tab instead.'
          );
        } else if (type === 'pdf') {
          throw new Error(
            'Could not reach the extraction service. Download the PDF and add it with the "PDF Upload" tab instead.'
          );
        } else {
          throw new Error(
            `Could not reach the extraction service to read this ${type}. Check your connection and try again.`
          );
        }
      }

      if (!result || !(result.text || '').trim()) {
        throw new Error(
          'No readable content was found at that URL. Try a different link, or paste the text directly.'
        );
      }

      const wordCount = (result.text || '').split(/\s+/).filter(Boolean).length;
      const source: LocalSource = {
        id: `src-${++sourceCounter}`,
        type,
        title: result.title || url,
        text: result.text || '',
        url,
        wordCount,
      };
      set((s) => ({ localSources: [...s.localSources, source] }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to extract content from this URL';
      set({ extractionError: message });
      throw err;
    } finally {
      set({ isExtracting: false });
    }
  },

  transcribeSource: async (file, type) => {
    const state = get();
    if (state.localSources.length >= 10) {
      set({ extractionError: 'You can add up to 10 sources.' });
      return;
    }

    set({ isTranscribing: true, transcribeProgress: 0, extractionError: null });
    try {
      // On-device Whisper (Xenova/whisper-tiny) — no server in the path (Law L2).
      // The model is gated in the UI by the `captions` manifest entry; by the time
      // this runs the model is cached, so init() loads from storage without a
      // re-download. transcribe() self-inits and decodes the file's audio track
      // (AudioContext.decodeAudioData handles both bare audio and the audio track
      // of a video container).
      const { whisperEngine } = await import('@/engine/whisper-engine');

      // Surface real model-load/transcription progress into the store.
      const unsubscribe = whisperEngine.onStatusChange((status, progress) => {
        if (status === 'downloading' || status === 'loading') {
          set({ transcribeProgress: typeof progress === 'number' ? progress : 0 });
        }
      });

      let result;
      try {
        result = await whisperEngine.transcribe(file);
      } finally {
        unsubscribe();
      }

      const text = (result?.text || '').trim();
      if (!text) {
        throw new Error(
          `No speech could be transcribed from this ${type} file. Try a clearer recording, or paste a transcript in the "Paste Text" tab.`
        );
      }

      const wordCount = text.split(/\s+/).filter(Boolean).length;
      const source: LocalSource = {
        id: `src-${++sourceCounter}`,
        type,
        title: file.name.replace(/\.[^.]+$/, '') || (type === 'video' ? 'Video Transcript' : 'Audio Transcript'),
        text,
        wordCount,
      };
      set((s) => ({ localSources: [...s.localSources, source] }));
    } catch (err) {
      const message = err instanceof Error
        ? err.message
        : `Failed to transcribe this ${type} file.`;
      set({ extractionError: message });
      throw err;
    } finally {
      set({ isTranscribing: false, transcribeProgress: 0 });
    }
  },

  removeSource: (id) => {
    set((s) => ({ localSources: s.localSources.filter((src) => src.id !== id) }));
  },

  clearSources: () => set({ localSources: [], extractionError: null }),

  // ── Platform Management ───────────────────────────────────

  togglePlatform: (platform) => {
    set((s) => ({
      selectedPlatforms: s.selectedPlatforms.includes(platform)
        ? s.selectedPlatforms.filter((p) => p !== platform)
        : [...s.selectedPlatforms, platform],
    }));
  },

  selectAllPlatforms: () => set({ selectedPlatforms: [...ALL_PLATFORMS] }),
  deselectAllPlatforms: () => set({ selectedPlatforms: [] }),
  setCustomInstructions: (text) => set({ customInstructions: text }),

  // ── Generation ────────────────────────────────────────────

  generateRemix: async () => {
    const state = get();
    set({ isGenerating: true, generateError: null });

    try {
      // Create project if none exists
      let project = state.currentProject;
      if (!project) {
        const firstName = state.localSources[0]?.title || 'Untitled';
        try {
          project = await get().createProject(`Remix: ${firstName}`);
        } catch {
          // Backend unavailable — create a local-only project shell
          project = {
            id: localOutputCounter--,
            user_id: 0,
            name: `Remix: ${firstName}`,
            custom_instructions: state.customInstructions || null,
            target_platforms: state.selectedPlatforms,
            status: 'draft',
            sources: [],
            outputs: [],
            created_at: new Date().toISOString(),
          };
          await localDB.put('remix_projects', project).catch(() => {});
          set({ currentProject: project });
        }
      }

      const sourceTexts = state.localSources.map((s) => s.text);
      const combinedText = sourceTexts.join('\n\n---\n\n');

      let outputs: RemixOutput[] = [];
      let servedByBackend = false;

      try {
        // Try backend API first
        const genRes = await api.post<{ project: RemixProject }>('/remix/generate', {
          project_id: project.id,
          sources: sourceTexts,
          targets: state.selectedPlatforms,
          custom_instructions: state.customInstructions || undefined,
        });

        const updatedProject = genRes?.project;
        if (updatedProject) {
          outputs = Array.isArray(updatedProject.outputs) ? updatedProject.outputs : [];
          project = updatedProject;
        }
        servedByBackend = true;
      } catch {
        // Backend unavailable — fall back to browser-native WebLLM
        for (const platform of state.selectedPlatforms) {
          try {
            const generatedText = await generateSingleViaBrowserEngine(
              platform,
              combinedText,
              state.customInstructions,
            );

            outputs.push({
              id: localOutputCounter--,
              remix_project_id: project.id,
              target_platform: platform,
              generated_text: generatedText,
              generated_json: null,
              is_edited: false,
              status: 'generated',
              scheduled_post_id: null,
              video_id: null,
            });
          } catch (genErr) {
            const errMsg = genErr instanceof Error ? genErr.message : 'Generation failed';
            outputs.push({
              id: localOutputCounter--,
              remix_project_id: project.id,
              target_platform: platform,
              generated_text: `Generation failed: ${errMsg}. Click Regenerate to try again.`,
              generated_json: null,
              is_edited: false,
              status: 'generated',
              scheduled_post_id: null,
              video_id: null,
            });
          }
        }
      }

      // A 200 is not an answer. `RemixController::generate` catches its own
      // provider error per platform and STORES the failure as the output text
      // ("Generation failed: … Click Regenerate to try again." — the same
      // sentence the browser fallback above writes), status 'generated', HTTP
      // 200. So an unconfigured server silently pre-empts the browser engine
      // and the on-device path never runs — a Law-L2 inversion: creation ends
      // up depending on the server precisely when the server cannot create.
      // Retry those platforms on-device; keep the server's notice only if the
      // browser engine cannot do it either (it already says why).
      if (servedByBackend) {
        for (let i = 0; i < outputs.length; i++) {
          if (isUsableOutput(outputs[i].generated_text)) continue;
          try {
            outputs[i] = {
              ...outputs[i],
              generated_text: await generateSingleViaBrowserEngine(
                outputs[i].target_platform,
                combinedText,
                state.customInstructions,
              ),
            };
          } catch { /* keep the server's notice — it states the real reason */ }
        }
      }

      // Sync outputs and project to local
      for (const o of outputs) await localDB.put('remix_outputs', o).catch(() => {});
      await localDB.put('remix_projects', { ...project, outputs }).catch(() => {});

      const activeTab = outputs.length > 0
        ? (outputs.find((o) => o.target_platform === state.activeOutputTab)?.target_platform || outputs[0].target_platform)
        : null;

      set({
        currentProject: project,
        outputs,
        activeOutputTab: activeTab,
        wizardStep: 3,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Generation failed. Please try again.';
      set({ generateError: message, wizardStep: 3 });
    } finally {
      set({ isGenerating: false });
    }
  },

  regenerateOutput: async (platform) => {
    const state = get();
    if (!state.currentProject) return;

    set({ isGenerating: true });
    try {
      const sourceTexts = state.localSources.map((s) => s.text);
      const combinedText = sourceTexts.join('\n\n---\n\n');

      let newOutput: RemixOutput | undefined;

      try {
        // Try backend API first
        const regenRes = await api.post<{ project: RemixProject }>('/remix/generate', {
          project_id: state.currentProject.id,
          sources: sourceTexts,
          targets: [platform],
          custom_instructions: state.customInstructions || undefined,
        });

        const regenProject = regenRes?.project;
        newOutput = (Array.isArray(regenProject?.outputs) ? regenProject.outputs : []).find((o) => o.target_platform === platform);
      } catch {
        // Backend unavailable — fall back to browser-native WebLLM
        const generatedText = await generateSingleViaBrowserEngine(
          platform,
          combinedText,
          state.customInstructions,
        );

        newOutput = {
          id: localOutputCounter--,
          remix_project_id: state.currentProject.id,
          target_platform: platform,
          generated_text: generatedText,
          generated_json: null,
          is_edited: false,
          status: 'generated',
          scheduled_post_id: null,
          video_id: null,
        };
      }

      if (newOutput) {
        await localDB.put('remix_outputs', newOutput).catch(() => {});
        set((s) => ({
          outputs: s.outputs.map((o) => o.target_platform === platform ? newOutput! : o),
          currentProject: { ...s.currentProject!, outputs: s.outputs },
        }));
      }
    } finally {
      set({ isGenerating: false });
    }
  },

  updateOutput: (outputId, text) => {
    set((s) => ({
      outputs: s.outputs.map((o) =>
        o.id === outputId ? { ...o, generated_text: text, is_edited: true } : o
      ),
    }));

    // Save to localDB immediately
    const output = get().outputs.find((o) => o.id === outputId);
    if (output) {
      localDB.put('remix_outputs', { ...output, generated_text: text, is_edited: true }).catch(() => {});
    }

    // Debounced save to backend (1.5s delay)
    if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
    saveDebounceTimer = setTimeout(() => {
      const state = get();
      if (state.currentProject) {
        api.put(`/remix/projects/${state.currentProject.id}`, {
          outputs: [{ id: outputId, generated_text: text }],
        }).catch(() => { /* silent fail — will retry on next edit */ });
      }
    }, 1500);
  },

  setActiveOutputTab: (platform) => set({ activeOutputTab: platform }),

  // ── Video Bridge ──────────────────────────────────────────

  toVideo: async (projectId) => {
    const res = await api.post<{ video: { id: number }; redirect_to: string }>(
      `/remix/projects/${projectId}/to-video`
    );
    const videoId = res?.video?.id;
    const redirectTo = res?.redirect_to || '/editor';
    if (!videoId) throw new Error('Failed to convert remix to video');
    return { videoId, redirectTo };
  },

  // ── Reset ─────────────────────────────────────────────────

  reset: () => set({
    wizardStep: 1,
    currentProject: null,
    localSources: [],
    isExtracting: false,
    extractionError: null,
    isTranscribing: false,
    transcribeProgress: 0,
    selectedPlatforms: [],
    customInstructions: '',
    isGenerating: false,
    generateError: null,
    outputs: [],
    activeOutputTab: null,
  }),
}));
