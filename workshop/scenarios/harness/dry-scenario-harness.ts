/**
 * Dry scenario harness — proves the runner end-to-end without a
 * real substrate.
 *
 * Per docs/v2-scenario-corpus-plan.md §7.S3b, this harness echoes
 * every step's expected outcome as its observed outcome (so
 * `completedAsExpected` is always true), held() for every
 * assertion, and held() for every invariant. The runner threads
 * through unchanged; receipts have a stable shape.
 *
 * Use cases:
 *   - Smoke-testing the runner pipeline.
 *   - Authoring new scenarios offline before the higher-rung
 *     harnesses are wired.
 *   - The baseline-rung in the eventual scenario-parity gate
 *     (analogous to the dry probe harness's role at rung 1).
 */

import { Effect } from 'effect';
import type {
  ScenarioHarnessService,
  SessionHandle,
} from '../application/scenario-harness-port';
import {
  ASSERTION_HELD,
  type AssertionOutcome,
  foldSubstrateAssertion,
  type SubstrateAssertion,
} from '../domain/assertion';
import {
  invariantHeld,
  type Invariant,
  type InvariantOutcome,
} from '../domain/invariant';
import type {
  Scenario,
  ScenarioStep,
} from '../domain/scenario';
import type { StepOutcome } from '../domain/scenario-trace';

/** Build a dry harness. Optionally injects a clock for deterministic
 *  startedAt / elapsedMs in tests. */
export function createDryScenarioHarness(opts?: {
  readonly now?: () => Date;
}): ScenarioHarnessService {
  const now = opts?.now ?? (() => new Date());

  return {
    tag: 'scenario-dry',

    openSession: (_scenario: Scenario) =>
      Effect.succeed({ kind: 'dry-session' } as SessionHandle),

    closeSession: (_session: SessionHandle) => Effect.void,

    executeStep: (_session, step, _previous) =>
      Effect.sync(() => {
        const startedAt = now();
        const observed = {
          classification: step.expected.classification,
          errorFamily: step.expected.errorFamily,
        };
        const preconditionOutcomes = step.preconditions.map((a) => ({
          assertion: a,
          outcome: ASSERTION_HELD,
        }));
        const postconditionOutcomes = step.postconditions.map((a) => ({
          assertion: a,
          outcome: ASSERTION_HELD,
        }));
        const completedAt = now();
        const outcome: StepOutcome = {
          stepName: step.name,
          probeReceiptRef: { probeId: step.probe.id },
          observed,
          preconditionOutcomes,
          postconditionOutcomes,
          elapsedMs: completedAt.getTime() - startedAt.getTime(),
          completedAsExpected: true,
        };
        return outcome;
      }),

    evaluateAssertion: (_session, assertion: SubstrateAssertion) =>
      Effect.sync<AssertionOutcome>(() =>
        // foldSubstrateAssertion enforces exhaustiveness even though
        // the dry harness returns the same outcome for every kind.
        foldSubstrateAssertion(assertion, {
          surfacePresent: () => ASSERTION_HELD,
          surfaceAbsent: () => ASSERTION_HELD,
          surfaceHasValue: () => ASSERTION_HELD,
          surfaceIsFocused: () => ASSERTION_HELD,
          surfaceCount: () => ASSERTION_HELD,
        }),
      ),

    evaluateInvariant: (_session, invariant: Invariant, _trace) =>
      Effect.succeed<InvariantOutcome>(invariantHeld(`dry-harness echoes invariant ${invariant.kind}`)),
  };
}
