import path from 'path';
import { Effect } from 'effect';
import { explainBoundScenario } from '../domain/scenario/explanation';
import type { TesseractError } from '../domain/errors';
import type { AdoId } from '../domain/identity';
import { buildGroundedSpecFlow } from '../domain/grounded-flow';
import { renderReadableSpecModule } from '../domain/spec-codegen';
import type {
  BoundScenario,
  ProposalBundle,
  RunRecord,
  ScenarioInterpretationSurface,
  ScenarioProjectionInput,
} from '../domain/types';
import type { CompileSnapshot } from './compile-snapshot';
import { loadWorkspaceCatalog } from './catalog';
import { createProposalBundleEnvelope, createScenarioEnvelopeFingerprints, createScenarioEnvelopeIds } from './catalog/envelope';
import type { WorkspaceCatalog } from './catalog';
import { buildOperatorInboxItems, operatorInboxItemsForScenario } from './operator';
import type { ProjectPaths } from './paths';
import {
  emitManifestPath,
  generatedProposalsPath,
  generatedReviewPath,
  generatedSpecPath,
  generatedTracePath,
  relativeProjectPath,
} from './paths';
import { FileSystem } from './ports';
import {
  fingerprintProjectionArtifact,
  fingerprintProjectionOutput,
  type ProjectionInputFingerprint,
} from './projections/cache';
import { renderReview } from './projections/review';
import { type ProjectionIncremental } from './projections/runner';
import { runIncrementalStage } from './pipeline';

export interface EmitProjectionResult {
  outputPath: string;
  tracePath: string;
  reviewPath: string;
  proposalsPath: string;
  lifecycle: 'normal' | 'fixme' | 'skip' | 'fail';
  incremental: ProjectionIncremental;
}

export type EmitScenarioResult = EmitProjectionResult;

function toPosix(value: string): string {
  return value.replace(/\\/g, '/');
}

function relativeModule(fromFile: string, toFile: string): string {
  const relative = toPosix(path.relative(path.dirname(fromFile), toFile));
  return relative.startsWith('.') ? relative : `./${relative}`;
}

function latestRunForScenario(catalog: WorkspaceCatalog, adoId: AdoId): RunRecord | null {
  return catalog.runRecords
    .filter((entry) => entry.artifact.adoId === adoId)
    .sort((left, right) => right.artifact.completedAt.localeCompare(left.artifact.completedAt))[0]?.artifact ?? null;
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
    learningManifest: input.catalog.learningManifest?.artifact ?? null,
  };
}

function renderEmitArtifacts(
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
  const traceArtifact = explainBoundScenario(boundScenario, rendered.lifecycle, latestRun);
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
      governance: 'approved',
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

function emitOutputFingerprint(artifacts: ReturnType<typeof renderEmitArtifacts>): string {
  return fingerprintProjectionOutput({
    spec: artifacts.rendered.code,
    trace: artifacts.traceArtifact,
    review: artifacts.reviewText,
    proposals: artifacts.proposalBundle,
  });
}

function readPersistedEmitOutputState(artifacts: ReturnType<typeof renderEmitArtifacts>) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const specExists = yield* fs.exists(artifacts.outputPath);
    const traceExists = yield* fs.exists(artifacts.tracePath);
    const reviewExists = yield* fs.exists(artifacts.reviewPath);
    const proposalsExist = yield* fs.exists(artifacts.proposalsPath);
    if (!specExists || !traceExists || !reviewExists || !proposalsExist) {
      return { status: 'missing-output' as const };
    }

    const persistedTrace = yield* Effect.either(fs.readJson(artifacts.tracePath));
    const persistedProposals = yield* Effect.either(fs.readJson(artifacts.proposalsPath));
    if (persistedTrace._tag === 'Left' || persistedProposals._tag === 'Left') {
      return { status: 'invalid-output' as const };
    }

    const persistedSpec = yield* fs.readText(artifacts.outputPath);
    const persistedReview = yield* fs.readText(artifacts.reviewPath);
    return {
      status: 'ok' as const,
      outputFingerprint: fingerprintProjectionOutput({
        spec: persistedSpec,
        trace: persistedTrace.right,
        review: persistedReview,
        proposals: persistedProposals.right,
      }),
    };
  });
}

export function emitScenario(
  options: { adoId: AdoId; paths: ProjectPaths } | { paths: ProjectPaths; compileSnapshot: CompileSnapshot },
): Effect.Effect<EmitScenarioResult, unknown, unknown> {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const catalog = yield* loadWorkspaceCatalog({ paths: options.paths });
    const source = 'compileSnapshot' in options
      ? options.compileSnapshot
      : (() => {
          const scenario = catalog.scenarios.find((entry) => entry.artifact.source.ado_id === options.adoId);
          const boundScenario = catalog.boundScenarios.find((entry) => entry.artifact.source.ado_id === options.adoId);
          const surface = catalog.interpretationSurfaces.find((entry) => entry.artifact.payload.adoId === options.adoId);
          if (!scenario || !boundScenario || !surface) {
            throw new Error(`Missing scenario, bound scenario, or interpretation surface for ${options.adoId}`);
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
        })();
    const surfaceEntry = catalog.interpretationSurfaces.find((entry) => entry.artifact.payload.adoId === source.adoId);
    if (!surfaceEntry) {
      throw new Error(`Missing interpretation surface for ${source.adoId}`);
    }
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
    const artifacts = renderEmitArtifacts(
      options.paths,
      source.boundScenario,
      surfaceEntry.artifact,
      latestRun,
      proposalBundle,
      inboxItems,
      projectionInput,
    );
    const inputFingerprints: ProjectionInputFingerprint[] = [
      fingerprintProjectionArtifact('bound', relativeProjectPath(options.paths, source.boundPath), source.boundScenario),
      fingerprintProjectionArtifact('task', relativeProjectPath(options.paths, source.surfacePath), source.surface),
      ...(latestRun ? [fingerprintProjectionArtifact('run', relativeProjectPath(options.paths, catalog.runRecords.find((entry) => entry.artifact.runId === latestRun.runId)?.absolutePath ?? ''), latestRun)] : []),
      ...(catalog.interfaceGraph ? [fingerprintProjectionArtifact('interface-graph', catalog.interfaceGraph.artifactPath, catalog.interfaceGraph.artifact)] : []),
      ...(catalog.selectorCanon ? [fingerprintProjectionArtifact('selector-canon', catalog.selectorCanon.artifactPath, catalog.selectorCanon.artifact)] : []),
      ...(catalog.learningManifest ? [fingerprintProjectionArtifact('learning-manifest', catalog.learningManifest.artifactPath, catalog.learningManifest.artifact)] : []),
      ...catalog.agentSessions
        .filter((entry) => entry.artifact.scenarioIds.includes(source.adoId))
        .map((entry) => fingerprintProjectionArtifact('agent-session', entry.artifactPath, entry.artifact)),
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
        yield* fs.writeText(artifacts.outputPath, artifacts.rendered.code);
        yield* fs.writeJson(artifacts.tracePath, artifacts.traceArtifact);
        yield* fs.writeText(artifacts.reviewPath, artifacts.reviewText);
        yield* fs.writeJson(artifacts.proposalsPath, artifacts.proposalBundle);
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
  });
}
