'use client';

import { useState } from 'react';
import { Plus, Sparkles, Loader2, ChevronDown, ChevronUp, Wand2, Trash2, Download } from 'lucide-react';
import { useEditorStore } from '@/stores/editor-store';
import { useModelReadiness } from '@/hooks/use-model-readiness';
import { useToast } from '@/components/ui';
import ModelDownloadModal from '@/components/shared/ModelDownloadModal';

const TONES = ['Engaging', 'Professional', 'Casual', 'Dramatic', 'Educational', 'Humorous'] as const;
const LENGTHS = ['Short (30s)', 'Medium (60s)', 'Long (2-5min)'] as const;
const PLATFORMS = ['TikTok', 'YouTube Shorts', 'YouTube', 'Instagram Reels'] as const;

/** Rough spoken-duration estimate (seconds) from word count. */
function estimateDuration(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(2, Math.round(words / 2.5));
}

/**
 * Cartoon Studio — Step 1: write the script.
 * "Generate with AI" runs ON-DEVICE (WebLLM llama-3.2-1b, Law L2) behind a
 * model-readiness gate: on a fresh profile the button becomes a real
 * "Download <model>" CTA -> download modal -> auto-continues into generation.
 * Every failure is surfaced as a toast — never a silent no-op (C-M2 P0).
 */
export default function CartoonScriptStep() {
  const { title, setTitle, setScenes, scenes, addScene, removeScene, updateScene } = useEditorStore();
  const readiness = useModelReadiness('cartoon-script');
  const { toast } = useToast();

  const [showAIForm, setShowAIForm] = useState(false);
  const [topic, setTopic] = useState('');
  const [tone, setTone] = useState<string>('Humorous');
  const [length, setLength] = useState<string>('Short (30s)');
  const [platform, setPlatform] = useState<string>('YouTube Shorts');
  const [busy, setBusy] = useState(false);

  const model = readiness.missing[0];

  async function draftScript() {
    setBusy(true);
    try {
      const { generateCartoonScript } = await import('@/lib/cartoon/generate-script');
      const result = await generateCartoonScript({ topic, tone, length, platform });
      setTitle(result.title);
      setScenes(
        result.scenes.map((narration) => ({
          id: crypto.randomUUID(),
          narration,
          visual_prompt: '',
          duration: estimateDuration(narration),
          transition: 'crossfade' as const,
        })),
      );
      setShowAIForm(false);
    } catch (err) {
      toast({
        variant: 'error',
        title: 'Script generation failed',
        description: err instanceof Error ? err.message : 'Please try again.',
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleGenerateClick() {
    if (!topic.trim() || busy || readiness.downloading) return;
    // On-device drafting needs WebGPU. Check BEFORE a ~760MB download so
    // non-WebGPU users get an immediate, honest message instead of downloading
    // the model and only then failing at inference (C-M2 P0 — never silent).
    if (!readiness.ready) {
      const gpu = (navigator as unknown as { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu;
      const gpuOk = !!gpu && !!(await gpu.requestAdapter().catch(() => null));
      if (!gpuOk) {
        toast({
          variant: 'info',
          title: 'AI drafting needs WebGPU',
          description: 'Use Chrome or Edge on desktop for on-device drafting, or just type your scenes below.',
        });
        return;
      }
      const ok = await readiness.download();
      if (!ok) {
        toast({
          variant: 'error',
          title: 'Model download failed',
          description: readiness.error ?? 'Could not download the AI model. Please try again.',
        });
        return;
      }
    }
    await draftScript();
  }

  const totalWords = scenes.reduce(
    (sum, s) => sum + s.narration.trim().split(/\s+/).filter(Boolean).length,
    0,
  );

  const buttonLabel = readiness.downloading
    ? 'Downloading model…'
    : busy
      ? 'Drafting script…'
      : readiness.ready
        ? 'Generate Script'
        : readiness.downloadLabel;

  return (
    <div className="space-y-5">
      {/* Real-progress model download modal (first run only) */}
      {model && (
        <ModelDownloadModal
          isVisible={readiness.downloading}
          progress={readiness.progress * 100}
          modelName={model.name}
          sizeLabel={readiness.missingSizeLabel}
        />
      )}

      {/* Title input */}
      <div>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Cartoon title"
          className="w-full bg-transparent text-xl font-semibold text-text dark:text-white placeholder:text-muted border-none focus:outline-none focus:ring-0 text-[16px] md:text-xl min-h-[44px] md:min-h-0"
        />
      </div>

      {/* AI Generate — on-device WebLLM behind the readiness gate */}
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
                placeholder="e.g. two friends argue about whether cereal is a soup"
                className="w-full bg-white dark:bg-[#151515] border border-border-light dark:border-[#333] rounded-lg px-3 py-2 text-[16px] md:text-sm text-text dark:text-white placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent resize-none transition-all"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
              onClick={handleGenerateClick}
              disabled={!topic.trim() || busy || readiness.downloading}
              className="flex items-center gap-2 px-4 py-2.5 min-h-[44px] md:min-h-0 bg-accent hover:bg-accent/80 text-dark rounded-lg text-sm font-medium transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busy || readiness.downloading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : readiness.ready ? (
                <Wand2 size={16} />
              ) : (
                <Download size={16} />
              )}
              {buttonLabel}
            </button>
            {!readiness.ready && !readiness.downloading && !busy && (
              <p className="text-[11px] text-muted">
                First use downloads the on-device AI model. Prefer to write it yourself? Just type your scenes below.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Scene stats bar */}
      <div className="flex items-center gap-4 text-xs text-muted">
        <span>{scenes.length} scene{scenes.length !== 1 ? 's' : ''}</span>
        <span className="w-px h-3 bg-border-light dark:bg-[#333]" />
        <span>{totalWords} words</span>
        <span className="w-px h-3 bg-border-light dark:bg-[#333]" />
        <span>one spoken line per scene</span>
      </div>

      {/* Scene list — each scene is one narrator line */}
      <div className="space-y-3">
        {scenes.map((scene, i) => (
          <div
            key={scene.id}
            className="rounded-xl border border-border-light dark:border-[#333] bg-white dark:bg-[#1e1e1e] p-4"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">
                Scene {i + 1}
              </span>
              <button
                type="button"
                onClick={() => removeScene(scene.id)}
                disabled={scenes.length <= 1}
                className="flex items-center justify-center w-8 h-8 rounded-lg text-muted hover:text-danger hover:bg-danger/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label={`Remove scene ${i + 1}`}
              >
                <Trash2 size={15} />
              </button>
            </div>
            <textarea
              value={scene.narration}
              onChange={(e) => updateScene(scene.id, { narration: e.target.value })}
              rows={3}
              placeholder="What does the character say in this scene?"
              className="w-full bg-surface dark:bg-[#151515] border border-border-light dark:border-[#333] rounded-lg px-3 py-2 text-[16px] md:text-sm text-text dark:text-white placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none transition-all"
            />
          </div>
        ))}
      </div>

      {/* Add scene */}
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
