#!/bin/bash
set -euo pipefail

# Performance benchmark series — measures speedrun wall time across
# varying scenario counts and concurrency levels.
#
# Each run starts from a clean workspace to avoid stale artifact interference.
# Results written to: .tesseract/benchmark-results.csv

RESULTS_FILE=".tesseract/benchmark-results.csv"
mkdir -p .tesseract

echo "concurrency,count,iterations,seed,wall_seconds,exit_code" > "$RESULTS_FILE"

COUNTS=(8 30 50)
CONCURRENCIES=(1 2 4 0)  # 0 = auto-detect (no override)

clean_workspace() {
  rm -rf dogfood/scenarios/synthetic \
    .tesseract/bound .tesseract/tasks .tesseract/runs .tesseract/sessions \
    .tesseract/graph .tesseract/inbox .tesseract/learning .tesseract/benchmarks \
    .tesseract/interface dogfood/generated 2>/dev/null || true
  mkdir -p .tesseract/evidence .tesseract/bound .tesseract/tasks .tesseract/runs \
    .tesseract/sessions .tesseract/graph .tesseract/inbox .tesseract/learning \
    .tesseract/benchmarks .tesseract/interface
  # Restore canonical files that may have been corrupted by prior concurrent runs
  git checkout -- dogfood/.ado-sync/ dogfood/knowledge/ dogfood/controls/ \
    dogfood/scenarios/ dogfood/fixtures/ dogfood/benchmarks/ 2>/dev/null || true
}

for CONC in "${CONCURRENCIES[@]}"; do
  for COUNT in "${COUNTS[@]}"; do
    CONC_LABEL=$CONC
    if [ "$CONC" -eq 0 ]; then
      CONC_LABEL="auto"
      unset TESSERACT_CONCURRENCY 2>/dev/null || true
    else
      export TESSERACT_CONCURRENCY=$CONC
    fi

    SEED="bench-c${CONC_LABEL}-n${COUNT}"

    # Clean workspace between runs
    clean_workspace

    echo ""
    echo "════════════════════════════════════════════════════"
    echo "  BENCHMARK: concurrency=$CONC_LABEL  count=$COUNT  seed=$SEED"
    echo "════════════════════════════════════════════════════"

    START_TIME=$(date +%s%N)
    EXIT=0
    npx tsx scripts/speedrun.ts \
      --count "$COUNT" \
      --max-iterations 1 \
      --seed "$SEED" \
      --posture cold-start 2>&1 | tail -5 || EXIT=$?
    END_TIME=$(date +%s%N)

    # Compute milliseconds
    ELAPSED_MS=$(( (END_TIME - START_TIME) / 1000000 ))
    ELAPSED_S=$(echo "scale=1; $ELAPSED_MS / 1000" | bc)
    echo "$CONC_LABEL,$COUNT,1,$SEED,$ELAPSED_S,$EXIT" >> "$RESULTS_FILE"
    echo "  → ${ELAPSED_S}s (exit=$EXIT)"
  done
done

echo ""
echo "════════════════════════════════════════════════════"
echo "  BENCHMARK SERIES COMPLETE"
echo "════════════════════════════════════════════════════"
echo ""
echo "Results:"
echo "--------"
cat "$RESULTS_FILE"
