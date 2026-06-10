#!/usr/bin/env bash
# UserPromptSubmit trigger (Z11d.e, plan §7.4) — low-friction nudge.
# Stdout on exit 0 is injected as context for the turn.
# Kill switch: TESSERACT_REASONING_AUTOFILL=off.
set -euo pipefail

if [ "${TESSERACT_REASONING_AUTOFILL:-on}" = "off" ]; then
  exit 0
fi

POOL="${TESSERACT_REASONING_POOL:-${CLAUDE_PROJECT_DIR:-.}/.tesseract/reasoning-pool}"
PENDING_DIR="$POOL/pending"

count=$( (find "$PENDING_DIR" -maxdepth 1 -name '*.json' ! -name '.tmp-*' 2>/dev/null || true) | wc -l | tr -d ' ')

if [ "$count" -gt 0 ]; then
  echo "reasoning-pool: $count pending fill request(s) await a fill pass; consider invoking the reasoning-fill skill this turn."
fi
exit 0
