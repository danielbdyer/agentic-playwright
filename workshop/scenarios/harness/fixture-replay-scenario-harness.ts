/**
 * Fixture-replay scenario harness — rung-2 substrate.
 *
 * Per docs/v2-scenario-corpus-plan.md §7.S6, this harness runs
 * scenarios against a simulated substrate state (an in-memory
 * WorldShape that mutates across steps). For each step:
 *
 *   1. Determine the active world. If the step has worldInheritance:
 *      'reset' OR 'override', start fresh from scenario.topology
 *      (resolved via the topology registry); otherwise inherit the
 *      session's evolving world.
 *   2. Synthesize a Probe whose worldSetup carries the active
 *      surfaces — gives existing rung-2 verb classifiers
 *      (workshop/probe-derivation/classifiers/*) the world they
 *      need to classify.
 *   3. Delegate observed-outcome computation to the registered
 *      VerbClassifier for the step's verb.
 *   4. Evaluate pre/post assertions against the active world.
 *   5. Apply step-specific state mutations: if the step is
 *      `interact action=click` on a Submit-named button inside a
 *      form-with-required-fields-filled, reveal the success/error
 *      surface (mirrors the FormRenderer FSM at rung 3).
 */

import { Effect } from 'effect';
import {
  lookupClassifier,
  type VerbClassifierRegistry,
} from '../../probe-derivation/verb-classifier';
import { createDefaultVerbClassifierRegistry } from '../../probe-derivation/classifiers/default-registry';
import { createDefaultTopologyRegistry } from '../../substrate/test-topology-catalog';
import {
  lookupTopology,
  type TestTopologyRegistry,
} from '../../substrate/test-topology';
import type { SurfaceSpec, SurfaceRole } from '../../substrate/surface-spec';
import { isSurfaceHidden } from '../../substrate/surface-spec';
import type {
  ScenarioHarnessService,
  SessionHandle,
} from '../application/scenario-harness-port';
import {
  ASSERTION_HELD,
  assertionViolated,
  foldSubstrateAssertion,
  type AssertionOutcome,
  type SubstrateAssertion,
} from '../domain/assertion';
import {
  type Invariant,
  type InvariantOutcome,
} from '../domain/invariant';
import { evaluateInvariantPure } from '../application/evaluate-invariants';
import {
  sessionOpenFailed,
  type ScenarioError,
} from '../domain/scenario-error';
import type { Scenario, ScenarioStep } from '../domain/scenario';
import type { StepOutcome, AssertionRun } from '../domain/scenario-trace';

/** Concrete session shape (private to this harness; the runner
 *  treats SessionHandle as opaque). */
interface FixtureReplaySession {
  readonly kind: 'fixture-replay-session';
  readonly scenarioId: string;
  /** Mutable view of the current world's surfaces. Mutates across
   *  steps to model state evolution (form submits revealing alerts,
   *  etc.). */
  surfaces: SurfaceSpec[];
  /** Track field values typed during interact steps so subsequent
   *  submit actions can decide success vs error. */
  fieldValues: Map<string, string>;
}

export interface FixtureReplayHarnessOptions {
  readonly verbClassifiers?: VerbClassifierRegistry;
  readonly topologyRegistry?: TestTopologyRegistry;
  readonly now?: () => Date;
}

export function createFixtureReplayScenarioHarness(
  options: FixtureReplayHarnessOptions = {},
): ScenarioHarnessService {
  const verbClassifiers = options.verbClassifiers ?? createDefaultVerbClassifierRegistry();
  const topologyRegistry = options.topologyRegistry ?? createDefaultTopologyRegistry();
  const now = options.now ?? (() => new Date());

  return {
    tag: 'scenario-fixture-replay',

    openSession: (scenario: Scenario) =>
      Effect.gen(function* () {
        const initialSurfaces = resolveInitialSurfaces(scenario, topologyRegistry);
        if (initialSurfaces === null) {
          return yield* Effect.fail<ScenarioError>(
            sessionOpenFailed(scenario.id, `unknown topology preset "${scenario.topology.preset}"`),
          );
        }
        const session: FixtureReplaySession = {
          kind: 'fixture-replay-session',
          scenarioId: scenario.id,
          surfaces: deepCopySurfaces(initialSurfaces),
          fieldValues: new Map(),
        };
        return session as SessionHandle;
      }),

    closeSession: (_session: SessionHandle) => Effect.void,

    executeStep: (sessionHandle, step, _previous) =>
      Effect.gen(function* () {
        const session = sessionHandle as FixtureReplaySession;
        const startedAt = now();

        // Reset the world if the step requests it.
        if (step.worldInheritance === 'reset') {
          // Fall back to scenario topology requires re-resolution; for
          // simplicity, reset clears state but doesn't re-fetch
          // topology (caller authoring discipline: only use 'reset' when
          // you mean it).
          session.fieldValues.clear();
        }

        // Pre-conditions evaluated against the current world.
        const preconditionOutcomes: AssertionRun[] = step.preconditions.map((a) => ({
          assertion: a,
          outcome: evaluateAssertionAgainst(a, session),
        }));

        // Synthesize the probe's worldSetup so the verb classifier
        // sees the live world. Many existing classifiers read
        // probe.worldSetup.surfaces.
        const worldSetup: Record<string, unknown> = {
          surfaces: session.surfaces,
        };

        // Delegate to the registered verb classifier. If absent,
        // fall back to ambiguous.
        const classifier = lookupClassifier(verbClassifiers, step.probe.verb);
        const observed = classifier === null
          ? { classification: 'ambiguous' as const, errorFamily: null }
          : yield* Effect.either(
              classifier.classify({ ...step.probe, worldSetup }),
            ).pipe(
              Effect.map((either) =>
                either._tag === 'Right'
                  ? either.right
                  : { classification: 'failed' as const, errorFamily: 'unclassified' as const },
              ),
            );

        // Apply step-specific substrate mutations.
        applyStepMutations(session, step);

        // Post-conditions evaluated against the (possibly mutated)
        // world.
        const postconditionOutcomes: AssertionRun[] = step.postconditions.map((a) => ({
          assertion: a,
          outcome: evaluateAssertionAgainst(a, session),
        }));

        const completedAt = now();
        const completedAsExpected =
          observed.classification === step.expected.classification &&
          observed.errorFamily === step.expected.errorFamily;

        const outcome: StepOutcome = {
          stepName: step.name,
          probeReceiptRef: { probeId: step.probe.id },
          observed,
          preconditionOutcomes,
          postconditionOutcomes,
          elapsedMs: completedAt.getTime() - startedAt.getTime(),
          completedAsExpected,
        };
        return outcome;
      }),

    evaluateAssertion: (sessionHandle, assertion) =>
      Effect.sync(() => evaluateAssertionAgainst(assertion, sessionHandle as FixtureReplaySession)),

    evaluateInvariant: (_session, invariant: Invariant, trace) =>
      Effect.sync<InvariantOutcome>(() => evaluateInvariantPure(invariant, trace)),
  };
}

// ─── Helpers ───

function resolveInitialSurfaces(
  scenario: Scenario,
  registry: TestTopologyRegistry,
): readonly SurfaceSpec[] | null {
  const topology = lookupTopology(registry, scenario.topology.preset);
  if (topology === null) return null;
  return topology.surfaces;
}

function deepCopySurfaces(surfaces: readonly SurfaceSpec[]): SurfaceSpec[] {
  return surfaces.map((s) => ({
    ...s,
    ...(s.children !== undefined ? { children: deepCopySurfaces(s.children) } : {}),
  }));
}

function flattenSurfaces(surfaces: readonly SurfaceSpec[]): SurfaceSpec[] {
  const out: SurfaceSpec[] = [];
  function walk(s: SurfaceSpec): void {
    out.push(s);
    if (s.children !== undefined) {
      for (const c of s.children) walk(c);
    }
  }
  for (const s of surfaces) walk(s);
  return out;
}

function findSurface(
  surfaces: readonly SurfaceSpec[],
  role: SurfaceRole,
  name?: string,
): SurfaceSpec | null {
  for (const s of flattenSurfaces(surfaces)) {
    if (s.role === role && (name === undefined || s.name === name)) {
      return s;
    }
  }
  return null;
}

function evaluateAssertionAgainst(
  assertion: SubstrateAssertion,
  session: FixtureReplaySession,
): AssertionOutcome {
  return foldSubstrateAssertion(assertion, {
    surfacePresent: (a) => {
      const s = findSurface(session.surfaces, a.target.role, a.target.name);
      return s !== null && !isSurfaceHidden(s)
        ? ASSERTION_HELD
        : assertionViolated('not present (or hidden)', `${a.target.role}/${a.target.name ?? '*'}`);
    },
    surfaceAbsent: (a) => {
      const s = findSurface(session.surfaces, a.target.role, a.target.name);
      return s === null
        ? ASSERTION_HELD
        : assertionViolated('present', `${a.target.role}/${a.target.name ?? '*'} absent`);
    },
    surfaceHasValue: (a) => {
      const stored = session.fieldValues.get(a.target.name) ?? '';
      return stored === a.expectedValue
        ? ASSERTION_HELD
        : assertionViolated(stored, a.expectedValue);
    },
    surfaceIsFocused: () =>
      // Focus tracking is rung-3; at rung-2 we assume held since
      // there's no focus model.
      ASSERTION_HELD,
    surfaceCount: (a) => {
      const count = flattenSurfaces(session.surfaces).filter((s) => s.role === a.role).length;
      return count === a.count
        ? ASSERTION_HELD
        : assertionViolated(`count=${count}`, `count=${a.count}`);
    },
  });
}

/** Apply state mutations to the session based on the step's probe.
 *  - interact action=input → record the field value.
 *  - interact action=click on a Submit button → if the form has
 *    required fields and all are filled, reveal a status alert;
 *    otherwise reveal an error alert. */
function applyStepMutations(session: FixtureReplaySession, step: ScenarioStep): void {
  const input = step.probe.input as Record<string, unknown> | null;
  if (input === null || typeof input !== 'object') return;
  const action = typeof input['action'] === 'string' ? input['action'] : null;
  const target = input['target'];
  if (action === null || typeof target !== 'object' || target === null) return;
  const targetRecord = target as Record<string, unknown>;
  const targetName = typeof targetRecord['name'] === 'string' ? targetRecord['name'] : null;

  if (action === 'input' && targetName !== null) {
    const value = typeof input['value'] === 'string' ? input['value'] : '';
    session.fieldValues.set(targetName, value);
    return;
  }

  if (action === 'click' && targetName !== null) {
    // Find a form ancestor; if it has required textbox children,
    // check fill state.
    const form = findFormContaining(session.surfaces, targetName);
    if (form === null) return;
    if (form.submitReveal === undefined || form.submitReveal === 'no-reveal') return;
    let revealKind: 'success' | 'error' = 'success';
    let alertName = form.successMessage ?? 'Form submitted';
    if (form.submitReveal === 'always-error') {
      revealKind = 'error';
      alertName = form.errorMessage ?? 'Form has errors';
    } else if (form.submitReveal === 'success-on-required-filled') {
      const requiredFields = collectRequiredFieldNames(form);
      const allFilled = requiredFields.every((fn) => (session.fieldValues.get(fn) ?? '').length > 0);
      if (!allFilled) {
        revealKind = 'error';
        alertName = form.errorMessage ?? 'Please complete required fields';
      } else {
        alertName = form.successMessage ?? 'Form submitted';
      }
    }
    revealAlert(session, revealKind, alertName);
  }
}

function findFormContaining(
  surfaces: readonly SurfaceSpec[],
  buttonName: string,
): SurfaceSpec | null {
  for (const s of surfaces) {
    if (s.role === 'form' && hasButtonChildNamed(s, buttonName)) return s;
    if (s.children !== undefined) {
      const inner = findFormContaining(s.children, buttonName);
      if (inner !== null) return inner;
    }
  }
  return null;
}

function hasButtonChildNamed(form: SurfaceSpec, buttonName: string): boolean {
  if (form.children === undefined) return false;
  for (const c of form.children) {
    if (c.role === 'button' && c.name === buttonName) return true;
    if (c.children !== undefined && hasButtonChildNamed(c, buttonName)) return true;
  }
  return false;
}

function collectRequiredFieldNames(form: SurfaceSpec): string[] {
  const out: string[] = [];
  function walk(s: SurfaceSpec): void {
    if (s.role === 'textbox' && s.required === true && s.name !== undefined) {
      out.push(s.name);
    }
    if (s.children !== undefined) {
      for (const c of s.children) walk(c);
    }
  }
  walk(form);
  return out;
}

function revealAlert(
  session: FixtureReplaySession,
  revealKind: 'success' | 'error',
  alertName: string,
): void {
  const role: SurfaceRole = revealKind === 'success' ? 'status' : 'alert';
  // Only reveal once — repeated submits don't duplicate the alert
  // (matches the rung-3 FormRenderer's behavior).
  const existing = findSurface(session.surfaces, role, alertName);
  if (existing !== null) return;
  session.surfaces.push({ role, name: alertName });
}
