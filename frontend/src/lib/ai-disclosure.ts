/**
 * AI-disclosure preset — single source of truth for the EU AI Act Art. 50
 * visible label AND the machine-readable marking that render engines embed into
 * export metadata (Law L7 provenance). The renderer (cartoon render-worker /
 * general render-pipeline) reads `getAiDisclosure()` to fill the provenance
 * `aiDisclosure` tag, so the caption a user picks in settings is the exact
 * string that lands in the file's metadata — no drift between what's shown and
 * what's embedded.
 *
 * This is NOT the hash-signing / C2PA-manifest layer (operator ruling pending —
 * DESIGN ONLY). It is the plaintext disclosure required by Art. 50(2) that
 * generated media be "marked in a machine-readable format and detectable as
 * artificially generated".
 */

export type AiDisclosurePresetId = 'standard' | 'voice_script' | 'full_ai' | 'custom';

export interface AiDisclosurePreset {
  id: AiDisclosurePresetId;
  label: string;
  /** The caption text embedded in export metadata and shown in the visible label tooltip. */
  caption: string;
}

/** Built-in presets. `custom` uses the user-entered text stored alongside the id. */
export const AI_DISCLOSURE_PRESETS: readonly AiDisclosurePreset[] = [
  {
    id: 'standard',
    label: 'Standard',
    caption: 'This content was created with AI assistance.',
  },
  {
    id: 'voice_script',
    label: 'Voice & script',
    caption: 'Contains AI-generated voice and/or script. Rendered deterministically on-device; no generative video.',
  },
  {
    id: 'full_ai',
    label: 'Fully AI-generated',
    caption: 'AI-generated media.',
  },
  {
    id: 'custom',
    label: 'Custom',
    caption: '',
  },
] as const;

const LS_PRESET_ID = 'contentine_ai_disclosure_preset';
const LS_CUSTOM_TEXT = 'contentine_ai_disclosure_custom';
const LS_ENABLED = 'contentine_ai_disclosure_enabled';

/** Default caption when nothing is stored (safe, always-on disclosure). */
export const DEFAULT_AI_DISCLOSURE = AI_DISCLOSURE_PRESETS[1].caption;

export interface AiDisclosureSettings {
  presetId: AiDisclosurePresetId;
  customText: string;
  /** Whether to embed the disclosure into export metadata (Art. 50 marking). Default on. */
  enabled: boolean;
}

/** Read the persisted disclosure settings (localStorage; SSR-safe). */
export function getAiDisclosureSettings(): AiDisclosureSettings {
  if (typeof window === 'undefined') {
    return { presetId: 'voice_script', customText: '', enabled: true };
  }
  let presetId = (localStorage.getItem(LS_PRESET_ID) as AiDisclosurePresetId | null) ?? 'voice_script';
  if (!AI_DISCLOSURE_PRESETS.some((p) => p.id === presetId)) presetId = 'voice_script';
  const customText = localStorage.getItem(LS_CUSTOM_TEXT) ?? '';
  const enabled = localStorage.getItem(LS_ENABLED) !== 'false'; // default true
  return { presetId, customText, enabled };
}

/** Persist disclosure settings. */
export function saveAiDisclosureSettings(next: AiDisclosureSettings): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LS_PRESET_ID, next.presetId);
    localStorage.setItem(LS_CUSTOM_TEXT, next.customText);
    localStorage.setItem(LS_ENABLED, String(next.enabled));
  } catch {
    // Storage unavailable — non-fatal; renderer falls back to DEFAULT_AI_DISCLOSURE.
  }
}

/**
 * Resolve the disclosure caption a render engine should embed. Returns the empty
 * string when disclosure is disabled (the caller then embeds no AI-disclosure tag).
 */
export function getAiDisclosure(): string {
  const s = getAiDisclosureSettings();
  if (!s.enabled) return '';
  if (s.presetId === 'custom') {
    return s.customText.trim() || DEFAULT_AI_DISCLOSURE;
  }
  const preset = AI_DISCLOSURE_PRESETS.find((p) => p.id === s.presetId);
  return preset?.caption || DEFAULT_AI_DISCLOSURE;
}
