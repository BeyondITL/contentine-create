#!/usr/bin/env bash
# Stop: anti-garbage gate. Opt-in — inert until you run: touch .claude/verify-on-stop
[ -f .claude/verify-on-stop ] || exit 0
fail=0
if [ -f frontend/package.json ]; then (cd frontend && npm run -s lint >/dev/null 2>&1) || fail=1; fi
if [ "$fail" = "1" ]; then echo '{"decision":"block","reason":"Lint/tests failing — resolve before ending the turn."}'; exit 2; fi
exit 0
