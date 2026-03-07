import path from 'path';
import YAML from 'yaml';
import { Effect } from 'effect';
import { sha256, stableStringify } from '../domain/hash';
import { validateScenario, validateScreenElements, validateScreenPostures, validateSurfaceGraph } from '../domain/validation';
import { renderGeneratedKnowledgeModule } from '../domain/typegen';
import { walkFiles } from './artifacts';
import { trySync } from './effect';
import { generatedKnowledgePath, ProjectPaths, relativeProjectPath } from './paths';
import { FileSystem } from './ports';

function toSortedUnique(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

type FingerprintKind = 'surface' | 'elements' | 'postures' | 'scenario';

interface InputFingerprint {
  kind: FingerprintKind;
  path: string;
  fingerprint: string;
}

interface GeneratedTypesManifest {
  version: 1;
  projection: 'types';
  inputSetFingerprint: string;
  outputFingerprint: string;
  inputs: InputFingerprint[];
}

type TypesCacheInvalidationReason = 'missing-output' | 'invalid-output';

function generatedTypesManifestPath(paths: ProjectPaths): string {
  return path.join(paths.generatedTypesDir, 'tesseract-knowledge.metadata.json');
}

function fingerprintArtifact(kind: FingerprintKind, artifactPath: string, artifact: unknown): InputFingerprint {
  return {
    kind,
    path: artifactPath,
    fingerprint: `sha256:${sha256(stableStringify(artifact))}`,
  };
}

function sortFingerprints(values: InputFingerprint[]): InputFingerprint[] {
  return [...values].sort((left, right) => {
    const kindOrder = left.kind.localeCompare(right.kind);
    if (kindOrder !== 0) {
      return kindOrder;
    }
    return left.path.localeCompare(right.path);
  });
}

function computeInputSetFingerprint(inputs: InputFingerprint[]): string {
  return `sha256:${sha256(stableStringify(sortFingerprints(inputs)))}`;
}

function parseTypesManifest(value: unknown): GeneratedTypesManifest | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const maybe = value as Partial<GeneratedTypesManifest>;
  if (maybe.version !== 1 || maybe.projection !== 'types' || typeof maybe.inputSetFingerprint !== 'string' || typeof maybe.outputFingerprint !== 'string') {
    return null;
  }
  if (!Array.isArray(maybe.inputs)) {
    return null;
  }
  for (const input of maybe.inputs) {
    if (!input || typeof input !== 'object') {
      return null;
    }
    const entry = input as Partial<InputFingerprint>;
    if ((entry.kind !== 'surface' && entry.kind !== 'elements' && entry.kind !== 'postures' && entry.kind !== 'scenario') || typeof entry.path !== 'string' || typeof entry.fingerprint !== 'string') {
      return null;
    }
  }
  return {
    version: 1,
    projection: 'types',
    inputSetFingerprint: maybe.inputSetFingerprint,
    outputFingerprint: maybe.outputFingerprint,
    inputs: sortFingerprints(maybe.inputs as InputFingerprint[]),
  };
}

export function generateTypes(options: { paths: ProjectPaths }) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const inputFingerprints: InputFingerprint[] = [];
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
      const artifactPath = relativeProjectPath(options.paths, filePath);
      inputFingerprints.push(fingerprintArtifact('surface', artifactPath, graph));
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
      const artifactPath = relativeProjectPath(options.paths, filePath);
      inputFingerprints.push(fingerprintArtifact('elements', artifactPath, elements));
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
      const artifactPath = relativeProjectPath(options.paths, filePath);
      inputFingerprints.push(fingerprintArtifact('postures', artifactPath, postures));
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
      const artifactPath = relativeProjectPath(options.paths, filePath);
      inputFingerprints.push(fingerprintArtifact('scenario', artifactPath, scenario));
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

    const inputs = sortFingerprints(inputFingerprints);
    const inputSetFingerprint = computeInputSetFingerprint(inputs);
    const outputFingerprint = `sha256:${sha256(moduleText)}`;
    const outputPath = generatedKnowledgePath(options.paths);
    const metadataPath = generatedTypesManifestPath(options.paths);

    const previousManifest = (yield* fs.exists(metadataPath))
      ? parseTypesManifest(yield* fs.readJson(metadataPath))
      : null;
    const changedInputs = inputs
      .filter((entry) => previousManifest?.inputs.find((candidate) => candidate.kind === entry.kind && candidate.path === entry.path)?.fingerprint !== entry.fingerprint)
      .map((entry) => `${entry.kind}:${entry.path}`);
    const hasRemovedInputs = (previousManifest?.inputs ?? []).some(
      (entry) => !inputs.some((candidate) => candidate.kind === entry.kind && candidate.path === entry.path),
    );

    let cacheInvalidationReason: TypesCacheInvalidationReason | null = null;
    if (previousManifest && previousManifest.inputSetFingerprint === inputSetFingerprint && previousManifest.outputFingerprint === outputFingerprint) {
      const outputExists = yield* fs.exists(outputPath);
      if (!outputExists) {
        cacheInvalidationReason = 'missing-output';
      } else {
        const persistedModuleText = yield* fs.readText(outputPath);
        const persistedOutputFingerprint = `sha256:${sha256(persistedModuleText)}`;
        if (persistedOutputFingerprint !== outputFingerprint) {
          cacheInvalidationReason = 'invalid-output';
        }
      }

      if (cacheInvalidationReason === null) {
        return {
          outputPath,
          screens: screensList,
          fixtures: toSortedUnique(fixtureIds),
          snapshots: toSortedUnique(snapshotTemplates),
          incremental: {
            status: 'cache-hit' as const,
            inputSetFingerprint,
            outputFingerprint,
            changedInputs,
            removedInputs: hasRemovedInputs,
            rewritten: [] as string[],
          },
        };
      }
    }

    yield* fs.writeText(outputPath, moduleText);
    const manifest: GeneratedTypesManifest = {
      version: 1,
      projection: 'types',
      inputSetFingerprint,
      outputFingerprint,
      inputs,
    };
    yield* fs.writeJson(metadataPath, manifest);

    return {
      outputPath,
      screens: screensList,
      fixtures: toSortedUnique(fixtureIds),
      snapshots: toSortedUnique(snapshotTemplates),
      incremental: {
        status: 'cache-miss' as const,
        inputSetFingerprint,
        outputFingerprint,
        cacheInvalidationReason,
        changedInputs,
        removedInputs: hasRemovedInputs,
        rewritten: [
          relativeProjectPath(options.paths, outputPath),
          relativeProjectPath(options.paths, metadataPath),
        ],
      },
    };
  });
}
