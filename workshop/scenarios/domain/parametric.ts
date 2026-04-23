/**
 * ParametricScenario — a scenario template + parameter set →
 * materialized scenarios.
 *
 * Per docs/v2-scenario-corpus-plan.md §3 + §7.S8b, parametric
 * scenarios let one template produce N concrete scenarios via
 * substitution. The `substitute` function walks the template's
 * fields and replaces `${paramName}` tokens with the parameter
 * value.
 *
 * Materialization is pure. Scenarios produced share a parametric-
 * template fingerprint (kept on the scenario.id as a suffix) so
 * the corpus catalog can group derived scenarios.
 */

import type { Scenario } from './scenario';
import { scenarioId, stepName } from './scenario';

export interface ParametricScenario {
  readonly templateId: string;
  readonly template: Scenario;
  /** Each entry materializes one Scenario. */
  readonly parameterSets: readonly Record<string, string>[];
}

/** Materialize a parametric scenario into N concrete scenarios. */
export function materializeParametricScenario(
  parametric: ParametricScenario,
): readonly Scenario[] {
  return parametric.parameterSets.map((params, index) =>
    substituteScenarioParams(parametric.template, params, index, parametric.templateId),
  );
}

function substituteScenarioParams(
  template: Scenario,
  params: Record<string, string>,
  index: number,
  templateId: string,
): Scenario {
  const concreteId = scenarioId(`${templateId}--p${index}`);
  return {
    ...template,
    id: concreteId,
    description: substituteString(template.description, params),
    steps: template.steps.map((step) => ({
      ...step,
      name: stepName(substituteString(step.name, params)),
      probe: {
        ...step.probe,
        input: substituteAny(step.probe.input, params),
        worldSetup: step.probe.worldSetup,
      },
      preconditions: step.preconditions.map((a) => substituteAny(a, params) as typeof a),
      postconditions: step.postconditions.map((a) => substituteAny(a, params) as typeof a),
    })),
  };
}

function substituteString(value: string, params: Record<string, string>): string {
  return value.replace(/\$\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? params[name]! : match,
  );
}

function substituteAny(value: unknown, params: Record<string, string>): unknown {
  if (typeof value === 'string') return substituteString(value, params);
  if (Array.isArray(value)) return value.map((v) => substituteAny(v, params));
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = substituteAny(v, params);
    }
    return out;
  }
  return value;
}
