import type { ImprovementLedger, ImprovementLineageEntry, ImprovementRun } from '../improvement/types';
import { isApproved } from '../governance/workflow-types';

export function createImprovementRun(run: ImprovementRun): ImprovementRun {
  return {
    ...run,
    iterations: [...run.iterations].sort((left, right) => left.iteration - right.iteration),
    lineage: [...run.lineage].sort((left, right) => left.at.localeCompare(right.at)),
  };
}

export function checkpointRun(
  run: ImprovementRun,
  checkpoint: ImprovementLineageEntry,
): ImprovementRun {
  return {
    ...run,
    lineage: [...run.lineage, checkpoint],
  };
}

export function emptyImprovementLedger(): ImprovementLedger {
  return {
    kind: 'improvement-ledger',
    version: 1,
    runs: [],
  };
}

export function appendImprovementRun(
  ledger: ImprovementLedger,
  run: ImprovementRun,
): ImprovementLedger {
  return {
    ...ledger,
    runs: [...ledger.runs, createImprovementRun(run)],
  };
}

export function improvementRunInvariants(run: ImprovementRun): {
  readonly uniqueIdentity: boolean;
  readonly lineageContinuity: boolean;
  readonly governanceConsistency: boolean;
} {
  const identities = [
    ...run.signals.map((signal) => signal.signalId),
    ...run.candidateInterventions.map((candidate) => candidate.candidateId),
    ...run.acceptanceDecisions.map((decision) => decision.decisionId),
    ...run.lineage.map((entry) => entry.entryId),
  ];
  const uniqueIdentity = new Set(identities).size === identities.length;

  const signalIds = new Set(run.signals.map((signal) => signal.signalId));
  const candidateIds = new Set(run.candidateInterventions.map((candidate) => candidate.candidateId));
  const decisionIds = new Set(run.acceptanceDecisions.map((decision) => decision.decisionId));
  const lineageContinuity = run.iterations.every((iteration) =>
    iteration.signalIds.every((signalId) => signalIds.has(signalId))
    && iteration.candidateInterventionIds.every((candidateId) => candidateIds.has(candidateId))
    && iteration.acceptanceDecisionIds.every((decisionId) => decisionIds.has(decisionId))
  );

  const acceptedDecision = run.acceptanceDecisions.some((decision) => decision.verdict === 'accepted');
  const governanceConsistency = run.accepted === acceptedDecision
    && run.interventions.every((intervention) =>
      intervention.kind !== 'self-improvement-action'
      || (run.accepted
        ? isApproved(intervention.plan ?? { governance: 'blocked' })
        : !isApproved(intervention.plan ?? { governance: 'blocked' }))
    );

  return {
    uniqueIdentity,
    lineageContinuity,
    governanceConsistency,
  };
}
