#!/usr/bin/env bash
# PreToolUse(Bash): run tests before anything that looks like a deploy. Adjust the pattern to your deploy command.
payload=$(cat); cmd=$(printf '%s' "$payload" | sed -n 's/.*"command":"\([^"]*\)".*/\1/p')
if printf '%s' "$cmd" | grep -qiE 'rsync|deploy|--prod|vercel|netlify|fly deploy'; then
  if [ -f frontend/package.json ]; then
    (cd frontend && npm test --silent) || { echo '{"decision":"block","reason":"Frontend tests failed — fix before deploying."}'; exit 2; }
  fi
fi
exit 0
