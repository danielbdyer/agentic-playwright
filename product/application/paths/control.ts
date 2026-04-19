import { resolvePathWithinRoot } from './shared';
import type { ProjectPaths } from './types';

export function datasetControlPath(paths: ProjectPaths, name: string): string {
  return resolvePathWithinRoot(paths.control.datasetsDir, `${name}.dataset.yaml`, 'name');
}

export function benchmarkDefinitionPath(paths: ProjectPaths, name: string): string {
  return resolvePathWithinRoot(paths.intent.benchmarksDir, `${name}.benchmark.yaml`, 'name');
}

export function resolutionControlPath(paths: ProjectPaths, name: string): string {
  return resolvePathWithinRoot(paths.control.resolutionControlsDir, `${name}.resolution.yaml`, 'name');
}

export function runbookPath(paths: ProjectPaths, name: string): string {
  return resolvePathWithinRoot(paths.control.runbooksDir, `${name}.runbook.yaml`, 'name');
}
