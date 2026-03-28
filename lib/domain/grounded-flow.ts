import type {
  BoundScenario,
  BoundStep,
  GroundedFlowMetadata,
  GroundedFlowStep,
  GroundedSpecFlow,
  ScenarioInterpretationSurface,
  StepResolution,
} from './types';
import type { Confidence, Governance, StepProvenanceKind } from './types/workflow';
import { isBlocked, isReviewRequired } from './types/workflow';
import { lifecycleForScenario, aggregateConfidence } from './status';

function resolveDataSource(
  step: BoundStep,
  surfaceStep: { explicitResolution: StepResolution | null; controlResolution: StepResolution | null },
): GroundedFlowStep['dataSource'] {
  if (surfaceStep.explicitResolution?.override) return 'scenario-explicit';
  if (surfaceStep.controlResolution?.override) return 'resolution-control';
  if (step.override) return 'scenario-explicit';
  return 'none';
}

function resolveDataValue(
  step: BoundStep,
  surfaceStep: { explicitResolution: StepResolution | null; controlResolution: StepResolution | null },
): string | null {
  return surfaceStep.explicitResolution?.override
    ?? surfaceStep.controlResolution?.override
    ?? step.override
    ?? null;
}

function deriveProvenanceKind(step: BoundStep): Exclude<StepProvenanceKind, 'agent-interpreted'> {
  if (step.binding.kind === 'unbound') return 'unresolved';
  if (step.binding.knowledgeRefs.length > 0) return 'approved-knowledge';
  if (step.resolution?.screen || step.resolution?.element) return 'explicit';
  return 'unresolved';
}

function deriveAggregateGovernance(steps: ReadonlyArray<GroundedFlowStep>, scenarioGovernance: Governance): Governance {
  if (steps.some((step) => isBlocked(step))) return 'blocked';
  if (steps.some((step) => isReviewRequired(step))) return 'review-required';
  return scenarioGovernance;
}

function fixturesForScenario(boundScenario: BoundScenario, surface: ScenarioInterpretationSurface): ReadonlyArray<string> {
  const preconditionFixtures = boundScenario.preconditions.map((precondition) => precondition.fixture);
  const overrideFixtures = surface.payload.steps.flatMap((step) =>
    [step.explicitResolution?.override, step.controlResolution?.override]
      .filter(Boolean)
      .flatMap((override) =>
        [...(override as string).matchAll(/\{\{\s*([A-Za-z0-9_-]+)(?:\.[^}]*)?\s*\}\}/g)]
          .flatMap((match) => match[1] != null ? [match[1]] : []),
      ),
  );
  return [...new Set([...preconditionFixtures, ...overrideFixtures])]
    .sort((left, right) => left.localeCompare(right));
}

function buildGroundedFlowStep(
  step: BoundStep,
  surfaceStep: { explicitResolution: StepResolution | null; controlResolution: StepResolution | null },
): GroundedFlowStep {
  return {
    index: step.index,
    intent: step.intent,
    action: step.action,
    screen: step.screen ?? surfaceStep.explicitResolution?.screen ?? surfaceStep.controlResolution?.screen ?? null,
    element: step.element ?? surfaceStep.explicitResolution?.element ?? surfaceStep.controlResolution?.element ?? null,
    posture: step.posture ?? surfaceStep.explicitResolution?.posture ?? surfaceStep.controlResolution?.posture ?? null,
    snapshotTemplate: step.snapshot_template ?? surfaceStep.explicitResolution?.snapshot_template ?? surfaceStep.controlResolution?.snapshot_template ?? null,
    dataValue: resolveDataValue(step, surfaceStep),
    dataSource: resolveDataSource(step, surfaceStep),
    confidence: step.confidence,
    governance: step.binding.governance,
    bindingKind: step.binding.kind,
    provenanceKind: deriveProvenanceKind(step),
    normalizedIntent: step.binding.normalizedIntent,
    knowledgeRefs: step.binding.knowledgeRefs,
    supplementRefs: step.binding.supplementRefs,
  };
}

export function buildGroundedSpecFlow(
  boundScenario: BoundScenario,
  surface: ScenarioInterpretationSurface,
): GroundedSpecFlow {
  const hasUnbound = boundScenario.steps.some((step) => step.binding.kind === 'unbound');
  const lifecycle = lifecycleForScenario(boundScenario.metadata.status, hasUnbound);
  const confidence = aggregateConfidence(boundScenario.steps.map((step) => step.confidence));
  const fixtures = fixturesForScenario(boundScenario, surface);

  const steps: ReadonlyArray<GroundedFlowStep> = boundScenario.steps.map((step) => {
    const surfaceStep = surface.payload.steps.find((s) => s.index === step.index);
    return buildGroundedFlowStep(step, {
      explicitResolution: surfaceStep?.explicitResolution ?? null,
      controlResolution: surfaceStep?.controlResolution ?? null,
    });
  });

  const metadata: GroundedFlowMetadata = {
    adoId: boundScenario.source.ado_id,
    revision: boundScenario.source.revision,
    contentHash: boundScenario.source.content_hash,
    title: boundScenario.metadata.title,
    suite: boundScenario.metadata.suite,
    tags: boundScenario.metadata.tags,
    lifecycle,
    confidence,
    governance: deriveAggregateGovernance(steps, boundScenario.governance),
    fixtures,
  };

  return {
    kind: 'grounded-spec-flow',
    metadata,
    steps,
  };
}
