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
| ENC-01 encoder determinism | pass | controlled_simulation | same | [ENC-01](evidence/ENC-01-h264-encoder-determinism.json) | This Chromium's software H.264 output varies run-to-run on identical frames; MP4 byte identity is an environment property |

## Reproduce

```bash
cd frontend && npm ci --ignore-scripts && cd ..
bash scripts/setup-assets.sh
node frontend/src/engine/cartoon/harness/run-c-m1.mjs          # gate on structure (default)
CM1_REQUIRE_BYTE_IDENTICAL=1 node frontend/src/engine/cartoon/harness/run-c-m1.mjs  # also require identical MP4 bytes
node frontend/src/engine/cartoon/harness/run-persistence.mjs   # A05 + A06 (~3.5 min, quits and relaunches Chrome)
(cd frontend && npx vitest run src/lib/cartoon/project-store.test.ts)  # storage contract
```

## Not yet evidenced

A03 narration edits · A04 cache identity · A06 under real quota/eviction or process kill · A07–A11 failure/recovery ·
A12 assistant integration · A13 bridge auth · A15 offline claim · A16 unsupported browser ·
A18 merge verification (blocked: B1).
