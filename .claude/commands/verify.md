---
description: Full verification pass — build, tests, facade + engine census, model E2E status
---

Run the full verification battery and report a one-screen summary:

1. `bash scripts/verify.sh` (full, not --quick).
2. Facade census: spawn the `facade-hunter` agent for a fresh sweep; also grep
   `backend/src` for `not yet implemented`, `TODO`, `random_int(` in controllers/services
   (the server-side facade classes the hook can't see — SA-01, SA-02).
3. Engine census: every engine in `frontend/src/engine` has ≥1 consumer (Law L8/D-37).
4. Deploy blocker: run `node scripts/e2e-model-download-p0.mjs` and state READY/RED.
5. TypeScript: `npx tsc --noEmit`.

Report: pass/fail per line, facade count (must be 0), dead engines (must be 0),
deploy-blocker status, and the diff of failures vs the last run recorded in
`memory/team/verification-norms.md` context. Do not fix anything in this command —
report only; fixes are tasks for the owning workstream.
