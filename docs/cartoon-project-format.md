# Cartoon project format (v1)

Implementation: `frontend/src/lib/cartoon/project-store.ts`
Contract tests: `frontend/src/lib/cartoon/project-store.test.ts`
Real-browser proof: `frontend/src/engine/cartoon/harness/run-persistence.mjs`

A saved cartoon project is everything needed to reopen it and export the same
video without re-generating anything: the scene plan, the pinned voice takes,
supplied assets, export settings, and (optionally) the last render so a small
edit can be re-rendered scene-by-scene after reopening.

## Storage

IndexedDB database `contentine-cartoon-projects`, version 1.

| Store       | Key                              | Holds |
|-------------|----------------------------------|-------|
| `manifests` | `[workspaceId, projectId]`       | `ProjectManifestV1` (JSON) |
| `blobs`     | `"<workspaceId>/<sha256>"`       | `{ key, workspaceId, sha256, bytes: ArrayBuffer }`, index `workspaceId` |

`projectId` is `plan.id`. Blobs are content-addressed and namespaced per
workspace: identical bytes in two workspaces are two rows, so damage,
eviction or garbage collection in one workspace cannot affect another.

## Manifest v1

```
formatVersion: 1
workspaceId, projectId
revision        integer, starts at 1, +1 per save
planHash        sha256 of canonical plan JSON (hashScenePlan)
savedAt         epoch ms
plan            ScenePlan (validated with validateScenePlan on save and load)
takes[]         { key, dialogueId, text, voiceProfileRef, sampleRate,
                  durationSec, visemes[], pcm: BlobRef }   // pcm = Float32 LE bytes
backgroundImages[] { ref, mime, data: BlobRef }           // ref = background.assetRef
audioAssets[]      { ref, mime, data: BlobRef }
exportConfig    { bitrate? }
lastRender?     { renderedPlan, renderedPlanHash, mp4: BlobRef, fps, width,
                  height, durationSec, totalFrames, audioCodec, audioPcmHash,
                  timing, decoderConfig { codec, codedWidth, codedHeight,
                  description?: BlobRef }, scenes[] { sceneId, contentHash,
                  startFrame, frameCount, chunks: BlobRef,
                  index: [byteLength, 'key'|'delta', timestamp, duration][] },
                  savedAt }
BlobRef = { sha256, size }
```

A take's `pcm.sha256` equals the runtime `VoiceTake.pcmHash`; the store
refuses to save a take whose declared hash does not match its bytes.

## Guarantees

- **Atomic.** All new blobs and the manifest are written in one `readwrite`
  transaction. Hashing happens before the transaction opens (awaiting crypto
  inside it would let IndexedDB auto-commit half-way). If any write fails the
  transaction aborts and the previous revision is untouched.
- **Compare-and-swap.** `saveProject(input, { expectedRevision })`:
  `null` creates; a number must equal the stored revision. Otherwise
  `REVISION_CONFLICT` and nothing is written. Importing a bundle is a create.
- **Integrity.** On load every referenced blob is re-hashed. A missing or
  altered pinned input (take, image, audio) raises `MISSING_ASSET` /
  `CORRUPT_ASSET` — it is never silently re-synthesized or replaced. The
  render cache is regenerable: if only it is damaged the project loads
  without `lastRender` and `warnings` explains why (next export is a full render).
- **Bounded.** Limits (`PROJECT_LIMITS`): 1000 takes, 500 assets, 256 MiB per
  blob, 1 GiB per project, ids ≤ 200 chars. Checked before any write.
- **Garbage collection.** After a committed save, blobs no manifest in the
  same workspace references are deleted. GC failure only costs space.

## Error codes

`INVALID_PROJECT`, `NOT_FOUND`, `REVISION_CONFLICT`, `LIMIT_EXCEEDED`,
`MISSING_ASSET`, `CORRUPT_ASSET`, `UNSUPPORTED_FORMAT`, `STORAGE_FAILED` —
all thrown as `ProjectStoreError { code, message, details? }`.

## Portable bundle (`.ccproj`)

Browser storage can be evicted; it is not an archive. `exportProjectBundle`
writes one file:

```
"CCPROJ01" | u32 LE header length | header JSON { manifest, blobs: [{ sha256, size, offset }] } | blob bytes
```

`importProjectBundle(blob, workspaceId)` verifies every blob hash before
writing anything, then creates the project (an existing id is a conflict).
A bundle exported while the render cache was damaged omits `lastRender`.

## Versioning

`formatVersion` is checked on load and import; an unknown version is
`UNSUPPORTED_FORMAT` (no best-effort parse). A future v2 adds a migration
step in `openDB`'s `onupgradeneeded` and a manifest upgrader; v1 readers
must keep refusing v2 data.

## Not covered by v1

- Cross-tab live sync (a second tab sees a conflict on save, not a merge).
- Asset changes under an unchanged ref are detected on load (hash), but the
  partial re-render's scene-change detection is still plan-JSON-based; see
  the WP4 cache-identity task in `docs/execution/TASKS.md`.
- Server sync (Law L2: optional; not part of this format).
