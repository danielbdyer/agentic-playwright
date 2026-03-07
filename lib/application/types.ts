import path from 'path';
import YAML from 'yaml';
import { Effect } from 'effect';
import { walkFiles } from './artifacts';
import { FileSystem } from './ports';
import { generatedKnowledgePath, ProjectPaths } from './paths';
import { trySync } from './effect';
import { validateScenario, validateScreenElements, validateScreenPostures, validateSurfaceGraph } from '../domain/validation';
import { renderGeneratedKnowledgeModule } from '../domain/typegen';

function toSortedUnique(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

export function generateTypes(options: { paths: ProjectPaths }) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const surfaceFiles = (yield* walkFiles(fs, options.paths.surfacesDir)).filter((filePath) => filePath.endsWith('.surface.yaml'));
    const screens = new Set<string>();
    const surfacesByScreen: Record<string, string[]> = {};
    const elementsByScreen: Record<string, string[]> = {};
    const posturesByScreen: Record<string, Record<string, string[]>> = {};
    const snapshotTemplates: string[] = [];
    const fixtureIds: string[] = [];

    for (const filePath of surfaceFiles) {
      const raw = yield* fs.readText(filePath);
      const graph = yield* trySync(
        () => validateSurfaceGraph(YAML.parse(raw)),
        'surface-validation-failed',
        `Surface graph ${filePath} failed validation`,
      );
      screens.add(graph.screen);
      surfacesByScreen[graph.screen] = Object.keys(graph.surfaces).sort((left, right) => left.localeCompare(right));
      for (const section of Object.values(graph.sections)) {
        if (section.snapshot) {
          snapshotTemplates.push(section.snapshot);
        }
      }
    }

    const knowledgeScreenFiles = (yield* walkFiles(fs, path.join(options.paths.knowledgeDir, 'screens'))).filter((filePath) => filePath.endsWith('.elements.yaml'));
    for (const filePath of knowledgeScreenFiles) {
      const raw = yield* fs.readText(filePath);
      const elements = yield* trySync(
        () => validateScreenElements(YAML.parse(raw)),
        'elements-validation-failed',
        `Elements ${filePath} failed validation`,
      );
      screens.add(elements.screen);
      elementsByScreen[elements.screen] = Object.keys(elements.elements).sort((left, right) => left.localeCompare(right));
    }

    const postureFiles = (yield* walkFiles(fs, path.join(options.paths.knowledgeDir, 'screens'))).filter((filePath) => filePath.endsWith('.postures.yaml'));
    for (const filePath of postureFiles) {
      const raw = yield* fs.readText(filePath);
      const postures = yield* trySync(
        () => validateScreenPostures(YAML.parse(raw)),
        'postures-validation-failed',
        `Postures ${filePath} failed validation`,
      );
      screens.add(postures.screen);
      posturesByScreen[postures.screen] = Object.fromEntries(
        Object.entries(postures.postures)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([elementId, entries]) => [elementId, Object.keys(entries).sort((left, right) => left.localeCompare(right))]),
      );
    }

    const scenarioFiles = (yield* walkFiles(fs, options.paths.scenariosDir)).filter((filePath) => filePath.endsWith('.scenario.yaml'));
    for (const filePath of scenarioFiles) {
      const raw = yield* fs.readText(filePath);
      const scenario = yield* trySync(
        () => validateScenario(YAML.parse(raw)),
        'scenario-validation-failed',
        `Scenario ${filePath} failed validation`,
      );
      for (const precondition of scenario.preconditions) {
        fixtureIds.push(precondition.fixture);
      }
      for (const step of scenario.steps) {
        if (step.snapshot_template) {
          snapshotTemplates.push(step.snapshot_template);
        }
      }
    }

    const screensList = [...screens].sort((left, right) => left.localeCompare(right));
    for (const screen of screensList) {
      surfacesByScreen[screen] = surfacesByScreen[screen] ?? [];
      elementsByScreen[screen] = elementsByScreen[screen] ?? [];
      posturesByScreen[screen] = posturesByScreen[screen] ?? {};
    }

    const moduleText = renderGeneratedKnowledgeModule({
      screens: screensList,
      surfaces: surfacesByScreen,
      elements: elementsByScreen,
      postures: posturesByScreen,
      snapshots: toSortedUnique(snapshotTemplates),
      fixtures: toSortedUnique(fixtureIds),
    });

    const outputPath = generatedKnowledgePath(options.paths);
    yield* fs.writeText(outputPath, moduleText);
    return {
      outputPath,
      screens: screensList,
      fixtures: toSortedUnique(fixtureIds),
      snapshots: toSortedUnique(snapshotTemplates),
    };
  });
}

