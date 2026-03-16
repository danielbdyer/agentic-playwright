# FP Refactor Targets — Ranked by Need/Benefit

## Status: Complete

All actionable targets have been implemented. R13 was evaluated and found to already use appropriate patterns (immutable array + `.join()`).

## Ranking Criteria
- **Purity gain**: Does this eliminate parameter mutation or mutable state?
- **Readability gain**: Does this make intent clearer vs. hiding it in push/let patterns?
- **Blast radius**: How many files/tests change? Lower = better ROI per change.
- **Bug surface**: Does the imperative version risk subtle mutation bugs?

---

## Tier 1 — High value, surgical scope ✓

### R1. `interpretProgram` → pure fold with early exit ✓
**File**: `lib/runtime/interpreters/evaluator.ts`
**Change**: Replaced `for(let i)` loop with pure recursive `foldInstructions` function.

### R2. `traceStepProgram` → flatMap + reduce ✓
**File**: `lib/domain/program.ts`
**Change**: Single `reduce` over instructions accumulating `{ screens, elements, snapshotTemplates, hasEscapeHatch }` immutably.

### R3. `evaluateExecutionBudget` → filter/map breach detection ✓
**File**: `lib/domain/execution/telemetry.ts`
**Change**: Data-driven `budgetChecks` array + `filter().map()` replacing 9 conditional pushes.

### R4. `captureStageEvents` → slice + map ✓
**File**: `lib/runtime/agent/index.ts`
**Change**: Removed indexed `for` loop, now uses `slice().map()`.

### R5. `capabilityReasons` → flatMap ✓
**File**: `lib/domain/binding.ts`
**Change**: `program.instructions.flatMap(...)` replacing push loop.

### R6. `bindScenarioStep` reasons → declarative accumulation ✓
**File**: `lib/domain/binding.ts`
**Change**: Declarative spread per concern category.

---

## Tier 2 — Medium value, moderate scope ✓

### R7. `surfaceOperations` → flatMap with immutable seen tracking ✓
**File**: `lib/domain/grammar.ts`
**Change**: `ReadonlySet<SurfaceId>` threading, `flatMap` for element/child ops.

### R8. `deriveCapabilities` → flatMap over entries ✓
**File**: `lib/domain/grammar.ts`
**Change**: `Object.entries().flatMap()` replacing nested for loops.

### R9. Resolution stage mutations → return collected effects ✓
**File**: `lib/runtime/agent/resolution-stages.ts`, `receipt.ts`, `types.ts`
**Change**: All stages return `StageEffects` bundles. `mergeEffectsIntoStage` is the single localized mutation point. Receipt builders accept `pendingEffects` parameter.

### R10. `runResolutionPipeline` event accumulation → immutable spread ✓
**File**: `lib/runtime/agent/index.ts`
**Change**: Eliminated mutable `allEvents` array, now uses immutable spread composition.

---

## Tier 3 — Lower priority or higher risk ✓

### R11. Module-level `let activeCapacity` → parameter injection ✓
**File**: `lib/runtime/agent/index.ts`
**Change**: Removed `let activeCapacity`, `setMemoryCapacity()`, `resetMemoryCapacity()`. Added `capacity: MemoryCapacity = DEFAULT_MEMORY_CAPACITY` parameter to `runResolutionPipeline`.

### R12. `workspace-catalog.ts` Effect loops → `Effect.forEach` ✓
**Files**: `lib/application/catalog/workspace-catalog.ts`, `activate-proposals.ts`, `persist-evidence.ts`, `graph.ts`, `replay-interpretation.ts`
**Change**: Extracted `loadAllYaml`/`loadAllJson`/`loadAllDisposableJson` helpers. Converted 25+ `for-of` loops to `Effect.forEach` calls. Net -227 lines.

### R13. `operator.ts` string building → template composition — N/A
**Finding**: Already uses appropriate immutable array + `.join()` patterns. No refactoring needed.

---

## Summary

| Metric | Value |
|--------|-------|
| Targets completed | 12/13 |
| Targets skipped (already clean) | 1/13 |
| Net lines removed | ~260+ |
| Test regressions | 0 |
