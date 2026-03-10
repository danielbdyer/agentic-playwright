import path from 'path';
import { Effect } from 'effect';
import { explainBoundScenario } from '../domain/scenario/explanation';
import type { TesseractError } from '../domain/errors';
import type { AdoId } from '../domain/identity';
import { renderGeneratedSpecModule } from '../domain/spec-codegen';
import type { BoundScenario, ProposalBundle, RunRecord, ScenarioExplanation, ScenarioLifecycle, ScenarioTaskPacket } from '../domain/types';
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
import { runProjection, type ProjectionIncremental } from './projections/runner';

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

function renderReview(trace: ScenarioExplanation, proposalBundle: ProposalBundle | null, inboxItems: ReturnType<typeof operatorInboxItemsForScenario>): string {
  const lines: string[] = [
    `# ${trace.title}`,
    '',
    `- ADO: ${trace.adoId}`,
    `- Revision: ${trace.revision}`,
    `- Confidence: ${trace.confidence}`,
    `- Governance: ${trace.governance}`,
    `- Lifecycle: ${trace.lifecycle}`,
    `- Proposal bundle: ${proposalBundle ? proposalBundle.runId : 'none'}`,
    `- Inbox items: ${inboxItems.length > 0 ? inboxItems.map((item) => item.id).join(', ') : 'none'}`,
    `- Next commands: ${inboxItems.length > 0 ? inboxItems.flatMap((item) => item.nextCommands).filter((value, index, all) => all.indexOf(value) === index).join(' | ') : `tesseract workflow --ado-id ${trace.adoId} | tesseract inbox`}`,
    '',
    '## Pipeline',
    '',
    '- Preparation lane: scenario -> bound envelope -> task packet',
    '- Agent lane: task packet -> interpretation receipt -> execution receipt -> evidence -> proposals',
    '',
    '## Bottlenecks',
    '',
    `- Step count: ${trace.summary.stepCount}`,
    `- Step provenance: explicit=${trace.summary.provenanceKinds.explicit}, approved-knowledge=${trace.summary.provenanceKinds['approved-knowledge']}, live-exploration=${trace.summary.provenanceKinds['live-exploration']}, unresolved=${trace.summary.provenanceKinds.unresolved}`,
    `- Governance counts: approved=${trace.summary.governance.approved}, review-required=${trace.summary.governance['review-required']}, blocked=${trace.summary.governance.blocked}`,
    `- Knowledge hit rate: ${trace.summary.stageMetrics.knowledgeHitRate}`,
    `- Translation hit rate: ${trace.summary.stageMetrics.translationHitRate}`,
    `- Agentic hit rate: ${trace.summary.stageMetrics.agenticHitRate}`,
    `- Live exploration rate: ${trace.summary.stageMetrics.liveExplorationRate}`,
    `- Degraded locator rate: ${trace.summary.stageMetrics.degradedLocatorRate}`,
    `- Proposal count: ${trace.summary.stageMetrics.proposalCount}`,
    `- Review-required count: ${trace.summary.stageMetrics.reviewRequiredCount}`,
    `- Approved-equivalent rate: ${trace.summary.stageMetrics.approvedEquivalentRate}`,
    `- Unresolved gaps: ${trace.summary.unresolvedReasons.length > 0 ? trace.summary.unresolvedReasons.map((entry) => `${entry.reason} (${entry.count})`).join(', ') : 'none'}`,
    '',
  ];

  for (const step of trace.steps) {
    lines.push(`## Step ${step.index}`);
    lines.push('');
    lines.push(`- Action text: ${step.actionText}`);
    lines.push(`- Expected text: ${step.expectedText}`);
    lines.push(`- Normalized: ${step.normalizedIntent}`);
    lines.push(`- Preparation action: ${step.action}`);
    lines.push(`- Confidence: ${step.confidence}`);
    lines.push(`- Provenance kind: ${step.provenanceKind}`);
    lines.push(`- Binding kind: ${step.bindingKind}`);
    lines.push(`- Governance: ${step.governance}`);
    lines.push(`- Handshakes: ${step.handshakes.join(' -> ')}`);
    lines.push(`- Resolution mode: ${step.resolutionMode}`);
    lines.push(`- Winning concern: ${step.winningConcern}`);
    lines.push(`- Winning source: ${step.winningSource}`);
    lines.push(`- Runtime: ${step.runtime?.status ?? 'pending'}`);
    lines.push(`- Runtime widget contract: ${step.runtime?.widgetContract ?? 'none'}`);
    lines.push(`- Runtime locator: ${step.runtime?.locatorStrategy ?? 'none'}`);
    lines.push(`- Runtime locator rung: ${step.runtime?.locatorRung ?? 'none'}`);
    lines.push(`- Runtime degraded: ${step.runtime?.degraded ? 'yes' : 'no'}`);
    lines.push(`- Runtime duration ms: ${step.runtime?.durationMs ?? 0}`);
    lines.push(`- Runtime precondition failures: ${step.runtime?.preconditionFailures?.join(', ') || 'none'}`);
    lines.push(`- Knowledge refs: ${step.knowledgeRefs.length > 0 ? step.knowledgeRefs.join(', ') : 'none'}`);
    lines.push(`- Supplements: ${step.supplementRefs.length > 0 ? step.supplementRefs.join(', ') : 'none'}`);
    lines.push(`- Control refs: ${step.controlRefs.length > 0 ? step.controlRefs.join(', ') : 'none'}`);
    lines.push(`- Evidence refs: ${step.evidenceRefs.length > 0 ? step.evidenceRefs.join(', ') : 'none'}`);
    lines.push(`- Overlay refs: ${step.overlayRefs.length > 0 ? step.overlayRefs.join(', ') : 'none'}`);
    lines.push(`- Translation: ${step.translation ? step.translation.rationale : 'none'}`);
    lines.push(`- Exhaustion trail: ${step.runtime?.exhaustion?.map((entry) => `${entry.stage}:${entry.outcome}`).join(' -> ') || 'none'}`);
    lines.push(`- Unresolved gaps: ${step.unresolvedGaps.length > 0 ? step.unresolvedGaps.join(', ') : 'none'}`);
    lines.push(`- Review flags: ${step.reviewReasons.length > 0 ? step.reviewReasons.join(', ') : 'none'}`);
    lines.push('');
    lines.push('```json');
    lines.push(JSON.stringify(step.program ?? null, null, 2));
    lines.push('```');
    lines.push('');
  }

  return `${lines.join('\n').trim()}\n`;
}

function renderEmitArtifacts(
  paths: ProjectPaths,
  boundScenario: BoundScenario,
  taskPacket: ScenarioTaskPacket,
  latestRun: RunRecord | null,
  proposalBundle: ProposalBundle | null,
  inboxItems: ReturnType<typeof operatorInboxItemsForScenario>,
) {
  const outputPath = generatedSpecPath(paths, boundScenario.metadata.suite, boundScenario.source.ado_id);
  const tracePath = generatedTracePath(paths, boundScenario.metadata.suite, boundScenario.source.ado_id);
  const reviewPath = generatedReviewPath(paths, boundScenario.metadata.suite, boundScenario.source.ado_id);
  const proposalsPath = generatedProposalsPath(paths, boundScenario.metadata.suite, boundScenario.source.ado_id);
  const manifestPath = emitManifestPath(paths, boundScenario.metadata.suite, boundScenario.source.ado_id);
  const rendered = renderGeneratedSpecModule(boundScenario, taskPacket, {
    imports: {
      fixtures: relativeModule(outputPath, path.join(paths.rootDir, 'fixtures', 'index.ts')).replace(/\.ts$/, ''),
      runtime: relativeModule(outputPath, path.join(paths.rootDir, 'lib', 'runtime', 'scenario.ts')).replace(/\.ts$/, ''),
      environment: relativeModule(outputPath, path.join(paths.rootDir, 'lib', 'infrastructure', 'runtime', 'local-runtime-environment.ts')).replace(/\.ts$/, ''),
      workflow: relativeModule(outputPath, path.join(paths.rootDir, 'lib', 'generated', 'workflow-facade.ts')).replace(/\.ts$/, ''),
    },
  });
  const traceArtifact = explainBoundScenario(boundScenario, rendered.lifecycle, latestRun);
  const reviewText = renderReview(traceArtifact, proposalBundle, inboxItems);

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
          const taskPacket = catalog.taskPackets.find((entry) => entry.artifact.adoId === options.adoId);
          if (!scenario || !boundScenario || !taskPacket) {
            throw new Error(`Missing scenario, bound scenario, or task packet for ${options.adoId}`);
          }
          return {
            adoId: options.adoId,
            scenario: scenario.artifact,
            scenarioPath: scenario.absolutePath,
            boundScenario: boundScenario.artifact,
            boundPath: boundScenario.absolutePath,
            taskPacket: taskPacket.artifact,
            taskPath: taskPacket.absolutePath,
            hasUnbound: boundScenario.artifact.steps.some((step) => step.binding.kind === 'unbound'),
          } satisfies CompileSnapshot;
        })();
    const latestRun = latestRunForScenario(catalog, source.adoId);
    const proposalBundle = latestProposalBundle(catalog, source.adoId);
    const inboxItems = operatorInboxItemsForScenario(buildOperatorInboxItems(catalog), source.adoId);
    const artifacts = renderEmitArtifacts(options.paths, source.boundScenario, source.taskPacket, latestRun, proposalBundle, inboxItems);
    const inputFingerprints: ProjectionInputFingerprint[] = [
      fingerprintProjectionArtifact('bound', relativeProjectPath(options.paths, source.boundPath), source.boundScenario),
      fingerprintProjectionArtifact('task', relativeProjectPath(options.paths, source.taskPath), source.taskPacket),
      ...(latestRun ? [fingerprintProjectionArtifact('run', relativeProjectPath(options.paths, catalog.runRecords.find((entry) => entry.artifact.runId === latestRun.runId)?.absolutePath ?? ''), latestRun)] : []),
      fingerprintProjectionArtifact(
        'proposal-bundle',
        relativeProjectPath(options.paths, catalog.proposalBundles.find((entry) => entry.artifact.runId === artifacts.proposalBundle.runId)?.absolutePath ?? artifacts.proposalsPath),
        artifacts.proposalBundle,
      ),
    ].filter((entry) => entry.path.length > 0);
    const outputFingerprint = emitOutputFingerprint(artifacts);

    return yield* runProjection<
      Omit<EmitScenarioResult, 'incremental'>,
      EmitScenarioResult,
      EmitScenarioResult,
      TesseractError,
      FileSystem
    >({
      projection: 'emit',
      manifestPath: artifacts.manifestPath,
      inputFingerprints,
      outputFingerprint,
      verifyPersistedOutput: () => readPersistedEmitOutputState(artifacts),
      buildAndWrite: () => Effect.gen(function* () {
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
