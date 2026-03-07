import { createDiagnostic } from './diagnostics';
import { sha256, stableStringify } from './hash';
import { ElementId, PostureId } from './identity';
import {
  ExpandedScenarioSet,
  ExpandedScenarioVariant,
  CompilerDiagnostic,
  PostureExpansionPartition,
  Scenario,
  ScenarioTemplateArtifact,
  ScreenElements,
  ScreenPostures,
} from './types';

interface ExpansionInput {
  scenario: Scenario;
  scenarioPath: string;
  template: ScenarioTemplateArtifact;
  templatePath: string;
  screenElements: ScreenElements;
  screenPostures: ScreenPostures;
  generatedAt: string;
}

function classifyPosture(postureId: PostureId): PostureExpansionPartition | null {
  if (postureId === 'valid') return 'valid';
  if (postureId.startsWith('invalid')) return 'invalid';
  if (postureId.startsWith('empty')) return 'empty';
  if (postureId.startsWith('boundary')) return 'boundary';
  return null;
}

function shouldIncludeElement(elementId: ElementId, include: ElementId[] | undefined, exclude: ElementId[] | undefined): boolean {
  if (include && include.length > 0 && !include.includes(elementId)) {
    return false;
  }
  if (exclude && exclude.includes(elementId)) {
    return false;
  }
  return true;
}

function variantId(parts: Record<string, unknown>): string {
  return `expanded:${sha256(stableStringify(parts)).slice(0, 16)}`;
}

function cloneScenario(scenario: Scenario): Scenario {
  return JSON.parse(JSON.stringify(scenario)) as Scenario;
}

export function expandScenarioPostures(input: ExpansionInput): ExpandedScenarioSet {
  const diagnostics: CompilerDiagnostic[] = [];
  const variants: ExpandedScenarioVariant[] = [];

  const rules = input.template.rules.filter((rule) => rule.screen === input.screenElements.screen);

  for (const rule of rules) {
    let generatedForRule = 0;
    const maxForRule = rule.maxExpansions ?? Number.MAX_SAFE_INTEGER;
    const candidates = Object.keys(input.screenElements.elements)
      .map((id) => id as ElementId)
      .filter((elementId) => shouldIncludeElement(elementId, rule.include, rule.exclude))
      .sort((left, right) => left.localeCompare(right));

    for (const elementId of candidates) {
      const elementPostures = input.screenPostures.postures[elementId];
      if (!elementPostures) {
        diagnostics.push(createDiagnostic({
          code: 'template-unknown-element',
          severity: 'error',
          message: `Template references element ${elementId} with no posture set`,
          adoId: input.scenario.source.ado_id,
          artifactPath: input.templatePath,
          provenance: {
            scenarioPath: input.scenarioPath,
            contentHash: input.scenario.source.content_hash,
            sourceRevision: input.scenario.source.revision,
          },
        }));
        continue;
      }

      if (!elementPostures[rule.baseline]) {
        diagnostics.push(createDiagnostic({
          code: 'template-missing-baseline-posture',
          severity: 'error',
          message: `Template baseline posture ${rule.baseline} is missing for element ${elementId}`,
          adoId: input.scenario.source.ado_id,
          artifactPath: input.templatePath,
          provenance: {
            scenarioPath: input.scenarioPath,
          },
        }));
        continue;
      }

      const overridePostures = Object.keys(elementPostures)
        .map((id) => id as PostureId)
        .filter((postureId) => rule.overrides.includes(classifyPosture(postureId) ?? 'valid'))
        .sort((left, right) => left.localeCompare(right));

      if (overridePostures.length === 0) {
        diagnostics.push(createDiagnostic({
          code: 'template-missing-posture-partition',
          severity: 'error',
          message: `Template requires ${rule.overrides.join(', ')} posture(s) for ${elementId}`,
          adoId: input.scenario.source.ado_id,
          artifactPath: input.templatePath,
          provenance: {
            scenarioPath: input.scenarioPath,
          },
        }));
        continue;
      }

      const sourceSteps = input.scenario.steps
        .filter((step) => step.action === 'input' && step.screen === rule.screen && step.element === elementId && step.posture === rule.baseline)
        .sort((left, right) => left.index - right.index);

      if (sourceSteps.length === 0) {
        const nonInput = input.scenario.steps.find((step) => step.screen === rule.screen && step.element === elementId && step.action !== 'input');
        if (nonInput) {
          diagnostics.push(createDiagnostic({
            code: 'template-non-input-action',
            severity: 'error',
            message: `Template element ${elementId} maps to non-input action ${nonInput.action}`,
            adoId: input.scenario.source.ado_id,
            stepIndex: nonInput.index,
            artifactPath: input.scenarioPath,
            provenance: {
              scenarioPath: input.scenarioPath,
            },
          }));
        }
        continue;
      }

      for (const sourceStep of sourceSteps) {
        for (const overridePosture of overridePostures) {
          if (generatedForRule >= maxForRule) {
            break;
          }
          const expanded = cloneScenario(input.scenario);
          const targetStep = expanded.steps.find((step) => step.index === sourceStep.index);
          if (!targetStep) {
            continue;
          }
          targetStep.posture = overridePosture;

          const id = variantId({
            sourceAdoId: expanded.source.ado_id,
            templateId: input.template.id,
            stepIndex: sourceStep.index,
            elementId,
            posture: overridePosture,
          });

          variants.push({
            id,
            scenario: expanded,
            provenance: {
              templateId: input.template.id,
              templatePath: input.templatePath,
              sourceScenarioPath: input.scenarioPath,
              sourceAdoId: input.scenario.source.ado_id,
              sourceStepIndex: sourceStep.index,
              sourceElement: elementId,
              baselinePosture: rule.baseline,
              overridePosture,
            },
          });
          generatedForRule += 1;
        }
        if (generatedForRule >= maxForRule) {
          break;
        }
      }
      if (generatedForRule >= maxForRule) {
        break;
      }
    }
  }

  const deduped = [...new Map(variants.map((variant) => [variant.id, variant] as const)).values()]
    .sort((left, right) => {
      if (left.provenance.sourceElement !== right.provenance.sourceElement) {
        return left.provenance.sourceElement.localeCompare(right.provenance.sourceElement);
      }
      if (left.provenance.sourceStepIndex !== right.provenance.sourceStepIndex) {
        return left.provenance.sourceStepIndex - right.provenance.sourceStepIndex;
      }
      return left.provenance.overridePosture.localeCompare(right.provenance.overridePosture);
    });

  return {
    kind: 'expanded-scenario-set',
    sourceAdoId: input.scenario.source.ado_id,
    sourceScenarioPath: input.scenarioPath,
    generatedAt: input.generatedAt,
    variants: deduped,
    diagnostics,
  };
}
