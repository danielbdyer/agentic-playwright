/**
 * Interface fuzzer for drift events.
 *
 * Generates mutated copies of knowledge files that simulate real-world UI drift:
 * alias drift (renamed elements), phrasing drift (novel step text), structure drift
 * (added/removed elements). Each mutation is a tagged, replayable DriftEvent.
 *
 * Uses deterministic seeded RNG for reproducibility.
 */

import { Effect } from 'effect';
import { FileSystem } from '../ports';
import type { ProjectPaths } from '../paths';
import { createSeededRng, pick } from '../../domain/random';

// ─── Drift Event Types ───

export interface DriftEvent {
  readonly id: string;
  readonly kind: 'alias-drift' | 'structure-drift' | 'phrasing-drift';
  readonly screen: string;
  readonly element: string | null;
  readonly description: string;
  readonly seed: string;
}

export interface DriftManifest {
  readonly kind: 'drift-manifest';
  readonly version: 1;
  readonly seed: string;
  readonly events: readonly DriftEvent[];
  readonly generatedAt: string;
}

// ─── Alias Drift: Rename element aliases ───

const ALIAS_MUTATIONS: readonly string[] = [
  'field', 'control', 'box', 'input area', 'entry', 'selector', 'picker',
  'action', 'trigger', 'command', 'widget', 'component',
];

function mutateAlias(original: string, rng: () => number): string {
  const words = original.split(/\s+/);
  const mutation = pick(ALIAS_MUTATIONS, rng);
  return rng() < 0.5
    ? `${words[0]} ${mutation}`
    : `${mutation} ${words.slice(-1)[0]}`;
}

// ─── Structure Drift: Add synthetic elements ───

const SYNTHETIC_ELEMENTS: readonly string[] = [
  'filterDropdown', 'sortToggle', 'exportButton', 'helpLink',
  'notificationBanner', 'breadcrumbNav', 'statusIndicator', 'refreshButton',
];

const SYNTHETIC_WIDGETS: readonly string[] = [
  'os-input', 'os-button', 'os-region', 'os-table',
];

// ─── Public API ───

export interface GenerateDriftOptions {
  readonly paths: ProjectPaths;
  readonly seed: string;
  readonly driftCount: number;
}

export interface GenerateDriftResult {
  readonly manifest: DriftManifest;
  readonly manifestPath: string;
  readonly modifiedFiles: readonly string[];
}

export function generateDriftVariants(options: GenerateDriftOptions) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const rng = createSeededRng(options.seed);
    // Read existing hints files
    const hintsDir = `${options.paths.rootDir}/knowledge/screens`;
    const hintsFiles = yield* fs.listDir(hintsDir);
    const hintsPaths = hintsFiles.filter((fileName) => fileName.endsWith('.hints.yaml'));

    type DriftAcc = {
      readonly events: readonly DriftEvent[];
      readonly modifiedFiles: readonly string[];
    };

    const driftStep = (
      iteration: number,
      acc: DriftAcc,
    ): Effect.Effect<DriftAcc, unknown, FileSystem> =>
      Effect.gen(function* () {
        if (iteration >= options.driftCount) return acc;
        const i = iteration;
        const driftKind = pick(['alias-drift', 'structure-drift', 'phrasing-drift'] as const, rng);
        const hintsFile: string = pick(hintsPaths, rng);
        const screenId = hintsFile.replace('.hints.yaml', '');

        if (driftKind === 'alias-drift') {
          // Read current hints and mutate an alias
          const fullPath = `${hintsDir}/${hintsFile}`;
          const content = yield* fs.readText(fullPath);
          const lines = content.split('\n');

          // Find alias lines and mutate one
          const aliasLineIndexes = lines
            .flatMap((line, idx) => line.trim().startsWith('- ') && !line.includes('screen') ? [idx] : []);

          if (aliasLineIndexes.length > 0) {
            const targetIdx = pick(aliasLineIndexes, rng);
            const original = lines[targetIdx]!.trim().replace('- ', '');
            const mutated = mutateAlias(original, rng);
            const indent = lines[targetIdx]!.match(/^\s*/)?.[0] ?? '      ';
            // Add the mutated alias as a new line after the original
            const updatedLines = [...lines.slice(0, targetIdx + 1), `${indent}- ${mutated}`, ...lines.slice(targetIdx + 1)];
            yield* fs.writeText(fullPath, updatedLines.join('\n'));

            return yield* driftStep(i + 1, {
              events: [...acc.events, {
                id: `drift-${options.seed}-${i}`,
                kind: 'alias-drift',
                screen: screenId,
                element: null,
                description: `Added mutated alias "${mutated}" near "${original}" in ${screenId}`,
                seed: options.seed,
              }],
              modifiedFiles: [...acc.modifiedFiles, fullPath],
            });
          }
          return yield* driftStep(i + 1, acc);
        } else if (driftKind === 'structure-drift') {
          // Add a synthetic element to the elements file
          const elementsPath = `${hintsDir}/${screenId}.elements.yaml`;
          const content = yield* fs.readText(elementsPath);
          const newElement = pick(SYNTHETIC_ELEMENTS, rng);
          const newWidget = pick(SYNTHETIC_WIDGETS, rng);

          // Check if element already exists
          if (!content.includes(`${newElement}:`)) {
            const addition = [
              `  ${newElement}:`,
              `    role: generic`,
              `    name: ${newElement.replace(/([A-Z])/g, ' $1').trim()}`,
              `    testId: ${newElement.replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, '')}`,
              `    surface: synthetic-surface`,
              `    widget: ${newWidget}`,
              `    required: false`,
            ].join('\n');

            yield* fs.writeText(elementsPath, content + addition + '\n');

            // Also add hints for the new element
            const hintsContent = yield* fs.readText(`${hintsDir}/${screenId}.hints.yaml`);
            const hintAddition = [
              `  ${newElement}:`,
              `    aliases:`,
              `      - ${newElement.replace(/([A-Z])/g, ' $1').trim().toLowerCase()}`,
            ].join('\n');

            yield* fs.writeText(`${hintsDir}/${screenId}.hints.yaml`, hintsContent + hintAddition + '\n');

            return yield* driftStep(i + 1, {
              events: [...acc.events, {
                id: `drift-${options.seed}-${i}`,
                kind: 'structure-drift',
                screen: screenId,
                element: newElement,
                description: `Added synthetic element ${newElement} (${newWidget}) to ${screenId}`,
                seed: options.seed,
              }],
              modifiedFiles: [...acc.modifiedFiles, elementsPath, `${hintsDir}/${screenId}.hints.yaml`],
            });
          }
          return yield* driftStep(i + 1, acc);
        } else {
          // Phrasing drift: recorded as event but modifies scenario phrasings (handled by scenario generator)
          return yield* driftStep(i + 1, {
            ...acc,
            events: [...acc.events, {
              id: `drift-${options.seed}-${i}`,
              kind: 'phrasing-drift',
              screen: screenId,
              element: null,
              description: `Novel phrasing patterns generated for ${screenId}`,
              seed: options.seed,
            }],
          });
        }
      });

    const { events, modifiedFiles } = yield* driftStep(0, { events: [], modifiedFiles: [] });

    const manifest: DriftManifest = {
      kind: 'drift-manifest',
      version: 1,
      seed: options.seed,
      events,
      generatedAt: new Date().toISOString(),
    };

    const manifestDir = `${options.paths.rootDir}/.tesseract/drift`;
    yield* fs.ensureDir(manifestDir);
    const manifestPath = `${manifestDir}/drift-manifest-${options.seed}.json`;
    yield* fs.writeJson(manifestPath, manifest);

    return {
      manifest,
      manifestPath,
      modifiedFiles,
    } satisfies GenerateDriftResult;
  });
}
