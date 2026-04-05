/**
 * Intent Interpretation — WP3: Hybrid heuristic + LLM interpretation for intent-only steps.
 *
 * Produces IntentInterpretation from GroundedStep using a two-phase approach:
 *   1. Heuristic phase (free, deterministic): matches normalized step text against
 *      knowledge layer (screens, elements, aliases, hints). Scored by token overlap.
 *   2. LLM fallback phase (token cost): if heuristic confidence is below threshold,
 *      delegates to the translate callback (which may route through the LLM provider).
 *
 * The interpretation surface records provenance: which source produced the interpretation
 * and which knowledge refs were consulted.
 */

import type { IntentThresholds } from '../../domain/attention/pipeline-config';
import type { StepAction } from '../../domain/governance/workflow-types';
import type { StepTaskElementCandidate, StepTaskScreenCandidate } from '../../domain/knowledge/types';
import type { GroundedStep } from '../../domain/resolution/types';
import { DEFAULT_PIPELINE_CONFIG } from '../../domain/attention/pipeline-config';
import type { ScreenId, ElementId, PostureId } from '../../domain/kernel/identity';
import type { RuntimeStepAgentContext, IntentInterpretation, InterpretationConfidence, StageEffects } from './types';
import { EMPTY_EFFECTS } from './types';
import { normalizedCombined, bestAliasMatch, uniqueSorted, humanizeIdentifier } from './shared';
import { exhaustionEntry } from './shared';

// ─── Heuristic Scoring ───

interface HeuristicCandidate {
  readonly screen: StepTaskScreenCandidate;
  readonly element: StepTaskElementCandidate | null;
  readonly score: number;
  readonly knowledgeRefs: readonly string[];
}

function scoreScreenMatch(normalized: string, screen: StepTaskScreenCandidate): number {
  const aliases = uniqueSorted([screen.screen, ...screen.screenAliases]);
  const match = bestAliasMatch(normalized, aliases);
  return match?.score ?? 0;
}

function scoreElementMatch(normalized: string, element: StepTaskElementCandidate): number {
  const aliases = uniqueSorted([
    element.element,
    element.name ?? '',
    ...element.aliases,
  ]);
  const match = bestAliasMatch(normalized, aliases);
  const aliasScore = match?.score ?? 0;

  // Bonus: humanized identifier matching
  const humanized = humanizeIdentifier(element.element);
  const humanizedMatch = bestAliasMatch(normalized, [humanized]);
  const humanizedScore = humanizedMatch?.score ?? 0;

  return Math.max(aliasScore, humanizedScore);
}

function rankHeuristicCandidates(
  task: GroundedStep,
  context: RuntimeStepAgentContext,
): readonly HeuristicCandidate[] {
  const normalized = normalizedCombined(task);
  const screens = context.resolutionContext.screens;

  return screens.flatMap((screen): readonly HeuristicCandidate[] => {
    const screenScore = scoreScreenMatch(normalized, screen);
    const knowledgeRefs = screen.knowledgeRefs ?? [];

    // Score each element within this screen
    const elementCandidates = screen.elements
      .flatMap((element) => {
        const score = screenScore + scoreElementMatch(normalized, element);
        return score > 0 ? [{ screen, element, score, knowledgeRefs: [...knowledgeRefs] }] : [];
      });

    // Also include screen-only candidate (no element)
    const screenOnlyCandidate: HeuristicCandidate = {
      screen,
      element: null,
      score: screenScore,
      knowledgeRefs,
    };

    return elementCandidates.length > 0
      ? elementCandidates
      : screenScore > 0
        ? [screenOnlyCandidate]
        : [];
  }).sort((left, right) => right.score - left.score);
}

function confidenceFromScore(score: number, hasElement: boolean, thresholds: IntentThresholds = DEFAULT_PIPELINE_CONFIG.intentThresholds): InterpretationConfidence {
  const threshold = hasElement ? thresholds.element : thresholds.screen;
  return score >= threshold * 2 ? 'high'
    : score >= threshold ? 'medium'
    : 'low';
}

// ─── Heuristic Interpretation ───

function heuristicInterpretation(
  task: GroundedStep,
  context: RuntimeStepAgentContext,
): IntentInterpretation | null {
  const candidates = rankHeuristicCandidates(task, context);
  const top = candidates[0];

  if (!top || top.score === 0) {
    return null;
  }

  const confidence = confidenceFromScore(top.score, top.element !== null);
  return {
    stepText: task.actionText,
    interpretedAction: inferActionFromText(task),
    interpretedScreen: top.screen.screen as ScreenId,
    interpretedElement: top.element?.element as ElementId ?? null,
    interpretedPosture: inferPostureFromElement(top.element),
    confidence,
    source: 'knowledge-heuristic',
    knowledgeRefs: top.knowledgeRefs,
  };
}

// ─── Action Inference ───

function inferActionFromText(task: GroundedStep): StepAction | null {
  const allowed = task.allowedActions;
  if (allowed.length === 1) {
    return allowed[0] ?? null;
  }
  // Use explicit resolution if available
  if (task.explicitResolution?.action) {
    return task.explicitResolution.action;
  }
  return null;
}

// ─── Posture Inference ───

function inferPostureFromElement(element: StepTaskElementCandidate | null): PostureId | null {
  if (!element || element.postures.length === 0) {
    return null;
  }
  // Default to first posture when exactly one is available
  return element.postures.length === 1
    ? element.postures[0] ?? null
    : null;
}

// ─── Translation Fallback Interpretation ───

async function translationFallbackInterpretation(
  task: GroundedStep,
  context: RuntimeStepAgentContext,
  heuristicRefs: readonly string[],
): Promise<IntentInterpretation | null> {
  if (!context.translate) {
    return null;
  }

  const screens = context.resolutionContext.screens;
  const translationRequest = {
    version: 1 as const,
    taskFingerprint: task.taskFingerprint,
    knowledgeFingerprint: context.resolutionContext.knowledgeFingerprint,
    controlsFingerprint: context.resolutionContext.confidenceFingerprint ?? null,
    normalizedIntent: task.normalizedIntent,
    actionText: task.actionText,
    expectedText: task.expectedText,
    allowedActions: task.allowedActions,
    screens: screens.map((screen) => ({
      screen: screen.screen,
      aliases: uniqueSorted([screen.screen, ...screen.screenAliases]),
      elements: screen.elements.map((element) => ({
        element: element.element,
        aliases: uniqueSorted([element.element, element.name ?? '', ...element.aliases]),
        postures: element.postures,
        snapshotTemplates: screen.sectionSnapshots,
      })),
    })),
    evidenceRefs: context.resolutionContext.evidenceRefs,
    overlayRefs: context.resolutionContext.confidenceOverlays.map((record) => record.id),
  };

  const receipt = await context.translate(translationRequest);

  if (!receipt.matched || !receipt.selected) {
    return null;
  }

  return {
    stepText: task.actionText,
    interpretedAction: inferActionFromText(task),
    interpretedScreen: (receipt.selected.screen ?? null) as ScreenId | null,
    interpretedElement: (receipt.selected.element ?? null) as ElementId | null,
    interpretedPosture: (receipt.selected.posture ?? null) as PostureId | null,
    confidence: receipt.selected.score >= 0.8 ? 'high'
      : receipt.selected.score >= 0.5 ? 'medium'
      : 'low',
    source: 'knowledge-translation',
    knowledgeRefs: [...heuristicRefs, ...receipt.selected.sourceRefs],
    // Thread LLM decomposition for downstream proposal generation
    decomposition: receipt.decomposition ?? null,
  };
}

// ─── Hybrid Interpretation (Public API) ───

export interface InterpretationResult {
  readonly interpretation: IntentInterpretation | null;
  readonly effects: StageEffects;
}

/**
 * Hybrid intent interpretation: heuristic first, LLM fallback second.
 *
 * Returns an IntentInterpretation when the step can be meaningfully matched
 * against knowledge. Returns null when neither heuristic nor translation
 * produces a match — the pipeline then falls through to DOM exploration.
 */
export async function interpretStepIntent(
  task: GroundedStep,
  context: RuntimeStepAgentContext,
  confidenceThreshold: InterpretationConfidence = 'medium',
): Promise<InterpretationResult> {
  // Phase 1: Heuristic matching against knowledge
  const heuristic = heuristicInterpretation(task, context);

  if (heuristic && meetsThreshold(heuristic.confidence, confidenceThreshold)) {
    return {
      interpretation: heuristic,
      effects: {
        ...EMPTY_EFFECTS,
        exhaustion: [exhaustionEntry(
          'approved-screen-knowledge',
          'attempted',
          `Knowledge heuristic interpreted step with ${heuristic.confidence} confidence (screen: ${heuristic.interpretedScreen ?? 'none'}, element: ${heuristic.interpretedElement ?? 'none'})`,
        )],
        knowledgeRefs: [...heuristic.knowledgeRefs],
      },
    };
  }

  // Phase 2: LLM translation fallback
  const heuristicRefs = heuristic?.knowledgeRefs ?? [];
  const translation = await translationFallbackInterpretation(task, context, heuristicRefs);

  if (translation) {
    return {
      interpretation: translation,
      effects: {
        ...EMPTY_EFFECTS,
        exhaustion: [
          exhaustionEntry(
            'approved-screen-knowledge',
            heuristic ? 'attempted' : 'skipped',
            heuristic
              ? `Knowledge heuristic produced ${heuristic.confidence} confidence (below ${confidenceThreshold} threshold)`
              : 'No heuristic match found in knowledge layer',
          ),
          exhaustionEntry(
            'structured-translation',
            'attempted',
            `Translation fallback interpreted step with ${translation.confidence} confidence`,
          ),
        ],
        knowledgeRefs: [...translation.knowledgeRefs],
      },
    };
  }

  // Neither phase produced a match
  return {
    interpretation: heuristic, // may still be a low-confidence heuristic — pass it along
    effects: {
      ...EMPTY_EFFECTS,
      exhaustion: [
        exhaustionEntry(
          'approved-screen-knowledge',
          heuristic ? 'attempted' : 'failed',
          heuristic
            ? `Knowledge heuristic produced ${heuristic.confidence} confidence (below ${confidenceThreshold} threshold)`
            : 'No heuristic match found in knowledge layer',
        ),
        exhaustionEntry(
          'structured-translation',
          context.translate ? 'failed' : 'skipped',
          context.translate
            ? 'Translation fallback did not produce a match'
            : 'No translation provider configured',
        ),
      ],
    },
  };
}

// ─── Threshold Comparison ───

const CONFIDENCE_RANK: Record<InterpretationConfidence, number> = {
  low: 1,
  medium: 2,
  high: 3,
};

function meetsThreshold(confidence: InterpretationConfidence, threshold: InterpretationConfidence): boolean {
  return CONFIDENCE_RANK[confidence] >= CONFIDENCE_RANK[threshold];
}

// ─── Exports for testing ───

export {
  heuristicInterpretation,
  rankHeuristicCandidates,
  confidenceFromScore,
  meetsThreshold,
  inferActionFromText,
};
