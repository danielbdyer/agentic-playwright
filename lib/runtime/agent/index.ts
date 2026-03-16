import type { ObservedStateSession, ResolutionCandidateSummary, ResolutionReceipt, GroundedStep } from '../../domain/types';
import { resolutionPrecedenceLaw } from '../../domain/precedence';
import { requiresElement, allowedActionFallback } from './resolve-action';
import { resolveFromDom } from './dom-fallback';
import { proposalForSupplementGap } from './proposals';
import { explicitResolvedReceipt, needsHumanReceipt } from './receipt';
import { resolveOverride } from './resolve-target';
import { selectedControlRefs, selectedControlResolution, selectedDomExplorationPolicy } from './select-controls';
import { recordExhaustion, uniqueSorted } from './shared';
import { resolveWithConfidenceOverlay, resolveWithTranslation } from './translation';
import type { RuntimeAgentStageContext, RuntimeStepAgentContext } from './types';
import {
  rankActionCandidates,
  rankElementCandidates,
  rankPostureCandidates,
  rankScreenCandidates,
  rankSnapshotCandidates,
  type LatticeCandidate,
} from './candidate-lattice';
import { createPlaywrightDomResolver } from '../adapters/playwright-dom-resolver';

export const RESOLUTION_PRECEDENCE = resolutionPrecedenceLaw;

const MEMORY_MAX_ACTIVE_REFS = 8;
const MEMORY_MAX_RECENT_ASSERTIONS = 8;
const MEMORY_STALENESS_TTL_STEPS = 5;
const MEMORY_SCREEN_CONFIDENCE_FLOOR = 0.35;

function createEmptyObservedStateSession(): ObservedStateSession {
  return {
    currentScreen: null,
    activeStateRefs: [],
    lastObservedTransitionRefs: [],
    activeRouteVariantRefs: [],
    activeTargetRefs: [],
    lastSuccessfulLocatorRung: null,
    recentAssertions: [],
    lineage: [],
  };
}

function normalizeObservedStateSession(task: GroundedStep, memory: ObservedStateSession): ObservedStateSession {
  const next: ObservedStateSession = {
    currentScreen: memory.currentScreen,
    activeStateRefs: uniqueSorted(memory.activeStateRefs).slice(0, MEMORY_MAX_ACTIVE_REFS),
    lastObservedTransitionRefs: uniqueSorted(memory.lastObservedTransitionRefs).slice(0, MEMORY_MAX_ACTIVE_REFS),
    activeRouteVariantRefs: uniqueSorted(memory.activeRouteVariantRefs).slice(0, MEMORY_MAX_ACTIVE_REFS),
    activeTargetRefs: uniqueSorted(memory.activeTargetRefs).slice(0, MEMORY_MAX_ACTIVE_REFS),
    lastSuccessfulLocatorRung: memory.lastSuccessfulLocatorRung,
    recentAssertions: memory.recentAssertions
      .filter((entry) => Number.isFinite(entry.observedAtStep) && task.index - entry.observedAtStep <= MEMORY_STALENESS_TTL_STEPS)
      .slice(-MEMORY_MAX_RECENT_ASSERTIONS),
    lineage: memory.lineage.slice(-32),
  };

  if (next.currentScreen && task.index - next.currentScreen.observedAtStep > MEMORY_STALENESS_TTL_STEPS) {
    next.currentScreen = null;
  }
  if (next.currentScreen && next.currentScreen.confidence < MEMORY_SCREEN_CONFIDENCE_FLOOR) {
    next.currentScreen = null;
    next.activeStateRefs = [];
    next.lastObservedTransitionRefs = [];
  }
  if (task.actionText.toLowerCase().includes('navigate')) {
    next.activeStateRefs = [];
    next.lastObservedTransitionRefs = [];
  }

  return next;
}

function resolvedTargetRef(stage: RuntimeAgentStageContext, receipt: ResolutionReceipt) {
  if (receipt.kind === 'needs-human' || !receipt.target.element) {
    return null;
  }
  const screen = stage.context.resolutionContext.screens.find((entry) => entry.screen === receipt.target.screen);
  return screen?.elements.find((entry) => entry.element === receipt.target.element)?.targetRef ?? null;
}

function routeVariantRefsForReceipt(stage: RuntimeAgentStageContext, receipt: ResolutionReceipt): string[] {
  if (receipt.kind === 'needs-human') {
    return stage.task.grounding.routeVariantRefs;
  }
  const screen = stage.context.resolutionContext.screens.find((entry) => entry.screen === receipt.target.screen);
  return screen?.routeVariantRefs.length ? screen.routeVariantRefs : stage.task.grounding.routeVariantRefs;
}

function updateObservedStateSessionAfterResolution(stage: RuntimeAgentStageContext, receipt: ResolutionReceipt): void {
  if (receipt.kind === 'needs-human') {
    return;
  }

  const memory = stage.memory;
  memory.currentScreen = {
    screen: receipt.target.screen,
    confidence: receipt.confidence === 'compiler-derived' ? 1 : receipt.confidence === 'agent-verified' ? 0.8 : 0.65,
    observedAtStep: stage.task.index,
  };
  memory.activeRouteVariantRefs = uniqueSorted([
    ...memory.activeRouteVariantRefs,
    ...routeVariantRefsForReceipt(stage, receipt),
  ]).slice(0, MEMORY_MAX_ACTIVE_REFS);

  const targetRef = resolvedTargetRef(stage, receipt);
  if (targetRef) {
    memory.activeTargetRefs = uniqueSorted([...memory.activeTargetRefs, targetRef]).slice(0, MEMORY_MAX_ACTIVE_REFS);
  }

  if (receipt.target.action === 'assert-snapshot') {
    memory.recentAssertions = [
      ...memory.recentAssertions,
      { summary: `${receipt.target.screen}:${receipt.target.snapshot_template ?? 'default'}`, observedAtStep: stage.task.index },
    ]
      .filter((entry) => stage.task.index - entry.observedAtStep <= MEMORY_STALENESS_TTL_STEPS)
      .slice(-MEMORY_MAX_RECENT_ASSERTIONS);
  }

  if (receipt.winningSource === 'live-dom') {
    memory.lastSuccessfulLocatorRung = 0;
  }

  memory.lineage = uniqueSorted([
    ...memory.lineage,
    `step:${stage.task.index}`,
    `screen:${receipt.target.screen}`,
    `source:${receipt.winningSource}`,
    `confidence:${receipt.confidence}`,
  ]).slice(-32);
  stage.memoryLineage = memory.lineage;
}

function summaryForValue<T>(concern: ResolutionCandidateSummary['concern'], ranked: Array<LatticeCandidate<T>>, topN = 3): { topCandidates: ResolutionCandidateSummary[]; rejectedCandidates: ResolutionCandidateSummary[] } {
  const normalizeValue = (value: unknown): string => {
    if (value === null || value === undefined) {
      return '(none)';
    }
    if (typeof value === 'string') {
      return value;
    }
    if (typeof value === 'object' && value !== null) {
      const cast = value as { screen?: string; element?: string };
      return cast.element ?? cast.screen ?? JSON.stringify(value);
    }
    return String(value);
  };
  const toSummary = (candidate: LatticeCandidate<T>): ResolutionCandidateSummary => ({
    concern,
    source: candidate.source,
    value: normalizeValue(candidate.value),
    score: candidate.score,
    reason: candidate.summary,
  });
  return {
    topCandidates: ranked.slice(0, topN).map(toSummary),
    rejectedCandidates: ranked.slice(1, topN + 1).map(toSummary),
  };
}

export async function runResolutionPipeline(task: GroundedStep, context: RuntimeStepAgentContext): Promise<ResolutionReceipt> {
  const memory = normalizeObservedStateSession(task, context.observedStateSession ?? createEmptyObservedStateSession());
  context.observedStateSession = memory;

  const stage: RuntimeAgentStageContext = {
    task,
    context,
    memory,
    controlResolution: selectedControlResolution(task, context),
    controlRefs: selectedControlRefs(task, context),
    evidenceRefs: uniqueSorted(context.resolutionContext.evidenceRefs),
    exhaustion: [],
    observations: [],
    knowledgeRefs: [],
    supplementRefs: [],
    memoryLineage: memory.lineage,
  };

  const explicit = task.explicitResolution;
  if (explicit?.action && explicit.screen && (!requiresElement(explicit.action) || explicit.element)) {
    recordExhaustion(stage.exhaustion, 'explicit', 'resolved', 'Explicit structured resolution satisfied executable requirements');
    const receipt = explicitResolvedReceipt(stage);
    updateObservedStateSessionAfterResolution(stage, receipt);
    return receipt;
  }
  recordExhaustion(stage.exhaustion, 'explicit', explicit ? 'attempted' : 'skipped', explicit ? 'Explicit constraints were partial and used as priors' : 'No explicit constraints present');

  const actionLattice = rankActionCandidates(task, stage.controlResolution, context.resolutionContext);
  const action = actionLattice.selected?.value ?? null;
  stage.supplementRefs.push(...actionLattice.selected?.refs ?? []);
  const actionCandidates = summaryForValue('action', actionLattice.ranked);

  const screenLattice = rankScreenCandidates(task, action, stage.controlResolution, context.previousResolution, context.resolutionContext, stage.memory);
  const screen = screenLattice.selected?.value ?? null;
  if (screen) {
    stage.knowledgeRefs.push(...screen.knowledgeRefs);
    stage.supplementRefs.push(...screen.supplementRefs);
    recordExhaustion(stage.exhaustion, 'approved-screen-knowledge', 'attempted', `Selected screen ${screen.screen}`, summaryForValue('screen', screenLattice.ranked));
  } else {
    recordExhaustion(stage.exhaustion, 'approved-screen-knowledge', 'failed', 'No screen candidate matched approved screen knowledge priors', summaryForValue('screen', screenLattice.ranked));
  }

  const elementLattice = rankElementCandidates(task, screen, stage.controlResolution, stage.memory);
  const element = elementLattice.selected?.value ?? null;
  stage.supplementRefs.push(...elementLattice.selected?.refs ?? []);
  if (element) {
    recordExhaustion(stage.exhaustion, 'approved-screen-knowledge', 'attempted', `Matched element ${element.element}`, summaryForValue('element', elementLattice.ranked));
  } else {
    recordExhaustion(stage.exhaustion, 'approved-screen-knowledge', 'failed', 'No element candidate matched approved screen knowledge', summaryForValue('element', elementLattice.ranked));
  }

  const postureLattice = rankPostureCandidates(task, element, stage.controlResolution, context.resolutionContext);
  const posture = postureLattice.selected?.value ?? null;
  stage.supplementRefs.push(...postureLattice.selected?.refs ?? []);
  recordExhaustion(stage.exhaustion, 'shared-patterns', posture ? 'attempted' : 'skipped', posture ? `Matched posture ${posture}` : 'No shared posture pattern required', summaryForValue('posture', postureLattice.ranked));

  recordExhaustion(
    stage.exhaustion,
    'prior-evidence',
    context.resolutionContext.evidenceRefs.length > 0 ? 'attempted' : 'skipped',
    context.resolutionContext.evidenceRefs.length > 0 ? 'Prior evidence refs were available to the agent task' : 'No prior evidence refs available',
  );

  const override = resolveOverride(task, screen, element, posture, stage.controlResolution, context);
  const snapshotLattice = rankSnapshotCandidates(task, screen, element, stage.controlResolution);
  const snapshotTemplate = snapshotLattice.selected?.value ?? null;
  stage.supplementRefs.push(...snapshotLattice.selected?.refs ?? []);

  stage.observations.push({
    source: 'approved-screen-knowledge',
    summary: 'Deterministic lattice ranked approved candidates across action, screen, element, posture, and snapshot concerns.',
    topCandidates: [
      ...actionCandidates.topCandidates.slice(0, 1),
      ...summaryForValue('screen', screenLattice.ranked).topCandidates.slice(0, 1),
      ...summaryForValue('element', elementLattice.ranked).topCandidates.slice(0, 1),
      ...summaryForValue('posture', postureLattice.ranked).topCandidates.slice(0, 1),
      ...summaryForValue('snapshot', snapshotLattice.ranked).topCandidates.slice(0, 1),
    ],
    rejectedCandidates: [
      ...actionCandidates.rejectedCandidates,
      ...summaryForValue('screen', screenLattice.ranked).rejectedCandidates,
      ...summaryForValue('element', elementLattice.ranked).rejectedCandidates,
      ...summaryForValue('posture', postureLattice.ranked).rejectedCandidates,
      ...summaryForValue('snapshot', snapshotLattice.ranked).rejectedCandidates,
    ],
  });

  if (action && screen && (!requiresElement(action) || element) && (action !== 'assert-snapshot' || snapshotTemplate)) {
    const winningSource = override.source === 'approved-equivalent'
      ? 'approved-equivalent-overlay'
      : override.source === 'prior-evidence'
        ? 'prior-evidence'
        : override.source === 'structured-translation'
          ? 'structured-translation'
          : postureLattice.selected?.source === 'shared-patterns' || actionLattice.selected?.source === 'shared-patterns'
            ? 'shared-patterns'
            : 'approved-screen-knowledge';
    recordExhaustion(stage.exhaustion, winningSource, 'resolved', 'Approved deterministic priors produced an executable target');
    const receipt = {
      ...needsHumanReceipt(stage, [], null),
      kind: 'resolved',
      governance: 'approved',
      resolutionMode: 'deterministic',
      overlayRefs: [],
      winningConcern: 'knowledge',
      winningSource: override.source,
      translation: null,
      confidence: 'compiler-derived',
      provenanceKind: 'approved-knowledge',
      target: {
        action,
        screen: screen.screen,
        element: element?.element ?? null,
        posture,
        override: override.override,
        snapshot_template: snapshotTemplate,
      },
    } as ResolutionReceipt;
    updateObservedStateSessionAfterResolution(stage, receipt);
    return receipt;
  }

  const overlayResult = resolveWithConfidenceOverlay(task, context, action, screen, element, snapshotTemplate);
  if (overlayResult.observation) {
    stage.observations.push(overlayResult.observation);
  }
  if (overlayResult.overlayRefs.length > 0) {
    recordExhaustion(stage.exhaustion, 'approved-equivalent-overlay', 'resolved', `Approved-equivalent overlays resolved ${overlayResult.overlayRefs.join(', ')}`);
    const overlayOverride = resolveOverride(task, overlayResult.screen, overlayResult.element, overlayResult.posture, stage.controlResolution, context);
    const receipt = {
      ...needsHumanReceipt(stage, [], null),
      kind: 'resolved',
      governance: 'approved',
      resolutionMode: 'deterministic',
      lineage: { sources: [...stage.controlRefs, ...stage.evidenceRefs, ...overlayResult.overlayRefs], parents: [task.taskFingerprint], handshakes: ['preparation', 'resolution'] },
      overlayRefs: overlayResult.overlayRefs,
      winningConcern: 'knowledge',
      winningSource: 'approved-equivalent',
      confidence: 'agent-verified',
      provenanceKind: 'approved-knowledge',
      translation: null,
      target: {
        action: action ?? allowedActionFallback(task) ?? 'custom',
        screen: overlayResult.screen!.screen,
        element: overlayResult.element?.element ?? null,
        posture: overlayResult.posture ?? null,
        override: overlayOverride.override,
        snapshot_template: overlayResult.snapshotTemplate,
      },
    } as ResolutionReceipt;
    updateObservedStateSessionAfterResolution(stage, receipt);
    return receipt;
  }
  recordExhaustion(stage.exhaustion, 'approved-equivalent-overlay', 'failed', 'No approved-equivalent confidence overlay produced an executable target');

  const translated = await resolveWithTranslation(task, context);
  if (translated.observation) {
    stage.observations.push(translated.observation);
  }
  if (translated.translation?.matched && translated.screen && (!requiresElement(action) || translated.element) && (action !== 'assert-snapshot' || snapshotTemplate)) {
    recordExhaustion(stage.exhaustion, 'structured-translation', 'resolved', translated.translation.rationale);
    const translatedOverride = resolveOverride(task, translated.screen, translated.element, posture, stage.controlResolution, context);
    const receipt = {
      ...needsHumanReceipt(stage, [], null),
      kind: 'resolved',
      governance: 'approved',
      resolutionMode: 'translation',
      lineage: { sources: [...stage.controlRefs, ...stage.evidenceRefs], parents: [task.taskFingerprint], handshakes: ['preparation', 'resolution'] },
      overlayRefs: translated.overlayRefs,
      winningConcern: 'resolution',
      winningSource: 'structured-translation',
      translation: translated.translation,
      confidence: 'agent-verified',
      provenanceKind: 'approved-knowledge',
      target: {
        action: action ?? allowedActionFallback(task) ?? 'custom',
        screen: translated.screen.screen,
        element: translated.element?.element ?? null,
        posture,
        override: translatedOverride.override,
        snapshot_template: snapshotTemplate,
      },
    } as ResolutionReceipt;
    updateObservedStateSessionAfterResolution(stage, receipt);
    return receipt;
  }
  recordExhaustion(stage.exhaustion, 'structured-translation', context.translate ? 'failed' : 'skipped', context.translate ? 'Structured translation did not produce an executable target' : 'No structured translation stage was configured');

  const domScreen = translated.screen ?? overlayResult.screen ?? screen;
  const domResolver = context.domResolver
    ?? (context.page
      ? createPlaywrightDomResolver(context.page as any)
      : undefined);
  const domPolicy = selectedDomExplorationPolicy(task, context);
  const domResolved = await resolveFromDom(domResolver, task, domScreen, action, domPolicy);
  if (domResolved.observation) {
    stage.observations.push(domResolved.observation);
  }
  const domTop = domResolved.topCandidate;
  const domShortlist = domResolved.candidates.slice(0, domResolved.policy.maxCandidates);
  if (action && domScreen && domTop && (action !== 'assert-snapshot' || snapshotTemplate)) {
    const liveScreen = domScreen;
    const liveElement = domTop.element;
    recordExhaustion(stage.exhaustion, 'live-dom', 'attempted', `Live DOM ranked ${domResolved.candidates.length} candidate(s) and selected ${liveElement.element}`, {
      topCandidates: domShortlist.map((candidate) => ({
        concern: 'element',
        source: 'live-dom',
        value: candidate.element.element,
        score: candidate.score,
        reason: `rung=${candidate.evidence.locatorRung + 1}; role=${candidate.evidence.roleNameScore.toFixed(2)}; widget=${candidate.evidence.widgetCompatibilityScore.toFixed(2)}`,
      })),
      rejectedCandidates: domShortlist.slice(1).map((candidate) => ({
        concern: 'element',
        source: 'live-dom',
        value: candidate.element.element,
        score: candidate.score,
        reason: `rung=${candidate.evidence.locatorRung + 1}; role=${candidate.evidence.roleNameScore.toFixed(2)}; widget=${candidate.evidence.widgetCompatibilityScore.toFixed(2)}`,
      })),
    });
    const proposalDrafts = proposalForSupplementGap(task, liveScreen, liveElement);
    const candidateObservation = {
      top: domShortlist.map((candidate) => `${candidate.element.element}:${candidate.score.toFixed(3)}`).join(' | '),
      probes: String(domResolved.probes),
      maxProbes: String(domResolved.policy.maxProbes),
    };
    const receipt = {
      ...needsHumanReceipt(stage, [...overlayResult.overlayRefs, ...translated.overlayRefs], translated.translation),
      kind: 'resolved-with-proposals',
      governance: 'approved',
      lineage: { sources: [], parents: [task.taskFingerprint], handshakes: ['preparation', 'resolution'] },
      winningSource: 'live-dom',
      confidence: 'agent-proposed',
      provenanceKind: 'live-exploration',
      target: {
        action,
        screen: liveScreen.screen,
        element: liveElement.element,
        posture,
        override: resolveOverride(task, liveScreen, liveElement, posture, stage.controlResolution, context).override,
        snapshot_template: snapshotTemplate,
      },
      evidenceDrafts: proposalDrafts.map((proposal) => ({
        type: 'runtime-resolution-gap',
        trigger: 'live-dom-resolution',
        observation: {
          step: String(task.index),
          screen: liveScreen.screen,
          element: liveElement.element,
          ...candidateObservation,
        },
        proposal: {
          file: proposal.targetPath,
          field: 'elements',
          old_value: null,
          new_value: task.actionText,
        },
        confidence: 0.9,
        risk: 'low',
        scope: proposal.artifactType,
      })),
      proposalDrafts,
    } as ResolutionReceipt;
    updateObservedStateSessionAfterResolution(stage, receipt);
    return receipt;
  }

  recordExhaustion(stage.exhaustion, 'live-dom', domResolver ? 'failed' : 'skipped', domResolver ? 'Live DOM did not produce a bounded executable candidate set' : 'No live DOM resolver was available');
  recordExhaustion(stage.exhaustion, 'needs-human', 'failed', 'No safe executable interpretation remained after all machine paths were exhausted');

  return {
    ...needsHumanReceipt(stage, [...overlayResult.overlayRefs, ...translated.overlayRefs], translated.translation),
    governance: 'review-required',
    reason: domResolved.candidates.length > 0
      ? 'Live DOM exploration produced an ambiguous shortlist that requires human selection.'
      : 'No safe executable interpretation remained after exhausting explicit constraints, approved knowledge, prior evidence, live DOM exploration, and degraded resolution.',
    evidenceDrafts: domShortlist.map((candidate) => ({
      type: 'runtime-resolution-gap',
      trigger: 'live-dom-shortlist',
      observation: {
        step: String(task.index),
        candidate: candidate.element.element,
        score: candidate.score.toFixed(3),
        locator: candidate.evidence.locatorStrategy,
      },
      proposal: {
        file: 'knowledge/screens',
        field: 'elements',
        old_value: null,
        new_value: candidate.element.element,
      },
      confidence: 0.5,
      risk: 'low',
      scope: 'hints',
    })),
  } as ResolutionReceipt;
}

export type { RuntimeStepAgentContext } from './types';
