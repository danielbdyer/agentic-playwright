import { Effect } from 'effect';
import { TesseractError } from '../domain/errors';
import { foldGovernance } from '../domain/types/shared-context';
import type { Approved } from '../domain/types/shared-context';
import type {
  InterventionCommandAction,
  InterventionCommandBatch,
  InterventionLineageProjection,
  InterventionReceipt,
  InterventionStatus,
} from '../domain/types';
import type { ProjectPaths } from './paths';
import { FileSystem } from './ports/infrastructure-ports';

interface ActionExecutionContext {
  readonly action: Approved<InterventionCommandAction>;
  readonly paths: ProjectPaths;
  readonly dependencyReceipts: readonly InterventionReceipt[];
}

export interface ActionExecutionResult {
  readonly summary?: string | undefined;
  readonly effects?: InterventionReceipt['effects'] | undefined;
  readonly payload?: Readonly<Record<string, unknown>> | undefined;
}

export interface InterventionKernel {
  readonly executeAction: (input: ActionExecutionContext) => Effect.Effect<ActionExecutionResult, unknown>;
}

export interface InterventionKernelRunResult {
  readonly receipts: readonly InterventionReceipt[];
  readonly projection: InterventionLineageProjection;
  readonly executionOrder: readonly string[];
  readonly resumedActionIds: readonly string[];
}

export interface InterventionKernelRunInput {
  readonly batch: InterventionCommandBatch;
  readonly paths: ProjectPaths;
  readonly kernel: InterventionKernel;
  readonly participantRefs?: readonly InterventionReceipt['participantRefs'][number][] | undefined;
  readonly resumeFrom?: ReadonlyMap<string, InterventionReceipt> | undefined;
  readonly now?: () => string;
}

export function executeApprovedInterventionAction(input: {
  readonly kernel: InterventionKernel;
  readonly action: Approved<InterventionCommandAction>;
  readonly paths: ProjectPaths;
  readonly dependencyReceipts: readonly InterventionReceipt[];
}) {
  return input.kernel.executeAction({
    action: input.action,
    paths: input.paths,
    dependencyReceipts: input.dependencyReceipts,
  });
}

const DEFAULT_NOW = (): string => new Date().toISOString();

function receiptForBlocked(action: InterventionCommandAction, now: string, reason: string): InterventionReceipt {
  return {
    interventionId: action.actionId,
    kind: action.kind === 'approve-proposal'
      ? 'proposal-approved'
      : action.kind === 'rerun-scope'
        ? 'rerun-requested'
        : 'operator-action',
    status: 'blocked',
    summary: `${action.summary} (blocked: ${reason})`,
    participantRefs: [],
    target: action.target,
    effects: [{
      kind: 'signal-emitted',
      severity: 'warn',
      summary: reason,
      target: action.target,
      payload: { reason },
    }],
    startedAt: now,
    completedAt: now,
    payload: { actionKind: action.kind, reason },
  };
}

function actionKindToInterventionKind(action: InterventionCommandAction): InterventionReceipt['kind'] {
  switch (action.kind) {
    case 'approve-proposal':
      return 'proposal-approved';
    case 'promote-pattern':
      return 'operator-action';
    case 'rerun-scope':
      return 'rerun-requested';
    case 'suppress-hotspot':
      return 'operator-action';
  }
}

function topologicalOrder(actions: readonly InterventionCommandAction[]): readonly string[] {
  const byId = new Map(actions.map((action) => [action.actionId, action] as const));

  const step = (
    remaining: readonly InterventionCommandAction[],
    sorted: readonly string[],
  ): readonly string[] => {
    if (remaining.length === 0) return sorted;
    const ready = remaining
      .filter((action) => action.prerequisites.every((dep) => !dep.required || sorted.includes(dep.actionId)))
      .sort((left, right) => left.actionId.localeCompare(right.actionId));
    if (ready.length === 0) {
      throw new TesseractError('intervention-dag-invalid', 'Intervention command batch contains a cycle or missing dependency.');
    }
    const next = ready[0]!;
    const pruned = remaining.filter((action) => action.actionId !== next.actionId);
    return step(pruned, [...sorted, next.actionId]);
  };

  const allKnown = actions.every((action) => action.prerequisites.every((dep) => byId.has(dep.actionId)));
  if (!allKnown) {
    throw new TesseractError('intervention-dag-invalid', 'Intervention command batch references an unknown dependency action.');
  }

  return step(actions, []);
}

function lineageProjection(input: {
  batchId: string;
  receipts: readonly InterventionReceipt[];
  actionsById: ReadonlyMap<string, InterventionCommandAction>;
  generatedAt: string;
}): InterventionLineageProjection {
  return {
    kind: 'intervention-lineage-projection',
    version: 1,
    batchId: input.batchId,
    generatedAt: input.generatedAt,
    entries: input.receipts.map((receipt) => {
      const action = input.actionsById.get(receipt.interventionId);
      return {
        actionId: receipt.interventionId,
        kind: (action?.kind ?? 'suppress-hotspot'),
        status: receipt.status,
        dependsOn: (action?.prerequisites ?? []).map((dep) => dep.actionId),
        downstream: {
          scorecardDelta: (receipt.payload.scorecardDelta as Readonly<Record<string, number>> | undefined) ?? null,
          runOutcomes: (receipt.payload.runOutcomes as readonly string[] | undefined) ?? null,
        },
      };
    }),
  };
}

const statusRank: Readonly<Record<InterventionStatus, number>> = {
  completed: 0,
  skipped: 1,
  blocked: 2,
  planned: 3,
};

function deterministicReceiptSort(receipts: readonly InterventionReceipt[]): readonly InterventionReceipt[] {
  return [...receipts].sort((left, right) => {
    const statusDiff = statusRank[left.status] - statusRank[right.status];
    if (statusDiff !== 0) return statusDiff;
    return left.interventionId.localeCompare(right.interventionId);
  });
}

export function executeInterventionBatch(input: InterventionKernelRunInput) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const now = input.now ?? DEFAULT_NOW;
    const order = topologicalOrder(input.batch.actions);
    const actionsById = new Map(input.batch.actions.map((action) => [action.actionId, action] as const));

    const step = (
      remaining: readonly string[],
      receipts: readonly InterventionReceipt[],
      resumed: readonly string[],
    ): Effect.Effect<{ readonly receipts: readonly InterventionReceipt[]; readonly resumed: readonly string[] }, TesseractError> => {
      if (remaining.length === 0) return Effect.succeed({ receipts, resumed });

      const [actionId, ...rest] = remaining;
      const action = actionsById.get(actionId!);
      if (!action) return Effect.fail(new TesseractError('intervention-missing-action', `Missing action ${actionId}`));

      const resumedReceipt = input.resumeFrom?.get(action.actionId);
      if (resumedReceipt && resumedReceipt.status === 'completed') {
        return step(rest, [...receipts, resumedReceipt], [...resumed, action.actionId]);
      }

      return foldGovernance(action, {
        approved: (approvedAction) => {
          const dependencyReceipts = receipts.filter((receipt) =>
            approvedAction.prerequisites.some((dep) => dep.actionId === receipt.interventionId));
          const requiredDepsCompleted = approvedAction.prerequisites
            .filter((dep) => dep.required)
            .every((dep) => dependencyReceipts.some((receipt) => receipt.interventionId === dep.actionId && receipt.status === 'completed'));

          if (!requiredDepsCompleted) {
            const blocked = receiptForBlocked(approvedAction, now(), 'Required prerequisite did not complete successfully.');
            if (!input.batch.continueOnFailure) {
              return Effect.succeed({ receipts: [...receipts, blocked], resumed });
            }
            return step(rest, [...receipts, blocked], resumed);
          }

          const startedAt = now();
          return executeApprovedInterventionAction({
            kernel: input.kernel,
            action: approvedAction,
            paths: input.paths,
            dependencyReceipts,
          }).pipe(
            Effect.map((result): InterventionReceipt => ({
              interventionId: approvedAction.actionId,
              kind: actionKindToInterventionKind(approvedAction),
              status: 'completed',
              summary: result.summary ?? approvedAction.summary,
              participantRefs: input.participantRefs ?? [],
              target: approvedAction.target,
              effects: result.effects ?? [{
                kind: 'no-op',
                severity: 'info',
                summary: 'No explicit effects recorded by action handler.',
                target: approvedAction.target,
                payload: {},
              }],
              startedAt,
              completedAt: now(),
              payload: {
                ...approvedAction.payload,
                ...(result.payload ?? {}),
                reversible: approvedAction.reversible,
              },
            })),
            Effect.catchAll((error) => {
              const normalizedError = error instanceof TesseractError
                ? error
                : new TesseractError('intervention-action-failed', String(error));
              const failedReceipt: InterventionReceipt = {
                interventionId: approvedAction.actionId,
                kind: actionKindToInterventionKind(approvedAction),
                status: 'blocked',
                summary: `${approvedAction.summary} (failed)`,
                participantRefs: input.participantRefs ?? [],
                target: approvedAction.target,
                effects: [{ kind: 'signal-emitted', severity: 'error', summary: normalizedError.message, target: approvedAction.target, payload: { error: normalizedError.code } }],
                startedAt,
                completedAt: now(),
                payload: { ...approvedAction.payload, error: normalizedError.code, reversible: approvedAction.reversible },
              };
              return input.batch.continueOnFailure
                ? Effect.succeed(failedReceipt)
                : Effect.fail(normalizedError);
            }),
            Effect.flatMap((receipt) => step(rest, [...receipts, receipt], resumed)),
          );
        },
        reviewRequired: (reviewRequiredAction) => {
          const blocked = receiptForBlocked(
            reviewRequiredAction,
            now(),
            `Action ${reviewRequiredAction.actionId} requires operator review.`,
          );
          if (!input.batch.continueOnFailure) {
            return Effect.succeed({ receipts: [...receipts, blocked], resumed });
          }
          return step(rest, [...receipts, blocked], resumed);
        },
        blocked: (blockedAction) => {
          const blocked = receiptForBlocked(
            blockedAction,
            now(),
            `Action ${blockedAction.actionId} is blocked by governance.`,
          );
          if (!input.batch.continueOnFailure) {
            return Effect.succeed({ receipts: [...receipts, blocked], resumed });
          }
          return step(rest, [...receipts, blocked], resumed);
        },
      });
    };

    const state = yield* step(order, [], []);
    const sortedReceipts = deterministicReceiptSort(state.receipts);
    const projection = lineageProjection({
      batchId: input.batch.batchId,
      receipts: sortedReceipts,
      actionsById,
      generatedAt: now(),
    });
    const projectionPath = `${input.paths.inboxDir}/${input.batch.batchId}.intervention-lineage.json`;
    yield* fs.writeJson(projectionPath, projection);

    return {
      receipts: sortedReceipts,
      projection,
      executionOrder: order,
      resumedActionIds: state.resumed,
    } satisfies InterventionKernelRunResult;
  });
}
