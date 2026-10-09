'use client';

import { useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  Plus,
  Sparkles,
  Loader2,
  ChevronDown,
  ChevronUp,
  Wand2,
  ClipboardPaste,
  SplitSquareVertical,
} from 'lucide-react';
import { useEditorStore } from '@/stores/editor-store';
import { useToast } from '@/components/ui';
import SceneCard from './SceneCard';

const TONES = ['Engaging', 'Professional', 'Casual', 'Dramatic', 'Educational', 'Humorous'] as const;
const LENGTHS = ['Short (30s)', 'Medium (60s)', 'Long (2-5min)'] as const;
const PLATFORMS = ['TikTok', 'YouTube Shorts', 'YouTube', 'Instagram Reels'] as const;

/** Step 1 — Script editor with AI generation + draggable scene cards. */
export default function ScriptStep() {
  const {
    title,
    setTitle,
    scenes,
    addScene,
    removeScene,
    updateScene,
    reorderScenes,
    generateScript,
    parseScriptIntoScenes,
    generateImage,
    isGeneratingScript,
    scriptError,
    generatingImageIds,
  } = useEditorStore();
  const { toast } = useToast();

  const [showAIForm, setShowAIForm] = useState(false);
  const [topic, setTopic] = useState('');
  const [tone, setTone] = useState<string>('Engaging');
  const [length, setLength] = useState<string>('Short (30s)');
  const [platform, setPlatform] = useState<string>('TikTok');

  const [showPasteForm, setShowPasteForm] = useState(false);
  const [pastedScript, setPastedScript] = useState('');

  function handleParsePaste() {
    if (!pastedScript.trim()) return;
    parseScriptIntoScenes(pastedScript);
    setShowPasteForm(false);
    setPastedScript('');
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIndex = scenes.findIndex((s) => s.id === active.id);
    const toIndex = scenes.findIndex((s) => s.id === over.id);
    if (fromIndex !== -1 && toIndex !== -1) {
      reorderScenes(fromIndex, toIndex);
    }
  }

  async function handleGenerate() {
    if (!topic.trim() || isGeneratingScript) return;
    await generateScript(topic, tone, length, platform);
    // SA-33: the store records WHY instead of throwing into this bare await.
    // Read it from the live store — the destructured value above belongs to the
    // pre-click render. Surfaced the same way CartoonScriptStep does (toast),
    // plus an inline line that outlives the toast: never a silent no-op (L1).
    const failed = useEditorStore.getState().scriptError;
    if (failed) {
      toast({ variant: 'error', title: 'Script generation failed', description: failed });
      return; // keep the panel open so the typed topic survives a retry
    }
    setShowAIForm(false);
  }

  const totalDuration = scenes.reduce((sum, s) => sum + s.duration, 0);
  const totalWords = scenes.reduce(
    (sum, s) => sum + s.narration.trim().split(/\s+/).filter(Boolean).length,
    0
  );

  return (
    <div className="space-y-5">
      {/* Title input */}
      <div>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Video title"
          className="w-full bg-transparent text-xl font-semibold text-text dark:text-white placeholder:text-muted border-none focus:outline-none focus:ring-0 text-[16px] md:text-xl min-h-[44px] md:min-h-0"
        />
      </div>

      {/* AI Generate toggle */}
      <div className="bg-accent-bg dark:bg-accent/5 border border-accent/20 rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => setShowAIForm(!showAIForm)}
          className="w-full flex items-center justify-between px-4 py-3 min-h-[44px] md:min-h-0 text-sm font-medium text-text dark:text-white hover:bg-accent/5 transition-colors"
        >
          <span className="flex items-center gap-2">
            <Sparkles size={16} className="text-accent" />
            Generate script with AI
          </span>
          {showAIForm ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {showAIForm && (
          <div className="px-4 pb-4 space-y-3 border-t border-accent/10">
            <div className="pt-3">
              <label className="text-[11px] font-medium text-muted uppercase tracking-wider mb-1 block">
                Topic or idea
              </label>
              <textarea
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                rows={2}
                placeholder="e.g. 5 hidden iPhone features that will blow your mind"
                className="w-full bg-white dark:bg-[#151515] border border-border-light dark:border-[#333] rounded-lg px-3 py-2 text-[16px] md:text-sm text-text dark:text-white placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent resize-none transition-all"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Tone */}
              <div>
                <label className="text-[11px] font-medium text-muted uppercase tracking-wider mb-1 block">Tone</label>
                <select
                  value={tone}
                  onChange={(e) => setTone(e.target.value)}
                  className="w-full bg-white dark:bg-[#151515] border border-border-light dark:border-[#333] rounded-lg px-3 py-2 min-h-[44px] md:min-h-0 text-[16px] md:text-sm text-text dark:text-white focus:outline-none focus:ring-2 focus:ring-accent/30"
                >
                  {TONES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              {/* Length */}
              <div>
                <label className="text-[11px] font-medium text-muted uppercase tracking-wider mb-1 block">Length</label>
                <select
                  value={length}
                  onChange={(e) => setLength(e.target.value)}
                  className="w-full bg-white dark:bg-[#151515] border border-border-light dark:border-[#333] rounded-lg px-3 py-2 min-h-[44px] md:min-h-0 text-[16px] md:text-sm text-text dark:text-white focus:outline-none focus:ring-2 focus:ring-accent/30"
                >
                  {LENGTHS.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>

              {/* Platform */}
              <div>
                <label className="text-[11px] font-medium text-muted uppercase tracking-wider mb-1 block">Platform</label>
                <select
                  value={platform}
                  onChange={(e) => setPlatform(e.target.value)}
                  className="w-full bg-white dark:bg-[#151515] border border-border-light dark:border-[#333] rounded-lg px-3 py-2 min-h-[44px] md:min-h-0 text-[16px] md:text-sm text-text dark:text-white focus:outline-none focus:ring-2 focus:ring-accent/30"
                >
                  {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>

            <button
              type="button"
              onClick={handleGenerate}
              disabled={!topic.trim() || isGeneratingScript}
              className="flex items-center gap-2 px-4 py-2.5 min-h-[44px] md:min-h-0 bg-accent hover:bg-accent/80 text-dark rounded-lg text-sm font-medium transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isGeneratingScript ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Generating script...
                </>
              ) : (
                <>
                  <Wand2 size={16} />
                  ✦ Generate Script
                </>
              )}
            </button>

            {scriptError && !isGeneratingScript && (
              <p className="text-[11px] text-danger" role="alert">
                {scriptError}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Paste-to-parse: split a full script into scenes on ¶ or --- (D-54) */}
      <div className="bg-surface dark:bg-[#1e1e1e] border border-border-light dark:border-[#333] rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => setShowPasteForm(!showPasteForm)}
          className="w-full flex items-center justify-between px-4 py-3 min-h-[44px] md:min-h-0 text-sm font-medium text-text dark:text-white hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors"
        >
          <span className="flex items-center gap-2">
            <ClipboardPaste size={16} className="text-primary" />
            Paste a script
          </span>
          {showPasteForm ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {showPasteForm && (
          <div className="px-4 pb-4 space-y-3 border-t border-border-light dark:border-[#333]">
            <p className="pt-3 text-[11px] text-muted">
              Paste your full script below. It splits into one scene per paragraph, or wherever you put a{' '}
              <code className="px-1 rounded bg-black/[0.05] dark:bg-white/[0.08]">---</code> separator line.
            </p>
            <textarea
              value={pastedScript}
              onChange={(e) => setPastedScript(e.target.value)}
              rows={6}
              placeholder={'First scene narration...\n\nSecond scene narration...\n\n---\nThird scene after a divider'}
              className="w-full bg-white dark:bg-[#151515] border border-border-light dark:border-[#333] rounded-lg px-3 py-2 text-[16px] md:text-sm text-text dark:text-white placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-y transition-all font-mono"
            />
            <button
              type="button"
              onClick={handleParsePaste}
              disabled={!pastedScript.trim()}
              className="flex items-center gap-2 px-4 py-2.5 min-h-[44px] md:min-h-0 bg-primary hover:bg-primary/80 text-white rounded-lg text-sm font-medium transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <SplitSquareVertical size={16} />
              Split into Scenes
            </button>
          </div>
        )}
      </div>

      {/* Scene stats bar */}
      <div className="flex items-center gap-4 text-xs text-muted">
        <span>{scenes.length} scene{scenes.length !== 1 ? 's' : ''}</span>
        <span className="w-px h-3 bg-border-light dark:bg-[#333]" />
        <span>{totalWords} words</span>
        <span className="w-px h-3 bg-border-light dark:bg-[#333]" />
        <span>~{totalDuration}s estimated</span>
      </div>

      {/* Scene cards (draggable) */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={scenes.map((s) => s.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-3">
            {scenes.map((scene, i) => (
              <SceneCard
                key={scene.id}
                scene={scene}
                index={i}
                total={scenes.length}
                isGeneratingImage={generatingImageIds.has(scene.id)}
                onUpdate={(data) => updateScene(scene.id, data)}
                onRemove={() => removeScene(scene.id)}
                onGenerateImage={() => generateImage(scene.id)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {/* Add scene button */}
      <button
        type="button"
        onClick={addScene}
        className="w-full flex items-center justify-center gap-2 py-3 min-h-[44px] md:min-h-0 border-2 border-dashed border-border dark:border-[#444] hover:border-primary dark:hover:border-primary rounded-xl text-sm font-medium text-muted hover:text-primary transition-all"
      >
        <Plus size={16} />
        Add Scene
      </button>
    </div>
  );
}
