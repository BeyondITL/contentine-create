---
name: render-export
description: Frame-accurate export pattern — OffscreenCanvas → WebCodecs VideoEncoder → Mediabunny mux, all in a Worker. Use for WS-2 renderer work; enforces Law L6 (captureStream/MediaRecorder banned for export) and the VideoFrame.close() discipline that prevents GPU memory leaks.
---

# render-export

**Banned:** `canvas.captureStream()`, `new MediaRecorder(...)` for any export path (Law L6). See AUDIT_REPORT.md §7 for the migration list (WS-2).

## Architecture

```
Main thread                   Render Worker (OffscreenCanvas + WebCodecs + Mediabunny)
─────────                    ────────────────────────────────────────────────────────
compilePlan()   ─plan+seek─▶  seek(tS) → paint → VideoEncoder.encode(frame)
                             ↕                          │
                             audio: OfflineAudioContext │
                             renderOffline()            ▼
                             → AudioEncoder.encode()  ─▶ Mediabunny mux → Blob (mp4)
                             progress ────────────────────────────────────▶ postMessage
```

- Main thread mounts an `<canvas>` for **preview only** (2D or WebGL).
- Preview and export share the compiled timeline — same `seek(tS)` path (see `timeline-compiler`).
- Export runs in the Worker on an `OffscreenCanvas` — immune to tab throttling and background-tab rAF pauses.

## Frame loop (Worker)

```ts
const fps = plan.fps
const durationS = compiled.duration
const totalFrames = Math.round(durationS * fps)

const encoder = new VideoEncoder({
  output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
  error: (e) => port.postMessage({ type: 'error', error: String(e) }),
})
encoder.configure({
  codec: 'avc1.640028',       // H.264 High @ Level 4.0 — 1080p60 supported
  width: plan.resolution.w,
  height: plan.resolution.h,
  framerate: fps,
  bitrate: pickBitrate(plan.resolution),
})

for (let i = 0; i < totalFrames; i++) {
  const tS = i / fps
  compiled.seek(tS)             // deterministic canvas paint
  const frame = new VideoFrame(offscreenCanvas, { timestamp: (i * 1_000_000) / fps })
  const keyFrame = i % (fps * 2) === 0   // GOP = 2 s
  encoder.encode(frame, { keyFrame })
  frame.close()                  // ⚠ VideoFrame.close() DISCIPLINE — leak otherwise
  if (i % fps === 0) port.postMessage({ type: 'progress', done: i, total: totalFrames })
}
await encoder.flush()
encoder.close()
```

## Audio (OfflineAudioContext)

```ts
const ctx = new OfflineAudioContext(2, Math.ceil(durationS * 48000), 48000)
// schedule dialogue + sfx + ducked music per the plan
const buffer = await ctx.startRendering()
// AudioEncoder → AAC → muxer.addAudioChunk(chunk, meta)
```

- Music duck: `-18 dB` under any active dialogue window (± 200 ms ramps).
- Never use `AudioContext` (realtime) — non-deterministic across devices.

## Muxing (Mediabunny)

- Mediabunny receives `EncodedVideoChunk`s + `EncodedAudioChunk`s + first-chunk `meta` for each.
- Muxer outputs a `Blob` at end.
- **Partial re-render:** mux the changed scene's chunks separately; concat + re-header via Mediabunny's boundary API. WS-2 owns the concat implementation.

## VideoFrame discipline

- `VideoFrame.close()` **within the same tick as construction**. Any escape (put in an array, pass through await without close) leaks GPU memory and eventually kills the encoder.
- Lint rule (WS-2 to author): forbid `new VideoFrame(` unless the same block contains `.close()`.

## Determinism gate (WS-QA render-verifier)

- Golden test: render the reference plan twice with same seed → **frame hashes identical**; `ffprobe` reports identical duration/streams.
- Any mismatch = hard fail. Investigate: usually a rogue `Math.random()`, an `AudioContext` (realtime), or an animation depending on `Date.now()`.

## Preview vs export at the pixel

Preview uses `canvas.getContext('2d')`. Export renders on `OffscreenCanvas` via the **same paint function**. Any preview-only overlay (selection handles, guides) lives on a sibling DOM layer — not on the paint canvas.
