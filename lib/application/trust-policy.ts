import path from 'path';
import { Effect } from 'effect';
import { createTrustPolicyDiagnostic } from '../domain/diagnostics';
import { evaluateTrustPolicy } from '../domain/trust-policy';
import type { AdoId } from '../domain/identity';
import { createScreenId } from '../domain/identity';
import { graphIds } from '../domain/ids';
import type { EvidenceDescriptor, EvidenceRecord, ProposedChangeMetadata, TrustPolicy, TrustPolicyEvaluation } from '../domain/types';
import { loadWorkspaceCatalog, type WorkspaceCatalog } from './catalog';
import type { ProjectPaths } from './paths';
import type { FileSystem } from './ports';

export interface LoadedEvidenceRecord {
  artifactPath: string;
  record: EvidenceRecord;
}

export function loadTrustPolicy(paths: ProjectPaths, catalog?: WorkspaceCatalog) {
  return Effect.gen(function* () {
    const resolvedCatalog = catalog ?? (yield* loadWorkspaceCatalog({ paths, scope: 'compile' }));
    return resolvedCatalog.trustPolicy.artifact;
  });
}

export function loadEvidenceRecords(paths: ProjectPaths, catalog?: WorkspaceCatalog) {
  return Effect.gen(function* () {
    const resolvedCatalog = catalog ?? (yield* loadWorkspaceCatalog({ paths, scope: 'post-run' }));
    return resolvedCatalog.evidenceRecords.map((entry) => ({
      artifactPath: entry.artifactPath,
      record: entry.artifact,
    }));
  });
}

export function evidenceDescriptorsForArtifactType(records: LoadedEvidenceRecord[], artifactType: ProposedChangeMetadata['artifactType']): EvidenceDescriptor[] {
  return records
    .filter((entry) => entry.record.evidence.scope === artifactType)
    .map((entry) => ({ kind: entry.record.evidence.type }));
}

export function evaluateArtifactPolicy(input: {
  policy: TrustPolicy;
  proposedChange: ProposedChangeMetadata;
  evidence: LoadedEvidenceRecord[];
}): TrustPolicyEvaluation {
  return evaluateTrustPolicy({
    policy: input.policy,
    proposedChange: input.proposedChange,
    evidence: evidenceDescriptorsForArtifactType(input.evidence, input.proposedChange.artifactType),
  });
}

export function policyDecisionGraphTarget(input: {
  artifactType: ProposedChangeMetadata['artifactType'];
  artifactPath: string;
}): string {
  if (input.artifactPath.includes('/surfaces/') || input.artifactType === 'surface') {
    return graphIds.screen(createScreenId(path.basename(input.artifactPath).replace('.surface.yaml', '')));
  }

  if (input.artifactPath.includes('/screens/') && input.artifactPath.endsWith('.elements.yaml')) {
    return graphIds.screen(createScreenId(path.basename(input.artifactPath).replace('.elements.yaml', '')));
  }

  if (input.artifactPath.includes('/screens/') && input.artifactPath.endsWith('.postures.yaml')) {
    return graphIds.screen(createScreenId(path.basename(input.artifactPath).replace('.postures.yaml', '')));
  }

  if (input.artifactPath.includes('/screens/') && input.artifactPath.endsWith('.hints.yaml')) {
    return graphIds.screenHints(createScreenId(path.basename(input.artifactPath).replace('.hints.yaml', '')));
  }

  if (input.artifactPath.includes('/patterns/') || input.artifactType === 'patterns') {
    return graphIds.pattern(path.basename(input.artifactPath).replace(/\.[^.]+$/, ''));
  }

  if (input.artifactPath.includes('/snapshots/') || input.artifactType === 'snapshot') {
    return graphIds.snapshot.knowledge(input.artifactPath.replace(/^knowledge\//, ''));
  }

  return graphIds.evidence(input.artifactPath);
}

export function trustPolicyDiagnosticForScenario(input: {
  adoId: AdoId;
  artifactPath: string;
  evaluation: TrustPolicyEvaluation;
}) {
  return createTrustPolicyDiagnostic({
    adoId: input.adoId,
    artifactPath: input.artifactPath,
    decision: input.evaluation.decision,
    reasons: input.evaluation.reasons,
  });
}
