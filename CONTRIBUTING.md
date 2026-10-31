# Contributing to Contentine Create

Thank you for considering a contribution — this project genuinely needs collaborators, and well-scoped help is very welcome. This guide is long because we want your first PR to go smoothly; the short version is: **pick a labelled issue, comment `/claim`, open a focused PR with evidence, and a maintainer aims to respond within 2 working days.**

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

## How to claim an issue

To avoid two people doing the same work:

1. Comment **`/claim`** on an open, unassigned issue. A bot assigns it to you and adds the `claimed` label. If someone already has it, the bot tells you who.
2. Open a **draft PR** early and link the issue (`Closes #123`).
3. If there is **no linked PR and no comment from you for 7 days**, the claim is released automatically so someone else can pick it up. A quick progress comment keeps it.
4. Changed your mind? Comment **`/unclaim`** to hand it back. No hard feelings.

Please hold **one open `good first issue` at a time** so newcomers get a fair shot.

## Levels

Issues carry a difficulty label so you can pick something that fits:

| Label | What it means |
|---|---|
| `level: 1` | A first contribution. Scoped to one file or component, and the issue gives you the command that proves it works. |
| `level: 2` | Wiring or hardening across a few files. Expect to read some surrounding code first. |
| `level: 3` | Open hard problems with no known answer yet. See [Hard problems in ROADMAP.md](ROADMAP.md#hard-problems-level-3); propose an approach in the issue before writing much code. |

## Branch, commit, and PR conventions

- **Branch** from `main`: `fix/…`, `feat/…`, `docs/…`, `test/…`, `chore/…`.
- **Commits** follow [Conventional Commits](https://www.conventionalcommits.org/): `fix(stock): …`, `feat(voices): …`, `docs(readme): …`.
- **One change per PR.** Keep diffs small and reviewable; split unrelated work.
- In the PR description, say **what** changed and **why**, and link the issue (`Closes #123`).

## Changelog fragments

Don't edit `CHANGELOG.md` directly. Add one file per PR in [`changelog.d/`](changelog.d/README.md) named `<PR or issue number>.<type>.md`, where type is `added`, `changed`, `fixed`, `removed`, or `docs`, with one or two lines for the release notes. Maintainers fold the fragments into `CHANGELOG.md` at release. CI-only, test-only, and typo PRs don't need one.

## The quality gate (run this before you open a PR)

```bash
cd frontend && npm run lint && npm run build && npm test
# and, if you touched PHP:  find backend -name '*.php' -print0 | xargs -0 -n1 php -l
```

Beyond green checks, this repo has two rules that define its whole culture:

1. **No facades (Law L1).** Every control must end in a real result from a real engine. No `setTimeout`-simulated work, no mock outputs, no "Coming Soon" placeholders standing in for function. Transient UI state (toasts, spinners, retry backoff) is fine.
2. **Evidence before "done" (Law L6).** A rendering or generation flow is proven **only** by a downloaded, `ffprobe`-valid MP4 — never a green spinner or by reading the source. **Attach that evidence to your PR** (the file, or an `ffprobe` dump and a frame grab) for anything that renders or generates.

The other laws — weights-license discipline (L4: read a model's *weights* license, record it in `LICENSES.md` + `NOTICE`, flag unmet obligations **off**), browser-native core (L2), and root-cause fixes with no swallowed errors — are in [CLAUDE.md](CLAUDE.md). You do **not** need Claude Code to contribute; the laws are just good engineering practice.

## Review expectations

- Maintainers **aim to give a first response within 2 working days**. This is a small team, so it is an aim, not a guarantee; if a week passes with no reply, a polite ping on the PR is welcome.
- **"Changes requested"** means we'd like specific edits before merging — it's normal and not a rejection. Reply in the thread, push updates to the same branch, and re-request review.
- We squash-merge, so your branch history doesn't need to be tidy.

## AI-assisted contributions

AI help (Claude, Copilot, etc.) is **allowed and welcome** — this repo is itself AI-assisted. In return:

- **Describe it honestly** in the PR template's "AI assistance" section: which tool, what it did, and what you did (reviewed the diff, ran the tests, wrote parts). "None" is a fine answer.
- **You must understand every line** you submit and be able to answer review questions on it yourself. If a reviewer asks "why this?", the answer is yours, not the tool's.
- **Never claim tests you did not run.** "How you tested" lists commands you actually ran and what they printed. If you couldn't run something, say so.
- **Answer review comments yourself** — don't paste them back into a bot and relay the output unread.
- Don't add AI co-author trailers unless you want them.

PRs that misdescribe how they were made or tested may be closed. Using AI is fine; hiding it isn't.

## Recognition

Every contributor appears on GitHub's [contributor graph](https://github.com/BeyondITL/contentine-create/graphs/contributors) (linked from the README) and is credited in release notes. Your merged work is public on your GitHub profile — useful for internships, CVs, and portfolios. After your first merge, we'll usually suggest a good follow-up issue.

## Knowledge graph (optional)

The repo is wired to use [graphify](https://github.com/Graphify-Labs/graphify) for fast "who calls / what consumes" queries across the codebase. Install it if you like; `graphify-out/` is gitignored and must never enter the product bundle.

## Licensing & security

- By contributing you agree to the [Contributor License Agreement](CLA.md) (handled automatically on your first PR). The project is AGPL-3.0; the CLA keeps a future dual-license option open. If that's a dealbreaker, open an issue and let's talk.
- **Never** open a public issue for a vulnerability — see [SECURITY.md](SECURITY.md).
- Be kind in review and discussion: [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
