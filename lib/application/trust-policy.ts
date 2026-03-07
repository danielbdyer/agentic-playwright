import path from 'path';
import YAML from 'yaml';
import { Effect } from 'effect';
import { createTrustPolicyDiagnostic } from '../domain/diagnostics';
import { evaluateTrustPolicy } from '../domain/trust-policy';
import { AdoId, createScreenId } from '../domain/identity';
import { graphIds } from '../domain/ids';
import { EvidenceDescriptor, EvidenceRecord, ProposedChangeMetadata, TrustPolicy, TrustPolicyEvaluation } from '../domain/types';
import { validateTrustPolicy } from '../domain/validation';
import { trySync } from './effect';
import { ProjectPaths, relativeProjectPath } from './paths';
import { FileSystem } from './ports';
import { walkFiles } from './artifacts';

export interface LoadedEvidenceRecord {
  artifactPath: string;
  record: EvidenceRecord;
}

export function loadTrustPolicy(paths: ProjectPaths): Effect.Effect<TrustPolicy, Error, FileSystem> {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const raw = yield* fs.readText(paths.trustPolicyPath);
    return yield* trySync(
      () => validateTrustPolicy(YAML.parse(raw)),
      'trust-policy-validation-failed',
      `Trust policy ${paths.trustPolicyPath} failed validation`,
    );
  });
}

export function loadEvidenceRecords(paths: ProjectPaths): Effect.Effect<LoadedEvidenceRecord[], Error, FileSystem> {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const files = (yield* walkFiles(fs, paths.evidenceDir)).filter((filePath) => filePath.endsWith('.json'));
    const records: LoadedEvidenceRecord[] = [];

    for (const filePath of files) {
      const raw = (yield* fs.readJson(filePath)) as EvidenceRecord;
      records.push({
        artifactPath: relativeProjectPath(paths, filePath),
        record: raw,
      });
    }

    return records;
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
