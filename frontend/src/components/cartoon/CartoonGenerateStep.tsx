'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Play, Loader2, Download, RotateCcw, AlertCircle,
  FileText, Palette, Mic, Monitor, Smartphone, Square, Check, SlidersHorizontal,
} from 'lucide-react';
import type { ScenePlan, VoiceTake, CartoonRenderResult } from '@/engine/cartoon';
import BuiltWithLlama from '@/components/shared/BuiltWithLlama';
import AiGeneratedBadge from '@/components/shared/AiGeneratedBadge';
import { useEditorStore } from '@/stores/editor-store';
import { useCartoonStore } from '@/stores/cartoon-store';
import { useCreditGate } from '@/hooks/use-credit-gate';
import { ProgressBar, useToast } from '@/components/ui';
import { getCartoonStyle, getCartoonFormat } from '@/lib/cartoon/styles';
import { buildCartoonScenePlan } from '@/lib/cartoon/scene-plan-builder';

/** Render stages — each is REAL work from the cartoon engine (Law L1, no facades). */
type Stage = 'idle' | 'model' | 'plan' | 'tts' | 'render' | 'complete' | 'error';

const STAGE_LABEL: Record<Stage, string> = {
  idle: 'Ready to render',
  model: 'Downloading voice model',
  plan: 'Building scene plan',
  tts: 'Generating voices',
  render: 'Rendering cartoon',
  complete: 'Cartoon ready',
  error: 'Render failed',
};

/**
 * Cartoon Studio — Step 4: generate + result.
 * Drives the C-M1 cartoon engine via its dynamic-import surface only (Law L8):
 *   Kokoro model download → scene plan → TTS takes → deterministic MP4 render.
 * Every progress value comes from the real pipeline — never a fabricated timer.
 */
export default function CartoonGenerateStep() {
  const editor = useEditorStore();
  const cartoon = useCartoonStore();
  const { gate, checking } = useCreditGate('cartoon_render');
  const { toast } = useToast();

  const [stage, setStage] = useState<Stage>('idle');
  const [percent, setPercent] = useState(0);
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const mp4BlobRef = useRef<Blob | null>(null);

  // Kept after a successful render so the timeline editor can open with the live
  // plan/takes/result already in hand (no redundant re-synth or re-render).
  const planRef = useRef<ScenePlan | null>(null);
  const takesRef = useRef<Map<string, VoiceTake> | null>(null);
  const resultRef = useRef<CartoonRenderResult | null>(null);
  const projectRef = useRef<{ workspaceId: string; revision: number; plan: ScenePlan } | null>(null);

  // Revoke the object URL when it changes or on unmount (avoid blob leaks).
  useEffect(() => {
    return () => {
      if (resultUrl) URL.revokeObjectURL(resultUrl);
    };
  }, [resultUrl]);

  const style = getCartoonStyle(cartoon.styleId);
  const format = getCartoonFormat(cartoon.formatId);
  const scenesWithText = editor.scenes.filter((s) => s.narration.trim().length > 0);
  const hasVoice = editor.voiceId !== null;
  const canGenerate = scenesWithText.length > 0 && hasVoice;

  const selectedVoice = editor.voices.find((v) => v.id === editor.voiceId);

  function resolveKokoroVoiceId(): string {
    if (selectedVoice?.kokoro_voice_id) return selectedVoice.kokoro_voice_id;
    if (selectedVoice?.matched_kokoro_id) return selectedVoice.matched_kokoro_id;
    return 'af_sky';
  }

  const FormatIcon = format.id === '9:16' ? Smartphone : format.id === '1:1' ? Square : Monitor;

  const resetRender = useCallback(() => {
    setStage('idle');
    setPercent(0);
    setMessage('');
    setError(null);
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    setResultUrl(null);
    mp4BlobRef.current = null;
  }, [resultUrl]);

  async function handleGenerate() {
    if (!canGenerate) return;

    // Credit gate (cost 0 for the cartoon MVP) — blocks only on real shortfall.
    const allowed = await gate();
    if (!allowed) return;

    setError(null);
    setResultUrl(null);
    mp4BlobRef.current = null;

    try {
      // Dynamic imports (Law L8 — engine never lands in the page bundle).
      const [cartoonEngine, { ttsManager }] = await Promise.all([
        import('@/engine/cartoon'),
        import('@/engine/tts-manager'),
      ]);

      // Stage 1 — Kokoro model download (real % from the TTS worker).
      setStage('model');
      setPercent(0);
      setMessage('Fetching the on-device voice model (once, ~87MB)...');
      await ttsManager.init((p) => setPercent(p.percent));

      // Stage 2 — build the scene plan (source of truth for the render).
      setStage('plan');
      setPercent(100);
      setMessage('Planning scenes, characters, and timing...');
      const plan = buildCartoonScenePlan({
        title: editor.title,
        scenes: scenesWithText.map((s) => ({ id: s.id, narration: s.narration })),
        style,
        kokoroVoiceId: resolveKokoroVoiceId(),
        voiceSpeed: editor.voiceSpeed,
        resolution: { width: format.width, height: format.height },
      });

      // Stage 3 — synthesize a voice take per line (real Kokoro TTS).
      setStage('tts');
      setPercent(0);
      const takes = await cartoonEngine.synthesizeTakes(plan, undefined, (done, total, text) => {
        setPercent(total > 0 ? Math.round((done / total) * 100) : 0);
        setMessage(text ? `Voicing: "${text.slice(0, 48)}${text.length > 48 ? '…' : ''}"` : 'Voices ready');
      });

      // Stage 4 — deterministic frame-accurate render → MP4 with provenance (L6/L7).
      setStage('render');
      setPercent(0);
      const result = await cartoonEngine.renderCartoonProject(plan, {
        takes,
        // Prebuilt worker bundle (scripts/build-cartoon-worker.mjs). The engine's
        // default `new URL('./render-worker.ts', ...)` does not compile under the
        // Next static export — see the build helper's header (WS-2 gap).
        workerUrl: '/render-worker.js',
        onPhaseChange: (_phase, msg) => setMessage(msg),
        onProgress: (pct) => setPercent(pct),
      });

      mp4BlobRef.current = result.mp4;
      planRef.current = plan;
      takesRef.current = takes;
      resultRef.current = result;
      // Save the complete project (plan, pinned takes, render cache) so it
      // survives a browser restart. A storage failure doesn't lose the render.
      try {
        const ports = await import('@/lib/cartoon/commands/browser-ports');
        projectRef.current = await ports.ensureLocalProject({ plan, takes, result });
      } catch (saveErr) {
        projectRef.current = null;
        toast({
          variant: 'error',
          title: 'Rendered, but not saved on this device',
          description: saveErr instanceof Error ? saveErr.message : 'Browser storage refused the project.',
        });
      }
      // Seed the version history with the first render (restorable baseline).
      await cartoon.pushSnapshot({
        projectId: plan.id,
        planHash: result.planHash,
        label: 'Initial render',
        plan,
      });
      setResultUrl(URL.createObjectURL(result.mp4));
      setPercent(100);
      setMessage(`${result.totalFrames} frames · ${result.durationSec.toFixed(1)}s · ${result.width}×${result.height}`);
      setStage('complete');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Render failed. Please try again.';
      setError(msg);
      setStage('error');
      // Never swallow an engine failure — surface the real reason (C-M2 P0).
      toast({ variant: 'error', title: 'Cartoon render failed', description: msg });
    }
  }

  function handleDownload() {
    if (!mp4BlobRef.current) return;
    const url = URL.createObjectURL(mp4BlobRef.current);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(editor.title || 'cartoon').replace(/[^\w-]+/g, '-')}.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function handleCreateAnother() {
    resetRender();
    editor.reset();
    cartoon.reset();
  }

  function handleOpenEditor() {
    if (!planRef.current || !takesRef.current || !resultRef.current) return;
    cartoon.openEditor({
      plan: planRef.current,
      takes: takesRef.current,
      result: resultRef.current,
      // MVP backgrounds are procedural (painted from seed) — no decoded assets.
      bgAssets: new Map<string, ImageBitmap>(),
      project: projectRef.current ?? undefined,
    });
  }

  const isRendering = stage === 'model' || stage === 'plan' || stage === 'tts' || stage === 'render';

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="bg-white dark:bg-[#1e1e1e] rounded-xl border border-border-light dark:border-[#333] overflow-hidden">
        <div className="px-4 md:px-5 py-4 border-b border-border-light dark:border-[#333]">
          <h3 className="text-base font-semibold text-text dark:text-white">
            {editor.title || 'My Cartoon'}
          </h3>
          <p className="text-xs text-muted mt-0.5">Review before rendering — everything runs on your device.</p>
        </div>
        <div className="divide-y divide-border-light dark:divide-[#333]">
          <SummaryRow icon={<FileText size={16} />} label="Script" value={`${scenesWithText.length} scene${scenesWithText.length !== 1 ? 's' : ''}`} ok={scenesWithText.length > 0} warn={scenesWithText.length === 0 ? 'Add narration in Step 1' : undefined} />
          <SummaryRow icon={<Palette size={16} />} label="Style" value={style.name} ok />
          <SummaryRow icon={<FormatIcon size={16} />} label="Format" value={`${format.label} (${format.id})`} ok />
          <SummaryRow icon={<Mic size={16} />} label="Voice" value={hasVoice ? `${selectedVoice?.name ?? 'Selected'} (${editor.voiceSpeed}x)` : 'Not selected'} ok={hasVoice} warn={!hasVoice ? 'Pick a voice in Step 3' : undefined} />
        </div>
      </div>

      {/* Progress */}
      {(isRendering || stage === 'complete' || stage === 'error') && (
        <ProgressBar
          percent={stage === 'complete' ? 100 : percent}
          message={STAGE_LABEL[stage]}
          subtitle={error ?? message ?? undefined}
        />
      )}

      {/* Error + retry */}
      {stage === 'error' && (
        <div className="p-3 bg-danger/5 border border-danger/20 rounded-lg">
          <div className="flex items-start gap-2">
            <AlertCircle size={16} className="text-danger mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-danger">Render failed</p>
              <p className="text-xs text-muted mt-1 break-words">{error}</p>
              <button
                type="button"
                onClick={handleGenerate}
                className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[44px] md:min-h-0 bg-primary text-white rounded-lg text-xs font-medium hover:bg-primary-hover transition-colors active:scale-[0.98]"
              >
                <RotateCcw size={13} />
                Retry
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Result player + download */}
      {stage === 'complete' && resultUrl && (
        <div className="bg-white dark:bg-[#1e1e1e] rounded-xl border border-border-light dark:border-[#333] p-4 md:p-5 space-y-4">
          <div className="relative rounded-xl overflow-hidden bg-black">
            {/* EU AI Act Art. 50 visible disclosure, overlaid on the generated video. */}
            <AiGeneratedBadge variant="corner" />
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video src={resultUrl} controls playsInline className="w-full max-h-[60vh] mx-auto" />
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <button
              type="button"
              onClick={handleDownload}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] md:min-h-0 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover transition-colors active:scale-[0.98]"
            >
              <Download size={16} />
              Download MP4
            </button>
            <button
              type="button"
              onClick={handleOpenEditor}
              className="flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] md:min-h-0 bg-surface dark:bg-[#2a2a2a] text-text dark:text-white rounded-lg text-sm font-medium hover:bg-border-light dark:hover:bg-[#333] transition-colors active:scale-[0.98]"
            >
              <SlidersHorizontal size={16} />
              Edit in Timeline
            </button>
            <button
              type="button"
              onClick={handleCreateAnother}
              className="px-4 py-2.5 min-h-[44px] md:min-h-0 bg-surface dark:bg-[#2a2a2a] text-text dark:text-white rounded-lg text-sm font-medium hover:bg-border-light dark:hover:bg-[#333] transition-colors"
            >
              Create Another
            </button>
          </div>
          {/* Llama 3.2 (WebLLM) drives script generation — Meta license attribution (R-80). */}
          <div className="flex justify-center pt-1">
            <BuiltWithLlama variant="inline" />
          </div>
        </div>
      )}

      {/* Generate button */}
      {stage === 'idle' && (
        <>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={!canGenerate || checking}
            className="w-full flex items-center justify-center gap-2 py-4 min-h-[48px] bg-gradient-to-r from-primary via-accent to-secondary text-white rounded-xl text-base font-semibold hover:opacity-90 transition-all active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-primary/20"
          >
            <Play size={20} />
            Render Cartoon
          </button>
          {!canGenerate && (
            <p className="text-xs text-warning text-center">Add narration and pick a voice to render.</p>
          )}
        </>
      )}

      {/* Rendering (disabled) */}
      {isRendering && (
        <button
          type="button"
          disabled
          className="w-full flex items-center justify-center gap-2 py-4 min-h-[48px] bg-gradient-to-r from-primary via-accent to-secondary text-white rounded-xl text-base font-semibold opacity-80 cursor-not-allowed"
        >
          <Loader2 size={20} className="animate-spin" />
          Rendering — keep this tab open
        </button>
      )}
    </div>
  );
}

function SummaryRow({ icon, label, value, ok, warn }: { icon: React.ReactNode; label: string; value: string; ok: boolean; warn?: string }) {
  return (
    <div className="flex items-center justify-between px-4 md:px-5 py-3 min-h-[44px] md:min-h-0">
      <div className="flex items-center gap-3">
        <div className="text-muted">{icon}</div>
        <div>
          <span className="text-sm font-medium text-text dark:text-white">{label}</span>
          {warn && <p className="text-[11px] mt-0.5 text-warning">{warn}</p>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted">{value}</span>
        {ok ? <Check size={14} className="text-secondary" /> : <AlertCircle size={14} className="text-warning" />}
      </div>
    </div>
  );
}
