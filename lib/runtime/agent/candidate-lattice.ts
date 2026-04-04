import { normalizeIntentText } from '../../domain/knowledge/inference';
import { createPostureId, createSnapshotTemplateId } from '../../domain/kernel/identity';
import { knowledgePaths } from '../../domain/kernel/ids';
import type {
  InterfaceResolutionContext,
  ObservedStateSession,
  StepAction,
  StepResolution,
  GroundedStep,
  StepTaskElementCandidate,
  StepTaskScreenCandidate,
} from '../../domain/types';
import { precedenceWeight, resolutionPrecedenceLaw } from '../../domain/resolution/precedence';
import { rungToMinConfidence } from '../../domain/resolution/confidence-provenance';
import type { Confidence } from '../../domain/types';
import { allowedActionFallback } from './resolve-action';
import { bestAliasMatch, humanizeIdentifier, normalizedCombined, uniqueSorted } from './shared';
import type { ResolutionTarget } from '../../domain/types';

export type LatticeSource =
  | 'explicit'
  | 'control'
  | 'approved-screen-knowledge'
  | 'shared-patterns'
  | 'prior-evidence'
  | 'approved-equivalent-overlay'
  | 'structured-translation'
  | 'live-dom';

export type LatticeConcern = 'action' | 'screen' | 'element' | 'posture' | 'snapshot';

export interface LatticeCandidate<T> {
  concern: LatticeConcern;
  source: LatticeSource;
  value: T | null;
  score: number;
  featureScores: {
    explicit: number;
    control: number;
    approvedKnowledge: number;
    overlay: number;
    translation: number;
    dom: number;
    alias: number;
    fallback: number;
    carry: number;
  };
  confidenceComponents: {
    compilerDerived: number;
    agentVerified: number;
    agentProposed: number;
  };
  summary: string;
  refs: readonly string[];
}

export interface RankedLattice<T> {
  selected: LatticeCandidate<T> | null;
  ranked: Array<LatticeCandidate<T>>;
}

const SOURCE_WEIGHT: Record<LatticeSource, number> = {
  explicit: precedenceWeight(resolutionPrecedenceLaw, 'explicit'),
  control: precedenceWeight(resolutionPrecedenceLaw, 'control'),
  'approved-screen-knowledge': precedenceWeight(resolutionPrecedenceLaw, 'approved-screen-knowledge'),
  'shared-patterns': precedenceWeight(resolutionPrecedenceLaw, 'shared-patterns'),
  'prior-evidence': precedenceWeight(resolutionPrecedenceLaw, 'prior-evidence'),
  'approved-equivalent-overlay': precedenceWeight(resolutionPrecedenceLaw, 'approved-equivalent-overlay'),
  'structured-translation': precedenceWeight(resolutionPrecedenceLaw, 'structured-translation'),
  'live-dom': precedenceWeight(resolutionPrecedenceLaw, 'live-dom'),
};

export interface ScoringRule<T> {
  score(input: T): number;
}

export function combineScoringRules<T>(...rules: readonly ScoringRule<T>[]): ScoringRule<T> {
  return { score: (input) => rules.reduce((total, rule) => total + rule.score(input), 0) };
}

export function contramapScoringRule<A, B>(rule: ScoringRule<A>, f: (b: B) => A): ScoringRule<B> {
  return { score: (input) => rule.score(f(input)) };
}

export const sourceWeightRule: ScoringRule<LatticeSource> = {
  score: (source) => SOURCE_WEIGHT[source],
};

export const featureTotalRule: ScoringRule<LatticeCandidate<unknown>['featureScores']> = {
  score: (features) => Object.values(features).reduce((sum, value) => sum + value, 0),
};

const candidateScoring = combineScoringRules<Omit<LatticeCandidate<unknown>, 'score' | 'confidenceComponents'>>(
  contramapScoringRule(sourceWeightRule, (c) => c.source),
  contramapScoringRule(featureTotalRule, (c) => c.featureScores),
);

/**
 * Derive confidence components from the rung-confidence Galois connection.
 * The Galois connection (α : Rung → Confidence) determines the minimum
 * confidence a source guarantees; this function converts that to the
 * weighted vector representation used by the candidate lattice.
 *
 * @see lib/domain/resolution/confidence-provenance.ts
 */
const CONFIDENCE_TO_COMPONENTS: Readonly<Record<Confidence, LatticeCandidate<unknown>['confidenceComponents']>> = {
  'human': { compilerDerived: 1, agentVerified: 0, agentProposed: 0 },
  'compiler-derived': { compilerDerived: 1, agentVerified: 0, agentProposed: 0 },
  'agent-verified': { compilerDerived: 0, agentVerified: 1, agentProposed: 0 },
  'agent-proposed': { compilerDerived: 0, agentVerified: 0, agentProposed: 1 },
  'intent-only': { compilerDerived: 0, agentVerified: 0, agentProposed: 0 },
  'unbound': { compilerDerived: 0, agentVerified: 0, agentProposed: 0 },
};

function confidenceFor(source: LatticeSource): LatticeCandidate<unknown>['confidenceComponents'] {
  const minConfidence = rungToMinConfidence(source);
  return CONFIDENCE_TO_COMPONENTS[minConfidence];
}

function candidate<T>(input: Omit<LatticeCandidate<T>, 'score' | 'confidenceComponents'>): LatticeCandidate<T> {
  return {
    ...input,
    score: candidateScoring.score(input as Omit<LatticeCandidate<unknown>, 'score' | 'confidenceComponents'>),
    confidenceComponents: confidenceFor(input.source),
  };
}

function stableValueKey(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'object' && 'screen' in value) {
    return String((value as { screen: string }).screen);
  }
  if (typeof value === 'object' && 'element' in value) {
    return String((value as { element: string }).element);
  }
  return String(value);
}

function sortCandidates<T>(entries: Array<LatticeCandidate<T>>): Array<LatticeCandidate<T>> {
  return [...entries].sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }
    const sourceOrder = SOURCE_WEIGHT[right.source] - SOURCE_WEIGHT[left.source];
    if (sourceOrder !== 0) {
      return sourceOrder;
    }
    return stableValueKey(left.value).localeCompare(stableValueKey(right.value));
  });
}

function asRanked<T>(entries: Array<LatticeCandidate<T>>): RankedLattice<T> {
  const ranked = sortCandidates(entries);
  return { selected: ranked[0] ?? null, ranked };
}

function groundedScreens(task: GroundedStep, resolutionContext: InterfaceResolutionContext): readonly StepTaskScreenCandidate[] {
  const routeVariantRefs = new Set(task.grounding.routeVariantRefs);
  if (routeVariantRefs.size === 0) {
    return resolutionContext.screens;
  }
  return resolutionContext.screens.filter((screen) => screen.routeVariantRefs.some((ref) => routeVariantRefs.has(ref)));
}

function groundedElements(task: GroundedStep, screen: StepTaskScreenCandidate): readonly StepTaskElementCandidate[] {
  const targetRefs = new Set(task.grounding.targetRefs);
  if (targetRefs.size === 0) {
    return screen.elements;
  }
  return screen.elements.filter((element) => targetRefs.has(element.targetRef));
}

export function rankActionCandidates(task: GroundedStep, controlResolution: StepResolution | null, resolutionContext: InterfaceResolutionContext): RankedLattice<StepAction> {
  if (task.explicitResolution?.action) {
    return asRanked([
      candidate({
        concern: 'action',
        source: 'explicit',
        value: task.explicitResolution.action,
        summary: 'Action provided by explicit scenario field.',
        refs: [],
        featureScores: { explicit: 100, control: 0, approvedKnowledge: 0, overlay: 0, translation: 0, dom: 0, alias: 0, fallback: 0, carry: 0 },
      }),
    ]);
  }
  if (controlResolution?.action) {
    return asRanked([
      candidate({
        concern: 'action',
        source: 'control',
        value: controlResolution.action,
        summary: 'Action provided by resolution control.',
        refs: [],
        featureScores: { explicit: 0, control: 100, approvedKnowledge: 0, overlay: 0, translation: 0, dom: 0, alias: 0, fallback: 0, carry: 0 },
      }),
    ]);
  }

  const normalized = normalizeIntentText(task.actionText);
  const entries: Array<LatticeCandidate<StepAction>> = task.allowedActions.flatMap((action) => {
    if (action === 'custom') {
      return [];
    }
    const aliases = resolutionContext.sharedPatterns.actions[action]?.aliases ?? [];
    const match = bestAliasMatch(normalized, aliases);
    if (!match) {
      return [];
    }
    return [candidate({
      concern: 'action',
      source: 'shared-patterns',
      value: action,
      summary: `Action matched shared pattern alias "${match.alias}".`,
      refs: [knowledgePaths.patterns()],
      featureScores: { explicit: 0, control: 0, approvedKnowledge: 80, overlay: 0, translation: 0, dom: 0, alias: match.score, fallback: 0, carry: 0 },
    })];
  });

  const fallback = allowedActionFallback(task);
  const entriesWithFallback = entries.length === 0 && fallback
    ? [...entries, candidate({
        concern: 'action',
        source: 'shared-patterns',
        value: fallback,
        summary: 'Action inferred from deterministic fallback grammar.',
        refs: [],
        featureScores: { explicit: 0, control: 0, approvedKnowledge: 20, overlay: 0, translation: 0, dom: 0, alias: 0, fallback: 8, carry: 0 },
      })]
    : entries;

  return asRanked(entriesWithFallback);
}

export function rankScreenCandidates(
  task: GroundedStep,
  action: StepAction | null,
  controlResolution: StepResolution | null,
  previousResolution: ResolutionTarget | null | undefined,
  resolutionContext: InterfaceResolutionContext,
  observedStateSession?: ObservedStateSession | undefined,
): RankedLattice<StepTaskScreenCandidate> {
  if (task.explicitResolution?.screen) {
    const explicit = groundedScreens(task, resolutionContext).find((screen) => screen.screen === task.explicitResolution?.screen) ?? null;
    return asRanked([
      candidate({ concern: 'screen', source: 'explicit', value: explicit, summary: 'Screen constrained by explicit scenario field.', refs: [], featureScores: { explicit: 100, control: 0, approvedKnowledge: 0, overlay: 0, translation: 0, dom: 0, alias: 0, fallback: 0, carry: 0 } }),
    ]);
  }
  if (controlResolution?.screen) {
    const controlled = groundedScreens(task, resolutionContext).find((screen) => screen.screen === controlResolution.screen) ?? null;
    return asRanked([
      candidate({ concern: 'screen', source: 'control', value: controlled, summary: 'Screen constrained by resolution control.', refs: [], featureScores: { explicit: 0, control: 100, approvedKnowledge: 0, overlay: 0, translation: 0, dom: 0, alias: 0, fallback: 0, carry: 0 } }),
    ]);
  }

  const normalized = normalizedCombined(task);
  const entries: Array<LatticeCandidate<StepTaskScreenCandidate>> = groundedScreens(task, resolutionContext).flatMap((screen) => {
    const aliases = uniqueSorted([screen.screen, humanizeIdentifier(screen.screen), ...screen.screenAliases]);
    const bestMatch = bestAliasMatch(normalized, aliases);
    if (!bestMatch) {
      return [];
    }
    const memoryCarry = observedStateSession?.currentScreen?.screen === screen.screen
      ? Math.max(0, Math.round(observedStateSession.currentScreen.confidence * 12))
      : 0;
    return [candidate({
      concern: 'screen',
      source: 'approved-screen-knowledge',
      value: screen,
      summary: `Screen matched approved aliases via "${bestMatch.alias}".${memoryCarry > 0 ? ' Working-memory prior reinforced same-screen continuation.' : ''}`,
      refs: [...screen.knowledgeRefs, ...screen.supplementRefs],
      featureScores: { explicit: 0, control: 0, approvedKnowledge: 80, overlay: 0, translation: 0, dom: 0, alias: bestMatch.score, fallback: 0, carry: memoryCarry },
    })];
  });

  const entriesWithCarry = entries.length === 0 && action !== 'navigate' && previousResolution?.screen
    ? (() => {
        const carried = groundedScreens(task, resolutionContext).find((screen) => screen.screen === previousResolution.screen) ?? null;
        if (!carried) return entries;
        const memoryCarry = observedStateSession?.currentScreen?.screen === carried.screen
          ? Math.max(0, Math.round(observedStateSession.currentScreen.confidence * 10))
          : 0;
        return [...entries, candidate({
          concern: 'screen',
          source: 'approved-screen-knowledge',
          value: carried,
          summary: memoryCarry > 0
            ? 'Screen carried forward from previous deterministic resolution and reinforced by working memory.'
            : 'Screen carried forward from previous deterministic resolution.',
          refs: [...carried.knowledgeRefs, ...carried.supplementRefs],
          featureScores: { explicit: 0, control: 0, approvedKnowledge: 15, overlay: 0, translation: 0, dom: 0, alias: 0, fallback: 0, carry: 6 + memoryCarry },
        })];
      })()
    : entries;

  return asRanked(entriesWithCarry);
}

export function rankElementCandidates(task: GroundedStep, screen: StepTaskScreenCandidate | null, controlResolution: StepResolution | null, observedStateSession?: ObservedStateSession | undefined): RankedLattice<StepTaskElementCandidate> {
  if (!screen) {
    return { selected: null, ranked: [] };
  }
  if (task.explicitResolution?.element) {
    const explicit = groundedElements(task, screen).find((element) => element.element === task.explicitResolution?.element) ?? null;
    return asRanked([candidate({ concern: 'element', source: 'explicit', value: explicit, summary: 'Element constrained by explicit scenario field.', refs: screen.supplementRefs, featureScores: { explicit: 100, control: 0, approvedKnowledge: 0, overlay: 0, translation: 0, dom: 0, alias: 0, fallback: 0, carry: 0 } })]);
  }
  if (controlResolution?.element) {
    const controlled = groundedElements(task, screen).find((element) => element.element === controlResolution.element) ?? null;
    return asRanked([candidate({ concern: 'element', source: 'control', value: controlled, summary: 'Element constrained by resolution control.', refs: screen.supplementRefs, featureScores: { explicit: 0, control: 100, approvedKnowledge: 0, overlay: 0, translation: 0, dom: 0, alias: 0, fallback: 0, carry: 0 } })]);
  }

  const normalized = normalizedCombined(task);
  const entries = groundedElements(task, screen)
    .flatMap((element) => {
      const aliases = uniqueSorted([element.element, humanizeIdentifier(element.element), element.name ?? '', ...element.aliases]);
      const match = bestAliasMatch(normalized, aliases);
      if (!match) {
        return [];
      }
      const targetSeen = observedStateSession?.activeTargetRefs.includes(element.targetRef) ?? false;
      const memoryCarry = targetSeen ? 10 : 0;
      return [candidate({
        concern: 'element',
        source: 'approved-screen-knowledge',
        value: element,
        summary: `Element matched local hints via "${match.alias}".${targetSeen ? ' Observed-state session preserved a prior target match.' : ''}`,
        refs: screen.supplementRefs,
        featureScores: { explicit: 0, control: 0, approvedKnowledge: 80, overlay: 0, translation: 0, dom: 0, alias: match.score, fallback: 0, carry: memoryCarry },
      })];
    });

  return asRanked(entries);
}

export function rankPostureCandidates(task: GroundedStep, element: StepTaskElementCandidate | null, controlResolution: StepResolution | null, resolutionContext: InterfaceResolutionContext): RankedLattice<ReturnType<typeof createPostureId>> {
  if (task.explicitResolution?.posture) {
    return asRanked([candidate({ concern: 'posture', source: 'explicit', value: task.explicitResolution.posture, summary: 'Posture constrained by explicit scenario field.', refs: [], featureScores: { explicit: 100, control: 0, approvedKnowledge: 0, overlay: 0, translation: 0, dom: 0, alias: 0, fallback: 0, carry: 0 } })]);
  }
  if (controlResolution?.posture) {
    return asRanked([candidate({ concern: 'posture', source: 'control', value: controlResolution.posture, summary: 'Posture constrained by resolution control.', refs: [], featureScores: { explicit: 0, control: 100, approvedKnowledge: 0, overlay: 0, translation: 0, dom: 0, alias: 0, fallback: 0, carry: 0 } })]);
  }

  const normalized = normalizedCombined(task);
  const entries: Array<LatticeCandidate<ReturnType<typeof createPostureId>>> = Object.entries(resolutionContext.sharedPatterns.postures).flatMap(([postureId, descriptor]) => {
    const match = bestAliasMatch(normalized, descriptor.aliases);
    if (!match) {
      return [];
    }
    return [candidate({
      concern: 'posture',
      source: 'shared-patterns',
      value: createPostureId(postureId),
      summary: `Posture matched shared pattern alias "${match.alias}".`,
      refs: [knowledgePaths.patterns()],
      featureScores: { explicit: 0, control: 0, approvedKnowledge: 80, overlay: 0, translation: 0, dom: 0, alias: match.score, fallback: 0, carry: 0 },
    })];
  });

  const entriesWithDefault = entries.length === 0 && element?.postures.some((posture) => posture === createPostureId('valid'))
    ? [...entries, candidate({
        concern: 'posture',
        source: 'approved-screen-knowledge',
        value: createPostureId('valid'),
        summary: 'Posture defaulted to valid posture advertised by element.',
        refs: [],
        featureScores: { explicit: 0, control: 0, approvedKnowledge: 20, overlay: 0, translation: 0, dom: 0, alias: 0, fallback: 4, carry: 0 },
      })]
    : entries;

  return asRanked(entriesWithDefault);
}

export function rankSnapshotCandidates(task: GroundedStep, screen: StepTaskScreenCandidate | null, element: StepTaskElementCandidate | null, controlResolution: StepResolution | null): RankedLattice<ReturnType<typeof createSnapshotTemplateId>> {
  if (task.explicitResolution?.snapshot_template) {
    return asRanked([candidate({ concern: 'snapshot', source: 'explicit', value: task.explicitResolution.snapshot_template, summary: 'Snapshot template constrained by explicit scenario field.', refs: [], featureScores: { explicit: 100, control: 0, approvedKnowledge: 0, overlay: 0, translation: 0, dom: 0, alias: 0, fallback: 0, carry: 0 } })]);
  }
  if (controlResolution?.snapshot_template) {
    return asRanked([candidate({ concern: 'snapshot', source: 'control', value: controlResolution.snapshot_template, summary: 'Snapshot template constrained by resolution control.', refs: [], featureScores: { explicit: 0, control: 100, approvedKnowledge: 0, overlay: 0, translation: 0, dom: 0, alias: 0, fallback: 0, carry: 0 } })]);
  }

  const normalized = normalizedCombined(task);
  const entries: Array<LatticeCandidate<ReturnType<typeof createSnapshotTemplateId>>> = Object.entries(element?.snapshotAliases ?? {}).flatMap(([snapshotTemplate, aliases]) => {
    const match = bestAliasMatch(normalized, aliases);
    if (!match) {
      return [];
    }
    return [candidate({
      concern: 'snapshot',
      source: 'approved-screen-knowledge',
      value: createSnapshotTemplateId(snapshotTemplate),
      summary: `Snapshot template matched alias "${match.alias}".`,
      refs: screen?.supplementRefs ?? [],
      featureScores: { explicit: 0, control: 0, approvedKnowledge: 80, overlay: 0, translation: 0, dom: 0, alias: match.score, fallback: 0, carry: 0 },
    })];
  });

  const entriesWithDefault = entries.length === 0 && (screen?.sectionSnapshots.length ?? 0) === 1
    ? [...entries, candidate({
        concern: 'snapshot',
        source: 'approved-screen-knowledge',
        value: screen?.sectionSnapshots[0] ?? null,
        summary: 'Snapshot template defaulted from single section snapshot.',
        refs: [],
        featureScores: { explicit: 0, control: 0, approvedKnowledge: 20, overlay: 0, translation: 0, dom: 0, alias: 0, fallback: 4, carry: 0 },
      })]
    : entries;

  return asRanked(entriesWithDefault);
}

export function candidateConfidence(c: LatticeCandidate<unknown> | null): 'compiler-derived' | 'agent-verified' | 'agent-proposed' | 'unbound' {
  if (!c) {
    return 'unbound';
  }
  if (c.confidenceComponents.agentProposed > 0) {
    return 'agent-proposed';
  }
  if (c.confidenceComponents.agentVerified > 0) {
    return 'agent-verified';
  }
  return 'compiler-derived';
}
