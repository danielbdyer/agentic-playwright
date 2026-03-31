import type {
  ImprovementLedger,
  ImprovementLineageEntry,
  ImprovementRun,
} from '../types';

export interface ImprovementRunInvariantReport {
  readonly uniqueIdentity: boolean;
  readonly lineageContinuity: boolean;
  readonly governanceConsistency: boolean;
}

export interface ImprovementRunInvariantError {
  readonly kind: 'improvement-run-invariant-error';
  readonly report: ImprovementRunInvariantReport;
}

export type ImprovementRunResult =
  | { readonly ok: true; readonly value: ImprovementRun }
  | { readonly ok: false; readonly error: ImprovementRunInvariantError };

export interface ImprovementLedgerInvariantError {
  readonly kind: 'improvement-ledger-invariant-error';
  readonly runId: string;
  readonly runError: ImprovementRunInvariantError;
}

export type ImprovementLedgerResult =
  | { readonly ok: true; readonly value: ImprovementLedger }
  | { readonly ok: false; readonly error: ImprovementLedgerInvariantError };

export function createImprovementRun(run: ImprovementRun): ImprovementRunResult {
  const normalized = {
    ...run,
    iterations: [...run.iterations].sort((left, right) => left.iteration - right.iteration),
    lineage: [...run.lineage].sort((left, right) => left.at.localeCompare(right.at)),
  };
  const report = improvementRunInvariants(normalized);
  return report.uniqueIdentity && report.lineageContinuity && report.governanceConsistency
    ? { ok: true, value: normalized }
    : {
        ok: false,
        error: {
          kind: 'improvement-run-invariant-error',
          report,
        },
      };
}

export function recordCheckpoint(
  run: ImprovementRun,
  checkpoint: ImprovementLineageEntry,
): ImprovementRunResult {
  return createImprovementRun({
    ...run,
    lineage: [...run.lineage, checkpoint],
  });
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
): ImprovementLedgerResult {
  const normalizedRun = createImprovementRun(run);
  if (!normalizedRun.ok) {
    return {
      ok: false,
      error: {
        kind: 'improvement-ledger-invariant-error',
        runId: run.improvementRunId,
        runError: normalizedRun.error,
      },
    };
  }
  return {
    ok: true,
    value: {
      ...ledger,
      runs: [...ledger.runs, normalizedRun.value],
    },
  };
}

export function improvementRunInvariants(run: ImprovementRun): ImprovementRunInvariantReport {
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
      || (run.accepted ? intervention.plan?.governance === 'approved' : intervention.plan?.governance !== 'approved')
    );

  return {
    uniqueIdentity,
    lineageContinuity,
    governanceConsistency,
  };
}
