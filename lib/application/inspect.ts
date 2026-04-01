import { Effect } from 'effect';
import YAML from 'yaml';
import type { AdoId, ScreenId } from '../domain/kernel/identity';
import { validateAdoSnapshot, validateScenario } from '../domain/validation';
import { loadWorkspaceCatalog } from './catalog';
import { trySync } from './effect';
import { AdoSource, FileSystem } from './ports';
import type { ProjectPaths } from './paths';
import {
  boundPath,
  elementsPath,
  generatedKnowledgePath,
  generatedProposalsPath,
  generatedReviewPath,
  generatedSpecPath,
  generatedTracePath,
  hintsPath,
  posturesPath,
  taskPacketPath,
  scenarioPath,
  snapshotPath,
  surfacePath,
} from './paths';

export function describeScenarioPaths(options: { adoId: AdoId; paths: ProjectPaths }) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const ado = yield* AdoSource;
    const catalog = yield* loadWorkspaceCatalog({ paths: options.paths, scope: 'post-run' });
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
    const surface = catalog.interpretationSurfaces.find((entry) => entry.artifact.payload.adoId === options.adoId)?.artifact ?? null;

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
    if (referencedScreens.size === 0 && surface) {
      for (const screen of surface.payload.knowledgeSlice.screenRefs) {
        referencedScreens.add(screen);
      }
    }
    if (referencedScreens.size === 0) {
      for (const screen of Object.keys(catalog.screenBundles) as ScreenId[]) {
        referencedScreens.add(screen);
      }
    }

    return {
      adoId: options.adoId,
      roots: {
        adoSync: options.paths.adoSyncDir,
        benchmarks: options.paths.benchmarksDir,
        scenarios: options.paths.scenariosDir,
        controls: options.paths.controlsDir,
        knowledge: options.paths.knowledgeDir,
        generated: options.paths.generatedDir,
        interface: options.paths.interfaceDir,
        bound: options.paths.boundDir,
        tasks: options.paths.tasksDir,
        runs: options.paths.runsDir,
        sessions: options.paths.sessionsDir,
        learning: options.paths.learningDir,
        evidence: options.paths.evidenceDir,
        confidence: options.paths.confidenceDir,
        graph: options.paths.graphDir,
        policy: options.paths.policyDir,
        approvals: options.paths.approvalsDir,
        inbox: options.paths.inboxDir,
        generatedTypes: options.paths.generatedTypesDir,
      },
      artifacts: {
        snapshot: syncedSnapshotPath,
        scenario: canonicalScenarioPath,
        bound: boundPath(options.paths, options.adoId),
        task: taskPacketPath(options.paths, options.adoId),
        generated: generatedSpecPath(options.paths, snapshot.suitePath, options.adoId),
        trace: generatedTracePath(options.paths, snapshot.suitePath, options.adoId),
        review: generatedReviewPath(options.paths, snapshot.suitePath, options.adoId),
        proposals: generatedProposalsPath(options.paths, snapshot.suitePath, options.adoId),
        interfaceGraph: options.paths.interfaceGraphIndexPath,
        selectorCanon: options.paths.selectorCanonPath,
        graph: options.paths.graphIndexPath,
        mcpCatalog: options.paths.mcpCatalogPath,
        confidence: options.paths.confidenceIndexPath,
        trustPolicy: options.paths.trustPolicyPath,
        inboxIndex: options.paths.inboxIndexPath,
        inboxReport: options.paths.inboxReportPath,
        generatedTypes: generatedKnowledgePath(options.paths),
        learningManifest: options.paths.learningManifestPath,
      },
      knowledge: [...referencedScreens].map((screen) => ({
        screen,
        surface: surfacePath(options.paths, screen),
        elements: elementsPath(options.paths, screen),
        postures: posturesPath(options.paths, screen),
        hints: hintsPath(options.paths, screen),
      })),
      supplements: {
        sharedPatterns: catalog.patternDocuments.map((entry) => entry.artifactPath),
      },
      controls: {
        datasets: catalog.datasets.map((entry) => entry.artifactPath),
        resolution: catalog.resolutionControls.map((entry) => entry.artifactPath),
        runbooks: catalog.runbooks.map((entry) => entry.artifactPath),
      },
      benchmarks: catalog.benchmarks.map((entry) => entry.artifactPath),
    };
  });
}
