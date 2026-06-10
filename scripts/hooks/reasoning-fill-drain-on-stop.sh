#!/usr/bin/env bash
# Stop trigger (Z11d.e, plan §7.3) — invariant: never end a turn with
# unfilled prompts. Exit 2 blocks turn-end with guidance on stderr.
# Loop guard: when stop_hook_active is set in the hook input, a prior
# block is already being handled — exit 0 instead of re-blocking.
# Kill switch: TESSERACT_REASONING_AUTOFILL=off.
set -euo pipefail

if [ "${TESSERACT_REASONING_AUTOFILL:-on}" = "off" ]; then
  exit 0
fi

input=$(cat 2>/dev/null || true)
case "$input" in
  *'"stop_hook_active":true'* | *'"stop_hook_active": true'*)
    exit 0
    ;;
esac

POOL="${TESSERACT_REASONING_POOL:-${CLAUDE_PROJECT_DIR:-.}/.tesseract/reasoning-pool}"
PENDING_DIR="$POOL/pending"

count=$( (find "$PENDING_DIR" -maxdepth 1 -name '*.json' ! -name '.tmp-*' 2>/dev/null || true) | wc -l | tr -d ' ')

if [ "$count" -gt 0 ]; then
  echo "reasoning-pool has $count unfilled request(s) under $PENDING_DIR. Run the reasoning-fill skill (author fills, then: npx tsx scripts/reasoning-fill.ts validate) before ending the turn." >&2
  exit 2
fi
exit 0
