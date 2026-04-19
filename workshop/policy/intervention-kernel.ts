import { Effect } from 'effect';
import { TesseractError } from '../../domain/kernel/errors';
import { foldGovernance } from '../../domain/governance/workflow-types';
import type { Approved } from '../../domain/governance/workflow-types';
import type {
  InterventionCommandAction,
  InterventionCommandBatch,
  InterventionLineageProjection,
  InterventionReceipt,
  InterventionStatus,
} from '../../domain/handshake/intervention';
import { epistemicStatusForSource } from '../../domain/handshake/epistemic-brand';
import { createSemanticCore } from '../../domain/handshake/semantic-core';
import type { ProjectPaths } from '../paths';
import { FileSystem } from '../ports';

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

function estimateReadTokens(payload: Readonly<Record<string, unknown>>): number {
  return Math.max(1, Math.ceil(JSON.stringify(payload).length / 4));
}

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
    handoff: handoffForAction(action, {
      summary: reason,
      status: 'blocked',
      dependencyReceipts: [],
      emittedAt: now,
      previousSemanticToken: null,
    }),
    startedAt: now,
    completedAt: now,
    payload: { actionKind: action.kind, reason },
  };
}

/** Action profile — the tuple of fields that depend only on an action's
 *  `kind`. Phase 2.3 migration: previously these were computed by 4
 *  separate `switch` statements over `InterventionCommandActionKind`.
 *  Now they come from one exhaustive fold, so adding a new action kind
 *  breaks the build at exactly one site. Pattern mirrors
 *  `inboxHandoffProfile` in `operator.ts`. */
interface ActionHandoffProfile {
  readonly interventionKind: InterventionReceipt['kind'];
  readonly requestedParticipation: NonNullable<InterventionReceipt['handoff']>['requestedParticipation'];
  readonly requiredCapabilities: NonNullable<InterventionReceipt['handoff']>['requiredCapabilities'];
  readonly requiredAuthorities: NonNullable<InterventionReceipt['handoff']>['requiredAuthorities'];
  readonly successNextMoves: NonNullable<InterventionReceipt['handoff']>['nextMoves'];
}

function actionHandoffProfile(action: InterventionCommandAction): ActionHandoffProfile {
  // Exhaustive fold over `InterventionCommandActionKind`. Adding a new
  // kind to the union breaks the build here. No default branch — that
  // would silently allow missing cases.
  switch (action.kind) {
    case 'approve-proposal':
      return {
        interventionKind: 'proposal-approved',
        requestedParticipation: 'approve',
        requiredCapabilities: ['inspect-artifacts', 'approve-proposals'],
        requiredAuthorities: ['approve-canonical-change'],
        successNextMoves: [{
          action: 'Inspect approved knowledge change',
          rationale: 'Confirm the approved proposal produced the intended canonical update.',
          command: null,
        }, {
          action: 'Trigger rerun for affected scope',
          rationale: 'Validate downstream execution with the newly approved canon.',
          command: null,
        }],
      };
    case 'promote-pattern':
      return {
        interventionKind: 'operator-action',
        requestedParticipation: 'enrich',
        requiredCapabilities: ['inspect-artifacts', 'propose-fragments'],
        requiredAuthorities: ['promote-shared-pattern'],
        successNextMoves: [{
          action: 'Review promoted shared pattern',
          rationale: 'Ensure the promoted pattern generalizes beyond the original local supplement.',
          command: null,
        }],
      };
    case 'rerun-scope':
      return {
        interventionKind: 'rerun-requested',
        requestedParticipation: 'choose',
        requiredCapabilities: ['inspect-artifacts', 'request-reruns'],
        requiredAuthorities: ['request-rerun'],
        successNextMoves: [{
          action: 'Inspect rerun outcomes',
          rationale: 'Use the rerun to verify whether the blocked region or proposal actually improved execution.',
          command: null,
        }],
      };
    case 'suppress-hotspot':
      return {
        interventionKind: 'operator-action',
        requestedParticipation: 'defer',
        requiredCapabilities: ['inspect-artifacts'],
        requiredAuthorities: ['defer-work-item'],
        successNextMoves: [{
          action: 'Verify suppression remains intentional',
          rationale: 'Suppressed hotspots should remain explicit and reviewable instead of silently disappearing.',
          command: null,
        }],
      };
  }
}

// Backwards-compat accessors — delegate to the fold so callers outside
// handoffForAction/nextMovesForAction don't have to destructure.
function actionKindToInterventionKind(action: InterventionCommandAction): InterventionReceipt['kind'] {
  return actionHandoffProfile(action).interventionKind;
}

function nextMovesForAction(
  action: InterventionCommandAction,
  input: {
    readonly status: InterventionReceipt['status'];
  },
): NonNullable<InterventionReceipt['handoff']>['nextMoves'] {
  if (input.status === 'blocked') {
    return [{
      action: 'Review prerequisites',
      rationale: 'This action blocked before completing. Inspect dependencies or governance state before retrying.',
      command: null,
    }];
  }
  // Phase 2.3: delegate to the profile's exhaustive fold instead of
  // repeating the switch.
  return actionHandoffProfile(action).successNextMoves;
}

function handoffForAction(
  action: InterventionCommandAction,
  input: {
    readonly summary: string;
    readonly status: InterventionReceipt['status'];
    readonly dependencyReceipts: readonly InterventionReceipt[];
    readonly emittedAt: string;
    readonly previousSemanticToken?: string | null | undefined;
  },
): NonNullable<InterventionReceipt['handoff']> {
  const semanticCore = createSemanticCore({
    namespace: 'intervention-action',
    summary: action.summary,
    stableFields: {
      actionId: action.actionId,
      kind: action.kind,
      target: action.target,
      prerequisites: action.prerequisites,
      reversible: action.reversible,
      payload: action.payload,
    },
  }, input.previousSemanticToken ?? null);
  // Phase 2.3: one fold replaces 3 individual accessors.
  const profile = actionHandoffProfile(action);
  return {
    unresolvedIntent: action.summary,
    attemptedStrategies: input.dependencyReceipts.map((receipt) => receipt.summary),
    evidenceSlice: {
      artifactPaths: [action.target.artifactPath].filter((value): value is string => Boolean(value)),
      summaries: [input.summary, ...input.dependencyReceipts.map((receipt) => receipt.summary)],
    },
    blockageType: input.status === 'blocked' ? 'policy-block' : 'knowledge-gap',
    requestedParticipation: profile.requestedParticipation,
    requiredCapabilities: profile.requiredCapabilities,
    requiredAuthorities: profile.requiredAuthorities,
    blastRadius: action.reversible.reversible ? 'review-bound' : 'global',
    // Phase 2.2/T6 migration: route through the audited source mapping
    // in `lib/domain/handshake/epistemic-brand.ts` so intervention
    // receipts cannot accidentally mint `observed` from a block or an
    // approval. The source string names the provenance of this status.
    epistemicStatus: input.status === 'blocked'
      ? epistemicStatusForSource('trust-policy-block')
      : epistemicStatusForSource('approved-canon'),
    semanticCore,
    staleness: {
      observedAt: input.emittedAt,
      reviewBy: null,
      status: 'fresh',
      rationale: 'Freshly emitted intervention action handoff.',
    },
    nextMoves: nextMovesForAction(action, input),
    competingCandidates: [],
    tokenImpact: {
      payloadSizeBytes: JSON.stringify(action.payload).length,
      estimatedReadTokens: estimateReadTokens(action.payload),
    },
    chain: {
      depth: input.previousSemanticToken ? 2 : 1,
      previousSemanticToken: input.previousSemanticToken ?? null,
      semanticCorePreserved: semanticCore.driftStatus === 'preserved',
      driftDetectable: Boolean(input.previousSemanticToken),
      competingCandidateCount: 0,
    },
  };
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
        const updatedReceipt: InterventionReceipt = resumedReceipt.handoff
          ? {
              ...resumedReceipt,
              handoff: handoffForAction(action, {
                summary: resumedReceipt.summary,
                status: resumedReceipt.status,
                dependencyReceipts: receipts.filter((receipt) =>
                  action.prerequisites.some((dep) => dep.actionId === receipt.interventionId)),
                emittedAt: resumedReceipt.completedAt ?? resumedReceipt.startedAt,
                previousSemanticToken: resumedReceipt.handoff.semanticCore.token,
              }),
            }
          : resumedReceipt;
        return step(rest, [...receipts, updatedReceipt], [...resumed, action.actionId]);
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
              handoff: handoffForAction(approvedAction, {
                summary: result.summary ?? approvedAction.summary,
                status: 'completed',
                dependencyReceipts,
                emittedAt: startedAt,
                previousSemanticToken: null,
              }),
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
                handoff: handoffForAction(approvedAction, {
                  summary: normalizedError.message,
                  status: 'blocked',
                  dependencyReceipts,
                  emittedAt: startedAt,
                  previousSemanticToken: null,
                }),
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
