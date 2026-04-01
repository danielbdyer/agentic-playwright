import path from 'path';
import { Effect } from 'effect';
import type { FileSystemPort, RuntimeScenarioStepResult } from '../ports';
import type { ProjectPaths } from '../paths';
import { relativeProjectPath } from '../paths';
import { resolveEffectConcurrency } from '../concurrency';
import type { AdoId } from '../../domain/kernel/identity';

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
    const concurrency = resolveEffectConcurrency({ ceiling: 20 });
    const nested = yield* Effect.forEach(input.stepResults, (step) =>
      Effect.forEach(
        step.interpretation.evidenceDrafts.map((draft, index) => ({ draft, index })),
        ({ draft, index }) => {
          const absolutePath = evidencePath(input.paths, input.adoId, input.runId, step.interpretation.stepIndex, index);
          return Effect.gen(function* () {
            yield* input.fs.writeJson(absolutePath, {
              evidence: { ...draft, timestamp: step.interpretation.runAt },
            });
            return {
              artifactPath: relativeProjectPath(input.paths, absolutePath),
              absolutePath,
              stepIndex: step.interpretation.stepIndex,
            } satisfies PersistedEvidenceArtifact;
          });
        },
        { concurrency: 'unbounded' },
      ), { concurrency });
    return { evidenceWrites: nested.flat() } satisfies PersistEvidenceResult;
  });
}
