# Scenario Corpus — Execution Plan

> Status: execution plan (2026-04-22). Sits above
> `docs/v2-scenario-corpus-forecast.md` (which named *what* and
> *why*). This document names *how*: the domain model, Effect
> architecture, Big-O posture, seam discipline, phase-by-phase
> commit sequence, grammar, laws, and risk register.
>
> Reading order: §§1–2 ground the domain vocabulary; §§3–5 model
> types + Effect flows + complexity; §6 places files at seam-correct
> locations; §§7–9 are the execution track; §§10–12 are
> exit criteria + risk + open questions.

## 1. Purpose and Scope

### 1.1 What this plan delivers

When the execution track lands, the workshop has:

- A **scenario** primitive that composes probes into ordered
  trajectories with cross-step state dependencies.
- A **scenario runner** that executes a scenario end-to-end through
  a typed harness (dry / fixture-replay / playwright-live), emitting
  a single `ScenarioReceipt` carrying per-step receipts, invariant
  outcomes, and aggregate verdicts.
- An **invariant vocabulary** — a closed union of cross-step
  properties the corpus can assert (role-alert-once, focus-restore,
  cross-verb-strategy-preference, etc.).
- A **scenario corpus** seeded with 3–5 scenarios covering the
  principal forecasting cases (form-success-recovery,
  cascading-selection, error-correction-path).
- A **CLI surface** for running + verifying scenarios.
- **Parity laws** across rungs (dry ↔ fixture-replay ↔
  playwright-live) matching the probe-IR parity discipline.

### 1.2 What this plan does NOT deliver

- **Business-domain realism.** No insurance-app vocabulary returns.
  Scenarios are structural trajectories through the substrate's
  axis space.
- **Replacement of the probe IR.** Scenarios sit *above* probes;
  they never replace them. A scenario's correctness is the
  conjunction of its probes' correctness + invariant satisfactions.
- **Screen-as-page.** Presets (from T5) handle composition. No
  new page-routing concept.
- **Runtime behavior change in `product/`.** All net-new code is
  workshop-side. Manifest-declared verbs are unchanged.

### 1.3 Guiding principles (standing rules)

| Rule | Source |
|---|---|
| FP-first, immutable data, `readonly` on exports | `docs/coding-notes.md` |
| Effect-forward orchestration, `Effect.gen` + `yield*` | idem |
| Closed unions with exhaustive folds (`foldInvariantKind`) | idem |
| `Context.Tag` for injectable services | idem |
| Laws pin invariants, not implementations | CLAUDE.md |
| Envelope discipline: `extends WorkflowMetadata<Stage>` | CLAUDE.md |
| Seam-compile-enforced; RULE_1/2/3 honored | `seam-enforcement.laws.spec.ts` |
| No Effect.runPromise outside CLI/tests | `coding-notes.md §17–26` |
| Content-addressable identities via `Fingerprint<Tag>` | `product/domain/kernel/hash.ts` |

## 2. Ubiquitous Language (DDD glossary)

Before any types land, name the concepts. Every future commit
refers to the table below.

| Term | Definition | Home |
|---|---|---|
| **Scenario** | Aggregate root. A named, ordered trajectory of probes + invariants + topology reference. Content-addressable via `Fingerprint<'scenario'>`. | `workshop/scenarios/domain/scenario.ts` |
| **ScenarioStep** | Entity. One transition inside a scenario: a probe invocation + per-step expectation + optional pre/post assertions. Ordered within the scenario; identity is scenario-id + step index. | `.../scenario.ts` |
| **SubstrateAssertion** | Value object. A predicate about substrate state *at a moment* (before or after a step). Closed union. | `.../assertion.ts` |
| **Invariant** | Value object. A predicate over the *full trace* (not a moment). Closed union. | `.../invariant.ts` |
| **StepOutcome** | Value object. A step's `(classification, errorFamily)` plus any per-step observed details, plus assertion results. | `.../scenario-trace.ts` |
| **ScenarioTrace** | Entity. The accumulating record the runner builds — one StepOutcome per step + collected state snapshots. Not persisted; feeds the ScenarioReceipt. | `.../scenario-trace.ts` |
| **ScenarioReceipt** | Aggregate root. Append-only evidence artifact. Extends `WorkflowMetadata<'evidence'>` with `kind: 'scenario-receipt'`. Carries trace + invariant outcomes + aggregate verdict + `Fingerprint<'scenario-receipt'>`. | `.../scenario-receipt.ts` |
| **ScenarioHarness** | Port. Injectable service that executes a scenario against a substrate rung. Three implementations: dry, fixture-replay, playwright-live. | `.../scenario-harness-port.ts` |
| **TopologyRef** | Value object. A named reference into the TestTopologyRegistry (`{ preset: 'login-form' }` or inline `{ surfaces: [...] }`). Resolves at runner entry. | `.../scenario.ts` |
| **ParametricScenario** | Value object. A scenario template + a parameter set, reducing to N materialized scenarios. | `.../parametric.ts` |
| **CorpusCatalog** | Value object. The workshop's authored set of scenarios, indexed by id. Analogous to `TestTopologyRegistry`. | `.../corpus/catalog.ts` |
| **ScenarioVerdict** | Value object. `'trajectory-holds' \| 'step-diverged' \| 'invariant-violated' \| 'harness-failed'`. Exhaustive fold. | `.../scenario.ts` |
| **StepDivergence** | Value object. Names the first step whose outcome disagreed with its expected; carries the diff. | `.../scenario-trace.ts` |

### 2.1 Relationships (aggregate shape)

```
Scenario (root)
├── TopologyRef
├── EntropyProfile? (inherited from substrate primitives)
├── ScenarioStep[]
│   ├── ProbeInvocation (reuses workshop/probe-derivation Probe shape)
│   ├── StepExpectation
│   ├── SubstrateAssertion[] (preconditions)
│   └── SubstrateAssertion[] (postconditions)
├── Invariant[]
└── ScenarioExpectation

ScenarioReceipt (root, separate aggregate)
├── references Scenario by id + fingerprint
├── ScenarioTrace
│   └── StepOutcome[] (each references a ProbeReceipt by probeId + runId)
├── InvariantOutcome[]
└── ScenarioVerdict
```

Aggregates are boundary-respecting: a `Scenario` is the authored
artifact (YAML); a `ScenarioReceipt` is the runtime evidence.
Neither mutates the other. The receipt *references* the scenario by
fingerprint; lookups resolve via the corpus catalog.

### 2.2 Naming policy

- **Scenario IDs** are kebab-case, topology-aware (`form-success-recovery`, `grid-pagination-boundary`).
- **Step names** are kebab-case, action-centric (`fill-identifier`, `submit-empty-reveals-error`).
- **Invariant kinds** are kebab-case predicate sentences (`aria-alert-announces-exactly-once`, `focus-stays-within-landmark`).
- **Assertion kinds** are kebab-case subject-verb (`surface-present`, `surface-has-value`).
- **No business-domain words.** Enforced by convention in corpus review.

## 3. Domain Model

### 3.1 Scenario type (skeleton)

```ts
// workshop/scenarios/domain/scenario.ts

import type { Probe } from '../../probe-derivation/probe-ir';
import type { ProbeOutcome } from '../../probe-derivation/probe-receipt';
import type { EntropyProfile } from '../../substrate/entropy-profile';

export type ScenarioId = string & { readonly __brand: 'ScenarioId' };
export type StepName = string & { readonly __brand: 'StepName' };

export interface TopologyRef {
  readonly kind: 'preset';
  readonly preset: string;
}

export interface ScenarioStep {
  readonly name: StepName;
  readonly probe: Probe;                          // reuses the Probe shape
  readonly expected: ProbeOutcome['expected'];    // (classification, errorFamily)
  readonly preconditions: readonly SubstrateAssertion[];
  readonly postconditions: readonly SubstrateAssertion[];
}

export interface Scenario {
  readonly id: ScenarioId;
  readonly description: string;
  readonly topology: TopologyRef;
  readonly entropy?: EntropyProfile;               // optional scenario-wide
  readonly steps: readonly ScenarioStep[];
  readonly invariants: readonly Invariant[];
  readonly expected: ScenarioExpectation;
  readonly clearStateBetweenSteps: boolean;        // default false
  readonly maxStepTimeoutMs: number;               // per-step cap
}

export type ScenarioVerdict =
  | 'trajectory-holds'
  | 'step-diverged'
  | 'invariant-violated'
  | 'harness-failed';

export interface ScenarioExpectation {
  readonly verdict: ScenarioVerdict;               // usually 'trajectory-holds'
}
```

**Notes**:
- `Probe` is reused verbatim — a scenario step IS a probe invocation. Zero duplication.
- `ScenarioVerdict` is a closed union folded via `foldScenarioVerdict`. Every consumer folds exhaustively.
- `clearStateBetweenSteps` is explicit; default `false` makes Playwright-live preserve page state across steps (the realistic case).
- `maxStepTimeoutMs` gates runaway steps without a per-assertion timeout explosion.

### 3.2 SubstrateAssertion (closed union)

```ts
// workshop/scenarios/domain/assertion.ts

import type { SurfaceRole } from '../../substrate/surface-spec';

export type SubstrateAssertion =
  | SurfacePresentAssertion
  | SurfaceAbsentAssertion
  | SurfaceHasValueAssertion
  | SurfaceIsFocusedAssertion
  | SurfaceCountAssertion;

export interface SurfacePresentAssertion {
  readonly kind: 'surface-present';
  readonly target: { readonly role: SurfaceRole; readonly name?: string };
}

export interface SurfaceAbsentAssertion {
  readonly kind: 'surface-absent';
  readonly target: { readonly role: SurfaceRole; readonly name?: string };
}

export interface SurfaceHasValueAssertion {
  readonly kind: 'surface-has-value';
  readonly target: { readonly role: SurfaceRole; readonly name: string };
  readonly expectedValue: string;
}

export interface SurfaceIsFocusedAssertion {
  readonly kind: 'surface-is-focused';
  readonly target: { readonly role: SurfaceRole; readonly name?: string };
}

export interface SurfaceCountAssertion {
  readonly kind: 'surface-count';
  readonly role: SurfaceRole;
  readonly count: number;
}

export type AssertionOutcome =
  | { readonly kind: 'held' }
  | { readonly kind: 'violated'; readonly observed: string; readonly expected: string };

/** Exhaustive fold — adding a new assertion kind is a typecheck error until the case lands. */
export function foldSubstrateAssertion<R>(
  a: SubstrateAssertion,
  cases: {
    readonly surfacePresent: (a: SurfacePresentAssertion) => R;
    readonly surfaceAbsent: (a: SurfaceAbsentAssertion) => R;
    readonly surfaceHasValue: (a: SurfaceHasValueAssertion) => R;
    readonly surfaceIsFocused: (a: SurfaceIsFocusedAssertion) => R;
    readonly surfaceCount: (a: SurfaceCountAssertion) => R;
  },
): R {
  switch (a.kind) {
    case 'surface-present':    return cases.surfacePresent(a);
    case 'surface-absent':     return cases.surfaceAbsent(a);
    case 'surface-has-value':  return cases.surfaceHasValue(a);
    case 'surface-is-focused': return cases.surfaceIsFocused(a);
    case 'surface-count':      return cases.surfaceCount(a);
  }
}
```

### 3.3 Invariant (closed union, seed set)

```ts
// workshop/scenarios/domain/invariant.ts

export type Invariant =
  | AriaAlertAnnouncesExactlyOnce
  | FocusStaysWithinLandmark
  | FormStatePreservedOnNavigation
  | ValidationErrorsClearOnCorrection
  | CrossVerbStrategyPreference;

export interface AriaAlertAnnouncesExactlyOnce {
  readonly kind: 'aria-alert-announces-exactly-once';
  readonly target: { readonly role: 'alert'; readonly name: string };
}

export interface FocusStaysWithinLandmark {
  readonly kind: 'focus-stays-within-landmark';
  readonly landmark: { readonly role: 'main' | 'navigation' | 'complementary'; readonly name?: string };
}

export interface FormStatePreservedOnNavigation {
  readonly kind: 'form-state-preserved-on-navigation';
  readonly formName: string;
  readonly fieldNames: readonly string[];
}

export interface ValidationErrorsClearOnCorrection {
  readonly kind: 'validation-errors-clear-on-correction';
  readonly fieldName: string;
  readonly errorAlertName: string;
}

export interface CrossVerbStrategyPreference {
  readonly kind: 'cross-verb-strategy-preference';
  readonly facetId: string;
  readonly failedStrategy: string;
  readonly preferredAlternate: string;
}

export type InvariantOutcome =
  | { readonly kind: 'held'; readonly evidence: string }
  | { readonly kind: 'violated'; readonly observedSequence: readonly string[]; readonly expectedProperty: string };

export function foldInvariant<R>(
  inv: Invariant,
  cases: {
    readonly ariaAlertOnce: (i: AriaAlertAnnouncesExactlyOnce) => R;
    readonly focusStays: (i: FocusStaysWithinLandmark) => R;
    readonly formStatePreserved: (i: FormStatePreservedOnNavigation) => R;
    readonly validationClears: (i: ValidationErrorsClearOnCorrection) => R;
    readonly crossVerbStrategy: (i: CrossVerbStrategyPreference) => R;
  },
): R {
  switch (inv.kind) {
    case 'aria-alert-announces-exactly-once': return cases.ariaAlertOnce(inv);
    case 'focus-stays-within-landmark':       return cases.focusStays(inv);
    case 'form-state-preserved-on-navigation': return cases.formStatePreserved(inv);
    case 'validation-errors-clear-on-correction': return cases.validationClears(inv);
    case 'cross-verb-strategy-preference':    return cases.crossVerbStrategy(inv);
  }
}
```

### 3.4 ScenarioTrace and ScenarioReceipt

```ts
// workshop/scenarios/domain/scenario-trace.ts

import type { ProbeReceipt } from '../../probe-derivation/probe-receipt';
import type { AssertionOutcome, SubstrateAssertion } from './assertion';

export interface StepOutcome {
  readonly stepName: StepName;
  readonly probeReceiptRef: { readonly probeId: string };   // link, not copy
  readonly observed: { readonly classification: string; readonly errorFamily: string | null };
  readonly preconditionOutcomes: readonly { readonly assertion: SubstrateAssertion; readonly outcome: AssertionOutcome }[];
  readonly postconditionOutcomes: readonly { readonly assertion: SubstrateAssertion; readonly outcome: AssertionOutcome }[];
  readonly elapsedMs: number;
  readonly completedAsExpected: boolean;
}

export interface ScenarioTrace {
  readonly steps: readonly StepOutcome[];
  readonly firstDivergence: StepDivergence | null;
}

export interface StepDivergence {
  readonly stepName: StepName;
  readonly kind: 'classification-mismatch' | 'precondition-failed' | 'postcondition-failed' | 'harness-error';
  readonly detail: string;
}
```

```ts
// workshop/scenarios/domain/scenario-receipt.ts

import type { WorkflowMetadata } from '../../../product/domain/governance/workflow-types';
import type { Fingerprint } from '../../../product/domain/kernel/hash';
import type { Invariant, InvariantOutcome } from './invariant';
import type { ScenarioTrace, ScenarioVerdict } from './scenario';

export interface ScenarioReceipt extends WorkflowMetadata<'evidence'> {
  readonly kind: 'scenario-receipt';
  readonly scope: 'scenario';
  readonly payload: {
    readonly scenarioId: string;
    readonly scenarioFingerprint: Fingerprint<'scenario'>;
    readonly trace: ScenarioTrace;
    readonly invariantOutcomes: readonly { readonly invariant: Invariant; readonly outcome: InvariantOutcome }[];
    readonly verdict: ScenarioVerdict;
    readonly provenance: {
      readonly harness: 'scenario-dry' | 'scenario-fixture-replay' | 'scenario-playwright-live';
      readonly substrateVersion: string;
      readonly manifestVersion: number;
      readonly startedAt: string;
      readonly completedAt: string;
      readonly totalElapsedMs: number;
    };
  };
}
```

**Envelope discipline**: the receipt's `WorkflowMetadata<'evidence'>`
base provides `version`, `stage`, `ids`, `fingerprints`, `lineage`,
`governance`. The scenario-specific payload lives under `payload`,
following `ProbeReceipt`'s pattern.

**Lineage**: `lineage.parents` carries the per-step ProbeReceipt
artifact fingerprints. `lineage.sources` carries
`scenario:<scenario-id>`. Queries walk parent fingerprints to pull
per-step details.

### 3.5 Value objects are read-only

Every exported interface field is `readonly`. Every array is
`readonly`. Every Record is `Readonly<Record<...>>`. Consumers that
need mutation create a fresh value; aggregates don't mutate.

## 4. Effect Architecture

### 4.1 Service topology

Three Context.Tags (all workshop-side):

```ts
// workshop/scenarios/application/scenario-harness-port.ts

import { Context } from 'effect';

export interface ScenarioHarnessService {
  /** Acquire any per-scenario resources (browser page, substrate
   *  state) and return a session handle. Scoped — release on
   *  scope close. */
  readonly openSession: (scenario: Scenario) => Effect.Effect<SessionHandle, ScenarioError, never>;

  /** Execute one step against the session. Returns a StepOutcome
   *  carrying the probe receipt + assertion outcomes. */
  readonly executeStep: (
    session: SessionHandle,
    step: ScenarioStep,
    previousOutcomes: readonly StepOutcome[],
  ) => Effect.Effect<StepOutcome, ScenarioError, never>;

  /** Query the substrate for an assertion outcome between steps. */
  readonly evaluateAssertion: (
    session: SessionHandle,
    assertion: SubstrateAssertion,
  ) => Effect.Effect<AssertionOutcome, ScenarioError, never>;

  /** Evaluate an invariant over the complete trace. */
  readonly evaluateInvariant: (
    session: SessionHandle,
    invariant: Invariant,
    trace: ScenarioTrace,
  ) => Effect.Effect<InvariantOutcome, ScenarioError, never>;
}

export class ScenarioHarness extends Context.Tag('workshop/scenarios/ScenarioHarness')<
  ScenarioHarness,
  ScenarioHarnessService
>() {}
```

Secondary tags (inherited, not new):
- `FingerprintProvider` — for deterministic receipt fingerprinting (test-overridable).
- `Clock` (via Effect's built-in) — for `startedAt` / `completedAt`.

### 4.2 Runner composition

The scenario runner is pure Effect.gen + scoped resource acquisition:

```ts
// workshop/scenarios/application/run-scenario.ts

import { Effect } from 'effect';
import { ScenarioHarness } from './scenario-harness-port';

export function runScenario(
  scenario: Scenario,
): Effect.Effect<ScenarioReceipt, ScenarioError, ScenarioHarness> {
  return Effect.scoped(
    Effect.gen(function* () {
      const harness = yield* ScenarioHarness;
      const session = yield* harness.openSession(scenario);
      const startedAt = yield* Effect.sync(() => new Date());

      // Sequential step execution — forEach NOT all, because steps
      // have state dependencies.
      const traceEntries: StepOutcome[] = [];
      let divergence: StepDivergence | null = null;

      for (const step of scenario.steps) {
        const outcome = yield* harness.executeStep(session, step, traceEntries);
        traceEntries.push(outcome);
        if (!outcome.completedAsExpected) {
          divergence = diagnoseStepDivergence(step, outcome);
          break; // fail-fast default; scenario.expected controls this
        }
      }

      const trace: ScenarioTrace = { steps: traceEntries, firstDivergence: divergence };

      // Invariants evaluated over the full trace, concurrently OK —
      // they read trace but don't mutate.
      const invariantOutcomes = yield* Effect.all(
        scenario.invariants.map((inv) =>
          harness.evaluateInvariant(session, inv, trace).pipe(
            Effect.map((outcome) => ({ invariant: inv, outcome })),
          ),
        ),
        { concurrency: 'unbounded' }, // sound: no shared mutable state
      );

      const completedAt = yield* Effect.sync(() => new Date());
      const verdict = foldScenarioVerdict({
        trace,
        invariantOutcomes,
        scenarioExpectation: scenario.expected,
      });

      return buildScenarioReceipt({
        scenario,
        trace,
        invariantOutcomes,
        verdict,
        provenance: {
          startedAt: startedAt.toISOString(),
          completedAt: completedAt.toISOString(),
          totalElapsedMs: completedAt.getTime() - startedAt.getTime(),
          harness: harnessTagForSession(session),
          substrateVersion: SUBSTRATE_VERSION,
          manifestVersion: 1,
        },
      });
    }),
  );
}
```

**Key shapes**:
- `Effect.scoped` — manages session lifecycle. The Playwright-live harness's `openSession` acquires the substrate server + a browser page; close releases them.
- `for … of` for steps — sequential is *required*. The rung-3 harness's state persists across steps (session cookies, form input values, DOM mutations); parallel steps would corrupt state.
- `Effect.all` for invariants — sound to parallelize because invariants read the trace but never mutate substrate. Concurrency unbounded because N invariants ≤ ~10 per scenario.
- `diagnoseStepDivergence` — pure function producing a StepDivergence value object when `completedAsExpected` is false.

### 4.3 Error model (tagged union)

```ts
// workshop/scenarios/domain/scenario-error.ts

import { Data } from 'effect';

export class HarnessUnavailable extends Data.TaggedError('HarnessUnavailable')<{
  readonly reason: string;
}> {}

export class SessionOpenFailed extends Data.TaggedError('SessionOpenFailed')<{
  readonly scenarioId: string;
  readonly cause: unknown;
}> {}

export class StepExecutionFailed extends Data.TaggedError('StepExecutionFailed')<{
  readonly stepName: string;
  readonly cause: unknown;
}> {}

export class AssertionEvaluationFailed extends Data.TaggedError('AssertionEvaluationFailed')<{
  readonly assertion: SubstrateAssertion;
  readonly cause: unknown;
}> {}

export class InvariantEvaluationFailed extends Data.TaggedError('InvariantEvaluationFailed')<{
  readonly invariantKind: string;
  readonly cause: unknown;
}> {}

export type ScenarioError =
  | HarnessUnavailable
  | SessionOpenFailed
  | StepExecutionFailed
  | AssertionEvaluationFailed
  | InvariantEvaluationFailed;

export function foldScenarioError<R>(
  err: ScenarioError,
  cases: {
    readonly harness: (e: HarnessUnavailable) => R;
    readonly session: (e: SessionOpenFailed) => R;
    readonly step: (e: StepExecutionFailed) => R;
    readonly assertion: (e: AssertionEvaluationFailed) => R;
    readonly invariant: (e: InvariantEvaluationFailed) => R;
  },
): R {
  switch (err._tag) {
    case 'HarnessUnavailable':          return cases.harness(err);
    case 'SessionOpenFailed':           return cases.session(err);
    case 'StepExecutionFailed':         return cases.step(err);
    case 'AssertionEvaluationFailed':   return cases.assertion(err);
    case 'InvariantEvaluationFailed':   return cases.invariant(err);
  }
}
```

Uses `Effect/Data.TaggedError` for structural tagging; `Effect.catchTag` dispatches typed handlers.

### 4.4 Layer composition

Composition roots live in `workshop/scenarios/composition/`:

```ts
// workshop/scenarios/composition/dry-services.ts
export const liveDryScenarioHarness: Layer.Layer<ScenarioHarness, never, never> =
  Layer.succeed(ScenarioHarness, createDryScenarioHarness());

// workshop/scenarios/composition/fixture-replay-services.ts
export const liveFixtureReplayScenarioHarness: Layer.Layer<ScenarioHarness, never, VerbClassifierRegistry> =
  Layer.effect(ScenarioHarness, Effect.gen(function* () {
    const verbClassifiers = yield* VerbClassifierRegistryTag;
    return createFixtureReplayScenarioHarness({ verbClassifiers });
  }));

// workshop/scenarios/composition/playwright-live-services.ts
export const livePlaywrightScenarioHarness: Layer.Layer<ScenarioHarness, Error, never> =
  Layer.scoped(ScenarioHarness, Effect.gen(function* () {
    const server = yield* acquireSubstrateServer(rootDir);
    const browser = yield* acquireBrowser(server.baseUrl);
    return createPlaywrightLiveScenarioHarness({ appUrl: server.baseUrl, browser });
  }));
```

CLI entry picks the layer via a `--harness` flag that mirrors
`--adapter` for the probe spike.

### 4.5 Why sequential (not stream)

A streaming approach (`Stream.fromIterable(scenario.steps).mapEffect(executeStep)`)
is tempting but wrong:

- Each step depends on prior step's *substrate state*, not just
  prior outcomes. The stream's element type carries only outcomes;
  state lives in the session.
- Short-circuit on divergence is simpler with `for…of + break`
  than with `Stream.takeWhile`.
- Error propagation via `yield*` integrates naturally with the
  tagged-error fold.

The plain `for…of` inside `Effect.gen` is the right shape.

### 4.6 Determinism contract

The runner is deterministic conditioned on:
- The scenario's EntropyProfile seed.
- The substrate's `SUBSTRATE_VERSION`.
- The `Clock` returning `startedAt` as injected (test-mode pins it).
- The harness's per-step execution being deterministic (dry-harness
  trivially; fixture-replay via pinned RNG; playwright-live via
  pinned substrate + fixed `waitUntil`).

Two runs of the same scenario with these fixed produce byte-
identical ScenarioReceipt payloads. This is the parity-law gate.

## 5. Big-O Analysis

### 5.1 Variables

Let:
- `N` = steps per scenario (typical: 5–10; ceiling: 50)
- `I` = invariants per scenario (typical: 1–3; ceiling: 10)
- `A` = assertions per step (pre + post; typical: 0–3; ceiling: 10)
- `S` = surfaces in the resolved WorldShape (typical: 5–20; ceiling: 200)
- `D` = SurfaceSpec tree depth (typical: 1–3; ceiling: 6)
- `P` = probes in the trace so far (= prior steps' outcomes)
- `C` = scenarios in the corpus (typical: 10–100; ceiling: 10,000)

### 5.2 Per-phase complexity

| Operation | Complexity | Notes |
|---|---|---|
| Parse scenario YAML | `O(steps + assertions + invariants)` | Linear walk; YAML parser dominates. |
| Fingerprint scenario | `O(size of scenario JSON)` | One `stableStringify` + SHA-256. |
| Resolve topology preset | `O(1)` | Map lookup; surfaces array passes by reference. |
| Open session (dry) | `O(1)` | No real resources acquired. |
| Open session (fixture-replay) | `O(1)` | Same. |
| Open session (playwright-live) | `O(launch Chromium)` | ~1s fixed cost; amortized per scenario, not per step. |
| Execute one step (dry) | `O(A)` | Assertions + trivial receipt build. |
| Execute one step (fixture-replay) | `O(A + S)` | Assertions + classifier surface lookup (DFS over children, O(S)). |
| Execute one step (playwright-live) | `O(A + Playwright dispatch)` | Assertion each ~50ms (isVisible, count, textContent); dispatch per action. |
| Surface lookup in tree | `O(D × B)` where B=branching | DFS; early return on match. Same as probe-IR today. |
| Evaluate one assertion | `O(Playwright query)` | `page.locator + isVisible` ≈ O(DOM node count). |
| Evaluate one invariant | `O(N × check-cost)` | Walks the trace; invariant-specific inner cost (see §5.3). |
| Fold invariant outcomes → verdict | `O(I)` | Linear scan. |
| Build ScenarioReceipt | `O(N + I + A)` | One pass aggregation; fingerprint one stringify. |
| Aggregate run scenario (dry) | `O(N × A)` | Bounded by step count × assertions. |
| Aggregate run scenario (fixture-replay) | `O(N × (A + S))` | Adds per-step surface lookup. |
| Aggregate run scenario (playwright-live) | `O(N × (A + k))` where k = fixed Playwright dispatch cost | ~1s per step typical. |
| Run corpus (all scenarios) | `O(C × per-scenario)` | Parallelizable; see §5.4. |

### 5.3 Per-invariant cost model

| Invariant | Inner complexity | Notes |
|---|---|---|
| `aria-alert-announces-exactly-once` | `O(N)` trace walk + `O(N × MutationObserver events)` | Needs MO hooks in playwright-live. |
| `focus-stays-within-landmark` | `O(N)` trace walk | Each step records `document.activeElement` snapshot → check membership in landmark subtree. |
| `form-state-preserved-on-navigation` | `O(N × F)` where F = fields | Per navigate step, snapshot field values; compare N to N+1. |
| `validation-errors-clear-on-correction` | `O(N)` | Walk for correction pattern: error-state → input action on named field → error gone at next step. |
| `cross-verb-strategy-preference` | `O(N)` | Walks receipts for strategy-used observedDetails; a linear pass. |

All invariants are O(N). None introduce super-linear blow-up. I is
bounded by scenario-author discipline; a scenario with 20+
invariants signals under-decomposition (split into multiple
scenarios).

### 5.4 Corpus-level parallelism

Scenarios are mutually independent (each opens its own session).
Running the full corpus:

```ts
Effect.all(
  corpus.scenarios.map(runScenario),
  { concurrency: availableProcessors }, // bounded pool
)
```

Parallelism bound: `P = min(C, CPU cores, browser license cap)`.

For playwright-live, the limit is typically CPU cores (Chromium is
memory-heavy). Recommended default: `Math.max(2, cpuCount - 1)`.

For dry / fixture-replay, parallelism can be unbounded — no per-
scenario cost floor.

### 5.5 Memory complexity

A ScenarioReceipt carries:
- N StepOutcomes (each ~500 bytes serialized)
- I InvariantOutcomes (each ~200 bytes)
- References to ProbeReceipts (by probeId, not inline)

Typical receipt: ~10KB. Ceiling: ~50KB for a 50-step scenario with
10 invariants. Acceptable for append-only log storage.

Trace entries are computed incrementally — the runner accumulates
`traceEntries: StepOutcome[]` with `push`, O(1) amortized. Not a
linked list because we pass the accumulated trace to invariant
evaluators as a `readonly` slice.

### 5.6 Lookup structures

| Structure | Backing | Access |
|---|---|---|
| CorpusCatalog | `ReadonlyMap<ScenarioId, Scenario>` | O(1) |
| TestTopologyRegistry (existing) | `ReadonlyMap<string, TestTopology>` | O(1) |
| VerbClassifierRegistry (existing) | `ReadonlyMap<string, VerbClassifier>` | O(1) |
| Trace step-by-name lookup | linear scan (N small) | O(N) |

We deliberately *don't* build a step-name → StepOutcome map: N is
small (≤50), the indirection cost exceeds linear scan cost, and
invariants rarely name a step directly.

### 5.7 Big-O summary

```
Scenario runner (per scenario):
  O(N × (A + S + playwright-dispatch-per-step) + I × N)
  ≈ O(N × (A + S))  for dry/fixture-replay
  ≈ O(N × k + N × I) for playwright-live (k = ~1s fixed cost)

Corpus run (C scenarios, parallelism P):
  O((C / P) × per-scenario)
```

No path is worse than linear in the scenario's stated size. Quadratic
surprises are architecturally precluded.

## 6. Seam Discipline

### 6.1 Directory layout

```
workshop/
  scenarios/
    domain/                     # pure types, no Effect, no IO
      scenario.ts               # Scenario, ScenarioStep, ScenarioVerdict
      assertion.ts              # SubstrateAssertion + foldSubstrateAssertion
      invariant.ts              # Invariant + foldInvariant
      scenario-trace.ts         # StepOutcome, ScenarioTrace, StepDivergence
      scenario-receipt.ts       # ScenarioReceipt envelope
      scenario-error.ts         # Tagged errors + foldScenarioError
      parametric.ts             # ParametricScenario + materialization
    application/                # Effect programs
      scenario-harness-port.ts  # Context.Tag + ScenarioHarnessService
      run-scenario.ts           # runScenario Effect composition
      fingerprint.ts            # scenarioFingerprintFor()
      trace-aggregation.ts      # buildScenarioReceipt, foldScenarioVerdict
      diagnose-divergence.ts    # StepDivergence construction
    loader/                     # YAML → Scenario
      parse-scenario-yaml.ts
      scenario-grammar.ts       # grammar types + validators
    harness/                    # ScenarioHarness implementations
      dry-scenario-harness.ts
      fixture-replay-scenario-harness.ts
      playwright-live-scenario-harness.ts
      session-handle.ts         # SessionHandle type
    composition/                # Layer roots
      dry-services.ts
      fixture-replay-services.ts
      playwright-live-services.ts
    corpus/                     # authored scenarios + catalog
      catalog.ts                # CorpusCatalog + createDefaultCorpus()
      form-success-recovery.scenario.yaml
      cascading-selection.scenario.yaml
      ... (N more)
    cli/                        # CLI command modules
      run-scenario-command.ts
      verify-corpus-command.ts
  logs/
    scenario-receipts/          # append-only receipts
```

**Rule of thumb**: any file importing `Effect` lives under
`application/` or `harness/`, never under `domain/`.

### 6.2 Seam compliance matrix

| Module | Imports from product/ | Imports from workshop/ |
|---|---|---|
| `workshop/scenarios/domain/` | `product/domain/governance/workflow-types` (for `WorkflowMetadata<'evidence'>`) + `product/domain/kernel/hash` (for `Fingerprint<Tag>`). Both already allowlisted. | `workshop/probe-derivation/probe-ir` (Probe type) + `workshop/probe-derivation/probe-receipt` (ProbeOutcome) + `workshop/substrate/*` (SurfaceRole, EntropyProfile). |
| `workshop/scenarios/application/` | same as domain + nothing new. | domain + `workshop/probe-derivation/*` (runs probes per step). |
| `workshop/scenarios/harness/` | `product/instruments/tooling/headed-harness` (rung-3; already allowlisted). | everything above. |
| `workshop/scenarios/loader/` | nothing from product. | `workshop/scenarios/domain/` + `workshop/substrate/*` (SurfaceSpec validators). |
| `workshop/scenarios/corpus/` | nothing from product. | domain + loader. |
| `workshop/scenarios/cli/` | `product/cli/shared` (CommandSpec, flags — already allowlisted). | application + composition. |

### 6.3 No new allowlist entries needed

Every product-side import the scenarios module requires is already
in `ALWAYS_ALLOWED_PRODUCT_PATHS`:

- `product/domain/governance` ✓
- `product/domain/kernel/errors` ✓ (for TesseractError in runner)
- `product/domain/kernel/hash` ✓
- `product/application/ports` ✓ (if we need FileSystem for writing receipt logs)
- `product/cli/shared` ✓
- `product/instruments/tooling` ✓ (headed-harness)

### 6.4 RULE_3 stays at zero

`product/` imports nothing from `workshop/scenarios/`. The scenario
receipt is a workshop-emitted artifact; dashboard reads it via the
shared log set (RULE_2 does not apply to `dashboard/` reading
`workshop/logs/`, which is the seam contract).

### 6.5 Cross-module reuse

The scenario module reuses:
- **Probe** (from `workshop/probe-derivation/probe-ir`): a step's
  probe invocation IS a Probe. No new type.
- **ProbeReceipt** (from same): per-step receipts are ProbeReceipts.
  ScenarioReceipt references them by `probeId`, not by copy.
- **SurfaceSpec** + **WorldShape** (from `workshop/substrate/`):
  scenarios inherit topology vocabulary.
- **EntropyProfile** (same): scenarios carry their own profile; it
  applies across the trajectory.
- **VerbClassifierRegistry** (from `workshop/probe-derivation/`):
  the fixture-replay scenario harness delegates to the per-step
  classifier.
- **TestTopologyRegistry** (same): `TopologyRef` resolves here.

No new duplicated types. Scenario is a composition layer, not a
parallel type hierarchy.

### 6.6 Effect service hygiene

`ScenarioHarness` is the only new `Context.Tag`. Internal helpers
(`diagnoseStepDivergence`, `buildScenarioReceipt`) are pure
functions, not services. Over-tagging multiplies environment noise
and obscures the single injectable boundary.

## 7. Execution Plan — Phases S1 through S9

Each phase is a single commit-or-small-commit-set with a clear
deliverable and exit gate. Commits in order; each builds on the
prior. Fingerprints stabilize at S4, so earlier phases may see
receipt-shape changes — that's expected.

### S1 — Domain primitives (2 commits)

**Deliverable**: the pure types + exhaustive folds, no Effect, no
IO. Establishes the ubiquitous language in code.

**Commits**:
- `step-8.S1a-scenario-domain`: Scenario, ScenarioStep,
  ScenarioVerdict, TopologyRef, ScenarioExpectation + folds. Laws:
  round-trip structural equality; foldScenarioVerdict exhaustive.
- `step-8.S1b-assertion-invariant`: SubstrateAssertion + Invariant
  closed unions + exhaustive folds + AssertionOutcome +
  InvariantOutcome. Laws for each fold.

**Exit gate**: all domain types compile; 8+ laws green; no Effect
imports in `domain/` (verified by a new law file that greps for
`from 'effect'` in the domain tree).

**Size**: ~400 LOC types + 400 LOC laws.

### S2 — YAML loader + grammar (1 commit)

**Deliverable**: `parse-scenario-yaml.ts` turns a `.scenario.yaml`
file into a `Scenario`. Malformed files return null (never throw).

**Commit**:
- `step-8.S2-scenario-loader`: parser + validator + 10-ish laws
  (round-trip for minimal scenario, malformed → null, missing
  required field → null, preset-only topology round-trip, etc.).

**Exit gate**: laws pass; loading an unwritten scenario file with
`npx tsx workshop/scenarios/loader/parse-scenario-yaml.ts <path>`
dumps the parsed Scenario as JSON.

**Size**: ~300 LOC loader + 300 LOC laws.

### S3 — ScenarioHarness port + dry harness (2 commits)

**Deliverable**: the Context.Tag + its first implementation (dry-
echo). The runner composes steps but doesn't yet evaluate
invariants.

**Commits**:
- `step-8.S3a-harness-port`: `scenario-harness-port.ts` +
  `SessionHandle` type + `ScenarioError` tagged union. Laws for the
  error fold.
- `step-8.S3b-dry-harness`: `dry-scenario-harness.ts` realizes
  `ScenarioHarnessService` by echoing each step's expected outcome
  as its observed. Stateless — no persistent session. Runner skeleton
  (`run-scenario.ts`) without invariant evaluation. Laws: every
  step's observed = expected; verdict is `trajectory-holds`.

**Exit gate**: a hand-crafted Scenario value (no YAML yet) runs
end-to-end under the dry harness, producing a trivial receipt with
verdict `trajectory-holds` for all step outcomes = expected.

**Size**: ~500 LOC.

### S4 — ScenarioReceipt + fingerprint (1 commit)

**Deliverable**: receipts stamp a `Fingerprint<'scenario-receipt'>`
and a `Fingerprint<'scenario'>` (for the authored scenario).
Append-only log location declared.

**Commit**:
- `step-8.S4-scenario-receipt`:
  - Add `'scenario'` and `'scenario-receipt'` to the Fingerprint
    tag registry in `product/domain/kernel/hash.ts`.
  - `workshop/scenarios/application/fingerprint.ts` with
    `scenarioFingerprint()` + `scenarioReceiptFingerprint()`.
  - `buildScenarioReceipt()` stamps both fingerprints on envelope.
  - Declare `workshop/logs/scenario-receipts/` as the append-only
    log location (mkdir at first receipt write).

**Exit gate**: running a scenario twice with pinned `Clock` produces
byte-identical receipt JSON. Fingerprints match across runs.

**Size**: ~200 LOC.

### S5 — Invariant evaluation (1 commit)

**Deliverable**: the runner evaluates invariants. Dry harness's
invariant implementations trivially hold (dry observed = expected
satisfies most invariants by construction).

**Commit**:
- `step-8.S5-invariant-evaluation`: `evaluateInvariant()` on the
  dry harness. `foldInvariant` dispatches the 5 seed invariant
  kinds. Each kind's evaluator is a pure function over the trace.
  Laws: each invariant's held / violated cases are exercised by
  hand-crafted traces.

**Exit gate**: scenarios with invariants produce correct verdicts
under the dry harness (trajectory-holds when all holds;
invariant-violated otherwise).

**Size**: ~500 LOC (5 invariants × ~100 LOC evaluator + laws each).

### S6 — Fixture-replay scenario harness (2 commits)

**Deliverable**: fixture-replay harness realizes per-step probe
classification + assertion evaluation against a simulated substrate
state model.

**Commits**:
- `step-8.S6a-fixture-replay-session`: `SessionHandle` carries a
  mutable-via-copy-on-write `WorldShape` that represents the
  simulated substrate state. Each step can mutate (form submit →
  reveal success surface).
- `step-8.S6b-fixture-replay-harness`:
  `fixture-replay-scenario-harness.ts` delegates `executeStep` to
  the per-verb `VerbClassifier` (from probe-derivation); delegates
  `evaluateAssertion` to a surface-search over the current session's
  WorldShape; `evaluateInvariant` walks the trace.

**Exit gate**: the three seed scenarios (form-success-recovery,
cascading-selection, error-correction-path — all authored in S8)
run cleanly under fixture-replay. Rung-2 parity with dry-harness
verdicts per scenario.

**Size**: ~700 LOC.

### S7 — Playwright-live scenario harness (2 commits)

**Deliverable**: rung-3 harness runs real scenarios against real
Chromium on the substrate server.

**Commits**:
- `step-8.S7a-playwright-session`: `SessionHandle` carries a
  Playwright Page that persists across steps. `openSession`
  acquires server + browser + page; `closeSession` releases.
  Navigation between scenarios is fresh; within a scenario,
  the page state persists until an explicit navigate step.
- `step-8.S7b-playwright-harness`:
  `playwright-live-scenario-harness.ts` delegates per-step verb
  dispatch to existing rung-3 classifiers (reuses
  `classifiers/rung-3/*`); pre/post assertions run as Playwright
  queries; invariants that need MutationObserver hooks get them
  here.

**Exit gate**: `npm run verify:scenario-parity` runs all corpus
scenarios under fixture-replay + playwright-live, asserts verdict
parity across rungs.

**Size**: ~800 LOC.

### S8 — Corpus seed + parametric generator (2 commits)

**Deliverable**: 3–5 authored `.scenario.yaml` files + the parametric
generator stub.

**Commits**:
- `step-8.S8a-corpus-seed`: 4 scenarios:
  1. `form-success-recovery.scenario.yaml` — fill-submit-error-fix-resubmit-success.
  2. `cascading-selection.scenario.yaml` — two dropdowns where first's selection
     constrains second.
  3. `error-correction-path.scenario.yaml` — invalid form submit → clear field → re-fill → success.
  4. `role-alert-deduplication.scenario.yaml` — invariant test: alert announces once
     across N interactions.
- `step-8.S8b-parametric-generator`: `parametric.ts` with template
  + params → materialize. Laws: materializing N params produces
  N structurally-equivalent scenarios with parameter substitutions.

**Exit gate**: `tesseract scenario verify` (new CLI, S9) reports
4/4 scenarios passing under both rungs.

**Size**: ~400 LOC (YAML authoring + parametric types/laws).

### S9 — CLI surface + dashboard projection (2 commits)

**Deliverable**: CLI commands for running + verifying scenarios; a
dashboard projection for rendering scenario receipts.

**Commits**:
- `step-8.S9a-scenario-cli`:
  - `tesseract scenario run <id>` — run one scenario.
  - `tesseract scenario verify [--harness=...] [--concurrency=...]`
    — run full corpus.
  - `--harness` flag: `dry | fixture-replay | playwright-live`.
  - `--scenario-id` flag: filter to one scenario.
- `step-8.S9b-dashboard-projection`: `dashboard/projections/scenario-
  receipts.ts` reads `workshop/logs/scenario-receipts/` and projects
  into a list view.

**Exit gate**:
- `npm run scenario:verify` passes 4/4 under playwright-live.
- `verdict-08.md` records the corpus's first graduation.

**Size**: ~500 LOC.

### Phase totals

- **Commits**: 14
- **LOC** (approx): 4,000 (50% laws)
- **Session estimate**: 3–4 sessions for one agent; parallelizable
  across S1/S2 and S5/S6 if multiple agents collaborate.

### Sequencing dependencies

```
S1 ─┬── S2 ─── S3 ─── S4 ─── S5 ─── S6 ─── S7 ─── S8 ─── S9
    │
    └── (S1 types unblock everything downstream)
```

Linear — each phase depends on the prior. S5 and S6 are parallelizable
(invariants + fixture-replay harness) by different agents, but a
single-agent serial execution is clean.

## 8. YAML Grammar

### 8.1 Authoritative shape

```yaml
# workshop/scenarios/corpus/<scenario-id>.scenario.yaml
scenario: <kebab-case-id>        # ScenarioId — file name mirrors
schemaVersion: 1                 # integer; bumps on breaking changes

description: |
  Human-legible prose. Two sentences max: what this scenario
  tests and why it earns its keep.

topology:
  preset: <topology-id>          # references TestTopologyRegistry

entropy:                         # optional; inherited EntropyProfile shape
  seed: scenario-<id>-v1
  wrapperDepth: [1, 2]
  chromeTone: [reef, atlas]
  spacingDensity: [tidy, layered]
  siblingJitter: [0, 1]
  calloutShuffle: { count: 2 }
  badgeSubset: [0, 3]

clearStateBetweenSteps: false    # default; set true to reset
                                 # session between every step

maxStepTimeoutMs: 5000           # default 5s; 0 disables

steps:
  - name: <kebab-case-step-name>
    probe:
      verb: <manifest-verb>
      input:                     # verb-specific input shape;
                                 # passes to the step's classifier
      worldInheritance: keep     # keep | reset | override
                                 # (if override, include `world:` below)
    expected:
      classification: matched | failed | ambiguous
      error-family: null | <family-name>
    preconditions:               # optional; evaluated BEFORE the probe
      - kind: surface-present
        target: { role: button, name: "Submit" }
    postconditions:              # optional; evaluated AFTER the probe
      - kind: surface-present
        target: { role: alert, name: "Please complete required fields" }

invariants:                      # optional; evaluated over trajectory
  - kind: aria-alert-announces-exactly-once
    target: { role: alert, name: "Please complete required fields" }

expected:
  verdict: trajectory-holds      # default; alternatives below
```

### 8.2 Assertion kinds (wire form)

```yaml
# surface-present
- kind: surface-present
  target: { role: <role>, name: "<optional name>" }

# surface-absent
- kind: surface-absent
  target: { role: <role>, name: "<optional name>" }

# surface-has-value (requires name)
- kind: surface-has-value
  target: { role: textbox, name: "Identifier" }
  expectedValue: "alice"

# surface-is-focused
- kind: surface-is-focused
  target: { role: button, name: "Submit" }

# surface-count
- kind: surface-count
  role: button
  count: 3
```

### 8.3 Invariant kinds (wire form, seed set)

```yaml
# aria-alert-announces-exactly-once
- kind: aria-alert-announces-exactly-once
  target: { role: alert, name: "Please complete required fields" }

# focus-stays-within-landmark
- kind: focus-stays-within-landmark
  landmark: { role: main, name: "Content" }

# form-state-preserved-on-navigation
- kind: form-state-preserved-on-navigation
  formName: "Login"
  fieldNames: ["Identifier", "Passphrase"]

# validation-errors-clear-on-correction
- kind: validation-errors-clear-on-correction
  fieldName: "Display name"
  errorAlertName: "Display name error"

# cross-verb-strategy-preference
- kind: cross-verb-strategy-preference
  facetId: "ns:exampleA"
  failedStrategy: "test-id"
  preferredAlternate: "role"
```

### 8.4 Example scenario — form-success-recovery

```yaml
scenario: form-success-recovery
schemaVersion: 1

description: |
  User submits an empty login form, sees a validation error alert,
  fills both required fields, re-submits, and sees a success status.
  Tests the correction path and the submit-reveal state machine.

topology:
  preset: login-form

entropy:
  seed: form-success-recovery-v1
  wrapperDepth: [1, 2]
  chromeTone: [reef]

steps:
  - name: initial-observe-submit-button
    probe:
      verb: observe
      input:
        target: { role: button, name: "Submit" }
    expected:
      classification: matched
      error-family: null

  - name: submit-empty-reveals-error
    probe:
      verb: interact
      input:
        action: click
        target: { role: button, name: "Submit" }
    expected:
      classification: matched
      error-family: null
    postconditions:
      - kind: surface-present
        target: { role: alert, name: "Please complete required fields" }

  - name: fill-identifier
    probe:
      verb: interact
      input:
        action: input
        target: { role: textbox, name: "Identifier" }
        value: "alice"
    expected:
      classification: matched
      error-family: null

  - name: fill-passphrase
    probe:
      verb: interact
      input:
        action: input
        target: { role: textbox, name: "Passphrase" }
        value: "secret"
    expected:
      classification: matched
      error-family: null

  - name: resubmit-reveals-success
    probe:
      verb: interact
      input:
        action: click
        target: { role: button, name: "Submit" }
    expected:
      classification: matched
      error-family: null
    postconditions:
      - kind: surface-present
        target: { role: status, name: "Signed in" }

invariants:
  - kind: aria-alert-announces-exactly-once
    target: { role: alert, name: "Please complete required fields" }
  - kind: validation-errors-clear-on-correction
    fieldName: "Identifier"
    errorAlertName: "Please complete required fields"

expected:
  verdict: trajectory-holds
```

### 8.5 Grammar invariants the loader enforces

1. `scenario`: required kebab-case string; matches the filename minus `.scenario.yaml`.
2. `schemaVersion`: required integer; currently always `1`.
3. `topology`: required; has a `preset` field referencing a known
   topology. Unknown preset → loader returns null + surfaces to
   CLI as a structured error.
4. `steps`: non-empty array. Each step has `name`, `probe`, `expected`.
5. Assertion `kind`: must be in the closed union. Unknown → null.
6. Invariant `kind`: same.
7. Fields unknown to the grammar are preserved (forward compat) but
   warned about at load time.

### 8.6 Fixture convention — worldInheritance

Each step's probe carries `worldInheritance`:
- `keep` (default): use the scenario's topology for the first step;
  subsequent steps inherit whatever the runtime produced.
- `reset`: clear the session between this step and the prior step.
- `override`: carry a per-step `world` block (SurfaceSpec list +
  entropy) — used when a step needs a radically different substrate.

`keep` is the 95% case. Most scenarios only need the topology at
the top; steps chain through state evolution.

## 9. Laws per Phase

Laws pin invariants. Each phase gates on a named set; CI runs them
all on every commit. Prefix convention: `SC1…SCn` for scenario
laws, matching the probe IR's `S1…S9`.

### 9.1 Domain laws (S1)

**SC1** (Scenario identity): two scenarios with byte-equivalent
payloads produce the same `scenarioFingerprint`. Round-trip:
serializing and deserializing a Scenario preserves its fingerprint.

**SC2** (ScenarioVerdict exhaustiveness): `foldScenarioVerdict`
has a case for every variant. Compiler enforces via `never` exit;
law adds a runtime sanity check that every enumerated value routes.

**SC3** (SubstrateAssertion closed union): `foldSubstrateAssertion`
exhaustive; every listed kind dispatches.

**SC4** (Invariant closed union): `foldInvariant` exhaustive.

**SC5** (ScenarioError tagged fold): every `ScenarioError` variant
dispatches in `foldScenarioError`; the union is closed.

**SC6** (Domain purity): no file under `workshop/scenarios/domain/`
imports from `'effect'`. Enforced by a filesystem-walking test that
greps for `from 'effect'` in that subtree.

### 9.2 Loader laws (S2)

**SC7** (Round-trip): a round-tripped YAML load of the seed
scenarios produces byte-equivalent Scenario values when re-serialized
to canonical JSON. Pins the parser.

**SC8** (Malformed returns null): missing `scenario` key, missing
`steps`, unknown assertion kind, unknown invariant kind → `null`.
No throws.

**SC9** (Unknown preset rejected with structured error): a scenario
referencing `topology.preset: foobar` where foobar isn't in the
default registry returns `null` AND emits a diagnostic via a
returned `{ scenario: null, issues: Issue[] }` (API TBD — simplest
shape: loader returns `Result<Scenario, LoadIssue[]>`).

**SC10** (Forward compatibility): a scenario with a field unknown
to the grammar loads successfully but emits an `unknown-field`
warning issue. The Scenario value drops the unknown field.

### 9.3 Harness port laws (S3)

**SC11** (Dry harness trivially confirms): for any Scenario, the
dry harness's runner produces a ScenarioReceipt whose every
StepOutcome.completedAsExpected is true.

**SC12** (Session lifecycle): `openSession` resolves with a
SessionHandle; the runner's `Effect.scoped` guarantees release even
on error. Test: inject a step that throws; assert session closed.

**SC13** (Step execution stateless-in-dry): two dry-harness runs of
the same scenario produce byte-identical receipts (aside from
timestamps).

### 9.4 Receipt + fingerprint laws (S4)

**SC14** (ScenarioReceipt envelope shape): every receipt has
`version: 1`, `stage: 'evidence'`, `scope: 'scenario'`,
`kind: 'scenario-receipt'`.

**SC15** (Fingerprint stability): pinning the Clock + seed →
byte-identical `scenarioReceiptFingerprint` across runs.

**SC16** (Fingerprint sensitivity): changing any step's expected
outcome changes the scenario fingerprint; changing only a cosmetic
description field does not (descriptions are excluded from the
fingerprint input).

**SC17** (Lineage wire-up): ScenarioReceipt's `lineage.parents`
contains the per-step probe receipt artifact fingerprints;
`lineage.sources` carries `scenario:<scenario-id>`.

### 9.5 Invariant laws (S5)

For each of the 5 seed invariants:

**SC18–22** (one per invariant kind): test both held + violated
paths with hand-crafted traces. E.g.:
- `SC18.held`: a trace where alert appears once → held.
- `SC18.violated`: a trace where alert appears twice → violated
  with `observedSequence` noting the two occurrences.

### 9.6 Fixture-replay harness laws (S6)

**SC23** (Per-step classifier delegation): for every step in every
seed scenario, the fixture-replay harness's `executeStep` emits the
same observed outcome the standalone `classifyProbe(step.probe)`
would emit.

**SC24** (Session state evolves): a form scenario with a submit
step updates the session's WorldShape such that subsequent
assertions see the revealed alert surface.

**SC25** (Rung-2 parity with dry): for each seed scenario, the
dry and fixture-replay runners produce the same `ScenarioVerdict`
(with `trajectory-holds`).

### 9.7 Playwright-live harness laws (S7)

Playwright-live laws run as standalone scripts (same reasoning as
`verify-rung-3-parity.ts`).

**SC26** (Rung-3 parity): `scripts/verify-scenario-parity.ts` runs
every corpus scenario under fixture-replay + playwright-live;
asserts verdict equality and step-count equality.

**SC27** (Playwright determinism): two back-to-back playwright-live
runs of the same scenario produce identical `ScenarioVerdict`s
(timestamps + fingerprints may differ; semantic outcomes not).

**SC28** (Entropy invariance over scenarios): same scenario,
different entropy seed → same verdict. Mirrors the probe IR's
axis-invariance law at scenario level.

### 9.8 Corpus laws (S8)

**SC29** (All corpus scenarios pass under dry-harness): trivially
held by SC11; acts as a canary for authoring errors.

**SC30** (Parametric materialization preserves structure):
instantiating a parametric scenario with N params produces N
scenarios; each structurally equivalent modulo parameter
substitution; all share a parametric-template fingerprint stored
in provenance.

### 9.9 CLI laws (S9)

**SC31** (Verdict codes in exit): `tesseract scenario verify`
exits 0 iff every scenario has verdict `trajectory-holds`.

**SC32** (Harness flag routes correctly): `--harness=fixture-replay`
composes the fixture-replay layer; `--harness=playwright-live` the
live layer. Unit-test the layer resolver.

### 9.10 Law discipline

Every phase's commit message lists the SC-laws it seals. A CI law
(an architecture-style test) greps commit messages or verdict docs
for the SC-IDs to ensure the ledger stays complete.

## 10. Risk Register

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Scenario page state leaks across tests (cookies, localStorage) | Medium | Medium | Default `clearStateBetweenSteps: false` plus per-scenario fresh browser context. Tests explicitly set up state. |
| R2 | Invariants requiring MutationObserver are timing-sensitive | High | Medium | Scope S5 to trace-based invariants only; MutationObserver-based invariants (alert-announces-once real-time) defer to S7 with explicit timing windows. |
| R3 | Scenario fingerprint drifts on cosmetic changes | Low | High | Description + step names excluded from the fingerprint input. Only substantive fields (topology, step probes, expected, invariants) hash. |
| R4 | Corpus explodes — 1000s of scenarios per parametric generator | Medium | Medium | Tier scenarios (core / extended / deep). CI default runs core; extended opt-in via `--tier=extended`. |
| R5 | Playwright-live harness is slow (N steps × ~1s) | High | Medium | Parallelize at corpus level (P processes); per-scenario step timeouts; batching with shared browser contexts if needed. |
| R6 | Session state across steps is hard to reason about | Medium | High | Explicit `worldInheritance` per step (keep/reset/override). Default `keep` matches realistic flows; `reset` forces isolation. Document examples. |
| R7 | Cross-verb invariants need cross-receipt info not stamped today | Medium | Medium | Expand `ProbeOutcome.observed` with optional `observedDetails: Record<string, unknown>` for verbs that carry cross-verb-relevant state (locator-health-track's used strategy). Additive change; existing verbs ignore it. |
| R8 | Scenario YAML authoring skill cliff | Low | Low | Seed corpus with 3–5 thoughtful examples; extensive inline comments in each; CLI scaffolding `tesseract scenario init <id>` produces a template. |
| R9 | Fixture-replay session state model diverges from playwright-live reality | Medium | High | The fixture-replay session is an approximation; parity laws SC25 + SC26 catch drift. When they fail, investigate which rung has the bug (usually fixture-replay is under-modeled; add the axis that matters). |
| R10 | Receipt log size grows unbounded | Low | Low | Append-only log with size-based pruning policy (keep last N runs). Workshop scorecard's existing retention discipline applies. |
| R11 | Effect's `Data.TaggedError` not yet in use elsewhere in workshop | Low | Low | Verify the Effect version supports it; if not, use plain class-based errors with a discriminator field. Survey during S3. |
| R12 | Scenario runner uses `for…of` instead of `Effect.forEach` | Low | Low | `for…of` is the right shape for sequential-with-state (see §4.5). Law SC13 pins reproducibility; code review checks the `for…of` lives where `Effect.forEach` wouldn't help. |

## 11. Open Questions

These resolve at first real use — deliberately NOT answered
up front. Each has a default; real data overrides the default.

### Q1 — Scenario identity stability across substrate versions

When `SUBSTRATE_VERSION` bumps, do existing scenario fingerprints
stay valid? Intuition: yes, because fingerprints hash the authored
scenario, not the substrate. But receipts fingerprint both, so
substrate bumps invalidate receipt comparisons. Design decision to
revisit at first substrate major bump.

### Q2 — Fail-fast vs run-to-completion

Default is fail-fast (scenario stops on first step divergence).
Alternative: run all steps, report all divergences. Useful for
debugging ("show me every step that breaks"). Propose as a
`scenario.mode: 'fail-fast' | 'run-to-completion'` field; default
`fail-fast`; adopt the alternative when a user asks.

### Q3 — Per-step retries

Production scenarios sometimes retry flaky steps (network blip,
animation). The probe IR's fixture-replay is deterministic;
playwright-live is not. Do we allow `step.retries: number`? Default
0. If yes, how does parity with deterministic rungs work?
Deferred.

### Q4 — Scenario-level entropy vs step-level entropy

Today the plan carries one EntropyProfile on the scenario. Could
each step override? Would add expressiveness but complicate the
invariance law. Deferred; scenario-level is sufficient for seed
corpus.

### Q5 — Assertion failure verbosity

When a `surface-present` assertion fails, the AssertionOutcome's
`observed` + `expected` string fields need to carry a useful diff.
What shape? Probably a small structured object serialized as JSON.
Resolve at S3 when first assertion law lands.

### Q6 — Scenario diff / visual rendering

Dashboard projection in S9 shows a list of scenarios. Should it
also show a trace visualization (step-by-step timeline)? Low-pri
UI work; scope out unless a real user asks. Default: tabular list.

### Q7 — Cross-process corpus verification

For parallel execution (R5 mitigation), we'd spawn child processes
each running a subset of scenarios. Does the receipt log handle
concurrent appends? Current logs use file-per-write; should hold
up. Verify at S7 under the parallel harness.

### Q8 — Regression-watch mode

A daemon that re-runs the corpus on every substrate change? Out of
scope. If needed, build on top of the S9 CLI via a wrapper script.

## 12. Success Criteria (Done Definition)

The scenario corpus work is *complete* when:

1. **Domain types land** (S1–S2): 40+ laws green; no Effect imports
   in domain tree.
2. **Runner composes** (S3–S5): `runScenario` produces valid
   ScenarioReceipts under the dry harness; invariant folds
   exhaustive; receipts append to the log location.
3. **Fixture-replay parity** (S6): 4+ seed scenarios pass under
   both dry + fixture-replay with identical verdicts.
4. **Playwright-live parity** (S7): same scenarios pass under
   playwright-live; `verify:scenario-parity` script green.
5. **Corpus seeded** (S8): ≥4 distinct scenarios covering the main
   forecast cases (form correction, cascading selection, alert
   deduplication, cross-verb strategy preference).
6. **CLI surface live** (S9): `tesseract scenario verify`
   passes; `verdict-08.md` records graduation.
7. **Full regression** passes: ~3700+ tests green; build clean;
   seam laws hold; manifest unchanged.

### Anti-goals (if we hit these, we went off-path)

- **Business-domain vocabulary creeping in**: "insurance" /
  "policy" / "customer" / etc. appearing in scenario YAMLs. Hard
  fail.
- **Quadratic complexity anywhere**: a scenario runner that walks
  the trace per step. Detected by Big-O table in §5 being violated.
- **Circular dependencies** between `workshop/scenarios/domain/`
  and `workshop/scenarios/application/`. Domain must not import
  application.
- **New product-side verbs**. The scenario work is entirely
  workshop-side; manifest is untouched.
- **Sharing mutable state between scenarios**. Each scenario runs
  in isolation; no cross-scenario memoization / caching.

### The graduation artifact

At S9 completion, `workshop/observations/probe-spike-verdict-08.md`
records:

- Which scenarios the corpus carries (id + topology + invariant set).
- Parity status across all three rungs (dry/fixture-replay/live).
- The SC-law ledger (SC1–SC32, all green).
- Forward work queue (the Open Questions that became live).

The naming convention (`probe-spike-verdict-N.md`) is extended —
the scenario corpus is the probe IR's successor trajectory.
Verdicts stay in `workshop/observations/` and stay numbered.

## Appendix A — Phase Dependency Graph

```
                ┌──────────────┐
                │ S1: domain   │
                │  primitives  │
                └──────┬───────┘
                       │
              ┌────────┴────────┐
              │                 │
      ┌───────▼───────┐ ┌──────▼──────┐
      │ S2: loader    │ │ S3: harness │
      │               │ │  port + dry │
      └───────┬───────┘ └──────┬──────┘
              │                │
              └────────┬───────┘
                       │
              ┌────────▼────────┐
              │ S4: receipt     │
              │  + fingerprint  │
              └────────┬────────┘
                       │
              ┌────────▼────────┐
              │ S5: invariant   │
              │  evaluation     │
              └────────┬────────┘
                       │
              ┌────────▼────────┐
              │ S6: fixture-    │
              │  replay harness │
              └────────┬────────┘
                       │
              ┌────────▼────────┐
              │ S7: playwright- │
              │  live harness   │
              └────────┬────────┘
                       │
              ┌────────▼────────┐
              │ S8: corpus seed │
              │  + parametric   │
              └────────┬────────┘
                       │
              ┌────────▼────────┐
              │ S9: CLI +       │
              │  dashboard      │
              └────────┬────────┘
                       │
              ┌────────▼────────┐
              │ verdict-08      │
              └─────────────────┘
```

## Appendix B — Pointers

- Forecast (what + why): `docs/v2-scenario-corpus-forecast.md`.
- Probe IR plan parent: `docs/v2-probe-ir-spike.md`.
- Coding discipline: `docs/coding-notes.md` (FP + Effect + DDD).
- Substrate primitives: `workshop/substrate/`.
- Probe IR primitives: `workshop/probe-derivation/`.
- Prior verdicts: `workshop/observations/probe-spike-verdict-{01..07}.md`.
- This plan lives here as the authoritative "how" document; cross-
  reference from verdict-08 when it lands.


