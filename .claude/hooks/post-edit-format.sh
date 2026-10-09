#!/usr/bin/env bash
# PostToolUse(Write|Edit): lint/typecheck the edited area. No-ops when toolchain is absent.
payload=$(cat); file=$(printf '%s' "$payload" | sed -n 's/.*"file_path":"\([^"]*\)".*/\1/p')
case "$file" in
  *frontend/*.ts|*frontend/*.tsx|*frontend/*.js|*frontend/*.jsx)
    if [ -f frontend/package.json ]; then (cd frontend && npm run -s lint >/dev/null 2>&1) || echo "lint: issues in frontend (run 'cd frontend && npm run lint')"; fi ;;
  *backend/*.php)
    command -v php >/dev/null 2>&1 && { php -l "$file" >/dev/null 2>&1 || echo "php -l failed: $file"; } ;;
esac
exit 0
