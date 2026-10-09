---
name: timeline-compiler
description: Compile a scene plan into a deterministic GSAP master timeline. Use when working on WS-2 (renderer) or WS-4 (timeline editor scrub-vs-export parity).
---

# timeline-compiler

**Doctrine:** the compiler is pure — same plan ⇒ same timeline ⇒ same frames (Law L6). The editor's scrub position and the renderer's `seek()` share this exact timeline.

## Public shape

```ts
compilePlan(plan: ScenePlan): CompiledTimeline
// CompiledTimeline exposes: seek(tS), tick(), duration, sceneRanges, invalidate(sceneId)
```

## Per-scene compilation

For each `scene` in order:

1. **Background layer.** Solid or SD-Turbo-generated bg positioned at parallax layer 0. Ken Burns pan/zoom pulled from the `scene.layers[]` config (see `ken-burns.ts`).
2. **Character entrance.** Type maps: `slide-left` → `x: -200 → sceneX`; `fade` → `opacity: 0 → 1`; etc. Duration from `character.entrance.durationS`.
3. **Gesture triggers.** For each `character.gestures[]`, add child timeline built from the gesture's `tracks[]` — bone rotations tween on the master timeline. Additive over the entrance pose.
4. **Dialogue.** For each `dialogue[]` line: schedule the audio clip at `atS`; the viseme track (from Kokoro/HeadTTS timestamps, or Whisper-forced-alignment for user VO) drives `<g id="mouth">` swaps via a keyframe track.
5. **Captions.** SplitText kinetic type on the caption preset. Word-level in-time == dialogue schedule.
6. **SFX.** One-shots at `atS`. Music cue if `musicCue !== null`.
7. **Exit.** Character exit transition, scene fade-out.

Concatenate per-scene timelines end-to-end into the master. The master's duration equals the sum of scene durations. Each scene has a `sceneRanges[sceneId] = [startS, endS]` entry.

## Determinism rules

- **No `Math.random()` in the compiler.** Randomness in visuals comes from `plan.seed` + per-asset seeds → seeded PRNG (`mulberry32` on the seed).
- **No `Date.now()`, no `performance.now()`.** The compiler produces a value-only structure; the renderer/editor drives it with a scalar `tS`.
- **Easing:** GSAP's `power2.out` etc. — deterministic when passed the same seed. Never use random-pick eases.

## Editor scrub == renderer export

- The editor's timeline widget calls `timeline.seek(tS)` to place the DOM/canvas state. That same `seek(tS)` runs in the export loop. **If the preview shows it, the export shows it.**
- Rigid rule: NO editor-only visual effect (highlight, selection marquee, etc.) inside the master timeline. Editor overlays are a sibling `<div>` layer.

## Partial re-render (`invalidate(sceneId)`)

- On scene-level `dirty === true`: `invalidate(sceneId)` marks the range for re-render.
- The renderer then re-encodes only that scene's frames and re-muxes the boundary (Mediabunny handles the boundary re-mux; muxing a single-scene chunk + concat with unchanged scenes.) — WS-2 owns the mux boundary implementation.

## Viseme timing (Kokoro / HeadTTS / Whisper-forced-alignment)

- Timestamps in ms → converted to frame indices at `plan.fps`.
- If two viseme events land within 1 frame, keep the second (later dominates).
- Unknown viseme code → nearest neighbour from `neutral > aa > eh > ih > oh > uh > ss > th > ff`.

## Failure modes to prevent

- Timeline compiled with missing gesture file → hard error, not silent drop.
- Character position off-screen (`x < -scale*W || x > 2*W`) → warn; keep for stylistic choice.
- Duration ≤ 0 → hard error.

## API surface (public)

```ts
export interface CompiledTimeline {
  duration: number
  fps: number
  sceneRanges: Record<string, [number, number]>
  seek(tS: number): void          // used by editor scrub AND render loop
  invalidate(sceneId: string): void
}
export function compilePlan(plan: ScenePlan): CompiledTimeline
```
