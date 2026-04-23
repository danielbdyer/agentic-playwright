/**
 * Scenario — the v2 corpus aggregate root.
 *
 * Per docs/v2-scenario-corpus-plan.md §3.1, a Scenario composes
 * probes into an ordered trajectory through substrate states. It
 * is the unit the workshop's scenario corpus emits; per-step
 * receipts (ProbeReceipts) and the aggregate ScenarioReceipt are
 * the runtime evidence.
 *
 * This module is the pure domain layer — no Effect, no IO. Types
 * + folds only. The runner (`workshop/scenarios/application/run-
 * scenario.ts`) consumes these types under an injected
 * ScenarioHarness service.
 */

import type { Probe } from '../../probe-derivation/probe-ir';
import type { ProbeOutcome } from '../../probe-derivation/probe-receipt';
import type { EntropyProfile } from '../../substrate/entropy-profile';
import type { SubstrateAssertion } from './assertion';
import type { Invariant } from './invariant';

/** Branded scenario identity. Convention: kebab-case, mirrors the
 *  fixture filename (`form-success-recovery.scenario.yaml` →
 *  `form-success-recovery`). */
export type ScenarioId = string & { readonly __brand: 'ScenarioId' };

/** Branded step name. Convention: kebab-case, action-centric
 *  (`fill-identifier`, `submit-empty-reveals-error`). */
export type StepName = string & { readonly __brand: 'StepName' };

/** Reference to a topology preset registered in the workshop's
 *  TestTopologyRegistry. Today only `kind: 'preset'` is supported;
 *  inline `{ kind: 'inline'; surfaces: [...] }` may land later if a
 *  scenario needs a one-off composition. */
export interface TopologyRef {
  readonly kind: 'preset';
  readonly preset: string;
}

/** Whether a step inherits the prior step's substrate state. */
export type WorldInheritance = 'keep' | 'reset' | 'override';

/** One transition inside a scenario: a probe invocation + per-step
 *  expectation + optional pre/post substrate assertions. */
export interface ScenarioStep {
  readonly name: StepName;
  readonly probe: Probe;
  readonly expected: ProbeOutcome['expected'];
  readonly worldInheritance: WorldInheritance;
  readonly preconditions: readonly SubstrateAssertion[];
  readonly postconditions: readonly SubstrateAssertion[];
}

/** Closed verdict union. Adding a value requires a corresponding
 *  case in `foldScenarioVerdict` — exhaustive switch enforces it. */
export type ScenarioVerdict =
  | 'trajectory-holds'
  | 'step-diverged'
  | 'invariant-violated'
  | 'harness-failed';

/** Authored expectation about the scenario's overall verdict.
 *  Almost always `trajectory-holds`; alternate values describe
 *  scenarios that intentionally provoke failure for negative
 *  testing of the runner. */
export interface ScenarioExpectation {
  readonly verdict: ScenarioVerdict;
}

/** The Scenario aggregate root. */
export interface Scenario {
  readonly id: ScenarioId;
  readonly description: string;
  readonly schemaVersion: number;
  readonly topology: TopologyRef;
  readonly entropy?: EntropyProfile;
  readonly steps: readonly ScenarioStep[];
  readonly invariants: readonly Invariant[];
  readonly expected: ScenarioExpectation;
  /** Default false. When true, the harness clears session state
   *  (browser cookies, in-memory WorldShape, etc.) between every
   *  step. Useful for scenarios that intentionally test step
   *  isolation. */
  readonly clearStateBetweenSteps: boolean;
  /** Per-step timeout cap in milliseconds. The harness aborts a
   *  step that exceeds this and classifies it as a step-diverged
   *  verdict. Default 5000. */
  readonly maxStepTimeoutMs: number;
}

/** Exhaustive ScenarioVerdict fold. Adding a verdict variant is a
 *  typecheck error until every consumer adds the case. */
export function foldScenarioVerdict<R>(
  verdict: ScenarioVerdict,
  cases: {
    readonly trajectoryHolds: () => R;
    readonly stepDiverged: () => R;
    readonly invariantViolated: () => R;
    readonly harnessFailed: () => R;
  },
): R {
  switch (verdict) {
    case 'trajectory-holds':    return cases.trajectoryHolds();
    case 'step-diverged':       return cases.stepDiverged();
    case 'invariant-violated':  return cases.invariantViolated();
    case 'harness-failed':      return cases.harnessFailed();
  }
}

/** Convenience constructors that brand strings as ScenarioId / StepName.
 *  Pure; runtime check is identity. */
export function scenarioId(value: string): ScenarioId {
  return value as ScenarioId;
}

export function stepName(value: string): StepName {
  return value as StepName;
}

/** A normalized canonical key for a scenario — used as the
 *  fingerprint input. Excludes `description` (cosmetic) and step
 *  `name` (cosmetic identifier). Preserves all behaviorally-
 *  significant fields. */
export function scenarioKeyableShape(scenario: Scenario): unknown {
  return {
    id: scenario.id,
    schemaVersion: scenario.schemaVersion,
    topology: scenario.topology,
    entropy: scenario.entropy ?? null,
    steps: scenario.steps.map((step) => ({
      probe: {
        verb: step.probe.verb,
        input: step.probe.input,
        worldSetup: step.probe.worldSetup ?? null,
      },
      expected: step.expected,
      worldInheritance: step.worldInheritance,
      preconditions: step.preconditions,
      postconditions: step.postconditions,
    })),
    invariants: scenario.invariants,
    expected: scenario.expected,
    clearStateBetweenSteps: scenario.clearStateBetweenSteps,
    maxStepTimeoutMs: scenario.maxStepTimeoutMs,
  };
}
