#!/usr/bin/env bash
# Injects branch + last commit + the golden rule at session start.
branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "?")
last=$(git log -1 --oneline 2>/dev/null || echo "no commits yet")
echo "Contentine Create — branch: ${branch} | last: ${last}"
echo "Rule: never commit secrets; never push to main directly; evidence before 'done' (see CLAUDE.md)."
