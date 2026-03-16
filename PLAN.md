# FP Refactor Targets — Ranked by Need/Benefit

## Ranking Criteria
- **Purity gain**: Does this eliminate parameter mutation or mutable state?
- **Readability gain**: Does this make intent clearer vs. hiding it in push/let patterns?
- **Blast radius**: How many files/tests change? Lower = better ROI per change.
- **Bug surface**: Does the imperative version risk subtle mutation bugs?

---

## Tier 1 — High value, surgical scope

### R1. `interpretProgram` → pure fold with early exit
**File**: `lib/runtime/interpreters/evaluator.ts:45-88`
**Pattern**: `for (let i = ...)` with `outcomes.push()` and early `return` on failure.
**Fix**: Replace with `reduceWhile` / recursive fold that accumulates outcomes and short-circuits on failure. The function becomes a pure transformation: `instructions → Result<outcomes, failure>`.
**Benefit**: This is the user-called-out poster child. A program interpreter should be a fold, not a loop.

### R2. `traceStepProgram` → flatMap + reduce
**File**: `lib/domain/program.ts:124-159`
**Pattern**: `let hasEscapeHatch = false` + three arrays with `.push()` in a `for...of` loop.
**Fix**: Single `reduce` over `program.instructions` that accumulates `{ screens, elements, snapshotTemplates, hasEscapeHatch }` immutably.
**Benefit**: Pure domain function with no reason to be imperative.

### R3. `evaluateExecutionBudget` → filter/map breach detection
**File**: `lib/domain/execution/telemetry.ts:63-77`
**Pattern**: `const breaches: string[] = []; if (...) breaches.push(...)` repeated 9 times.
**Fix**: Define threshold checks as a data array of `{ field, check }` entries, then `filter(check).map(field)`.
**Benefit**: Eliminates 9 conditional pushes with a single declarative pipeline. Pure domain function.

### R4. `captureStageEvents` → slice + map
**File**: `lib/runtime/agent/index.ts:178-185`
**Pattern**: `for (let i = before; i < arr.length; i++) events.push(...)` — indexed loop.
**Fix**: `stage.exhaustion.slice(before).map(entry => ({ kind: 'exhaustion-recorded', entry }))`.
**Benefit**: Trivial fix, removes the last indexed `for` loop we introduced in Slice 10.

### R5. `capabilityReasons` → flatMap
**File**: `lib/domain/binding.ts:43-73`
**Pattern**: `const reasons = []; for (...) { if (...) reasons.push(...); continue; }` loop.
**Fix**: `program.instructions.flatMap(instruction => ...)` returning arrays per instruction.
**Benefit**: Pure domain function, no reason for mutation.

### R6. `bindScenarioStep` reasons → declarative accumulation
**File**: `lib/domain/binding.ts:97-203`
**Pattern**: `const reasons: StepBindingReason[] = []; ... reasons.push(...)` with 8 conditional pushes.
**Fix**: Build reasons as `[...condA ? ['reason-a'] : [], ...condB ? ['reason-b'] : []]` or use a validation combinator.
**Benefit**: The binding function is a critical domain function. Making it declarative makes the validation rules self-documenting.

---

## Tier 2 — Medium value, moderate scope

### R7. `surfaceOperations` → flatMap with immutable seen tracking
**File**: `lib/domain/grammar.ts:41-77`
**Pattern**: `const operations = []; if (...) operations.push(...); for (...) operations.push(...)`.
**Fix**: Accumulate via spread/concat. The `seen` Set mutation is trickier (recursive graph traversal) but can use passed-through immutable sets.
**Benefit**: Moderate — recursive traversal makes full purity harder, but the array accumulation is easy.

### R8. `deriveCapabilities` → flatMap over entries
**File**: `lib/domain/grammar.ts:79-129`
**Pattern**: `const capabilities = [...]; for (...) capabilities.push(...)` nested loop.
**Fix**: `Object.entries(surfaceGraph.surfaces).flatMap(([surfaceKey, surface]) => [...surfaceCapability, ...surface.elements.flatMap(...)])`.
**Benefit**: Clean domain function, moderate readability gain.

### R9. Resolution stage mutations → return collected effects
**File**: `lib/runtime/agent/resolution-stages.ts:146-150, 208-285`
**Pattern**: `stage.observations.push(...)`, `stage.exhaustion` mutations, `acc.overlayResult = ...`.
**Fix**: Each `try*` function returns `{ receipt, exhaustion, observations, refs }` instead of mutating stage. The pipeline assembles the result. This is the deeper version of what Slice 10 started.
**Benefit**: High purity gain but larger blast radius — touches 4 functions and the pipeline. Builds on the event sourcing infrastructure.

### R10. `runResolutionPipeline` event accumulation → immutable spread
**File**: `lib/runtime/agent/index.ts:245-288`
**Pattern**: `const allEvents = []; ... allEvents.push(...events)` repeated 5 times.
**Fix**: Build events as `[...controlEvents, ...earlyResult.events, ...latticeEvents, ...result.events, ...]` at the end.
**Benefit**: Easy fix, completes the Slice 10 purity story.

---

## Tier 3 — Lower priority or higher risk

### R11. Module-level `let activeCapacity` → context injection
**File**: `lib/runtime/agent/index.ts:45`
**Pattern**: Module-level `let` binding mutated by `setMemoryCapacity`/`resetMemoryCapacity`.
**Fix**: Thread capacity through function parameters or use an Effect service tag. Eliminates global mutable state.
**Benefit**: Important for testability and purity, but requires changing `normalizeObservedStateSession` and `deriveObservedStateSessionAfterResolution` signatures, plus all callers of `runResolutionPipeline`.

### R12. `workspace-catalog.ts` Effect loops → `Effect.forEach`
**File**: `lib/application/catalog/workspace-catalog.ts` (30+ locations)
**Pattern**: `const arr = []; for (...) arr.push(yield* readArtifact(...))`.
**Fix**: Use `Effect.forEach(files, (f) => readArtifact(f), { concurrency: 1 })` or similar.
**Benefit**: Large purity gain, but 30+ loops to convert. High blast radius. Better as a dedicated session.

### R13. `operator.ts` string building → template composition
**File**: `lib/application/operator.ts:77-344`
**Pattern**: `const lines = []; lines.push(...)` repeated 50+ times.
**Fix**: Use template literals or a builder combinator. Lower priority because this is a rendering/projection function, not core domain logic.

---

## Execution Plan

**Batch A** (Tier 1, R1-R6): Pure domain and interpreter functions. Surgical, zero-risk. Do these first.

**Batch B** (Tier 2, R7-R10): Grammar, capabilities, and pipeline immutability. Moderate scope.

**Batch C** (Tier 3, R11-R13): Global state elimination and infrastructure. Larger scope, separate session recommended for R12.
