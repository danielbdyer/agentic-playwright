#!/bin/bash
set -euo pipefail

# Only run in remote (web) sessions
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# Install dependencies (npm install leverages cached node_modules)
npm install --prefer-offline --no-audit --no-fund

# Install Playwright browsers (needed for test suite)
npx playwright install chromium 2>/dev/null || true

# Ensure .tesseract runtime directories exist (test workspace seeds require them)
mkdir -p .tesseract/evidence .tesseract/bound .tesseract/tasks .tesseract/runs \
         .tesseract/sessions .tesseract/graph .tesseract/inbox .tesseract/learning \
         .tesseract/benchmarks .tesseract/interface

# Build the project (includes bootstrap stub for generated types)
npm run build
