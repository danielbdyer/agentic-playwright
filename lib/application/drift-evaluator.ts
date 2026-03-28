import type { WorkspaceCatalog } from './catalog';
import type { TrustPolicyArtifactType, ConfidenceDriftSignal } from '../domain/types';

interface DriftSignalEvidence {
  readonly runId: string;
  readonly stepIndex: number;
  readonly signal: ConfidenceDriftSignal;
}

export interface DriftDecayEvaluation {
  readonly totalDecay: number;
  readonly floor: number;
  readonly suppressedSignalCount: number;
  readonly appliedSignals: ReadonlyArray<{
    readonly runId: string;
    readonly stepIndex: number;
    readonly signal: ConfidenceDriftSignal;
    readonly artifactType: TrustPolicyArtifactType;
    readonly decayRate: number;
    readonly threshold: string;
  }>;
}

const driftSignalsFromStep = (
  step: WorkspaceCatalog['runRecords'][number]['artifact']['steps'][number],
): readonly ConfidenceDriftSignal[] => [
  ...(step.execution.degraded ? ['degraded-locator' as const] : []),
  ...(step.execution.semanticConsistency?.labelRoleMismatch ? ['label-role-mismatch' as const] : []),
  ...(step.execution.semanticConsistency?.accessibleNameSemanticsChanged ? ['accessible-name-semantics-changed' as const] : []),
  ...(step.execution.semanticConsistency?.unexpectedStateTransitionEffects ? ['unexpected-state-transition-effects' as const] : []),
  ...(step.execution.semanticConsistency?.assertionTargetAmbiguity ? ['assertion-target-ambiguity' as const] : []),
];

function defaultDecayRate(signal: ConfidenceDriftSignal): number {
  switch (signal) {
    case 'degraded-locator': return 0.05;
    case 'label-role-mismatch': return 0.09;
    case 'accessible-name-semantics-changed': return 0.08;
    case 'unexpected-state-transition-effects': return 0.12;
    case 'assertion-target-ambiguity': return 0.07;
  }
}

export function evaluateDriftDecayForArtifact(input: {
  readonly catalog: WorkspaceCatalog;
  readonly artifactType: TrustPolicyArtifactType;
  readonly runIds: readonly string[];
  readonly stepMatchesRunAndTarget: (runId: string, stepIndex: number) => boolean;
}): DriftDecayEvaluation {
  const policy = input.catalog.trustPolicy.artifact.confidenceDecay?.artifactTypes[input.artifactType];
  const floor = policy?.minimumFloor ?? 0.2;
  const suppressionWindowRuns = Math.max(0, Math.floor(policy?.suppressionWindowRuns ?? 1));
  const seenSignals = new Set<string>();

  const allSignals = input.catalog.runRecords
    .flatMap((entry) => input.runIds.includes(entry.artifact.runId) ? [{ runId: entry.artifact.runId, steps: entry.artifact.steps }] : [])
    .flatMap(({ runId, steps }) =>
      steps.flatMap((step): readonly DriftSignalEvidence[] =>
        input.stepMatchesRunAndTarget(runId, step.stepIndex)
          ? driftSignalsFromStep(step).map((signal) => ({ runId, stepIndex: step.stepIndex, signal }))
          : [],
      ),
    );

  const appliedSignals = allSignals.reduce(
    (acc, signal, index) => {
      const suppressionKey = `${signal.signal}:${signal.runId}`;
      const alreadySeenInWindow = suppressionWindowRuns > 0 && seenSignals.has(suppressionKey);
      if (alreadySeenInWindow) {
        return {
          ...acc,
          suppressedSignalCount: acc.suppressedSignalCount + 1,
        };
      }
      if (suppressionWindowRuns > 0) {
        seenSignals.add(suppressionKey);
      }
      const decayRate = policy?.rates[signal.signal] ?? defaultDecayRate(signal.signal);
      return {
        ...acc,
        appliedSignals: [
          ...acc.appliedSignals,
          {
            runId: signal.runId,
            stepIndex: signal.stepIndex,
            signal: signal.signal,
            artifactType: input.artifactType,
            decayRate,
            threshold: `signal-index>=${index};suppressionWindowRuns=${suppressionWindowRuns}`,
          },
        ],
      };
    },
    { appliedSignals: [] as DriftDecayEvaluation['appliedSignals'], suppressedSignalCount: 0 },
  );

  return {
    totalDecay: Number(appliedSignals.appliedSignals.reduce((sum, entry) => sum + entry.decayRate, 0).toFixed(2)),
    floor,
    suppressedSignalCount: appliedSignals.suppressedSignalCount,
    appliedSignals: appliedSignals.appliedSignals,
  };
}
