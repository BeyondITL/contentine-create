# AGENTS.md

Guidance for AI coding agents (Claude Code, Cursor, Codex, Gemini CLI, etc.)
working in this repository. This is the short version; the authoritative rules
are in [CLAUDE.md](CLAUDE.md).

## Start here

1. Read [CLAUDE.md](CLAUDE.md) — the nine laws (zero facades, browser-native
   core, deterministic render, weights-license discipline, …) and the session
   discipline. They are the design bar, not suggestions.
2. Read [CONTRIBUTING.md](CONTRIBUTING.md) for the dev setup and PR process.
3. For codebase navigation, prefer the [graphify](https://github.com/Graphify-Labs/graphify)
   knowledge graph (`graphify query/path/explain`) over broad grep when
   `graphify-out/graph.json` exists.

## Non-negotiables

- **No facades.** Every control ends in a real engine result. Prove rendering
  flows with a downloaded, ffprobe-valid MP4 — never a green spinner.
- **Never commit secrets.** Real config lives in `admin_config.php` (gitignored)
  and `.env*.local`.
- **Weights-license discipline.** Record any new model's license in
  `LICENSES.md` + `NOTICE`; keep models with unmet obligations flag-gated off.
- **Escalate** (stop and ask) on: a red build after two fix attempts, a license
  ambiguity, a change to an L3 load-bearing file, enabling a gated model flag,
  Stripe live mode, or any deletion of user data.

## Tooling in this repo

- `.claude/agents/` — read-only explorers (researcher, log-analyzer,
  facade-hunter) and reviewers (code-reviewer) plus domain verifiers
  (e2e-runner, render-verifier, license-auditor). Use them to keep context clean.
- `.claude/skills/` — domain procedures (pipeline-wiring, render-export,
  scene-plan-schema, voice-profiles, license-audit, frontend-conventions, …).
- `.claude/hooks/` — deterministic guards (anti-facade, lint, pre-deploy test
  gate, opt-in stop-verify). Don't weaken them.
- `/verify` reports the full battery without fixing; `/ship` runs the gate and
  opens a PR. Never push directly to `main`.
