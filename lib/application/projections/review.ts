import type { ProposalBundle, RunRecord } from '../../domain/execution/types';
import type { ScenarioExplanation, ScenarioProjectionInput } from '../../domain/projection/types';
import type { GroundedStep } from '../../domain/resolution/types';
import type { operatorInboxItemsForScenario } from '../agency/operator';

interface ReviewMetadata {
  readonly title: string;
  readonly adoId: string;
  readonly revision: number;
  readonly confidence: string;
  readonly governance: string;
  readonly lifecycle: string;
  readonly proposalBundleRunId: string | null;
  readonly interfaceGraphFingerprint: string | null;
  readonly selectorCanonFingerprint: string | null;
  readonly stateGraphFingerprint: string | null;
  readonly agentSessionCount: number;
  readonly improvementRunCount: number;
  readonly latestImprovementRunId: string | null;
  readonly latestImprovementVerdict: string | null;
  readonly latestImprovementDecisionId: string | null;
  readonly latestImprovementCheckpointRef: string | null;
  readonly latestImprovementSignalCount: number;
  readonly learningCorporaCount: number;
  readonly inboxItemIds: readonly string[];
  readonly nextCommands: readonly string[];
}

interface ReviewBottlenecks {
  readonly stepCount: number;
  readonly provenanceKinds: Record<string, number>;
  readonly governanceCounts: Record<string, number>;
  readonly knowledgeHitRate: number;
  readonly effectiveHitRate: number;
  readonly ambiguityRate: number;
  readonly suspensionRate: number;
  readonly routeMismatchRate: number;
  readonly translationHitRate: number;
  readonly translationCacheHitRate: number;
  readonly translationCacheMissReasons: Record<string, number>;
  readonly translationFailureClasses: Record<string, number>;
  readonly agenticHitRate: number;
  readonly liveExplorationRate: number;
  readonly degradedLocatorRate: number;
  readonly proposalCount: number;
  readonly reviewRequiredCount: number;
  readonly approvedEquivalentRate: number;
  readonly runtimeFailureFamilies: Record<string, number>;
  readonly budgetBreachRate: number;
  readonly rungRollup: Record<string, number>;
  readonly averageRuntimeCost: { readonly instructionCount: number; readonly diagnosticCount: number };
  readonly timing: {
    readonly setupMs: number;
    readonly resolutionMs: number;
    readonly actionMs: number;
    readonly assertionMs: number;
    readonly retriesMs: number;
    readonly teardownMs: number;
    readonly totalMs: number;
  };
  readonly unresolvedReasons: ReadonlyArray<{ readonly reason: string; readonly count: number }>;
}

interface ReviewHandoff {
  readonly id: string;
  readonly title: string;
  readonly kind: string;
  readonly status: string;
  readonly requestedParticipation: string | null;
  readonly blockageType: string | null;
  readonly epistemicStatus: string | null;
  readonly blastRadius: string | null;
  readonly driftStatus: string | null;
  readonly requiredCapabilities: readonly string[];
  readonly requiredAuthorities: readonly string[];
  readonly staleness: string;
  readonly nextMoves: readonly string[];
  readonly competingCandidates: readonly string[];
  readonly tokenImpact: string;
}

interface ReviewStepGrounding {
  readonly requiredStateRefs: readonly string[];
  readonly forbiddenStateRefs: readonly string[];
  readonly effectAssertions: readonly string[];
  readonly eventSignatureRefs: readonly string[];
  readonly expectedTransitionRefs: readonly string[];
}

interface ReviewStep {
  readonly index: number;
  readonly actionText: string;
  readonly expectedText: string;
  readonly normalizedIntent: string;
  readonly action: string;
  readonly confidence: string;
  readonly provenanceKind: string;
  readonly bindingKind: string;
  readonly governance: string;
  readonly handshakes: readonly string[];
  readonly resolutionMode: string;
  readonly winningConcern: string;
  readonly winningSource: string;
  readonly runtime: ScenarioExplanation['steps'][number]['runtime'];
  readonly grounding: ReviewStepGrounding | null;
  readonly knowledgeRefs: readonly string[];
  readonly supplementRefs: readonly string[];
  readonly controlRefs: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly overlayRefs: readonly string[];
  readonly translation: ScenarioExplanation['steps'][number]['translation'];
  readonly unresolvedGaps: readonly string[];
  readonly reviewReasons: readonly string[];
  readonly program: unknown;
}

export interface ReviewDocument {
  readonly metadata: ReviewMetadata;
  readonly bottlenecks: ReviewBottlenecks;
  readonly handoffs: readonly ReviewHandoff[];
  readonly steps: readonly ReviewStep[];
}

export function buildReviewDocument(
  trace: ScenarioExplanation,
  proposalBundle: ProposalBundle | null,
  inboxItems: ReturnType<typeof operatorInboxItemsForScenario>,
  latestRun: RunRecord | null,
  projectionInput: ScenarioProjectionInput,
): ReviewDocument {
  const rungRollup = latestRun
    ? latestRun.steps.reduce<Record<string, number>>((acc, step) => {
        const rung = step.interpretation.resolutionGraph?.winner.rung ?? 'none';
        return { ...acc, [rung]: (acc[rung] ?? 0) + 1 };
      }, {})
    : {};

  const taskByIndex = new Map<number, GroundedStep>(projectionInput.surface.payload.steps.map((step) => [step.index, step]));

  const uniqueNextCommands = inboxItems.length > 0
    ? inboxItems.flatMap((item) => item.nextCommands).filter((value, index, all) => all.indexOf(value) === index)
    : [`tesseract workflow --ado-id ${trace.adoId}`, `tesseract inbox`];

  return {
    metadata: {
      title: trace.title,
      adoId: trace.adoId,
      revision: trace.revision,
      confidence: trace.confidence,
      governance: trace.governance,
      lifecycle: trace.lifecycle,
      proposalBundleRunId: proposalBundle?.payload.runId ?? null,
      interfaceGraphFingerprint: projectionInput.interfaceGraph?.fingerprint ?? null,
      selectorCanonFingerprint: projectionInput.selectorCanon?.fingerprint ?? null,
      stateGraphFingerprint: projectionInput.stateGraph?.fingerprint ?? null,
      agentSessionCount: projectionInput.sessions.length,
      improvementRunCount: projectionInput.improvementRuns.length,
      latestImprovementRunId: trace.improvement?.latestRunId ?? null,
      latestImprovementVerdict: trace.improvement?.latestVerdict ?? null,
      latestImprovementDecisionId: trace.improvement?.latestDecisionId ?? null,
      latestImprovementCheckpointRef: trace.improvement?.checkpointRef ?? null,
      latestImprovementSignalCount: trace.improvement?.signalCount ?? 0,
      learningCorporaCount: projectionInput.learningManifest?.corpora.length ?? 0,
      inboxItemIds: inboxItems.map((item) => item.id),
      nextCommands: uniqueNextCommands,
    },
    bottlenecks: {
      stepCount: trace.summary.stepCount,
      provenanceKinds: trace.summary.provenanceKinds,
      governanceCounts: trace.summary.governance,
      knowledgeHitRate: trace.summary.stageMetrics.knowledgeHitRate,
      effectiveHitRate: trace.summary.stageMetrics.effectiveHitRate ?? 0,
      ambiguityRate: trace.summary.stageMetrics.ambiguityRate ?? 0,
      suspensionRate: trace.summary.stageMetrics.suspensionRate ?? 0,
      routeMismatchRate: trace.summary.stageMetrics.routeMismatchRate ?? 0,
      translationHitRate: trace.summary.stageMetrics.translationHitRate,
      translationCacheHitRate: trace.summary.stageMetrics.translationCacheHitRate,
      translationCacheMissReasons: trace.summary.stageMetrics.translationCacheMissReasons,
      translationFailureClasses: trace.summary.stageMetrics.translationFailureClasses,
      agenticHitRate: trace.summary.stageMetrics.agenticHitRate,
      liveExplorationRate: trace.summary.stageMetrics.liveExplorationRate,
      degradedLocatorRate: trace.summary.stageMetrics.degradedLocatorRate,
      proposalCount: trace.summary.stageMetrics.proposalCount,
      reviewRequiredCount: trace.summary.stageMetrics.reviewRequiredCount,
      approvedEquivalentRate: trace.summary.stageMetrics.approvedEquivalentRate,
      runtimeFailureFamilies: trace.summary.stageMetrics.runtimeFailureFamilies,
      budgetBreachRate: trace.summary.stageMetrics.budgetBreachRate,
      rungRollup,
      averageRuntimeCost: trace.summary.stageMetrics.averageRuntimeCost,
      timing: trace.summary.stageMetrics.timing,
      unresolvedReasons: trace.summary.unresolvedReasons,
    },
    handoffs: inboxItems.map((item) => ({
      id: item.id,
      title: item.title,
      kind: item.kind,
      status: item.status,
      requestedParticipation: item.handoff?.requestedParticipation ?? item.requestedParticipation ?? null,
      blockageType: item.handoff?.blockageType ?? null,
      epistemicStatus: item.handoff?.epistemicStatus ?? null,
      blastRadius: item.handoff?.blastRadius ?? null,
      driftStatus: item.handoff?.semanticCore.driftStatus ?? null,
      requiredCapabilities: item.handoff?.requiredCapabilities ?? [],
      requiredAuthorities: item.handoff?.requiredAuthorities ?? [],
      staleness: item.handoff?.staleness
        ? `${item.handoff.staleness.status} @ ${item.handoff.staleness.observedAt}`
        : 'n/a',
      nextMoves: (item.handoff?.nextMoves ?? []).map((move) => move.command ?? move.action),
      competingCandidates: (item.handoff?.competingCandidates ?? []).map((candidate) => `${candidate.ref}:${candidate.status}`),
      tokenImpact: item.handoff?.tokenImpact
        ? `bytes=${item.handoff.tokenImpact.payloadSizeBytes}, tokens=${item.handoff.tokenImpact.estimatedReadTokens}`
        : 'n/a',
    })),
    steps: trace.steps.map((step) => {
      const grounding = taskByIndex.get(step.index)?.grounding ?? null;
      return {
        index: step.index,
        actionText: step.actionText,
        expectedText: step.expectedText,
        normalizedIntent: step.normalizedIntent,
        action: step.action,
        confidence: step.confidence,
        provenanceKind: step.provenanceKind,
        bindingKind: step.bindingKind,
        governance: step.governance,
        handshakes: step.handshakes,
        resolutionMode: step.resolutionMode,
        winningConcern: step.winningConcern,
        winningSource: step.winningSource,
        runtime: step.runtime,
        grounding: grounding ? {
          requiredStateRefs: grounding.requiredStateRefs,
          forbiddenStateRefs: grounding.forbiddenStateRefs,
          effectAssertions: grounding.effectAssertions,
          eventSignatureRefs: grounding.eventSignatureRefs,
          expectedTransitionRefs: grounding.expectedTransitionRefs,
        } : null,
        knowledgeRefs: step.knowledgeRefs,
        supplementRefs: step.supplementRefs,
        controlRefs: step.controlRefs,
        evidenceRefs: step.evidenceRefs,
        overlayRefs: step.overlayRefs,
        translation: step.translation,
        unresolvedGaps: step.unresolvedGaps,
        reviewReasons: step.reviewReasons,
        program: step.program ?? null,
      };
    }),
  };
}

function renderHandoffsMarkdown(handoffs: readonly ReviewHandoff[]): string {
  if (handoffs.length === 0) {
    return [
      '## Operator Handoffs',
      '',
      '- No operator handoffs currently attach to this scenario scope.',
      '',
    ].join('\n');
  }

  return [
    '## Operator Handoffs',
    '',
    ...handoffs.flatMap((handoff) => [
      `- ${handoff.id}: ${handoff.title}`,
      `  - kind=${handoff.kind}, status=${handoff.status}, participation=${handoff.requestedParticipation ?? 'n/a'}`,
      `  - blockage=${handoff.blockageType ?? 'n/a'}, epistemic=${handoff.epistemicStatus ?? 'n/a'}, blastRadius=${handoff.blastRadius ?? 'n/a'}, drift=${handoff.driftStatus ?? 'n/a'}`,
      `  - capabilities=${handoff.requiredCapabilities.join(', ') || 'none'}, authorities=${handoff.requiredAuthorities.join(', ') || 'none'}`,
      `  - staleness=${handoff.staleness}`,
      `  - nextMoves=${handoff.nextMoves.join(' | ') || 'none'}`,
      `  - competingCandidates=${handoff.competingCandidates.join(' | ') || 'none'}`,
      `  - tokenImpact=${handoff.tokenImpact}`,
    ]),
    '',
  ].join('\n');
}

function formatRecord(entries: Record<string, number>): string {
  const formatted = Object.entries(entries).map(([key, count]) => `${key} (${count})`).join(', ');
  return formatted || 'none';
}

function formatList(values: readonly string[]): string {
  return values.length > 0 ? values.join(', ') : 'none';
}

function renderStepMarkdown(step: ReviewStep): string {
  const timing = step.runtime?.timing;
  const timingLine = timing
    ? `setup=${timing.setupMs}, resolution=${timing.resolutionMs}, action=${timing.actionMs}, assertion=${timing.assertionMs}, retries=${timing.retriesMs}, teardown=${timing.teardownMs}, total=${timing.totalMs}`
    : 'none';
  return [
    `## Step ${step.index}`,
    '',
    `- Action text: ${step.actionText}`,
    `- Expected text: ${step.expectedText}`,
    `- Normalized: ${step.normalizedIntent}`,
    `- Preparation action: ${step.action}`,
    `- Confidence: ${step.confidence}`,
    `- Provenance kind: ${step.provenanceKind}`,
    `- Binding kind: ${step.bindingKind}`,
    `- Governance: ${step.governance}`,
    `- Handshakes: ${step.handshakes.join(' -> ')}`,
    `- Resolution mode: ${step.resolutionMode}`,
    `- Winning concern: ${step.winningConcern}`,
    `- Winning source: ${step.winningSource}`,
    `- Runtime: ${step.runtime?.status ?? 'pending'}`,
    `- Runtime widget contract: ${step.runtime?.widgetContract ?? 'none'}`,
    `- Runtime locator: ${step.runtime?.locatorStrategy ?? 'none'}`,
    `- Runtime locator rung: ${step.runtime?.locatorRung ?? 'none'}`,
    `- Runtime degraded: ${step.runtime?.degraded ? 'yes' : 'no'}`,
    `- Runtime duration ms: ${step.runtime?.durationMs ?? 0}`,
    `- Runtime timing ms: ${timingLine}`,
    `- Runtime budget: ${step.runtime?.budget ? `${step.runtime.budget.status} (${step.runtime.budget.breaches.join(', ') || 'none'})` : 'none'}`,
    `- Runtime failure family: ${step.runtime?.failure?.family ?? 'none'} (${step.runtime?.failure?.code ?? 'none'})`,
    `- Runtime precondition failures: ${step.runtime?.preconditionFailures?.join(', ') || 'none'}`,
    `- Runtime planner status: ${step.runtime?.planning?.status ?? 'none'}`,
    `- Runtime planned transitions: ${step.runtime?.planning?.chosenTransitionPath?.join(', ') || 'none'}`,
    `- Runtime planned event signatures: ${step.runtime?.planning?.chosenEventSignaturePath?.join(', ') || 'none'}`,
    `- Required states: ${step.grounding?.requiredStateRefs.join(', ') || 'none'}`,
    `- Forbidden states: ${step.grounding?.forbiddenStateRefs.join(', ') || 'none'}`,
    `- Effect assertions: ${step.grounding?.effectAssertions.join(' | ') || 'none'}`,
    `- Event signatures: ${step.grounding?.eventSignatureRefs.join(', ') || 'none'}`,
    `- Expected transitions: ${step.grounding?.expectedTransitionRefs.join(', ') || 'none'}`,
    `- Observed states: ${step.runtime?.observedStateRefs?.join(', ') || 'none'}`,
    `- Transition observations: ${step.runtime?.transitionObservations?.map((entry) => `${entry.transitionRef ?? 'none'}:${entry.classification}`).join(', ') || 'none'}`,
    `- Navigation semantic destination: ${step.runtime?.navigation?.semanticDestination ?? 'none'}`,
    `- Navigation selected variant: ${step.runtime?.navigation?.selectedRouteVariantRef ?? 'none'}`,
    `- Navigation selected url: ${step.runtime?.navigation?.selectedRouteUrl ?? 'none'}`,
    `- Navigation expected entry states: ${step.runtime?.navigation?.expectedEntryStateRefs?.join(', ') || 'none'}`,
    `- Navigation observed entry states: ${step.runtime?.navigation?.observedEntryStateRefs?.join(', ') || 'none'}`,
    `- Navigation fallback path: ${step.runtime?.navigation?.fallbackRoutePath?.join(' -> ') || 'none'}`,
    `- Navigation mismatch: ${step.runtime?.navigation?.mismatch ? 'yes' : 'no'}`,
    `- Navigation rationale: ${step.runtime?.navigation?.rationale ?? 'none'}`,
    `- Knowledge refs: ${formatList(step.knowledgeRefs)}`,
    `- Supplements: ${formatList(step.supplementRefs)}`,
    `- Control refs: ${formatList(step.controlRefs)}`,
    `- Evidence refs: ${formatList(step.evidenceRefs)}`,
    `- Overlay refs: ${formatList(step.overlayRefs)}`,
    `- Translation: ${step.translation ? step.translation.rationale : 'none'}`,
    `- Translation cache: ${step.translation?.cache ? `${step.translation.cache.status} (${step.translation.cache.reason ?? 'none'})` : 'none'}`,
    `- Translation failure class: ${step.translation?.failureClass ?? 'none'}`,
    `- Exhaustion trail: ${step.runtime?.exhaustion?.map((entry) => `${entry.stage}:${entry.outcome}`).join(' -> ') || 'none'}`,
    `- Unresolved gaps: ${formatList(step.unresolvedGaps)}`,
    `- Review flags: ${formatList(step.reviewReasons)}`,
    '',
    '```json',
    JSON.stringify(step.program, null, 2),
    '```',
    '',
  ].join('\n');
}

export function renderReviewMarkdown(doc: ReviewDocument): string {
  const { metadata: m, bottlenecks: b } = doc;
  const header = [
    `# ${m.title}`,
    '',
    `- ADO: ${m.adoId}`,
    `- Revision: ${m.revision}`,
    `- Confidence: ${m.confidence}`,
    `- Governance: ${m.governance}`,
    `- Lifecycle: ${m.lifecycle}`,
    `- Proposal bundle: ${m.proposalBundleRunId ?? 'none'}`,
    `- Interface graph fingerprint: ${m.interfaceGraphFingerprint ?? 'none'}`,
    `- Selector canon fingerprint: ${m.selectorCanonFingerprint ?? 'none'}`,
    `- State graph fingerprint: ${m.stateGraphFingerprint ?? 'none'}`,
    `- Agent sessions: ${m.agentSessionCount}`,
    `- Improvement runs: ${m.improvementRunCount}`,
    `- Learning corpora: ${m.learningCorporaCount}`,
    `- Inbox items: ${formatList(m.inboxItemIds)}`,
    `- Next commands: ${m.nextCommands.join(' | ')}`,
    '',
    '## Pipeline',
    '',
    '- Preparation lane: scenario -> bound envelope -> interpretation surface',
    '- Agent lane: run plan -> interpretation receipt -> execution receipt -> evidence -> proposals',
    '- Improvement lane: objective signals -> candidate interventions -> acceptance decision -> checkpointed lineage',
    '',
    '## Recursive Improvement',
    '',
    `- Latest improvement run: ${m.latestImprovementRunId ?? 'none'}`,
    `- Latest verdict: ${m.latestImprovementVerdict ?? 'none'}`,
    `- Latest decision id: ${m.latestImprovementDecisionId ?? 'none'}`,
    `- Latest checkpoint: ${m.latestImprovementCheckpointRef ?? 'none'}`,
    `- Latest signal count: ${m.latestImprovementSignalCount}`,
    '',
    '## Bottlenecks',
    '',
    `- Step count: ${b.stepCount}`,
    `- Step provenance: explicit=${b.provenanceKinds['explicit'] ?? 0}, approved-knowledge=${b.provenanceKinds['approved-knowledge'] ?? 0}, live-exploration=${b.provenanceKinds['live-exploration'] ?? 0}, unresolved=${b.provenanceKinds['unresolved'] ?? 0}`,
    `- Governance counts: approved=${b.governanceCounts['approved'] ?? 0}, review-required=${b.governanceCounts['review-required'] ?? 0}, blocked=${b.governanceCounts['blocked'] ?? 0}`,
    `- Knowledge hit rate: ${b.knowledgeHitRate}`,
    `- Effective hit rate: ${b.effectiveHitRate}`,
    `- Ambiguity rate: ${b.ambiguityRate}`,
    `- Suspension rate: ${b.suspensionRate}`,
    `- Route mismatch rate: ${b.routeMismatchRate}`,
    `- Translation hit rate: ${b.translationHitRate}`,
    `- Translation cache hit rate: ${b.translationCacheHitRate}`,
    `- Translation cache miss reasons: ${formatRecord(b.translationCacheMissReasons)}`,
    `- Translation failure classes: ${formatRecord(b.translationFailureClasses)}`,
    `- Agentic hit rate: ${b.agenticHitRate}`,
    `- Live exploration rate: ${b.liveExplorationRate}`,
    `- Degraded locator rate: ${b.degradedLocatorRate}`,
    `- Proposal count: ${b.proposalCount}`,
    `- Review-required count: ${b.reviewRequiredCount}`,
    `- Approved-equivalent rate: ${b.approvedEquivalentRate}`,
    `- Runtime failure families: ${formatRecord(b.runtimeFailureFamilies)}`,
    `- Budget breach rate: ${b.budgetBreachRate}`,
    `- Resolution graph winner rungs: ${formatRecord(b.rungRollup)}`,
    `- Average runtime cost: instructions=${b.averageRuntimeCost.instructionCount}, diagnostics=${b.averageRuntimeCost.diagnosticCount}`,
    `- Runtime timing totals (ms): setup=${b.timing.setupMs}, resolution=${b.timing.resolutionMs}, action=${b.timing.actionMs}, assertion=${b.timing.assertionMs}, retries=${b.timing.retriesMs}, teardown=${b.timing.teardownMs}, total=${b.timing.totalMs}`,
    `- Unresolved gaps: ${b.unresolvedReasons.length > 0 ? b.unresolvedReasons.map((entry) => `${entry.reason} (${entry.count})`).join(', ') : 'none'}`,
    '',
  ].join('\n');

  const handoffSection = renderHandoffsMarkdown(doc.handoffs);
  const stepSections = doc.steps.map(renderStepMarkdown).join('');
  return `${header}${handoffSection}${stepSections}`.trim() + '\n';
}

/** @deprecated Use buildReviewDocument + renderReviewMarkdown */
export function renderReview(
  trace: ScenarioExplanation,
  proposalBundle: ProposalBundle | null,
  inboxItems: ReturnType<typeof operatorInboxItemsForScenario>,
  latestRun: RunRecord | null,
  projectionInput: ScenarioProjectionInput,
): string {
  return renderReviewMarkdown(buildReviewDocument(trace, proposalBundle, inboxItems, latestRun, projectionInput));
}
