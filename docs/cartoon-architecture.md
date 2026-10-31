# Cartoon Studio — architecture on one page

```
             ┌────────────────────────── your browser tab (Next.js static app) ──────────────────────────┐
 person ───▶ │ Timeline editor / Saved projects ─┐                                                       │
             │                                    ├─▶ CartoonCommandService ─▶ project store (IndexedDB) │
 assistant ─▶│ Assistant panel ◀── WebSocket ─────┘        │      │                                      │
  (MCP)      │      ▲ 127.0.0.1                            │      └─▶ Kokoro TTS worker (ONNX/WASM)       │
   │         └──────┼─────────────────────────────────────▼──────────────────────────────────────────────┘
   └─ stdio ─▶ contentine-bridge (local process)   render worker: timeline → OffscreenCanvas →
                    └─ writes verified <runId>.mp4    WebCodecs H.264 + OfflineAudioContext mix → MP4
```

- **Scene plan** (`engine/cartoon/scene-plan.ts`) is the source of truth; the
  MP4 is a print-out of it. Edits are plan mutations, never video surgery.
- **Commands** (`lib/cartoon/commands/service.ts`, see `docs/cartoon-commands.md`)
  are the only write path, shared by the editor and assistants: CAS revisions,
  idempotency, bounded patches, run lifecycle.
- **Project store** (`lib/cartoon/project-store.ts`, see
  `docs/cartoon-project-format.md`): plan + revisions, pinned voice takes,
  assets, render cache, runs — content-addressed, atomic, verified on load.
- **Renderer** (`engine/cartoon/cartoon-renderer.ts` + `render-worker.ts`):
  frame-accurate render in a worker; per-scene encoded chunks let an edit
  re-render only the scenes whose render key changed.
- **Bridge** (`bridge/`): relays typed commands from an MCP assistant to one
  paired tab. The tab decides what the assistant may touch.

## Data flow: what stays local, what leaves the device

| Operation | Where it runs | Network |
| --- | --- | --- |
| Editing, patch validation, revisions, history | browser | none |
| Voice synthesis (Kokoro 82M) | browser worker | model weights downloaded once from Hugging Face's CDN, then cached; voice files served by the app |
| Rendering + muxing + verification | browser worker | none |
| Project storage, backups (`.ccproj`) | browser IndexedDB / a file you download | none |
| Assistant bridge | your machine (127.0.0.1) | none beyond loopback; the assistant itself talks to its own provider as usual |
| Sign-in, credits, marketplace (other features) | optional PHP backend | only when you use those features — not needed to create cartoons |

Project content (plan, voice audio, renders) is not uploaded by Cartoon Studio.
What an assistant sees is what its tools return (summaries, patches, run
status, artifact metadata); `artifact_save` copies the MP4 to a folder on your
machine.

## Extension contract

Anything that drives Cartoon Studio — a new assistant, a script, a future UI —
goes through the eight commands with a `CommandContext` supplied by trusted
code. Minimum contract:

1. Read with `project_inspect`; note `revision`.
2. Express the change as a bounded patch on the existing ScenePlan (`@id`
   paths); dry-run with `scene_propose_patch`.
3. `scene_apply_patch` with `expectedRevision` and a fresh `idempotencyKey`. On
   `REVISION_CONFLICT`, re-inspect and replan — never overwrite.
4. `voice_synthesize` (no-op when nothing changed), then `render_start`.
5. Poll `run_inspect` to a terminal state; treat only `succeeded` as output.
6. Fetch with `artifact_inspect` / `artifact_save` and check the SHA-256.

**Working example (MCP, Claude Code).** With `bridge/` installed
(`claude mcp add contentine -- node /path/to/bridge/src/companion.mjs`) and the
project open and paired in the editor, this prompt completes the workflow; it
is exactly what `harness/run-assistant.mjs` runs (evidence A12):

> Inspect project "c-m1-reference". In scene "scene-duo", move the character
> "dash" horizontally to x = 0.3, keeping y, and change nothing else. Apply it
> against the revision you inspected — if the project changed, re-inspect and
> keep the other person's edits. Then render, wait for the run with
> run_inspect, and save the MP4 with artifact_save.

**Working example (in-page TypeScript).**

```ts
const { getCartoonCommands, localOwnerContext } = await import('@/lib/cartoon/commands/browser-ports');
const svc = getCartoonCommands();
const ctx = localOwnerContext();
const p = await svc.projectInspect(ctx, { projectId: 'c-m1-reference' });
const applied = await svc.applyPatch(ctx, {
  projectId: p.projectId, expectedRevision: p.revision, idempotencyKey: crypto.randomUUID(),
  ops: [{ op: 'replace', path: '/scenes/@scene-duo/characters/@dash/position/x', value: 0.3 }],
});
const run = await svc.renderStart(ctx, { projectId: p.projectId, expectedRevision: applied.revision, idempotencyKey: crypto.randomUUID() });
```
