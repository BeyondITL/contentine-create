# Pull requests ready to open (blocked by B1: no GitHub write access from the working session)

Open in this order; each targets the previous branch until it merges, then
retarget to `main`. `main` requires one approving human review (B2) — an agent
is not that reviewer. Every description ends with the attribution footer.

| # | Branch | Base | Commits |
| --- | --- | --- | --- |
| 1 | `fix/take-identity` | `main` | 49719e9 |
| 2 | `wp2/harness-portability` | `main` | 8157a2c, 23219f7 |
| 3 | `wp3/project-store` | `wp2/harness-portability` | 7b0b31d, 8404b95 |
| 4 | `wp4/commands` | `wp3/project-store` | bca4e5d (= #1, cherry-picked), cf2be16, ad58112, f6f5da4, f11bcd0, f69acf5, + ledger commit |

Restore from the project bundle (`claude/UNPUSHED_WORK_BUNDLE_*.md`) if this
sandbox is gone, then `git push -u origin <branch>` and `gh pr create` with the
bodies below.

---

## 1 · fix(cartoon): invalidate voice takes on voice or speed change, not only text

## Problem
A voice take was reused whenever its text matched, so changing a line's voice
or speed (`kokoro:af_sky@1.0 → @1.15`) kept the old audio — the editor showed
the line as clean and the export spoke with the wrong voice.

## Change
`takeMatchesLine` (lib, so the UI can import it statically under Law L8)
compares text **and** `voiceProfileRef`. `synthesizeTakes`, the editor's stale
badge and its stale-take deletion all use it.

## Validation
- Tested revision: 49719e9
- Real executions: speed change in Chrome re-voiced exactly one line (A04, on wp4)
- Contract/fixture checks: `voice-takes.test.ts` (8) — predicate, voice change and speed change each re-voice exactly one line, no TTS when all match
- Not run / blocked: —

## Scope and remaining limits
Engine id and model version are part of `voiceProfileRef`; a model update with the same ref is not detected.

## Tracking
WP4a in `docs/execution/TASKS.md`.

---

## 2 · fix(harness): run C-M1 on Linux; make render-comparison semantics explicit

## Problem
The C-M1 determinism harness only ran on macOS (`md5 -q`) and required
byte-identical MP4s, which Linux Chromium's software H.264 encoder does not
produce (ENC-01) — so the gate was red for an environment property, not a bug.

## Change
Node hashing; the gate requires identical pre-encode frames, mixed PCM,
Mediabunny probes and ffprobe structure; `CM1_REQUIRE_BYTE_IDENTICAL=1` keeps
the strict mode. Adds the execution ledger (`docs/execution/`).

## Validation
- Tested revision: 8157a2c
- Real executions: A01 first export, A02 scene-2-only revision (Linux, Chrome 153)
- Controlled simulations: ENC-01 encoder determinism experiments
- Not run / blocked: macOS re-run

## Scope and remaining limits
Byte identity across devices is not claimed.

## Tracking
WP0, WP2.

---

## 3 · feat(cartoon): durable, recoverable project store (format v1)

## Problem
A cartoon existed only in memory: closing the tab lost the plan, the voice
takes and the render, and nothing could be reopened.

## Change
IndexedDB project store: atomic saves (blobs + manifest in one transaction),
compare-and-swap revisions, content-addressed blobs re-hashed on load,
per-workspace scoping, limits, GC, and a hash-verified `.ccproj` backup.
Format: `docs/cartoon-project-format.md`.

## Validation
- Tested revision: 7b0b31d
- Real executions: A05 — saved in Chrome, browser quit and relaunched, reopened with identical take bytes and zero TTS calls, re-exported, partial re-render from the restored cache (`run-persistence.mjs`)
- Controlled simulations: A06 — 7 injected storage failures in real Chrome IndexedDB
- Contract/fixture checks: 12 tests on fake-indexeddb, each mutation-checked
- Not run / blocked: real quota exhaustion, browser-initiated eviction

## Scope and remaining limits
No cross-tab merge (conflicts are reported). UI wiring lands in #4.

## Tracking
WP3, gate G3.

---

## 4 · feat: shared cartoon commands, run lifecycle, assistant bridge, demo

## Problem
The editor called the engine directly; there was no single safe path an
assistant could use, no revision checks, no idempotency, no run state, and
scene reuse ignored voice-take and asset changes (stale frames possible).

## Change
- One `CartoonCommandService` (8 commands) for the editor and assistants:
  CAS revisions, idempotency bound to actor + operation + payload, bounded
  JSON Patch on the existing ScenePlan, trusted-context authorization, run
  lifecycle with verified success, cancel, interruption.
- Render identity: scene reuse keys on scene JSON + take PCM + background
  bytes + render settings; renders are cancellable.
- Editor Re-roll commits through the commands; saved projects open, back up,
  restore, and render on open; Assistant panel with pairing.
- `bridge/`: local MCP companion (origin/host checks, single-use pairing,
  hashed revocable tokens, no shell/eval/paths). CI job added.
- Sample plan, recorded demo harness, architecture and launch docs.

## Validation
- Tested revision: f69acf5 (G5 re-run green on it)
- Real executions: A04, A07, A09, A11 (`run-commands.mjs`); A12/G5 — Claude Code over MCP, built-in tools disabled, completed inspect → propose → conflict → re-inspect → apply → render → save in the real app build (`run-assistant.mjs`); recorded UI demo (`run-demo.mjs`)
- Contract/fixture checks: 69 frontend + 6 bridge tests (A08, A10, A13), critical checks mutation-verified; a concurrency bug (duplicate runs) was found by a new test and fixed
- Controlled simulations: renderer-unavailable via a fake port
- Not run / blocked: other assistants, macOS/Windows/Safari/Firefox, real users (WP8)

## Scope and remaining limits
One active run per workspace, one tab per bridge, local workspace only.
Narration-text edits re-render fully (by design). See the launch kit's
limitations.

## Tracking
WP4, WP5, WP6, WP7; gates G4–G6 (G7 pending an independent verifier).

---

Footer for every PR body:

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01A7dfucRS2sRTZ6hagpTCgd
