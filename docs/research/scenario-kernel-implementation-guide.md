# Scenario Kernel Implementation Guide

_As of March 12, 2026. Implementation companion to [scenario-kernel-and-interpreters.md](scenario-kernel-and-interpreters.md)._

This document is the agent-executable bridge between the architectural vision and the current codebase. Every type, function, file, and line reference is grounded in the real code as of this date. An implementing agent should be able to pick up any slice and execute it without re-discovering context.

---

## Table of Contents

1. [Type Lineage Map](#1-type-lineage-map)
2. [Reconciled Interface Definitions](#2-reconciled-interface-definitions)
3. [File-by-File Surgery Guide](#3-file-by-file-surgery-guide)
4. [Fold Specification](#4-fold-specification)
5. [Resolution Ladder as Data](#5-resolution-ladder-as-data)
6. [Test Contract Catalogue](#6-test-contract-catalogue)
7. [Risk Register and Migration Guardrails](#7-risk-register-and-migration-guardrails)
8. [Decision Log](#8-decision-log)

---

## 1. Type Lineage Map

Every current type that participates in the scenario truth split, mapped to its kernel-era replacement.

### 1.1 Types That Transform

| Current Type | Location | Kernel-Era Replacement | Disposition |
|---|---|---|---|
| `ScenarioTaskPacket` | `lib/domain/types/resolution.ts:155–184` | `ScenarioInterpretationSurface` | **Replace.** The new kernel absorbs the packet payload and adds `resolutionContext`. Version resets to `1` under new `kind` discriminant. Temporary compatibility alias kept during Slice 1. |
| `StepTask` | `lib/domain/types/resolution.ts:121–134` | `GroundedStep` | **Rename + extend.** Same fields. The name changes to reflect that it is a grounded scenario fragment shared by emission, runtime, learning, and review — not a "task" for runtime alone. `StepTask` becomes a type alias during migration. |
| `StepTaskGrounding` | `lib/domain/types/resolution.ts:107–119` | `StepGrounding` | **Rename.** Drop the `Task` qualifier. Same fields. |
| `ScenarioRuntimeHandoff` | `lib/domain/types/resolution.ts:190–249` | _(deleted)_ | **Delete entirely.** 60 lines of duplicated payload fields. Generated specs will load the surface and derive a `ScenarioRunPlan` using the same helper the CLI uses. |
| `ScenarioRuntimeStep` | `lib/domain/types/resolution.ts:186–189` | _(deleted)_ | **Delete.** Its only purpose was wrapping `StepTask` + `directive` for the handoff. The plan carries `GroundedStep[]` directly. |
| `SelectedRunContext` | `lib/application/execution/select-run-context.ts:82–107` | `ScenarioRunPlan` | **Replace.** The new plan is a focused command object. It drops `scenarioEntry`, `boundScenarioEntry`, `taskPacketEntry`, `snapshotEntry` (catalog envelope references the plan should not carry). |

### 1.2 Types That Are Absorbed

| Current Type | Location | Absorbed Into | Notes |
|---|---|---|---|
| `InterfaceResolutionContext` | `lib/domain/types/knowledge.ts:100–119` | `ScenarioInterpretationSurface.payload.resolutionContext` | **No structural change.** The type remains as-is. The change is that it is built once during surface construction and never rebuilt downstream. |
| `ScenarioKnowledgeSlice` | `lib/domain/types/resolution.ts:96–105` | `ScenarioInterpretationSurface.payload.knowledgeSlice` | **No structural change.** Already part of `ScenarioTaskPacket.payload`. Remains in the surface payload. |
| `TaskArtifactRef` | `lib/domain/types/resolution.ts:89–92` | `ScenarioInterpretationSurface.payload.{interface,selectors,stateGraph}` | **No structural change.** |

### 1.3 Types That Are New

| New Type | Layer | Purpose |
|---|---|---|
| `ScenarioInterpretationSurface` | `lib/domain/types/resolution.ts` | The one durable derived scenario artifact. Replaces `ScenarioTaskPacket` at `.tesseract/tasks/{ado_id}.resolution.json`. |
| `ScenarioRunPlan` | `lib/domain/types/resolution.ts` | Run-scoped command object. Not persisted. Derived from surface + run selection inputs. |
| `GroundedStep` | `lib/domain/types/resolution.ts` | Rename of `StepTask`. Shared by all interpreters. |
| `StepGrounding` | `lib/domain/types/resolution.ts` | Rename of `StepTaskGrounding`. |
| `ScenarioRunFold` | `lib/domain/types/execution.ts` | Shared fold computed once per run. Replaces repeated inline reduces. |
| `StepFold` | `lib/domain/types/execution.ts` | Per-step fold within `ScenarioRunFold`. |
| `ResolutionStage` | `lib/runtime/agent/types.ts` | Table-driven stage definition for the resolution ladder. |
| `ResolutionStageResult` | `lib/runtime/agent/types.ts` | Discriminated union of stage outcomes. |

### 1.4 Types That Require Payload-Duplication Cleanup

The current codebase uses a pattern where envelope types duplicate their `payload` fields as top-level siblings. This pattern appears in:

| Type | Duplicate Field Count | Location |
|---|---|---|
| `ScenarioRuntimeHandoff` | ~15 fields | `resolution.ts:225–249` |
| `RunRecord` | ~15 fields | `execution.ts:260–276` |
| `ProposalBundle` | ~6 fields | `execution.ts:293–309` |

The kernel refactor **deletes** `ScenarioRuntimeHandoff` entirely. `RunRecord` and `ProposalBundle` payload duplication should be cleaned up as a follow-on, not as part of this refactor.

---

## 2. Reconciled Interface Definitions

These are the exact TypeScript interfaces for the kernel-era types, reconciled with the actual branded types, envelope conventions, and domain primitives in the current codebase.

### 2.1 `GroundedStep` (replaces `StepTask`)

```ts
// lib/domain/types/resolution.ts
// Replaces StepTask at lines 121–134

import type { StepAction } from './workflow';
import type { StepResolution } from './intent';
import type {
  CanonicalTargetRef, EventSignatureRef, SelectorRef, StateNodeRef, TransitionRef,
} from '../identity';

export interface StepGrounding {
  targetRefs: CanonicalTargetRef[];
  selectorRefs: SelectorRef[];
  fallbackSelectorRefs: SelectorRef[];
  routeVariantRefs: string[];
  assertionAnchors: string[];
  effectAssertions: string[];
  requiredStateRefs: StateNodeRef[];
  forbiddenStateRefs: StateNodeRef[];
  eventSignatureRefs: EventSignatureRef[];
  expectedTransitionRefs: TransitionRef[];
  resultStateRefs: StateNodeRef[];
}

export interface GroundedStep {
  index: number;
  intent: string;
  actionText: string;
  expectedText: string;
  normalizedIntent: string;
  allowedActions: StepAction[];
  explicitResolution: StepResolution | null;
  controlResolution: StepResolution | null;
  grounding: StepGrounding;
  stepFingerprint: string;
}

/** @deprecated Use GroundedStep. Temporary alias for migration. */
export type StepTask = GroundedStep;

/** @deprecated Use StepGrounding. Temporary alias for migration. */
export type StepTaskGrounding = StepGrounding;
```

**Migration notes:**

- `taskFingerprint` is renamed to `stepFingerprint` on the step. The scenario-level `taskFingerprint` remains on the surface envelope.
- The alias `StepTask = GroundedStep` allows all existing consumers to compile unchanged during Slices 1–2. Remove the alias in Slice 3 or later.

### 2.2 `ScenarioInterpretationSurface` (replaces `ScenarioTaskPacket`)

```ts
// lib/domain/types/resolution.ts
// Replaces ScenarioTaskPacket at lines 155–184

import type { AdoId, ScreenId } from '../identity';
import type {
  Governance, WorkflowEnvelopeIds, WorkflowEnvelopeFingerprints, WorkflowEnvelopeLineage,
} from './workflow';
import type { InterfaceResolutionContext, ScenarioKnowledgeSlice } from './knowledge';

export interface ScenarioInterpretationSurface {
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
  surfaceFingerprint: string;
}
```

**Differences from `ScenarioTaskPacket`:**

| Field | `ScenarioTaskPacket` | `ScenarioInterpretationSurface` | Why |
|---|---|---|---|
| `kind` | `'scenario-task-packet'` | `'scenario-interpretation-surface'` | New discriminant enables versioned adapters |
| `version` | `5` | `1` | Clean break: new `kind`, new version series |
| `payload.steps` | `StepTask[]` | `GroundedStep[]` | Same shape, renamed type |
| `payload.resolutionContext` | _(absent)_ | `InterfaceResolutionContext` | **The key addition.** Embeds resolution context so it is never rebuilt downstream |
| `taskFingerprint` | top-level | `surfaceFingerprint` | Renamed to reflect broader scope |

**Durable path:** `.tesseract/tasks/{ado_id}.resolution.json` (unchanged from today's task packet path).

**Compatibility adapter for Slice 1:**

```ts
// lib/application/compat/surface-adapter.ts

export function surfaceFromTaskPacket(
  packet: ScenarioTaskPacket,
  resolutionContext: InterfaceResolutionContext,
): ScenarioInterpretationSurface {
  return {
    kind: 'scenario-interpretation-surface',
    version: 1,
    stage: packet.stage,
    scope: packet.scope,
    ids: packet.ids,
    fingerprints: packet.fingerprints,
    lineage: packet.lineage,
    governance: packet.governance,
    payload: {
      ...packet.payload,
      steps: packet.payload.steps, // GroundedStep via alias
      resolutionContext,
    },
    surfaceFingerprint: packet.taskFingerprint,
  };
}

export function taskPacketFromSurface(
  surface: ScenarioInterpretationSurface,
): ScenarioTaskPacket {
  return {
    kind: 'scenario-task-packet',
    version: 5,
    stage: surface.stage,
    scope: surface.scope,
    ids: surface.ids,
    fingerprints: surface.fingerprints,
    lineage: surface.lineage,
    governance: surface.governance,
    payload: {
      adoId: surface.payload.adoId,
      revision: surface.payload.revision,
      title: surface.payload.title,
      suite: surface.payload.suite,
      knowledgeFingerprint: surface.payload.knowledgeFingerprint,
      interface: surface.payload.interface,
      selectors: surface.payload.selectors,
      stateGraph: surface.payload.stateGraph,
      knowledgeSlice: surface.payload.knowledgeSlice,
      steps: surface.payload.steps,
    },
    taskFingerprint: surface.surfaceFingerprint,
  };
}
```

### 2.3 `ScenarioRunPlan` (replaces `SelectedRunContext`)

```ts
// lib/domain/types/resolution.ts

import type { AdoId, ScreenId } from '../identity';
import type { ExecutionPosture, RuntimeInterpreterMode } from './workflow';
import type { InterfaceResolutionContext } from './knowledge';
import type { RecoveryPolicy } from '../execution/recovery-policy';

export type RuntimeScenarioMode = RuntimeInterpreterMode;

export interface ScenarioRunPlan {
  kind: 'scenario-run-plan';
  version: 1;
  adoId: AdoId;
  runId: string;
  surfaceFingerprint: string;
  posture: ExecutionPosture;
  mode: RuntimeScenarioMode;
  providerId: string;
  controlSelection: {
    runbook?: string | null | undefined;
    dataset?: string | null | undefined;
    resolutionControl?: string | null | undefined;
  };
  fixtures: Record<string, unknown>;
  screenIds: ScreenId[];
  steps: GroundedStep[];
  resolutionContext: InterfaceResolutionContext;
  context: {
    adoId: AdoId;
    revision: number;
    contentHash: string;
    artifactPath?: string | undefined;
  };
  translationEnabled: boolean;
  translationCacheEnabled: boolean;
  recoveryPolicy?: RecoveryPolicy | undefined;
}
```

**What `SelectedRunContext` carried that the plan does not:**

| Dropped Field | Why |
|---|---|
| `scenarioEntry` | Catalog envelope reference. The plan carries the data it needs, not envelope wrappers. |
| `boundScenarioEntry` | Same. |
| `taskPacketEntry` | Same. The surface fingerprint provides traceability without carrying the full envelope. |
| `snapshotEntry` | Same. Data rows flow through `fixtures`. |
| `activeRunbook` | The plan carries `controlSelection.runbook` (the name) and the selected values from the runbook (mode, provider, recovery policy, translation flags). It does not carry the full runbook control object. |
| `activeDataset` | Same. Dataset bindings flow through `controlSelection.dataset` and `fixtures`. |

**What the plan adds that `SelectedRunContext` did not have:**

| New Field | Why |
|---|---|
| `kind` | Discriminant for type safety |
| `version` | Envelope convention |
| `surfaceFingerprint` | Links the plan to the surface it was derived from |

### 2.4 `ScenarioRunFold` (new)

```ts
// lib/domain/types/execution.ts

import type { StateNodeRef, TransitionRef } from '../identity';
import type { RecoveryStrategyId } from '../execution/recovery-policy';
import type { StepExecutionReceipt, TranslationRunMetrics } from './execution';
import type { TranslationReceipt } from './resolution';

export interface StepFold {
  stepIndex: number;
  evidenceIds: string[];
  observedStateRefs: StateNodeRef[];
  matchedTransitionRefs: TransitionRef[];
  failureFamily: StepExecutionReceipt['failure']['family'];
  failureCode: string | null;
  failureMessage: string | null;
  translation: TranslationReceipt | null;
  recoveryAttempts: import('../execution/recovery-policy').RecoveryStrategyId[];
  timing: StepExecutionReceipt['timing'];
  cost: StepExecutionReceipt['cost'];
  budgetStatus: StepExecutionReceipt['budget']['status'];
  degraded: boolean;
  resolutionMode: import('./workflow').ResolutionMode;
  winningSource: import('./workflow').StepWinningSource;
}

export interface ScenarioRunFold {
  kind: 'scenario-run-fold';
  version: 1;
  adoId: import('../identity').AdoId;
  runId: string;
  surfaceFingerprint: string;

  byStep: ReadonlyMap<number, StepFold>;

  translationMetrics: TranslationRunMetrics;
  executionMetrics: {
    timingTotals: StepExecutionReceipt['timing'];
    costTotals: StepExecutionReceipt['cost'];
    budgetBreaches: number;
    failureFamilies: Record<StepExecutionReceipt['failure']['family'], number>;
    recoveryFamilies: Record<Exclude<StepExecutionReceipt['failure']['family'], 'none'>, number>;
    recoveryStrategies: Record<RecoveryStrategyId, number>;
  };

  evidenceIds: string[];
  observedStateRefs: StateNodeRef[];
  matchedTransitionRefs: TransitionRef[];
}
```

**Design choices:**

- `byStep` uses `ReadonlyMap<number, StepFold>` — immutable after construction, keyed by step index.
- `StepFold` carries the exact fields that the three current independent consumers each recompute: timing, cost, failure family, recovery attempts, translation, observed state, budget status, degradation, resolution mode, and winning source.
- The aggregate fields (`translationMetrics`, `executionMetrics`, `evidenceIds`, etc.) mirror the exact shapes already used in `RunRecord.payload` at `execution.ts:238–258`, so `buildRunRecord` can delegate directly to the fold without reshaping.

---

## 3. File-by-File Surgery Guide

### Slice 1: Introduce the Kernel

**Goal:** Add `ScenarioInterpretationSurface` and `GroundedStep` types. Make `task.ts` emit the new shape. Keep all readers alive via versioned adapters.

#### 3.1.1 `lib/domain/types/resolution.ts`

**Add:**
- `GroundedStep` interface (same fields as `StepTask`, `taskFingerprint` → `stepFingerprint`)
- `StepGrounding` interface (same fields as `StepTaskGrounding`)
- `ScenarioInterpretationSurface` interface
- Deprecation aliases: `type StepTask = GroundedStep`, `type StepTaskGrounding = StepGrounding`

**Keep:**
- `ScenarioTaskPacket` (unchanged, temporary)
- `ScenarioRuntimeHandoff` (unchanged, removed in Slice 3)
- All receipt types, resolution graph types, translation types

**Do not touch:** Lines 250+ (receipts, resolution graph, observations, etc.)

**Completion criteria:**
- `npm run typecheck` passes
- `npm run lint` passes
- All existing tests pass (no behavioral change)

#### 3.1.2 `lib/application/task.ts`

**Current:** `buildTaskPacket(...)` returns `ScenarioTaskPacket`.

**Change:** Add `buildScenarioInterpretationSurface(...)` that:
1. Calls `buildInterfaceResolutionContext(...)` (same call site as today, ~line 209)
2. Uses the result for grounding (same as today)
3. **Embeds the result** in `payload.resolutionContext`
4. Returns `ScenarioInterpretationSurface`

**Shim:** Keep `buildTaskPacket` as a thin wrapper:
```ts
export function buildTaskPacket(input: BuildTaskPacketInput): ScenarioTaskPacket {
  const surface = buildScenarioInterpretationSurface(input);
  return taskPacketFromSurface(surface);
}
```

**The `buildInterfaceResolutionContext` call consolidation:** Currently this function is called in:
1. `lib/application/task.ts` (~line 209) — for grounding
2. `lib/application/execution/select-run-context.ts` (~line 132) — rebuilding for run context
3. `lib/application/runtime-handoff.ts` (~line 45, via `selectRunContext`) — rebuilding for handoff

After Slice 1, call site 1 becomes the authoritative site. Call sites 2 and 3 are eliminated in Slices 2 and 3 respectively.

**Completion criteria:**
- `.tesseract/tasks/{ado_id}.resolution.json` contains a `ScenarioInterpretationSurface` (new `kind`)
- Existing readers that expected `ScenarioTaskPacket` work through the adapter
- `npm run check` passes

#### 3.1.3 `lib/application/compat/surface-adapter.ts` (new file)

**Create:** The two adapter functions `surfaceFromTaskPacket` and `taskPacketFromSurface` (see §2.2).

**Purpose:** Any code that still reads `.resolution.json` expecting `ScenarioTaskPacket` can use `taskPacketFromSurface(loadedSurface)`. Any code that has a task packet and needs a surface can use `surfaceFromTaskPacket(packet, resolutionContext)`.

**Lifecycle:** This file is deleted in Slice 3 when all readers have migrated.

#### 3.1.4 `lib/application/catalog.ts` and `lib/application/catalog/index.ts`

**Change:** The catalog's `taskPackets` array should accept both `ScenarioTaskPacket` and `ScenarioInterpretationSurface` during migration. The simplest approach:
- Add `interpretationSurfaces: ArtifactEnvelope<ScenarioInterpretationSurface>[]` to `WorkspaceCatalog`
- Populate it from the same `.resolution.json` files
- Keep `taskPackets` populated via the adapter during Slice 1

**Completion criteria:** Catalog can load both old and new shapes from the same path.

---

### Slice 2: Introduce the Plan

**Goal:** Add `ScenarioRunPlan`. Replace `SelectedRunContext` with `prepareScenarioRunPlan(...)`. Migrate `run.ts` first.

#### 3.2.1 `lib/domain/types/resolution.ts`

**Add:** `ScenarioRunPlan` interface (see §2.3).

#### 3.2.2 `lib/application/execution/select-run-context.ts`

**Current:** `selectRunContext(input)` returns `SelectedRunContext`. 177 lines.

**Before flow:**
1. Look up `scenarioEntry`, `boundScenarioEntry`, `taskPacketEntry`, `snapshotEntry` in catalog
2. Find runbook via `findRunbook`
3. Call `buildInterfaceResolutionContext(...)` — **this is the redundant call**
4. Derive dataset, mode, fixtures, screenIds, provider
5. Return wide `SelectedRunContext` with all catalog entries

**After flow:**
1. Load `ScenarioInterpretationSurface` (from catalog or disk)
2. Look up scenario for metadata (revision, content hash, suite, preconditions)
3. Find runbook via `findRunbook`
4. Read `resolutionContext` **from the surface** — no `buildInterfaceResolutionContext` call
5. Derive dataset, mode, fixtures, screenIds, provider (same logic as today)
6. Return `ScenarioRunPlan`

**New function signature:**
```ts
export function prepareScenarioRunPlan(input: {
  surface: ScenarioInterpretationSurface;
  catalog: WorkspaceCatalog;
  paths: ProjectPaths;
  runbookName?: string | undefined;
  interpreterMode?: 'dry-run' | 'diagnostic';
  providerId?: string | undefined;
  posture?: ExecutionPosture | undefined;
  executionContextPosture: ExecutionPosture;
}): ScenarioRunPlan
```

**Key change:** The input takes a `surface` instead of an `adoId`. The surface already carries `resolutionContext`, `steps`, `knowledgeSlice`, and all fingerprints.

**Shim:** Keep `selectRunContext` as a wrapper during Slice 2:
```ts
export function selectRunContext(input: SelectRunContextInput): SelectedRunContext {
  const surface = loadSurfaceFromCatalog(input.catalog, input.adoId);
  const plan = prepareScenarioRunPlan({ surface, ...input });
  return selectedRunContextFromPlan(plan, input.catalog, input.adoId);
}
```

**What the plan eliminates:**
- `import { buildInterfaceResolutionContext } from '../interface-resolution'` — removed from this file
- `input.catalog.interfaceGraph`, `input.catalog.selectorCanon`, `input.catalog.stateGraph` lookups — removed
- `runtimeControlsForScenario(input.catalog, ...)` — controls come from `surface.payload.resolutionContext.controls`

**Completion criteria:**
- `prepareScenarioRunPlan` exists and is used by `run.ts`
- `selectRunContext` still exists as a shim for any remaining callers
- `npm run check` passes

#### 3.2.3 `lib/application/run.ts`

**Current flow** (31–140):
1. `selectRunContext(...)` → `SelectedRunContext`
2. `interpretScenarioTaskPacket(...)` with ~15 parameters spread from `selectedContext`
3. `persistEvidence(...)`
4. Reload catalog
5. `buildRunRecord(...)` consuming `selectedContext`
6. `buildProposalBundle(...)` consuming `selectedContext`
7. Persist JSON artifacts
8. `emitScenario(...)`, `buildGraph(...)`, etc.

**After flow:**
1. Load `ScenarioInterpretationSurface` from catalog
2. `prepareScenarioRunPlan(...)` → `ScenarioRunPlan`
3. `interpretScenarioFromPlan(plan)` with the plan as a single argument
4. `foldScenarioRun(plan, stepResults, evidenceWrites)` → `ScenarioRunFold`
5. `buildRunRecord(plan, fold)` — plan + fold, not `selectedContext`
6. `buildProposalBundle(plan, fold, stepResults)`
7. Persist JSON artifacts
8. `emitScenario(...)`, `buildGraph(...)` — consuming surface, not catalog

**Key simplification:** The repeated `selectedContext.taskPacketEntry.artifact.payload...` chains disappear. The plan carries flat fields.

#### 3.2.4 `lib/application/execution/build-run-record.ts`

**Current signature:**
```ts
buildRunRecord(input: {
  adoId: AdoId; runId: string;
  selectedContext: SelectedRunContext;
  stepResults: RuntimeScenarioStepResult[];
  evidenceWrites: PersistedEvidenceArtifact[];
}): BuildRunRecordResult
```

**New signature:**
```ts
buildRunRecord(input: {
  plan: ScenarioRunPlan;
  fold: ScenarioRunFold;
  stepResults: RuntimeScenarioStepResult[];
  evidenceWrites: PersistedEvidenceArtifact[];
}): BuildRunRecordResult
```

The ~100 lines of inline reduce operations (lines 63–107) are replaced by reading `fold.executionMetrics` and `fold.translationMetrics` directly. The function body shrinks from ~120 lines to ~40 lines of envelope assembly.

#### 3.2.5 `lib/application/interpret.ts`

**Current:** `interpretScenarioTaskPacket(input)` takes ~15 parameters spread out.

**New:** `interpretScenarioFromPlan(plan: ScenarioRunPlan, runner: RuntimeScenarioRunnerPort, rootDir: string)`. The plan carries all the fields that were previously spread parameters.

**Shim:** Keep `interpretScenarioTaskPacket` as a wrapper during Slice 2.

#### 3.2.6 `lib/application/ports.ts`

**Current:** `RuntimeScenarioRunnerPort.runSteps(input)` takes a bag of fields:
```ts
runSteps(input: {
  rootDir; mode; resolutionEngine; controlSelection?;
  screenIds; fixtures; steps; resolutionContext;
  context?; translationOptions?; posture?; recoveryPolicy?;
}): Effect.Effect<RuntimeScenarioStepResult[], unknown>
```

**Target:** This port's input bag naturally collapses into `ScenarioRunPlan` + `rootDir` + `resolutionEngine`. The port change should happen in Slice 2 so that the runtime boundary is clean.

---

### Slice 3: Remove Runtime Handoff Duplication

**Goal:** Delete `ScenarioRuntimeHandoff`, `.runtime.json`, and `runtime-handoff.ts`. Generated specs load the surface and derive a run plan.

#### 3.3.1 `lib/application/runtime-handoff.ts` — **DELETE**

This file (~119 lines) exists only to build and load the runtime handoff artifact. Once generated specs use the surface + `prepareScenarioRunPlan`, it has no callers.

**Before deleting**, verify:
- `grep -r 'runtime-handoff' lib/ tests/` returns zero hits outside of this file and the generated spec template
- `grep -r 'ScenarioRuntimeHandoff' lib/ tests/` returns zero hits outside of the type definition and this file
- `grep -r '.runtime.json' lib/ tests/` returns zero hits outside of this file

#### 3.3.2 `lib/domain/types/resolution.ts`

**Delete:** `ScenarioRuntimeHandoff` interface (lines 190–249), `ScenarioRuntimeStep` interface (lines 186–189).

#### 3.3.3 `lib/runtime/scenario.ts`

**Current:**
- `stepHandshakeFromHandoff(handoff, index)` → `ScenarioStepHandshake`
- `loadScenarioRuntimeHandoff(...)` reads `.runtime.json`

**Replace with:**
- `stepHandshakeFromPlan(plan: ScenarioRunPlan, index: number)` → `ScenarioStepHandshake`
- `loadScenarioInterpretationSurface(rootDir, adoId)` reads `.resolution.json` and returns `ScenarioInterpretationSurface`

**The `runScenarioStep` function** (lines 226–710) currently receives `StepTask` as its first parameter. After the rename alias in Slice 1, it receives `GroundedStep` with no code change. The function's internal logic is unchanged.

#### 3.3.4 `lib/application/emit.ts`

**Current:** `emitScenario(...)` calls `buildScenarioRuntimeHandoff(...)` and writes `.runtime.json`.

**Change:** Remove the runtime handoff emission. The function writes:
- `{ado_id}.spec.ts` — generated spec (now loads surface + derives plan)
- `{ado_id}.trace.json` — trace
- `{ado_id}.review.md` — review
- `{ado_id}.proposals.json` — proposals

**No longer writes:** `{ado_id}.runtime.json`

#### 3.3.5 Generated Spec Template

**Current:** Generated specs import `loadScenarioRuntimeHandoff` and use the handoff to run.

**Change:** Generated specs import `loadScenarioInterpretationSurface` and `prepareScenarioRunPlan`, then:
```ts
const surface = loadScenarioInterpretationSurface({ rootDir, adoId });
const plan = prepareScenarioRunPlan({ surface, catalog, paths, executionContextPosture });
```

This means generated specs use the **same boot path** as the CLI. The quasi-private runtime handoff boot path is eliminated.

#### 3.3.6 `lib/application/compat/surface-adapter.ts` — **DELETE**

No longer needed. All readers consume `ScenarioInterpretationSurface` directly.

#### 3.3.7 Cleanup

- Remove `ScenarioTaskPacket` from `resolution.ts` (or keep as a `/** @deprecated */` alias if external consumers exist)
- Remove `SelectedRunContext` from `select-run-context.ts`
- Remove `selectRunContext` shim
- Remove `StepTask` / `StepTaskGrounding` aliases if all consumers have migrated

**Completion criteria:**
- `grep -r 'RuntimeHandoff\|runtime-handoff\|\.runtime\.json' lib/ tests/` returns zero hits
- `npm run check` passes
- `.tesseract/tasks/` contains only `.resolution.json` files (no `.runtime.json`)

---

### Slice 4: Add the Shared Fold

**Goal:** Implement `foldScenarioRun(...)`. Migrate run record and review first. Then migrate benchmark and hotspot.

#### 3.4.1 `lib/application/execution/fold.ts` (new file)

**Core function:**
```ts
export function foldScenarioRun(input: {
  plan: ScenarioRunPlan;
  stepResults: RuntimeScenarioStepResult[];
  evidenceWrites: PersistedEvidenceArtifact[];
}): ScenarioRunFold
```

This function consolidates the three independent reduce operations currently in:
1. `build-run-record.ts` lines 63–107 (timing, cost, failure families, recovery)
2. `benchmark.ts` lines ~190–224 (same reduces over benchmark runs)
3. `hotspots.ts` lines ~95–210 (step-level iteration for hotspot detection)

See §4 for the detailed specification.

#### 3.4.2 `lib/application/execution/build-run-record.ts`

**Before:** 178 lines with ~100 lines of inline reduce operations.

**After:** ~40 lines. Reads `fold.executionMetrics`, `fold.translationMetrics`, `fold.evidenceIds`, and `fold.byStep` directly. The `translationMetrics(...)` local function (lines 14–47) is deleted — it moves into the fold.

#### 3.4.3 `lib/application/emit.ts`

**Before:** Review markdown rendering (lines ~102–197) computes metric summaries inline.

**After:** The fold provides pre-computed metrics. Review rendering reads `fold.executionMetrics` and `fold.translationMetrics`.

#### 3.4.4 `lib/application/benchmark.ts`

**Before:** `computeBenchmarkScorecard` (lines ~83–230) computes timing, cost, failure, recovery independently per run.

**After:** Scorecards aggregate `ScenarioRunFold` instances across benchmark runs. The per-run computation is replaced by reading the fold.

#### 3.4.5 `lib/application/hotspots.ts`

**Before:** `detectHotspots` (lines ~95–210) iterates step results to find failure patterns.

**After:** Hotspot detection reads `fold.byStep` entries, examining `failureFamily`, `winningSource`, `degraded`, and `resolutionMode` from each `StepFold`.

**Completion criteria:**
- `foldScenarioRun` exists and is the sole source of run-level metrics
- `build-run-record.ts`, `emit.ts`, `benchmark.ts`, and `hotspots.ts` all consume the fold instead of recomputing
- Agreement test passes (same surface + same results → same metrics from all consumers — see §6)
- `npm run check` passes

---

### Slice 5: Turn Projections into Interpreters

**Goal:** Split `emit.ts` into projector-oriented modules. Keep emission orchestration thin.

#### 3.5.1 New module structure

```
lib/application/projections/
  spec.ts          — specProjector: surface → Playwright spec code
  trace.ts         — traceProjector: surface + fold → trace JSON
  review.ts        — reviewProjector: surface + fold → review markdown
  proposals.ts     — proposalProjector: surface + fold + stepResults → proposal bundle
  index.ts         — barrel + ProjectorRegistry type
```

#### 3.5.2 Projector contract

```ts
// lib/application/projections/index.ts

export interface ScenarioProjectorInput {
  surface: ScenarioInterpretationSurface;
  fold?: ScenarioRunFold | null;
  stepResults?: RuntimeScenarioStepResult[] | null;
  latestRun?: RunRecord | null;
  paths: ProjectPaths;
}

export interface ScenarioProjectorOutput {
  fileName: string;
  content: string;
  fingerprint: string;
}

export type ScenarioProjector = (input: ScenarioProjectorInput) => ScenarioProjectorOutput;
```

#### 3.5.3 `lib/application/emit.ts` becomes thin

**Before:** 459 lines mixing projection assembly, artifact rendering, review assembly, handoff emission, fingerprinting.

**After:** ~80 lines of orchestration:
1. Load surface
2. Load fold (if run data available)
3. Run each projector
4. Write outputs with incremental caching
5. Return fingerprints

**Completion criteria:**
- Each projector is independently testable
- `emit.ts` has no inline rendering logic
- Adding a new projection is a new projector file + registry entry

---

### Slice 6: Resolution Ladder as Data

See §5 for the full treatment.

---

## 4. Fold Specification

### 4.1 The Three Independent Computations Today

The following table shows where the same data is currently computed independently.

| Metric | `build-run-record.ts` | `benchmark.ts` | `hotspots.ts` |
|---|---|---|---|
| Timing totals | Lines 63–74 (reduce over `step.execution.timing`) | Lines ~190–200 (same reduce) | — |
| Cost totals | Lines 75–78 | Lines ~200–203 | — |
| Budget breaches | Line 79 | Line ~224 | — |
| Failure families | Lines 80–88 | Lines ~204–209 | Lines ~120–130 (checks `family !== 'none'`) |
| Recovery families | Lines 89–96 | Lines ~210–215 | — |
| Recovery strategies | Lines 97–107 | Lines ~216–223 | — |
| Translation metrics | Lines 14–47 (`translationMetrics` function) | Lines ~225–230 (partial) | — |
| Step-level failure patterns | — | — | Lines ~95–210 (iterates step results) |
| Evidence IDs | Line 67 (map from evidenceWrites) | — | — |
| Observed state refs | — | — | Lines ~140–150 (from execution receipts) |

### 4.2 `foldScenarioRun` Implementation Specification

```ts
export function foldScenarioRun(input: {
  plan: ScenarioRunPlan;
  stepResults: RuntimeScenarioStepResult[];
  evidenceWrites: PersistedEvidenceArtifact[];
}): ScenarioRunFold {

  // 1. Build per-step folds
  const byStep = new Map<number, StepFold>();
  for (const result of input.stepResults) {
    const stepIndex = result.interpretation.stepIndex;
    const stepEvidence = input.evidenceWrites
      .filter(e => e.stepIndex === stepIndex)
      .map(e => e.artifactPath);

    byStep.set(stepIndex, {
      stepIndex,
      evidenceIds: stepEvidence,
      observedStateRefs: result.execution.observedStateRefs ?? [],
      matchedTransitionRefs: (result.execution.transitionObservations ?? [])
        .filter(t => t.matched)
        .map(t => t.ref),
      failureFamily: result.execution.failure?.family ?? 'none',
      failureCode: result.execution.failure?.code ?? null,
      failureMessage: result.execution.failure?.message ?? null,
      translation: result.interpretation.translation ?? null,
      recoveryAttempts: (result.execution.recovery?.attempts ?? [])
        .map(a => a.strategyId),
      timing: result.execution.timing,
      cost: result.execution.cost,
      budgetStatus: result.execution.budget?.status ?? 'not-configured',
      degraded: result.execution.degraded,
      resolutionMode: result.interpretation.resolutionMode,
      winningSource: result.interpretation.winningSource,
    });
  }

  // 2. Aggregate timing totals (replaces build-run-record.ts:63–74)
  const timingTotals = aggregateTimingTotals(byStep);

  // 3. Aggregate cost totals (replaces build-run-record.ts:75–78)
  const costTotals = aggregateCostTotals(byStep);

  // 4. Aggregate failure/recovery families (replaces build-run-record.ts:80–107)
  const { failureFamilies, recoveryFamilies, recoveryStrategies, budgetBreaches }
    = aggregateFailureMetrics(byStep, input.stepResults);

  // 5. Translation metrics (replaces build-run-record.ts:14–47)
  const translationMetrics = computeTranslationMetrics(input.stepResults);

  // 6. Aggregate evidence + state refs
  const evidenceIds = input.evidenceWrites.map(e => e.artifactPath);
  const observedStateRefs = uniqueSorted(
    [...byStep.values()].flatMap(s => s.observedStateRefs));
  const matchedTransitionRefs = uniqueSorted(
    [...byStep.values()].flatMap(s => s.matchedTransitionRefs));

  return {
    kind: 'scenario-run-fold',
    version: 1,
    adoId: input.plan.adoId,
    runId: input.plan.runId,
    surfaceFingerprint: input.plan.surfaceFingerprint,
    byStep,
    translationMetrics,
    executionMetrics: {
      timingTotals, costTotals, budgetBreaches,
      failureFamilies, recoveryFamilies, recoveryStrategies,
    },
    evidenceIds,
    observedStateRefs,
    matchedTransitionRefs,
  };
}
```

### 4.3 Fold Agreement Law

The following invariant must hold and should be tested:

> For the same `stepResults` and `evidenceWrites`, the fold's `executionMetrics` must exactly equal the metrics that `buildRunRecord` would have computed inline, the metrics that `computeBenchmarkScorecard` would have computed independently, and the failure pattern data that `detectHotspots` would have iterated.

This is testable by:
1. Computing the fold
2. Computing old-style metrics via the current inline reduces
3. Asserting deep equality

This test should use the seeded-randomized pattern from `precedence.laws.spec.ts` (75–150 seeds, Mulberry32 PRNG) over randomly generated step results.

---

## 5. Resolution Ladder as Data

### 5.1 Current Imperative Structure

`runResolutionPipeline` in `lib/runtime/agent/index.ts` (lines 169–457) follows this pattern **five times**:

```
attempt stage →
  if observation, push to observations[] →
    record exhaustion entry →
      if resolved, build receipt inline + update memory + return →
        else continue
```

The five stages and their current line ranges:

| # | Stage | Rung | Lines | Resolution Mode | Provenance Kind |
|---|---|---|---|---|---|
| 1 | Explicit check | `explicit` | 181–193 | `deterministic` | `explicit` |
| 2 | Approved knowledge (lattice → executable) | `approved-screen-knowledge` | 195–280 | `deterministic` | `approved-knowledge` |
| 3 | Confidence overlay | `approved-equivalent-overlay` | 282–320 | `deterministic` | `approved-knowledge` |
| 4 | Structured translation | `structured-translation` | 322–365 | `translation` | `approved-knowledge` |
| 5 | Live DOM exploration | `live-dom` | 367–430 | `agentic` | `live-exploration` |

After all stages exhaust, `needs-human` is emitted (lines 432–457).

### 5.2 Stage Definitions

```ts
// lib/runtime/agent/types.ts

export type ResolutionStageOutcome =
  | 'resolved'       // stage produced an executable target
  | 'attempted'      // stage ran but did not produce a target
  | 'skipped'        // stage was not applicable
  | 'failed';        // stage ran and determined resolution is impossible at this rung

export interface ResolutionStageResult {
  outcome: ResolutionStageOutcome;
  receipt: ResolutionReceipt | null;           // non-null only when outcome === 'resolved'
  observations: ResolutionObservation[];
  exhaustionEntries: ResolutionExhaustionEntry[];
  overlayRefs: string[];
  translation: TranslationReceipt | null;
  candidateSummary: ResolutionGraphCandidateSet | null;
}

export interface ResolutionStage {
  id: string;
  rung: ResolutionPrecedenceRung;
  tryResolve(ctx: RuntimeAgentStageContext): Promise<ResolutionStageResult>;
}
```

### 5.3 Stage Implementations

Each stage becomes a factory function that returns a `ResolutionStage`:

```ts
// lib/runtime/agent/stages/explicit.ts
export function explicitStage(): ResolutionStage {
  return {
    id: 'explicit',
    rung: 'explicit',
    async tryResolve(ctx) {
      const explicit = ctx.task.explicitResolution;
      if (explicit?.action && explicit.screen &&
          (!requiresElement(explicit.action) || explicit.element)) {
        return {
          outcome: 'resolved',
          receipt: explicitResolvedReceipt(ctx),
          observations: [],
          exhaustionEntries: [exhaust('explicit', 'resolved', '...')],
          overlayRefs: [],
          translation: null,
          candidateSummary: null,
        };
      }
      return {
        outcome: explicit ? 'attempted' : 'skipped',
        receipt: null,
        observations: [],
        exhaustionEntries: [exhaust('explicit', explicit ? 'attempted' : 'skipped', '...')],
        overlayRefs: [],
        translation: null,
        candidateSummary: null,
      };
    },
  };
}
```

Similarly for `approvedKnowledgeStage()`, `confidenceOverlayStage()`, `structuredTranslationStage()`, `liveDomStage()`.

### 5.4 The Stage Reducer

```ts
// lib/runtime/agent/pipeline.ts

export const defaultResolutionStages: ResolutionStage[] = [
  explicitStage(),
  approvedKnowledgeStage(),
  confidenceOverlayStage(),
  structuredTranslationStage(),
  liveDomStage(),
];

export async function runResolutionPipeline(
  task: StepTask,
  context: RuntimeStepAgentContext,
  stages: ResolutionStage[] = defaultResolutionStages,
): Promise<ResolutionReceipt> {

  const memory = normalizeObservedStateSession(task, context.observedStateSession ?? createEmpty());
  context.observedStateSession = memory;

  const stageCtx: RuntimeAgentStageContext = {
    task, context, memory,
    controlResolution: selectedControlResolution(task, context),
    controlRefs: selectedControlRefs(task, context),
    evidenceRefs: uniqueSorted(context.resolutionContext.evidenceRefs),
    exhaustion: [],
    observations: [],
    knowledgeRefs: [],
    supplementRefs: [],
    memoryLineage: memory.lineage,
  };

  for (const stage of stages) {
    const result = await stage.tryResolve(stageCtx);

    // Accumulate bookkeeping uniformly
    stageCtx.exhaustion.push(...result.exhaustionEntries);
    stageCtx.observations.push(...result.observations);

    if (result.outcome === 'resolved' && result.receipt) {
      updateObservedStateSessionAfterResolution(stageCtx, result.receipt);
      return result.receipt;
    }
  }

  // All stages exhausted → needs-human
  recordExhaustion(stageCtx.exhaustion, 'needs-human', 'failed', '...');
  return needsHumanReceipt(stageCtx, collectedOverlayRefs, collectedTranslation);
}
```

### 5.5 What This Buys

| Concern | Before (imperative) | After (table-driven) |
|---|---|---|
| Adding a new rung | Surgery across a ~290-line function | Insert a new stage factory in the array |
| Testing one rung in isolation | Must set up the full pipeline context | Test the stage's `tryResolve` directly |
| Precedence order | Implicit in control flow | Explicit in `defaultResolutionStages` array order |
| Exhaustion bookkeeping | Repeated inline at each stage | Uniform in the reducer loop |
| Observation collection | Repeated inline at each stage | Uniform in the reducer loop |
| Receipt construction | 5 separate inline constructions with `...needsHumanReceipt(stage, ...) as ResolutionReceipt` casts | Each stage owns its receipt shape |

### 5.6 Lattice Concern

The "approved knowledge" stage (current lines 195–280) is the most complex because it involves five lattice rankings (action, screen, element, posture, snapshot) and a composite executability check. This stage can be split further:

```ts
export function approvedKnowledgeStage(): ResolutionStage {
  return {
    id: 'approved-knowledge',
    rung: 'approved-screen-knowledge',
    async tryResolve(ctx) {
      const lattice = rankAllConcerns(ctx);
      if (lattice.executable) {
        return resolvedFromLattice(ctx, lattice);
      }
      return attemptedFromLattice(ctx, lattice);
    },
  };
}
```

The lattice ranking functions (`rankActionCandidates`, `rankScreenCandidates`, `rankElementCandidates`, `rankPostureCandidates`, `rankSnapshotCandidates`) remain in `lib/runtime/agent/lattice.ts` unchanged. The stage merely calls them and checks executability.

### 5.7 Invariants to Preserve

The existing `precedence.laws.spec.ts` and `runtime-agent-lattice.laws.spec.ts` tests must continue passing unchanged. New stage-level tests should prove:

1. **Stage isolation:** Each stage's `tryResolve` produces the same result regardless of the other stages' presence.
2. **Reducer completeness:** If all stages return `attempted` or `failed`, the reducer produces `needs-human`.
3. **Precedence identity:** `defaultResolutionStages.map(s => s.rung)` must equal `resolutionPrecedenceLaw.filter(r => r !== 'control' && r !== 'shared-patterns' && r !== 'prior-evidence' && r !== 'needs-human')` (the rungs that have active stage implementations).

---

## 6. Test Contract Catalogue

### 6.1 Surface Determinism Law

**Property:** Same scenario intent + same approved knowledge + same controls → same `ScenarioInterpretationSurface` (byte-identical after stable JSON serialization).

**Test pattern:** Seeded randomized (75 seeds, Mulberry32 PRNG). For each seed:
1. Generate a synthetic scenario with N steps (2–5)
2. Generate synthetic knowledge (screens, elements, patterns)
3. Call `buildScenarioInterpretationSurface(...)` twice with the same inputs
4. Assert `JSON.stringify(a) === JSON.stringify(b)`
5. Call with permuted screen order → assert same output (permutation invariance)

**Extends:** Pattern from `precedence.laws.spec.ts` (seeded determinism) and `collections.laws.spec.ts` (permutation invariance).

**File:** `tests/surface-determinism.laws.spec.ts`

### 6.2 No Secret Rehydration

**Property:** After a `ScenarioInterpretationSurface` is built, no file in `lib/application/execution/`, `lib/application/emit.ts`, `lib/application/run.ts`, `lib/runtime/scenario.ts`, or `lib/application/projections/` may import `buildInterfaceResolutionContext` from `../interface-resolution`.

**Test pattern:** Architecture import scan (same pattern as `tests/architecture.spec.ts`).

```ts
test('scenario-scoped code does not rebuild resolution context after surface exists', () => {
  const forbiddenImporter = /buildInterfaceResolutionContext/;
  const guardedFiles = [
    'lib/application/execution/',
    'lib/application/emit.ts',
    'lib/application/run.ts',
    'lib/runtime/scenario.ts',
    'lib/application/projections/',
  ];
  for (const file of guardedFiles) {
    const content = readSource(file);
    expect(content).not.toMatch(forbiddenImporter);
  }
});
```

**File:** `tests/architecture.spec.ts` (add to existing test suite)

### 6.3 Projection Agreement Law

**Property:** For the same surface and run fold, the spec, trace, review, and run record must agree on:
- target refs (from `surface.payload.steps[].grounding.targetRefs`)
- selector refs
- state refs (required, forbidden, result)
- event signature refs
- transition refs
- aggregate timing totals, cost totals, failure families, recovery strategies

**Test pattern:** Build a surface and fold from synthetic data. Run all four projectors. Assert that the refs and metrics embedded in each output match.

**File:** `tests/projection-agreement.laws.spec.ts`

### 6.4 Run Plan Precedence Law

**Property:**
- CLI override (`interpreterMode`, `providerId`) outranks runbook
- Runbook outranks posture default
- `prepareScenarioRunPlan(...)` does not reinterpret the scenario (surface steps in → same steps out)

**Test pattern:** Seeded randomized (50 seeds). For each seed:
1. Generate a surface and runbook with conflicting mode/provider
2. Call `prepareScenarioRunPlan(...)` with and without CLI overrides
3. Assert CLI override wins when present
4. Assert runbook wins when CLI override is absent
5. Assert `plan.steps === surface.payload.steps` (referential or deep equality)

**Extends:** Pattern from `precedence.laws.spec.ts`.

**File:** `tests/run-plan-precedence.laws.spec.ts`

### 6.5 Fold Agreement Law

**Property:** For the same step results and evidence writes, `foldScenarioRun(...)` produces metrics that are byte-identical to what `buildRunRecord` would have computed inline, what `computeBenchmarkScorecard` would have computed, and what `detectHotspots` would have iterated.

**Test pattern:** Seeded randomized (100 seeds). For each seed:
1. Generate synthetic step results with random timing, failures, recovery attempts, translations
2. Compute the fold via `foldScenarioRun(...)`
3. Compute old-style metrics via the extracted reduce functions
4. Assert deep equality on all metric fields

**File:** `tests/fold-agreement.laws.spec.ts`

### 6.6 Stage Isolation Law

**Property:** Each resolution stage's `tryResolve` is deterministic given the same `RuntimeAgentStageContext` — regardless of what stages ran before it.

**Test pattern:** For each stage, call `tryResolve` with a synthetic context. Assert the result is stable under repetition and under permutation of the stage array.

**File:** `tests/resolution-stages.laws.spec.ts`

### 6.7 Summary of New Test Files

| File | Slice | What It Proves |
|---|---|---|
| `tests/surface-determinism.laws.spec.ts` | 1 | Surface is deterministic, permutation-invariant |
| `tests/architecture.spec.ts` (additions) | 2 | No secret rehydration |
| `tests/run-plan-precedence.laws.spec.ts` | 2 | Plan precedence, no scenario reinterpretation |
| `tests/fold-agreement.laws.spec.ts` | 4 | Fold agrees with all consumers |
| `tests/projection-agreement.laws.spec.ts` | 5 | Projectors agree on refs and metrics |
| `tests/resolution-stages.laws.spec.ts` | 6 | Stage isolation, reducer completeness |

---

## 7. Risk Register and Migration Guardrails

### 7.1 Risk: Double `buildInterfaceResolutionContext` Call

**Where:** `task.ts` (~line 209) and `select-run-context.ts` (~line 132).

**What can go wrong:** During migration (Slices 1–2), both call sites exist simultaneously. If the inputs diverge (e.g., catalog state changes between calls), the surface and the plan could carry different resolution contexts.

**Mitigation:** In Slice 2, `prepareScenarioRunPlan` reads `resolutionContext` from the surface, never from the catalog. The second call site is deleted, not modified. The "no secret rehydration" architecture test (§6.2) prevents regression.

### 7.2 Risk: Payload Field Duplication on `ScenarioRuntimeHandoff`

**Where:** `resolution.ts:225–249`. Every payload field is mirrored as a top-level sibling.

**What can go wrong:** Consumers may reference either the payload path or the top-level path. Deleting `ScenarioRuntimeHandoff` in Slice 3 requires finding all consumers of both paths.

**Mitigation:** Before Slice 3, run:
```bash
grep -rn 'handoff\.\(adoId\|revision\|title\|suite\|screenIds\|steps\|resolutionContext\|fixtures\|controlSelection\|context\|posture\|providerId\|translationEnabled\|translationCacheEnabled\|recoveryPolicy\)' lib/ tests/
```
and verify each hit is migrated to use the plan's equivalent field.

### 7.3 Risk: Three Receipt Construction Sites in `scenario.ts`

**Where:** `lib/runtime/scenario.ts`:
- `needs-human` path (~lines 310–390): ~80 lines of manual receipt + execution receipt assembly
- `state-precondition-failed` path (~lines 410–500): ~90 lines
- `normal execution` path (~lines 650–700): ~50 lines

**What can go wrong:** If `StepExecutionReceipt` or `ResolutionReceipt` fields are changed as part of the kernel refactor, all three sites must be updated.

**Mitigation:** The kernel refactor does **not** change receipt types. `GroundedStep` is a rename alias of `StepTask`, so all three sites compile without change. The receipt construction sites can be consolidated in a later refactor (perhaps as part of `GroundedStepProgram`), but this is not a prerequisite for the kernel.

### 7.4 Risk: Mid-Run Catalog Reload in `run.ts`

**Where:** `lib/application/run.ts` (~line 94). After execution, the catalog is reloaded to pick up newly written evidence and resolution artifacts.

**What can go wrong:** If the surface is loaded from the catalog and the catalog is reloaded mid-run, a stale surface reference could be replaced by a new one if the surface file was rewritten during execution.

**Mitigation:** The run function loads the surface **once** at the top (before execution starts). The mid-run catalog reload is for evidence and proposal artifact discovery, not for reloading the surface. The plan derived from the surface is an in-memory value object — it is not affected by catalog reloads.

### 7.5 Risk: `emitScenario` Reassembling Projection Input from Catalog

**Where:** `lib/application/emit.ts` (~lines 88–102). The function independently loads catalog entries, finds the latest run, proposals, sessions, and learning manifest, and assembles a `ScenarioProjectionInput`.

**What can go wrong:** If `emitScenario` still reaches into the catalog for scenario truth after the surface exists, the "no secret rehydration" invariant is violated.

**Mitigation:** In Slice 5, `emitScenario` is refactored to receive a `ScenarioInterpretationSurface` directly. It may still consult the catalog for run-scoped data (latest run record, proposals, sessions) — that is not scenario truth rehydration. The architecture test (§6.2) specifically guards against importing `buildInterfaceResolutionContext` in emit-scoped code.

### 7.6 The `npm run check` Gate

Every slice must pass `npm run check` before and after. The check gate runs:
1. `npm run lint` — hand-authored code only
2. `npm run typecheck` — includes `tests/`
3. `npm test` — all tests

**CI contract:** The pipeline runs `npm run check` on every PR. No slice may be merged with a failing check.

**Agent protocol:** After completing any file change within a slice, immediately run:
```bash
npm run typecheck
npm test
```
If either fails, fix before proceeding to the next file.

---

## 8. Decision Log

### 8.1 Version Number: Reset to 1

`ScenarioInterpretationSurface` uses `version: 1` despite `ScenarioTaskPacket` being at `version: 5`.

**Rationale:** The `kind` discriminant changes from `'scenario-task-packet'` to `'scenario-interpretation-surface'`. Since `kind` is the primary discriminant for versioned deserialization, a new `kind` starts its own version series. This avoids confusion about whether version `6` of a task packet is backward-compatible with version `5`.

### 8.2 `stepFingerprint` vs `taskFingerprint`

`GroundedStep` uses `stepFingerprint` instead of `taskFingerprint`.

**Rationale:** The fingerprint identifies the grounded step, not a "task." The scenario-level fingerprint (`surfaceFingerprint`) identifies the surface derivation. Using different names prevents confusion about scope.

### 8.3 `ScenarioRunPlan` Carries `translationEnabled` and `translationCacheEnabled`

The research doc's proposed `ScenarioRunPlan` did not include these fields. The implementation adds them.

**Rationale:** The current `SelectedRunContext` carries both. They are run-scoped execution choices (derived from runbook settings), not scenario truth. The plan is the right home for them.

### 8.4 `ScenarioRunFold` Uses `ReadonlyMap`

**Rationale:** The fold is computed once and consumed by multiple projections. `ReadonlyMap` communicates immutability at the type level. For JSON serialization (if needed), convert to `Record<number, StepFold>`.

### 8.5 Resolution Stages: Separate Files per Stage

Each stage gets its own file in `lib/runtime/agent/stages/`.

**Rationale:** Each stage has distinct dependencies (lattice ranking, overlay resolution, translation, DOM probing). Separate files keep the dependency graph narrow and make each stage independently testable.

### 8.6 Compatibility Aliases Are Temporary

`StepTask = GroundedStep` and similar aliases are deprecated from Slice 1 and removed no later than the end of Slice 3.

**Rationale:** Permanent aliases would create a second name for the same concept — the exact problem the refactor solves. The aliases exist only to allow incremental migration.

---

## Appendix: Quick Reference

### File Impact Summary

| File | Lines Today | Slice | Change | Expected Lines After |
|---|---|---|---|---|
| `lib/domain/types/resolution.ts` | 623 | 1, 2, 3 | Add kernel + plan types, delete handoff | ~580 |
| `lib/application/task.ts` | 397 | 1 | Add surface builder, keep shim | ~420 |
| `lib/application/execution/select-run-context.ts` | 198 | 2, 3 | Add plan builder, delete shim | ~130 |
| `lib/application/runtime-handoff.ts` | 119 | 3 | **Delete** | 0 |
| `lib/application/run.ts` | 249 | 2 | Consume plan + fold | ~200 |
| `lib/application/emit.ts` | 459 | 3, 5 | Remove handoff emission, split projectors | ~80 |
| `lib/application/execution/build-run-record.ts` | 178 | 2, 4 | Consume fold | ~60 |
| `lib/application/benchmark.ts` | 434 | 4 | Consume fold | ~380 |
| `lib/application/hotspots.ts` | 275 | 4 | Consume fold | ~220 |
| `lib/runtime/scenario.ts` | 710 | 3 | Load surface, handshake from plan | ~700 |
| `lib/runtime/agent/index.ts` | 457 | 6 | Extract stages, thin reducer | ~80 |
| `lib/runtime/agent/stages/` (new) | 0 | 6 | 5 stage files | ~400 total |
| `lib/application/execution/fold.ts` (new) | 0 | 4 | Fold builder | ~120 |
| `lib/application/projections/` (new) | 0 | 5 | 4 projector files + barrel | ~350 total |
| `lib/application/compat/surface-adapter.ts` (new, temporary) | 0 | 1 | Adapter | ~40 |

### Net Code Change Estimate

| Metric | Estimate |
|---|---|
| Lines added (new files) | ~910 |
| Lines deleted (handoff, inline reduces, projection mixing) | ~650 |
| Lines modified (type renames, function signatures) | ~300 |
| Net change | +260 lines |
| Files deleted | 2 (`runtime-handoff.ts`, `compat/surface-adapter.ts`) |
| New files | ~12 |
| New test files | 5 |

The small net positive line count reflects that the refactor is primarily a responsibility redistribution, not a feature addition. The new test files account for most of the growth.

### Command Cheat Sheet for Agents

```bash
# Orientation
npm run context          # repo brief
npm run paths            # canonical vs derived
npm run surface          # active surfaces

# Verification after each file change
npm run typecheck        # must pass
npm test                 # must pass
npm run check            # full gate (lint + typecheck + test)

# Grep guards before Slice 3 deletion
grep -rn 'ScenarioRuntimeHandoff' lib/ tests/
grep -rn 'runtime-handoff' lib/ tests/
grep -rn '\.runtime\.json' lib/ tests/
grep -rn 'buildInterfaceResolutionContext' lib/application/execution/ lib/application/emit.ts lib/application/run.ts lib/runtime/scenario.ts

# Impact analysis
npm run impact           # cross-reference changes
npm run trace            # artifact lineage
```
