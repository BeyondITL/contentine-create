/**
 * Contentine Create — Cartoon Studio: style catalog (WS-4 layer)
 *
 * The catalog ships five built-in, original styles (R4 / D2). It is an array
 * so rig packs (WS-3) slot in without touching the wizard — the style step
 * renders whatever is registered here, and each entry's `rigId` resolves to a
 * rig registered in engine/cartoon/rig.ts. No IP / show references (Law L4);
 * names are original. No placeholder or locked style cards (Law L1) — every
 * style listed is real, renders on-device, and is selectable.
 */

import { ArrowRight, Presentation, PenTool, Type, Sparkles } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface CartoonStyle {
  /** Stable id used in the scene plan and the store. */
  id: string;
  /** Original display name — never an IP/show reference (Law L4). */
  name: string;
  description: string;
  /** Rig-pack id the engine renders with (`tracer-stick` ships built-in). */
  rigId: string;
  /** Procedural music bed ref (`proc:*`, license-free — see audio-mixer). */
  music: string;
  /** Brand accent used on the style card. */
  accent: string;
  icon: LucideIcon;
}

/** The built-in default style. Structured as a list so packs append later. */
export const CARTOON_STYLES: CartoonStyle[] = [
  {
    id: 'cutout-comedy',
    name: 'Cutout Comedy',
    description: 'Bold flat shapes and snappy motion — the built-in starter style. Renders fully on your device.',
    rigId: 'tracer-stick',
    music: 'proc:warm-pad',
    accent: '#00C3FF',
    icon: ArrowRight,
  },
  {
    id: 'flat-explainer',
    name: 'Flat Explainer',
    description: 'A clean flat-design presenter for how-tos and pitches. Renders fully on your device.',
    rigId: 'flat-presenter',
    music: 'proc:uplift-pad',
    accent: '#35C838',
    icon: Presentation,
  },
  {
    id: 'whiteboard',
    name: 'Whiteboard',
    description: 'Hand-drawn marker line-art on a bright ground line. Renders fully on your device.',
    rigId: 'marker-sketch',
    music: 'proc:warm-pad',
    accent: '#00C3FF',
    icon: PenTool,
  },
  {
    id: 'kinetic-type',
    name: 'Kinetic Type',
    description: 'A bold typographic mascot with poster-weight motion. Renders fully on your device.',
    rigId: 'type-mascot',
    music: 'proc:uplift-pad',
    accent: '#F3A6FF',
    icon: Type,
  },
  {
    id: 'chibi',
    name: 'Chibi',
    description: 'Anime-lite chibi character — big head, big eyes, cute energy. Renders fully on your device.',
    rigId: 'chibi-sprite',
    music: 'proc:warm-pad',
    accent: '#35C838',
    icon: Sparkles,
  },
];

export const DEFAULT_STYLE_ID = CARTOON_STYLES[0].id;

export function getCartoonStyle(id: string): CartoonStyle {
  return CARTOON_STYLES.find((s) => s.id === id) ?? CARTOON_STYLES[0];
}

/** Output formats. Resolution is what the deterministic renderer receives. */
export interface CartoonFormat {
  id: '16:9' | '9:16' | '1:1';
  label: string;
  width: number;
  height: number;
}

export const CARTOON_FORMATS: CartoonFormat[] = [
  { id: '16:9', label: 'Landscape', width: 1920, height: 1080 },
  { id: '9:16', label: 'Portrait', width: 1080, height: 1920 },
  { id: '1:1', label: 'Square', width: 1080, height: 1080 },
];

export function getCartoonFormat(id: string): CartoonFormat {
  return CARTOON_FORMATS.find((f) => f.id === id) ?? CARTOON_FORMATS[0];
}
