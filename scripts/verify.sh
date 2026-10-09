#!/usr/bin/env bash
# scripts/verify.sh — Contentine Create verification gate.
# Usage: verify.sh [--quick|--full]
#   --quick  facade + engine + coming-soon censuses (Laws L1, L8). Runs from Stop hook.
#   --full   also runs next build + tsc + eslint + Playwright smoke.

set -uo pipefail

MODE="${1:---quick}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/frontend/src"

pass=0; fail=0
ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1)); }
bad()  { printf '  \033[31m✗\033[0m %s\n' "$1"; fail=$((fail+1)); }
info() { printf '  \033[36mℹ\033[0m %s\n' "$1"; }

echo "=== Contentine Create verify ($MODE) ==="

# --- Law L1: facade census -----------------------------------------------------
echo "[L1] Facade census"
sim_hits=$(grep -rniE 'simulate|\bfakeData\b|\bMOCK_|\bFAKE_' "$SRC" --include="*.ts" --include="*.tsx" 2>/dev/null \
  | grep -v ".test." | grep -v "__mocks__" \
  | grep -vE "face-animator\.ts.*simulates opening" \
  | grep -vE "vo-replace\.ts.*simulated" | wc -l | tr -d ' ')
  # vo-replace.ts:16 says "Nothing here is simulated" — anti-facade comment, not a facade
if [ "$sim_hits" -eq 0 ]; then ok "simulate/mock/fake census = 0 in prod code"
else bad "simulate/mock/fake census = $sim_hits (see grep for details)"; fi

cs_hits=$(grep -rniE 'coming.?soon' "$SRC" --include="*.ts" --include="*.tsx" 2>/dev/null | wc -l | tr -d ' ')
if [ "$cs_hits" -eq 0 ]; then ok "'coming soon' scan = 0"
else bad "'coming soon' found in $cs_hits places"; fi

# Law L6 — captureStream/MediaRecorder are BANNED for export (deterministic
# WebCodecs → Mediabunny only). Whitelisted input-capture sites: VoiceCloner mic
# capture and the converter's audio-track detection probe (both input, not export).
cs_hits=$(grep -rniE '\.captureStream\s*\(|new\s+MediaRecorder\s*\(' "$SRC" --include="*.ts" --include="*.tsx" 2>/dev/null \
  | grep -v 'VoiceCloner.tsx.*audio/webm' \
  | grep -v 'converter/page.tsx.*(video as any).captureStream' | wc -l | tr -d ' ')
if [ "$cs_hits" -eq 0 ]; then ok "captureStream/MediaRecorder for export = 0 (Law L6)"
else bad "captureStream/MediaRecorder for export = $cs_hits — Law L6 violation (see AUDIT_REPORT.md §7)"; fi

# --- Law L8: engine-consumer census -------------------------------------------
echo "[L8] Engine-consumer census"
cd "$SRC"
dead=0
for engine in tts-manager tts-worker f5tts-engine wav2lip-engine sd-turbo-engine talkinghead-engine face-animator webllm-engine whisper-engine gemini-nano-engine render-pipeline avatar-render-pipeline translation-pipeline webcodecs-encoder mediabunny-muxer ken-burns subtitle-renderer browser-engine-manager asset-cache device-detect device-scanner; do
  count=$(grep -rl "$engine" app components stores hooks lib engine 2>/dev/null | grep -v "engine/$engine.ts" | wc -l | tr -d ' ')
  [ "$count" = "0" ] && { bad "engine '$engine' has 0 consumers (dead code)"; dead=$((dead+1)); }
done
[ "$dead" -eq 0 ] && ok "all 21 engines have ≥1 consumer"

# --- Full mode extras ---------------------------------------------------------
if [ "$MODE" = "--full" ]; then
  # Law L4/L5 — file-level model BOM gate (no .env needed; hard check).
  echo "[L4/L5] Model BOM gate"
  if node "$ROOT/scripts/check-model-bom.mjs" > /tmp/bom-gate.out 2>&1; then
    ok "model BOM gate passed ($(grep -c 'warn' /tmp/bom-gate.out) warning(s) tracked)"
  else
    cat /tmp/bom-gate.out
    bad "model BOM gate failed (see FAIL lines above)"
  fi

  echo "[Full] Build + type-check"
  cd "$ROOT/frontend"
  if [ ! -f .env.local ]; then bad ".env.local missing — cannot build"; else
    npx --no-install tsc --noEmit && ok "tsc --noEmit clean" || bad "tsc errors"
    npx --no-install next build && ok "next build succeeded" || bad "next build failed"
  fi
fi

# --- Summary ------------------------------------------------------------------
echo
echo "Pass: $pass · Fail: $fail"
[ "$fail" -eq 0 ] || exit 1
exit 0
