import { summarizeGovernance, summarizeProvenanceKinds, summarizeUnresolvedReasons, provenanceKindForBoundStep } from '../provenance';
import { aggregateConfidence } from '../status';
import type { BoundScenario, Governance, ScenarioExplanation, ScenarioLifecycle } from '../types';

export function aggregateScenarioGovernance(boundScenario: BoundScenario): Governance {
  const states = [...new Set(boundScenario.steps.map((step) => step.binding.governance))];
  if (states.includes('blocked')) {
    return 'blocked';
  }
  if (states.includes('review-required')) {
    return 'review-required';
  }
  return 'approved';
}

export function explainBoundScenario(boundScenario: BoundScenario, lifecycle: ScenarioLifecycle): ScenarioExplanation {
  return {
    adoId: boundScenario.source.ado_id,
    revision: boundScenario.source.revision,
    title: boundScenario.metadata.title,
    suite: boundScenario.metadata.suite,
    confidence: aggregateConfidence(boundScenario.steps.map((step) => step.confidence)),
    governance: aggregateScenarioGovernance(boundScenario),
    lifecycle,
    diagnostics: boundScenario.diagnostics,
    summary: {
      stepCount: boundScenario.steps.length,
      provenanceKinds: summarizeProvenanceKinds(boundScenario.steps),
      governance: summarizeGovernance(boundScenario.steps),
      unresolvedReasons: summarizeUnresolvedReasons(boundScenario.steps),
    },
    steps: boundScenario.steps.map((step) => ({
      index: step.index,
      intent: step.intent,
      normalizedIntent: step.binding.normalizedIntent,
      action: step.action,
      confidence: step.confidence,
      provenanceKind: provenanceKindForBoundStep(step),
      governance: step.binding.governance,
      ruleId: step.binding.ruleId,
      knowledgeRefs: step.binding.knowledgeRefs,
      supplementRefs: step.binding.supplementRefs,
      reviewReasons: step.binding.reviewReasons,
      unresolvedGaps: step.binding.reasons,
      reasons: step.binding.reasons,
      evidenceIds: step.binding.evidenceIds,
      program: step.program ?? null,
    })),
  };
}
