# Seams and Invariants

The coding notes explain what the architecture is and why it works. This document explains what must *stay true* as you implement it — the typed seams between stages, the invariants that hold at each boundary, the law tests that enforce them, and the composition patterns that wire the system together.

If you break an invariant during implementation, the architecture hasn't changed. You've introduced a bug.

---

## What a Law Test Is

The codebase distinguishes law tests (`*.laws.spec.ts`) from contract tests (`*.spec.ts`). The distinction is precise:

**A law test proves a property that must hold for all valid inputs, not just for specific examples.**

A contract test says: "given this specific scenario fixture, binding produces this specific output." A law test says: "for *any* valid input permutation, binding is deterministic, idempotent, and precedence-preserving."

Law tests in this codebase use a specific technique: **seeded randomized property testing** via a Mulberry32 PRNG:

```typescript
function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

for (let seed = 1; seed <= 150; seed += 1) {
  const next = mulberry32(seed);
  const randomValues = Array.from({ length: 40 }, () => randomWord(next));
  const once = normalize(randomValues);
  const twice = normalize(once);
  expect(twice).toEqual(once); // idempotency across 150 random seeds
}
```

This isn't fuzz testing. It's reproducible — every seed produces the same sequence. If seed 73 breaks, you debug seed 73. But by sweeping 75-150 seeds, you cover enough input diversity to catch ordering assumptions, deduplication bugs, and edge cases that a handful of hand-crafted fixtures would miss.

### When to Write a Law Test

Write a law test when you're implementing something that must be:

- **Deterministic**: same inputs → same outputs regardless of input ordering
- **Idempotent**: `f(f(x)) === f(x)` — applying a normalization twice produces the same result as applying it once
- **Precedence-preserving**: a ranked ordering holds across all valid candidate permutations
- **Round-trip safe**: `validate(validate(x)) === validate(x)` — validation is a projection, not a lossy transform
- **Permutation-invariant**: shuffling the input collection doesn't change the output
- **Fingerprint-stable**: equivalent inputs produce identical hashes

Write a contract test when you're verifying a specific behavior at a boundary: a port negotiation, an adapter implementation, a fixture-based integration path.

### The Existing Law Tests

| File | What it proves |
|---|---|
| `tests/precedence.laws.spec.ts` | Resolution precedence holds under candidate permutation; explicit outranks control outranks approved-knowledge; needs-human only after all machine rungs exhausted; ordering stability across permuted inputs |
| `tests/posture-contract.laws.spec.ts` | `normalizeScreenPostures` is idempotent across 75 random seeds; `normalizePostureEffects` is idempotent with stable sort order across 90 seeds; effect deduplication uses deterministic sort keys; validation emits stable issues across 70 seeds |
| `tests/collections.laws.spec.ts` | `uniqueSorted` is deterministic and idempotent across 150 random string sets; `sortByStringKey` is stable for equal keys; `groupBy` is deterministic and preserves insertion order |
| `tests/translation-cache.laws.spec.ts` | Cache key is stable for equivalent inputs; cache key invalidates when fingerprints change; translation-disabled replay is reproducible |
| `tests/runtime-agent-lattice.laws.spec.ts` | Candidate lattice precedence preserves explicit > control > approved-knowledge; screen and element ranking deterministic under permutation; working-memory priors boost same-screen continuation |

---

## The Seam Map

The system has five major seams — typed boundaries where one stage hands off to the next. Each seam has a contract (the types that cross it), invariants (what must hold), and tests (what enforces it).

### Seam 1: Knowledge → Workspace Session

**What crosses**: Raw YAML knowledge artifacts are loaded, validated, and indexed into a `WorkspaceSession`.

**Contract types**:
- Input: `SurfaceGraph`, `ScreenElements`, `ScreenHints`, `ScreenPostures`, `SharedPatterns` (from YAML)
- Output: `WorkspaceSession` containing `WorkspaceScreenIndexes` (maps of ScreenId → indexed knowledge)

**Invariants**:
- Validation is round-trip safe: `validate(validate(x)) === validate(x)` — proven in `domain-validation-lanes.spec.ts`
- Normalization is idempotent: postures normalized once stay normalized — proven in `posture-contract.laws.spec.ts`
- Error paths preserve schema context: validation failures carry `schema.path` for precise diagnostics — proven in `domain-validation-lanes.spec.ts`
- Collections are deterministically sorted: `uniqueSorted` output is stable — proven in `collections.laws.spec.ts`

**Effect pattern**: `loadWorkspaceSession()` yields `FileSystem` to read, then builds indexes in pure domain code.

**When implementing Phase 2 (State/Event Topology)**: New knowledge artifacts (state nodes, transitions, event signatures) must pass through this same seam. Add validation functions in `lib/domain/validation/interface.ts`. Prove round-trip safety. Prove normalization idempotency if any normalization is applied.

### Seam 2: Workspace Session → Resolution

**What crosses**: A scenario's steps are resolved against the knowledge layer, producing typed resolution receipts.

**Contract types**:
- Input: `StepTask` (scenario step + runtime knowledge slice), `RuntimeStepAgentContext` (working memory, DOM resolver, provider, mode)
- Output: `ResolutionReceipt` (which rung won, what was exhausted, provenance chain)

**Invariants**:
- **Precedence law**: Resolution follows the fixed rung order and short-circuits at the first match — proven in `precedence.laws.spec.ts` and `runtime-agent-pipeline.spec.ts`:

  ```
  1. explicit scenario fields
  2. resolution controls
  3. approved screen knowledge
  4. shared patterns
  5. prior evidence (approved-equivalent overlays)
  6. structured translation
  7. live DOM exploration
  8. safe degraded resolution
  9. needs-human
  ```

- **Permutation invariance**: Reordering resolution controls or candidates doesn't change which rung wins — proven in `precedence.laws.spec.ts`
- **Exhaustion completeness**: When `needs-human` fires, every preceding rung has an exhaustion record — proven in `precedence.laws.spec.ts`
- **Lattice determinism**: Candidate ranking for action, screen, element, posture, and snapshot is deterministic under permutation — proven in `runtime-agent-lattice.laws.spec.ts`
- **Working memory coherence**: Memory is bounded (6 entity keys, 6 surfaces, 8 assertions), subject to staleness TTL (5 steps), and confidence floor (0.35) — tested in `runtime-agent-lattice.laws.spec.ts`

**Effect pattern**: `runResolutionPipeline()` is a pure function from `(StepTask, RuntimeStepAgentContext)` → `ResolutionReceipt`. It does not use Effect — resolution is synchronous and pure (DOM access is injected as a resolver function, not as an Effect dependency).

**When implementing Phase 2**: State preconditions and event signatures become part of the resolution context. The precedence law must not change — state checks are resolved through the same rung ladder, not through a parallel mechanism. Add law tests proving that state-aware resolution doesn't alter the rung ordering for non-state concerns.

**When implementing Phase 3 (Scenario Decomposition)**: The `ScenarioDecomposition` type must bind every step target to a `CanonicalTargetRef`, every state dependency to a `StateNode`, and every action to an `EventSignature`. The binding must be deterministic — same decomposition for same inputs. Law test it.

### Seam 3: Resolution → Execution

**What crosses**: Resolution receipts plus runtime context produce execution receipts with full provenance.

**Contract types**:
- Input: `ResolutionReceipt`, `Page` (Playwright), widget contracts
- Output: `StepExecutionReceipt` (timing, cost, failure classification, recovery attempts, execution observation)

**Invariants**:
- **Governance derivation**: Governance state is deterministically derived from execution outcome — proven in `execution-stages.spec.ts`:
  - Explicit or approved resolution + successful execution → `governance: approved`
  - Resolution with proposals → `governance: review-required`
  - `needs-human` → `governance: review-required` or `blocked`
  - Failed execution → `governance: blocked`
- **Failure classification**: Every failure has a family (none/precondition/locator-degradation/environment-runtime) and a code — no unclassified failures allowed
- **Recovery provenance**: Every recovery attempt has a strategyId, family, attempt number, and result (recovered/failed/skipped) — no silent retries
- **Timing decomposition**: Total duration = setup + resolution + action + assertion + retries + teardown — no unaccounted time

**Effect pattern**: Execution uses `RuntimeScenarioRunner` port (injected via Effect `Context.Tag`) which wraps Playwright page interactions. The port boundary isolates domain logic from browser I/O.

**When implementing Phase 4 (Readable Emission)**: The emitted spec must route through the same execution pipeline. Every helper in the emitted code maps to: resolve target → select probe → enforce precondition → dispatch event → observe transition → record receipt. The receipt structure doesn't change — emission is a codegen concern, not an execution concern.

### Seam 4: Execution → Projection

**What crosses**: Run records and execution receipts are projected into review artifacts, proposals, learning fragments, graph updates, and scorecard metrics.

**Contract types**:
- Input: `RunRecord` (aggregated step results), `ProposalBundle`, `WorkspaceSession`
- Output: emitted specs, trace JSON, review markdown, inbox projections, graph deltas, learning fragments, session ledger, scorecard metrics

**Invariants**:
- **Projection agreement**: All projection surfaces must agree on what happened. The emitted spec, the trace JSON, the review markdown, and the graph must tell the same story about which resolution stage won each step — tested via `domain.spec.ts` graph derivation and `architecture.spec.ts` structural contracts
- **Fingerprint stability**: Graph node and edge fingerprints are deterministic from their inputs — proven in `domain.spec.ts`
- **Learning fragment provenance**: Every `GroundedSpecFragment` keys back to graphNodeIds, selectorRefs, and assertionAnchors — structural contract in `lib/domain/types/learning.ts`
- **Session ledger completeness**: Every run produces a session with typed events (orientation, artifact-inspection, execution-reviewed at minimum) — tested in `execution-stages.spec.ts`
- **Proposal lineage**: Every `ProposalEntry` carries evidenceIds, impactedSteps, and trustPolicy evaluation — structural contract

**Effect pattern**: Projection is orchestrated in `compileScenario()` and `runScenario()` using `Effect.gen()` chains that yield `FileSystem` for persistence. The pipeline stage abstraction (`lib/application/pipeline/stage.ts`) provides incremental caching: if input fingerprints haven't changed, the stage is skipped.

**When implementing Phase 5 (Agent Workbench)**: New session event types must flow through the same ledger. The adapter abstraction (`AgentSessionAdapter`) must produce the same events regardless of provider. Add contract tests proving that `deterministicAdapter()` and `copilotAdapter()` produce structurally equivalent session envelopes.

**When implementing Phase 6 (Learning)**: New training corpora must key back to target refs, state transitions, and event signatures. The `TrainingCorpusManifest` must be deterministically derivable from run records. Law test: same run records → same manifest.

### Seam 5: Projection → Knowledge (The Promotion Boundary)

**What crosses**: Proposals flow through trust-policy evaluation into canonical knowledge.

**Contract types**:
- Input: `ProposalEntry` with trustPolicy evaluation
- Output: approved knowledge changes (hints, patterns, elements, surfaces, snapshots)

**Invariants**:
- **Canon never self-mutates**: No derived layer can write to canonical knowledge paths without flowing through the proposal pipeline — architectural constraint
- **Trust-policy gatekeeping**: `forbiddenAutoHealClasses` (assertion-mismatch, structural-mismatch) are never auto-approved — tested in trust-policy validation
- **Approval receipt parity**: Auto-approved proposals generate the same receipt structure as manually approved proposals — structural contract
- **Rerun plan derivation**: Every approval generates a rerun plan identifying affected scenarios — tested in `execution-stages.spec.ts`
- **Profile constraints**: `ci-batch` never auto-approves; `dogfood` auto-approves within thresholds; `interactive` requires opt-in — execution profile contracts

**Effect pattern**: `approveProposal()` yields `FileSystem` to read the proposal, evaluates trust policy, writes the canonical change, and emits a rerun plan.

**When implementing Phase 7 (Scale)**: Incremental recomputation must respect the fingerprint-based change detection in `lib/application/pipeline/incremental.ts`. When a canonical knowledge artifact changes (via approval), only scenarios whose input fingerprints include that artifact should recompile. The rerun plan is the mechanism — it must correctly identify the affected set.

---

## The Effect Composition Model

Tesseract uses [Effect](https://effect.website/) for application orchestration. The patterns are consistent and should stay consistent.

### Ports (Dependency Injection)

Four ports are defined as `Context.Tag` services in `lib/application/ports.ts`:

```typescript
class FileSystem extends Context.Tag('tesseract/FileSystem')<FileSystem, FileSystemPort>() {}
class AdoSource extends Context.Tag('tesseract/AdoSource')<AdoSource, AdoSourcePort>() {}
class RuntimeScenarioRunner extends Context.Tag('tesseract/RuntimeScenarioRunner')<RuntimeScenarioRunner, RuntimeScenarioRunnerPort>() {}
class ExecutionContext extends Context.Tag('tesseract/ExecutionContext')<ExecutionContext, ExecutionContextPort>() {}
```

Application code yields these ports to access I/O:

```typescript
const fs = yield* FileSystem;
await fs.writeFile(path, content);
```

**Rule**: Domain code never yields ports. Runtime code never yields application ports. Infrastructure implements ports. This is enforced by `tests/architecture.spec.ts`, which scans import graphs.

### Pipeline Stages (Composable Projections)

The `PipelineStage` abstraction in `lib/application/pipeline/stage.ts` models a composable projection step:

```typescript
interface PipelineStage<Dependencies, Computed, Persisted, Error, Requirements> {
  name: string;
  loadDependencies?: () => Effect<Dependencies, Error, Requirements>;
  compute: (deps: Dependencies) => Effect<Computed, Error, Requirements>;
  fingerprintInput?: (deps, computed) => string;
  fingerprintOutput?: (deps, computed) => string | null;
  persist?: (deps, computed) => Effect<{ result: Persisted; rewritten: string[] }, Error, Requirements>;
}
```

Stages compose sequentially. Each stage declares its dependencies, computes its output, optionally fingerprints both sides, and persists if needed.

### Incremental Caching

`lib/application/pipeline/incremental.ts` provides `runIncrementalStage()`, which wraps a pipeline stage with fingerprint-based caching:

1. Compute input fingerprints from the stage's dependencies
2. Check if a manifest exists with matching input fingerprints and a persisted output fingerprint
3. If match: skip computation, return cache-hit result
4. If miss: compute, persist, write manifest with new fingerprints, return cache-miss result

**Invariant**: Incremental caching must be semantically transparent — `runIncrementalStage(stage)` must produce the same observable result as running the stage directly, modulo the caching side effect. The fingerprint function must be injective enough that distinct inputs produce distinct fingerprints. If in doubt, invalidate more aggressively.

### Error Handling

Two utility functions in `lib/application/effect.ts`:

```typescript
function trySync<A>(thunk: () => A, code: string, message: string): Effect<A, TesseractError>
function tryAsync<A>(thunk: () => Promise<A>, code: string, message: string): Effect<A, TesseractError>
```

All application errors are `TesseractError` with a code and message. Errors propagate through Effect's failure channel. Domain code throws plain exceptions (caught at the application boundary). Infrastructure code throws adapter-specific errors (wrapped by the port implementation).

---

## Architectural Boundary Enforcement

`tests/architecture.spec.ts` enforces layer isolation by scanning the actual import graph. This is not a lint rule that can be suppressed — it is a test that fails CI.

**Enforced constraints**:

| Layer | May import | Must NOT import |
|---|---|---|
| `lib/domain/` | Nothing external to domain | `application`, `infrastructure`, `runtime`, `@playwright/test`, `fs`, `path` |
| `lib/application/` | `lib/domain/`, application-local modules | `infrastructure`, `runtime` |
| `lib/runtime/` | `lib/domain/`, runtime-local modules | `application`, `infrastructure` |
| `lib/infrastructure/` | `lib/domain/`, `lib/application/` ports | `runtime` |

**Structural contracts** (also in `architecture.spec.ts`):
- Lane seam files must exist: `model.ts`, `validation.ts`, `ops.ts`, `index.ts`
- Legacy directories must be empty: `lib/compiler/`, `lib/adapters/`, `lib/tools/`, `lib/reporter/`
- Canonical surface directories must exist: `benchmarks/`, `controls/datasets/`, `controls/resolution/`, `controls/runbooks/`

**When adding new modules**: If your new module is in `lib/domain/`, importing `fs` will fail the architecture test. If your new module is in `lib/runtime/`, importing from `lib/application/` will fail. These are not suggestions — they are CI gates. Design your module to respect the boundary before writing code.

---

## Validation Lane Structure

Validation is organized by workflow lane in `lib/domain/validation/`:

| Lane | File | What it validates |
|---|---|---|
| Intent | `intent.ts` | Scenario structure, step schemas, metadata |
| Knowledge | `knowledge.ts` | Surfaces, elements, postures, hints, patterns, snapshots |
| Resolution | `resolution.ts` | Controls, datasets, runbooks, resolution overrides |
| Execution | `execution.ts` | Benchmarks, execution contexts, run records |
| Projection | `projection.ts` | Derived graphs, fingerprints |
| Interface | `interface.ts` | Interface graph, selector canon |
| Session | `session.ts` | Session envelopes, event streams |
| Learning | `learning.ts` | Training corpora, replay examples |
| Routes | `routes.ts` | Route definitions, URL patterns |
| Trust Policy | `trust-policy.ts` | Policy thresholds, auto-approval gates |

**Validation properties that must hold across all lanes**:

1. **Round-trip safety**: `validate(validate(x))` must equal `validate(x)`. Validation may normalize (sort, dedup, canonicalize), but applying it twice must be the same as applying it once.

2. **Error path preservation**: When validation fails, the error must carry a `schema.path` that identifies exactly which field failed, not a generic "invalid input" message.

3. **Normalization idempotency**: If validation normalizes (sorts collections, deduplicates entries), the normalization must be idempotent. Prove this with seeded randomized tests.

4. **Reference integrity**: When an artifact references another artifact (a step references a screen, a proposal references evidence), validation should verify the reference exists in the current workspace context.

**When adding validation for new types** (Phase 2 state nodes, Phase 3 decomposition): Follow the existing lane structure. Add the validator to the appropriate lane file. Write a round-trip law test. Write an error-path contract test.

---

## Invariant Catalog by Phase

### Phase 1 Invariants (Interface Graph + Selector Canon)

These already exist and are tested:

| Invariant | What it means | Where tested |
|---|---|---|
| Graph determinism | Same knowledge inputs → same graph | `domain.spec.ts` |
| Fingerprint stability | Same node/edge inputs → same fingerprint | `domain.spec.ts` |
| Selector deduplication | One `CanonicalTargetRef` per semantic target | `interface-intelligence.ts` structural contract |
| Probe health tracking | Health status derived from confidence records | `interface-intelligence.ts` |
| Canon summary accuracy | Summary counts match actual entries | `interface-intelligence.ts` |

### Phase 2 Invariants (State + Event Topology) — To Implement

| Invariant | What it means | How to test |
|---|---|---|
| State node identity | Each named state gets exactly one `StateNode` | Law test: same state descriptions → same node IDs regardless of input order |
| Transition uniqueness | Each (source, trigger, target) triple is stored once | Law test: duplicate transitions collapse under normalization |
| Event signature completeness | Every event signature declares preconditions, effects, and expected transitions | Validation contract: signatures without effects are rejected |
| Transition reuse | Multiple scenarios referencing the same state dependency share one transition ID | Law test: bind two scenarios against same state dependency, verify same transition ref |
| State graph acyclicity | The state transition graph has no unreachable cycles (reveal → hide → reveal is fine; but A → B → C → A with no external trigger is suspect) | Graph property test |
| Receipt transition recording | Runtime receipts record observed transition IDs, not freeform notes | Contract test: receipt must contain transition refs when step depends on state |

### Phase 3 Invariants (Scenario Decomposition) — To Implement

| Invariant | What it means | How to test |
|---|---|---|
| Decomposition determinism | Same ADO text + same knowledge → same decomposition | Law test across input permutations |
| Target ref binding completeness | Every step target binds to a `CanonicalTargetRef` or explicitly records unbinding | Validation: no orphaned step targets |
| State ref binding | Steps with state dependencies bind to `StateNode` refs | Contract test: step with field reveal binds to transition |
| Grounding completeness | `GroundedSpecFlow` contains no unresolved prose — every fragment points to graph nodes | Validation: reject flows with unbound fragments |
| Decomposition stability | Changing an unrelated scenario doesn't change this scenario's decomposition | Law test: decompose with/without unrelated scenarios, verify identity |

### Phase 4 Invariants (Readable Emission) — To Implement

| Invariant | What it means | How to test |
|---|---|---|
| Emission-execution parity | Emitted spec exercises the same resolution pipeline as machine truth | Contract test: emit + execute, compare receipt against trace JSON |
| Readable surface stability | Same `GroundedSpecFlow` → same emitted TypeScript | Law test: deterministic codegen |
| AST round-trip | Generated TypeScript parses to valid AST | Contract test: parse emitted spec, verify no syntax errors |
| Helper-to-pipeline mapping | Every emitted helper maps to resolve → select → enforce → dispatch → observe → record | Structural test: emitted code references only canonical pipeline functions |

### Phase 5 Invariants (Agent Workbench) — To Implement

| Invariant | What it means | How to test |
|---|---|---|
| Provider equivalence | Same scenario executed through different adapters produces same resolution receipts | Contract test: deterministic adapter vs copilot adapter, compare receipts |
| Event vocabulary completeness | Every provider emits at least: orientation, artifact-inspection, execution-reviewed | Contract test per adapter |
| Session ledger determinism | Same run → same session envelope (excluding timestamps) | Law test: normalize timestamps, verify identity |
| Workbench degradation | When no agent is present, all artifacts still emit (as structured reports) | Contract test: run with no provider, verify output artifacts exist |

### Phase 6 Invariants (Learning) — To Implement

| Invariant | What it means | How to test |
|---|---|---|
| Fragment provenance completeness | Every `GroundedSpecFragment` keys to graphNodeIds and selectorRefs | Validation: reject fragments without refs |
| Corpus manifest determinism | Same run records → same manifest | Law test |
| Replay reproducibility | Replaying an example with the same knowledge produces the same resolution receipts | Integration test: run, capture replay example, replay, compare |
| Learning-canon separation | Learning artifacts never write to canonical knowledge paths | Architecture test: scan learning output paths |

### Phase 7 Invariants (Scale) — To Implement

| Invariant | What it means | How to test |
|---|---|---|
| Incremental transparency | Cached result = computed result for same inputs | Law test: compute with and without cache, compare |
| Fingerprint injectivity | Distinct inputs → distinct fingerprints (with high probability) | Property test: generate many inputs, verify no collisions |
| Rerun plan correctness | Approval rerun plan includes exactly the scenarios whose input fingerprints include the changed artifact | Contract test: approve, verify rerun set |
| Bounded recomputation | Changing one screen's knowledge recompiles only scenarios that reference that screen | Integration test: measure recompile set size |

---

## Testing Patterns to Follow

### Pattern 1: Seeded Randomized Idempotency

Use this for any normalization or canonicalization function:

```typescript
import { test, expect } from '@playwright/test';

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('normalizeStateTransitions is idempotent across random seeds', () => {
  for (let seed = 1; seed <= 100; seed += 1) {
    const next = mulberry32(seed);
    const transitions = buildRandomTransitions(next);
    const once = normalizeStateTransitions(transitions);
    const twice = normalizeStateTransitions(once);
    expect(twice).toEqual(once);
  }
});
```

### Pattern 2: Permutation Invariance

Use this for any precedence or ranking function:

```typescript
test('state transition resolution obeys precedence under permutation', () => {
  const base = buildTaskWithStateTransitions();
  const permuted = {
    ...base,
    transitions: [...base.transitions].reverse(),
  };
  expect(resolveTransition(base)).toEqual(resolveTransition(permuted));
});
```

### Pattern 3: Round-Trip Validation

Use this for any validation function:

```typescript
test('state node validation round-trips', () => {
  const fixture = buildValidStateNode();
  const validated = validateStateNode(fixture);
  expect(validateStateNode(validated)).toEqual(validated);
});

test('state node validation preserves error path', () => {
  const invalid = { ...buildValidStateNode(), triggers: 'not-an-array' };
  expectSchemaPath(() => validateStateNode(invalid), 'triggers');
});
```

### Pattern 4: Architecture Boundary Scan

The existing architecture test scans imports. When you add a new module, it's automatically covered. But if you add a new layer or a new port, add it explicitly:

```typescript
test('new-layer does not import forbidden dependencies', () => {
  // Follow the pattern in tests/architecture.spec.ts
});
```

### Pattern 5: Contract Test for Port Implementations

Use this when implementing a new adapter or provider:

```typescript
test('new adapter produces structurally valid session', () => {
  const adapter = newAdapter();
  const events = adapter.eventVocabulary(taskPacket, artifacts);
  expect(events.length).toBeGreaterThanOrEqual(3); // orientation, inspection, review
  for (const event of events) {
    expect(event.type).toBeDefined();
    expect(event.actor).toBeDefined();
    expect(event.references).toBeDefined();
  }
});
```

---

## Test File Naming and Organization

| Pattern | Meaning | Example |
|---|---|---|
| `tests/{concern}.spec.ts` | Contract test for a specific concern | `tests/domain.spec.ts`, `tests/controls.spec.ts` |
| `tests/{concern}.laws.spec.ts` | Law test proving invariants | `tests/precedence.laws.spec.ts` |
| `tests/{layer}-{concern}.spec.ts` | Tests specific to a layer boundary | `tests/runtime-agent-pipeline.spec.ts` |
| `tests/{layer}-{concern}.laws.spec.ts` | Law tests for a layer boundary | `tests/runtime-agent-lattice.laws.spec.ts` |

All tests use Playwright test runner (`import { test, expect } from '@playwright/test'`). Tests are flat — no nested `describe()` blocks. Test names are descriptive sentences that state the property being verified.

### Fixture Helpers

Common test helpers build domain objects with sensible defaults and explicit overrides:

```typescript
function buildTask(overrides?: Partial<StepTask>): StepTask
function baseStep(explicit?: boolean): StepTask
function fakeSelectedContext(runId: string, options?): SelectedRunContext
function fakeStepResult(input: { stepIndex: number; interpretationKind: string; status?: string }): RuntimeScenarioStepResult
```

For filesystem-dependent tests:

```typescript
function createTestWorkspace(name: string): TestWorkspace  // copies fixtures to temp dir with cleanup
function readJsonFixture<T>(...segments: string[]): T
function readYamlFixture(...segments: string[])
```

---

## Addendum: Confidence, Governance, and Equivalence — The Precise Definitions

These three dimensions are orthogonal. Confusing them is the most common vocabulary error in this codebase, and it leads to incorrect governance derivation.

### Confidence (how a binding was produced)

| Value | Meaning |
|---|---|
| `compiler-derived` | Deterministic derivation from approved artifacts — no agent involvement |
| `human` | Explicitly provided by an operator |
| `agent-verified` | Agent confirmed an existing binding against the DOM |
| `agent-proposed` | Agent proposed a novel binding that doesn't exist in approved knowledge |
| `unbound` | No binding found — all resolution rungs exhausted |

### Equivalence (whether derived knowledge has crossed threshold)

| Value | Meaning |
|---|---|
| `learning` | Overlay exists but hasn't reached confidence threshold |
| `approved-equivalent` | Overlay has crossed threshold — treated like approved knowledge at resolution rung 5 |
| `needs-review` | Overlay has been flagged for human review |

### Governance (whether a path is allowed to execute)

| Value | Meaning |
|---|---|
| `approved` | Deterministic or already-reviewed path — execute normally |
| `review-required` | Path depends on agent-proposed or otherwise unreviewed knowledge — execute but flag |
| `blocked` | Do not execute — contradictions, missing data, or dangerous auto-heal class |

**Key relationships**:
- `confidence: compiler-derived` → `governance: approved` (always)
- `confidence: agent-proposed` → `governance: review-required` (until reviewed)
- `confidence: agent-proposed` + explicit approval → `governance: approved` (post-review)
- `confidence: unbound` → `governance: blocked` (always)
- `equivalence: approved-equivalent` does NOT imply `governance: approved` — it means the overlay participates at rung 5 of the resolution ladder, but governance is still derived from the full resolution outcome

These derivation rules are tested in `tests/execution-stages.spec.ts`. If you add a new confidence level or governance state, add tests proving the derivation rules still hold.

---

## Addendum: The Incremental Pipeline and Fingerprinting

At scale (Phase 7), the system must avoid recomputing everything when one artifact changes. The incremental pipeline is the mechanism.

### How it works

Every pipeline stage can optionally declare `fingerprintInput()` and `fingerprintOutput()`. The incremental runner:

1. Computes input fingerprints from the current stage's dependencies
2. Reads the manifest for this stage (if it exists)
3. Compares input fingerprints against the manifest's stored input fingerprints
4. If they match AND the persisted output still exists: cache hit, skip computation
5. If they don't match: compute, persist, update manifest

### Fingerprint design rules

- **Input fingerprints must be deterministic**: same dependencies → same fingerprint. Use `computeAdoContentHash()` or equivalent for file content hashing.
- **Input fingerprints must include everything that affects output**: if your stage reads knowledge YAML and scenario YAML, both must be in the input fingerprint. Missing an input means stale cache hits.
- **Output fingerprints are optional**: they allow downstream stages to skip when their upstream hasn't changed, even if the upstream *ran* (because it might have produced identical output).
- **Fingerprints must be cheap**: hashing is fine; reading entire file trees to compute a fingerprint defeats the purpose.

### The `ProjectionInputFingerprint` type

```typescript
type ProjectionInputFingerprint = {
  kind: string;     // what this fingerprint represents
  value: string;    // the hash
  path?: string;    // optional artifact path
};
```

When implementing new pipeline stages for Phases 2-7, declare your fingerprints. Test that your fingerprint is injective (distinct inputs → distinct hashes) and that cache hits produce identical results to fresh computation.

---

## Summary: The Verification Strategy

When implementing a new phase:

1. **Identify which seams your change crosses.** If it crosses Seam 2 (resolution), you need to prove precedence laws still hold. If it crosses Seam 4 (projection), you need to prove all projections agree.

2. **Write law tests for new invariants before writing implementation code.** The law test defines the contract. The implementation satisfies it. Not the other way around.

3. **Use seeded randomization for any normalization or ranking function.** 75-150 seeds is the established range in this codebase.

4. **Write round-trip validation tests for any new type that crosses a seam.** `validate(validate(x)) === validate(x)`.

5. **Check the architecture test.** If your new module is in the wrong layer, CI will catch it. But catching it at design time is cheaper.

6. **Add fingerprint inputs for any new pipeline stage.** Missing inputs mean stale caches. Stale caches mean incorrect results that look correct.

7. **Prove projection agreement.** When you add a new projection surface, verify it agrees with existing surfaces about resolution outcomes, governance states, and provenance chains.

The goal is not test coverage for its own sake. The goal is that an implementer can make a change, run the tests, and know — not hope, *know* — that the architecture's invariants still hold.
