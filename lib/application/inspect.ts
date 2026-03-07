import { Effect } from 'effect';
import YAML from 'yaml';
import { AdoId, ScreenId } from '../domain/identity';
import { validateAdoSnapshot, validateScenario } from '../domain/validation';
import { AdoSource, FileSystem } from './ports';
import {
  boundPath,
  elementsPath,
  generatedKnowledgePath,
  generatedSpecPath,
  posturesPath,
  ProjectPaths,
  relativeProjectPath,
  scenarioPath,
  snapshotPath,
  surfacePath,
} from './paths';
import { trySync } from './effect';

export function describeScenarioPaths(options: { adoId: AdoId; paths: ProjectPaths }) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const ado = yield* AdoSource;
    const syncedSnapshotPath = snapshotPath(options.paths, options.adoId);
    const syncedExists = yield* fs.exists(syncedSnapshotPath);
    const rawSnapshot = syncedExists ? yield* fs.readJson(syncedSnapshotPath) : yield* ado.loadSnapshot(options.adoId);
    const snapshot = yield* trySync(
      () => validateAdoSnapshot(rawSnapshot),
      'snapshot-validation-failed',
      `Snapshot ${options.adoId} failed validation`,
    );

    const canonicalScenarioPath = scenarioPath(options.paths, snapshot.suitePath, options.adoId);
    const scenarioExists = yield* fs.exists(canonicalScenarioPath);
    const referencedScreens = new Set<ScreenId>();

    if (scenarioExists) {
      const scenarioText = yield* fs.readText(canonicalScenarioPath);
      const scenario = yield* trySync(
        () => validateScenario(YAML.parse(scenarioText)),
        'scenario-validation-failed',
        `Scenario ${options.adoId} failed validation`,
      );
      for (const step of scenario.steps) {
        if (step.screen) {
          referencedScreens.add(step.screen);
        }
      }
    }

    return {
      adoId: options.adoId,
      roots: {
        adoSync: options.paths.adoSyncDir,
        scenarios: options.paths.scenariosDir,
        knowledge: options.paths.knowledgeDir,
        generated: options.paths.generatedDir,
        bound: options.paths.boundDir,
        evidence: options.paths.evidenceDir,
        graph: options.paths.graphDir,
        generatedTypes: options.paths.generatedTypesDir,
      },
      artifacts: {
        snapshot: syncedSnapshotPath,
        scenario: canonicalScenarioPath,
        bound: boundPath(options.paths, options.adoId),
        generated: generatedSpecPath(options.paths, snapshot.suitePath, options.adoId),
        graph: options.paths.graphIndexPath,
        mcpCatalog: options.paths.mcpCatalogPath,
        generatedTypes: generatedKnowledgePath(options.paths),
      },
      knowledge: [...referencedScreens].map((screen) => ({
        screen,
        surface: surfacePath(options.paths, screen),
        elements: elementsPath(options.paths, screen),
        postures: posturesPath(options.paths, screen),
      })),
    };
  });
}

