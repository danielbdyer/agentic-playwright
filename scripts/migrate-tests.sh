#!/bin/bash
# Automated test reorganization by domain primitive
# Phase 4 of domain-class-decomposition.md

set -e

# Create target directories
mkdir -p tests/{intent,target,knowledge,resolution,commitment,evidence,governance,proposal,fitness,convergence,improvement,drift,graph,projection,integration,architecture,dashboard,learning,agency,observation}

# === intent/ ===
for f in ado-source-contract ado-adapter-fixture.laws intent-decomposition scenario-loading-envelope.laws inference phase5-intent-only.laws phase5-intent-interpretation.laws; do
  [ -f "tests/$f.spec.ts" ] && git mv "tests/$f.spec.ts" "tests/intent/"
done

# === target/ ===
for f in state-topology state-topology-phase2 cross-screen-transition.laws discovery; do
  [ -f "tests/$f.spec.ts" ] && git mv "tests/$f.spec.ts" "tests/target/"
done

# === knowledge/ ===
for f in knowledge-promotion.laws supplement-hierarchy.laws knowledge-posture.laws knowledge-dependency-index.laws contradiction-detector.laws semantic-translation-dictionary.laws; do
  [ -f "tests/$f.spec.ts" ] && git mv "tests/$f.spec.ts" "tests/knowledge/"
done

# === resolution/ ===
for f in resolution-engine-contract precedence.laws precedence-policy.laws controls binding-roundtrip.laws runtime-agent-pipeline runtime-agent-lattice.laws dom-snapshot-population.laws translation-cache.laws translation-cache-amortized.laws phase5-translation-provider.laws rung8-llm-dom.laws strategy-registry.laws vision-augmented-resolution.laws mcp-internal-bridge.laws; do
  [ -f "tests/$f.spec.ts" ] && git mv "tests/$f.spec.ts" "tests/resolution/"
done

# === commitment/ ===
for f in execution-stages execution-planner.laws deferred-step-rendering.laws resilience-retry.laws runtime-errors playwright-execution playwright-optimizations.perf execution-context-fiberref runtime-load spec-runtime-parity.laws; do
  [ -f "tests/$f.spec.ts" ] && git mv "tests/$f.spec.ts" "tests/commitment/"
done

# === evidence/ ===
for f in execution-coherence.laws; do
  [ -f "tests/$f.spec.ts" ] && git mv "tests/$f.spec.ts" "tests/evidence/"
done

# === governance/ ===
for f in governance-approval.type-test governance-intelligence.laws governance-lattice.laws auto-approval-policy.laws phase5-auto-approval.laws active-canon trust-policy.laws; do
  [ -f "tests/$f.spec.ts" ] && git mv "tests/$f.spec.ts" "tests/governance/" 2>/dev/null
  [ -f "tests/$f.ts" ] && git mv "tests/$f.ts" "tests/governance/" 2>/dev/null
done

# === proposal/ ===
for f in batch-decision.laws proposal-intelligence.laws discovery-proposal-bridge.laws phase5-interpretation-proposals.laws; do
  [ -f "tests/$f.spec.ts" ] && git mv "tests/$f.spec.ts" "tests/proposal/"
done

# === fitness/ ===
for f in pipeline-fitness.laws architecture-fitness.laws; do
  [ -f "tests/$f.spec.ts" ] && git mv "tests/$f.spec.ts" "tests/fitness/"
done

# === convergence/ ===
for f in convergence-arrow.laws convergence-bounds.laws convergence-finale.laws convergence-finale-spatial.laws convergence-fsm.laws; do
  [ -f "tests/$f.spec.ts" ] && git mv "tests/$f.spec.ts" "tests/convergence/"
done

# === improvement/ ===
for f in compiler-dogfood improvement-intelligence.laws improvement-spine benchmark-improvement benchmark-runbook-selection speedrun-statistics.laws dogfood-orchestrator.laws hotspots experiment-registry-compat strategic-intelligence.laws bottleneck-calibration.laws knob-search.laws; do
  [ -f "tests/$f.spec.ts" ] && git mv "tests/$f.spec.ts" "tests/improvement/"
done

# === learning/ ===
for f in learning-state.laws phase6-learning-invariants.laws signal-maturation.laws learning-rankings.laws learning-health.laws; do
  [ -f "tests/$f.spec.ts" ] && git mv "tests/$f.spec.ts" "tests/learning/"
done

# === drift/ ===
for f in rung-drift.laws selector-health.laws timing-baseline.laws execution-cost.laws recovery-effectiveness.laws console-intelligence.laws interpretation-coherence.laws; do
  [ -f "tests/$f.spec.ts" ] && git mv "tests/$f.spec.ts" "tests/drift/"
done

# === graph/ ===
for f in graph-query graph-topology.laws; do
  [ -f "tests/$f.spec.ts" ] && git mv "tests/$f.spec.ts" "tests/graph/"
done

# === projection/ ===
for f in readable-emission.laws act-indicator.laws binding-distribution.laws component-maturation.laws speedrun-statistics.laws scene-state-accumulator.laws surface-overlay.laws; do
  [ -f "tests/$f.spec.ts" ] && git mv "tests/$f.spec.ts" "tests/projection/" 2>/dev/null
done

# === integration/ ===
for f in agentic-loop.integration compiler-pipeline compiler-intelligence end-to-end-pipeline compiler-harvest compiler-harvest-idempotence rerun-plan reporter; do
  [ -f "tests/$f.spec.ts" ] && git mv "tests/$f.spec.ts" "tests/integration/"
done

# === architecture/ ===
for f in architecture architecture-fitness.laws domain-type-barrels domain-types-exports-stability catamorphism-fusion.laws galois-connection.laws design-calculus-abstractions.laws design-calculus-dualities.laws simplex-invariant.laws; do
  [ -f "tests/$f.spec.ts" ] && git mv "tests/$f.spec.ts" "tests/architecture/" 2>/dev/null
done

# === dashboard/ ===
for f in dashboard-event-observer.laws dashboard-event-taxonomy.laws dashboard-overlay-geometry.laws dashboard-projection.laws dashboard-workbench-grouping.laws degradation-controller.laws flywheel-acts.laws flywheel-degradation.laws flywheel-particle.laws flywheel-playback.laws flywheel-transitions.laws narration-queue.laws bookmark-chip.laws pipeline-buffer-window.laws; do
  [ -f "tests/$f.spec.ts" ] && git mv "tests/$f.spec.ts" "tests/dashboard/"
done

# === agency/ ===
for f in agent-workbench.laws agent-ab-testing.laws agent-interpretation-cache.laws agent-resource-lifecycle agent-context cache-pruning.laws operator-workbench intervention-kernel.laws escalation-policy.laws; do
  [ -f "tests/$f.spec.ts" ] && git mv "tests/$f.spec.ts" "tests/agency/"
done

# === observation/ ===
for f in aria-snapshot-cache.laws semantic-dict-cache.laws; do
  [ -f "tests/$f.spec.ts" ] && git mv "tests/$f.spec.ts" "tests/observation/"
done

# === Remaining (kernel, infrastructure, misc) ===
for f in collections.laws docs provenance posture-contract.laws visitors.laws application-option-either-guards before-after-comparison.laws coverage-probability.laws hardening-invariants.laws pipeline-config.laws pipeline-config-invariants.laws; do
  [ -f "tests/$f.spec.ts" ] && git mv "tests/$f.spec.ts" "tests/architecture/" 2>/dev/null
done

# Browser/infra tests
for f in browser-options browser-pool.laws ws-dashboard-adapter local-runtime-scenario-runner.effects fixture-extractor.laws; do
  [ -f "tests/$f.spec.ts" ] && git mv "tests/$f.spec.ts" "tests/integration/" 2>/dev/null
done

# Remaining misc
for f in cli cli-registry-decomposition.laws console-sentinel.laws phase5-dogfood-invariants.laws; do
  [ -f "tests/$f.spec.ts" ] && git mv "tests/$f.spec.ts" "tests/integration/" 2>/dev/null
done

echo "Test migration complete"
echo "Remaining flat tests:"
ls tests/*.spec.ts tests/*.type-test.ts 2>/dev/null | wc -l
