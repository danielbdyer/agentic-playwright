import type { ElementId, PostureId, SnapshotTemplateId } from '../../../domain/kernel/identity';
import type { ProposalConfidenceValues } from '../../../domain/attention/pipeline-config';
import type { StepAction } from '../../../domain/governance/workflow-types';
import type { SemanticDictionaryMatch } from '../../../domain/knowledge/semantic-dictionary-types';
import type { StepTaskElementCandidate, StepTaskScreenCandidate } from '../../../domain/knowledge/types';
import type { ResolutionCandidateSummary, ResolutionReceipt } from '../../../domain/resolution/types';
import { DEFAULT_PIPELINE_CONFIG } from '../../../domain/attention/pipeline-config';
import { mintApproved, mintReviewRequired } from '../../../domain/governance/workflow-types';
import { requiresElement, allowedActionFallback } from '../intent/resolve-action';
import { resolveFromDom } from '../intent/dom-fallback';
import { proposalForSupplementGap, proposalsFromInterpretation, proposalsForNeedsHuman, proposalsForDeterministicResolution } from '../proposals';
import { agentInterpretedReceipt, explicitResolvedReceipt, needsHumanReceipt } from '../receipt';
import type { AgentInterpretationRequest } from '../../../domain/interpretation/agent-interpreter';
import { resolveOverride } from '../intent/resolve-target';
import { selectedDomExplorationPolicy } from '../resolution/select-controls';
import { exhaustionEntry, normalizedCombined } from '../shared';
import { resolveWithConfidenceOverlay, resolveWithTranslation } from '../translation';
import { lookupSemanticDictionary } from '../../../domain/knowledge/semantic-dictionary';
import type { RuntimeAgentStageContext, StageEffects } from '../types';
import { EMPTY_EFFECTS } from '../types';
import {
  rankActionCandidates,
  rankElementCandidates,
  rankPostureCandidates,
  rankScreenCandidates,
  rankSnapshotCandidates,
  type LatticeCandidate,
  type RankedLattice,
} from '../intent/candidate-lattice';
import { createPlaywrightDomResolver } from '../../adapters/playwright-dom-resolver';
import { isRung8Applicable, attemptRung8Resolution } from '../intent/rung8-llm-dom';

/** Maximum characters for the DOM snapshot passed to the agent interpreter. */
const DOM_SNAPSHOT_MAX_CHARS = 2048;
type PlaywrightPageLike = Parameters<typeof createPlaywrightDomResolver>[0];

function isPlaywrightPageLike(page: unknown): page is PlaywrightPageLike {
  return typeof page === 'object' && page !== null && 'accessibility' in page && 'locator' in page;
}

type PlaywrightScreenshotLike = { screenshot: (opts: { readonly type: 'jpeg'; readonly quality: number; readonly fullPage: boolean }) => Promise<Buffer> };

function isPlaywrightScreenshotCapable(page: unknown): page is PlaywrightScreenshotLike {
  return typeof page === 'object' && page !== null && 'screenshot' in page;
}

/**
 * Capture a raw JPEG screenshot buffer from a live Playwright page.
 * Returns null when no page is available or when capture fails.
 * Used by the deferred screenshot collector to delay base64 encoding.
 */
export async function capturePageScreenshotBuffer(
  page: unknown,
  options?: { readonly quality?: number },
): Promise<Buffer | null> {
  if (!isPlaywrightScreenshotCapable(page)) return null;
  try {
    return await page.screenshot({
      type: 'jpeg',
      quality: options?.quality ?? 50,
      fullPage: false,
    });
  } catch {
    return null;
  }
}

/**
 * Capture a JPEG screenshot from a live Playwright page as a base64 string.
 * Returns null when no page is available, when capture fails, or when vision is disabled.
 * Uses JPEG at configurable quality (default 50) to minimise vision token cost.
 */
export async function capturePageScreenshot(
  page: unknown,
  options?: { readonly quality?: number },
): Promise<string | null> {
  const buffer = await capturePageScreenshotBuffer(page, options);
  return buffer ? buffer.toString('base64') : null;
}

/**
 * Capture a truncated ARIA/accessibility snapshot from a live Playwright page.
 * Returns null when no page is available or when capture fails.
 * Pure truncation: slices to `maxChars` without splitting mid-line when possible.
 */
export async function captureTruncatedAriaSnapshot(
  page: unknown,
  maxChars: number = DOM_SNAPSHOT_MAX_CHARS,
): Promise<string | null> {
  if (!isPlaywrightPageLike(page)) return null;
  try {
    const snapshot = await page.accessibility.snapshot({ interestingOnly: true });
    if (!snapshot) return null;
    const text = JSON.stringify(snapshot, null, 2);
    if (text.length <= maxChars) return text;
    // Truncate at the last newline boundary within maxChars to avoid mid-line cuts
    const truncated = text.slice(0, maxChars);
    const lastNewline = truncated.lastIndexOf('\n');
    return lastNewline > maxChars * 0.5
      ? truncated.slice(0, lastNewline) + '\n...'
      : truncated + '...';
  } catch {
    return null;
  }
}

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
  const knowledgeRefs = screen ? [...screen.knowledgeRefs] : [];

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
    // Alias-stabilization: propose action text as alias if not already known
    const aliasProposals = proposalsForDeterministicResolution(stage.task, screen, element ?? null, winningSource);
    const hasProposals = aliasProposals.length > 0;
    const effects: StageEffects = {
      ...EMPTY_EFFECTS,
      exhaustion: [exhaustionEntry(winningSource, 'resolved', 'Approved deterministic priors produced an executable target')],
    };
    return {
      receipt: {
        ...needsHumanReceipt(stage, [], null, effects),
        kind: hasProposals ? 'resolved-with-proposals' as const : 'resolved' as const,
        governance: mintApproved(),
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
        ...(hasProposals ? { proposalDrafts: aliasProposals } : {}),
      } as ResolutionReceipt,
      effects: {
        ...EMPTY_EFFECTS,
        exhaustion: [exhaustionEntry(winningSource, 'resolved', 'Approved deterministic priors produced an executable target')],
      },
    };
  }
  return { receipt: null, effects: EMPTY_EFFECTS };
}

export function trySemanticDictionaryResolution(stage: RuntimeAgentStageContext, acc: ResolutionAccumulator): StageResult & { match: SemanticDictionaryMatch | null } {
  const catalog = stage.context.semanticDictionary;
  if (!catalog || catalog.entries.length === 0) {
    return {
      receipt: null,
      effects: {
        ...EMPTY_EFFECTS,
        exhaustion: [exhaustionEntry('semantic-dictionary', 'skipped', 'No semantic dictionary available or empty')],
      },
      match: null,
    };
  }

  const normalized = normalizedCombined(stage.task);

  // Check semantic dictionary cache — avoids re-scoring all entries for similar intents
  const dictCache = stage.context.semanticDictCache;
  const cached = dictCache?.has(normalized) ? dictCache.get(normalized) : undefined;
  const match = cached !== undefined
    ? cached
    : lookupSemanticDictionary(normalized, catalog, {
        retrievalContext: {
          allowedActions: [...stage.task.allowedActions],
          currentScreen: stage.memory.currentScreen?.screen ?? null,
          availableScreens: stage.context.resolutionContext.screens.map((s) => s.screen),
          activeRouteVariantRefs: [...stage.memory.activeRouteVariantRefs],
          governanceFilter: 'include-review',
        },
      });

  // Cache the result for this intent (including null = no match)
  if (cached === undefined && dictCache) {
    dictCache.set(normalized, match ?? null);
  }

  if (!match) {
    return {
      receipt: null,
      effects: {
        ...EMPTY_EFFECTS,
        exhaustion: [exhaustionEntry('semantic-dictionary', 'failed', `No semantic dictionary entry matched above thresholds (${catalog.entries.length} entries searched)`)],
      },
      match: null,
    };
  }

  const { entry } = match;

  // Validate the matched target still exists in the resolution context
  const screen = stage.context.resolutionContext.screens.find((s) => s.screen === entry.target.screen);
  if (!screen) {
    return {
      receipt: null,
      effects: {
        ...EMPTY_EFFECTS,
        exhaustion: [exhaustionEntry('semantic-dictionary', 'failed', `Semantic dictionary matched entry ${entry.id} but screen ${entry.target.screen} no longer exists in resolution context`)],
      },
      match,
    };
  }

  const element = entry.target.element
    ? screen.elements.find((e) => e.element === entry.target.element) ?? null
    : null;
  if (entry.target.element && !element) {
    return {
      receipt: null,
      effects: {
        ...EMPTY_EFFECTS,
        exhaustion: [exhaustionEntry('semantic-dictionary', 'failed', `Semantic dictionary matched but element ${entry.target.element} no longer exists on screen ${entry.target.screen}`)],
      },
      match,
    };
  }

  const action = entry.target.action ?? acc.action;
  if (!action || (requiresElement(action) && !element)) {
    return {
      receipt: null,
      effects: {
        ...EMPTY_EFFECTS,
        exhaustion: [exhaustionEntry('semantic-dictionary', 'failed', 'Semantic dictionary match lacks required element for action')],
      },
      match,
    };
  }

  const override = resolveOverride(stage.task, screen, element, entry.target.posture, stage.controlResolution, stage.context);

  const scoring = match.scoring;
  const scoringSummary = scoring
    ? `text: ${scoring.textSimilarity.toFixed(3)}, structural: ${scoring.structuralScore.toFixed(3)}, confidence: ${scoring.confidence.toFixed(3)}, combined: ${scoring.combined.toFixed(3)}`
    : `similarity: ${match.similarityScore.toFixed(3)}, confidence: ${entry.confidence.toFixed(3)}, combined: ${match.combinedScore.toFixed(3)}`;

  const observation = {
    source: 'semantic-dictionary' as const,
    summary: `Semantic dictionary resolved via accrued LLM decision (${scoringSummary}, reuses: ${entry.successCount}).`,
    detail: {
      entryId: entry.id,
      provenance: entry.provenance,
      similarityScore: match.similarityScore.toFixed(3),
      confidence: entry.confidence.toFixed(3),
      combinedScore: match.combinedScore.toFixed(3),
      successCount: String(entry.successCount),
      ...(scoring ? {
        textSimilarity: scoring.textSimilarity.toFixed(3),
        structuralScore: scoring.structuralScore.toFixed(3),
      } : {}),
    },
  };

  const effects: StageEffects = {
    ...EMPTY_EFFECTS,
    exhaustion: [exhaustionEntry('semantic-dictionary', 'resolved', `Accrued LLM decision matched (${scoringSummary})`)],
    observations: [observation],
  };

  // Alias-stabilization for semantic dictionary resolutions
  const dictAliasProposals = proposalsForDeterministicResolution(stage.task, screen, element, 'semantic-dictionary');
  const dictHasProposals = dictAliasProposals.length > 0;
  return {
    receipt: {
      ...needsHumanReceipt(stage, [], null, effects),
      kind: dictHasProposals ? 'resolved-with-proposals' as const : 'resolved' as const,
      governance: mintApproved(),
      resolutionMode: 'deterministic',
      overlayRefs: [],
      winningConcern: 'knowledge',
      winningSource: 'semantic-dictionary',
      translation: null,
      confidence: 'agent-verified',
      provenanceKind: 'approved-knowledge',
      target: {
        action,
        screen: screen.screen,
        element: element?.element ?? null,
        posture: entry.target.posture,
        override: override.override,
        snapshot_template: entry.target.snapshotTemplate,
      },
      ...(dictHasProposals ? { proposalDrafts: dictAliasProposals } : {}),
    } as ResolutionReceipt,
    effects,
    match,
  };
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
    // Alias-stabilization for overlay resolutions
    const overlayAliasProposals = proposalsForDeterministicResolution(
      stage.task, overlayResult.screen ?? acc.screen ?? null, overlayResult.element ?? null, 'approved-equivalent-overlay',
    );
    const overlayHasProposals = overlayAliasProposals.length > 0;
    return {
      receipt: {
        ...needsHumanReceipt(stage, [], null, resolvedEffects),
        kind: overlayHasProposals ? 'resolved-with-proposals' as const : 'resolved' as const,
        governance: mintApproved(),
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
          screen: overlayResult.screen?.screen ?? acc.screen?.screen ?? null,
          element: overlayResult.element?.element ?? null,
          posture: overlayResult.posture ?? null,
          override: overlayOverride.override,
          snapshot_template: overlayResult.snapshotTemplate,
        },
        ...(overlayHasProposals ? { proposalDrafts: overlayAliasProposals } : {}),
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

export async function tryTranslationResolution(stage: RuntimeAgentStageContext, acc: ResolutionAccumulator, proposalConfidence?: ProposalConfidenceValues): Promise<AccumulatorStageResult> {
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
      governance: mintApproved(),
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
            element: translated.element?.element ?? '',
            source: stage.interpretation!.source,
          },
          proposal: {
            file: proposal.targetPath,
            field: 'elements',
            old_value: null,
            new_value: stage.task.actionText,
          },
          confidence: (proposalConfidence ?? DEFAULT_PIPELINE_CONFIG.proposalConfidenceValues).translation,
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

export async function tryLiveDomOrFallback(stage: RuntimeAgentStageContext, acc: ResolutionAccumulator, proposalConfidence?: ProposalConfidenceValues): Promise<StageResult<ResolutionReceipt>> {
  const domScreen = acc.translated.screen ?? acc.overlayResult.screen ?? acc.screen;
  const domResolver = stage.context.domResolver
    ?? (isPlaywrightPageLike(stage.context.page)
      ? createPlaywrightDomResolver(stage.context.page)
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
        governance: mintApproved(),
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
          confidence: (proposalConfidence ?? DEFAULT_PIPELINE_CONFIG.proposalConfidenceValues).dom,
          risk: 'low',
          scope: proposal.artifactType,
        })),
        proposalDrafts,
      } as ResolutionReceipt,
      effects: resolvedEffects,
    };
  }

  // ─── Rung 8: LLM-DOM Semantic Resolution ───
  // Between structural DOM (Rung 7) and full agent interpretation (Rung 9),
  // attempt lightweight semantic matching using the ARIA snapshot.
  const ariaCache = stage.context.ariaSnapshotCache;
  const rung8Snapshot = ariaCache
    ? await ariaCache.get(stage.context.page)
    : await captureTruncatedAriaSnapshot(stage.context.page);
  const rung8ElementHint = acc.element?.element ?? stage.task.actionText ?? '';
  const rung8ElementId: ElementId = acc.element?.element ?? (rung8ElementHint as ElementId);
  if (isRung8Applicable(rung8Snapshot, rung8ElementHint)) {
    const rung8Result = attemptRung8Resolution(rung8Snapshot!, rung8ElementHint);
    if (rung8Result.resolved && rung8Result.selector && acc.action && domScreen) {
      const rung8Effects: StageEffects = {
        ...EMPTY_EFFECTS,
        exhaustion: [exhaustionEntry('live-dom', 'resolved', `Rung 8 LLM-DOM resolved via semantic snapshot matching (confidence: ${rung8Result.confidence.toFixed(3)})`)],
        observations: domObservations,
      };
      return {
        receipt: {
          ...needsHumanReceipt(stage, acc.overlayResult.overlayRefs, null, rung8Effects),
          kind: 'resolved-with-proposals',
          governance: mintApproved(),
          lineage: { sources: [], parents: [stage.task.taskFingerprint], handshakes: ['preparation', 'resolution'] },
          winningSource: 'live-dom',
          confidence: 'agent-proposed',
          provenanceKind: 'live-exploration',
          target: {
            action: acc.action,
            screen: domScreen.screen,
            element: rung8ElementId,
            posture: acc.posture,
            override: resolveOverride(stage.task, domScreen, acc.element, acc.posture, stage.controlResolution, stage.context).override,
            snapshot_template: acc.snapshotTemplate,
          },
        } as ResolutionReceipt,
        effects: rung8Effects,
      };
    }
  }

  // ─── Rung 9: Agent Interpretation ───
  // Before falling to needs-human, try agent interpretation if available.
  // The agent receives the full context of what was tried and the DOM state.
  const agentInterpreter = stage.context.agentInterpreter;
  if (agentInterpreter && agentInterpreter.kind !== 'disabled') {
    // Capture ARIA snapshot and visual screenshot in parallel
    const [domSnapshot, screenshotBase64] = await Promise.all([
      ariaCache
        ? ariaCache.get(stage.context.page)
        : captureTruncatedAriaSnapshot(stage.context.page),
      capturePageScreenshot(stage.context.page),
    ]);
    const agentRequest: AgentInterpretationRequest = {
      actionText: stage.task.actionText,
      expectedText: stage.task.expectedText,
      normalizedIntent: stage.task.normalizedIntent,
      inferredAction: acc.action,
      screens: stage.context.resolutionContext.screens.map((screen) => ({
        screen: screen.screen,
        screenAliases: screen.screenAliases,
        elements: screen.elements.map((el) => ({
          element: el.element,
          name: el.name ?? null,
          aliases: el.aliases,
          widget: el.widget,
          role: el.role,
        })),
      })),
      exhaustionTrail: stage.exhaustion.map((entry) => ({
        stage: entry.stage,
        outcome: entry.outcome,
        reason: entry.reason,
      })),
      domSnapshot,
      screenshotBase64: screenshotBase64 ?? undefined,
      priorTarget: stage.context.previousResolution ?? null,
      taskFingerprint: stage.task.taskFingerprint,
      knowledgeFingerprint: stage.context.resolutionContext.knowledgeFingerprint,
      // Enriched context: what prior rungs learned, structural constraints, observed state
      topCandidates: {
        screens: acc.screenLattice.ranked.slice(0, 3).flatMap((c) =>
          c.value ? [{ screen: c.value.screen, score: c.score }] : [],
        ),
        elements: acc.elementLattice.ranked.slice(0, 3).flatMap((c) =>
          c.value ? [{ element: c.value.element, screen: acc.screen?.screen ?? '', score: c.score }] : [],
        ),
      },
      grounding: {
        targetRefs: [...stage.task.grounding.targetRefs],
        requiredStateRefs: [...stage.task.grounding.requiredStateRefs],
        forbiddenStateRefs: [...stage.task.grounding.forbiddenStateRefs],
        allowedActions: [...stage.task.allowedActions],
      },
      observedState: {
        currentScreen: stage.memory.currentScreen?.screen ?? null,
        activeStateRefs: [...stage.memory.activeStateRefs],
        lastSuccessfulLocatorRung: stage.memory.lastSuccessfulLocatorRung,
      },
      confidenceHints: stage.context.resolutionContext.confidenceOverlays
        .filter((r) => r.score > 0.3)
        .slice(0, 5)
        .map((r) => ({
          screen: r.screen ?? '',
          element: r.element ?? undefined,
          status: r.status,
          score: r.score,
        })),
    };

    const agentResult = await agentInterpreter.interpret(agentRequest);
    if (agentResult.interpreted && agentResult.target) {
      const agentEffects: StageEffects = {
        ...EMPTY_EFFECTS,
        exhaustion: [
          exhaustionEntry('live-dom', domResolver ? 'failed' : 'skipped', domResolver ? 'Live DOM did not produce a bounded candidate' : 'No live DOM resolver available'),
          exhaustionEntry('agent-interpreted', 'resolved', agentResult.rationale),
        ],
        observations: [
          ...domObservations,
          ...(agentResult.observation ? [agentResult.observation] : []),
        ],
      };
      const overlayRefs = [...acc.overlayResult.overlayRefs, ...acc.translated.overlayRefs];
      return {
        receipt: {
          ...agentInterpretedReceipt(stage, agentResult.target, agentResult.rationale, overlayRefs, acc.translated.translation, agentEffects),
          proposalDrafts: agentResult.proposalDrafts,
        } as ResolutionReceipt,
        effects: agentEffects,
      };
    }
  }

  // ─── Rung 10: Needs Human ───
  // Pass the interpretation so the LLM's screen/element identification
  // can guide proposal routing instead of dumping to catch-all.
  const needsHumanProposals = proposalsForNeedsHuman(stage.task, acc.screen, acc.element, stage.context.resolutionContext, stage.interpretation);
  const fallbackEffects: StageEffects = {
    ...EMPTY_EFFECTS,
    exhaustion: [
      exhaustionEntry('live-dom', domResolver ? 'failed' : 'skipped', domResolver ? 'Live DOM did not produce a bounded executable candidate set' : 'No live DOM resolver was available'),
      ...(agentInterpreter && agentInterpreter.kind !== 'disabled'
        ? [exhaustionEntry('agent-interpreted', 'failed', 'Agent could not confidently interpret the step')]
        : [exhaustionEntry('agent-interpreted', 'skipped', 'No agent interpreter available')]),
      exhaustionEntry('needs-human', 'failed', 'No safe executable interpretation remained after all machine paths were exhausted'),
    ],
    observations: domObservations,
  };
  return {
    receipt: {
      ...needsHumanReceipt(stage, [...acc.overlayResult.overlayRefs, ...acc.translated.overlayRefs], acc.translated.translation, fallbackEffects),
      kind: 'needs-human' as const,
      governance: mintReviewRequired(),
      reason: domResolved.candidates.length > 0
        ? 'Live DOM exploration produced an ambiguous shortlist that requires human selection.'
        : 'No safe executable interpretation remained after exhausting explicit constraints, approved knowledge, prior evidence, live DOM exploration, agent interpretation, and degraded resolution.',
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
        confidence: (proposalConfidence ?? DEFAULT_PIPELINE_CONFIG.proposalConfidenceValues).domShortlist,
        risk: 'low',
        scope: 'hints',
      })),
      proposalDrafts: needsHumanProposals,
    } as ResolutionReceipt,
    effects: fallbackEffects,
  };
}
