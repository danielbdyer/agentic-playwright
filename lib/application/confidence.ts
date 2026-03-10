import { Effect } from 'effect';
import { sha256, stableStringify } from '../domain/hash';
import { knowledgePaths } from '../domain/ids';
import type {
  ArtifactConfidenceRecord,
  ConfidenceOverlayCatalog,
  ScenarioTaskPacket,
  TrustPolicyArtifactType,
} from '../domain/types';
import { loadWorkspaceCatalog, type WorkspaceCatalog } from './catalog';
import type { ProjectPaths } from './paths';
import { relativeProjectPath } from './paths';
import { FileSystem } from './ports';

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set([...values].filter((value) => value.length > 0))].sort((left, right) => left.localeCompare(right));
}

function round(value: number): number {
  return Number(value.toFixed(2));
}

function confidenceRecordId(input: {
  artifactType: TrustPolicyArtifactType;
  artifactPath: string;
  screen?: string | null;
  element?: string | null;
  posture?: string | null;
  snapshotTemplate?: string | null;
}): string {
  return `overlay-${sha256(stableStringify(input))}`;
}

function snapshotArtifactPath(snapshotTemplate: string): string {
  return snapshotTemplate.startsWith('knowledge/')
    ? snapshotTemplate
    : `knowledge/${snapshotTemplate.replace(/^\//, '')}`;
}

function evidenceCountForArtifact(catalog: WorkspaceCatalog, artifactPath: string, artifactType: TrustPolicyArtifactType): {
  count: number;
  evidenceIds: string[];
} {
  const matches = catalog.evidenceRecords.filter((entry) =>
    entry.artifact.evidence.proposal.file === artifactPath
    || entry.artifact.evidence.scope === artifactType,
  );
  return {
    count: matches.length,
    evidenceIds: matches.map((entry) => entry.artifactPath),
  };
}

function thresholdForArtifact(catalog: WorkspaceCatalog, artifactType: TrustPolicyArtifactType): number {
  return catalog.trustPolicy.artifact.artifactTypes[artifactType]?.minimumConfidence ?? 1;
}

function stepTaskForRunStep(catalog: WorkspaceCatalog, runAdoId: string, stepIndex: number): ScenarioTaskPacket['steps'][number] | null {
  return catalog.taskPackets
    .find((entry) => entry.artifact.adoId === runAdoId)
    ?.artifact.steps.find((step) => step.index === stepIndex) ?? null;
}

interface AggregateRecord {
  artifactType: TrustPolicyArtifactType;
  artifactPath: string;
  screen: ArtifactConfidenceRecord['screen'];
  element: ArtifactConfidenceRecord['element'];
  posture: ArtifactConfidenceRecord['posture'];
  snapshotTemplate: ArtifactConfidenceRecord['snapshotTemplate'];
  successCount: number;
  failureCount: number;
  learnedAliases: Set<string>;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  runIds: Set<string>;
  sourceArtifactPaths: Set<string>;
}

function upsertAggregate(
  aggregates: Map<string, AggregateRecord>,
  input: {
    artifactType: TrustPolicyArtifactType;
    artifactPath: string;
    screen?: ArtifactConfidenceRecord['screen'];
    element?: ArtifactConfidenceRecord['element'];
    posture?: ArtifactConfidenceRecord['posture'];
    snapshotTemplate?: ArtifactConfidenceRecord['snapshotTemplate'];
    learnedAliases: string[];
    runId: string;
    runArtifactPath: string;
    runAt: string;
    success: boolean;
  },
): void {
  const id = confidenceRecordId({
    artifactType: input.artifactType,
    artifactPath: input.artifactPath,
    screen: input.screen ?? null,
    element: input.element ?? null,
    posture: input.posture ?? null,
    snapshotTemplate: input.snapshotTemplate ?? null,
  });
  const existing = aggregates.get(id) ?? {
    artifactType: input.artifactType,
    artifactPath: input.artifactPath,
    screen: input.screen ?? null,
    element: input.element ?? null,
    posture: input.posture ?? null,
    snapshotTemplate: input.snapshotTemplate ?? null,
    successCount: 0,
    failureCount: 0,
    learnedAliases: new Set<string>(),
    lastSuccessAt: null,
    lastFailureAt: null,
    runIds: new Set<string>(),
    sourceArtifactPaths: new Set<string>(),
  };

  if (input.success) {
    existing.successCount += 1;
    existing.lastSuccessAt = input.runAt;
  } else {
    existing.failureCount += 1;
    existing.lastFailureAt = input.runAt;
  }
  for (const alias of input.learnedAliases) {
    existing.learnedAliases.add(alias);
  }
  existing.runIds.add(input.runId);
  existing.sourceArtifactPaths.add(input.runArtifactPath);
  aggregates.set(id, existing);
}

function contributeRunArtifacts(catalog: WorkspaceCatalog): Map<string, AggregateRecord> {
  const aggregates = new Map<string, AggregateRecord>();

  for (const runEntry of catalog.runRecords) {
    for (const step of runEntry.artifact.steps) {
      const taskStep = stepTaskForRunStep(catalog, runEntry.artifact.adoId, step.stepIndex);
      const learnedAliases = uniqueSorted([
        taskStep?.normalizedIntent ?? '',
        taskStep?.actionText ?? '',
        taskStep?.expectedText ?? '',
      ]);
      const success = step.execution.execution.status === 'ok' && step.interpretation.kind !== 'needs-human';
      const target = 'target' in step.interpretation ? step.interpretation.target : null;
      if (!target?.screen) {
        continue;
      }

      if (target.element) {
        upsertAggregate(aggregates, {
          artifactType: 'elements',
          artifactPath: knowledgePaths.elements(target.screen),
          screen: target.screen,
          element: target.element,
          posture: null,
          snapshotTemplate: null,
          learnedAliases,
          runId: runEntry.artifact.runId,
          runArtifactPath: runEntry.artifactPath,
          runAt: step.execution.runAt,
          success,
        });
      }

      for (const hintRef of step.interpretation.supplementRefs.filter((ref) => ref.endsWith('.hints.yaml'))) {
        upsertAggregate(aggregates, {
          artifactType: 'hints',
          artifactPath: hintRef,
          screen: target.screen,
          element: target.element ?? null,
          posture: null,
          snapshotTemplate: null,
          learnedAliases,
          runId: runEntry.artifact.runId,
          runArtifactPath: runEntry.artifactPath,
          runAt: step.execution.runAt,
          success,
        });
      }

      for (const patternRef of step.interpretation.supplementRefs.filter((ref) => ref.includes('/patterns/'))) {
        upsertAggregate(aggregates, {
          artifactType: 'patterns',
          artifactPath: patternRef,
          screen: target.screen,
          element: target.element ?? null,
          posture: null,
          snapshotTemplate: null,
          learnedAliases,
          runId: runEntry.artifact.runId,
          runArtifactPath: runEntry.artifactPath,
          runAt: step.execution.runAt,
          success,
        });
      }

      if (target.posture && target.element) {
        upsertAggregate(aggregates, {
          artifactType: 'postures',
          artifactPath: knowledgePaths.postures(target.screen),
          screen: target.screen,
          element: target.element,
          posture: target.posture,
          snapshotTemplate: null,
          learnedAliases,
          runId: runEntry.artifact.runId,
          runArtifactPath: runEntry.artifactPath,
          runAt: step.execution.runAt,
          success,
        });
      }

      if (target.snapshot_template) {
        upsertAggregate(aggregates, {
          artifactType: 'snapshot',
          artifactPath: snapshotArtifactPath(target.snapshot_template),
          screen: target.screen,
          element: target.element ?? null,
          posture: null,
          snapshotTemplate: target.snapshot_template,
          learnedAliases,
          runId: runEntry.artifact.runId,
          runArtifactPath: runEntry.artifactPath,
          runAt: step.execution.runAt,
          success,
        });
      }
    }
  }

  return aggregates;
}

function scoreForAggregate(successCount: number, failureCount: number, evidenceCount: number): number {
  const score = 0.35 + successCount * 0.2 + Math.min(evidenceCount, 3) * 0.05 - failureCount * 0.25;
  return Math.max(0, Math.min(0.99, round(score)));
}

function statusForRecord(score: number, threshold: number, failureCount: number): ArtifactConfidenceRecord['status'] {
  if (score >= threshold) {
    return 'approved-equivalent';
  }
  if (failureCount > 0) {
    return 'needs-review';
  }
  return 'learning';
}

export function buildConfidenceOverlayCatalog(catalog: WorkspaceCatalog): ConfidenceOverlayCatalog {
  const aggregates = contributeRunArtifacts(catalog);
  const records = [...aggregates.entries()]
    .map(([id, aggregate]) => {
      const evidence = evidenceCountForArtifact(catalog, aggregate.artifactPath, aggregate.artifactType);
      const threshold = thresholdForArtifact(catalog, aggregate.artifactType);
      const score = scoreForAggregate(aggregate.successCount, aggregate.failureCount, evidence.count);
      return {
        id,
        artifactType: aggregate.artifactType,
        artifactPath: aggregate.artifactPath,
        score,
        threshold,
        status: statusForRecord(score, threshold, aggregate.failureCount),
        successCount: aggregate.successCount,
        failureCount: aggregate.failureCount,
        evidenceCount: evidence.count,
        screen: aggregate.screen,
        element: aggregate.element,
        posture: aggregate.posture,
        snapshotTemplate: aggregate.snapshotTemplate,
        learnedAliases: uniqueSorted(aggregate.learnedAliases),
        lastSuccessAt: aggregate.lastSuccessAt,
        lastFailureAt: aggregate.lastFailureAt,
        lineage: {
          runIds: uniqueSorted(aggregate.runIds),
          evidenceIds: evidence.evidenceIds,
          sourceArtifactPaths: uniqueSorted(aggregate.sourceArtifactPaths),
        },
      } satisfies ArtifactConfidenceRecord;
    })
    .sort((left, right) => left.id.localeCompare(right.id));

  return {
    kind: 'confidence-overlay-catalog',
    version: 1,
    generatedAt: new Date().toISOString(),
    records,
    summary: {
      total: records.length,
      approvedEquivalentCount: records.filter((record) => record.status === 'approved-equivalent').length,
      needsReviewCount: records.filter((record) => record.status === 'needs-review').length,
    },
  };
}

export function projectConfidenceOverlayCatalog(options: { paths: ProjectPaths; catalog?: WorkspaceCatalog }) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const catalog = options.catalog ?? (yield* loadWorkspaceCatalog({ paths: options.paths }));
    const confidenceCatalog = buildConfidenceOverlayCatalog(catalog);
    yield* fs.writeJson(options.paths.confidenceIndexPath, confidenceCatalog);
    return {
      confidenceCatalog,
      outputPath: options.paths.confidenceIndexPath,
      relativeOutputPath: relativeProjectPath(options.paths, options.paths.confidenceIndexPath),
    };
  });
}
