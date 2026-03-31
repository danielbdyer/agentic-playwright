import { Effect } from 'effect';
import { sha256, stableStringify } from '../domain/hash';
import { knowledgePaths } from '../domain/ids';
import type {
  ArtifactConfidenceRecord,
  ConfidenceOverlayCatalog,
  GroundedStep,
  TrustPolicyArtifactType,
} from '../domain/types';
import { loadWorkspaceCatalog, type WorkspaceCatalog } from './catalog';
import { Dashboard } from './ports';
import { dashboardEvent } from '../domain/types/intervention-context';
import type { ProjectPaths } from './paths';
import { relativeProjectPath } from './paths';
import { FileSystem } from './ports';
import { compareStrings, uniqueSorted } from '../domain/collections';

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

function stepTaskForRunStep(catalog: WorkspaceCatalog, runAdoId: string, stepIndex: number): GroundedStep | null {
  return catalog.interpretationSurfaces
    .find((entry) => entry.artifact.payload.adoId === runAdoId)
    ?.artifact.payload.steps.find((step) => step.index === stepIndex) ?? null;
}

interface AggregateRecord {
  readonly artifactType: TrustPolicyArtifactType;
  readonly artifactPath: string;
  readonly screen: ArtifactConfidenceRecord['screen'];
  readonly element: ArtifactConfidenceRecord['element'];
  readonly posture: ArtifactConfidenceRecord['posture'];
  readonly snapshotTemplate: ArtifactConfidenceRecord['snapshotTemplate'];
  readonly successCount: number;
  readonly failureCount: number;
  readonly learnedAliases: ReadonlySet<string>;
  readonly lastSuccessAt: string | null;
  readonly lastFailureAt: string | null;
  readonly runIds: ReadonlySet<string>;
  readonly sourceArtifactPaths: ReadonlySet<string>;
}

interface AggregateContribution {
  readonly artifactType: TrustPolicyArtifactType;
  readonly artifactPath: string;
  readonly screen: ArtifactConfidenceRecord['screen'];
  readonly element: ArtifactConfidenceRecord['element'];
  readonly posture: ArtifactConfidenceRecord['posture'];
  readonly snapshotTemplate: ArtifactConfidenceRecord['snapshotTemplate'];
  readonly learnedAliases: readonly string[];
  readonly runId: string;
  readonly runArtifactPath: string;
  readonly runAt: string;
  readonly success: boolean;
}

function contributionId(c: AggregateContribution): string {
  return confidenceRecordId({
    artifactType: c.artifactType,
    artifactPath: c.artifactPath,
    screen: c.screen ?? null,
    element: c.element ?? null,
    posture: c.posture ?? null,
    snapshotTemplate: c.snapshotTemplate ?? null,
  });
}

function emptyAggregate(c: AggregateContribution): AggregateRecord {
  return {
    artifactType: c.artifactType,
    artifactPath: c.artifactPath,
    screen: c.screen ?? null,
    element: c.element ?? null,
    posture: c.posture ?? null,
    snapshotTemplate: c.snapshotTemplate ?? null,
    successCount: 0,
    failureCount: 0,
    learnedAliases: new Set<string>(),
    lastSuccessAt: null,
    lastFailureAt: null,
    runIds: new Set<string>(),
    sourceArtifactPaths: new Set<string>(),
  };
}

function mergeContribution(acc: AggregateRecord, c: AggregateContribution): AggregateRecord {
  return {
    ...acc,
    successCount: acc.successCount + (c.success ? 1 : 0),
    failureCount: acc.failureCount + (c.success ? 0 : 1),
    lastSuccessAt: c.success ? c.runAt : acc.lastSuccessAt,
    lastFailureAt: c.success ? acc.lastFailureAt : c.runAt,
    learnedAliases: new Set([...acc.learnedAliases, ...c.learnedAliases]),
    runIds: new Set([...acc.runIds, c.runId]),
    sourceArtifactPaths: new Set([...acc.sourceArtifactPaths, c.runArtifactPath]),
  };
}

function stepContributions(
  catalog: WorkspaceCatalog,
  runEntry: WorkspaceCatalog['runRecords'][number],
  step: WorkspaceCatalog['runRecords'][number]['artifact']['steps'][number],
): readonly AggregateContribution[] {
  const taskStep = stepTaskForRunStep(catalog, runEntry.artifact.adoId, step.stepIndex);
  const learnedAliases = uniqueSorted([
    taskStep?.normalizedIntent ?? '',
    taskStep?.actionText ?? '',
    taskStep?.expectedText ?? '',
  ].filter((value) => value.length > 0));
  const success = step.execution.execution.status === 'ok' && step.interpretation.kind !== 'needs-human';
  const target = 'target' in step.interpretation ? step.interpretation.target : null;
  if (!target?.screen) {
    return [];
  }

  const base = { learnedAliases, runId: runEntry.artifact.runId, runArtifactPath: runEntry.artifactPath, runAt: step.execution.runAt, success };
  return [
    ...(target.element ? [{
      artifactType: 'elements' as const, artifactPath: knowledgePaths.elements(target.screen),
      screen: target.screen, element: target.element, posture: null, snapshotTemplate: null, ...base,
    }] : []),
    ...step.interpretation.supplementRefs.flatMap((ref): AggregateContribution[] => {
      if (ref.endsWith('.hints.yaml')) {
        return [{ artifactType: 'hints' as const, artifactPath: ref,
          screen: target.screen, element: target.element ?? null, posture: null, snapshotTemplate: null, ...base }];
      }
      if (ref.includes('/patterns/')) {
        return [{ artifactType: 'patterns' as const, artifactPath: ref,
          screen: target.screen, element: target.element ?? null, posture: null, snapshotTemplate: null, ...base }];
      }
      return [];
    }),
    ...(target.posture && target.element ? [{
      artifactType: 'postures' as const, artifactPath: knowledgePaths.postures(target.screen),
      screen: target.screen, element: target.element, posture: target.posture, snapshotTemplate: null, ...base,
    }] : []),
    ...(target.snapshot_template ? [{
      artifactType: 'snapshot' as const, artifactPath: snapshotArtifactPath(target.snapshot_template),
      screen: target.screen, element: target.element ?? null, posture: null, snapshotTemplate: target.snapshot_template, ...base,
    }] : []),
  ];
}

function contributeRunArtifacts(catalog: WorkspaceCatalog): Map<string, AggregateRecord> {
  const contributions = catalog.runRecords.flatMap((runEntry) =>
    runEntry.artifact.steps.flatMap((step) => stepContributions(catalog, runEntry, step)),
  );
  const aggregates = new Map<string, AggregateRecord>();
  for (const contribution of contributions) {
    const id = contributionId(contribution);
    const existing = aggregates.get(id) ?? emptyAggregate(contribution);
    aggregates.set(id, mergeContribution(existing, contribution));
  }
  return aggregates;
}

function scoreForAggregate(successCount: number, failureCount: number, evidenceCount: number, approvalCount: number = 0): number {
  const score = 0.35
    + successCount * 0.2
    + Math.min(evidenceCount, 3) * 0.05
    + Math.min(approvalCount, 2) * 0.15
    - failureCount * 0.25;
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
      const approvalCount = catalog.approvalReceipts.filter((r) => r.artifact.targetPath === aggregate.artifactPath).length;
      const score = scoreForAggregate(aggregate.successCount, aggregate.failureCount, evidence.count, approvalCount);
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
    .sort((left, right) => compareStrings(left.id, right.id));

  const summary = records.reduce(
    (acc, record) => ({
      total: acc.total + 1,
      approvedEquivalentCount: acc.approvedEquivalentCount + (record.status === 'approved-equivalent' ? 1 : 0),
      needsReviewCount: acc.needsReviewCount + (record.status === 'needs-review' ? 1 : 0),
    }),
    { total: 0, approvedEquivalentCount: 0, needsReviewCount: 0 },
  );

  return {
    kind: 'confidence-overlay-catalog',
    version: 1,
    generatedAt: new Date().toISOString(),
    records,
    summary,
  };
}

export function projectConfidenceOverlayCatalog(options: {
  paths: ProjectPaths;
  catalog?: WorkspaceCatalog;
  previousCatalog?: ConfidenceOverlayCatalog | undefined;
}) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const catalog = options.catalog ?? (yield* loadWorkspaceCatalog({ paths: options.paths }));
    const confidenceCatalog = buildConfidenceOverlayCatalog(catalog);
    yield* fs.writeJson(options.paths.confidenceIndexPath, confidenceCatalog);

    // Layer 2: Emit confidence-crossed events for artifacts that changed status
    if (options.previousCatalog) {
      const dashboard = yield* Dashboard;
      const prevMap = new Map(options.previousCatalog.records.map((r) => [r.id, r]));
      for (const record of confidenceCatalog.records) {
        const prev = prevMap.get(record.id);
        if (prev && prev.status !== record.status) {
          yield* dashboard.emit(dashboardEvent('confidence-crossed', {
            artifactId: record.id,
            screen: record.screen,
            element: record.element,
            previousStatus: prev.status,
            newStatus: record.status,
            score: record.score,
            threshold: record.threshold,
          }));
        }
      }
    }

    return {
      confidenceCatalog,
      outputPath: options.paths.confidenceIndexPath,
      relativeOutputPath: relativeProjectPath(options.paths, options.paths.confidenceIndexPath),
    };
  });
}
