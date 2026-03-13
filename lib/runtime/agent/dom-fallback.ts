import { compareStrings } from '../../domain/collections';
import { widgetCapabilityContracts } from '../../domain/widgets/contracts';
import type {
  DomExplorationPolicy,
  ResolutionCandidateSummary,
  ResolutionObservation,
  StepAction,
  StepTask,
  StepTaskElementCandidate,
  StepTaskScreenCandidate,
} from '../../domain/types';
import type { RuntimeDomResolver } from '../../domain/types';
import { createPlaywrightDomResolver } from '../adapters/playwright-dom-resolver';

export interface DomResolutionCandidate {
  element: StepTaskElementCandidate;
  score: number;
  evidence: {
    visibleCount: number;
    roleNameScore: number;
    locatorQualityScore: number;
    widgetCompatibilityScore: number;
    locatorRung: number;
    locatorStrategy: string;
  };
}

export interface DomResolutionResult {
  candidates: DomResolutionCandidate[];
  topCandidate: DomResolutionCandidate | null;
  observation?: ResolutionObservation | undefined;
  probes: number;
  policy: DomExplorationPolicy;
}

const DEFAULT_DOM_POLICY: DomExplorationPolicy = {
  maxCandidates: 3,
  maxProbes: 12,
  forbiddenActions: ['navigate', 'custom'],
};

function roleNameScore(task: StepTask, candidate: StepTaskElementCandidate): number {
  const loweredIntent = task.actionText.toLowerCase();
  const loweredExpected = task.expectedText.toLowerCase();
  const aliases = candidate.aliases.map((alias) => alias.toLowerCase());
  const name = candidate.name?.toLowerCase() ?? '';
  const roleBoost = candidate.role === 'textbox' || candidate.role === 'button' ? 0.1 : 0;
  const nameHit = name && (loweredIntent.includes(name) || loweredExpected.includes(name)) ? 0.45 : 0;
  const aliasHit = aliases.some((alias) => loweredIntent.includes(alias) || loweredExpected.includes(alias)) ? 0.35 : 0;
  return Math.min(1, roleBoost + nameHit + aliasHit);
}

function widgetActionForStepAction(action: StepAction | null): 'fill' | 'click' | 'get-value' | null {
  switch (action) {
    case 'input':
      return 'fill';
    case 'click':
      return 'click';
    case 'assert-snapshot':
      return 'get-value';
    default:
      return null;
  }
}

function compatibilityScore(action: StepAction | null, element: StepTaskElementCandidate): number {
  const widgetAction = widgetActionForStepAction(action);
  if (!widgetAction) {
    return 1;
  }
  const contract = widgetCapabilityContracts[element.widget];
  if (!contract) {
    if (action === 'click' && element.role === 'button') {
      return 0.7;
    }
    return action === 'assert-snapshot' ? 0.5 : 0;
  }
  return contract.supportedActions.includes(widgetAction) ? 1 : 0;
}

function scoreCandidate(input: {
  visibleCount: number;
  roleNameScore: number;
  locatorRung: number;
  locatorStrategyCount: number;
  widgetCompatibilityScore: number;
}): number {
  const visibilityScore = input.visibleCount > 0 ? Math.min(1, 0.4 + (input.visibleCount === 1 ? 0.25 : 0.05)) : 0;
  const locatorQualityScore = input.locatorStrategyCount <= 1
    ? 1
    : Math.max(0, 1 - (input.locatorRung / Math.max(1, input.locatorStrategyCount - 1)));
  return Number((
    (visibilityScore * 0.35)
    + (input.roleNameScore * 0.25)
    + (locatorQualityScore * 0.2)
    + (input.widgetCompatibilityScore * 0.2)
  ).toFixed(6));
}

function candidateSummary(candidate: DomResolutionCandidate): ResolutionCandidateSummary {
  return {
    concern: 'element',
    source: 'live-dom',
    value: candidate.element.element,
    score: candidate.score,
    reason: `visible=${candidate.evidence.visibleCount}; role-name=${candidate.evidence.roleNameScore.toFixed(2)}; locator-rung=${candidate.evidence.locatorRung + 1}; widget=${candidate.evidence.widgetCompatibilityScore.toFixed(2)}`,
  };
}

export async function resolveFromDom(
  domResolver: RuntimeDomResolver | unknown,
  task: StepTask,
  screen: StepTaskScreenCandidate | null,
  action: StepAction | null,
  policy?: DomExplorationPolicy | null,
): Promise<DomResolutionResult> {
  const effectivePolicy = policy ?? DEFAULT_DOM_POLICY;
  const effectiveResolver = typeof (domResolver as { resolve?: unknown } | undefined)?.resolve === 'function'
    ? domResolver as RuntimeDomResolver
    : domResolver
      ? createPlaywrightDomResolver(domResolver as any)
      : undefined;
  if (!effectiveResolver || !screen || !action) {
    return { candidates: [], topCandidate: null, probes: 0, policy: effectivePolicy };
  }
  if (effectivePolicy.forbiddenActions.includes(action)) {
    return {
      candidates: [],
      topCandidate: null,
      probes: 0,
      policy: effectivePolicy,
      observation: {
        source: 'live-dom',
        summary: `Skipped live DOM exploration because action ${action} is forbidden by policy.`,
      },
    };
  }

  const resolved = await effectiveResolver.resolve({ task, screen, action, policy: effectivePolicy });
  const candidates = resolved.candidates
    .filter((candidate) => compatibilityScore(action, candidate.element) > 0)
    .map((candidate) => {
      const computedRoleNameScore = roleNameScore(task, candidate.element);
      return {
        ...candidate,
        score: scoreCandidate({
          visibleCount: candidate.evidence.visibleCount,
          roleNameScore: computedRoleNameScore,
          locatorRung: candidate.evidence.locatorRung,
          locatorStrategyCount: Math.max(1, candidate.evidence.locatorRung + 1),
          widgetCompatibilityScore: candidate.evidence.widgetCompatibilityScore,
        }),
        evidence: {
          ...candidate.evidence,
          roleNameScore: computedRoleNameScore,
        },
      } satisfies DomResolutionCandidate;
    });
  const probes = resolved.probes;

  const ranked = candidates.sort((left, right) => {
    const scoreOrder = right.score - left.score;
    if (scoreOrder !== 0) {
      return scoreOrder;
    }
    return compareStrings(left.element.element, right.element.element);
  });

  const topCandidate = ranked[0] ?? null;
  return {
    candidates: ranked,
    topCandidate,
    probes,
    policy: effectivePolicy,
    observation: ranked.length > 0
      ? {
        source: 'live-dom',
        summary: ranked.length === 1
          ? 'Resolved uniquely visible candidate from live DOM'
          : 'Ranked multiple live-DOM candidates with bounded policy exploration',
        detail: {
          topElement: topCandidate?.element.element ?? '',
          candidateCount: String(ranked.length),
          probes: String(probes),
          maxProbes: String(effectivePolicy.maxProbes),
        },
        topCandidates: ranked.slice(0, effectivePolicy.maxCandidates).map(candidateSummary),
        rejectedCandidates: ranked.slice(1, effectivePolicy.maxCandidates + 1).map(candidateSummary),
      }
      : undefined,
  };
}
