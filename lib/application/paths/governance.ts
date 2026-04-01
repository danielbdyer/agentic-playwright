import path from 'path';
import type { AdoId } from '../../domain/kernel/identity';
import type { ProjectPaths } from './types';
import { resolvePathWithinRoot } from './shared';

export function generatedSpecPath(paths: ProjectPaths, suitePath: string, adoId: AdoId): string {
  return resolvePathWithinRoot(paths.governance.generatedDir, path.join(suitePath, `${adoId}.spec.ts`), 'suitePath');
}

export function generatedTracePath(paths: ProjectPaths, suitePath: string, adoId: AdoId): string {
  return resolvePathWithinRoot(paths.governance.generatedDir, path.join(suitePath, `${adoId}.trace.json`), 'suitePath');
}

export function generatedReviewPath(paths: ProjectPaths, suitePath: string, adoId: AdoId): string {
  return resolvePathWithinRoot(paths.governance.generatedDir, path.join(suitePath, `${adoId}.review.md`), 'suitePath');
}

export function generatedProposalsPath(paths: ProjectPaths, suitePath: string, adoId: AdoId): string {
  return resolvePathWithinRoot(paths.governance.generatedDir, path.join(suitePath, `${adoId}.proposals.json`), 'suitePath');
}

export function emitManifestPath(paths: ProjectPaths, suitePath: string, adoId: AdoId): string {
  return resolvePathWithinRoot(path.join(paths.engine.tesseractDir, 'emit'), path.join(suitePath, `${adoId}.manifest.json`), 'suitePath');
}

export function benchmarkScorecardJsonPath(paths: ProjectPaths, benchmarkName: string): string {
  return resolvePathWithinRoot(paths.governance.generatedDir, path.join('benchmarks', `${benchmarkName}.scorecard.json`), 'benchmarkName');
}

export function benchmarkScorecardMarkdownPath(paths: ProjectPaths, benchmarkName: string): string {
  return resolvePathWithinRoot(paths.governance.generatedDir, path.join('benchmarks', `${benchmarkName}.scorecard.md`), 'benchmarkName');
}

export function benchmarkVariantsSpecPath(paths: ProjectPaths, benchmarkName: string): string {
  return resolvePathWithinRoot(paths.governance.generatedDir, path.join('benchmarks', `${benchmarkName}.variants.spec.ts`), 'benchmarkName');
}

export function benchmarkVariantsTracePath(paths: ProjectPaths, benchmarkName: string): string {
  return resolvePathWithinRoot(paths.governance.generatedDir, path.join('benchmarks', `${benchmarkName}.variants.trace.json`), 'benchmarkName');
}

export function benchmarkVariantsReviewPath(paths: ProjectPaths, benchmarkName: string): string {
  return resolvePathWithinRoot(paths.governance.generatedDir, path.join('benchmarks', `${benchmarkName}.variants.review.md`), 'benchmarkName');
}
