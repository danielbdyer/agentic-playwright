import path from 'path';
import { Effect } from 'effect';
import { aggregateConfidence } from '../domain/status';
import type { AdoId } from '../domain/identity';
import { renderGeneratedSpecModule } from '../domain/spec-codegen';
import type { BoundScenario } from '../domain/types';
import { validateBoundScenario } from '../domain/validation';
import { trySync } from './effect';
import type { ProjectPaths } from './paths';
import { boundPath, generatedReviewPath, generatedSpecPath, generatedTracePath } from './paths';
import { FileSystem } from './ports';

function toPosix(value: string): string {
  return value.replace(/\\/g, '/');
}

function relativeModule(fromFile: string, toFile: string): string {
  const relative = toPosix(path.relative(path.dirname(fromFile), toFile));
  return relative.startsWith('.') ? relative : `./${relative}`;
}

function aggregateGovernance(boundScenario: BoundScenario): 'approved' | 'review-required' | 'blocked' {
  const states = [...new Set(boundScenario.steps.map((step) => step.binding.governance))];
  if (states.includes('blocked')) {
    return 'blocked';
  }
  if (states.includes('review-required')) {
    return 'review-required';
  }
  return 'approved';
}

function renderReview(trace: ReturnType<typeof createTraceArtifact>): string {
  const lines: string[] = [
    `# ${trace.title}`,
    '',
    `- ADO: ${trace.adoId}`,
    `- Revision: ${trace.revision}`,
    `- Confidence: ${trace.confidence}`,
    `- Governance: ${trace.governance}`,
    `- Lifecycle: ${trace.lifecycle}`,
    '',
  ];

  for (const step of trace.steps) {
    lines.push(`## Step ${step.index}`);
    lines.push('');
    lines.push(`- ADO: ${step.intent}`);
    lines.push(`- Normalized: ${step.normalizedIntent}`);
    lines.push(`- Action: ${step.action}`);
    lines.push(`- Confidence: ${step.confidence}`);
    lines.push(`- Governance: ${step.governance}`);
    lines.push(`- Rule: ${step.ruleId ?? 'none'}`);
    lines.push(`- Knowledge refs: ${step.knowledgeRefs.length > 0 ? step.knowledgeRefs.join(', ') : 'none'}`);
    lines.push(`- Supplements: ${step.supplementRefs.length > 0 ? step.supplementRefs.join(', ') : 'none'}`);
    lines.push(`- Review reasons: ${step.reviewReasons.length > 0 ? step.reviewReasons.join(', ') : 'none'}`);
    lines.push('');
    lines.push('```json');
    lines.push(JSON.stringify(step.program ?? null, null, 2));
    lines.push('```');
    lines.push('');
  }

  return `${lines.join('\n').trim()}\n`;
}

function createTraceArtifact(boundScenario: BoundScenario, lifecycle: 'normal' | 'fixme' | 'skip' | 'fail') {
  return {
    adoId: boundScenario.source.ado_id,
    revision: boundScenario.source.revision,
    title: boundScenario.metadata.title,
    suite: boundScenario.metadata.suite,
    confidence: aggregateConfidence(boundScenario.steps.map((step) => step.confidence)),
    governance: aggregateGovernance(boundScenario),
    lifecycle,
    diagnostics: boundScenario.diagnostics,
    steps: boundScenario.steps.map((step) => ({
      index: step.index,
      intent: step.intent,
      normalizedIntent: step.binding.normalizedIntent,
      action: step.action,
      confidence: step.confidence,
      governance: step.binding.governance,
      ruleId: step.binding.ruleId,
      knowledgeRefs: step.binding.knowledgeRefs,
      supplementRefs: step.binding.supplementRefs,
      reviewReasons: step.binding.reviewReasons,
      reasons: step.binding.reasons,
      evidenceIds: step.binding.evidenceIds,
      program: step.program ?? null,
    })),
  };
}

export function emitScenario(options: { adoId: AdoId; paths: ProjectPaths }) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const rawBound = yield* fs.readJson(boundPath(options.paths, options.adoId));
    const boundScenario = yield* trySync(
      () => validateBoundScenario(rawBound),
      'bound-scenario-validation-failed',
      `Bound scenario ${options.adoId} failed validation`,
    );

    const outputPath = generatedSpecPath(options.paths, boundScenario.metadata.suite, boundScenario.source.ado_id);
    const tracePath = generatedTracePath(options.paths, boundScenario.metadata.suite, boundScenario.source.ado_id);
    const reviewPath = generatedReviewPath(options.paths, boundScenario.metadata.suite, boundScenario.source.ado_id);
    const rendered = renderGeneratedSpecModule(boundScenario, {
      imports: {
        fixtures: relativeModule(outputPath, path.join(options.paths.rootDir, 'fixtures', 'index.ts')).replace(/\.ts$/, ''),
        program: relativeModule(outputPath, path.join(options.paths.rootDir, 'lib', 'runtime', 'program.ts')).replace(/\.ts$/, ''),
        interpreters: relativeModule(outputPath, path.join(options.paths.rootDir, 'lib', 'application', 'interpreters', 'execute.ts')).replace(/\.ts$/, ''),
      },
    });
    const traceArtifact = createTraceArtifact(boundScenario, rendered.lifecycle);

    yield* fs.writeText(outputPath, rendered.code);
    yield* fs.writeJson(tracePath, traceArtifact);
    yield* fs.writeText(reviewPath, renderReview(traceArtifact));
    return {
      outputPath,
      tracePath,
      reviewPath,
      lifecycle: rendered.lifecycle,
    };
  });
}
