/**
 * Experiment Registry persistence — pure functions for loading, appending,
 * and saving experiment records.
 *
 * The registry persists to `.tesseract/benchmarks/experiments.json`.
 * All functions are pure (load/save take path strings, return data).
 */

import * as fs from 'fs';
import * as path from 'path';
import type { ExperimentRegistry, ExperimentRecord } from '../domain/types';
import { emptyExperimentRegistry, appendExperiment } from '../domain/types';

export function registryPath(rootDir: string): string {
  return path.join(rootDir, '.tesseract', 'benchmarks', 'experiments.json');
}

export function loadExperimentRegistry(rootDir: string): ExperimentRegistry {
  const filePath = registryPath(rootDir);
  if (!fs.existsSync(filePath)) {
    return emptyExperimentRegistry();
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as ExperimentRegistry;
}

export function saveExperimentRegistry(rootDir: string, registry: ExperimentRegistry): void {
  const filePath = registryPath(rootDir);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(registry, null, 2) + '\n');
}

export function recordExperiment(
  rootDir: string,
  record: ExperimentRecord,
): ExperimentRegistry {
  const registry = loadExperimentRegistry(rootDir);
  const updated = appendExperiment(registry, record);
  saveExperimentRegistry(rootDir, updated);
  return updated;
}
