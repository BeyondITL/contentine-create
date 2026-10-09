#!/usr/bin/env bash
# PreToolUse anti-facade blocker (Law L1).
# Reads the tool-invocation JSON on stdin; on a Write/Edit whose new content
# matches a banned pattern in a production path, exits 2 to block the tool call.
#
# Banned patterns (regex): setTimeout used to simulate work; simulate*() calls;
# `mock`/`FAKE` identifiers in production paths; captureStream/MediaRecorder
# used for export (Law L6).
#
# Whitelist paths: tests, node_modules, .next/, out/, docs.

set -euo pipefail

payload=$(cat)
tool=$(printf '%s' "$payload" | jq -r '.tool_name // .tool // ""' 2>/dev/null || echo "")
target=$(printf '%s' "$payload" | jq -r '.tool_input.file_path // .file_path // ""' 2>/dev/null || echo "")
newtext=$(printf '%s' "$payload" | jq -r '.tool_input.new_string // .tool_input.content // ""' 2>/dev/null || echo "")

# Fast-exit if we can't determine intent.
[ -z "$target" ] && exit 0
[ -z "$newtext" ] && exit 0

# Whitelist paths.
case "$target" in
  */node_modules/*|*/.next/*|*/out/*|*/docs/*|*.test.ts|*.test.tsx|*/tests/*|*/__mocks__/*|*/scripts/hooks/*|*/AUDIT_REPORT.md|*/PREFLIGHT_FIXES.md|*/HANDOVER_FOR_NEXT_CHAT.md|*/SESSION_HANDOVER_FROM_COWORK.md|*/BROWSER_NATIVE_STACK_2026.md|*/CREATE_ONESHOT_v1.1.md|*/COWORK_BRIEF.md|*/CLAUDE.md|*/LICENSES.md)
    exit 0
    ;;
esac

# Only enforce on production TS/TSX/PHP.
case "$target" in
  *frontend/src/*.ts|*frontend/src/*.tsx|*backend/src/*.php) : ;;
  *) exit 0 ;;
esac

fail() {
  # Blocking exit code 2 surfaces stderr to the model per Claude Code hook contract.
  printf 'anti-facade hook: %s\n  file: %s\n  See CLAUDE.md Law L1/L6 and .claude/skills/pipeline-wiring.md\n' "$1" "$target" >&2
  exit 2
}

# 1. setTimeout-as-progress: setTimeout with any numeric arg AND a nearby "progress" / "loading" / "fake" identifier.
if printf '%s' "$newtext" | grep -qE 'setTimeout\s*\(' \
   && printf '%s' "$newtext" | grep -qE '(setProgress|setLoading|setPercent|fakeData|simulate)'; then
  fail "setTimeout paired with progress/loading state — real engine call required"
fi

# 2. simulate*() call sites.
if printf '%s' "$newtext" | grep -qE '\bsimulate[A-Z][A-Za-z0-9_]*\s*\('; then
  fail "simulate*() call — Law L1 forbids simulated work in production"
fi

# 3. mock/FAKE identifiers in production paths.
if printf '%s' "$newtext" | grep -qE '\b(mockData|MOCK_|FAKE_|fakeResponse|hardcodedResponse)\b'; then
  fail "mock/FAKE identifier in production code — replace with real API/engine call"
fi

# 4. captureStream/MediaRecorder for export (Law L6).
if printf '%s' "$newtext" | grep -qE '(captureStream\s*\(|new\s+MediaRecorder\s*\()'; then
  fail "captureStream/MediaRecorder banned for export (Law L6). Use OffscreenCanvas → WebCodecs → Mediabunny."
fi

exit 0
