#!/usr/bin/env bash
# PostToolUse trigger (Z11d.e, plan §7.2) — opportunistic reminder.
# Emits additionalContext when the reasoning-pool backlog reaches the
# threshold (default 3). Kill switch: TESSERACT_REASONING_AUTOFILL=off.
set -euo pipefail

if [ "${TESSERACT_REASONING_AUTOFILL:-on}" = "off" ]; then
  exit 0
fi

POOL="${TESSERACT_REASONING_POOL:-${CLAUDE_PROJECT_DIR:-.}/.tesseract/reasoning-pool}"
PENDING_DIR="$POOL/pending"
THRESHOLD="${TESSERACT_REASONING_FILL_THRESHOLD:-3}"

count=$( (find "$PENDING_DIR" -maxdepth 1 -name '*.json' ! -name '.tmp-*' 2>/dev/null || true) | wc -l | tr -d ' ')

if [ "$count" -ge "$THRESHOLD" ]; then
  printf '{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"reasoning-pool: %s pending fill request(s). Invoke the reasoning-fill skill at the next turn boundary (survey: npx tsx scripts/reasoning-fill.ts list)."}}\n' "$count"
fi
exit 0
