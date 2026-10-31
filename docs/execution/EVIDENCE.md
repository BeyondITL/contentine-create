# Evidence index

Records follow `ACCEPTANCE_AND_EVIDENCE.md`: each separates outcome from execution mode and
states what the result does **not** establish. Media files live outside Git (`artifacts/`,
gitignored); records carry their sizes and SHA-256.

| Test | Outcome | Class | Environment | Record | Supports |
| --- | --- | --- | --- | --- | --- |
| A01 first export | pass | real_execution | Linux, headless Chromium 153, software H.264 + Opus | [A01](evidence/A01-first-export-linux-chromium153.json) | Fresh checkout + documented setup renders the 3-scene sample (1062 frames, 1080p, 35.4 s) with real Kokoro narration; two renders match in frames, mixed audio and stream structure |
| A02 visual revision | pass | real_execution | same | [A02](evidence/A02-visual-revision-linux-chromium153.json) | Scene-2-only visual edit re-renders only scene 2; other scenes' decoded frames and the decoded narration are bit-identical |
| A05 reopen after browser restart | pass | real_execution | Linux, headless Chrome 153, real on-disk IndexedDB | [A05](evidence/A05-reopen-after-browser-restart-linux-chromium153.json) | Project saved, Chrome quit and relaunched: same plan and take bytes, zero TTS calls, valid re-export with identical pre-encode frames and narration, post-reopen edit reuses restored scene chunks bit-exactly |
| A06 storage failure injection | pass | controlled_simulation | same | [A06](evidence/A06-storage-failure-injection-linux-chromium153.json) | Stale CAS, mid-transaction write failure, evicted render cache, corrupted/missing take, workspace isolation, tampered bundle — each yields a stable code or warning and keeps the last good revision |
| A04 cache identity | pass | real_execution | Linux, headless Chrome 153 | [A04](evidence/A04-cache-identity-linux-chromium153.json) | Background bytes swapped under the same ref re-render that scene (365/365 frames) while scene 2 is reused bit-exactly; a speed-only change re-voices exactly one line. Global settings: contract-tested only |
| A07 stale revision | pass | real_execution | same | [A07](evidence/A07-stale-revision-linux-chromium153.json) | Patch against a stale revision → REVISION_CONFLICT; the other writer's revision survives |
| A08 duplicate delivery | pass | contract_test | Node + fake-indexeddb, fake ports | [A08](evidence/A08-duplicate-delivery.json) | Same key → one outcome; changed payload rejected; concurrent duplicate render_start → one run (bug found and fixed) |
| A09 scope / authorization | pass | real_execution | Linux, headless Chrome 153 | [A09](evidence/A09-scope-and-authorization.json) | Project grant and workspace scoping enforced for inspect, cancel and artifacts |
| A10 invalid input | pass | contract_test | Node | [A10](evidence/A10-invalid-input.json) | Unknown/immutable/non-finite/oversized input rejected before writes; no partial patches |
| A11 cancel / renderer loss | pass | real_execution | Linux, headless Chrome 153 | [A11](evidence/A11-cancel-and-renderer-loss-linux-chromium153.json) | Real mid-render cancel keeps the previous MP4; a render killed by quitting Chrome becomes `interrupted` after relaunch |
| A12 real assistant (G5) | pass | real_execution | Claude Code 2.1.316 + app build in Chrome 153 | [A12](evidence/A12-real-assistant-g5-linux-chromium153.json) | Claude Code over MCP (no shell/file tools) inspected, proposed, hit a conflict from a live UI edit, re-inspected, applied, rendered and saved a verified MP4 |
| A13 bridge auth boundary | pass | contract_test | Node | [A13](evidence/A13-bridge-auth-boundary.json) | Origin/Host checks, single-use pairing, hashed revocable tokens, fail-closed tools, confined artifact paths |
| G7 reproduction | pass | real_execution (agent verifier, not human) | fresh clone, Chrome 153, Claude Code | [G7](evidence/G7-independent-reproduction.json) | An independent agent followed only the docs: setup, 69+6 tests, and the commands / persistence / real-assistant harnesses all GREEN; 7 doc gaps found and fixed |
| ENC-01 encoder determinism | pass | controlled_simulation | same | [ENC-01](evidence/ENC-01-h264-encoder-determinism.json) | This Chromium's software H.264 output varies run-to-run on identical frames; MP4 byte identity is an environment property |

## Reproduce

Prerequisites (not installed by the scripts): Node 20+; Chrome or Chromium for
Playwright (the harnesses use `channel: 'chrome'` and fall back to Playwright's
bundled Chromium); `ffmpeg` and `ffprobe` on PATH; network access to
github/jsdelivr (setup script) and huggingface.co (Kokoro model, first voicing);
ports 3000 and 47821 free. A12 additionally needs the `claude` CLI installed
**and signed in**. Run everything from the repository root. `npm ci
--ignore-scripts` reproduces the locked dependency tree exactly (the README's
`npm install` is fine for development).

```bash
(cd frontend && npm ci --ignore-scripts) && bash scripts/setup-assets.sh
(cd frontend && npx vitest run) && (cd bridge && npm ci && npm test)   # contract tests: A08 A10 A13 (~10 s)

node frontend/src/engine/cartoon/harness/run-c-m1.mjs          # A01 A02 (~3 min); CM1_REQUIRE_BYTE_IDENTICAL=1 also requires identical MP4 bytes
node frontend/src/engine/cartoon/harness/run-persistence.mjs   # A05 A06 (~3.5 min); also writes artifacts/persistence/project-bundle.ccproj
node frontend/src/engine/cartoon/harness/run-commands.mjs      # A04 A07 A09 A11 (~3.5 min)

# A12 / G5 — needs the .ccproj from run-persistence.mjs (or pass another bundle as the first argument)
(cd frontend && npm run build)
node frontend/src/engine/cartoon/harness/run-assistant.mjs     # (~1 min after the build)

node frontend/src/engine/cartoon/harness/run-demo.mjs          # recorded UI demo (~7–8 min on a fresh profile)
```

Each harness prints a PASS/FAIL list and `GATE: GREEN|RED`, and writes its report
under `artifacts/<name>/` (gitignored).

## Not yet evidenced

A03 narration-text edit end to end · A06 under real quota/eviction · A14 live account auth (not applicable: local workspace) ·
A15 offline claim · A16 unsupported browser/codec · A17 approvals (not implemented) · A18 merge verification (blocked: B1).
