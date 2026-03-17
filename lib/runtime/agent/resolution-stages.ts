import type { PostureId, SnapshotTemplateId } from '../../domain/identity';
import type {
  ResolutionCandidateSummary,
  ResolutionReceipt,
  StepAction,
  StepTaskElementCandidate,
  StepTaskScreenCandidate,
} from '../../domain/types';
import { requiresElement, allowedActionFallback } from './resolve-action';
import { resolveFromDom } from './dom-fallback';
import { proposalForSupplementGap, proposalsFromInterpretation } from './proposals';
import { explicitResolvedReceipt, needsHumanReceipt } from './receipt';
import { resolveOverride } from './resolve-target';
import { selectedDomExplorationPolicy } from './select-controls';
import { exhaustionEntry } from './shared';
import { resolveWithConfidenceOverlay, resolveWithTranslation } from './translation';
import type { RuntimeAgentStageContext, StageEffects } from './types';
import { EMPTY_EFFECTS } from './types';
import {
  rankActionCandidates,
  rankElementCandidates,
  rankPostureCandidates,
  rankScreenCandidates,
  rankSnapshotCandidates,
  type LatticeCandidate,
  type RankedLattice,
} from './candidate-lattice';
import { createPlaywrightDomResolver } from '../adapters/playwright-dom-resolver';

export interface ResolutionAccumulator {
  action: StepAction | null;
  screen: StepTaskScreenCandidate | null;
  element: StepTaskElementCandidate | null;
  posture: PostureId | null;
  snapshotTemplate: SnapshotTemplateId | null;
  override: { source: string; override: string | null };
  actionLattice: RankedLattice<StepAction>;
  screenLattice: RankedLattice<StepTaskScreenCandidate>;
  elementLattice: RankedLattice<StepTaskElementCandidate>;
  postureLattice: RankedLattice<PostureId>;
  snapshotLattice: RankedLattice<SnapshotTemplateId>;
  overlayResult: ReturnType<typeof resolveWithConfidenceOverlay>;
  translated: Awaited<ReturnType<typeof resolveWithTranslation>>;
}

export interface StageResult<R = ResolutionReceipt | null> {
  receipt: R;
  effects: StageEffects;
}

export interface LatticeResult {
  accumulator: ResolutionAccumulator;
  effects: StageEffects;
}

export interface AccumulatorStageResult {
  receipt: ResolutionReceipt | null;
  effects: StageEffects;
  accumulator: ResolutionAccumulator;
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

export function tryExplicitResolution(stage: RuntimeAgentStageContext): StageResult {
  const explicit = stage.task.explicitResolution;
  if (explicit?.action && explicit.screen && (!requiresElement(explicit.action) || explicit.element)) {
    const effects: StageEffects = {
      ...EMPTY_EFFECTS,
      exhaustion: [exhaustionEntry('explicit', 'resolved', 'Explicit structured resolution satisfied executable requirements')],
    };
    return { receipt: explicitResolvedReceipt(stage, effects), effects };
  }
  return {
    receipt: null,
    effects: {
      ...EMPTY_EFFECTS,
      exhaustion: [exhaustionEntry('explicit', explicit ? 'attempted' : 'skipped', explicit ? 'Explicit constraints were partial and used as priors' : 'No explicit constraints present')],
    },
  };
}

export function buildLatticeAccumulator(stage: RuntimeAgentStageContext): LatticeResult {
  const { task, context, controlResolution, memory } = stage;

  const actionLattice = rankActionCandidates(task, controlResolution, context.resolutionContext);
  const action = actionLattice.selected?.value ?? null;
  const actionCandidates = summaryForValue('action', actionLattice.ranked);

  const screenLattice = rankScreenCandidates(task, action, controlResolution, context.previousResolution, context.resolutionContext, memory);
  const screen = screenLattice.selected?.value ?? null;

  const elementLattice = rankElementCandidates(task, screen, controlResolution, memory);
  const element = elementLattice.selected?.value ?? null;

  const postureLattice = rankPostureCandidates(task, element, controlResolution, context.resolutionContext);
  const posture = postureLattice.selected?.value ?? null;

  const override = resolveOverride(task, screen, element, posture, controlResolution, context);
  const snapshotLattice = rankSnapshotCandidates(task, screen, element, controlResolution);
  const snapshotTemplate = snapshotLattice.selected?.value ?? null;

  const supplementRefs = [
    ...(actionLattice.selected?.refs ?? []),
    ...(screen?.supplementRefs ?? []),
    ...(elementLattice.selected?.refs ?? []),
    ...(postureLattice.selected?.refs ?? []),
    ...(snapshotLattice.selected?.refs ?? []),
  ];
  const knowledgeRefs = screen ? screen.knowledgeRefs : [];

  const exhaustion = [
    screen
      ? exhaustionEntry('approved-screen-knowledge', 'attempted', `Selected screen ${screen.screen}`, summaryForValue('screen', screenLattice.ranked))
      : exhaustionEntry('approved-screen-knowledge', 'failed', 'No screen candidate matched approved screen knowledge priors', summaryForValue('screen', screenLattice.ranked)),
    element
      ? exhaustionEntry('approved-screen-knowledge', 'attempted', `Matched element ${element.element}`, summaryForValue('element', elementLattice.ranked))
      : exhaustionEntry('approved-screen-knowledge', 'failed', 'No element candidate matched approved screen knowledge', summaryForValue('element', elementLattice.ranked)),
    exhaustionEntry('shared-patterns', posture ? 'attempted' : 'skipped', posture ? `Matched posture ${posture}` : 'No shared posture pattern required', summaryForValue('posture', postureLattice.ranked)),
    exhaustionEntry(
      'prior-evidence',
      context.resolutionContext.evidenceRefs.length > 0 ? 'attempted' : 'skipped',
      context.resolutionContext.evidenceRefs.length > 0 ? 'Prior evidence refs were available to the agent task' : 'No prior evidence refs available',
    ),
  ];

  const latticeObservation = {
    source: 'approved-screen-knowledge' as const,
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
  };

  return {
    accumulator: {
      action,
      screen,
      element,
      posture,
      snapshotTemplate,
      override,
      actionLattice,
      screenLattice,
      elementLattice,
      postureLattice,
      snapshotLattice,
      overlayResult: { screen: null, element: null, posture: null, snapshotTemplate: null, overlayRefs: [] },
      translated: { translation: null, screen: null, element: null, overlayRefs: [] },
    },
    effects: { exhaustion, observations: [latticeObservation], knowledgeRefs, supplementRefs },
  };
}

export function tryApprovedKnowledgeResolution(stage: RuntimeAgentStageContext, acc: ResolutionAccumulator): StageResult {
  const { action, screen, element, snapshotTemplate, override, postureLattice, actionLattice } = acc;
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
    const effects: StageEffects = {
      ...EMPTY_EFFECTS,
      exhaustion: [exhaustionEntry(winningSource, 'resolved', 'Approved deterministic priors produced an executable target')],
    };
    return {
      receipt: {
        ...needsHumanReceipt(stage, [], null, effects),
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
          posture: acc.posture,
          override: override.override,
          snapshot_template: snapshotTemplate,
        },
      } as ResolutionReceipt,
      effects: {
        ...EMPTY_EFFECTS,
        exhaustion: [exhaustionEntry(winningSource, 'resolved', 'Approved deterministic priors produced an executable target')],
      },
    };
  }
  return { receipt: null, effects: EMPTY_EFFECTS };
}

export function tryOverlayResolution(stage: RuntimeAgentStageContext, acc: ResolutionAccumulator): AccumulatorStageResult {
  const overlayResult = resolveWithConfidenceOverlay(stage.task, stage.context, acc.action, acc.screen, acc.element, acc.snapshotTemplate);
  const updatedAcc = { ...acc, overlayResult };
  const observations = overlayResult.observation ? [overlayResult.observation] : [];

  if (overlayResult.overlayRefs.length > 0) {
    const overlayOverride = resolveOverride(stage.task, overlayResult.screen, overlayResult.element, overlayResult.posture, stage.controlResolution, stage.context);
    const resolvedEffects: StageEffects = {
      ...EMPTY_EFFECTS,
      exhaustion: [exhaustionEntry('approved-equivalent-overlay', 'resolved', `Approved-equivalent overlays resolved ${overlayResult.overlayRefs.join(', ')}`)],
      observations,
    };
    return {
      receipt: {
        ...needsHumanReceipt(stage, [], null, resolvedEffects),
        kind: 'resolved',
        governance: 'approved',
        resolutionMode: 'deterministic',
        lineage: { sources: [...stage.controlRefs, ...stage.evidenceRefs, ...overlayResult.overlayRefs], parents: [stage.task.taskFingerprint], handshakes: ['preparation', 'resolution'] },
        overlayRefs: overlayResult.overlayRefs,
        winningConcern: 'knowledge',
        winningSource: 'approved-equivalent',
        confidence: 'agent-verified',
        provenanceKind: 'approved-knowledge',
        translation: null,
        target: {
          action: acc.action ?? allowedActionFallback(stage.task) ?? 'custom',
          screen: overlayResult.screen!.screen,
          element: overlayResult.element?.element ?? null,
          posture: overlayResult.posture ?? null,
          override: overlayOverride.override,
          snapshot_template: overlayResult.snapshotTemplate,
        },
      } as ResolutionReceipt,
      effects: {
        ...EMPTY_EFFECTS,
        exhaustion: [exhaustionEntry('approved-equivalent-overlay', 'resolved', `Approved-equivalent overlays resolved ${overlayResult.overlayRefs.join(', ')}`)],
        observations,
      },
      accumulator: updatedAcc,
    };
  }

  return {
    receipt: null,
    effects: {
      ...EMPTY_EFFECTS,
      exhaustion: [exhaustionEntry('approved-equivalent-overlay', 'failed', 'No approved-equivalent confidence overlay produced an executable target')],
      observations,
    },
    accumulator: updatedAcc,
  };
}

export async function tryTranslationResolution(stage: RuntimeAgentStageContext, acc: ResolutionAccumulator): Promise<AccumulatorStageResult> {
  const translated = await resolveWithTranslation(stage.task, stage.context);
  const updatedAcc = { ...acc, translated };
  const observations = translated.observation ? [translated.observation] : [];

  if (translated.translation?.matched && translated.screen && (!requiresElement(acc.action) || translated.element) && (acc.action !== 'assert-snapshot' || acc.snapshotTemplate)) {
    const translatedOverride = resolveOverride(stage.task, translated.screen, translated.element, acc.posture, stage.controlResolution, stage.context);
    const resolvedEffects: StageEffects = {
      ...EMPTY_EFFECTS,
      exhaustion: [exhaustionEntry('structured-translation', 'resolved', translated.translation.rationale)],
      observations,
    };

    // WP4: Generate interpretation proposals so next run resolves deterministically
    const interpretationProposals = stage.interpretation
      ? proposalsFromInterpretation(stage.task, stage.interpretation, stage.context.resolutionContext)
      : [];
    const hasProposals = interpretationProposals.length > 0;

    const baseReceipt = {
      ...needsHumanReceipt(stage, [], null, resolvedEffects),
      kind: hasProposals ? 'resolved-with-proposals' as const : 'resolved' as const,
      governance: 'approved' as const,
      resolutionMode: 'translation' as const,
      lineage: { sources: [...stage.controlRefs, ...stage.evidenceRefs], parents: [stage.task.taskFingerprint], handshakes: ['preparation', 'resolution'] },
      overlayRefs: translated.overlayRefs,
      winningConcern: 'resolution',
      winningSource: 'structured-translation',
      translation: translated.translation,
      confidence: hasProposals ? 'agent-proposed' as const : 'agent-verified' as const,
      provenanceKind: 'approved-knowledge' as const,
      target: {
        action: acc.action ?? allowedActionFallback(stage.task) ?? 'custom',
        screen: translated.screen.screen,
        element: translated.element?.element ?? null,
        posture: acc.posture,
        override: translatedOverride.override,
        snapshot_template: acc.snapshotTemplate,
      },
      ...(hasProposals ? {
        evidenceDrafts: interpretationProposals.map((proposal) => ({
          type: 'runtime-resolution-gap' as const,
          trigger: 'translation-interpretation' as const,
          observation: {
            step: String(stage.task.index),
            screen: translated.screen!.screen,
            element: translated.element?.element ?? null,
            source: stage.interpretation!.source,
          },
          proposal: {
            file: proposal.targetPath,
            field: 'elements',
            old_value: null,
            new_value: stage.task.actionText,
          },
          confidence: 0.85,
          risk: 'low' as const,
          scope: proposal.artifactType,
        })),
        proposalDrafts: [...interpretationProposals],
      } : {}),
    };

    return {
      receipt: baseReceipt as ResolutionReceipt,
      effects: {
        ...EMPTY_EFFECTS,
        exhaustion: [exhaustionEntry('structured-translation', 'resolved', translated.translation.rationale)],
        observations,
      },
      accumulator: updatedAcc,
    };
  }

  return {
    receipt: null,
    effects: {
      ...EMPTY_EFFECTS,
      exhaustion: [exhaustionEntry('structured-translation', stage.context.translate ? 'failed' : 'skipped', stage.context.translate ? 'Structured translation did not produce an executable target' : 'No structured translation stage was configured')],
      observations,
    },
    accumulator: updatedAcc,
  };
}

export async function tryLiveDomOrFallback(stage: RuntimeAgentStageContext, acc: ResolutionAccumulator): Promise<StageResult<ResolutionReceipt>> {
  const domScreen = acc.translated.screen ?? acc.overlayResult.screen ?? acc.screen;
  const domResolver = stage.context.domResolver
    ?? (stage.context.page
      ? createPlaywrightDomResolver(stage.context.page as any)
      : undefined);
  const domPolicy = selectedDomExplorationPolicy(stage.task, stage.context);
  const domResolved = await resolveFromDom(domResolver, stage.task, domScreen, acc.action, domPolicy);
  const domObservations = domResolved.observation ? [domResolved.observation] : [];
  const domTop = domResolved.topCandidate;
  const domShortlist = domResolved.candidates.slice(0, domResolved.policy.maxCandidates);

  if (acc.action && domScreen && domTop && (acc.action !== 'assert-snapshot' || acc.snapshotTemplate)) {
    const liveScreen = domScreen;
    const liveElement = domTop.element;
    const supplementProposals = proposalForSupplementGap(stage.task, liveScreen, liveElement);
    const interpretationProposals = stage.interpretation
      ? proposalsFromInterpretation(stage.task, stage.interpretation, stage.context.resolutionContext)
      : [];
    const proposalDrafts = [...supplementProposals, ...interpretationProposals];
    const candidateObservation = {
      top: domShortlist.map((candidate) => `${candidate.element.element}:${candidate.score.toFixed(3)}`).join(' | '),
      probes: String(domResolved.probes),
      maxProbes: String(domResolved.policy.maxProbes),
    };
    const resolvedEffects: StageEffects = {
      ...EMPTY_EFFECTS,
      exhaustion: [exhaustionEntry('live-dom', 'attempted', `Live DOM ranked ${domResolved.candidates.length} candidate(s) and selected ${liveElement.element}`, {
        topCandidates: domShortlist.map((candidate) => ({
          concern: 'element' as const,
          source: 'live-dom' as const,
          value: candidate.element.element,
          score: candidate.score,
          reason: `rung=${candidate.evidence.locatorRung + 1}; role=${candidate.evidence.roleNameScore.toFixed(2)}; widget=${candidate.evidence.widgetCompatibilityScore.toFixed(2)}`,
        })),
        rejectedCandidates: domShortlist.slice(1).map((candidate) => ({
          concern: 'element' as const,
          source: 'live-dom' as const,
          value: candidate.element.element,
          score: candidate.score,
          reason: `rung=${candidate.evidence.locatorRung + 1}; role=${candidate.evidence.roleNameScore.toFixed(2)}; widget=${candidate.evidence.widgetCompatibilityScore.toFixed(2)}`,
        })),
      })],
      observations: domObservations,
    };
    return {
      receipt: {
        ...needsHumanReceipt(stage, [...acc.overlayResult.overlayRefs, ...acc.translated.overlayRefs], acc.translated.translation, resolvedEffects),
        kind: 'resolved-with-proposals',
        governance: 'approved',
        lineage: { sources: [], parents: [stage.task.taskFingerprint], handshakes: ['preparation', 'resolution'] },
        winningSource: 'live-dom',
        confidence: 'agent-proposed',
        provenanceKind: 'live-exploration',
        target: {
          action: acc.action,
          screen: liveScreen.screen,
          element: liveElement.element,
          posture: acc.posture,
          override: resolveOverride(stage.task, liveScreen, liveElement, acc.posture, stage.controlResolution, stage.context).override,
          snapshot_template: acc.snapshotTemplate,
        },
        evidenceDrafts: proposalDrafts.map((proposal) => ({
          type: 'runtime-resolution-gap',
          trigger: 'live-dom-resolution',
          observation: {
            step: String(stage.task.index),
            screen: liveScreen.screen,
            element: liveElement.element,
            ...candidateObservation,
          },
          proposal: {
            file: proposal.targetPath,
            field: 'elements',
            old_value: null,
            new_value: stage.task.actionText,
          },
          confidence: 0.9,
          risk: 'low',
          scope: proposal.artifactType,
        })),
        proposalDrafts,
      } as ResolutionReceipt,
      effects: resolvedEffects,
    };
  }

  const fallbackEffects: StageEffects = {
    ...EMPTY_EFFECTS,
    exhaustion: [
      exhaustionEntry('live-dom', domResolver ? 'failed' : 'skipped', domResolver ? 'Live DOM did not produce a bounded executable candidate set' : 'No live DOM resolver was available'),
      exhaustionEntry('needs-human', 'failed', 'No safe executable interpretation remained after all machine paths were exhausted'),
    ],
    observations: domObservations,
  };
  return {
    receipt: {
      ...needsHumanReceipt(stage, [...acc.overlayResult.overlayRefs, ...acc.translated.overlayRefs], acc.translated.translation, fallbackEffects),
      governance: 'review-required',
      reason: domResolved.candidates.length > 0
        ? 'Live DOM exploration produced an ambiguous shortlist that requires human selection.'
        : 'No safe executable interpretation remained after exhausting explicit constraints, approved knowledge, prior evidence, live DOM exploration, and degraded resolution.',
      evidenceDrafts: domShortlist.map((candidate) => ({
        type: 'runtime-resolution-gap',
        trigger: 'live-dom-shortlist',
        observation: {
          step: String(stage.task.index),
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
    } as ResolutionReceipt,
    effects: fallbackEffects,
  };
}
