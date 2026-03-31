# FP & Architecture Execution Plan

Ten structural upgrades to make the codebase a lean, functional, architecturally-sound system. Ordered by dependency — each slice unblocks the next.

---

## Slice 1: Delete Compat Adapter

**Goal**: Eliminate parallel truth. `ScenarioInterpretationSurface` is the only representation.

**Files to modify** (9 consumers + adapter + catalog type):
- `lib/application/catalog/workspace-catalog.ts` — stop converting surfaces to taskPackets; remove taskPackets array construction; remove fallback taskPacket loading
- `lib/application/catalog/types.ts` — remove `taskPackets` field from `WorkspaceCatalog`
- `lib/application/emit.ts` — replace `catalog.taskPackets.find(...)` with `catalog.interpretationSurfaces.find(...)`
- `lib/application/inspect.ts` — replace `catalog.taskPackets` access with `catalog.interpretationSurfaces`
- `lib/application/replay-interpretation.ts` — remove `taskPacketFromSurface` import; use surface directly
- `lib/application/task.ts` — remove `taskPacketFromSurface` import; return surface directly from `buildTaskPacket` (rename to `buildInterpretationSurface`)
- `lib/application/rerun-plan.ts` — replace `catalog.taskPackets` iteration with `catalog.interpretationSurfaces`
- `lib/application/workflow.ts` — replace `catalog.taskPackets.find(...)` with `catalog.interpretationSurfaces.find(...)`
- `lib/application/graph.ts` — replace `catalog.taskPackets.map(...)` with `catalog.interpretationSurfaces.map(...)`
- `lib/domain/derived-graph.ts` — replace `TaskPacketGraphArtifact` with `InterpretationSurfaceGraphArtifact`
- **Delete** `lib/application/compat/surface-adapter.ts`
- **Delete** `lib/application/compat/` directory if empty

**Key rename**: `taskPacket` → `surface` throughout variable names. `buildTaskPacket` → `buildInterpretationSurface`. `taskPath` → `surfacePath`.

**Test impact**: Update any test that references `taskPackets` or `ScenarioTaskPacket` version checks.

**Verification**: `npm test` — all 161 tests pass.

---

## Slice 2: Typed Error Discriminated Union

**Goal**: Replace single `TesseractError` with a tagged union so Effect's error channel carries type information.

**New error types** (in `lib/domain/errors.ts`):
```typescript
type TesseractError =
  | SchemaError        // _tag: 'SchemaError' — validation failures
  | FileSystemError    // _tag: 'FileSystemError' — I/O read/write
  | ResolutionError    // _tag: 'ResolutionError' — runtime resolution failures
  | RuntimeError       // _tag: 'RuntimeError' — execution failures
  | PipelineError      // _tag: 'PipelineError' — orchestration failures
```

Each carries a `_tag` discriminant for `Effect.catchTag`.

**Files to modify**:
- `lib/domain/errors.ts` — add `_tag` field to each error class; add `Data.TaggedEnum` style or simple `readonly _tag` property
- `lib/application/effect.ts` — `trySync`/`tryAsync` produce `FileSystemError` for FS ops
- `lib/infrastructure/fs/local-fs.ts` — return `FileSystemError` instead of generic `TesseractError`
- `lib/runtime/interpreters/diagnostic.ts` — classify returns typed errors
- `bin/tesseract.ts` — update CLI error rendering to handle `_tag`

**Backward compat**: `TesseractError` becomes the union type. `instanceof` checks at CLI boundary still work because each variant extends `Error`.

**Verification**: `npm test` — type-check passes, all tests pass.

---

## Slice 3: Strategy Chain for Resolution Pipeline

**Goal**: Make the resolution precedence law structurally enforce execution order.

**New file**: `lib/runtime/agent/strategy.ts`
```typescript
interface ResolutionStrategy {
  readonly rung: ResolutionPrecedenceRung;
  readonly name: string;
  attempt(stage: RuntimeAgentStageContext, acc: ResolutionAccumulator): Promise<ResolutionReceipt | null>;
}
```

**Strategy registry**: Maps each rung in `resolutionPrecedenceLaw` to a strategy implementation.

**Files to modify**:
- `lib/runtime/agent/index.ts` — replace if-else chain in `runResolutionPipeline` with strategy chain loop
- `lib/runtime/agent/resolution-stages.ts` — wrap each `try*` function as a `ResolutionStrategy`
- `lib/runtime/agent/strategy.ts` — new file with interface + registry + chain executor

**The lattice accumulator**: `buildLatticeAccumulator` runs once before the strategy chain. Strategies after explicit resolution receive the accumulator.

**Disabling strategies**: Strategies can be filtered by runtime context (e.g., translation disabled → filter out `structured-translation` strategy).

**Verification**: Resolution law tests still pass. Full test suite passes.

---

## Slice 4: Split WorkspaceCatalog into Focused Read Models

**Goal**: Each pipeline stage receives only the catalog slice it needs.

**New file**: `lib/application/catalog/read-models.ts`
```typescript
interface ResolutionReadModel {
  screens: ArtifactEnvelope<ScreenElements>[];
  hints: ArtifactEnvelope<ScreenHints>[];
  patterns: ArtifactEnvelope<PatternDocument>[];
  confidenceOverlays: ArtifactConfidenceRecord[];
  evidenceRecords: ArtifactEnvelope<EvidenceRecord>[];
}

interface ControlReadModel {
  runbooks: ArtifactEnvelope<RunbookControl>[];
  datasets: ArtifactEnvelope<DatasetControl>[];
  resolutionControls: ArtifactEnvelope<ResolutionControl>[];
}

interface ProposalReadModel extends ControlReadModel {
  trustPolicy: ArtifactEnvelope<TrustPolicy>;
  evidenceRecords: ArtifactEnvelope<EvidenceRecord>[];
}

interface EmissionReadModel {
  scenarios: ArtifactEnvelope<Scenario>[];
  boundScenarios: ArtifactEnvelope<BoundScenario>[];
  interpretationSurfaces: ArtifactEnvelope<ScenarioInterpretationSurface>[];
  interfaceGraph: ArtifactEnvelope<ApplicationInterfaceGraph> | null;
  selectorCanon: ArtifactEnvelope<SelectorCanon> | null;
  stateGraph: ArtifactEnvelope<StateTransitionGraph> | null;
}
```

**Projection functions**: `toResolutionReadModel(catalog)`, `toControlReadModel(catalog)`, etc.

**Files to modify**:
- `lib/application/catalog/read-models.ts` — new file
- `lib/application/execution/build-proposals.ts` — take `ProposalReadModel` instead of `WorkspaceCatalog`
- `lib/application/execution/select-run-context.ts` — take focused read models
- `lib/application/inspect.ts` — take relevant read model
- `lib/application/rerun-plan.ts` — take relevant read model

**WorkspaceCatalog stays**: It remains the full loaded catalog. Read models are projections from it. Callers at the pipeline level project before passing to stage functions.

**Verification**: All tests pass. Test mocks become smaller and self-documenting.

---

## Slice 5: Interpreter Pattern for StepProgram

**Goal**: Single traversal engine, pluggable evaluators per instruction kind.

**New file**: `lib/runtime/interpreters/evaluator.ts`
```typescript
interface InstructionEvaluator<TEnv> {
  navigate(env: TEnv, instruction: NavigateInstruction): Promise<InstructionOutcome>;
  enter(env: TEnv, instruction: EnterInstruction): Promise<InstructionOutcome>;
  invoke(env: TEnv, instruction: InvokeInstruction): Promise<InstructionOutcome>;
  observeStructure(env: TEnv, instruction: ObserveStructureInstruction): Promise<InstructionOutcome>;
  escapeHatch(env: TEnv, instruction: EscapeHatchInstruction): Promise<InstructionOutcome>;
}

function interpretProgram<TEnv>(
  program: StepProgram,
  env: TEnv,
  evaluator: InstructionEvaluator<TEnv>,
  mode: string,
  context?: StepProgramDiagnosticContext,
): Promise<StepProgramExecutionResult>
```

**Files to modify**:
- `lib/runtime/interpreters/evaluator.ts` — new file with shared traversal
- `lib/runtime/program.ts` — extract `PlaywrightEvaluator` implementing `InstructionEvaluator<PlaywrightEnvironment>`
- `lib/runtime/interpreters/dry-run.ts` — extract `DryRunEvaluator` implementing `InstructionEvaluator<InterpreterEnvironment>`
- `lib/runtime/interpreters/diagnostic.ts` — compose `DiagnosticEvaluator` wrapping `DryRunEvaluator` with classification

**The diagnostic interpreter** stays as a post-processing wrapper over dry-run results (its current pattern is already correct — it delegates then enriches).

**Verification**: Interpreter tests pass. Full test suite passes.

---

## Slice 6: Causal Memory from State Transition Graph

**Goal**: Agent memory carries causal links from state transitions, preventing premature eviction.

**Extend `ObservedStateSession`**:
```typescript
interface CausalLink {
  stepIndex: number;
  firedTransitionRef: TransitionRef;
  targetStateRef: StateNodeRef;
  relevantForSteps: number[];  // steps whose preconditions depend on this state
}

interface ObservedStateSession {
  // ... existing fields ...
  causalLinks: CausalLink[];
}
```

**Files to modify**:
- `lib/domain/types/resolution.ts` — add `causalLinks` to `ObservedStateSession`
- `lib/runtime/agent/index.ts` — populate causal links from state graph after resolution; use causal links in staleness check (don't evict if next step depends on a causal link)
- `lib/runtime/scenario.ts` — feed transition observations into causal memory

**Staleness override**: If a causal link's `relevantForSteps` includes the current step index, the linked screen/state is exempt from TTL eviction.

**Verification**: Agent resolution tests pass. Add new test for causal memory retention.

---

## Slice 7: Saga Compensation in runScenario

**Goal**: Prevent inconsistent workspace state on mid-pipeline failure.

**Approach**: Bracket evidence and proposal writes with cleanup.

**Files to modify**:
- `lib/application/run.ts` — wrap proposal activation in `Effect.acquireRelease` pattern; write run record as commit point
- `lib/application/activate-proposals.ts` — add `deactivateProposals` compensation function that reverses canonical writes

**Compensation strategy**:
1. Evidence writes are already idempotent (path-keyed by runId + stepIndex)
2. Proposal activation writes to canonical files → compensation restores originals from backup
3. Run record write is the commit point — if it succeeds, no compensation needed
4. If any stage after evidence persistence fails, cleanup orphaned evidence files

**Requires**: Typed errors from Slice 2 (to distinguish recoverable vs. fatal failures).

**Verification**: Add test for partial pipeline failure cleanup.

---

## Slice 8: Layer Composition

**Goal**: Replace nested `Effect.provideService` with `Layer.mergeAll`.

**New file**: `lib/composition/layers.ts`
```typescript
const FileSystemLive = Layer.succeed(FileSystem, LocalFileSystem);
const AdoSourceLive = (rootDir: string) => Layer.succeed(AdoSource, makeLocalAdoSource(rootDir));
const RuntimeScenarioRunnerLive = Layer.succeed(RuntimeScenarioRunner, LocalRuntimeScenarioRunner);
const ExecutionContextLive = (posture: ExecutionPosture) => Layer.succeed(ExecutionContext, { posture });

const LocalServicesLive = (rootDir: string, posture: ExecutionPosture) =>
  Layer.mergeAll(
    FileSystemLive,
    AdoSourceLive(rootDir),
    RuntimeScenarioRunnerLive,
    ExecutionContextLive(posture),
  );
```

**Files to modify**:
- `lib/composition/layers.ts` — new file
- `lib/composition/local-services.ts` — use `Layer.provide` instead of nested `Effect.provideService`
- Update any test that manually provides services

**Verification**: All tests pass. Service wiring is cleaner.

---

## Slice 9: Adaptive Memory Capacity

**Goal**: Memory limits scale with scenario and state graph complexity.

**New function**: `deriveMemoryCapacity(plan: ScenarioRunPlan, stateGraph: StateTransitionGraph | null)`

```typescript
interface MemoryCapacity {
  maxActiveRefs: number;      // 8-32, scales with state node count
  stalenessTtl: number;       // 3-10, scales with step count
  maxLineageEntries: number;  // 32-64, scales with step count
  screenConfidenceFloor: number;  // 0.25-0.45, tighter for complex graphs
}
```

**Files to modify**:
- `lib/runtime/agent/index.ts` — replace hardcoded constants with capacity from plan/graph
- `lib/runtime/agent/index.ts` — `normalizeObservedStateSession` takes capacity parameter
- `lib/runtime/scenario.ts` — compute capacity from plan and pass to agent context

**Verification**: Existing tests pass with default capacity. Add parametric test for capacity scaling.

---

## Slice 10: Resolution Event Sourcing

**Goal**: Resolution pipeline produces an event stream; projections (exhaustion chain, resolution graph, learning fragments) consume events.

**New types** in `lib/domain/types/resolution.ts`:
```typescript
type ResolutionEvent =
  | { kind: 'exhaustion-recorded'; entry: ResolutionExhaustionEntry }
  | { kind: 'observation-recorded'; observation: ResolutionObservation }
  | { kind: 'refs-collected'; refKind: 'knowledge' | 'supplement' | 'control' | 'evidence'; refs: string[] }
  | { kind: 'memory-updated'; session: ObservedStateSession }
  | { kind: 'receipt-produced'; receipt: ResolutionReceipt }
```

**Modified strategy interface** (builds on Slice 3):
```typescript
interface ResolutionStrategy {
  readonly rung: ResolutionPrecedenceRung;
  attempt(stage: ResolutionStageInput, acc: ResolutionAccumulator): Promise<{
    receipt: ResolutionReceipt | null;
    events: ResolutionEvent[];
  }>;
}
```

**Pipeline becomes a fold**:
```typescript
function runResolutionPipeline(task, context): Promise<{ receipt: ResolutionReceipt; events: ResolutionEvent[] }> {
  const allEvents: ResolutionEvent[] = [];
  for (const strategy of strategies) {
    const { receipt, events } = await strategy.attempt(stage, acc);
    allEvents.push(...events);
    if (receipt) {
      allEvents.push({ kind: 'receipt-produced', receipt });
      return { receipt, events: allEvents };
    }
  }
  // ... needs-human fallback
}
```

**Projections consume events**:
- `buildStepResolutionGraph` in `interpret.ts` → projects from events instead of reconstructing from receipt.exhaustion
- Learning fragments → consume events directly for richer provenance
- Exhaustion chain → trivially derived: `events.filter(e => e.kind === 'exhaustion-recorded')`

**Files to modify**:
- `lib/domain/types/resolution.ts` — add `ResolutionEvent` type
- `lib/runtime/agent/strategy.ts` — update strategy interface to return events
- `lib/runtime/agent/resolution-stages.ts` — each stage returns events instead of mutating stage context
- `lib/runtime/agent/index.ts` — pipeline collects events
- `lib/application/execution/interpret.ts` — `buildStepResolutionGraph` consumes events

**This is the capstone**: It makes the `RuntimeAgentStageContext` mutable accumulator disappear entirely. Each strategy is a pure function from `(input, acc) → (receipt | null, events[])`. The pipeline is a fold. The projections are derived. The learning loop gets first-class event data.

**Verification**: All resolution and execution tests pass. Resolution graph output is identical.

---

## Execution Order

```
Slice 1 (compat adapter)     — unblocks catalog changes
Slice 2 (typed errors)       — unblocks saga compensation
Slice 3 (strategy chain)     — unblocks event sourcing
Slice 4 (read models)        — uses clean catalog from Slice 1
Slice 5 (interpreter pattern) — independent, can parallel with 4
Slice 6 (causal memory)      — uses state graph, independent
Slice 7 (saga compensation)  — requires typed errors from Slice 2
Slice 8 (layer composition)  — independent, can parallel with 6-7
Slice 9 (adaptive memory)    — builds on memory model from Slice 6
Slice 10 (event sourcing)    — builds on strategy chain from Slice 3
```

**Critical path**: 1 → 2 → 3 → 10
**Parallel track A**: 4, 5 (after Slice 1)
**Parallel track B**: 6, 8 (independent)
**Sequential tail**: 7 (after 2), 9 (after 6)
