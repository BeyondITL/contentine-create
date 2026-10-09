# Contributing to Contentine Create

Thank you for considering a contribution — this project genuinely needs collaborators, and well-scoped help is very welcome.

## Ways to help right now

- Pick up a [`good first issue`](https://github.com/BeyondITL/contentine-create/labels/good%20first%20issue) or [`help wanted`](https://github.com/BeyondITL/contentine-create/labels/help%20wanted).
- Tackle an open item from [ROADMAP.md](ROADMAP.md) — the URL→video visuals story, the remix→wizard script-parser hardening, and accessibility are all well-defined.
- Improve docs, add tests, or file a clear bug report with a reproduction.

## Dev setup

**Prerequisites:** Node 18+, a WebGPU-capable browser (recent Chrome/Edge). PHP 8.0+ and MySQL/MariaDB only if you work on the backend.

```bash
git clone https://github.com/BeyondITL/contentine-create.git
cd contentine-create/frontend && npm install && cd ..
bash scripts/setup-assets.sh        # downloads open model weights
cd frontend && npm run dev          # http://localhost:3000
```

Backend (optional): `cp admin_config.php.template admin_config.php` (one level above the webroot; **never commit it**), fill values, then `cd backend && composer install`.

## The bar (please read — it's the whole culture of this repo)

1. **No facades (L1).** Every control must end in a real result from a real engine. No `setTimeout`-simulated work, no mock outputs, no "Coming Soon" placeholders standing in for function. Transient UI state (toasts, spinners, retry backoff) is fine.
2. **Evidence before "done" (L6).** A rendering/generation flow is proven only by a **downloaded, ffprobe-valid MP4** — never a green spinner or source-reading. Attach the evidence to your PR.
3. **Weights-license discipline (L4).** If you wire in a model, read its *weights* license, record it in `LICENSES.md` + `NOTICE`, and feature-flag anything with unmet obligations to **off** by default.
4. **Browser-native core (L2).** Core creation stays client-side; the backend is optional and non-blocking.
5. **No dead code, root-cause fixes.** Don't swallow real errors in empty `catch` blocks.

The full set of laws and the session discipline are in [CLAUDE.md](CLAUDE.md). This repo is configured for Claude Code (`.claude/` with hooks, subagents, and domain skills) — but you do not need Claude Code to contribute; the rules are just good engineering practice.

## Knowledge graph (optional but handy)

The repo is wired to use [graphify](https://github.com/Graphify-Labs/graphify) for fast "who calls / what consumes" queries across the codebase. Install it if you like; `graphify-out/` is gitignored and must never enter the product bundle.

## Pull requests

- Branch from `main`; keep PRs focused on one thing.
- Run the gate before opening: `cd frontend && npm run lint && npm run build && npm test` (and `php -l` on changed PHP).
- Describe **what** changed and **why**, with evidence for any flow you touched.
- Be kind in review. See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## Licensing of contributions

By contributing you agree to the [Contributor License Agreement](CLA.md). The project is AGPL-3.0; the CLA keeps a future dual-license option open. If that's a dealbreaker for you, open an issue and let's talk — this isn't meant to be a barrier.

## Reporting security issues

Please do **not** open a public issue for vulnerabilities — see [SECURITY.md](SECURITY.md).
