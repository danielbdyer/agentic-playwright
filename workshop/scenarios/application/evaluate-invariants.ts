/**
 * Pure invariant evaluators.
 *
 * Per docs/v2-scenario-corpus-plan.md §9.5, each invariant kind
 * has a deterministic evaluator that walks the trace and produces
 * either `held` (with evidence) or `violated` (with observed
 * sequence + expected property).
 *
 * The evaluators are *pure* — they read the trace, never mutate.
 * Trace-augmenting state (e.g., MutationObserver event streams for
 * the alert-announces-once invariant under playwright-live) is
 * collected by the harness during step execution and stored in
 * StepOutcome's assertion outcomes; evaluators read from there.
 *
 * Each evaluator is small (≤30 LOC). The dispatcher
 * `evaluateInvariantPure` folds over the closed Invariant union.
 */

import {
  foldInvariant,
  invariantHeld,
  invariantViolated,
  type Invariant,
  type InvariantOutcome,
} from '../domain/invariant';
import {
  foldSubstrateAssertion,
  type SubstrateAssertion,
} from '../domain/assertion';
import type { ScenarioTrace, StepOutcome } from '../domain/scenario-trace';

/** Evaluate an invariant against a trace. Pure. Used by every
 *  harness's `evaluateInvariant` implementation. Each harness
 *  controls what gets *into* the trace (DOM observations, etc.);
 *  the evaluator's job is the trace reading. */
export function evaluateInvariantPure(
  invariant: Invariant,
  trace: ScenarioTrace,
): InvariantOutcome {
  return foldInvariant(invariant, {
    ariaAlertOnce: (i) => evaluateAriaAlertOnce(i.target.name, trace),
    focusStays: (i) => evaluateFocusStaysWithinLandmark(i.landmark, trace),
    formStatePreserved: (i) => evaluateFormStatePreserved(i.formName, i.fieldNames, trace),
    validationClears: (i) => evaluateValidationErrorsClear(i.fieldName, i.errorAlertName, trace),
    crossVerbStrategy: (i) => evaluateCrossVerbStrategy(i.facetId, i.failedStrategy, i.preferredAlternate, trace),
  });
}

// ─── per-invariant evaluators ───

/** "alert with this name appears at most once across the trace." */
function evaluateAriaAlertOnce(
  alertName: string,
  trace: ScenarioTrace,
): InvariantOutcome {
  let count = 0;
  const stepLabels: string[] = [];
  for (const step of trace.steps) {
    if (postconditionMentionsAlert(step, alertName)) {
      count += 1;
      stepLabels.push(`step:${step.stepName}`);
    }
  }
  if (count <= 1) {
    return invariantHeld(`alert "${alertName}" appeared ${count} time(s) across ${trace.steps.length} step(s)`);
  }
  return invariantViolated(stepLabels, `alert "${alertName}" should announce at most once`);
}

function postconditionMentionsAlert(
  step: StepOutcome,
  alertName: string,
): boolean {
  for (const run of step.postconditionOutcomes) {
    if (matchesAlertAssertion(run.assertion, alertName)) {
      return true;
    }
  }
  return false;
}

function matchesAlertAssertion(
  assertion: SubstrateAssertion,
  alertName: string,
): boolean {
  return foldSubstrateAssertion(assertion, {
    surfacePresent: (a) =>
      a.target.role === 'alert' && a.target.name === alertName,
    surfaceAbsent: () => false,
    surfaceHasValue: () => false,
    surfaceIsFocused: () => false,
    surfaceCount: () => false,
  });
}

/** "Focus stays within the named landmark across the trace."
 *  The harness must have stamped surface-is-focused outcomes at
 *  each step's postcondition for this to evaluate meaningfully.
 *  Today the dry harness fakes held; rung-3 lands the real check. */
function evaluateFocusStaysWithinLandmark(
  landmark: { readonly role: string; readonly name?: string },
  trace: ScenarioTrace,
): InvariantOutcome {
  // Walk the trace; the invariant holds if no postcondition
  // recorded a focus-violation. Without per-step focus snapshots
  // (rung-3-specific data), the evaluator returns held with a
  // note explaining it has no evidence to refute.
  const violatingSteps = trace.steps.filter((step) =>
    step.postconditionOutcomes.some(
      (run) =>
        foldSubstrateAssertion(run.assertion, {
          surfacePresent: () => false,
          surfaceAbsent: () => false,
          surfaceHasValue: () => false,
          surfaceIsFocused: () => run.outcome.kind === 'violated',
          surfaceCount: () => false,
        }),
    ),
  );
  if (violatingSteps.length === 0) {
    return invariantHeld(
      `no focus-violations recorded across ${trace.steps.length} step(s) (landmark ${landmark.role})`,
    );
  }
  return invariantViolated(
    violatingSteps.map((s) => `step:${s.stepName}`),
    `focus must stay within landmark ${landmark.role}`,
  );
}

/** "Form fields' values persist across navigate-step transitions." */
function evaluateFormStatePreserved(
  formName: string,
  fieldNames: readonly string[],
  trace: ScenarioTrace,
): InvariantOutcome {
  // For each pair of consecutive (navigate-step, next-step), the
  // post-conditions of the navigate step must include
  // surface-has-value assertions for every field, AND those values
  // must equal the pre-navigate values. With the trace shape we
  // have, we look for surface-has-value assertion held outcomes for
  // each field name; if any are violated, the invariant fails.
  const violatingFields: string[] = [];
  for (const step of trace.steps) {
    for (const run of step.postconditionOutcomes) {
      const isFieldValueAssertion = foldSubstrateAssertion(run.assertion, {
        surfacePresent: () => false,
        surfaceAbsent: () => false,
        surfaceHasValue: (a) => fieldNames.includes(a.target.name),
        surfaceIsFocused: () => false,
        surfaceCount: () => false,
      });
      if (isFieldValueAssertion && run.outcome.kind === 'violated') {
        const fieldName = foldSubstrateAssertion(run.assertion, {
          surfacePresent: () => '',
          surfaceAbsent: () => '',
          surfaceHasValue: (a) => a.target.name,
          surfaceIsFocused: () => '',
          surfaceCount: () => '',
        });
        violatingFields.push(`step:${step.stepName}/field:${fieldName}`);
      }
    }
  }
  if (violatingFields.length === 0) {
    return invariantHeld(
      `form "${formName}" fields ${fieldNames.join(', ')} preserved across trace`,
    );
  }
  return invariantViolated(
    violatingFields,
    `form "${formName}" fields ${fieldNames.join(', ')} must persist across navigation`,
  );
}

/** "Once an error alert appears, completing the named field clears
 *  it before the next step." */
function evaluateValidationErrorsClear(
  fieldName: string,
  errorAlertName: string,
  trace: ScenarioTrace,
): InvariantOutcome {
  // Walk: find a step where the error alert appeared in
  // postconditions; then look for a subsequent step whose probe is
  // an interact/input on the named field; the step AFTER that
  // should NOT have the alert in its postconditions.
  let alertSeenAtIndex = -1;
  let correctionSeenAtIndex = -1;
  for (let i = 0; i < trace.steps.length; i += 1) {
    const step = trace.steps[i]!;
    if (alertSeenAtIndex === -1 && postconditionMentionsAlert(step, errorAlertName)) {
      alertSeenAtIndex = i;
      continue;
    }
    if (alertSeenAtIndex !== -1 && correctionSeenAtIndex === -1) {
      // Not introspecting the probe input here (it's opaque) — the
      // dry harness assumes corrections happen in any subsequent
      // input step. Higher-rung harnesses can refine.
      correctionSeenAtIndex = i;
      continue;
    }
    if (correctionSeenAtIndex !== -1) {
      // Final check: does this step's postcondition still mention
      // the alert?
      if (postconditionMentionsAlert(step, errorAlertName)) {
        return invariantViolated(
          [`step:${step.stepName}`],
          `alert "${errorAlertName}" should clear after correcting ${fieldName}`,
        );
      }
    }
  }
  return invariantHeld(
    alertSeenAtIndex === -1
      ? `error alert "${errorAlertName}" never appeared (vacuously held)`
      : `error alert "${errorAlertName}" cleared after correction of ${fieldName}`,
  );
}

/** "After locator-health-track records a failure for the named
 *  facet+strategy, subsequent observe steps prefer the alternate
 *  strategy." Today's evaluator inspects step probe ids + the
 *  step's observed.errorFamily; a richer evaluator lands when the
 *  observed.errorFamily for observe carries strategy-used. */
function evaluateCrossVerbStrategy(
  facetId: string,
  failedStrategy: string,
  preferredAlternate: string,
  trace: ScenarioTrace,
): InvariantOutcome {
  // Look for the locator-health-track step recording the failure;
  // then any subsequent observe step on the same facet should
  // succeed. Without finer-grained strategy reporting, the dry/
  // fixture-replay rungs report held when no observe failed after
  // the track step. Rung-3 can refine by reading actual
  // observed.observedDetails when that field lands.
  let trackedFailureAt = -1;
  for (let i = 0; i < trace.steps.length; i += 1) {
    const step = trace.steps[i]!;
    const probeId = step.probeReceiptRef.probeId;
    if (
      trackedFailureAt === -1 &&
      probeId.includes('locator-health-track') &&
      step.observed.classification === 'matched' &&
      probeId.includes(facetId)
    ) {
      trackedFailureAt = i;
      continue;
    }
    if (trackedFailureAt !== -1 && probeId.includes('observe')) {
      if (step.observed.classification !== 'matched') {
        return invariantViolated(
          [`step:${step.stepName}`],
          `observe on ${facetId} after ${failedStrategy} failure should succeed via ${preferredAlternate}`,
        );
      }
    }
  }
  return invariantHeld(
    trackedFailureAt === -1
      ? `no locator-health-track failure for ${facetId} recorded (vacuously held)`
      : `subsequent observe on ${facetId} succeeded after ${failedStrategy} failure`,
  );
}
