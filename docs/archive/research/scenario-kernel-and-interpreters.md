# Scenario Kernel and Interpreter Family

_As of March 13, 2026._

## Summary

This note proposes a concrete refactor for the scenario-centered core of Tesseract:

- replace the current split across `ScenarioTaskPacket`, `ScenarioRuntimeHandoff`, and `SelectedRunContext`
- introduce one truthful scenario kernel and one truthful run plan
- recast downstream artifact generation and runtime behavior as interpreters over that kernel

The proposed center of gravity is:

1. `ScenarioInterpretationSurface`
2. `ScenarioRunPlan`
3. `ResolutionStage[]`
4. a shared `foldScenarioRun(...)`
5. a projection registry of interpreters over the same scenario truth

The architectural goal is not merely to rename types. The goal is to make the codebase feel like one compact machine instead of a set of neighboring pipelines that keep rehydrating equivalent truth from slightly different angles.

## Why This Matters

Tesseract's docs already say that the product is organized around one shared interpretation surface. The runtime, emitted specs, review artifacts, learning projections, and workbench surfaces are all supposed to consume the same machine contract.

In the current implementation, the code is moving toward that shape, but it has not fully arrived.

Today, scenario truth is split across multiple near-duplicate contracts:

- `ScenarioTaskPacket` in [lib/domain/types/resolution.ts](../../lib/domain/types/resolution.ts)
- `ScenarioRuntimeHandoff` in [lib/domain/types/resolution.ts](../../lib/domain/types/resolution.ts)
- `SelectedRunContext` in [lib/application/execution/select-run-context.ts](../../lib/application/execution/select-run-context.ts)

That split causes several kinds of drag:

- the same scenario meaning is materialized more than once
- runtime execution and generated spec execution follow similar but not identical setup paths
- projections are forced to braid together task data, run data, and catalog lookups by hand
- some downstream code still reconstructs scenario-scoped truth from `WorkspaceCatalog` even after a scenario artifact already exists

Nothing here is "wrong" in the bug sense. The smell is architectural repetition:

- one truth is being kneaded into multiple shapes
- each shape is locally reasonable
- together they create friction, repetition, and subtle drift risk

This is exactly the sort of place where a good abstraction can change the stride of the whole codebase.

## The Core Move

The refactor is to separate two concerns cleanly:

- what the scenario means
- how the scenario will run right now

Those are different concerns. Today they are interleaved.

The new model should make that split explicit.

### `ScenarioInterpretationSurface`

This is the scenario-scoped kernel.

It is the single durable derived artifact for one scenario. It answers:

- what steps exist
- what each step is grounded to
- what interface graph, selector canon, and state topology slices are relevant
- what knowledge, evidence, and control references are in play
- what fingerprints and lineage explain the derivation

This artifact should live at the existing path:

- `.tesseract/tasks/{ado_id}.resolution.json`

That path already reads like the right durable seam. The proposal is to make it the real thing.

### `ScenarioRunPlan`

This is the run-scoped command object.

It is not persisted as a second durable scenario artifact. It is derived from the interpretation surface plus run selection inputs.

It answers:

- which runtime mode applies
- which provider and recovery policy apply
- which runbook and dataset bindings apply
- what fixtures should be present
- which steps are active for this run
- what exact context should be used for receipts and execution

This is the thing the runtime consumes.

The key discipline is:

- the surface is scenario truth
- the plan is execution truth
- neither of them should contain accidental responsibilities that belong to the other

## The Design Patterns In Play

This proposal is not one pattern. It is a weave of a few patterns that fit the repo's architecture unusually well.

### 1. Materialized Read Model

`ScenarioInterpretationSurface` is a materialized read model.

It is built once from scenario intent, controls, and approved knowledge. After it exists, downstream consumers should read it, not recompute equivalent scenario truth from the workspace.

That means:

- `buildInterfaceResolutionContext(...)` becomes a surface-build concern
- `WorkspaceCatalog` remains the assembly source, not the runtime shadow dependency
- scenario-scoped downstream work stops consulting the catalog as an implicit side channel

The effect is not just speed. It is conceptual tightening. Downstream code stops asking "what else can I discover?" and starts asking "what does the surface say?"

### 2. Command Object

`ScenarioRunPlan` is a command object for execution.

It packages the exact data needed to perform a run:

- selected controls
- posture
- mode
- provider id
- fixtures
- selected steps
- receipt context

This makes the runtime boundary much cleaner because the runner gets one thing that is already decided instead of several related values that still imply decision work.

### 3. Interpreter Family

Once the scenario kernel exists, many subsystems become interpreters over the same truth:

- emitted Playwright spec
- trace JSON
- review markdown
- learning fragments
- proposal bundle
- inbox/operator surfaces

These are not separate "pipelines" in the deep sense. They are different renderings or analyses over one kernel and, optionally, one run fold.

That is the part that feels elegant. New features stop needing new scenario handoff shapes. They become new interpreters.

### 4. Reducer / Fold

The run layer has a different repetition smell: the same totals, rollups, and summaries are computed in several places.

The answer is one shared fold:

- `foldScenarioRun(plan, stepResults, evidenceWrites)`

That fold should produce:

- timing totals
- cost totals
- translation metrics
- failure families
- recovery families and strategies
- evidence ids
- transition and observed-state summaries
- budget breach counts

Run records, review summaries, hotspots, and scorecards should all consume that same fold instead of each doing a partial recount.

### 5. Table-Driven Resolution

The current resolution pipeline in [lib/runtime/agent/index.ts](../../lib/runtime/agent/index.ts) contains strong ideas, but the orchestration is still largely imperative.

The higher-order move nearby is:

- turn the resolution ladder into `ResolutionStage[]`

Each stage would define:

- `id`
- `rung`
- `tryResolve(stageContext)`
- `summarize(stageResult)`
- `recordExhaustion(stageResult, accumulator)`

The pipeline then becomes a reducer over ordered stages.

This keeps precedence explicit while shrinking the amount of hand-managed bookkeeping around:

- exhaustion records
- top candidate summaries
- winning source selection
- observations
- stage-specific fallback messaging

The benefit is compositional, not decorative. The resolution ladder becomes data with behavior, not one long procedural braid.

## The Concrete Kernel

The exact final wire shape can evolve, but the conceptual contents should be stable.

### Proposed `ScenarioInterpretationSurface`

```ts
interface ScenarioInterpretationSurface {
  kind: 'scenario-interpretation-surface';
  version: 1;
  stage: 'preparation';
  scope: 'scenario';
  ids: WorkflowEnvelopeIds;
  fingerprints: WorkflowEnvelopeFingerprints;
  lineage: WorkflowEnvelopeLineage;
  governance: Governance;
  payload: {
    adoId: AdoId;
    revision: number;
    title: string;
    suite: string;
    knowledgeFingerprint: string;
    interface: TaskArtifactRef;
    selectors: TaskArtifactRef;
    stateGraph: TaskArtifactRef;
    knowledgeSlice: ScenarioKnowledgeSlice;
    steps: GroundedStep[];
    resolutionContext: InterfaceResolutionContext;
  };
}
```

Important properties:

- `steps` remain the grounded machine contract for the scenario
- `resolutionContext` becomes part of the surface, not something rebuilt later
- artifact refs and knowledge slice remain explicit for provenance and projection

### Proposed `GroundedStep`

This is the current `StepTask`, but treated more honestly as a grounded scenario fragment.

It should keep:

- normalized intent
- allowed actions
- explicit and control resolution
- target refs
- selector refs
- route variant refs
- assertion anchors
- required and forbidden state refs
- event signature refs
- expected transition refs
- result state refs
- stable fingerprint

The important naming shift is conceptual: this is not merely a "task" for runtime. It is the grounded unit shared by emission, runtime, learning, and review.

### Proposed `ScenarioRunPlan`

```ts
interface ScenarioRunPlan {
  kind: 'scenario-run-plan';
  version: 1;
  adoId: AdoId;
  runId: string;
  surfaceFingerprint: string;
  posture: ExecutionPosture;
  mode: RuntimeScenarioMode;
  providerId: string;
  controlSelection: {
    runbook?: string | null;
    dataset?: string | null;
    resolutionControl?: string | null;
  };
  fixtures: Record<string, unknown>;
  screenIds: ScreenId[];
  steps: GroundedStep[];
  resolutionContext: InterfaceResolutionContext;
  context: {
    adoId: AdoId;
    revision: number;
    contentHash: string;
    artifactPath?: string;
  };
  recoveryPolicy?: RecoveryPolicy;
}
```

The plan contains runtime-facing truth only.

The important rule is that `prepareScenarioRunPlan(...)` may choose values, but it does not reinterpret the scenario.

## What Code Changes Shape

This refactor is especially attractive because it should cause meaningful code collapse in a few hot paths.

### 1. `task.ts` becomes the one scenario kernel builder

In [lib/application/task.ts](../../lib/application/task.ts):

- `buildTaskPacket(...)` becomes `buildScenarioInterpretationSurface(...)`
- `buildInterfaceResolutionContext(...)` is called here and only here
- grounded step construction remains here
- knowledge slice and artifact refs remain here

This file becomes the scenario-kernel foundry.

### 2. `select-run-context.ts` stops rebuilding meaning

In [lib/application/execution/select-run-context.ts](../../lib/application/execution/select-run-context.ts):

- `SelectedRunContext` is replaced by `ScenarioRunPlan`
- the function becomes `prepareScenarioRunPlan(...)`
- it consumes a surface instead of task packet + raw catalog-driven reassembly

This is a major change in responsibility.

Before:

- find scenario
- find task packet
- rebuild resolution context
- choose controls
- choose mode
- derive fixtures
- return a wide object

After:

- load surface
- choose controls
- apply precedence
- derive fixtures
- return a plan

That is smaller, clearer, and much closer to the intent of the function.

### 3. `runtime-handoff.ts` disappears

In [lib/application/runtime-handoff.ts](../../lib/application/runtime-handoff.ts):

- the separate durable runtime handoff artifact becomes unnecessary
- generated specs should load the surface and derive a run plan locally with the same helper the CLI uses

This deletes an entire scenario artifact shape and eliminates a durable second truth about the same scenario.

### 4. `run.ts` becomes tighter

In [lib/application/run.ts](../../lib/application/run.ts):

the flow should become:

1. load surface
2. prepare run plan
3. choose resolution engine
4. execute steps
5. fold run outputs
6. emit run-scoped artifacts and projections

The file becomes more orchestration-like and less reconstruction-like.

### 5. `runtime/scenario.ts` becomes a true runtime interpreter

In [lib/runtime/scenario.ts](../../lib/runtime/scenario.ts):

- generated-spec execution and CLI execution should use the same `ScenarioRunPlan`
- `loadScenarioRuntimeHandoff(...)` is replaced with `loadScenarioInterpretationSurface(...)`
- `stepHandshakeFromHandoff(...)` becomes `stepHandshakeFromPlan(...)`

This matters because the emitted spec should not have its own quasi-private boot path. It should use the same machine contract as the CLI.

### 6. `emit.ts` becomes a projection host

In [lib/application/emit.ts](../../lib/application/emit.ts):

the file currently mixes:

- scenario projection assembly
- artifact rendering
- review summary assembly
- runtime handoff emission
- output fingerprinting

Once the kernel exists, this should move toward a projector registry:

- `specProjector`
- `traceProjector`
- `reviewProjector`
- `proposalProjector`

Each projector consumes the same base scenario truth and optional run fold. The file becomes less like an all-purpose kitchen sink and more like a coordinator of interpreters.

## The Shared Run Fold

The shared fold is one of the most leverage-heavy add-ons in the same family.

### Why It Exists

Multiple parts of the codebase need the same summary information:

- run record
- review markdown
- benchmark scorecard
- hotspots
- operator inbox summaries

Right now each layer can end up recounting some part of the run:

- how many translation hits
- which failures happened
- how much time was spent
- which recovery strategies fired
- which states were observed

That repetition is not just noisy. It is an agreement risk.

### Proposed Shape

```ts
interface ScenarioRunFold {
  byStep: Map<number, {
    evidenceIds: string[];
    observedStateRefs: StateNodeRef[];
    matchedTransitionRefs: TransitionRef[];
    failureFamily: StepFailureFamily;
    translation: TranslationReceipt | null;
  }>;
  translationMetrics: ...;
  executionMetrics: ...;
  evidenceIds: string[];
  observedStateRefs: StateNodeRef[];
  matchedTransitionRefs: TransitionRef[];
}
```

The precise type is less important than the law:

- the run fold is computed once
- other projections read it

### What It Replaces

It should directly inform:

- [lib/application/execution/build-run-record.ts](../../lib/application/execution/build-run-record.ts)
- review metric sections in [lib/application/emit.ts](../../lib/application/emit.ts)
- benchmark aggregation in [lib/application/benchmark.ts](../../lib/application/benchmark.ts)
- hotspot detection in [lib/application/hotspots.ts](../../lib/application/hotspots.ts)

The nice part is that each of these consumers becomes more honest:

- run record stores the fold
- review renders the fold
- benchmark aggregates folds across runs
- hotspots detect patterns from folds

That is a better topology than each one hand-rolling its own summary math.

## The Resolution Ladder As Data

This is the most delightful nearby move because it gives structure to code that currently deserves more formal compositionality.

### The Current Situation

[lib/runtime/agent/index.ts](../../lib/runtime/agent/index.ts) already implements a rich precedence-aware resolution flow. It has the right ideas:

- explicit resolution
- deterministic ranking
- overlays
- translation
- DOM fallback
- exhaustion recording
- memory updates

But it is still expressed as one long control flow with repeated patterns:

- attempt stage
- maybe record observation
- maybe record exhaustion
- maybe shape a receipt
- maybe update memory
- maybe continue

This is ripe for a table-driven stage model.

### Proposed `ResolutionStage`

```ts
interface ResolutionStage {
  id: string;
  rung: StepResolutionGraph['winner']['rung'];
  tryResolve(input: ResolutionStageInput): Promise<ResolutionStageResult>;
}
```

Where `ResolutionStageResult` can express:

- resolved
- attempted but not resolved
- skipped
- failed

plus:

- observations
- candidate summaries
- overlay refs
- knowledge refs
- supplement refs
- translated artifacts if any

### Why It Is Worth It

This buys several things:

- the precedence order becomes data, not only control flow
- stage-specific bookkeeping becomes uniform
- testing becomes easier because stage behavior can be reasoned about in slices
- adding a new rung later becomes a stage insertion, not a surgery across a long function

This is exactly the kind of refactor that can make a complex core feel lighter without dumbing it down.

## The Next-Level Add-On: `GroundedStepProgram`

If the kernel-and-interpreters refactor is the main move, this is the strong second movement.

### The Problem It Solves

Right now `grounding` holds rich structure:

- state refs
- event signature refs
- expected transition refs
- effect assertions

But runtime execution still has to reconstruct some of the operational meaning of those arrays.

The more fluid design is to compile each grounded step into a tiny executable program.

### Proposed Program Shape

Each step becomes a small IR with instructions like:

- `prime-required-states`
- `resolve-target`
- `dispatch-event`
- `observe-transitions`
- `assert-effects`
- `record-evidence`

Then:

- Playwright mode interprets the program concretely
- dry-run mode interprets it symbolically
- diagnostic mode interprets it descriptively

The benefit is not just neatness. It makes state topology first-class executable structure instead of side data attached to an action.

### Why This Pairs So Well With The Kernel

`GroundedStepProgram` should not come first. It should come after the kernel.

Why:

- the kernel gives it a stable home
- the plan gives it a stable runtime consumer
- interpreters already exist conceptually, so step-program interpreters become a natural extension rather than a second abstraction leap

If done in the opposite order, the repo risks creating another beautiful intermediate representation without first cleaning up the scenario boundary around it.

## What Should Collapse

The strongest refactors are the ones where code stops needing to exist.

If this proposal is implemented well, the following should collapse:

- the separate `ScenarioRuntimeHandoff` type
- the separate `.runtime.json` durable artifact
- the role of `SelectedRunContext` as a broad bag of scenario truth plus execution truth
- repeated chains like `selectedContext.taskPacketEntry.artifact.payload...`
- runtime and emitted-spec setup paths diverging for the same scenario
- projection code that reaches back into `WorkspaceCatalog` for scenario truth after scenario derivation already happened

That collapse is the point. If the refactor adds more types but does not delete responsibility from existing shapes, it has not gone far enough.

## Invariants To Protect

This refactor must preserve several repo-wide laws.

### Interpretation Surface Laws

- same scenario + same approved knowledge + same controls => same `ScenarioInterpretationSurface`
- grounded step fingerprints are stable under equivalent inputs
- downstream projections cannot change scenario meaning

### Run Plan Laws

- CLI override outranks runbook
- runbook outranks posture default
- preparing a run plan does not reinterpret the scenario

### Projection Agreement Laws

For the same surface and run fold:

- spec
- trace
- review
- learning fragments
- run record

must agree on:

- target refs
- selector refs
- state refs
- event signature refs
- transition refs
- aggregate translation and execution metrics

### No Secret Rehydration

Once a scenario surface exists, scenario-scoped projection and runtime code should not rebuild `InterfaceResolutionContext` from `WorkspaceCatalog`.

That is important enough to deserve an architecture test.

## Migration Sequence

This work is large enough that it should be sequenced deliberately.

### Slice 1: Introduce The Kernel

- add `ScenarioInterpretationSurface`
- keep `ScenarioTaskPacket` as a temporary compatibility alias or adapter
- make `task.ts` emit the new shape at the existing `.resolution.json` path
- keep old readers alive through explicit versioned adapters

### Slice 2: Introduce The Plan

- add `ScenarioRunPlan`
- replace `SelectedRunContext` with `prepareScenarioRunPlan(...)`
- migrate `run.ts` and replay flows first

### Slice 3: Remove Runtime Handoff Duplication

- switch generated specs to load the surface and prepare the run plan
- delete `.runtime.json`
- delete `ScenarioRuntimeHandoff`

### Slice 4: Add The Shared Fold

- implement `foldScenarioRun(...)`
- migrate run record and review first
- then migrate benchmark and hotspot aggregation

### Slice 5: Turn Projections Into Interpreters

- split `emit.ts` into projector-oriented modules
- keep emission orchestration thin

### Slice 6: Optional But Highly Aligned

- refactor the resolution ladder into `ResolutionStage[]`
- optionally add `GroundedStepProgram`

That order matters. It keeps each slice legible and ensures the deeper abstractions land onto a cleaner perimeter instead of being layered on top of an already muddy seam.

## Non-Goals

This proposal does not require:

- changing the deterministic precedence laws
- changing trust-policy behavior
- changing generated spec readability
- changing the canonical-versus-derived boundary
- splitting `interface-intelligence.ts` or `validation/core.ts` in the same slice

Those may become good follow-on refactors. They are not prerequisites for the kernel move.

## Recommendation

If only one architectural refactor is chosen in this neighborhood, it should be:

- `ScenarioInterpretationSurface` + `ScenarioRunPlan`

If one nearby add-on is bundled with it, it should be:

- `foldScenarioRun(...)`

If one delightful mad-scientist extension is pursued after the kernel lands, it should be:

- `ResolutionStage[]`

If the team wants the deepest long-term payoff after that, it should be:

- `GroundedStepProgram`

That sequence gives the repo a real center.

The scenario stops being a thing that gets repeatedly translated by neighboring systems.

It becomes a kernel.

The runtime becomes an interpreter.

The projections become interpreters.

The summaries become folds.

And the codebase starts behaving more like a coherent machine than a set of adjacent workflows.
