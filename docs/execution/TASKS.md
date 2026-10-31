# Task ledger

States: queued · running · review · merged · blocked · deferred · superseded.
"review" = implemented and verified locally, not yet merged.

| ID | Outcome | Depends on | State | Issue / PR | Evidence | Next action |
| --- | --- | --- | --- | --- | --- | --- |
| WP0 | Baseline known: repo/SHA, checks, environments, blockers | — | done | — | STATUS.md | — |
| WP1a | PR #44 (external, @yashexc2002) dispositioned | WP0 | blocked (B1) | #44, fixes #29 | Source change verified: lint warnings 11 → 8, exactly the 3 targeted; build/tests unaffected | Request removal of 2 unrelated lockfile changes (see review note below), then approve + merge |
| WP1b | Duplicate starter issues reconciled | WP0 | blocked (B1) | — | Issue list not readable without API access | List issues, keep one canonical per title, link duplicates |
| WP1c | Dependabot PRs #38–#43 dispositioned | WP0 | queued | #38 #39 #40 #42 #43 | — | #39 (Next 15) and #40/#42 (vitest 5) are majors needing migration work; #40 and #42 overlap |
| WP2 | Real sample export + visual-only revision | WP0 | review | branch `wp2/harness-portability` | evidence/A01, A02, ENC-01 | Push + PR when B1 clears |
| WP3 | Complete project persists and reopens (G3) | WP0 | review | branch `wp3/project-store` | A05, A06; 12 contract tests | Push + PR when B1 clears. Reopen/backup/restore UI shipped with WP4 |
| WP4a | Voice takes invalidate on voice/speed change, not only text | WP0 | review | branch `fix/take-identity` (also cherry-picked into `wp4/commands`) | vitest; A04 (real speed change) | Push + PR when B1 clears |
| WP4 | Shared typed commands + run lifecycle (G4) | WP3 | review | branch `wp4/commands` (stacked on `wp3/project-store`) | A04, A07, A08, A09, A10, A11; 68 unit/contract tests, mutation-checked | Push + PR when B1 clears. Editor Re-roll commits through the same commands |
| WP5 | Real assistant (MCP) integration (G5) | WP4 | review | `bridge/` + tab client on `wp4/commands` | A12 (Claude Code, real app), A13; bridge tests in CI | Push + PR when B1 clears |
| WP6 | Failure / recovery matrix (G6) | WP3–WP5 | review | — | A04, A06–A11 (each labelled real_execution / controlled_simulation / contract_test) | Remaining: A03 narration-edit run, A15 offline claim, A16 unsupported browser |
| WP7 | Repeatable demo + launch package | gates | queued | — | — | — |
| WP8 | Real tester feedback | outreach authorization | blocked (authorization) | — | — | — |

## PR #44 review note (to post when access returns)

The fix itself is right and verified: wrapping `safePosts` in `useMemo` and aliasing the
Lucide `Image` import clears exactly the three warnings from #29 (lint 11 → 8 warnings,
0 errors; `next build` and the 20 unit tests unaffected).

Two files in the PR are unrelated and should be dropped before merge:

1. `package-lock.json` at the repository root — a new, empty lockfile (the root has no
   `package.json`); it looks like an accidental `npm install` at the root.
2. `frontend/package-lock.json` — removes `"dev": true` from `fsevents`. That's npm-version
   churn, not part of the fix, and changes how the lockfile classifies the package.

Could you remove those two changes (`git rm package-lock.json && git checkout origin/main -- frontend/package-lock.json`,
commit, push)? Then this is ready to merge. Thank you for the clean fix.
