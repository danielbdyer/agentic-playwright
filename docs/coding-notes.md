# Coding Notes

These notes are opinionated. They exist because the master architecture is precise but dense, and an implementer mid-flight needs the throughline — not another index, but a lens that makes every subsequent design decision feel obvious.

If something here contradicts `docs/master-architecture.md`, the master architecture wins.

---

## Functional Programming Style

This codebase has a strong preference for functional programming, pure functions, and immutable data design. These are not absolute rules, but they are the default — deviations should be deliberate and justified, not accidental.

### Prefer pure functions

A function that takes inputs and returns outputs without mutating anything is easier to test, easier to compose, and easier to reason about under concurrency. When a function needs to produce side effects, return the effects as data and let the caller apply them.

```typescript
// Prefer: return new data
function normalizeSession(task: GroundedStep, memory: ObservedStateSession): ObservedStateSession {
  const screenStale = memory.currentScreen !== null && task.index - memory.currentScreen.observedAtStep > TTL;
  return {
    ...memory,
    currentScreen: screenStale ? null : memory.currentScreen,
  };
}

// Avoid: mutate in place
function normalizeSession(task: GroundedStep, memory: ObservedStateSession): void {
  if (memory.currentScreen && task.index - memory.currentScreen.observedAtStep > TTL) {
    memory.currentScreen = null;
  }
}
```

### Avoid `let`

Use `const` for all bindings. If you need conditional assignment, use a ternary or an immediately-invoked expression. If you find yourself reaching for `let`, ask whether you can restructure the logic as a `reduce`, `map`, `filter`, or plain conditional expression.

### Avoid `Array.push` and mutable accumulation

Prefer `[...existing, ...additions]` over `existing.push(...additions)`. Prefer `array.concat(...)` or spread. When building up a collection across stages, collect the pieces as data and merge them at the end.

```typescript
// Prefer: functional collection
const collectedRefs = [
  ...(actionLattice.selected?.refs ?? []),
  ...(screenLattice.selected?.refs ?? []),
];

// Avoid: mutating accumulation
const refs: string[] = [];
refs.push(...(actionLattice.selected?.refs ?? []));
refs.push(...(screenLattice.selected?.refs ?? []));
```

### Prefer higher-order functions

`map`, `filter`, `reduce`, `flatMap`, `some`, `every`, `find` express intent more clearly than imperative loops. Use them when the transformation is natural. Fall back to `for...of` only when early return, complex control flow, or performance require it.

### Return new objects, don't mutate parameters

When a function needs to update a record, return a new record with the changes applied. Callers should assign the result rather than relying on mutation of a shared reference.

### Prefer recursive folds over mutable accumulation with early return

When a sequential process walks a list, accumulates events, and short-circuits on success, the imperative pattern is `push` + early `return` inside a `for` loop. The functional pattern is a recursive `step` function that carries accumulated state as parameters:

```typescript
// Prefer: recursive fold with immutable accumulation
async function runStrategyChain(
  strategies: readonly ResolutionStrategy[],
  stage: RuntimeAgentStageContext,
  acc: ResolutionAccumulator | null,
): Promise<StrategyChainResult> {
  const step = async (
    remaining: readonly ResolutionStrategy[],
    priorEvents: readonly ResolutionEvent[],
  ): Promise<StrategyChainResult> => {
    const [head, ...tail] = remaining;
    if (!head) {
      return { receipt: null, events: [...priorEvents] };
    }
    const { receipt, events } = await head.attempt(stage, acc);
    const accumulated = [...priorEvents, ...events];
    return receipt
      ? { receipt, events: [...accumulated, { kind: 'receipt-produced', receipt }] }
      : step(tail, accumulated);
  };
  return step(strategies, []);
}

// Avoid: mutable array with push + early return
async function runStrategyChain(...): Promise<StrategyChainResult> {
  const allEvents: ResolutionEvent[] = [];
  for (const strategy of strategies) {
    const { receipt, events } = await strategy.attempt(stage, acc);
    allEvents.push(...events);
    if (receipt) {
      allEvents.push({ kind: 'receipt-produced', receipt });
      return { receipt, events: allEvents };
    }
  }
  return { receipt: null, events: allEvents };
}
```

The recursive fold makes the data flow explicit: `priorEvents` is the accumulated state, `remaining` shrinks on each step, and the result is a clean value — no shared mutable array between iterations.

This same pattern applies at higher levels of abstraction. `runPipelinePhases` uses the identical fold structure to compose `PipelinePhase` objects, and `chooseByPrecedence` uses `reduce` for precedence-ordered selection.

### Prefer composable abstractions for scoring, ranking, and selection

When computing a score from multiple independent dimensions, extract each dimension as a composable rule rather than hardcoding the formula inline:

```typescript
// Prefer: composable scoring rules
interface ScoringRule<T> {
  score(input: T): number;
}

function combineScoringRules<T>(...rules: readonly ScoringRule<T>[]): ScoringRule<T> {
  return { score: (input) => rules.reduce((total, rule) => total + rule.score(input), 0) };
}

function contramapScoringRule<A, B>(rule: ScoringRule<A>, f: (b: B) => A): ScoringRule<B> {
  return { score: (input) => rule.score(f(input)) };
}

const candidateScoring = combineScoringRules<CandidateInput>(
  contramapScoringRule(sourceWeightRule, (c) => c.source),
  contramapScoringRule(featureTotalRule, (c) => c.featureScores),
);

// Avoid: hardcoded inline arithmetic
function candidate<T>(input: CandidateInput<T>): LatticeCandidate<T> {
  const featureTotal = Object.values(input.featureScores).reduce((sum, v) => sum + v, 0);
  return { ...input, score: SOURCE_WEIGHT[input.source] + featureTotal };
}
```

Individual rules are testable in isolation. New scoring dimensions compose without modifying existing code. The same `combine`/`contramap` pattern works for any semigroup: scoring, confidence, governance derivation.

### Prefer phantom branded types at governance boundaries

When a type has a discriminated field (`governance: 'approved' | 'review-required' | 'blocked'`), use phantom brands to carry the discrimination at the type level:

```typescript
// Narrow at the type level, not just at runtime
declare const GovernanceBrand: unique symbol;
type Approved<T> = T & { readonly [GovernanceBrand]: 'approved' };

function isApproved<T extends { governance: Governance }>(item: T): item is Approved<T> {
  return item.governance === 'approved';
}

function requireApproved<T extends { governance: Governance }>(item: T): asserts item is Approved<T> {
  if (item.governance !== 'approved') throw new Error(`Expected approved, got ${item.governance}`);
}

// Exhaustive case analysis
function foldGovernance<T extends { governance: Governance }, R>(
  item: T,
  cases: { approved: (item: Approved<T>) => R; reviewRequired: ...; blocked: ... },
): R { ... }
```

This is not about replacing runtime checks. It's about making governance constraints visible in function signatures. A function that accepts `Approved<WorkflowEnvelope<X>>` documents at the type level that governance has been verified before the call.

### Where mutation is acceptable

Some patterns legitimately benefit from mutation:

- **Effect handlers** that manage infrastructure lifecycle (database connections, browser contexts)
- **Performance-critical hot loops** where allocation pressure matters (measure first)
- **Playwright page interactions** that are inherently side-effectful
- **Mutable refs** shared between pipeline phases (e.g., `accRef` in `runResolutionPipeline`) when the phases are closures that capture the ref by reference and the ref is scoped to one pipeline execution

In these cases, scope the mutation as tightly as possible and document why the pure alternative was insufficient.

---

## Effect-Forward Patterns

This codebase uses [Effect](https://effect.website) as its primary side-effect and error management system. Effect is not optional infrastructure — it is the orchestration backbone. Every application-layer function that performs I/O, reads the filesystem, or sequences operations returns an `Effect`. Understanding these patterns is required for contributing code.

### Use `Effect.gen` for sequential orchestration

`Effect.gen` is the primary way to write sequential effectful code. It reads like async/await but carries typed errors and dependency requirements through the type system:

```typescript
// Canonical pattern: Effect.gen with yield*
function refreshScenario(options: { adoId: AdoId; paths: ProjectPaths }) {
  return Effect.gen(function* () {
    const catalog = yield* loadWorkspaceCatalog({ paths: options.paths });
    const scenario = yield* findScenario(catalog, options.adoId);
    const bound = yield* bindScenario({ adoId: options.adoId, paths: options.paths });
    return yield* emitScenario({ adoId: options.adoId, paths: options.paths });
  });
}
```

Never use `Effect.runPromise` or `Effect.runSync` inside application code. These are composition-root operations only (`lib/composition/`).

### Use `Effect.all` for structurally independent operations

When multiple operations are logically independent — meaning neither's output feeds the other's input — use `Effect.all` to make independence explicit at the type level:

```typescript
// Prefer: independence is explicit
const { catalog, graph, canon } = yield* Effect.all({
  catalog: loadWorkspaceCatalog({ paths }),
  graph: loadInterfaceGraph({ paths }),
  canon: loadSelectorCanon({ paths }),
});

// Avoid: false sequential dependency
const catalog = yield* loadWorkspaceCatalog({ paths });
const graph = yield* loadInterfaceGraph({ paths });
const canon = yield* loadSelectorCanon({ paths });
```

For ordered collections where each element is independent, use `Effect.all` with an array:

```typescript
const results = yield* Effect.all(
  scenarioIds.map((id) => refreshScenario({ adoId: id, paths })),
  { concurrency: 1 },
);
```

### Use `Effect.catchTag` for typed error recovery

Prefer `Effect.catchTag` over `Effect.either` + manual `_tag` discrimination:

```typescript
// Prefer: typed recovery
const result = yield* loadArtifact(path).pipe(
  Effect.catchTag('FileNotFound', () => Effect.succeed(defaultValue)),
);

// Avoid: manual either discrimination
const either = yield* Effect.either(loadArtifact(path));
const result = either._tag === 'Left' && either.left._tag === 'FileNotFound'
  ? defaultValue
  : either._tag === 'Right' ? either.right : yield* Effect.fail(either.left);
```

### Use `Effect.succeed` / `Effect.fail` for pure lifts

When constructing effects from pure values, use `Effect.succeed` for success and `Effect.fail` for typed errors. Never throw inside an `Effect.gen`:

```typescript
// Prefer: typed failure
if (!scenario) {
  return yield* Effect.fail(new TesseractError({ code: 'NOT_FOUND', message: `Scenario ${id} not found` }));
}

// Avoid: thrown exceptions inside Effect.gen
if (!scenario) {
  throw new Error(`Scenario ${id} not found`);
}
```

### Thread immutable state through recursive Effect steps

When an Effect-based loop needs to accumulate state across iterations (dogfood loop, pipeline phases, strategy chains), use a recursive `step` function that carries immutable state as parameters rather than mutating closed-over variables:

```typescript
// Prefer: recursive fold with immutable state
interface LoopState {
  readonly iterations: readonly IterationResult[];
  readonly cumulativeInstructions: number;
}

function step(
  iteration: number,
  state: LoopState,
  options: Options,
): Effect.Effect<LoopState, unknown, unknown> {
  if (iteration > options.maxIterations) return Effect.succeed(state);

  return Effect.gen(function* () {
    const result = yield* runIteration(iteration, options);
    const nextState: LoopState = {
      iterations: [...state.iterations, result],
      cumulativeInstructions: state.cumulativeInstructions + result.instructionCount,
    };
    return shouldStop(nextState)
      ? nextState
      : yield* step(iteration + 1, nextState, options);
  });
}

// Avoid: mutable let bindings inside Effect.gen
return Effect.gen(function* () {
  let cumulativeInstructions = 0;
  const iterations: IterationResult[] = [];
  for (let i = 1; i <= maxIterations; i++) {
    const result = yield* runIteration(i, options);
    iterations.push(result);
    cumulativeInstructions += result.instructionCount;
  }
});
```

This is the Effect equivalent of the recursive fold pattern described in the FP Style section. The `step` function's signature makes the state contract explicit: what goes in, what comes out, and where the recursion terminates.

### Use `Effect.all` with `{ concurrency }` to actually parallelize (with care)

`Effect.all({...})` without a concurrency option runs sequentially by default — it only documents independence without exploiting it. Add `{ concurrency: 'unbounded' }` for truly independent operations, or `{ concurrency: N }` for controlled fan-out.

**Caution:** This codebase relies on deterministic artifact ordering for fingerprinting and content hashing. If the results of a concurrent `Effect.all` feed into fingerprinting, the loaded items must be sorted deterministically after loading. Do not add `{ concurrency }` to catalog loading or graph building without first ensuring a stable sort on the output:

```typescript
// Safe: concurrency with deterministic post-sort
const loaded = yield* Effect.all({
  surfaces: loadAllYaml(paths, surfaceFiles, validate),
  screens: loadAllYaml(paths, screenFiles, validate),
}, { concurrency: 'unbounded' });
const sortedSurfaces = [...loaded.surfaces].sort((a, b) => a.artifactPath.localeCompare(b.artifactPath));
```

### Use `Layer.mergeAll` + `Effect.provide` for service composition

When providing multiple services, compose them into a single Layer rather than nesting `Effect.provideService` calls:

```typescript
// Prefer: layer composition
const layer = Layer.mergeAll(
  Layer.succeed(FileSystem, fs),
  Layer.succeed(AdoSource, ado),
  Layer.succeed(RuntimeScenarioRunner, runner),
  Layer.succeed(ExecutionContext, ctx),
);
Effect.provide(program, layer);

// Avoid: nested provideService
Effect.provideService(
  Effect.provideService(
    Effect.provideService(
      Effect.provideService(program, FileSystem, fs),
      AdoSource, ado),
    RuntimeScenarioRunner, runner),
  ExecutionContext, ctx);
```

### Use `Effect.tap` for observation without transformation

When you need to observe an intermediate value (record provenance, log telemetry) without changing the data flow, use `Effect.tap` rather than explicit bind-and-return:

```typescript
// Prefer: tap makes pass-through explicit
const result = yield* doWork().pipe(Effect.tap(recordProvenance));

// Avoid: manual sequencing
const result = yield* doWork();
yield* recordProvenance(result);
return result;
```

### Use `Effect.mapError` for error enrichment

When adding context (file paths, step IDs, pipeline stages) to errors as they propagate, use `Effect.mapError` instead of catch-and-re-fail:

```typescript
// Prefer: mapError transforms the error channel cleanly
yield* loadArtifact(path).pipe(
  Effect.mapError((e) => new PipelineError({ ...e, stage: 'bind', artifactPath: path })),
);
```

**Caution:** `mapError` changes the error type. If downstream code uses `Effect.catchTag` to selectively recover from specific error types (e.g., `TesseractError` vs `FileSystemError`), `mapError` can widen the set of caught errors and change behavior. Avoid `mapError` on functions consumed by `catchTag`-based recovery.

### Use `Effect.filterOrFail` for guard-style validation

When a guard check produces an error on the falsy branch, collapse the two-step `if (!x) yield* Effect.fail(...)` into a single `filterOrFail`:

```typescript
// Prefer: filterOrFail narrows the type and fails in one expression
const scenario = yield* Effect.succeed(
  catalog.scenarios.find((entry) => entry.artifact.source.ado_id === adoId),
).pipe(Effect.filterOrFail(
  (entry): entry is NonNullable<typeof entry> => entry != null,
  () => new TesseractError('scenario-not-found', `Unable to find scenario for ADO ${adoId}`),
));

// Avoid: two-step check
const scenario = catalog.scenarios.find((entry) => entry.artifact.source.ado_id === adoId);
if (!scenario) {
  return yield* Effect.fail(new TesseractError('scenario-not-found', `Unable to find scenario for ADO ${adoId}`));
}
```

### Use `Effect.withSpan` for pipeline observability

Annotate top-level orchestration functions (compile, bind, emit, graph, run) with `Effect.withSpan` to enable structured tracing. Each span should carry the key identifying attributes:

```typescript
export function compileScenario(options: { adoId: AdoId; paths: ProjectPaths }) {
  return Effect.gen(function* () {
    // ...orchestration logic
  }).pipe(Effect.withSpan('compile-scenario', { attributes: { adoId: options.adoId } }));
}
```

Spans compose automatically — a span on `compileScenario` will nest the spans from `bindScenario`, `emitScenario`, and `buildDerivedGraph` when they run inside it. This is valuable for diagnosing slow compilation or resolution bottlenecks without changing function signatures.

### Group independent writes with `Effect.all`

When multiple file writes are structurally independent (neither depends on the other's result), group them with `Effect.all` to document independence and enable future parallelism:

```typescript
// Prefer: independence is explicit
yield* Effect.all([
  fs.writeText(specPath, code),
  fs.writeJson(tracePath, trace),
  fs.writeText(reviewPath, review),
  fs.writeJson(proposalsPath, proposals),
]);

// Avoid: false sequential dependency
yield* fs.writeText(specPath, code);
yield* fs.writeJson(tracePath, trace);
yield* fs.writeText(reviewPath, review);
yield* fs.writeJson(proposalsPath, proposals);
```

---

## Design Pattern Vocabulary

This codebase uses classical design patterns deliberately. When you encounter one, preserve it. When you need a new abstraction, reach for the vocabulary below before inventing something novel.

### Strategy (Resolution Ladder)

The resolution ladder is a Strategy chain. Each rung is a self-contained resolution strategy with the same interface. The pipeline tries them in precedence order and returns the first success:

```
ResolutionStrategy.attempt(stage, accumulator) → { receipt, events }
```

When adding a new resolution rung, implement the `ResolutionStrategy` interface. Do not add special-case branches inside existing strategies. The chain composition in `runStrategyChain` handles ordering and short-circuiting.

### Visitor / Fold (Drift Applicator, Governance Analysis)

When a function processes a heterogeneous collection of tagged variants, use a fold or visitor pattern with exhaustive case analysis:

```typescript
// Fold pattern for drift events
const finalElements = elementEvents.reduce(
  (doc, event) => applyDriftToElements(doc, event),
  initialElements,
);

// Exhaustive visitor via switch + never check
function applyDriftToElements(doc: Record<string, unknown>, event: DriftEvent): Record<string, unknown> {
  switch (event.type) {
    case 'label-change': return applyLabelChange(doc, event);
    case 'locator-degradation': return applyLocatorDegradation(doc, event);
    case 'element-addition': return applyElementAddition(doc, event);
    default: return doc;
  }
}
```

Use `foldGovernance` for governance case analysis. Use the typed fold functions from `lib/domain/visitors.ts` for all major discriminated unions: `foldValueRef`, `foldStepInstruction`, `foldLocatorStrategy`, `foldResolutionReceipt`, `foldResolutionOutcome`, `foldImprovementTarget`, `foldResolutionEvent`, `foldPipelineFailureClass`. Prefer these over raw `switch` statements — the fold guarantees compile-time exhaustiveness when a new variant is added.

### Composite (Scoring Rules, Pipeline Phases)

When multiple independent dimensions combine into a single result, use a composable abstraction with `combine`/`contramap`:

- `ScoringRule` with `combineScoringRules` and `contramapScoringRule` for multi-dimensional scoring
- `PipelinePhase` arrays with `runPipelinePhases` for sequential processing with early termination
- `ValidationRule` composition for multi-constraint validation

The key property: each component is testable in isolation, and new components compose without modifying existing code (Open/Closed Principle).

### State Machine (Convergence Detection, Lifecycle)

When a process has discrete states and transitions, model them as a state machine rather than as conditional branches:

```typescript
// State machine: inputs determine next state, state determines continuation
function determineConvergenceReason(
  iteration: number,
  state: LoopState,
  options: Options,
): { converged: boolean; reason: ConvergenceReason | null } {
  if (noProposals(state) && iteration > 1) return { converged: true, reason: 'no-proposals' };
  if (belowThreshold(state, options)) return { converged: true, reason: 'threshold-met' };
  if (budgetExhausted(state, options)) return { converged: true, reason: 'budget-exhausted' };
  if (iteration >= options.maxIterations) return { converged: false, reason: 'max-iterations' };
  return { converged: false, reason: null };
}
```

The convergence function is a pure state transition. The loop calls it and acts on the result. Convergence logic never leaks into the loop body.

### Interpreter (Resolution Pipeline, Compiler Phases)

The entire Tesseract system is an interpreter that lowers human-readable test scenarios through progressively more concrete representations. Each compilation phase (parse → bind → emit → compile) is an Interpreter stage. The resolution ladder is an Interpreter for step intent. The emitter is an Interpreter from grounded flows to executable code.

When adding a new compilation phase or lowering step:
1. Define the input and output types explicitly
2. Make the phase a pure function (or Effect) from input to output
3. Carry provenance through the phase (lineage, fingerprints, source attribution)
4. Ensure the phase is independently testable with law-style tests

### Envelope Discipline

Every cross-boundary artifact carries a standard envelope: `kind`, `version`, `stage`, `scope`, `ids`, `fingerprints`, `lineage`, `governance`, `payload`. Use `mapPayload(envelope, f)` for transforms. Never destructure and reassemble envelopes manually.

When creating a new artifact type, define it as a `WorkflowEnvelope<T>` variant. The envelope header is the contract that makes artifacts comparable, traceable, and governable across the system.

**Caveat:** `ProposalBundle` has an identical `proposals` field at both `payload.proposals` and top-level `proposals`. This duplication means `mapPayload` alone cannot fully update the bundle — you must also update the top-level field. This is a known structural debt, not a pattern to replicate.

### Exhaustive Match (`Effect.Match`)

For discriminated unions (types defined as `A | B | C` where each variant carries a different `kind` literal), use `Match.discriminatorsExhaustive("kind")` for compile-time exhaustiveness:

```typescript
import { Match, pipe } from 'effect';

const result = pipe(
  Match.type<StepInstruction>(),
  Match.discriminatorsExhaustive('kind')({
    navigate: (i) => 'navigate' as const,
    enter: (i) => 'enter' as const,
    invoke: (i) => 'invoke' as const,
    'observe-structure': (i) => 'observe-structure' as const,
    'custom-escape-hatch': (i) => 'custom-escape-hatch' as const,
  }),
)(instruction);
```

**When to use:** True discriminated unions where each variant is a separate type with a literal `kind` field (e.g., `StepInstruction`, `ValueRef`, `LocatorStrategy`).

**When NOT to use:** Single interfaces with a union-typed field (e.g., `GraphEdge` with `kind: GraphEdgeKind`). `Match.discriminatorsExhaustive` requires structurally distinct union members — a single interface with a string literal union field will produce `never` types. Use a traditional `switch` statement for these.

### ValidationRule Combinator

Validation rules are composable via `combineValidationRules` and `contramapValidationRule`, paralleling the existing `ScoringRule` pattern in `candidate-lattice.ts`:

```typescript
import { combineValidationRules, requiredField, enumField } from '../domain/validation/rules';

const scenarioRule = combineValidationRules(
  requiredField<Scenario>('source', 'scenario source'),
  enumField<Scenario>('status', ['active', 'draft', 'stub']),
);

const diagnostics = scenarioRule.validate(scenario);
```

Use `contramapValidationRule` to adapt a rule to a different input type.

### StateMachine Abstraction

For recursive Effect loops with convergence detection, use `StateMachine<S, E, R>` from `lib/application/state-machine.ts`:

```typescript
import { runStateMachine } from './state-machine';

const machine = {
  initial: INITIAL_STATE,
  step: (state: LoopState) => Effect.gen(function* () {
    const result = yield* runIteration(state);
    return { next: result.nextState, done: result.converged };
  }),
};

const finalState = yield* runStateMachine(machine);
```

This separates the state transition logic from the loop mechanism. The `step` function is a pure state transition; `runStateMachine` handles recursion.

### Governance Type Utilities

Use phantom-branded types and type guards at governance boundaries:

- **Type guards** (`isApproved`, `isBlocked`, `isReviewRequired`): use for simple boolean checks and type narrowing in `if`/`filter` chains.
- **Assertion** (`requireApproved`): use at entry points that must reject non-approved artifacts (throws on failure).
- **Fold** (`foldGovernance`): use when all three governance cases require distinct handling logic. Ensures exhaustiveness at the type level.
- **Conditional type** (`Governed<T, G>`): use in generic function signatures where the governance level is a type parameter.
- **Envelope aliases** (`ApprovedEnvelope<T>`, `BlockedEnvelope<T>`): use for function parameters that should only accept envelopes of a specific governance state.
- **Infer utility** (`PayloadOf<T>`): use to extract the payload type from an envelope type without repeating it.

### `readonly` Enforcement

All exported interface fields must be `readonly`. Array fields use `readonly T[]`:

```typescript
// Correct
export interface MyType {
  readonly name: string;
  readonly items: readonly string[];
  readonly nested: Readonly<Record<string, readonly number[]>>;
}

// Incorrect — missing readonly
export interface MyType {
  name: string;
  items: string[];
}
```

Reference files for the canonical pattern: `lib/domain/types/workflow.ts`, `lib/domain/types/execution.ts`, `lib/domain/types/resolution.ts`, `lib/domain/types/intent.ts`.

---

## Scalability and Testability Conventions

### Law-style tests

Every deterministic invariant should have a law-style test. These tests verify properties, not examples:

- **Determinism**: same inputs → same outputs, always
- **Precedence**: higher-priority rules win over lower-priority rules
- **Normalization**: equivalent inputs produce identical normalized forms
- **Round-trips**: serialize → deserialize → serialize is identity
- **Commutativity/Associativity**: where applicable for combinators

Name law tests after the property they verify: `'resolution precedence: explicit wins over knowledge'`, `'content hash is stable for equivalent step orderings'`.

### Separation of construction and execution

Functions that build data should not also execute side effects. Separate the "what" from the "when":

```typescript
// Prefer: build the plan, then execute it
function buildRunPlan(scenarios: Scenario[], options: Options): RunPlan { ... }
function executeRunPlan(plan: RunPlan): Effect.Effect<RunResult, ...> { ... }

// Avoid: single function that decides and acts
function runScenarios(scenarios: Scenario[], options: Options): Effect.Effect<RunResult, ...> {
  // decision logic tangled with execution
}
```

### Readonly interfaces at boundaries

Export `readonly` on all interface fields for types that represent data. Reserve mutable interfaces for implementation-internal accumulation that is not exposed through public APIs:

```typescript
export interface DogfoodLedger {
  readonly kind: 'dogfood-ledger';
  readonly version: 1;
  readonly iterations: readonly DogfoodIterationResult[];
  readonly converged: boolean;
}
```

This prevents accidental mutation by consumers and makes the immutability contract explicit.

---

In these cases, scope the mutation as tightly as possible and document why the pure alternative was insufficient.

---

## The Two Dragons

Tesseract has two engines. They are not parallel workstreams. They are not independent modules. They are a mated pair whose power comes from the fact that each one feeds the other.

**Interface Intelligence** is the noun engine. It answers: *what is the application?* Routes, screens, surfaces, targets, selectors, states, transitions, events, affordances — the static and dynamic structure of the thing under test, harvested once and preserved durably.

**Agent Workbench** is the verb engine. It answers: *what do we do about it?* Discovery, resolution, execution, observation, proposal, approval, replay, learning — the operational lifecycle through which the noun engine gets built, tested, improved, and eventually self-tuning.

Neither engine alone is the product. Interface Intelligence without the Workbench is a dead model that nobody maintains. The Workbench without Interface Intelligence is an agent poking blindly at the DOM, rediscovering the same buttons every run. The product is the flywheel between them.

### The Flywheel

```
                    ┌─────────────────────────┐
                    │  Interface Intelligence  │
                    │                          │
                    │  targets, selectors,     │
                    │  states, transitions,    │
                    │  events, affordances     │
                    └───────────┬──────────────┘
                                │
                    harvested knowledge
                    feeds resolution
                                │
                                ▼
               ┌────────────────────────────────┐
               │        Resolution Ladder       │
               │                                │
               │  deterministic → overlay →     │
               │  translation → DOM → human     │
               └────────────────┬───────────────┘
                                │
                    resolution receipts
                    feed the workbench
                                │
                                ▼
                    ┌───────────────────────────┐
                    │      Agent Workbench      │
                    │                           │
                    │  sessions, execution,     │
                    │  proposals, evidence,     │
                    │  learning, benchmarks     │
                    └───────────┬───────────────┘
                                │
                    proposals, evidence,
                    and learning ratchet
                    back into knowledge
                                │
                                ▼
                    ┌───────────────────────────┐
                    │  Interface Intelligence   │
                    │  (enriched)               │
                    └───────────────────────────┘
```

Every full turn of this flywheel makes the next turn cheaper. The first scenario against a screen is expensive: the resolution ladder falls through to DOM exploration, produces degraded receipts, and drafts proposals. The 50th scenario against the same screen is nearly free: the interface model is rich, selectors are healthy, state transitions are known, and resolution wins at rung 1.

This is the core bet. This is why 2000 scenarios can share ~200 canonical selectors. This is why the system gets better with use instead of worse. And this is why both engines must be designed with equal care.

---

## Engine 1: Interface Intelligence (The Nouns)

### The Semantic Identity Stack

The interface model is a stack of increasingly precise identities. Every layer exists for a reason, and skipping a layer creates problems that surface later at scale.

```
Route           →  a URL pattern and its variants
  Screen        →  a distinct interactive context at that route
    Surface     →  a spatial region grouping related elements
      Target    →  a semantic identity for one interactable or assertable thing
        Probe   →  a concrete selector candidate for finding that target
```

**Routes** are the entry points. A route like `/policies` may have variants: `/policies?id=12345` (entity context), `/policies?tab=claims` (tab state), `/policies?type=advanced` (mode switch). Each variant maps to the same screen but with different initial state. Route knowledge means the system knows *how to get somewhere* in a specific configuration without relying on scenario prose to describe navigation.

**Screens** are the interactive contexts. A screen has structural decomposition (surfaces), interactive elements (targets), behavioral contracts (postures), and state topology (transitions). The screen is the primary unit of knowledge authoring. When you write `knowledge/screens/policy-search.elements.yaml`, you're describing what the policy-search screen *is*.

**Surfaces** are spatial regions within a screen: a form group, a results table, a modal overlay, a validation summary. Surfaces matter because they scope assertions ("the error appears in the validation surface") and they define containment relationships that the state topology depends on ("opening the modal reveals a new surface").

**Targets** are the atomic identities. A `CanonicalTargetRef` like `surface:policy-search/element:policy-number-input` is a semantic name that exists whether or not we have a working selector. It is the identity that scenarios reference, that emitted specs resolve through, that receipts record against, and that learning corpora key back to.

**Probes** are the evidence layer. A `SelectorProbe` in the `SelectorCanon` says: "here is a concrete way to find that target — by role, by test-id, by CSS, by ARIA snapshot anchor — and here is how healthy that strategy is based on observed evidence." Probes are ranked into ladders, tracked for drift, and promoted back into approved knowledge through the proposal pipeline.

### Why ~200 Selectors Serve 2000 Scenarios

This is not a compression trick. It is the natural consequence of the semantic identity stack.

A typical application under test might have 15-25 screens. Each screen has 5-15 interactive targets that scenarios actually exercise. That's 75-375 canonical targets. In practice, many share widget families (every screen has a save button, a cancel button, a search field), so the unique target vocabulary stabilizes around 150-250.

Each target gets a selector ladder in the `SelectorCanon` with 1-4 probes ranked by health. The total selector surface is bounded by the application's actual interactive vocabulary, not by the number of scenarios. Adding the 200th scenario that clicks the same save button doesn't add a selector — it adds a target ref reference to an existing canon entry.

This only works because selector duplication is forbidden by architecture, not by convention. The implementation enforces it:

- `CanonicalTargetRef` is a branded type in `lib/domain/identity.ts` — you cannot accidentally use a raw string where a target ref is expected.
- `SelectorCanon` is the single home for locator strategies, written to `.tesseract/interface/selectors.json`.
- Scenarios, emitted specs, and receipts reference target refs. They never carry raw selector strings as primary identity.
- Drift evidence accumulates on the existing probe. It does not spawn a parallel selector.
- Promotion back to approved screen knowledge happens through proposals, never through silent mutation.

When a selector drifts — when the DOM changes under a target — one canon update propagates to every scenario that references that target. This is the "one change repairs many" property, and it is the foundation of the scale story.

### The State and Event Topology

The interface model is not just a static inventory. Applications have dynamic behavior: fields reveal other fields, validation gates block submission, modals change the active surface, navigation moves between routes. Traditional test automation treats these as runtime surprises — add a wait, add a retry, add a recovery handler. That works for one test. At 2000 tests it's a maintenance catastrophe.

Tesseract models dynamic behavior as structure:

**`StateNode`** — a named, durable state of the interface or a target. Examples: "advanced filters collapsed," "save button disabled," "validation summary visible," "edit modal open." These are not transient runtime observations. They are part of the application model.

**`EventSignature`** — the canonical action-and-effect contract for a target in a given state context. It answers: what action is legal here, what preconditions must hold, what effects are expected, which state transitions fire, which assertions verify success. An event signature is the typed version of "when you click the toggle, the advanced filters appear."

**`StateTransition`** — a typed edge in the `StateTransitionGraph`. It carries: source state node, triggering event signature, target state node, guards and preconditions, expected observable effects, and provenance. Transitions are keyed and referential — many scenarios can reuse the same transition without rediscovering it.

**`StateTransitionGraph`** — the durable graph of how state changes happen. It models: reveal/hide, enable/disable, validate/invalidate, open/close, navigate/return, expand/collapse, populate/clear.

The practical consequence is profound. When field A reveals field B:

- **Without state topology**: the emitted spec has a `waitForSelector` after clicking A, a retry loop if B doesn't appear fast enough, and recovery code if the timing varies. Every scenario that exercises this relationship re-implements the same logic. When the application changes the reveal mechanism, every scenario breaks independently.

- **With state topology**: the relationship is a `StateTransition` from "advanced-filters:collapsed" to "advanced-filters:expanded," triggered by an `EventSignature` on the toggle target. The emitted spec references the transition by ID. The runtime enforces the precondition, dispatches the event, observes the effect, and records whether the transition fired as expected. When the application changes the mechanism, one transition update propagates to every scenario.

This is where Interface Intelligence stops being a static inventory and becomes a *model of application behavior*. The state topology is the knowledge that lets the resolution ladder skip DOM exploration for known dynamic dependencies, and it's the knowledge that makes receipts meaningful: not "we waited 500ms and the element appeared" but "transition `toggle-advanced-filters` fired with expected effect on target set."

### The Application Interface Graph

The `ApplicationInterfaceGraph` is the unified projection that ties routes, screens, surfaces, targets, states, transitions, and selectors into a single queryable structure. It lives at `.tesseract/interface/index.json`.

The graph has typed nodes (`InterfaceGraphNode`) for each entity kind and typed edges (`InterfaceGraphEdge`) for relationships: route-target, variant-of-route, contains, references-target, references-snapshot, discovered-by. Every node and edge carries a fingerprint, provenance lineage, and source attribution (approved-knowledge, discovery, derived-working).

The graph is derived — it is rebuilt from canonical knowledge and discovery evidence by `lib/application/interface-intelligence.ts`. But it is the primary query surface for everything downstream: scenario decomposition, emission, runtime resolution, impact analysis, change detection, and learning.

The `SelectorCanon` is a companion projection at `.tesseract/interface/selectors.json`. Together, the graph and the canon form the *interpretation surface* that all consumers share.

---

## Engine 2: Agent Workbench (The Verbs)

### The Resolution Ladder

The resolution ladder is the bridge between the two engines. It is where Interface Intelligence meets the real world.

```
1. explicit scenario fields         ← scenario IR says exactly what to do
2. resolution controls              ← runbook/dataset bindings
3. approved screen knowledge        ← hints, patterns, deterministic heuristics
4. approved-equivalent overlays     ← confidence overlays above threshold
5. structured translation           ← typed ontology candidates via LLM
6. live DOM exploration             ← agentic surgical DOM engagement
7. needs-human                      ← exhaustion, all paths failed
```

This is a precedence order, and it is compiler semantics. The first rung that wins produces the resolution receipt. Everything below it is recorded as "exhausted" in the provenance chain. Changing this order changes what the system produces. Law tests enforce it.

The design intent is to push resolution *upward* over time. The first time a scenario encounters a novel phrase, it falls to rung 5 or 6 — translation or DOM exploration. The agent produces a receipt and a proposal. The proposal, once approved, enters the knowledge layer. Next time, the same phrase resolves at rung 3 — deterministic, instant, no agent needed. This is the flywheel in action.

The key implementation insight: **the runtime agent at rungs 5-6 is not a general-purpose LLM doing freeform exploration.** It is a surgical instrument that operates against the interpretation surface. It knows what targets exist (from the graph), what selectors are available (from the canon), what states are active (from the topology), and what has been tried (from the exhaustion chain). It engages the DOM only for the specific gap that the upper rungs couldn't fill.

This is implemented in `lib/runtime/agent/index.ts` through the `runResolutionPipeline()`:

```
1. Normalize working memory (staleness TTL, confidence thresholds)
2. Try explicit resolution (scenario fields directly specify action/screen/element)
3. Rank candidates via lattice algorithm:
   - rankActionCandidates()
   - rankScreenCandidates()
   - rankElementCandidates()
   - rankPostureCandidates()
   - rankSnapshotCandidates()
4. Try approved knowledge path (deterministic)
5. Try confidence overlay (approved-equivalent)
6. Try structured translation (typed ontology candidates)
7. Try live DOM exploration (if resolver available)
8. Return needs-human with exhaustion chain
```

Every path through this pipeline produces the same typed receipt. The receipt carries the same envelope header regardless of which rung won. This is what makes resolution receipts comparable across deterministic, translation, and agentic paths — and it's what makes benchmarking meaningful.

### Runtime Working Memory

The agent maintains `RuntimeWorkingMemory` across steps within a scenario run:

- `currentScreen` with confidence score and observation step
- `activeEntityKeys[]` — entities the agent believes are in context
- `openedPanels[]`, `openedModals[]` — active UI surfaces
- `lastSuccessfulLocatorRung` — where the last resolution won
- `recentAssertions[]` — what was recently verified
- `lineage[]` — provenance trail for memory updates

Memory is bounded (max 6 entity keys, 6 surfaces, 8 assertions) and subject to staleness (TTL of 5 steps, confidence floor of 0.35). This prevents the agent from carrying stale beliefs across long scenarios while preserving useful context for sequential steps.

The memory is not persistent across runs. It exists within one scenario execution. Cross-run memory lives in the interface model, the selector canon, and the confidence overlays — the durable layers that the next run consumes.

### The Session Ledger

Every run produces an `AgentSessionLedger` at `.tesseract/sessions/{sessionId}/`:

- `session.json` — the session envelope: adapter, provider, execution profile, duration, event summary
- `events.jsonl` — typed event stream
- `transcripts.json` — optional external transcript references

The typed event vocabulary is authoritative. Every agent host — Copilot, Claude Code, a CI bot, or a future provider — must map onto the same events:

| Event | What it records |
|---|---|
| `orientation` | Agent examined artifacts, understood context |
| `artifact-inspection` | Specific artifact paths, graph nodes, selector refs inspected |
| `discovery-request` | Agent requested discovery of a route or surface |
| `observation-recorded` | Agent noted something about the DOM or application state |
| `spec-fragment-proposed` | Agent proposed a grounded spec fragment |
| `proposal-approved` | Operator or auto-approval accepted a proposal |
| `proposal-rejected` | Operator rejected a proposal with rationale |
| `rerun-requested` | Agent or operator triggered a rerun of affected scenarios |
| `execution-reviewed` | Agent or operator reviewed execution receipts |
| `benchmark-action` | Agent invoked benchmark evaluation |
| `replay-action` | Agent replayed a learning example |

The session adapter abstraction (`lib/application/agent-session-adapter.ts`) provides two implementations today — `deterministicAdapter()` for CI/batch and `copilotAdapter()` for VSCode Copilot Chat — but the interface is designed for more. Any provider that can emit these events is a first-class workbench citizen.

The deep implication: **an operator talking to an agent is not outside the system.** That conversation is a typed workbench workflow against shared truth. The session ledger records it. The learning corpus can train from it. The benchmark scorecard can measure it. The agent's contribution is not ephemeral — it is part of the system's durable memory.

### Execution Receipts and Provenance

The `StepExecutionReceipt` in `lib/domain/types/execution.ts` is one of the most information-rich types in the system. It carries:

- **Envelope**: kind, version, stage, scope, ids, fingerprints, lineage, governance
- **Timing breakdown**: setupMs, resolutionMs, actionMs, assertionMs, retriesMs, teardownMs
- **Cost metrics**: instructionCount, diagnosticCount
- **Budget tracking**: thresholds, status (within/over), breach list
- **Failure classification**: family (none/precondition/locator-degradation/environment-runtime), code, message
- **Recovery record**: policyProfile, attempts with strategyId, family, result (recovered/failed/skipped)
- **Execution observation**: status and diagnostics

This level of detail exists because the receipt is the primary input to the learning loop. A receipt that says "step failed" is useless for improvement. A receipt that says "resolution won at rung 3 via approved-knowledge alias match for screen `policy-search` / element `policy-number`, but execution failed with locator-degradation because probe `#policy-num-input` returned 0 matches after 2 retry attempts using recovery strategy `rung-escalation`" — that receipt is actionable. The hotspot detector can identify the degraded probe. The proposal pipeline can draft a selector repair. The benchmark scorecard can measure whether the repair worked.

The `RunRecord` aggregates receipts across all steps of a scenario execution:

- Per-step: interpretation receipt + execution receipt
- Aggregate: evidenceIds, translationMetrics, executionMetrics
- Roll-ups: timingTotals, costTotals, budgetBreaches, failureFamilies, recoveryFamilies, recoveryStrategies

This is the raw material that benchmarking, hotspot detection, and learning all consume.

### Proposals and Trust Policy

When the runtime discovers something that approved knowledge didn't cover — a live DOM resolution finds an element that wasn't in the screen's elements.yaml, or a selector probe drifts below health threshold — it drafts a `ProposalEntry`:

- `proposalId`, `stepIndex`, `artifactType`, `targetPath`
- `title`, `patch` (the suggested change)
- `evidenceIds` (what observations support this proposal)
- `impactedSteps` (which other steps would be affected)
- `trustPolicy` evaluation (auto-approvable or review-required)

Proposals flow through the trust policy boundary. The trust policy gates are:

- **Auto-approvable**: confidence above threshold, no forbidden auto-heal classes (assertion-mismatch, structural-mismatch)
- **Review-required**: agent-proposed canonical changes, new targets, semantic meaning changes
- **Blocked**: dangerous auto-approval classes

In `ci-batch` mode, proposals accumulate but never auto-apply. In `interactive` mode, operators approve explicitly. In `dogfood` mode (A2+A3 in the backlog), proposals auto-approve within trust-policy thresholds and trigger recompilation of affected scenarios.

This is the governance mechanism that makes aggressive learning safe. The system can propose freely. The trust policy decides what flows into canon.

### Hotspot Detection

`lib/application/hotspots.ts` implements pattern detection across runs:

| Hotspot Kind | Signal |
|---|---|
| `translation-win` | Structured translation succeeded where knowledge didn't |
| `agentic-fallback-win` | Live DOM resolved what approved knowledge couldn't |
| `degraded-locator-rung` | Execution succeeded but the selector was degraded |
| `recovery-policy-win` | Recovery strategy saved a failing step |
| `interpretation-drift` | Fields changed between runs |
| `resolution-graph-needs-human` | All automated paths exhausted |

Hotspots are grouped by (field, action) family across screens. This grouping is critical: it identifies patterns, not incidents. If the same field family is a translation-win across three screens, that's a signal for a shared pattern promotion, not three separate hints.

Hotspot suggestions point directly to the knowledge artifact that would fix them:
- Local hints for screen-specific gaps: `knowledge/screens/{screen}.hints.yaml`
- Shared patterns for cross-screen families: `knowledge/patterns/*.yaml`
- Widget contracts for procedural action gaps

This closes the loop from execution evidence back to knowledge authoring. The hotspot surface tells the operator (or the agent) exactly where the knowledge layer is thin and exactly what artifact would thicken it.

### Benchmarking and the Statistical Surface

The `BenchmarkScorecard` in `lib/application/benchmark.ts` is the statistical surface that makes self-tuning possible. It aggregates:

**Knowledge coverage metrics:**
- `uniqueFieldAwarenessCount` — how many distinct targets the knowledge layer covers
- `firstPassScreenResolutionRate` — how often screen resolution wins at rung 1
- `firstPassElementResolutionRate` — how often element resolution wins at rung 1
- `thinKnowledgeScreenCount` — screens with insufficient coverage
- `knowledgeChurn` — knowledge volatility across runs

**Resolution quality metrics:**
- `degradedLocatorRate` — selector health degradation
- `translationHitRate` — how often translation is needed (lower is better — means knowledge is winning)
- `agenticHitRate` — how often DOM exploration is needed (lower is better)
- `approvedEquivalentCount` — overlays that have crossed confidence threshold
- `overlayChurn` — overlay volatility

**Execution health metrics:**
- `executionTimingTotals` — where time is spent (setup, resolution, action, assertion, retries, teardown)
- `executionCostTotals` — instruction and diagnostic counts
- `failureFamilies` — failure classification distribution
- `recoveryFamilies` — recovery strategy effectiveness
- `budgetBreachCount` — how often runs exceed cost thresholds

**Operational metrics:**
- `reviewRequiredCount` — proposals awaiting human review
- `repairLoopCount` — proposals that triggered recompilation
- `operatorTouchCount` — human interventions required
- `degradedLocatorHotspotCount` — recurring selector health issues
- `interpretationDriftHotspotCount` — recurring semantic drift

The scorecard has a `thresholdStatus` (pass/warn/fail) that summarizes overall system health.

This is the surface that DSPy and GEPA will eventually consume. They don't need to understand the compiler or the runtime. They need to understand: *given these inputs, these knowledge artifacts, and this trust policy configuration, how well did the system perform?* The scorecard gives them a structured, comparable answer.

---

## The Interpretation Surface: Where the Dragons Meet

The six workflow lanes (intent, knowledge, control, resolution, execution, governance) tell you where a concern lives operationally. The three architectural spines (interface, session, learning) tell you what the system is made of. But the *interpretation surface* is where Interface Intelligence and the Agent Workbench share a single machine contract.

The interpretation surface extends the repo-wide envelope discipline and carries:

- Envelope header: `kind`, `version`, `stage`, `scope`, `ids`, `fingerprints`, `lineage`, `governance`
- Scenario decomposition fragments
- Graph node references
- Canonical target refs
- Selector refs
- State refs
- Event signatures
- Data bindings
- Assertion anchors
- Runtime knowledge slice
- Receipt references

When the interpretation surface is working correctly, every consumer agrees on what the application meant:

- The **emitted spec** says: "click the save button on the policy-edit screen."
- The **runtime receipt** says: "resolved `surface:policy-edit/element:save-button` via probe `[data-testid='save-btn']` at rung 1, governance `approved`, observed transition `save-button:enabled → save-button:disabled`."
- The **review markdown** shows: which knowledge was used, which resolution stage won, what was exhausted.
- The **learning fragment** records: grounded spec fragment with confidence `compiler-derived`, graphNodeIds, selectorRefs, assertionAnchors.
- The **benchmark scorecard** measures: first-pass resolution rate improved by 3% since last run, knowledge churn stable, zero new degraded locators.

If those five surfaces disagree, the interpretation surface is under-specified. If a new workflow can't explain itself through these surfaces, it's under-modeled.

The `ScenarioProjectionInput` is the downstream boundary for emitted specs, trace JSON, review markdown, inbox surfaces, and workbench views. It inherits all interpretation surface references. Nothing downstream is allowed to rebuild equivalent truth ad hoc from the workspace catalog.

---

## The Flywheel Phases: How the System Reaches Self-Tuning

### Phase 1: Harvest and Model (Interface Intelligence Foundation)

The system starts by harvesting the application into a shared model.

Discovery (`lib/infrastructure/tooling/discover-screen.ts` and `lib/domain/discovery.ts`) visits known URL entry points and emits:

- **Crawl receipts**: what was visited, when, what was observed
- **Route and surface coverage**: which routes map to which screens, which surfaces exist
- **Selector candidates**: locator strategies with provenance (test-id, role-name, CSS fallback)
- **Affordance observations**: widget types, interactive roles, structural hierarchy
- **Graph deltas**: new nodes and edges for the interface graph
- **Snapshot anchors**: ARIA tree templates for structural assertions
- **Review notes**: missing accessible names, CSS-only fallbacks, state exploration recommendations

Discovery doesn't spider the whole app. The operator provides known URL entry points. The system discovers variants within those entry points and builds route knowledge.

After discovery, the `projectInterfaceIntelligence()` function in `lib/application/interface-intelligence.ts` builds the graph and canon:

1. Collect route bindings from manifest routes and surfaces
2. Create target descriptors from surfaces, elements, screen knowledge, and discovery runs
3. Build graph nodes and edges with fingerprinting and provenance
4. Build selector canon by collecting locator strategies, grouping by target ref, creating probes with health status
5. Compute summary metrics (total targets, total probes, counts by source and status)

This is the baseline. The interface model now exists. Every scenario can project through it.

### Phase 2: Scenario Decomposition (Grounded Projection)

ADO manual test cases enter as canonical scenario IR. The decomposition pipeline lowers human prose into graph-grounded flow fragments:

```
ADO text → ScenarioDecomposition → bind against graph/targets/transitions → GroundedSpecFlow
```

Each step in the decomposition binds to:
- A `CanonicalTargetRef` for the target
- A `SelectorProbe` selection strategy
- A `StateNode` for any preconditions
- An `EventSignature` for the action
- `StateTransition` references for expected effects
- Assertion anchors for verification

The grounded flow is the last representation before code generation. It must be close enough to human QA reasoning that an emitted spec reads naturally, but precise enough that every reference points to a graph node, a selector ref, or a state transition — not to freeform prose.

### Phase 3: Execution and Evidence (The Workbench in Action)

The `runScenario()` pipeline in `lib/application/run.ts` chains the full execution:

1. **Select run context** — mode, runbook, dataset
2. **Interpret** — pass each step through the resolution ladder
3. **Execute** — Playwright runtime with widget choreography
4. **Persist evidence** — write observation artifacts
5. **Build proposals** — trust-policy-evaluated change drafts
6. **Build run record** — aggregate all receipts
7. **Project learning** — emit grounded fragments and replay examples
8. **Write session ledger** — record the agent/operator session
9. **Emit derived artifacts** — specs, traces, reviews, inbox projections, graph updates

Every step produces a `StepExecutionReceipt` with full provenance. The resolution receipt records which rung won and what was exhausted. The execution receipt records timing, cost, failure classification, and recovery attempts.

This is the verb engine doing its work. And everything it produces flows back into the noun engine: new evidence strengthens confidence overlays, proposals suggest knowledge improvements, learning fragments accumulate for training.

### Phase 4: Learning and Ratchet (The Loop Closes)

The learning projection (`lib/application/learning.ts`) generates three kinds of fragments:

**Decomposition fragments** — one per step, keyed to graph nodes and selector refs. These train the decomposition runtime to lower novel ADO prose into grounded flows. Confidence is `compiler-derived` if resolution was explicit, `agent-proposed` if it required translation or DOM exploration.

**Repair-recovery fragments** — generated from steps that hit errors or required proposals. These train the repair runtime to handle degraded selectors, precondition failures, and recovery strategies.

**Workflow fragments** — composite multi-step flows that capture the sequential structure of scenario execution. These train the workflow runtime to understand how steps compose into meaningful sequences.

**Replay examples** — generated from successful runs, combining task fingerprint, knowledge fingerprint, fragment IDs, receipt refs, and graph node IDs. These are the training examples that DSPy and GEPA consume.

The `TrainingCorpusManifest` at `.tesseract/learning/manifest.json` tracks:
- Per-runtime corpus: example count, artifact paths
- Replay examples: keyed to scenarios and runs
- Scenario and run coverage

This is where the flywheel becomes self-reinforcing. Each run produces learning artifacts. The learning artifacts accumulate into corpora. The corpora provide the statistical surface for offline evaluation. And the evaluation results feed back into proposal ranking, prompt tuning, and confidence threshold calibration.

### Phase 5: Benchmarking and Statistical Surface (The Foundation for Self-Tuning)

The benchmark infrastructure (`lib/application/benchmark.ts`) generates `BenchmarkVariant` records — per-field test variants parameterized by screen, element, posture, and source rule. These variants are rendered into executable specs and review documentation.

The `BenchmarkScorecard` aggregates results across runs and provides the metrics that make statistical reasoning possible:

- **Knowledge effectiveness**: Are more resolutions winning at rung 1 over time?
- **Selector durability**: Are probes staying healthy or degrading?
- **Translation dependency**: Is the translation rate going down as knowledge improves?
- **Agentic cost**: Is the DOM exploration rate going down?
- **Recovery effectiveness**: Which recovery strategies are working?
- **Drift detection**: Are selectors, targets, or transitions changing?

The scorecard's `thresholdStatus` (pass/warn/fail) is not a binary gate. It's a health signal that tells you whether the system is improving, stable, or degrading. And it's comparable across runs, across execution profiles, and across trust-policy configurations.

### Phase 6: The Dogfood Loop (Self-Hardening)

When A1 (runtime interpretation), A2 (confidence-gated auto-approval), and A3 (dogfood orchestrator) are complete, the system can execute the full self-hardening loop:

```
discover → sync → compile → run → inbox → auto-approve → recompile → rerun → scorecard → repeat
```

Each iteration:
1. Runs scenarios through the resolution ladder
2. Produces receipts, proposals, and evidence
3. Auto-approves proposals within trust-policy thresholds
4. Recompiles affected scenarios
5. Reruns affected scenarios
6. Measures improvement via scorecard delta
7. Repeats until convergence or budget exhaustion

The dogfood loop is bounded by `--max-iterations`, `--max-cost`, and `--convergence-threshold`. It produces a `Dogfood Run` ledger that explains: what improved, what was auto-approved, what still needs human attention.

### Phase 7: Structured Entropy (Deliberate Diversity)

The structured entropy harness (D1) increases the diversity and value of dogfood exposures by injecting controlled variance:

**Input variance**: ADO step phrasing variants (synonym injection, passive voice, abbreviated forms), data posture combinations, screen state permutations (empty, populated, error, loading), navigation path variants.

**Structural variance**: Salted accessible-name changes, layout changes, widget swaps (dropdown → combobox), validation timing changes, result-grid shape changes.

**Execution variance**: Runbook variant selection, interpreter mode toggles, confidence threshold sweeps, resolution precedence overrides.

Each variance dimension is a tagged, replayable drift event. The scorecard measures not just pass/fail but resolution cost, knowledge churn, and proposal volume per variance dimension.

The system demonstrably hardens faster with diverse exposure than with repeated identical runs. This is the empirical signal that the flywheel is working.

### Phase 8: Self-Tuning (The End State)

This is where the two dragons become one engine.

When the system has:
- A rich interface model (noun engine)
- Comprehensive execution receipts (verb engine)
- A statistical benchmark surface (scorecard)
- A structured entropy harness (drift events)
- A replay corpus (learning)

Then DSPy, GEPA, and related tooling can operate in the offline evaluation lane to:

- **Rank proposals** — Given 50 pending proposals, which ones have the highest expected impact on scorecard metrics? The ranking model is trained on historical proposal → scorecard-delta correlations.

- **Tune decomposition prompts** — Given a corpus of ADO prose → grounded flow examples, optimize the decomposition runtime's prompt to minimize translation fallback rate. DSPy's compilation loop over the replay corpus.

- **Calibrate confidence thresholds** — Given historical overlay accuracy and trust-policy outcomes, find the threshold configuration that maximizes auto-approval rate while keeping review-required proposals below a false-positive ceiling.

- **Score resolution strategies** — Given execution receipts across variance dimensions, which resolution strategies produce the most durable outcomes? GEPA's evolutionary optimization over the strategy space.

- **Identify knowledge bottlenecks** — Given scorecard metrics grouped by screen, surface, and widget family, where would one hour of knowledge authoring produce the largest scorecard improvement?

- **Detect emerging patterns** — Given hotspot history across runs, which screen-local hints are ready for promotion to shared patterns? Statistical detection over hotspot recurrence.

The offline evaluation lane operates over stored artifacts only. It never mutates canonical knowledge directly. Its outputs are: ranked proposals, tuned prompts, calibrated thresholds, and bottleneck reports. These flow back into the system through the same proposal and trust-policy pipeline that governs everything else.

This is the end state: a system that can *measure* where it's weak, *propose* specific improvements, *evaluate* those improvements offline against historical data, *apply* them through the governance pipeline, and *verify* that the scorecard improved. The human operator shifts from authoring knowledge to reviewing proposals and adjusting trust-policy thresholds. The system shifts from executing tests to understanding applications.

---

## Staying in Flow: Practical Implementation Guidance

### Before writing code, know which layer you're in

```
lib/domain/          pure values, validation, inference, codegen — NO side effects, NO I/O
lib/application/     orchestration via Effect — depends only on domain
lib/runtime/         Playwright execution, locator resolution — no application imports
lib/infrastructure/  ports and adapters — implements application ports
```

The most common violation is domain code that needs "just a little I/O." It doesn't. Model the data in domain, orchestrate the I/O in application, execute the effect in infrastructure.

### Before editing a file, know if it's canonical or derived

Hand-edit canonical inputs: `knowledge/`, `scenarios/`, `controls/`, `.tesseract/policy/`, `.tesseract/evidence/`.

Never hand-edit derived outputs: `.tesseract/interface/`, `.tesseract/tasks/`, `.tesseract/graph/`, `.tesseract/sessions/`, `.tesseract/learning/`, `generated/`, `lib/generated/`. Fix the generator instead.

### The resolution precedence is compiler semantics

```
1. explicit scenario fields
2. resolution controls
3. approved screen knowledge + hints
4. shared patterns
5. prior evidence or run history
6. live DOM exploration (degraded resolution)
7. needs-human
```

If you reorder this, add a tier, or skip a tier, you are changing what the compiler produces. Write a law test first. This is non-negotiable.

### Use AST-backed generation, always

`lib/domain/ts-ast.ts` and `lib/domain/spec-codegen.ts` exist so we never splice source strings. Template literals and manual indentation in codegen are bugs. The AST composes; strings don't.

### Provenance is not optional metadata

Every derived artifact must carry: what inputs it consumed, which resolution stage won, what was exhausted, and enough lineage to reconstruct the derivation. The envelope header (`kind`, `version`, `stage`, `scope`, `ids`, `fingerprints`, `lineage`, `governance`, `payload`) enforces this.

### Confidence is not governance

| Dimension | Values | What it describes |
|---|---|---|
| Confidence | compiler-derived, human, agent-verified, agent-proposed, unbound | How a binding was produced |
| Equivalence | learning, approved-equivalent, needs-review | Whether derived knowledge has crossed threshold |
| Governance | approved, review-required, blocked | Whether a path is allowed to execute |

An overlay can be `approved-equivalent` and remain derived. A proposal can be `review-required` with strong evidence. These are orthogonal axes.

### Supplements flow from specific to general

1. Screen-local hints first: `knowledge/screens/{screen}.hints.yaml`
2. Promoted shared patterns second: `knowledge/patterns/*.yaml`

Land local first. Promote only after repetition or deliberate generalization. Premature promotion creates invisible shared dependencies.

---

## Signals You're Building the Flywheel

- You added a new screen and it became available to future scenarios through the shared model — no scenario-local patches.
- You changed a selector in one canon entry and 40 scenarios picked up the fix.
- A dynamic behavior is modeled as a state transition and three scenarios reuse it without knowing about each other.
- The emitted test reads like a human wrote it, but the trace JSON explains every resolution decision.
- A run failed, and the receipt tells you specifically whether the app changed or the knowledge is stale.
- The 50th test was cheaper to produce than the 1st.
- The scorecard shows first-pass resolution rate improving over successive dogfood runs.
- A hotspot identified a thin-knowledge screen and the suggestion pointed to the exact hints file.
- An auto-approved proposal triggered recompilation and the affected scenarios passed on rerun.
- The learning corpus grew without a human authoring a single training example.

## Signals You're Drifting

- You wrote a selector string in a scenario, spec, or receipt instead of referencing a target ref.
- You added a `waitForSelector` or retry loop for a field reveal that should be a state transition.
- You confused confidence (how produced) with governance (whether executable).
- You hand-edited a derived file instead of fixing the generator.
- A new workflow produces results that can't be explained through the review artifacts.
- You put I/O in `lib/domain/`.
- You promoted a pattern before it proved itself screen-locally.
- You spliced source strings instead of using AST codegen.
- The agent does freeform DOM exploration without consulting the interpretation surface first.
- A proposal mutates canonical knowledge without flowing through trust policy.
- Optimization tooling (DSPy, GEPA) touches the compiler core instead of the offline evaluation lane.
- The scorecard can't measure the effect of a change you made.

---

## The Backlog Critical Path

A1 (runtime interpretation) is the bottleneck. It breaks the alias treadmill: novel ADO phrasing resolves against the live DOM and knowledge priors instead of requiring human synonym curation first. This is the transition from "human authors tests faster" to "system understands applications."

A1 → A2 (auto-approval) → A3 (dogfood orchestrator) → D1 (structured entropy). This is the spine. Everything else can proceed in parallel, but the A-lane is what turns the system from a compiler into a flywheel.

The end state: the operator provides URL entry points and ADO test cases. The system discovers the application, models its structure and behavior, decomposes the test cases into grounded flows, emits readable Playwright, executes it, observes what happened, proposes improvements, evaluates them statistically, applies them through governance, and measures whether it got better. The operator reviews proposals, adjusts trust-policy thresholds, and authors knowledge only where the system genuinely can't figure it out.

That's the bet. Both dragons, flying together.
