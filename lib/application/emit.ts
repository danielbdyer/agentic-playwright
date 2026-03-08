import path from 'path';
import { Effect } from 'effect';
import { explainBoundScenario } from '../domain/scenario/explanation';
import type { AdoId } from '../domain/identity';
import { renderGeneratedSpecModule } from '../domain/spec-codegen';
import type { BoundScenario, ScenarioExplanation } from '../domain/types';
import { validateBoundScenario } from '../domain/validation';
import type { CompileSnapshot } from './compile-snapshot';
import { trySync } from './effect';
import type { ProjectPaths } from './paths';
import {
  boundPath,
  emitManifestPath,
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
import { runProjection } from './projections/runner';

function toPosix(value: string): string {
  return value.replace(/\\/g, '/');
}

function relativeModule(fromFile: string, toFile: string): string {
  const relative = toPosix(path.relative(path.dirname(fromFile), toFile));
  return relative.startsWith('.') ? relative : `./${relative}`;
}

function renderReview(trace: ScenarioExplanation): string {
  const lines: string[] = [
    `# ${trace.title}`,
    '',
    `- ADO: ${trace.adoId}`,
    `- Revision: ${trace.revision}`,
    `- Confidence: ${trace.confidence}`,
    `- Governance: ${trace.governance}`,
    `- Lifecycle: ${trace.lifecycle}`,
    '',
    '## Bottlenecks',
    '',
    `- Step count: ${trace.summary.stepCount}`,
    `- Step provenance: compiler-derived=${trace.summary.provenanceKinds['compiler-derived']}, hint-backed=${trace.summary.provenanceKinds['hint-backed']}, pattern-backed=${trace.summary.provenanceKinds['pattern-backed']}, unbound=${trace.summary.provenanceKinds.unbound}`,
    `- Governance counts: approved=${trace.summary.governance.approved}, review-required=${trace.summary.governance['review-required']}, blocked=${trace.summary.governance.blocked}`,
    `- Unresolved gaps: ${trace.summary.unresolvedReasons.length > 0 ? trace.summary.unresolvedReasons.map((entry) => `${entry.reason} (${entry.count})`).join(', ') : 'none'}`,
    '',
  ];

  for (const step of trace.steps) {
    lines.push(`## Step ${step.index}`);
    lines.push('');
    lines.push(`- ADO: ${step.intent}`);
    lines.push(`- Normalized: ${step.normalizedIntent}`);
    lines.push(`- Action: ${step.action}`);
    lines.push(`- Confidence: ${step.confidence}`);
    lines.push(`- Provenance kind: ${step.provenanceKind}`);
    lines.push(`- Governance: ${step.governance}`);
    lines.push(`- Rule: ${step.ruleId ?? 'none'}`);
    lines.push(`- Knowledge refs: ${step.knowledgeRefs.length > 0 ? step.knowledgeRefs.join(', ') : 'none'}`);
    lines.push(`- Supplements: ${step.supplementRefs.length > 0 ? step.supplementRefs.join(', ') : 'none'}`);
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

function renderEmitArtifacts(paths: ProjectPaths, boundScenario: BoundScenario) {
  const outputPath = generatedSpecPath(paths, boundScenario.metadata.suite, boundScenario.source.ado_id);
  const tracePath = generatedTracePath(paths, boundScenario.metadata.suite, boundScenario.source.ado_id);
  const reviewPath = generatedReviewPath(paths, boundScenario.metadata.suite, boundScenario.source.ado_id);
  const manifestPath = emitManifestPath(paths, boundScenario.metadata.suite, boundScenario.source.ado_id);
  const rendered = renderGeneratedSpecModule(boundScenario, {
    imports: {
      fixtures: relativeModule(outputPath, path.join(paths.rootDir, 'fixtures', 'index.ts')).replace(/\.ts$/, ''),
      program: relativeModule(outputPath, path.join(paths.rootDir, 'lib', 'runtime', 'program.ts')).replace(/\.ts$/, ''),
      interpreters: relativeModule(outputPath, path.join(paths.rootDir, 'lib', 'application', 'interpreters', 'execute.ts')).replace(/\.ts$/, ''),
    },
  });
  const traceArtifact = explainBoundScenario(boundScenario, rendered.lifecycle);
  const reviewText = renderReview(traceArtifact);

  return {
    outputPath,
    tracePath,
    reviewPath,
    manifestPath,
    rendered,
    traceArtifact,
    reviewText,
  };
}

function loadBoundScenario(options: { adoId: AdoId; paths: ProjectPaths }) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const targetPath = boundPath(options.paths, options.adoId);
    const rawBound = yield* fs.readJson(targetPath);
    const boundScenario = yield* trySync(
      () => validateBoundScenario(rawBound),
      'bound-scenario-validation-failed',
      `Bound scenario ${options.adoId} failed validation`,
    );
    return {
      boundScenario,
      boundPath: targetPath,
    };
  });
}

function emitOutputFingerprint(artifacts: ReturnType<typeof renderEmitArtifacts>): string {
  return fingerprintProjectionOutput({
    spec: artifacts.rendered.code,
    trace: artifacts.traceArtifact,
    review: artifacts.reviewText,
  });
}

function readPersistedEmitOutputState(
  artifacts: ReturnType<typeof renderEmitArtifacts>,
) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const specExists = yield* fs.exists(artifacts.outputPath);
    const traceExists = yield* fs.exists(artifacts.tracePath);
    const reviewExists = yield* fs.exists(artifacts.reviewPath);
    if (!specExists || !traceExists || !reviewExists) {
      return { status: 'missing-output' as const };
    }

    const persistedTrace = yield* Effect.either(fs.readJson(artifacts.tracePath));
    if (persistedTrace._tag === 'Left') {
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
      }),
    };
  });
}

export function emitScenario(
  options: { adoId: AdoId; paths: ProjectPaths } | { paths: ProjectPaths; compileSnapshot: CompileSnapshot },
) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const source = 'compileSnapshot' in options
      ? {
          boundScenario: options.compileSnapshot.boundScenario,
          boundPath: options.compileSnapshot.boundPath,
        }
      : (yield* loadBoundScenario(options));
    const artifacts = renderEmitArtifacts(options.paths, source.boundScenario);
    const inputFingerprints: ProjectionInputFingerprint[] = [
      fingerprintProjectionArtifact('bound', relativeProjectPath(options.paths, source.boundPath), source.boundScenario),
    ];
    const outputFingerprint = emitOutputFingerprint(artifacts);

    return yield* runProjection({
      projection: 'emit',
      manifestPath: artifacts.manifestPath,
      inputFingerprints,
      outputFingerprint,
      verifyPersistedOutput: () => readPersistedEmitOutputState(artifacts),
      buildAndWrite: () => Effect.gen(function* () {
        yield* fs.writeText(artifacts.outputPath, artifacts.rendered.code);
        yield* fs.writeJson(artifacts.tracePath, artifacts.traceArtifact);
        yield* fs.writeText(artifacts.reviewPath, artifacts.reviewText);
        return {
          result: {
            outputPath: artifacts.outputPath,
            tracePath: artifacts.tracePath,
            reviewPath: artifacts.reviewPath,
            lifecycle: artifacts.rendered.lifecycle,
          },
          outputFingerprint,
          rewritten: [
            relativeProjectPath(options.paths, artifacts.outputPath),
            relativeProjectPath(options.paths, artifacts.tracePath),
            relativeProjectPath(options.paths, artifacts.reviewPath),
            relativeProjectPath(options.paths, artifacts.manifestPath),
          ],
        };
      }),
      withCacheHit: (incremental) => ({
        outputPath: artifacts.outputPath,
        tracePath: artifacts.tracePath,
        reviewPath: artifacts.reviewPath,
        lifecycle: artifacts.rendered.lifecycle,
        incremental,
      }),
      withCacheMiss: (built, incremental) => ({
        ...built,
        incremental,
      }),
    });
  });
}
