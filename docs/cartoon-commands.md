# Cartoon commands (shared by the editor and assistants)

Implementation: `frontend/src/lib/cartoon/commands/service.ts`
Patches: `frontend/src/lib/cartoon/commands/patch.ts` · storage: `docs/cartoon-project-format.md`
Transport for assistants: `bridge/` (MCP) → `assistant-bridge.ts` in the tab.

The timeline editor's **Re-roll** and an assistant call the same
`CartoonCommandService` methods with the same checks. The editor turns its draft
into a patch (`plan-diff.ts`) and commits it with `scene_apply_patch`.

## Context and authorization

Every call runs with a `CommandContext` built by the trusted application:
`actor {id, kind}`, `workspaceId`, `projects` (`'*'` for the local owner, or the
set the person granted to a paired assistant), `permissions`
(`read | edit | voice | render`) and a `requestId`. A `projectId` in arguments
is checked against `projects`; it is never authority on its own. Runs and
artifacts are looked up inside the caller's workspace and checked against the
run's project.

## Operations

| Command | Permission | Arguments | Result |
| --- | --- | --- | --- |
| `project_inspect` | read | `projectId` | revision, planHash, scenes (characters, dialogue with take status `ok/stale/missing`, estimated durations), render-cache state, recent runs, patch rules, limits, renderer availability |
| `scene_propose_patch` | read | `projectId`, `baseRevision?`, `ops` | impact: changed/added/removed scenes, `linesNeedingVoice`, `timingMayShift`, `predictedRender`, field-level `changes`; **no side effects** |
| `scene_apply_patch` | edit | `projectId`, `expectedRevision`, `ops`, `idempotencyKey`, `note?` | new `revision`, `planHash`, impact |
| `voice_synthesize` | voice | `projectId`, `expectedRevision`, `idempotencyKey`, `lineIds?` | synthesized lines (only those whose take identity changed), new revision |
| `render_start` | render | `projectId`, `expectedRevision`, `idempotencyKey`, `mode? auto/full` | `runId`, fixed `inputRevision`/`inputPlanHash`, settings, expected duration |
| `run_inspect` | read | `runId` | state, progress, last 20 events, failure, partial-render report, artifact ref |
| `run_cancel` | render | `runId` | `cancelled`, or `alreadyTerminal: true` |
| `artifact_inspect` | read | `runId`, `include? metadata/bytes` | verified metadata (sha256, size, duration, resolution, codecs); bytes on request |

## Rules

1. **Compare-and-swap.** Project-changing commands carry `expectedRevision`; a
   stale value is `REVISION_CONFLICT` with no write. Re-inspect and replan.
2. **Idempotency.** Keys are scoped to (workspace, actor) and bound to the
   operation and a SHA-256 of the canonical arguments. Same key + same request →
   the stored outcome (`replayed: true`); same key + different request →
   `IDEMPOTENCY_KEY_REUSED`. The record commits in the same transaction as the
   change, and `render_start` creates its run with the record in one
   transaction, so concurrent duplicate deliveries yield one run.
3. **Whole-patch validation.** A patch is applied to a copy and the result must
   pass `validateScenePlan` and the content limits before anything is written.
4. **Bounded.** Patches ≤ 32 ops, values ≤ 16 KiB; ≤ 50 scenes, 8 characters
   and 40 lines per scene, 600-char lines, 1920×1080, 60 fps, scene hints ≤
   120 s, video ≤ 600 s; ≤ 50 lines / 10 000 chars per voice call, takes ≤ 60 s;
   one active run per workspace; runs ≤ 30 min; artifacts ≤ 512 MiB.
5. **Runs are bound to their input.** `render_start` snapshots the verified
   project at `expectedRevision`; later edits do not change what that run
   renders. The finished render becomes the partial-render basis unless the
   stored cache already matches the current plan exactly.
6. **History.** Every applied revision is recorded (plan, actor, note) in the
   `revisions` store; the editor's version panel keeps its own snapshots.

## Patch format

JSON Patch (RFC 6902) on the existing ScenePlan — `replace`, `add`, `remove`,
`test`; no `move`/`copy`; unknown fields rejected. Paths are confined to
`/title` and `/scenes/...`; `/version`, `/id`, `/fps`, `/resolution` and scene
ids are immutable here. Extension: a path token `@<id>` selects the array
element whose `id` (scenes, dialogue) or `instanceId` (characters) matches:

```json
[
  { "op": "test",    "path": "/scenes/@scene-duo/characters/@dash/position/y", "value": 0.86 },
  { "op": "replace", "path": "/scenes/@scene-duo/characters/@dash/position/x", "value": 0.3 }
]
```

## Run lifecycle

```
queued ─▶ waiting_for_renderer ─▶ running ─▶ succeeded
   │               │                 ├────▶ failed       (RENDER_FAILED, RENDERER_UNAVAILABLE,
   │               │                 │                    OUTPUT_INVALID, LIMIT_EXCEEDED, STORAGE_FAILED)
   └───────────────┴─────────────────┴────▶ cancelled | interrupted
```

- `succeeded` is written only after the MP4 exists, passes an independent demux
  check (video + audio tracks, duration within 0.5 s, resolution, plan hash) and
  is stored — in one transaction with the run record.
- `run_cancel` aborts the encoder and persists `cancelled`; a cancel from
  another page still wins over a late success. Previous outputs are untouched.
- A run whose page closed stops sending heartbeats; on the next command it is
  marked `interrupted`. Renders are never resumed mid-encode — start a new run.
- No browser renderer (missing WebCodecs/H.264, or the tab disconnected) →
  `waiting_for_renderer`, then `failed: RENDERER_UNAVAILABLE`.

## Cache identity

A scene's encoded chunks are reused only when its **render key** matches:
scene JSON + the PCM hash of each take it uses + its background asset's byte
hash + the settings key (renderer id, fps, resolution, bitrate). Unknown
identity (missing take or asset hash) forces a re-render. Timing-window and
decoder-configuration checks still apply. A voice or speed change makes that
line's take stale (`takeMatchesLine`), so `voice_synthesize` replaces exactly it.

## Error codes

`INVALID_ARGUMENT`, `INVALID_PATCH`, `REVISION_CONFLICT`, `IDEMPOTENCY_KEY_REUSED`,
`FORBIDDEN`, `NOT_FOUND`, `LIMIT_EXCEEDED`, `UNSUPPORTED_ENGINE`,
`RENDERER_UNAVAILABLE`, `TAKES_MISSING`, `BUSY`, `RUN_NOT_SUCCEEDED`,
`MISSING_ASSET`, `CORRUPT_ASSET`, `UNSUPPORTED_FORMAT`, `STORAGE_FAILED`
(bridge adds `BRIDGE_TIMEOUT`, `PAIRING_FAILED`, `ALREADY_PAIRED`).
