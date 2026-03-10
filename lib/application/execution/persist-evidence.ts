import path from 'path';
import { Effect } from 'effect';
import type { FileSystemPort, RuntimeScenarioStepResult } from '../ports';
import type { ProjectPaths } from '../paths';
import { relativeProjectPath } from '../paths';
import type { AdoId } from '../../domain/identity';

function evidencePath(paths: ProjectPaths, adoId: AdoId, runId: string, stepIndex: number, evidenceIndex: number): string {
  return path.join(paths.evidenceDir, 'runs', `${adoId}`, runId, `step-${stepIndex}-${evidenceIndex}.json`);
}

export interface PersistedEvidenceArtifact {
  artifactPath: string;
  absolutePath: string;
  stepIndex: number;
}

export interface PersistEvidenceResult {
  evidenceWrites: PersistedEvidenceArtifact[];
}

export function persistEvidence(input: {
  fs: FileSystemPort;
  paths: ProjectPaths;
  adoId: AdoId;
  runId: string;
  stepResults: RuntimeScenarioStepResult[];
}) {
  return Effect.gen(function* () {
    const evidenceWrites: PersistedEvidenceArtifact[] = [];

    for (const step of input.stepResults) {
      for (const [index, draft] of step.interpretation.evidenceDrafts.entries()) {
        const absolutePath = evidencePath(input.paths, input.adoId, input.runId, step.interpretation.stepIndex, index);
        yield* input.fs.writeJson(absolutePath, {
          evidence: {
            ...draft,
            timestamp: step.interpretation.runAt,
          },
        });
        evidenceWrites.push({
          artifactPath: relativeProjectPath(input.paths, absolutePath),
          absolutePath,
          stepIndex: step.interpretation.stepIndex,
        });
      }
    }

    return { evidenceWrites } satisfies PersistEvidenceResult;
  });
}
