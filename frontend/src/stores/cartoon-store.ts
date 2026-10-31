/**
 * Contentine Create — Cartoon Studio wizard + timeline-editor state (WS-4)
 *
 * Holds the cartoon-specific selections (step nav, style, output format) AND
 * the post-generate timeline editor's session.
 *
 * Script (title/scenes) and voice (voiceId/voiceSpeed/voices) are REUSED from
 * editor-store — the cartoon flow shares the same script editor and voice
 * picker the video wizard uses.
 *
 * Two tiers of editor state, kept apart on purpose:
 *   - `session` — the LIVE render objects (voice-take PCM, the MP4 Blob, decoded
 *     backgrounds). Non-serializable, in-memory only, tab-lifetime. Never
 *     persisted. Handed from the generate step to the editor; the editor owns
 *     its rapidly-mutating working copy locally.
 *   - `history` — SERIALIZABLE scene-plan snapshots, persisted to IndexedDB via
 *     `lib/cartoon/plan-history-db`. This is the version history (restore + diff).
 */

import { create } from 'zustand';
import { DEFAULT_STYLE_ID } from '@/lib/cartoon/styles';
import {
  listSnapshots,
  putSnapshot,
  deleteSnapshot,
  type PlanSnapshot,
} from '@/lib/cartoon/plan-history-db';
import type { ScenePlan, VoiceTake, CartoonRenderResult } from '@/engine/cartoon';

export type CartoonStep = 1 | 2 | 3 | 4;

/**
 * The live render objects handed to the timeline editor. `plan` here is the
 * plan the current `result` was rendered from (the re-render baseline); the
 * editor keeps its own edited working copy and calls back with a new session
 * after a re-roll.
 */
export interface RenderSession {
  plan: ScenePlan;
  takes: Map<string, VoiceTake>;
  result: CartoonRenderResult;
  bgAssets: Map<string, ImageBitmap>;
  /**
   * The saved project this session edits (project store): its current
   * revision and plan. Edits commit through the shared command layer with
   * this revision as the compare-and-swap precondition. The current plan can
   * be ahead of `plan` (edited but not yet rendered).
   */
  project?: { workspaceId: string; revision: number; plan: ScenePlan };
}

interface CartoonState {
  // ── Wizard ──────────────────────────────────────────────────────────────
  step: CartoonStep;
  styleId: string;
  formatId: '16:9' | '9:16' | '1:1';

  setStep: (step: CartoonStep) => void;
  nextStep: () => void;
  prevStep: () => void;
  setStyleId: (id: string) => void;
  setFormatId: (id: '16:9' | '9:16' | '1:1') => void;

  // ── Timeline editor (post-generate) ─────────────────────────────────────
  editorOpen: boolean;
  session: RenderSession | null;

  /** Hand the first render to the editor and open it. */
  openEditor: (session: RenderSession) => void;
  /** Replace the editor's render baseline after a re-roll (result changed). */
  updateSession: (session: RenderSession) => void;
  closeEditor: () => void;

  // ── Plan history (persisted, IndexedDB) ─────────────────────────────────
  history: PlanSnapshot[];
  historyLoading: boolean;

  loadHistory: (projectId: string) => Promise<void>;
  pushSnapshot: (args: { projectId: string; planHash: string; label: string; plan: ScenePlan }) => Promise<void>;
  removeSnapshot: (id: string) => Promise<void>;

  reset: () => void;
}

function newSnapshotId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `snap-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

export const useCartoonStore = create<CartoonState>((set, get) => ({
  step: 1,
  styleId: DEFAULT_STYLE_ID,
  formatId: '16:9',

  setStep: (step) => set({ step }),
  nextStep: () => set((s) => ({ step: Math.min(4, s.step + 1) as CartoonStep })),
  prevStep: () => set((s) => ({ step: Math.max(1, s.step - 1) as CartoonStep })),
  setStyleId: (styleId) => set({ styleId }),
  setFormatId: (formatId) => set({ formatId }),

  editorOpen: false,
  session: null,

  openEditor: (session) => set({ session, editorOpen: true }),
  updateSession: (session) => set({ session }),
  closeEditor: () => set({ editorOpen: false }),

  history: [],
  historyLoading: false,

  loadHistory: async (projectId) => {
    set({ historyLoading: true });
    try {
      const history = await listSnapshots(projectId);
      set({ history });
    } finally {
      set({ historyLoading: false });
    }
  },

  pushSnapshot: async ({ projectId, planHash, label, plan }) => {
    // Skip a no-op snapshot: identical plan hash to the newest existing entry.
    const newest = get().history[0];
    if (newest && newest.planHash === planHash) return;
    const snapshot: PlanSnapshot = {
      id: newSnapshotId(),
      projectId,
      planHash,
      label,
      createdAt: Date.now(),
      // Deep-clone so later in-place plan edits never mutate a stored version.
      plan: JSON.parse(JSON.stringify(plan)) as ScenePlan,
    };
    await putSnapshot(snapshot);
    set({ history: [snapshot, ...get().history].slice(0, 50) });
  },

  removeSnapshot: async (id) => {
    await deleteSnapshot(id);
    set({ history: get().history.filter((s) => s.id !== id) });
  },

  reset: () =>
    set({
      step: 1,
      styleId: DEFAULT_STYLE_ID,
      formatId: '16:9',
      editorOpen: false,
      session: null,
      history: [],
      historyLoading: false,
    }),
}));
