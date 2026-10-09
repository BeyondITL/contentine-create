---
name: scene-plan-schema
description: The versioned JSON scene plan is the single source of truth for a cartoon project. Use whenever authoring, mutating, or persisting the plan (Cartoon Studio, timeline editor, WS-2/WS-4 work).
---

# scene-plan-schema

**Doctrine:** the MP4 is a print-out. All editing mutates the plan; the renderer re-derives frames from the plan. Two runs of the same plan on any device produce byte-identical output (Law L6).

## Top-level shape

```jsonc
{
  "planVersion": 1,
  "id": "uuid",
  "title": "string",
  "duration": 30.0,              // seconds, computed from scenes[].durationHints
  "fps": 30,
  "resolution": { "w": 1920, "h": 1080 },
  "seed": 12345,                 // project-level seed; per-asset seeds locked inside scenes
  "stylePack": "flat-explainer", // one of the 6 launch packs
  "voiceProfileDefaults": { "profileId": "…", "matchTone": true },
  "music": { "trackId": "cc0-…", "duckDb": -18, "startS": 0 },
  "provenance": {                 // Law L7 — embedded on export
    "generator": "contentine-create",
    "generatorVersion": "…",
    "createdAt": "iso-8601",
    "aiDisclosure": "opt-in-caption-preset?"
  },
  "scenes": [ /* Scene[] */ ]
}
```

## `Scene`

```jsonc
{
  "id": "uuid",
  "durationS": 4.0,
  "background": {
    "prompt": "string",           // fed to SD-Turbo
    "seed": 4242,                 // per-asset seed lock
    "assetRef": "opfs://…" | "cache://…" | null
  },
  "layers": [ /* Layer[] — ordered back→front, parallax */ ],
  "characters": [ {
    "rigId": "pack:rigA",
    "position": { "x": 200, "y": 500 },
    "scale": 1.0,
    "flip": false,
    "gestures": [ { "atS": 0.5, "id": "wave", "durationS": 1.0 } ],
    "entrance": { "type": "slide-left", "durationS": 0.4 },
    "exit": { "type": "fade", "durationS": 0.4 }
  } ],
  "dialogue": [ {
    "charId": "…",
    "atS": 0.6,
    "text": "string",
    "voiceProfileRef": "…",       // overrides project default
    "takeRef": "opfs://audio/…"   // present when user recorded/uploaded VO
  } ],
  "captions": { "style": "kinetic-typography-preset-1", "burnIn": true },
  "sfx": [ { "atS": 1.2, "assetRef": "…", "gainDb": -6 } ],
  "musicCue": { "loopId": "…", "atS": 0.0 } | null,
  "dirty": true                   // scene-level dirty tracking for partial re-render
}
```

## Invariants (enforced by the compiler)

- `planVersion` is set on every plan. Bump when a breaking change lands; migrate in `plans/migrations/`.
- `seed` at every level that reaches a generative model (background, character portraits, image props). Absence = build fail.
- `dialogue[].text` is source-of-truth text. Voice takes are **derived** from it. Text edits invalidate `takeRef` only when the text materially changed; identical text keeps the take.
- `scenes[].dirty === true` ⇒ that scene re-renders; adjacent scene boundaries re-mux. The rest is untouched.
- Every `assetRef` resolves via `asset-cache` (IndexedDB) or `OPFS`. Absolute HTTP URLs are only permitted for outbound generation, never for playback.
- Provenance block is written on **every** export (Law L7).

## Storage

- Working copy: IndexedDB via `stores/editor-store.ts` (never localStorage — 5 MB cap).
- Autosave: debounced 500 ms.
- Undo/redo: plan-snapshot stack (non-destructive history). Store 50 snapshots; garbage-collect on `save`.
- Export/import: `.contentine-plan.json` (gzip'd).

## Schema authoring rule

Types live in `frontend/src/types/scene-plan.ts`. Zod (or valibot) validator lives beside them. Any store/component reading the plan imports the type, never redefines fields inline.
