import path from 'path';
import { Effect } from 'effect';
import { explainBoundScenario } from '../../domain/scenario/explanation';
import { TesseractError } from '../../domain/kernel/errors';
import type { AdoId } from '../../domain/kernel/identity';
import { buildGroundedSpecFlow } from '../../domain/execution/grounded-flow';
import { renderReadableSpecModule } from '../../domain/codegen/spec-codegen';
import { foldGovernance, mintApproved } from '../../domain/types/shared-context';
import type { Approved, Blocked, ReviewRequired } from '../../domain/types/shared-context';
import type {
  BoundScenario,
  ImprovementRun,
  ProposalBundle,
  RunRecord,
  ScenarioInterpretationSurface,
  ScenarioProjectionInput,
} from '../../domain/types';
import type { CompileSnapshot } from './compile-snapshot';
import { loadWorkspaceCatalog } from '../catalog';
import { createProposalBundleEnvelope, createScenarioEnvelopeFingerprints, createScenarioEnvelopeIds } from '../catalog/envelope';
import type { WorkspaceCatalog } from '../catalog';
import { buildOperatorInboxItems, operatorInboxItemsForScenario } from '../governance/operator';
import type { ProjectPaths } from '../paths';
import {
  emitManifestPath,
  generatedProposalsPath,
  generatedReviewPath,
  generatedSpecPath,
  generatedTracePath,
  relativeProjectPath,
} from '../paths';
import { FileSystem } from '../ports';
import {
  fingerprintProjectionArtifact,
  fingerprintProjectionOutput,
  type ProjectionInputFingerprint,
} from '../projections/cache';
import { renderReview } from '../projections/review';
import { type ProjectionIncremental } from '../projections/runner';
import { runIncrementalStage } from '../pipeline';

export interface EmitProjectionResult {
  readonly outputPath: string;
  readonly tracePath: string;
  readonly reviewPath: string;
  readonly proposalsPath: string;
  readonly lifecycle: 'normal' | 'fixme' | 'skip' | 'fail';
  readonly incremental: ProjectionIncremental;
}

export type EmitScenarioResult = EmitProjectionResult;

/**
 * Governance-branded bound scenario types for the emission boundary.
 * `emitScenario` uses `foldGovernance` to classify before emission:
 *   - Approved: emit normally
 *   - ReviewRequired: emit normally (review state is orthogonal to emission)
 *   - Blocked: force lifecycle to 'skip' (emits test.skip())
 */
export type ApprovedBoundScenario = Approved<BoundScenario>;
export type BlockedBoundScenario = Blocked<BoundScenario>;
export type ReviewRequiredBoundScenario = ReviewRequired<BoundScenario>;

function toPosix(value: string): string {
  return value.replace(/\\/g, '/');
}

function relativeModule(fromFile: string, toFile: string): string {
  const relative = toPosix(path.relative(path.dirname(fromFile), toFile));
  return relative.startsWith('.') ? relative : `./${relative}`;
}

function latestRunForScenario(catalog: WorkspaceCatalog, adoId: AdoId): RunRecord | null {
  return catalog.runRecords.reduce<RunRecord | null>(
    (latest, entry) =>
      entry.artifact.adoId === adoId &&
      (latest === null || entry.artifact.completedAt > latest.completedAt)
        ? entry.artifact
        : latest,
    null,
  );
}

function latestProposalBundle(catalog: WorkspaceCatalog, adoId: AdoId): ProposalBundle | null {
  return catalog.proposalBundles
    .filter((entry) => entry.artifact.adoId === adoId)
    .sort((left, right) => right.artifact.runId.localeCompare(left.artifact.runId))[0]?.artifact ?? null;
}

function latestSessionsForScenario(catalog: WorkspaceCatalog, adoId: AdoId) {
  return catalog.agentSessions
    .filter((entry) => entry.artifact.scenarioIds.includes(adoId))
    .sort((left, right) => right.artifact.startedAt.localeCompare(left.artifact.startedAt))
    .map((entry) => entry.artifact);
}

function latestImprovementRunsForScenario(catalog: WorkspaceCatalog, adoId: AdoId): readonly ImprovementRun[] {
  return catalog.improvementRuns
    .filter((entry) => entry.artifact.iterations.some((iteration) => iteration.scenarioIds.includes(adoId)))
    .sort((left, right) =>
      (right.artifact.completedAt ?? right.artifact.startedAt).localeCompare(left.artifact.completedAt ?? left.artifact.startedAt),
    )
    .map((entry) => entry.artifact);
}

function createScenarioProjectionInput(input: {
  adoId: AdoId;
  boundScenario: BoundScenario;
  surface: ScenarioInterpretationSurface;
  latestRun: RunRecord | null;
  proposalBundle: ProposalBundle | null;
  catalog: WorkspaceCatalog;
}): ScenarioProjectionInput {
  return {
    adoId: input.adoId,
    boundScenario: input.boundScenario,
    surface: input.surface,
    latestRun: input.latestRun,
    proposalBundle: input.proposalBundle,
    interfaceGraph: input.catalog.interfaceGraph?.artifact ?? null,
    selectorCanon: input.catalog.selectorCanon?.artifact ?? null,
    stateGraph: input.catalog.stateGraph?.artifact ?? null,
    sessions: latestSessionsForScenario(input.catalog, input.adoId),
    improvementRuns: latestImprovementRunsForScenario(input.catalog, input.adoId),
    learningManifest: input.catalog.learningManifest?.artifact ?? null,
  };
}

function renderExecutableEmitArtifacts(
  paths: ProjectPaths,
  boundScenario: BoundScenario,
  surface: ScenarioInterpretationSurface,
  latestRun: RunRecord | null,
  proposalBundle: ProposalBundle | null,
  inboxItems: ReturnType<typeof operatorInboxItemsForScenario>,
  projectionInput: ScenarioProjectionInput,
) {
  const outputPath = generatedSpecPath(paths, boundScenario.metadata.suite, boundScenario.source.ado_id);
  const tracePath = generatedTracePath(paths, boundScenario.metadata.suite, boundScenario.source.ado_id);
  const reviewPath = generatedReviewPath(paths, boundScenario.metadata.suite, boundScenario.source.ado_id);
  const proposalsPath = generatedProposalsPath(paths, boundScenario.metadata.suite, boundScenario.source.ado_id);
  const manifestPath = emitManifestPath(paths, boundScenario.metadata.suite, boundScenario.source.ado_id);
  const flow = buildGroundedSpecFlow(boundScenario, surface);
  const rendered = renderReadableSpecModule(flow, {
    imports: {
      fixtures: relativeModule(outputPath, path.join(paths.rootDir, 'fixtures', 'index.ts')).replace(/\.ts$/, ''),
      scenarioContext: relativeModule(outputPath, path.join(paths.rootDir, 'lib', 'composition', 'scenario-context.ts')).replace(/\.ts$/, ''),
    },
  });
  const improvementSummary = projectionInput.improvementRuns.length === 0
    ? null
    : (() => {
        const latestImprovementRun = projectionInput.improvementRuns[0] ?? null;
        const latestDecision = latestImprovementRun?.acceptanceDecisions[0] ?? null;
        return {
          relatedRunIds: projectionInput.improvementRuns.map((run) => run.improvementRunId),
          latestRunId: latestImprovementRun?.improvementRunId ?? null,
          latestAccepted: latestImprovementRun?.accepted ?? null,
          latestVerdict: latestDecision?.verdict ?? null,
          latestDecisionId: latestDecision?.decisionId ?? null,
          signalCount: latestImprovementRun?.signals.length ?? 0,
          candidateInterventionCount: latestImprovementRun?.candidateInterventions.length ?? 0,
          checkpointRef: latestDecision?.checkpointRef ?? null,
        };
      })();
  const traceArtifact = {
    ...explainBoundScenario(boundScenario, rendered.lifecycle, latestRun),
    improvement: improvementSummary,
  };
  const reviewText = renderReview(traceArtifact, proposalBundle, inboxItems, latestRun, projectionInput);

  return {
    outputPath,
    tracePath,
    reviewPath,
    proposalsPath,
    manifestPath,
    rendered,
    traceArtifact,
    reviewText,
    proposalBundle: proposalBundle ?? createProposalBundleEnvelope({
      ids: createScenarioEnvelopeIds({
        adoId: boundScenario.source.ado_id,
        suite: boundScenario.metadata.suite,
        runId: latestRun?.runId ?? 'pending',
      }),
      fingerprints: createScenarioEnvelopeFingerprints({
        artifact: latestRun?.runId ?? 'pending',
        content: boundScenario.source.content_hash,
        knowledge: null,
        controls: null,
        task: null,
        run: latestRun?.runId ?? 'pending',
      }),
      lineage: {
        sources: [],
        parents: [],
        handshakes: ['preparation', 'resolution', 'execution', 'evidence', 'proposal'],
      },
      governance: mintApproved(),
      payload: {
        adoId: boundScenario.source.ado_id,
        runId: latestRun?.runId ?? 'pending',
        revision: boundScenario.source.revision,
        title: boundScenario.metadata.title,
        suite: boundScenario.metadata.suite,
        proposals: [],
      },
      proposals: [],
    }),
  };
}

function renderApprovedEmitArtifacts(
  paths: ProjectPaths,
  boundScenario: Approved<BoundScenario>,
  surface: ScenarioInterpretationSurface,
  latestRun: RunRecord | null,
  proposalBundle: ProposalBundle | null,
  inboxItems: ReturnType<typeof operatorInboxItemsForScenario>,
  projectionInput: ScenarioProjectionInput,
) {
  return renderExecutableEmitArtifacts(
    paths,
    boundScenario,
    surface,
    latestRun,
    proposalBundle,
    inboxItems,
    projectionInput,
  );
}

export function emitApprovedScenarioArtifacts(input: {
  readonly paths: ProjectPaths;
  readonly boundScenario: Approved<BoundScenario>;
  readonly surface: ScenarioInterpretationSurface;
  readonly latestRun: RunRecord | null;
  readonly proposalBundle: ProposalBundle | null;
  readonly inboxItems: ReturnType<typeof operatorInboxItemsForScenario>;
  readonly projectionInput: ScenarioProjectionInput;
}) {
  return renderApprovedEmitArtifacts(
    input.paths,
    input.boundScenario,
    input.surface,
    input.latestRun,
    input.proposalBundle,
    input.inboxItems,
    input.projectionInput,
  );
}

function renderReviewRequiredEmitArtifacts(
  paths: ProjectPaths,
  boundScenario: ReviewRequired<BoundScenario>,
  surface: ScenarioInterpretationSurface,
  latestRun: RunRecord | null,
  proposalBundle: ProposalBundle | null,
  inboxItems: ReturnType<typeof operatorInboxItemsForScenario>,
  projectionInput: ScenarioProjectionInput,
) {
  return renderExecutableEmitArtifacts(
    paths,
    boundScenario,
    surface,
    latestRun,
    proposalBundle,
    inboxItems,
    projectionInput,
  );
}

/**
 * Blocked scenarios emit test.skip() — governance blocks execution.
 * Produces the same artifact shape but forces lifecycle to 'skip'.
 */
function renderBlockedEmitArtifacts(
  paths: ProjectPaths,
  boundScenario: Blocked<BoundScenario>,
  surface: ScenarioInterpretationSurface,
  latestRun: RunRecord | null,
  proposalBundle: ProposalBundle | null,
  inboxItems: ReturnType<typeof operatorInboxItemsForScenario>,
  projectionInput: ScenarioProjectionInput,
) {
  const outputPath = generatedSpecPath(paths, boundScenario.metadata.suite, boundScenario.source.ado_id);
  const tracePath = generatedTracePath(paths, boundScenario.metadata.suite, boundScenario.source.ado_id);
  const reviewPath = generatedReviewPath(paths, boundScenario.metadata.suite, boundScenario.source.ado_id);
  const proposalsPath = generatedProposalsPath(paths, boundScenario.metadata.suite, boundScenario.source.ado_id);
  const manifestPath = emitManifestPath(paths, boundScenario.metadata.suite, boundScenario.source.ado_id);
  const flow = buildGroundedSpecFlow(boundScenario, surface);
  // Force lifecycle to 'skip' for blocked scenarios — governance overrides status-derived lifecycle
  const blockedFlow = {
    ...flow,
    metadata: { ...flow.metadata, lifecycle: 'skip' as const, governance: 'blocked' as const },
  };
  const rendered = renderReadableSpecModule(blockedFlow, {
    imports: {
      fixtures: relativeModule(outputPath, path.join(paths.rootDir, 'fixtures', 'index.ts')).replace(/\.ts$/, ''),
      scenarioContext: relativeModule(outputPath, path.join(paths.rootDir, 'lib', 'composition', 'scenario-context.ts')).replace(/\.ts$/, ''),
    },
  });
  const traceArtifact = {
    ...explainBoundScenario(boundScenario, 'skip', latestRun),
    improvement: null,
  };
  const reviewText = renderReview(traceArtifact, proposalBundle, inboxItems, latestRun, projectionInput);

  return {
    outputPath,
    tracePath,
    reviewPath,
    proposalsPath,
    manifestPath,
    rendered: { ...rendered, lifecycle: 'skip' as const },
    traceArtifact,
    reviewText,
    proposalBundle: proposalBundle ?? createProposalBundleEnvelope({
      ids: createScenarioEnvelopeIds({
        adoId: boundScenario.source.ado_id,
        suite: boundScenario.metadata.suite,
        runId: latestRun?.runId ?? 'pending',
      }),
      fingerprints: createScenarioEnvelopeFingerprints({
        artifact: latestRun?.runId ?? 'pending',
        content: boundScenario.source.content_hash,
        knowledge: null,
        controls: null,
        task: null,
        run: latestRun?.runId ?? 'pending',
      }),
      lineage: {
        sources: [],
        parents: [],
        handshakes: ['preparation', 'resolution', 'execution', 'evidence', 'proposal'],
      },
      governance: mintApproved(),
      payload: {
        adoId: boundScenario.source.ado_id,
        runId: latestRun?.runId ?? 'pending',
        revision: boundScenario.source.revision,
        title: boundScenario.metadata.title,
        suite: boundScenario.metadata.suite,
        proposals: [],
      },
      proposals: [],
    }),
  };
}

type EmitArtifacts = ReturnType<typeof renderApprovedEmitArtifacts> | ReturnType<typeof renderReviewRequiredEmitArtifacts> | ReturnType<typeof renderBlockedEmitArtifacts>;

function emitOutputFingerprint(artifacts: EmitArtifacts): string {
  return fingerprintProjectionOutput({
    spec: artifacts.rendered.code,
    trace: artifacts.traceArtifact,
    review: artifacts.reviewText,
    proposals: artifacts.proposalBundle,
  });
}

function readPersistedEmitOutputState(artifacts: EmitArtifacts) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const { specExists, traceExists, reviewExists, proposalsExist } = yield* Effect.all({
      specExists: fs.exists(artifacts.outputPath),
      traceExists: fs.exists(artifacts.tracePath),
      reviewExists: fs.exists(artifacts.reviewPath),
      proposalsExist: fs.exists(artifacts.proposalsPath),
    }, { concurrency: 'unbounded' });
    if (!specExists || !traceExists || !reviewExists || !proposalsExist) {
      return { status: 'missing-output' as const };
    }

    const persistedOutput = yield* Effect.all({
      trace: fs.readJson(artifacts.tracePath),
      proposals: fs.readJson(artifacts.proposalsPath),
      spec: fs.readText(artifacts.outputPath),
      review: fs.readText(artifacts.reviewPath),
    }, { concurrency: 'unbounded' }).pipe(
      Effect.map(({ trace, proposals, spec, review }) => ({
        status: 'ok' as const,
        outputFingerprint: fingerprintProjectionOutput({
          spec,
          trace,
          review,
          proposals,
        }),
      })),
      Effect.catchAll(() => Effect.succeed({ status: 'invalid-output' as const })),
    );
    return persistedOutput;
  });
}

export function emitScenario(
  options: { adoId: AdoId; paths: ProjectPaths; catalog?: WorkspaceCatalog } | { paths: ProjectPaths; compileSnapshot: CompileSnapshot; catalog?: WorkspaceCatalog },
): Effect.Effect<EmitScenarioResult, unknown, unknown> {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const catalog = options.catalog ?? (yield* loadWorkspaceCatalog({ paths: options.paths, scope: 'post-run' }));
    const source: CompileSnapshot = 'compileSnapshot' in options
      ? options.compileSnapshot
      : yield* Effect.gen(function* () {
          const scenario = catalog.scenarios.find((entry) => entry.artifact.source.ado_id === options.adoId);
          const boundScenario = catalog.boundScenarios.find((entry) => entry.artifact.source.ado_id === options.adoId);
          const surface = catalog.interpretationSurfaces.find((entry) => entry.artifact.payload.adoId === options.adoId);
          if (!scenario || !boundScenario || !surface) {
            return yield* Effect.fail(new TesseractError('missing-compile-artifacts', `Missing scenario, bound scenario, or interpretation surface for ${options.adoId}`));
          }
          return {
            adoId: options.adoId,
            scenario: scenario.artifact,
            scenarioPath: scenario.absolutePath,
            boundScenario: boundScenario.artifact,
            boundPath: boundScenario.absolutePath,
            surface: surface.artifact,
            surfacePath: surface.absolutePath,
            hasUnbound: boundScenario.artifact.steps.some((step) => step.binding.kind === 'unbound'),
          } satisfies CompileSnapshot;
        });
    const surfaceEntry = yield* Effect.succeed(
      catalog.interpretationSurfaces.find((entry) => entry.artifact.payload.adoId === source.adoId),
    ).pipe(Effect.filterOrFail(
      (entry): entry is NonNullable<typeof entry> => entry != null,
      () => new TesseractError('missing-surface', `Missing interpretation surface for ${source.adoId}`),
    ));
    const latestRun = latestRunForScenario(catalog, source.adoId);
    const proposalBundle = latestProposalBundle(catalog, source.adoId);
    const inboxItems = operatorInboxItemsForScenario(buildOperatorInboxItems(catalog), source.adoId);
    const projectionInput = createScenarioProjectionInput({
      adoId: source.adoId,
      boundScenario: source.boundScenario,
      surface: surfaceEntry.artifact,
      latestRun,
      proposalBundle,
      catalog,
    });
    // Governance gate: classify the bound scenario using phantom brands.
    // Approved/ReviewRequired emit normally; Blocked forces test.skip().
    const artifacts: EmitArtifacts = foldGovernance(source.boundScenario, {
      approved: (approved) => renderApprovedEmitArtifacts(
        options.paths, approved, surfaceEntry.artifact,
        latestRun, proposalBundle, inboxItems, projectionInput,
      ),
      reviewRequired: (reviewRequired) => renderReviewRequiredEmitArtifacts(
        options.paths, reviewRequired, surfaceEntry.artifact,
        latestRun, proposalBundle, inboxItems, projectionInput,
      ),
      blocked: (blocked) => renderBlockedEmitArtifacts(
        options.paths, blocked, surfaceEntry.artifact,
        latestRun, proposalBundle, inboxItems, projectionInput,
      ),
    });
    const inputFingerprints: ProjectionInputFingerprint[] = [
      fingerprintProjectionArtifact('bound', relativeProjectPath(options.paths, source.boundPath), source.boundScenario),
      fingerprintProjectionArtifact('task', relativeProjectPath(options.paths, source.surfacePath), source.surface),
      ...(latestRun ? [fingerprintProjectionArtifact('run', relativeProjectPath(options.paths, catalog.runRecords.find((entry) => entry.artifact.runId === latestRun.runId)?.absolutePath ?? ''), latestRun)] : []),
      ...(catalog.interfaceGraph ? [fingerprintProjectionArtifact('interface-graph', catalog.interfaceGraph.artifactPath, catalog.interfaceGraph.artifact)] : []),
      ...(catalog.selectorCanon ? [fingerprintProjectionArtifact('selector-canon', catalog.selectorCanon.artifactPath, catalog.selectorCanon.artifact)] : []),
      ...(catalog.learningManifest ? [fingerprintProjectionArtifact('learning-manifest', catalog.learningManifest.artifactPath, catalog.learningManifest.artifact)] : []),
      ...catalog.improvementRuns
        .flatMap((entry) => entry.artifact.iterations.some((iteration) => iteration.scenarioIds.includes(source.adoId)) ? [fingerprintProjectionArtifact('improvement-run', entry.artifactPath, entry.artifact)] : []),
      ...catalog.agentSessions
        .flatMap((entry) => entry.artifact.scenarioIds.includes(source.adoId) ? [fingerprintProjectionArtifact('agent-session', entry.artifactPath, entry.artifact)] : []),
      fingerprintProjectionArtifact(
        'proposal-bundle',
        relativeProjectPath(options.paths, catalog.proposalBundles.find((entry) => entry.artifact.runId === artifacts.proposalBundle.runId)?.absolutePath ?? artifacts.proposalsPath),
        artifacts.proposalBundle,
      ),
    ].filter((entry) => entry.path.length > 0);
    const outputFingerprint = emitOutputFingerprint(artifacts);

    return yield* runIncrementalStage<
      Omit<EmitScenarioResult, 'incremental'>,
      EmitScenarioResult,
      EmitScenarioResult,
      TesseractError,
      FileSystem
    >({
      name: 'emit',
      manifestPath: artifacts.manifestPath,
      inputFingerprints,
      outputFingerprint,
      verifyPersistedOutput: () => readPersistedEmitOutputState(artifacts),
      persist: () => Effect.gen(function* () {
        yield* Effect.all([
          fs.writeText(artifacts.outputPath, artifacts.rendered.code),
          fs.writeJson(artifacts.tracePath, artifacts.traceArtifact),
          fs.writeText(artifacts.reviewPath, artifacts.reviewText),
          fs.writeJson(artifacts.proposalsPath, artifacts.proposalBundle),
        ], { concurrency: 'unbounded' });
        return {
          result: {
            outputPath: artifacts.outputPath,
            tracePath: artifacts.tracePath,
            reviewPath: artifacts.reviewPath,
            proposalsPath: artifacts.proposalsPath,
            lifecycle: artifacts.rendered.lifecycle,
          },
          outputFingerprint,
          rewritten: [
            relativeProjectPath(options.paths, artifacts.outputPath),
            relativeProjectPath(options.paths, artifacts.tracePath),
            relativeProjectPath(options.paths, artifacts.reviewPath),
            relativeProjectPath(options.paths, artifacts.proposalsPath),
            relativeProjectPath(options.paths, artifacts.manifestPath),
          ],
        };
      }),
      withCacheHit: (incremental): EmitProjectionResult => ({
        outputPath: artifacts.outputPath,
        tracePath: artifacts.tracePath,
        reviewPath: artifacts.reviewPath,
        proposalsPath: artifacts.proposalsPath,
        lifecycle: artifacts.rendered.lifecycle,
        incremental,
      }),
      withCacheMiss: (built, incremental): EmitProjectionResult => ({
        ...built,
        incremental,
      }),
    });
  }).pipe(Effect.withSpan('emit-scenario'));
}
