'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  GripVertical,
  Trash2,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  Upload,
  Clock,
  Sparkles,
} from 'lucide-react';
import type { Scene } from '@/types';

interface SceneCardProps {
  scene: Scene;
  index: number;
  total: number;
  isGeneratingImage: boolean;
  onUpdate: (data: Partial<Scene>) => void;
  onRemove: () => void;
  onGenerateImage: () => void;
}

/** Draggable scene card for the script editor — narration + visual prompt + image preview. */
export default function SceneCard({
  scene,
  index,
  total,
  isGeneratingImage,
  onUpdate,
  onRemove,
  onGenerateImage,
}: SceneCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: scene.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const wordCount = scene.narration.trim().split(/\s+/).filter(Boolean).length;
  const estSeconds = Math.max(3, Math.round((wordCount / 150) * 60));

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`
        group relative bg-white dark:bg-[#1e1e1e] rounded-xl border transition-all duration-200
        ${isDragging
          ? 'border-primary shadow-lg shadow-primary/10 z-50 scale-[1.02]'
          : 'border-border-light dark:border-[#333] hover:border-border dark:hover:border-[#555]'
        }
      `}
    >
      {/* Header: drag handle + scene number + duration + delete */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-light dark:border-[#333]">
        <div className="flex items-center gap-2">
          <button
            {...attributes}
            {...listeners}
            className="touch-none text-muted hover:text-text dark:hover:text-white cursor-grab active:cursor-grabbing p-2 md:p-0.5 rounded transition-colors"
            aria-label="Drag to reorder"
          >
            <GripVertical size={16} />
          </button>
          <span className="text-xs font-semibold text-text dark:text-white tracking-wide">
            SCENE {index + 1}
            <span className="text-muted font-normal ml-1">of {total}</span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-[11px] text-muted">
            <Clock size={12} />
            ~{estSeconds}s
          </span>
          {total > 1 && (
            <button
              type="button"
              onClick={onRemove}
              className="p-2 md:p-1 rounded-md text-muted hover:text-danger hover:bg-danger/10 transition-colors md:opacity-0 md:group-hover:opacity-100"
              aria-label="Remove scene"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col lg:flex-row">
        {/* Left: narration + visual prompt */}
        <div className="flex-1 p-3 space-y-3 min-w-0">
          {/* Narration */}
          <div>
            <label className="text-[11px] font-medium text-muted uppercase tracking-wider mb-1 block">
              Narration
            </label>
            <textarea
              value={scene.narration}
              onChange={(e) => onUpdate({ narration: e.target.value })}
              rows={3}
              placeholder="What the voiceover says for this scene..."
              className="w-full bg-surface dark:bg-[#151515] border border-border-light dark:border-[#333] rounded-lg px-3 py-2 text-[16px] md:text-sm text-text dark:text-white placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none transition-all"
            />
            <div className="flex items-center justify-between mt-1">
              <span className="text-[11px] text-muted">{wordCount} words</span>
            </div>
          </div>

          {/* Visual prompt */}
          <div>
            <label className="text-[11px] font-medium text-muted uppercase tracking-wider mb-1 flex items-center gap-1">
              <Sparkles size={11} className="text-accent" />
              Visual Prompt
            </label>
            <textarea
              value={scene.visual_prompt}
              onChange={(e) => onUpdate({ visual_prompt: e.target.value })}
              rows={2}
              placeholder="Describe what the viewer sees — subject, action, setting, mood..."
              className="w-full bg-surface dark:bg-[#151515] border border-border-light dark:border-[#333] rounded-lg px-3 py-2 text-[16px] md:text-sm text-text dark:text-white placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent resize-none transition-all"
            />
          </div>
        </div>

        {/* Right: image preview */}
        <div className="w-full lg:w-44 p-3 border-t lg:border-t-0 lg:border-l border-border-light dark:border-[#333] flex flex-col items-center justify-center gap-2">
          {scene.image_url ? (
            <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-surface dark:bg-[#151515]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={scene.image_url}
                alt={`Scene ${index + 1} visual`}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-black/0 hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 hover:opacity-100">
                <button
                  type="button"
                  onClick={onGenerateImage}
                  className="p-2.5 md:p-1.5 rounded-full bg-white/90 text-text hover:bg-white transition-colors"
                  title="Regenerate image"
                >
                  <RefreshCw size={14} />
                </button>
              </div>
            </div>
          ) : isGeneratingImage ? (
            <div className="w-full aspect-video rounded-lg bg-surface dark:bg-[#151515] flex flex-col items-center justify-center gap-2">
              <Loader2 size={20} className="text-accent animate-spin" />
              <span className="text-[11px] text-muted">Generating...</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={onGenerateImage}
              disabled={!scene.visual_prompt.trim()}
              className="w-full aspect-video rounded-lg border-2 border-dashed border-border dark:border-[#444] hover:border-accent dark:hover:border-accent flex flex-col items-center justify-center gap-1.5 min-h-[44px] text-muted hover:text-accent transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ImageIcon size={20} />
              <span className="text-[11px] font-medium">Generate Image</span>
            </button>
          )}

          {/* Ken Burns direction (mini selector) */}
          {scene.image_url && (
            <select
              value={
                scene.ken_burns?.end?.scale === 1.2 && scene.ken_burns?.start?.scale === 1 ? 'zoom-in'
                : scene.ken_burns?.start?.scale === 1.2 && scene.ken_burns?.end?.scale === 1 ? 'zoom-out'
                : (scene.ken_burns?.end?.x ?? 0.5) < (scene.ken_burns?.start?.x ?? 0.5) ? 'pan-left'
                : (scene.ken_burns?.end?.x ?? 0.5) > (scene.ken_burns?.start?.x ?? 0.5) ? 'pan-right'
                : 'zoom-in'
              }
              onChange={(e) => {
                const dir = e.target.value;
                const kb = dir === 'zoom-in'
                  ? { start: { x: 0.5, y: 0.5, scale: 1 }, end: { x: 0.5, y: 0.5, scale: 1.2 } }
                  : dir === 'zoom-out'
                    ? { start: { x: 0.5, y: 0.5, scale: 1.2 }, end: { x: 0.5, y: 0.5, scale: 1 } }
                    : dir === 'pan-left'
                      ? { start: { x: 0.6, y: 0.5, scale: 1.1 }, end: { x: 0.4, y: 0.5, scale: 1.1 } }
                      : { start: { x: 0.4, y: 0.5, scale: 1.1 }, end: { x: 0.6, y: 0.5, scale: 1.1 } };
                onUpdate({ ken_burns: kb });
              }}
              className="w-full text-[16px] md:text-[11px] bg-surface dark:bg-[#151515] border border-border-light dark:border-[#333] rounded-md px-2 py-1 min-h-[44px] md:min-h-0 text-text dark:text-white focus:outline-none focus:ring-1 focus:ring-primary/30"
            >
              <option value="zoom-in">Zoom In</option>
              <option value="zoom-out">Zoom Out</option>
              <option value="pan-left">Pan Left</option>
              <option value="pan-right">Pan Right</option>
            </select>
          )}
        </div>
      </div>
    </div>
  );
}
