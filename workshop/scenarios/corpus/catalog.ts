/**
 * Corpus catalog — the workshop's authored scenario set.
 *
 * Per docs/v2-scenario-corpus-plan.md §6.1, the corpus directory
 * sits under workshop/scenarios/corpus/. The catalog is a thin
 * indexer: it lists the corpus files, loads each, and exposes
 * lookups by scenario id.
 */

import { readdirSync } from 'node:fs';
import path from 'node:path';
import { loadScenarioFile, type LoadResult } from '../loader/parse-scenario-yaml';
import type { Scenario } from '../domain/scenario';

export interface CorpusCatalog {
  readonly scenarios: ReadonlyMap<string, Scenario>;
  readonly issues: readonly { readonly file: string; readonly issues: LoadResult['issues'] }[];
}

/** Load every `*.scenario.yaml` file under the corpus directory.
 *  Files with parse errors land in `issues`; their scenarios are
 *  omitted from the map (caller surfaces issues to the user). */
export function loadCorpusFromDirectory(corpusDir: string): CorpusCatalog {
  const map = new Map<string, Scenario>();
  const issues: CorpusCatalog['issues'][number][] = [];
  for (const entry of readdirSync(corpusDir)) {
    if (!entry.endsWith('.scenario.yaml')) continue;
    const filePath = path.join(corpusDir, entry);
    const result = loadScenarioFile(filePath);
    if (result.scenario !== null) {
      map.set(result.scenario.id, result.scenario);
    }
    if (result.issues.length > 0) {
      issues.push({ file: entry, issues: result.issues });
    }
  }
  return { scenarios: map, issues };
}

/** Default corpus path — relative to the repo root. */
export function defaultCorpusDir(rootDir: string): string {
  return path.join(rootDir, 'workshop', 'scenarios', 'corpus');
}

/** Lookup a scenario by id in the catalog. */
export function lookupScenario(catalog: CorpusCatalog, id: string): Scenario | null {
  return catalog.scenarios.get(id) ?? null;
}
