/**
 * Scenario Tier Projection
 *
 * A scenario carries two tiers of information:
 *
 *   Tier 1 (problem statement):  source, metadata, preconditions, postconditions,
 *     and the immutable intent fields on each step (index, intent, action_text,
 *     expected_text).
 *
 *   Tier 2 (authored knowledge): screen, element, posture, override,
 *     snapshot_template, resolution, confidence (when elevated beyond intent-only),
 *     and action (when refined beyond 'custom').
 *
 * In cold-start mode the self-improvement loop must begin with zero prior
 * knowledge. This function projects a scenario down to Tier 1 only, ensuring
 * the system earns its resolution bindings through the learning loop rather
 * than inheriting them from editorial decisions.
 */

import type { Scenario, ScenarioStep, ScenarioPostcondition } from '../types/intent';

/**
 * Project a scenario step down to Tier 1 (problem statement only).
 *
 * Preserves: index, intent, action_text, expected_text.
 * Resets: action → 'custom', screen/element/posture/override/snapshot_template → null,
 *         resolution → null, confidence → 'intent-only'.
 */
function projectStepToTier1(step: ScenarioStep): ScenarioStep {
  return {
    index: step.index,
    intent: step.intent,
    action_text: step.action_text,
    expected_text: step.expected_text,
    action: 'custom',
    screen: null,
    element: null,
    posture: null,
    override: null,
    snapshot_template: null,
    resolution: null,
    confidence: 'intent-only',
  };
}

/**
 * Project a postcondition down to Tier 1.
 * Postconditions carry the same Tier 2 fields as steps.
 */
function projectPostconditionToTier1(_pc: ScenarioPostcondition): ScenarioPostcondition {
  return {
    action: 'custom',
    screen: null,
    element: null,
    posture: null,
    override: null,
    snapshot_template: null,
  };
}

/**
 * Project a full scenario to Tier 1 — strips all authored knowledge,
 * leaving only the problem statement that came from ADO.
 *
 * This is a pure function with no side effects. The original scenario
 * is not mutated.
 */
export function projectScenarioToTier1(scenario: Scenario): Scenario {
  return {
    source: scenario.source,
    metadata: scenario.metadata,
    preconditions: scenario.preconditions,
    steps: scenario.steps.map(projectStepToTier1),
    postconditions: scenario.postconditions.map(projectPostconditionToTier1),
  };
}
