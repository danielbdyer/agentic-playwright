/**
 * ScenarioHarness — the port the scenario runner consumes.
 *
 * Per docs/v2-scenario-corpus-plan.md §4.1, three implementations
 * realize this port:
 *   - dry-scenario-harness (S3): per-step echo of expected.
 *   - fixture-replay-scenario-harness (S6): delegates to
 *     VerbClassifier per step + maintains an in-memory WorldShape.
 *   - playwright-live-scenario-harness (S7): real Chromium + real
 *     substrate server; per-step state persists across the session.
 *
 * The port is intentionally narrow: open a session, execute a
 * step, evaluate one assertion, evaluate one invariant. The runner
 * orchestrates the four operations; harnesses don't carry runner
 * logic.
 */

import { Context, type Effect } from 'effect';
import type { Invariant, InvariantOutcome } from '../domain/invariant';
import type { AssertionOutcome, SubstrateAssertion } from '../domain/assertion';
import type { Scenario, ScenarioStep } from '../domain/scenario';
import type { ScenarioError } from '../domain/scenario-error';
import type { ScenarioTrace, StepOutcome } from '../domain/scenario-trace';

/** Opaque session handle. Each harness implementation defines its
 *  own concrete shape under the hood; the port treats it as
 *  unknown so the runner doesn't depend on harness internals. */
export type SessionHandle = unknown;

/** The harness's service interface. */
export interface ScenarioHarnessService {
  /** Acquire any per-scenario resources (browser page, in-memory
   *  state). The return value is the handle the runner threads
   *  through subsequent operations. */
  readonly openSession: (
    scenario: Scenario,
  ) => Effect.Effect<SessionHandle, ScenarioError, never>;

  /** Close + release any session resources. Always called on scope
   *  exit. */
  readonly closeSession: (
    session: SessionHandle,
  ) => Effect.Effect<void, never, never>;

  /** Execute one step against the session. Produces a StepOutcome
   *  carrying the probe-equivalent observation + per-assertion
   *  outcomes. */
  readonly executeStep: (
    session: SessionHandle,
    step: ScenarioStep,
    previousOutcomes: readonly StepOutcome[],
  ) => Effect.Effect<StepOutcome, ScenarioError, never>;

  /** Evaluate a single SubstrateAssertion against the current
   *  session state. Used outside the per-step pre/post block when
   *  the runner needs an ad-hoc query. */
  readonly evaluateAssertion: (
    session: SessionHandle,
    assertion: SubstrateAssertion,
  ) => Effect.Effect<AssertionOutcome, ScenarioError, never>;

  /** Evaluate a single Invariant over the complete trace. The
   *  trace argument is `readonly` — invariants compute, never
   *  mutate. */
  readonly evaluateInvariant: (
    session: SessionHandle,
    invariant: Invariant,
    trace: ScenarioTrace,
  ) => Effect.Effect<InvariantOutcome, ScenarioError, never>;

  /** Tag identifying which harness produced the receipt. Stamped
   *  onto ScenarioReceipt provenance. */
  readonly tag: 'scenario-dry' | 'scenario-fixture-replay' | 'scenario-playwright-live';
}

export class ScenarioHarness extends Context.Tag('workshop/scenarios/ScenarioHarness')<
  ScenarioHarness,
  ScenarioHarnessService
>() {}
