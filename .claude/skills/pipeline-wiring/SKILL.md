---
name: pipeline-wiring
description: Anti-facade checklist for every feature wire-up. Use whenever a UI button, form submit, or store action must produce a real result from a real engine or API. Enforces Law L1 (no simulated work) and Law L8 (dynamic engine imports).
---

# pipeline-wiring — the checklist every wire-up passes

## Non-negotiables (Law L1)

1. **No fake data.** No `setTimeout(fn, N)` paired with `setProgress()`, `setLoading()`, `setPercent()`, `fakeData`, or any hardcoded array standing in for a fetch. Loading state must be gated on the **actual** fetch/engine promise settling.
2. **No `simulate*()`.** If a function is named `simulateProgress`/`simulateResponse`/`simulateWebhook`, delete it. Replace with the real path. Comments containing "simulate" as an English word (e.g. `// draw a shape that simulates opening`) are OK.
3. **No `mock`/`FAKE` identifiers in prod paths.** `mockData`, `MOCK_USER`, `FAKE_ORDER` etc. go in `**/__mocks__/*` or `*.test.ts` — never in `frontend/src/app/**`, `frontend/src/components/**`, `frontend/src/stores/**`.
4. **No "Coming Soon" panels or gray boxes.** If a surface can't ship, feature-flag it off / remove it from nav (Deferral rule under Law L1). Hiding honestly > faking politely.

## Allowed patterns (whitelisted by the anti-facade hook)

- Toast auto-dismiss, tooltip hover-delay, animation-exit timers (Toast, Tooltip, transitions).
- Debounce timers on save / search / edit-store.
- OAuth-popup-closed guard timeout (60 s).
- Retry backoff (`sleep(ms)` in `lib/api.ts`).
- Engine warmup / load timeouts (`talkinghead-engine.ts`, `render-pipeline.ts:74`).
- The deliberate `setTimeout`-based frame tick in `render-pipeline.ts:579-580` (rAF pauses in background tabs) — being retired by the OffscreenCanvas Worker cartoon renderer.

## Engine import discipline (Law L8)

- Next.js `output: 'export'` — **every engine import must be dynamic** (`await import('@/engine/...')`) so the static export tree-shakes correctly.
- Every engine in `frontend/src/engine/` must have ≥1 consumer or `verify.sh` fails. If you add an engine, wire a consumer in the same PR.

## Wire-up recipe (component → engine)

1. Component acquires the engine reference: `const engine = await getEngine('tts-manager')` from `browser-engine-manager` (or direct `await import(...)` if the engine has no manager).
2. Set loading state **before** the async call: `setStatus('loading')`.
3. Await the engine call. Real errors surface — no swallow-and-fake-a-value.
4. On success: pass the real result to state; on error: surface the error message and the failing step (device capability, model download, API status).
5. Never invent progress. If the engine emits progress events (Kokoro `download`, WebLLM `progress`), subscribe. Otherwise show an indeterminate spinner, not a fake percentage.

## Store discipline

- Prefer the shared `api` client from `frontend/src/lib/api.ts`. Do not build ad-hoc `fetch()` wrappers.
- Optimistic UI is fine; a `setTimeout` to fake a server response is not.
- Offline fallbacks (e.g. `stores/stock-store.ts`) must render with a visible "demo items — offline" label.

## The gate

- `PreToolUse` blocks new writes that violate any of the above.
- `verify.sh --quick` re-runs the L1 census on every Stop. Any hit fails the gate.
- Reviews reference this skill by name in comments: `// see pipeline-wiring`.
