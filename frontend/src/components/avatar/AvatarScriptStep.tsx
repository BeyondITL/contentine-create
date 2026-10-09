'use client';

import { useState } from 'react';
import { Plus, Trash2, Loader2, Sparkles, Clock, GripVertical } from 'lucide-react';
import { useAvatarStore } from '@/stores/avatar-store';
import { useToast } from '@/components/ui';

/** Step 2 — Write or AI-generate the narration script for avatar videos. */
export default function AvatarScriptStep() {
  const {
    title, setTitle, scenes, addScene, removeScene, updateScene,
    isGeneratingScript, generateScript, scriptError,
  } = useAvatarStore();
  const { toast } = useToast();

  const [aiTopic, setAiTopic] = useState('');
  const [aiTone, setAiTone] = useState('professional');
  const [aiLength, setAiLength] = useState('short');
  const [showAiPanel, setShowAiPanel] = useState(false);

  const totalWords = scenes.reduce((sum, s) => {
    const w = s.narration.trim().split(/\s+/).filter(Boolean).length;
    return sum + w;
  }, 0);
  const totalDuration = scenes.reduce((sum, s) => sum + s.duration, 0);

  async function handleAiGenerate() {
    if (!aiTopic.trim() || isGeneratingScript) return;
    await generateScript(aiTopic, aiTone, aiLength);
    // SA-33: the store records WHY instead of throwing into this bare await.
    // Read it from the live store — the destructured value above belongs to the
    // pre-click render. Toast + an inline line that outlives the toast (L1).
    const failed = useAvatarStore.getState().scriptError;
    if (failed) {
      toast({ variant: 'error', title: 'Script generation failed', description: failed });
      return; // keep the panel open so the typed topic survives a retry
    }
    setShowAiPanel(false);
  }

  return (
    <div className="space-y-5">
      {/* Title */}
      <div>
        <label className="text-xs font-medium text-muted uppercase tracking-wider mb-1.5 block">
          Video Title
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Give your avatar video a title..."
          className="w-full bg-white dark:bg-[#1e1e1e] border border-border-light dark:border-[#333] rounded-xl px-4 py-3 text-[16px] md:text-sm text-text dark:text-white placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all min-h-[44px]"
        />
      </div>

      {/* AI Generate toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-text dark:text-white">Script Scenes</h3>
          <span className="text-[11px] text-muted">
            {scenes.length} scene{scenes.length !== 1 ? 's' : ''} &middot; ~{totalWords} words &middot; ~{totalDuration}s
          </span>
        </div>
        <button
          type="button"
          onClick={() => setShowAiPanel(!showAiPanel)}
          className="flex items-center gap-1.5 px-3 py-2 md:py-1.5 bg-accent/10 text-accent rounded-lg text-xs font-medium hover:bg-accent/15 transition-colors min-h-[44px] md:min-h-0 self-start sm:self-auto"
        >
          <Sparkles size={12} />
          AI Generate
        </button>
      </div>

      {/* AI Generate panel */}
      {showAiPanel && (
        <div className="bg-accent/5 border border-accent/20 rounded-xl p-4 space-y-3">
          <p className="text-xs font-medium text-accent flex items-center gap-1">
            <Sparkles size={12} />
            AI Script Generator
          </p>
          <input
            type="text"
            value={aiTopic}
            onChange={(e) => setAiTopic(e.target.value)}
            placeholder="What should the avatar talk about?"
            className="w-full bg-white dark:bg-[#151515] border border-border-light dark:border-[#333] rounded-lg px-3 py-2.5 md:py-2 text-[16px] md:text-sm text-text dark:text-white placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/30 min-h-[44px] md:min-h-0"
          />
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
            <select
              value={aiTone}
              onChange={(e) => setAiTone(e.target.value)}
              className="flex-1 bg-white dark:bg-[#151515] border border-border-light dark:border-[#333] rounded-lg px-3 py-2.5 md:py-2 text-[16px] md:text-xs text-text dark:text-white focus:outline-none min-h-[44px] md:min-h-0"
            >
              <option value="professional">Professional</option>
              <option value="casual">Casual</option>
              <option value="energetic">Energetic</option>
              <option value="educational">Educational</option>
              <option value="inspirational">Inspirational</option>
            </select>
            <select
              value={aiLength}
              onChange={(e) => setAiLength(e.target.value)}
              className="flex-1 bg-white dark:bg-[#151515] border border-border-light dark:border-[#333] rounded-lg px-3 py-2.5 md:py-2 text-[16px] md:text-xs text-text dark:text-white focus:outline-none min-h-[44px] md:min-h-0"
            >
              <option value="short">Short (30-60s)</option>
              <option value="medium">Medium (1-2min)</option>
              <option value="long">Long (3-5min)</option>
            </select>
            <button
              type="button"
              onClick={handleAiGenerate}
              disabled={!aiTopic.trim() || isGeneratingScript}
              className="flex items-center justify-center gap-1.5 px-4 py-2.5 md:py-2 bg-accent text-white rounded-lg text-xs font-medium hover:bg-accent/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed min-h-[44px] md:min-h-0"
            >
              {isGeneratingScript ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
              {isGeneratingScript ? 'Generating...' : 'Generate'}
            </button>
          </div>

          {scriptError && !isGeneratingScript && (
            <p className="text-[11px] text-danger" role="alert">
              {scriptError}
            </p>
          )}
        </div>
      )}

      {/* Scene cards */}
      <div className="space-y-3">
        {scenes.map((scene, i) => {
          const wordCount = scene.narration.trim().split(/\s+/).filter(Boolean).length;
          const estSeconds = Math.max(3, Math.round((wordCount / 150) * 60));

          return (
            <div
              key={scene.id}
              className="bg-white dark:bg-[#1e1e1e] rounded-xl border border-border-light dark:border-[#333] overflow-hidden"
            >
              {/* Scene header */}
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-border-light dark:border-[#333]">
                <div className="flex items-center gap-2">
                  <GripVertical size={14} className="text-muted" />
                  <span className="text-xs font-semibold text-text dark:text-white">
                    SCENE {i + 1}
                    <span className="text-muted font-normal ml-1">of {scenes.length}</span>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1 text-[11px] text-muted">
                    <Clock size={12} />
                    ~{estSeconds}s
                  </span>
                  {scenes.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeScene(scene.id)}
                      className="p-2 md:p-1 rounded-md text-muted hover:text-danger hover:bg-danger/10 transition-colors min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 flex items-center justify-center"
                      aria-label="Remove scene"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>

              {/* Narration */}
              <div className="p-4">
                <label className="text-[11px] font-medium text-muted uppercase tracking-wider mb-1.5 block">
                  Narration
                </label>
                <textarea
                  value={scene.narration}
                  onChange={(e) => updateScene(scene.id, { narration: e.target.value })}
                  rows={4}
                  placeholder="What should the avatar say in this scene?"
                  className="w-full bg-surface dark:bg-[#151515] border border-border-light dark:border-[#333] rounded-lg px-3 py-2.5 text-[16px] md:text-sm text-text dark:text-white placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none transition-all"
                />
                <span className="text-[11px] text-muted mt-1 block">{wordCount} words</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add scene */}
      <button
        type="button"
        onClick={addScene}
        className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-border dark:border-[#444] rounded-xl text-sm font-medium text-muted hover:text-primary hover:border-primary dark:hover:border-primary transition-colors min-h-[44px]"
      >
        <Plus size={16} />
        Add Scene
      </button>
    </div>
  );
}
