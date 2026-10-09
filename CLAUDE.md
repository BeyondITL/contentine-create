# CLAUDE.md — Contentine Create

Operating rules for any Claude Code (or other agent) session in this repository.
Keep this file short; deep procedures live in `.claude/skills/` and are loaded on demand.

## What this project is

Browser-native, on-device AI studio for short-form video and content. Next.js 14
static-export frontend runs the AI engines client-side (WebGPU → WASM fallback);
an **optional** PHP 8 / MySQL backend handles sign-in, credits, and commerce. See
`README.md` and `ARCHITECTURE.md`.

## The laws (the design bar — enforced by hooks + review)

- **L1 — ZERO FACADES.** No `setTimeout`-simulated work, `simulate*()`, mock outputs, "Coming Soon" panels, or fake results. Every control ends in a real result from a real engine. Transient UI state (toasts, tooltips, retry backoff, engine warmup) is fine — that's what the anti-facade hook whitelists.
- **L2 — BROWSER-NATIVE CORE, OPTIONAL SERVER.** All core creation runs client-side. IndexedDB/OPFS is the primary data layer; the backend is a non-blocking sync/commerce layer, never required to create. Offline-after-download must keep working.
- **L3 — LOAD-BEARING FILES.** Treat the auth/init/api/providers files and the webroot `.htaccess` / `web.config` as load-bearing (see `.claude/rules/l3-frozen.md`). Don't rewrite them casually; propose a diff and get review first. Backend sync must never overwrite an identity profile with `undefined`.
- **L4 — WEIGHTS-LICENSE DISCIPLINE.** A model's license is its **weights** license, not its code license. Before wiring any model, read the checkpoint license in full and record revenue / field-of-use / non-commercial clauses in `LICENSES.md` + `NOTICE`. Anything with unmet obligations ships behind a feature flag defaulting to **off**. Standing rulings live in `LICENSES.md` (e.g. CC-BY-NC checkpoints are banned from production; SD-Turbo is gated).
- **L5 — HONEST VIDEO.** Video is *rendered* (cartoon / motion-graphics / avatar), never generative-pretend. Marketing claims match the real quality ladder.
- **L6 — DETERMINISM.** Renders are frame-accurate (timeline `seek()` per frame → OffscreenCanvas → WebCodecs → Mediabunny in a Worker). `captureStream`/`MediaRecorder` is banned for export. Same project file ⇒ same output on any device. Audio mixes via `OfflineAudioContext`; seed-lock generated assets.
- **L7 — CONSENT & PROVENANCE.** Voice-clone requires a recorded consent checkbox (stored). Exports embed provenance metadata and an optional AI-disclosure caption preset.
- **L8 — ENGINE IMPORTS ARE DYNAMIC** (static-export constraint), and every engine must have ≥1 consumer or the build gate fails.
- **L9 — COMMERCE IS REAL.** Payments, credits, entitlements, invoices, and webhooks work against Stripe **test mode** in dev — no mocked billing anywhere.

## Architecture facts

- Next.js 14 static export (`output: 'export'`, no SSR) — every engine import is dynamic.
- Backend: PHP 8.0+ / MySQL (or MariaDB). Front-controller at `backend/public/index.php`, PSR-4 `Contentine\`. Reached from the static frontend via the `frontend/public/api/index.php` shim.
- Rough size: ~22 Zustand stores · ~21 engines · ~33 controllers · ~8 services · ~4 middleware · ~100 API routes.
- Auth via Auth0, **redirect flow only** (COOP severs `window.opener` — no popups). Admin is a client-side email match set by `NEXT_PUBLIC_ADMIN_EMAIL`.
- Stripe: hosted redirect Checkout + Billing Portal (COEP-safe). No embedded Elements iframes.
- Brand: Lucide icons only (no emoji in UI), dark mode, `.bento-card`, turquoise `#00C3FF` / green `#35C838` / mauve `#F3A6FF`, 4 breakpoints.

## Commands

Run from the repo root.

```bash
# Frontend
cd frontend && npm install && npm run dev      # dev server
cd frontend && npm run lint && npm run build   # lint + static export
cd frontend && npm test                        # vitest
bash scripts/setup-assets.sh                    # fetch open model weights

# Backend (optional)
cd backend && composer install && composer test
```

`/verify` runs the full battery (build, tests, facade + engine census) and reports without fixing. `/ship` runs the gate and opens a PR.

## Session discipline

- **One task per session.** Use `/clear` between unrelated tasks. If two correction attempts don't fix a problem, `/clear` and rewrite the prompt rather than correcting a third time.
- **Explore with subagents** (`.claude/agents/`) so the main context stays clean; the `researcher`/`log-analyzer`/`facade-hunter` agents are read-only.
- **Evidence before "done."** A flow is proven only by a downloaded, ffprobe-valid MP4 — never a green spinner. Assertions record what they saw to an artifact, not just a boolean.
- **No dead code, root-cause fixes.** Don't leave an unused engine or a `catch(() => {})` that swallows a real failure.
- **Never commit secrets.** Real values live in `admin_config.php` (gitignored) and `.env*.local`. `CLAUDE.local.md` may only *reference* where a secret lives.

## Escalation — stop and ask

- The build is red after two distinct fix attempts on the same failure.
- A model/library license is ambiguous or has unmet obligations (quote the clause verbatim — see the `license-audit` skill).
- A change would require editing an L3 load-bearing file.
- Enabling a gated model flag (e.g. `NEXT_PUBLIC_IMAGE_GEN_ENABLED`), activating Stripe live mode, or any deletion of user data.

## Knowledge graph (graphify)

This repo is set up to use [graphify](https://github.com/Graphify-Labs/graphify) as local, offline dev tooling. When `graphify-out/graph.json` exists, prefer `graphify query "<question>"` / `graphify path "<A>" "<B>"` / `graphify explain "<concept>"` over raw grep for "who calls / what consumes" questions, and run `graphify update .` after code changes. **Never** add graphify or its output to the product bundle or `package.json`; `graphify-out/` is gitignored.
