'use client';

import { Dice5, Type, Subtitles, LogIn } from 'lucide-react';
import type { ScenePlanScene, CharacterBlock } from '@/engine/cartoon';
import type { SceneDirtyKind } from './SceneStrip';

/** Entrance union, derived from the engine type (no barrel export needed for it). */
type EntranceType = NonNullable<CharacterBlock['entrance']>['type'];

const ENTRANCE_OPTIONS: { value: EntranceType; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'walk-in', label: 'Walk in' },
  { value: 'pop-in', label: 'Pop in' },
  { value: 'fade-in', label: 'Fade in' },
];

interface SceneInspectorProps {
  scene: ScenePlanScene | null;
  sceneIndex: number;
  dirtyKind?: SceneDirtyKind;
  disabled?: boolean;
  onChangeText: (text: string) => void;
  onToggleCaption: (enabled: boolean) => void;
  onSetEntrance: (type: EntranceType) => void;
  onRerollBackground: () => void;
}

/**
 * Edits the SELECTED scene's real plan fields. Every control mutates the scene
 * plan (the source of truth) — never the video. Visual edits (caption /
 * entrance / background seed) update the preview live; a text edit stages a
 * re-voice, reflected only after a re-roll.
 */
export default function SceneInspector({
  scene,
  sceneIndex,
  dirtyKind,
  disabled = false,
  onChangeText,
  onToggleCaption,
  onSetEntrance,
  onRerollBackground,
}: SceneInspectorProps) {
  if (!scene) {
    return (
      <div className="bento-card p-4 text-center text-xs text-text-muted">
        Select a scene from the strip to edit it.
      </div>
    );
  }

  const line = scene.dialogue[0];
  const entrance = scene.characters[0]?.entrance?.type ?? 'none';

  return (
    <div className="bento-card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text dark:text-white">Scene {sceneIndex + 1}</h3>
        {dirtyKind === 'voice' && (
          <span className="text-[10px] font-medium text-accent">Text edited — re-roll to re-voice</span>
        )}
        {dirtyKind === 'visual' && (
          <span className="text-[10px] font-medium text-secondary">Edited — re-roll to bake into MP4</span>
        )}
      </div>

      {/* Narration text */}
      <label className="block">
        <span className="flex items-center gap-1.5 text-[11px] font-medium text-text-muted mb-1.5">
          <Type size={12} /> Narration
        </span>
        <textarea
          value={line?.text ?? ''}
          onChange={(e) => onChangeText(e.target.value)}
          disabled={disabled || !line}
          rows={3}
          placeholder="What the narrator says in this scene…"
          className="w-full rounded-lg bg-surface dark:bg-[#242424] border border-white/10 focus:border-primary focus:ring-1 focus:ring-primary outline-none px-3 py-2 text-[13px] text-text dark:text-white placeholder:text-text-muted resize-none transition-colors disabled:opacity-50"
        />
        <span className="mt-1 block text-[10px] text-text-muted">
          Changing the words re-synthesizes this line’s voice on the next re-roll.
        </span>
      </label>

      {/* Subtitles */}
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[12px] text-text dark:text-white">
          <Subtitles size={14} className="text-text-muted" /> Burned-in captions
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={scene.captions.enabled}
          disabled={disabled}
          onClick={() => onToggleCaption(!scene.captions.enabled)}
          className={`relative w-11 h-6 rounded-full transition-colors disabled:opacity-50 ${
            scene.captions.enabled ? 'bg-primary' : 'bg-black/20 dark:bg-white/15'
          }`}
          aria-label="Toggle burned-in captions for this scene"
        >
          <span
            className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
              scene.captions.enabled ? 'translate-x-5' : ''
            }`}
          />
        </button>
      </div>

      {/* Entrance */}
      <label className="block">
        <span className="flex items-center gap-1.5 text-[11px] font-medium text-text-muted mb-1.5">
          <LogIn size={12} /> Character entrance
        </span>
        <select
          value={entrance}
          disabled={disabled || scene.characters.length === 0}
          onChange={(e) => onSetEntrance(e.target.value as EntranceType)}
          className="w-full rounded-lg bg-surface dark:bg-[#242424] border border-white/10 focus:border-primary focus:ring-1 focus:ring-primary outline-none px-3 py-2 text-[13px] text-text dark:text-white transition-colors disabled:opacity-50"
        >
          {ENTRANCE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </label>

      {/* Background seed re-roll */}
      <div className="flex items-center justify-between">
        <div>
          <span className="flex items-center gap-1.5 text-[12px] text-text dark:text-white">
            <Dice5 size={14} className="text-text-muted" /> Background
          </span>
          <span className="text-[10px] text-text-muted tabular-nums">seed {scene.background.seed}</span>
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={onRerollBackground}
          className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-lg bg-surface dark:bg-[#2a2a2a] text-text dark:text-white text-xs font-medium hover:bg-border-light dark:hover:bg-[#333] transition-colors disabled:opacity-50 active:scale-95"
        >
          <Dice5 size={13} /> Re-roll
        </button>
      </div>
    </div>
  );
}
