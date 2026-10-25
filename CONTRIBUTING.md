# Contributing to Contentine Create

Thank you for considering a contribution — this project genuinely needs collaborators, and well-scoped help is very welcome. This guide is long because we want your first PR to go smoothly; the short version is: **pick a labelled issue, say you want it, open a focused PR with evidence, and you'll hear back within 48 hours.**

## Ways to help right now

- Pick up a [`good first issue`](https://github.com/BeyondITL/contentine-create/labels/good%20first%20issue) (small, little context needed) or a [`help wanted`](https://github.com/BeyondITL/contentine-create/labels/help%20wanted) (bigger but clearly scoped).
- Browse the open [issues](https://github.com/BeyondITL/contentine-create/issues) and [ROADMAP.md](ROADMAP.md).
- Improve docs, add tests, or file a clear bug report with a reproduction.
- Not sure where to start? Ask in [Discussions](https://github.com/BeyondITL/contentine-create/discussions).

## 5-minute setup (no model weights needed)

**Prerequisites:** Node 18+ and a recent Chrome/Edge (WebGPU for the fast path; there's a WASM fallback). PHP 8.0+ and MySQL/MariaDB are needed **only** if you work on the optional backend.

```bash
git clone https://github.com/BeyondITL/contentine-create.git
cd contentine-create/frontend
npm install
npm run dev          # → http://localhost:3000
```

That's it — the whole UI runs frontend-only, and most of the codebase (stores, UI, engine wiring, tests) can be worked on without downloading a single model. **Model weights are only needed when you actually run an AI flow**, and each one downloads its own model on first use from the in-app **Models** page (on-device, cached afterwards). To pre-fetch the open weights instead, run `bash scripts/setup-assets.sh` from the repo root (expect a few hundred MB depending on which models you enable).

Backend (optional): `cp admin_config.php.template admin_config.php` (keep it **one level above** the webroot; never commit it), fill in values, then `cd backend && composer install`.

## Claiming an issue

To avoid two people doing the same work:

1. Comment **"I'd like to work on this"** on the issue. A maintainer assigns it to you and adds the `claimed` label.
2. Please have **one open `good first issue` at a time** so newcomers get a fair shot.
3. If there's no activity for **14 days**, we may unassign it so someone else can pick it up — just comment if you need more time, that's completely fine.

## Branch, commit, and PR conventions

- **Branch** from `main`: `fix/…`, `feat/…`, `docs/…`, `test/…`, `chore/…`.
- **Commits** follow [Conventional Commits](https://www.conventionalcommits.org/): `fix(stock): …`, `feat(voices): …`, `docs(readme): …`.
- **One change per PR.** Keep diffs small and reviewable; split unrelated work.
- In the PR description, say **what** changed and **why**, and link the issue (`Closes #123`).

## The quality gate (run this before you open a PR)

```bash
cd frontend && npm run lint && npm run build && npm test
# and, if you touched PHP:  find backend -name '*.php' -print0 | xargs -0 -n1 php -l
```

Beyond green checks, this repo has two rules that define its whole culture:

1. **No facades (Law L1).** Every control must end in a real result from a real engine. No `setTimeout`-simulated work, no mock outputs, no "Coming Soon" placeholders standing in for function. Transient UI state (toasts, spinners, retry backoff) is fine.
2. **Evidence before "done" (Law L6).** A rendering or generation flow is proven **only** by a downloaded, `ffprobe`-valid MP4 — never a green spinner or by reading the source. **Attach that evidence to your PR** (the file, or an `ffprobe` dump and a frame grab) for anything that renders or generates.

The other laws — weights-license discipline (L4: read a model's *weights* license, record it in `LICENSES.md` + `NOTICE`, flag unmet obligations **off**), browser-native core (L2), and root-cause fixes with no swallowed errors — are in [CLAUDE.md](CLAUDE.md). You do **not** need Claude Code to contribute; the laws are just good engineering practice.

## Review promise

- A maintainer gives you a **first response within 48 hours**.
- **"Changes requested"** means we'd like specific edits before merging — it's normal and not a rejection. Reply in the thread, push updates to the same branch, and re-request review.
- We squash-merge, so your branch history doesn't need to be tidy.

## Using AI assistance

AI help (Claude, Copilot, etc.) is **allowed and welcome** — this repo is itself AI-assisted. In return:

- **Disclose it** in the PR description (one line is enough).
- **Understand and be able to explain every line** you submit. If a reviewer asks "why this?", the answer is yours, not the tool's.
- **Answer review comments yourself** — don't paste them back into a bot and relay the output unread.
- Don't add AI co-author trailers unless you want them.

This mirrors how projects like Homebrew and Kubernetes handle AI contributions, and it keeps quality consistent.

## Recognition

Contributors are listed in the README and credited in release notes. Your merged work is public on your GitHub profile — useful for internships, CVs, and portfolios. After your first merge, we'll usually suggest a good follow-up issue.

## Knowledge graph (optional)

The repo is wired to use [graphify](https://github.com/Graphify-Labs/graphify) for fast "who calls / what consumes" queries across the codebase. Install it if you like; `graphify-out/` is gitignored and must never enter the product bundle.

## Licensing & security

- By contributing you agree to the [Contributor License Agreement](CLA.md) (handled automatically on your first PR). The project is AGPL-3.0; the CLA keeps a future dual-license option open. If that's a dealbreaker, open an issue and let's talk.
- **Never** open a public issue for a vulnerability — see [SECURITY.md](SECURITY.md).
- Be kind in review and discussion: [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
