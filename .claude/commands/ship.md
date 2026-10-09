---
description: Lint, build, test, then open a PR (never pushes to main directly)
---
Run the full gate before proposing a merge:

1. `cd frontend && npm run lint && npm run build && npm test`
2. Backend: `cd backend && composer test` (and `php -l` on changed files)
3. Summarise what changed and why, with evidence (test output, screenshots of real renders).
4. Create a feature branch, commit, and open a pull request against `main`. Do **not** push to `main`.
