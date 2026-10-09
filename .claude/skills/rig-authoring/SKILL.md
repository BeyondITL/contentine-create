---
name: rig-authoring
description: Conventions for SVG puppet rigs — bones, mouth-shape (viseme) sets, gesture libraries. Use when creating or extending a rig pack (WS-3 style packs, plus any downstream custom-rig work).
---

# rig-authoring

**All rigs are original assets.** No IP references in names, faces, or metadata. Rig packs are versioned + data-driven so packs ship without code.

## File layout (one rig pack)

```
frontend/public/rigs/<packId>/
  pack.json           # id, name, version, palette, credits, license (owned)
  rigs/
    <rigId>.svg       # the puppet, structured per §Bones
    <rigId>.rig.json  # bone map, gesture triggers, viseme atlas refs
  visemes/
    <rigId>/
      neutral.svg  aa.svg  eh.svg  ih.svg  oh.svg  uh.svg  ss.svg  th.svg  ff.svg
  gestures/
    <rigId>/
      wave.json  point.json  shrug.json  ...
```

## Bones (SVG puppet skeleton)

- Each rig SVG is a nested `<g>` tree — every named group is a **bone**.
- Bone IDs: `root`, `torso`, `neck`, `head`, `arm.L.upper`, `arm.L.lower`, `hand.L`, `leg.L.upper`, `leg.L.lower`, `foot.L`, mirror `.R`.
- No `transform` on the SVG root — animations write to per-bone `transform`.
- Anchor points: every rotatable bone's SVG-child origin is at its pivot (translate the geometry so `translate(0,0) rotate(θ)` gives natural pivoting).

## Visemes (mouth-shape set)

- Kokoro / HeadTTS emit viseme timestamps: `[{ atS: number, viseme: 'aa'|'eh'|... }]`.
- The renderer swaps the child of `<g id="mouth">` with the corresponding viseme SVG at that timestamp.
- Minimum set: **9 shapes** — neutral, aa, eh, ih, oh, uh, ss (sibilants), th (dental), ff (labiodental). Expand to 12 for higher-fidelity rigs; the timeline compiler maps unknown visemes to the closest known.
- Consent-gated voice cloning (Law L7) does not affect viseme playback — the same viseme set drives cloned voices.

## Gestures (data-driven)

`gestures/<rigId>/wave.json`:
```jsonc
{
  "id": "wave",
  "durationS": 1.0,
  "tracks": [
    { "bone": "arm.R.upper", "prop": "rotate", "keys": [[0, 0], [0.25, -60], [0.75, -50], [1, 0]] },
    { "bone": "arm.R.lower", "prop": "rotate", "keys": [[0, 0], [0.25, 30], [0.75, 40], [1, 0]] }
  ]
}
```
- `keys` = `[atRatioOfDuration, valueDegOrPx]`. The timeline compiler expands to absolute times.
- Gestures compose additively over the character's entrance pose (`atRatioOfDuration=0` is the pose baseline, not zero).

## Rig manifest (`.rig.json`)

```jsonc
{
  "rigId": "flat-explainer:persona-a",
  "svg": "rigs/persona-a.svg",
  "visemeSet": "9-lite",
  "gestures": ["wave", "point", "shrug", "clap", "think"],
  "defaultPose": { "torso.rotate": 0, "head.rotate": -3 },
  "hotspots": { "mouth": "#mouth", "eyes": "#eyes" }
}
```

## License

- Every rig pack ships under Contentine's owned license — record in `LICENSES.md` under `## Original assets`.
- No character based on a public figure or IP. Style-pack names must not reference existing shows ("Cutout Comedy" ✓, "South-Park style" ✗).

## Verification checklist (in `render-verifier`)

1. `pack.json` present with `id`, `name`, `version`, `license: "contentine-owned"`.
2. Every `.rig.json` references an `.svg` that exists.
3. Every rig has ≥ neutral + 8 viseme shapes.
4. Every gesture referenced in `.rig.json.gestures[]` exists in `gestures/<rigId>/`.
5. One demo cartoon per pack (self-generated at build) renders green in the golden test.
