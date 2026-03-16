import type {
  GroundedStep,
  ProposalBundle,
  RunRecord,
  ScenarioExplanation,
  ScenarioProjectionInput,
} from '../../domain/types';
import type { operatorInboxItemsForScenario } from '../operator';

export function renderReview(
  trace: ScenarioExplanation,
  proposalBundle: ProposalBundle | null,
  inboxItems: ReturnType<typeof operatorInboxItemsForScenario>,
  latestRun: RunRecord | null,
  projectionInput: ScenarioProjectionInput,
): string {
  const rungRollup = latestRun
    ? latestRun.steps.reduce<Record<string, number>>((acc, step) => {
        const rung = step.interpretation.resolutionGraph?.winner.rung ?? 'none';
        acc[rung] = (acc[rung] ?? 0) + 1;
        return acc;
      }, {})
    : {};

  const lines: string[] = [
    `# ${trace.title}`,
    '',
    `- ADO: ${trace.adoId}`,
    `- Revision: ${trace.revision}`,
    `- Confidence: ${trace.confidence}`,
    `- Governance: ${trace.governance}`,
    `- Lifecycle: ${trace.lifecycle}`,
    `- Proposal bundle: ${proposalBundle ? proposalBundle.runId : 'none'}`,
    `- Interface graph fingerprint: ${projectionInput.interfaceGraph?.fingerprint ?? 'none'}`,
    `- Selector canon fingerprint: ${projectionInput.selectorCanon?.fingerprint ?? 'none'}`,
    `- State graph fingerprint: ${projectionInput.stateGraph?.fingerprint ?? 'none'}`,
    `- Agent sessions: ${projectionInput.sessions.length}`,
    `- Learning corpora: ${projectionInput.learningManifest?.corpora.length ?? 0}`,
    `- Inbox items: ${inboxItems.length > 0 ? inboxItems.map((item) => item.id).join(', ') : 'none'}`,
    `- Next commands: ${inboxItems.length > 0 ? inboxItems.flatMap((item) => item.nextCommands).filter((value, index, all) => all.indexOf(value) === index).join(' | ') : `tesseract workflow --ado-id ${trace.adoId} | tesseract inbox`}`,
    '',
    '## Pipeline',
    '',
    '- Preparation lane: scenario -> bound envelope -> interpretation surface',
    '- Agent lane: run plan -> interpretation receipt -> execution receipt -> evidence -> proposals',
    '',
    '## Bottlenecks',
    '',
    `- Step count: ${trace.summary.stepCount}`,
    `- Step provenance: explicit=${trace.summary.provenanceKinds.explicit}, approved-knowledge=${trace.summary.provenanceKinds['approved-knowledge']}, live-exploration=${trace.summary.provenanceKinds['live-exploration']}, unresolved=${trace.summary.provenanceKinds.unresolved}`,
    `- Governance counts: approved=${trace.summary.governance.approved}, review-required=${trace.summary.governance['review-required']}, blocked=${trace.summary.governance.blocked}`,
    `- Knowledge hit rate: ${trace.summary.stageMetrics.knowledgeHitRate}`,
    `- Translation hit rate: ${trace.summary.stageMetrics.translationHitRate}`,
    `- Translation cache hit rate: ${trace.summary.stageMetrics.translationCacheHitRate}`,
    `- Translation cache miss reasons: ${Object.entries(trace.summary.stageMetrics.translationCacheMissReasons).map(([reason, count]) => `${reason} (${count})`).join(', ') || 'none'}`,
    `- Translation failure classes: ${Object.entries(trace.summary.stageMetrics.translationFailureClasses).map(([reason, count]) => `${reason} (${count})`).join(', ') || 'none'}`,
    `- Agentic hit rate: ${trace.summary.stageMetrics.agenticHitRate}`,
    `- Live exploration rate: ${trace.summary.stageMetrics.liveExplorationRate}`,
    `- Degraded locator rate: ${trace.summary.stageMetrics.degradedLocatorRate}`,
    `- Proposal count: ${trace.summary.stageMetrics.proposalCount}`,
    `- Review-required count: ${trace.summary.stageMetrics.reviewRequiredCount}`,
    `- Approved-equivalent rate: ${trace.summary.stageMetrics.approvedEquivalentRate}`,
    `- Runtime failure families: ${Object.entries(trace.summary.stageMetrics.runtimeFailureFamilies).map(([family, count]) => `${family} (${count})`).join(', ') || 'none'}`,
    `- Budget breach rate: ${trace.summary.stageMetrics.budgetBreachRate}`,
    `- Resolution graph winner rungs: ${Object.entries(rungRollup).map(([rung, count]) => `${rung} (${count})`).join(', ') || 'none'}`,
    `- Average runtime cost: instructions=${trace.summary.stageMetrics.averageRuntimeCost.instructionCount}, diagnostics=${trace.summary.stageMetrics.averageRuntimeCost.diagnosticCount}`,
    `- Runtime timing totals (ms): setup=${trace.summary.stageMetrics.timing.setupMs}, resolution=${trace.summary.stageMetrics.timing.resolutionMs}, action=${trace.summary.stageMetrics.timing.actionMs}, assertion=${trace.summary.stageMetrics.timing.assertionMs}, retries=${trace.summary.stageMetrics.timing.retriesMs}, teardown=${trace.summary.stageMetrics.timing.teardownMs}, total=${trace.summary.stageMetrics.timing.totalMs}`,
    `- Unresolved gaps: ${trace.summary.unresolvedReasons.length > 0 ? trace.summary.unresolvedReasons.map((entry) => `${entry.reason} (${entry.count})`).join(', ') : 'none'}`,
    '',
  ];
  const taskByIndex = new Map<number, GroundedStep>(projectionInput.surface.payload.steps.map((step) => [step.index, step]));

  for (const step of trace.steps) {
    const taskGrounding = taskByIndex.get(step.index)?.grounding ?? null;
    lines.push(`## Step ${step.index}`);
    lines.push('');
    lines.push(`- Action text: ${step.actionText}`);
    lines.push(`- Expected text: ${step.expectedText}`);
    lines.push(`- Normalized: ${step.normalizedIntent}`);
    lines.push(`- Preparation action: ${step.action}`);
    lines.push(`- Confidence: ${step.confidence}`);
    lines.push(`- Provenance kind: ${step.provenanceKind}`);
    lines.push(`- Binding kind: ${step.bindingKind}`);
    lines.push(`- Governance: ${step.governance}`);
    lines.push(`- Handshakes: ${step.handshakes.join(' -> ')}`);
    lines.push(`- Resolution mode: ${step.resolutionMode}`);
    lines.push(`- Winning concern: ${step.winningConcern}`);
    lines.push(`- Winning source: ${step.winningSource}`);
    lines.push(`- Runtime: ${step.runtime?.status ?? 'pending'}`);
    lines.push(`- Runtime widget contract: ${step.runtime?.widgetContract ?? 'none'}`);
    lines.push(`- Runtime locator: ${step.runtime?.locatorStrategy ?? 'none'}`);
    lines.push(`- Runtime locator rung: ${step.runtime?.locatorRung ?? 'none'}`);
    lines.push(`- Runtime degraded: ${step.runtime?.degraded ? 'yes' : 'no'}`);
    lines.push(`- Runtime duration ms: ${step.runtime?.durationMs ?? 0}`);
    lines.push(`- Runtime timing ms: ${step.runtime?.timing ? `setup=${step.runtime.timing.setupMs}, resolution=${step.runtime.timing.resolutionMs}, action=${step.runtime.timing.actionMs}, assertion=${step.runtime.timing.assertionMs}, retries=${step.runtime.timing.retriesMs}, teardown=${step.runtime.timing.teardownMs}, total=${step.runtime.timing.totalMs}` : 'none'}`);
    lines.push(`- Runtime budget: ${step.runtime?.budget ? `${step.runtime.budget.status} (${step.runtime.budget.breaches.join(', ') || 'none'})` : 'none'}`);
    lines.push(`- Runtime failure family: ${step.runtime?.failure?.family ?? 'none'} (${step.runtime?.failure?.code ?? 'none'})`);
    lines.push(`- Runtime precondition failures: ${step.runtime?.preconditionFailures?.join(', ') || 'none'}`);
    lines.push(`- Required states: ${taskGrounding?.requiredStateRefs.join(', ') || 'none'}`);
    lines.push(`- Forbidden states: ${taskGrounding?.forbiddenStateRefs.join(', ') || 'none'}`);
    lines.push(`- Effect assertions: ${taskGrounding?.effectAssertions.join(' | ') || 'none'}`);
    lines.push(`- Event signatures: ${taskGrounding?.eventSignatureRefs.join(', ') || 'none'}`);
    lines.push(`- Expected transitions: ${taskGrounding?.expectedTransitionRefs.join(', ') || 'none'}`);
    lines.push(`- Observed states: ${step.runtime?.observedStateRefs?.join(', ') || 'none'}`);
    lines.push(`- Transition observations: ${step.runtime?.transitionObservations?.map((entry) => `${entry.transitionRef ?? 'none'}:${entry.classification}`).join(', ') || 'none'}`);
    lines.push(`- Knowledge refs: ${step.knowledgeRefs.length > 0 ? step.knowledgeRefs.join(', ') : 'none'}`);
    lines.push(`- Supplements: ${step.supplementRefs.length > 0 ? step.supplementRefs.join(', ') : 'none'}`);
    lines.push(`- Control refs: ${step.controlRefs.length > 0 ? step.controlRefs.join(', ') : 'none'}`);
    lines.push(`- Evidence refs: ${step.evidenceRefs.length > 0 ? step.evidenceRefs.join(', ') : 'none'}`);
    lines.push(`- Overlay refs: ${step.overlayRefs.length > 0 ? step.overlayRefs.join(', ') : 'none'}`);
    lines.push(`- Translation: ${step.translation ? step.translation.rationale : 'none'}`);
    lines.push(`- Translation cache: ${step.translation?.cache ? `${step.translation.cache.status} (${step.translation.cache.reason ?? 'none'})` : 'none'}`);
    lines.push(`- Translation failure class: ${step.translation?.failureClass ?? 'none'}`);
    lines.push(`- Exhaustion trail: ${step.runtime?.exhaustion?.map((entry) => `${entry.stage}:${entry.outcome}`).join(' -> ') || 'none'}`);
    lines.push(`- Unresolved gaps: ${step.unresolvedGaps.length > 0 ? step.unresolvedGaps.join(', ') : 'none'}`);
    lines.push(`- Review flags: ${step.reviewReasons.length > 0 ? step.reviewReasons.join(', ') : 'none'}`);
    lines.push('');
    lines.push('```json');
    lines.push(JSON.stringify(step.program ?? null, null, 2));
    lines.push('```');
    lines.push('');
  }

  return `${lines.join('\n').trim()}\n`;
}
