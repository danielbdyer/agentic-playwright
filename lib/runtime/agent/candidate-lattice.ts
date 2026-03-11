import { normalizeIntentText } from '../../domain/inference';
import { createPostureId, createSnapshotTemplateId } from '../../domain/identity';
import { knowledgePaths } from '../../domain/ids';
import type {
  StepAction,
  StepResolution,
  StepTask,
  StepTaskElementCandidate,
  StepTaskScreenCandidate,
} from '../../domain/types';
import { precedenceWeight, resolutionPrecedenceLaw } from '../../domain/precedence';
import { allowedActionFallback } from './resolve-action';
import { bestAliasMatch, humanizeIdentifier, normalizedCombined, uniqueSorted } from './shared';

export type LatticeSource = 'explicit' | 'control' | 'approved-knowledge' | 'overlay' | 'translation' | 'live-dom';
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
  refs: string[];
}

export interface RankedLattice<T> {
  selected: LatticeCandidate<T> | null;
  ranked: Array<LatticeCandidate<T>>;
}

const SOURCE_WEIGHT: Record<LatticeSource, number> = {
  explicit: precedenceWeight(resolutionPrecedenceLaw, 'explicit'),
  control: precedenceWeight(resolutionPrecedenceLaw, 'control'),
  'approved-knowledge': precedenceWeight(resolutionPrecedenceLaw, 'approved-screen-knowledge'),
  overlay: precedenceWeight(resolutionPrecedenceLaw, 'approved-equivalent-overlay'),
  translation: precedenceWeight(resolutionPrecedenceLaw, 'structured-translation'),
  'live-dom': precedenceWeight(resolutionPrecedenceLaw, 'live-dom'),
};

function confidenceFor(source: LatticeSource): LatticeCandidate<unknown>['confidenceComponents'] {
  if (source === 'overlay' || source === 'translation') {
    return { compilerDerived: 0, agentVerified: 1, agentProposed: 0 };
  }
  if (source === 'live-dom') {
    return { compilerDerived: 0, agentVerified: 0, agentProposed: 1 };
  }
  return { compilerDerived: 1, agentVerified: 0, agentProposed: 0 };
}

function candidate<T>(input: Omit<LatticeCandidate<T>, 'score' | 'confidenceComponents'>): LatticeCandidate<T> {
  const featureTotal = Object.values(input.featureScores).reduce((sum, value) => sum + value, 0);
  return {
    ...input,
    score: SOURCE_WEIGHT[input.source] + featureTotal,
    confidenceComponents: confidenceFor(input.source),
  };
}

function stableValueKey(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
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

export function rankActionCandidates(task: StepTask, controlResolution: StepResolution | null): RankedLattice<StepAction> {
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
  const entries: Array<LatticeCandidate<StepAction>> = [];
  for (const action of task.allowedActions) {
    if (action === 'custom') {
      continue;
    }
    const aliases = task.runtimeKnowledge!.sharedPatterns.actions[action]?.aliases ?? [];
    const match = bestAliasMatch(normalized, aliases);
    if (!match) {
      continue;
    }
    entries.push(candidate({
      concern: 'action',
      source: 'approved-knowledge',
      value: action,
      summary: `Action matched shared pattern alias "${match.alias}".`,
      refs: [knowledgePaths.patterns()],
      featureScores: { explicit: 0, control: 0, approvedKnowledge: 80, overlay: 0, translation: 0, dom: 0, alias: match.score, fallback: 0, carry: 0 },
    }));
  }

  const fallback = allowedActionFallback(task);
  if (entries.length === 0 && fallback) {
    entries.push(candidate({
      concern: 'action',
      source: 'approved-knowledge',
      value: fallback,
      summary: 'Action inferred from deterministic fallback grammar.',
      refs: [],
      featureScores: { explicit: 0, control: 0, approvedKnowledge: 20, overlay: 0, translation: 0, dom: 0, alias: 0, fallback: 8, carry: 0 },
    }));
  }

  return asRanked(entries);
}

export function rankScreenCandidates(task: StepTask, action: StepAction | null, controlResolution: StepResolution | null, previousResolution: import('../../domain/types').ResolutionTarget | null | undefined): RankedLattice<StepTaskScreenCandidate> {
  if (task.explicitResolution?.screen) {
    const explicit = task.runtimeKnowledge!.screens.find((screen) => screen.screen === task.explicitResolution?.screen) ?? null;
    return asRanked([
      candidate({ concern: 'screen', source: 'explicit', value: explicit, summary: 'Screen constrained by explicit scenario field.', refs: [], featureScores: { explicit: 100, control: 0, approvedKnowledge: 0, overlay: 0, translation: 0, dom: 0, alias: 0, fallback: 0, carry: 0 } }),
    ]);
  }
  if (controlResolution?.screen) {
    const controlled = task.runtimeKnowledge!.screens.find((screen) => screen.screen === controlResolution.screen) ?? null;
    return asRanked([
      candidate({ concern: 'screen', source: 'control', value: controlled, summary: 'Screen constrained by resolution control.', refs: [], featureScores: { explicit: 0, control: 100, approvedKnowledge: 0, overlay: 0, translation: 0, dom: 0, alias: 0, fallback: 0, carry: 0 } }),
    ]);
  }

  const normalized = normalizedCombined(task);
  const entries: Array<LatticeCandidate<StepTaskScreenCandidate>> = [];
  for (const screen of task.runtimeKnowledge!.screens) {
    const aliases = uniqueSorted([screen.screen, humanizeIdentifier(screen.screen), ...screen.screenAliases]);
    const match = bestAliasMatch(normalized, aliases);
    if (!match) {
      continue;
    }
    entries.push(candidate({
      concern: 'screen',
      source: 'approved-knowledge',
      value: screen,
      summary: `Screen matched approved aliases via "${match.alias}".`,
      refs: [...screen.knowledgeRefs, ...screen.supplementRefs],
      featureScores: { explicit: 0, control: 0, approvedKnowledge: 80, overlay: 0, translation: 0, dom: 0, alias: match.score, fallback: 0, carry: 0 },
    }));
  }

  if (entries.length === 0 && action !== 'navigate' && previousResolution?.screen) {
    const carried = task.runtimeKnowledge!.screens.find((screen) => screen.screen === previousResolution.screen) ?? null;
    if (carried) {
      entries.push(candidate({
        concern: 'screen',
        source: 'approved-knowledge',
        value: carried,
        summary: 'Screen carried forward from previous deterministic resolution.',
        refs: [...carried.knowledgeRefs, ...carried.supplementRefs],
        featureScores: { explicit: 0, control: 0, approvedKnowledge: 15, overlay: 0, translation: 0, dom: 0, alias: 0, fallback: 0, carry: 6 },
      }));
    }
  }

  return asRanked(entries);
}

export function rankElementCandidates(task: StepTask, screen: StepTaskScreenCandidate | null, controlResolution: StepResolution | null): RankedLattice<StepTaskElementCandidate> {
  if (!screen) {
    return { selected: null, ranked: [] };
  }
  if (task.explicitResolution?.element) {
    const explicit = screen.elements.find((element) => element.element === task.explicitResolution?.element) ?? null;
    return asRanked([candidate({ concern: 'element', source: 'explicit', value: explicit, summary: 'Element constrained by explicit scenario field.', refs: screen.supplementRefs, featureScores: { explicit: 100, control: 0, approvedKnowledge: 0, overlay: 0, translation: 0, dom: 0, alias: 0, fallback: 0, carry: 0 } })]);
  }
  if (controlResolution?.element) {
    const controlled = screen.elements.find((element) => element.element === controlResolution.element) ?? null;
    return asRanked([candidate({ concern: 'element', source: 'control', value: controlled, summary: 'Element constrained by resolution control.', refs: screen.supplementRefs, featureScores: { explicit: 0, control: 100, approvedKnowledge: 0, overlay: 0, translation: 0, dom: 0, alias: 0, fallback: 0, carry: 0 } })]);
  }

  const normalized = normalizedCombined(task);
  const entries = screen.elements
    .map((element) => {
      const aliases = uniqueSorted([element.element, humanizeIdentifier(element.element), element.name ?? '', ...element.aliases]);
      const match = bestAliasMatch(normalized, aliases);
      if (!match) {
        return null;
      }
      return candidate({
        concern: 'element',
        source: 'approved-knowledge',
        value: element,
        summary: `Element matched local hints via "${match.alias}".`,
        refs: screen.supplementRefs,
        featureScores: { explicit: 0, control: 0, approvedKnowledge: 80, overlay: 0, translation: 0, dom: 0, alias: match.score, fallback: 0, carry: 0 },
      });
    })
    .filter((entry): entry is LatticeCandidate<StepTaskElementCandidate> => Boolean(entry));

  return asRanked(entries);
}

export function rankPostureCandidates(task: StepTask, element: StepTaskElementCandidate | null, controlResolution: StepResolution | null): RankedLattice<ReturnType<typeof createPostureId>> {
  if (task.explicitResolution?.posture) {
    return asRanked([candidate({ concern: 'posture', source: 'explicit', value: task.explicitResolution.posture, summary: 'Posture constrained by explicit scenario field.', refs: [], featureScores: { explicit: 100, control: 0, approvedKnowledge: 0, overlay: 0, translation: 0, dom: 0, alias: 0, fallback: 0, carry: 0 } })]);
  }
  if (controlResolution?.posture) {
    return asRanked([candidate({ concern: 'posture', source: 'control', value: controlResolution.posture, summary: 'Posture constrained by resolution control.', refs: [], featureScores: { explicit: 0, control: 100, approvedKnowledge: 0, overlay: 0, translation: 0, dom: 0, alias: 0, fallback: 0, carry: 0 } })]);
  }

  const normalized = normalizedCombined(task);
  const entries: Array<LatticeCandidate<ReturnType<typeof createPostureId>>> = [];
  for (const [postureId, descriptor] of Object.entries(task.runtimeKnowledge!.sharedPatterns.postures)) {
    const match = bestAliasMatch(normalized, descriptor.aliases);
    if (!match) {
      continue;
    }
    entries.push(candidate({
      concern: 'posture',
      source: 'approved-knowledge',
      value: createPostureId(postureId),
      summary: `Posture matched shared pattern alias "${match.alias}".`,
      refs: [knowledgePaths.patterns()],
      featureScores: { explicit: 0, control: 0, approvedKnowledge: 80, overlay: 0, translation: 0, dom: 0, alias: match.score, fallback: 0, carry: 0 },
    }));
  }

  if (entries.length === 0 && element?.postures.some((posture) => posture === createPostureId('valid'))) {
    entries.push(candidate({
      concern: 'posture',
      source: 'approved-knowledge',
      value: createPostureId('valid'),
      summary: 'Posture defaulted to valid posture advertised by element.',
      refs: [],
      featureScores: { explicit: 0, control: 0, approvedKnowledge: 20, overlay: 0, translation: 0, dom: 0, alias: 0, fallback: 4, carry: 0 },
    }));
  }

  return asRanked(entries);
}

export function rankSnapshotCandidates(task: StepTask, screen: StepTaskScreenCandidate | null, element: StepTaskElementCandidate | null, controlResolution: StepResolution | null): RankedLattice<ReturnType<typeof createSnapshotTemplateId>> {
  if (task.explicitResolution?.snapshot_template) {
    return asRanked([candidate({ concern: 'snapshot', source: 'explicit', value: task.explicitResolution.snapshot_template, summary: 'Snapshot template constrained by explicit scenario field.', refs: [], featureScores: { explicit: 100, control: 0, approvedKnowledge: 0, overlay: 0, translation: 0, dom: 0, alias: 0, fallback: 0, carry: 0 } })]);
  }
  if (controlResolution?.snapshot_template) {
    return asRanked([candidate({ concern: 'snapshot', source: 'control', value: controlResolution.snapshot_template, summary: 'Snapshot template constrained by resolution control.', refs: [], featureScores: { explicit: 0, control: 100, approvedKnowledge: 0, overlay: 0, translation: 0, dom: 0, alias: 0, fallback: 0, carry: 0 } })]);
  }

  const normalized = normalizedCombined(task);
  const entries: Array<LatticeCandidate<ReturnType<typeof createSnapshotTemplateId>>> = [];
  for (const [snapshotTemplate, aliases] of Object.entries(element?.snapshotAliases ?? {})) {
    const match = bestAliasMatch(normalized, aliases);
    if (!match) {
      continue;
    }
    entries.push(candidate({
      concern: 'snapshot',
      source: 'approved-knowledge',
      value: createSnapshotTemplateId(snapshotTemplate),
      summary: `Snapshot template matched alias "${match.alias}".`,
      refs: screen?.supplementRefs ?? [],
      featureScores: { explicit: 0, control: 0, approvedKnowledge: 80, overlay: 0, translation: 0, dom: 0, alias: match.score, fallback: 0, carry: 0 },
    }));
  }

  if (entries.length === 0 && (screen?.sectionSnapshots.length ?? 0) === 1) {
    entries.push(candidate({
      concern: 'snapshot',
      source: 'approved-knowledge',
      value: screen?.sectionSnapshots[0] ?? null,
      summary: 'Snapshot template defaulted from single section snapshot.',
      refs: [],
      featureScores: { explicit: 0, control: 0, approvedKnowledge: 20, overlay: 0, translation: 0, dom: 0, alias: 0, fallback: 4, carry: 0 },
    }));
  }

  return asRanked(entries);
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
