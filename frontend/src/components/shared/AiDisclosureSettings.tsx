'use client';

/**
 * AI-disclosure settings surface (EU AI Act Art. 50).
 *
 * Lets the user pick the disclosure caption preset (or a custom caption) and
 * toggle whether the machine-readable marking is embedded into exports. Persists
 * via `lib/ai-disclosure.ts` (localStorage) — the SAME source the render engines
 * read, so the choice here is exactly what gets embedded into export metadata.
 *
 * Self-contained (no store dependency) so it can be mounted on the Notices page
 * today and dropped into the Settings page as a section (see report to settings
 * owner). Lucide icons only, dark-mode, brand tokens.
 */

import { useEffect, useState } from 'react';
import { ShieldCheck, Check } from 'lucide-react';
import {
  AI_DISCLOSURE_PRESETS,
  getAiDisclosureSettings,
  saveAiDisclosureSettings,
  type AiDisclosurePresetId,
} from '@/lib/ai-disclosure';

export default function AiDisclosureSettings({ className = '' }: { className?: string }) {
  const [presetId, setPresetId] = useState<AiDisclosurePresetId>('voice_script');
  const [customText, setCustomText] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [saved, setSaved] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const s = getAiDisclosureSettings();
    setPresetId(s.presetId);
    setCustomText(s.customText);
    setEnabled(s.enabled);
    setHydrated(true);
  }, []);

  // Persist on any change (after hydration so we don't clobber stored values).
  useEffect(() => {
    if (!hydrated) return;
    saveAiDisclosureSettings({ presetId, customText, enabled });
    setSaved(true);
    const t = setTimeout(() => setSaved(false), 1500);
    return () => clearTimeout(t);
  }, [presetId, customText, enabled, hydrated]);

  const activePreset = AI_DISCLOSURE_PRESETS.find((p) => p.id === presetId);
  const previewCaption =
    presetId === 'custom' ? customText.trim() || '—' : activePreset?.caption ?? '';

  return (
    <div className={`bento-card p-5 ${className}`}>
      <div className="flex items-start gap-3 mb-4">
        <div className="w-9 h-9 rounded-lg bg-accent/[0.1] flex items-center justify-center shrink-0">
          <ShieldCheck className="w-[18px] h-[18px] text-accent" strokeWidth={1.75} />
        </div>
        <div className="min-w-0">
          <h3 className="text-[14px] font-semibold text-text dark:text-white">AI-content disclosure</h3>
          <p className="text-[12px] text-text-muted dark:text-white/50 mt-0.5">
            EU AI Act Art. 50 — the caption shown on results and embedded (machine-readable) into every export.
          </p>
        </div>
      </div>

      {/* Enable toggle */}
      <label className="flex items-center justify-between gap-3 py-2.5 border-t border-black/[0.05] dark:border-white/[0.06] cursor-pointer">
        <span className="text-[12.5px] text-text-secondary dark:text-white/70">
          Embed disclosure marking in exports
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => setEnabled((v) => !v)}
          className={`relative w-10 h-[22px] rounded-full transition-colors duration-200 shrink-0 ${
            enabled ? 'bg-primary' : 'bg-black/15 dark:bg-white/15'
          }`}
        >
          <span
            className={`absolute top-[3px] left-[3px] w-4 h-4 rounded-full bg-white transition-transform duration-200 ${
              enabled ? 'translate-x-[18px]' : ''
            }`}
          />
        </button>
      </label>

      {/* Preset picker */}
      <fieldset className="mt-2" disabled={!enabled}>
        <legend className="sr-only">Disclosure caption preset</legend>
        <div className={`space-y-1.5 ${enabled ? '' : 'opacity-50 pointer-events-none'}`}>
          {AI_DISCLOSURE_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPresetId(p.id)}
              className={`flex items-center gap-2.5 w-full text-left px-3 py-2 rounded-lg border transition-colors ${
                presetId === p.id
                  ? 'border-primary/40 bg-primary/[0.05]'
                  : 'border-black/[0.06] dark:border-white/[0.06] hover:bg-black/[0.02] dark:hover:bg-white/[0.03]'
              }`}
            >
              <span
                className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                  presetId === p.id ? 'border-primary bg-primary text-white' : 'border-black/20 dark:border-white/20'
                }`}
              >
                {presetId === p.id && <Check className="w-2.5 h-2.5" strokeWidth={3} />}
              </span>
              <span className="min-w-0">
                <span className="block text-[12.5px] font-medium text-text dark:text-white">{p.label}</span>
                {p.id !== 'custom' && (
                  <span className="block text-[11px] text-text-muted dark:text-white/40 truncate">{p.caption}</span>
                )}
              </span>
            </button>
          ))}
        </div>

        {presetId === 'custom' && (
          <textarea
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            maxLength={200}
            rows={2}
            placeholder="Your disclosure caption (max 200 chars)…"
            className="mt-2 w-full px-3 py-2 rounded-lg bg-[#F4F5F7] dark:bg-white/[0.06] text-[12.5px] text-text dark:text-white placeholder:text-text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/20 border border-transparent focus:border-primary/30 transition-all"
          />
        )}
      </fieldset>

      {/* Live preview + save hint */}
      <div className="mt-3 pt-3 border-t border-black/[0.05] dark:border-white/[0.06]">
        <p className="text-[10.5px] font-semibold uppercase tracking-wide text-text-muted/60 dark:text-white/30 mb-1">
          Embedded caption preview
        </p>
        <p className="text-[12px] text-text-secondary dark:text-white/60 italic">
          {enabled ? `“${previewCaption}”` : 'Disclosure marking is turned off.'}
        </p>
        {saved && (
          <p className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-secondary">
            <Check className="w-3 h-3" strokeWidth={2.5} /> Saved
          </p>
        )}
      </div>
    </div>
  );
}
