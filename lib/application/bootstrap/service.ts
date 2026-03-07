import path from 'path';
import YAML from 'yaml';
import { Effect } from 'effect';
import { BootstrapInput } from '../../domain/bootstrap';
import { sha256, stableStringify } from '../../domain/hash';
import { createAdoId, createElementId, createScreenId, createSectionId, createSurfaceId, createWidgetId } from '../../domain/identity';
import { AdoSnapshot, Confidence, Scenario, ScreenElements, ScreenPostures, SurfaceGraph } from '../../domain/types';
import { validateAdoSnapshot } from '../../domain/validation';
import { trySync } from '../effect';
import { AdoSource, FileSystem } from '../ports';
import { ProjectPaths, relativeProjectPath, scenarioPath } from '../paths';
import { validateBootstrapIngress, BootstrapCliInput } from './ingress';

interface BootstrapProvenance {
  artifactPath: string;
  sourceRevision: number;
  sourceHash: string;
  sourceTime: string;
  confidence: Confidence;
}

interface EmittedArtifact {
  artifactPath: string;
  provenance: BootstrapProvenance;
}

function defaultScreenId(baseUrl: string) {
  const parsed = new URL(baseUrl);
  const slug = parsed.pathname.split('/').filter(Boolean).join('-') || 'home';
  return createScreenId(slug.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase());
}

function scenarioSkeleton(snapshot: AdoSnapshot): Scenario {
  return {
    source: {
      ado_id: snapshot.id,
      revision: snapshot.revision,
      content_hash: snapshot.contentHash,
      synced_at: snapshot.syncedAt,
    },
    metadata: {
      title: snapshot.title,
      suite: snapshot.suitePath,
      tags: snapshot.tags,
      priority: snapshot.priority,
      status: 'draft',
      status_detail: 'bootstrap skeleton',
    },
    preconditions: [],
    steps: snapshot.steps.map((step) => ({
      index: step.index,
      intent: step.action,
      action: 'custom',
      confidence: 'unbound',
    })),
    postconditions: [],
  };
}

function screenElementsSeed(screen = createScreenId('home'), baseUrl = 'https://example.test'): ScreenElements {
  return {
    screen,
    url: baseUrl,
    elements: {
      root: {
        role: 'main',
        name: 'Root content',
        testId: null,
        cssFallback: 'main',
        surface: createSurfaceId('root-surface'),
        widget: createWidgetId('root-widget'),
      },
    },
  };
}

function screenPosturesSeed(screen = createScreenId('home')): ScreenPostures {
  return {
    screen,
    postures: {
      root: {
        default: {
          values: ['present'],
          effects: [],
        },
      },
    },
  };
}

function surfaceSeed(screen = createScreenId('home'), baseUrl = 'https://example.test'): SurfaceGraph {
  return {
    screen,
    url: baseUrl,
    sections: {
      root: {
        selector: 'main',
        kind: 'screen-root',
        surfaces: [createSurfaceId('root-surface')],
      },
    },
    surfaces: {
      'root-surface': {
        kind: 'screen-root',
        section: createSectionId('root'),
        selector: 'main',
        parents: [],
        children: [],
        elements: [createElementId('root')],
        assertions: ['structure'],
      },
    },
  };
}

function provenanceFor(snapshot: AdoSnapshot, artifactPath: string): BootstrapProvenance {
  return {
    artifactPath,
    sourceRevision: snapshot.revision,
    sourceHash: snapshot.contentHash,
    sourceTime: snapshot.syncedAt,
    confidence: 'agent-proposed',
  };
}

function projectMetadata(input: BootstrapInput, snapshots: AdoSnapshot[]) {
  const sourceRevision = snapshots.reduce((max, snapshot) => Math.max(max, snapshot.revision), 0);
  const orderedTimes = snapshots.map((snapshot) => snapshot.syncedAt).sort((left, right) => left.localeCompare(right));
  const sourceTime = orderedTimes.length > 0 ? orderedTimes[orderedTimes.length - 1] : 'unknown';
  const sourceHash = `sha256:${sha256(stableStringify(snapshots.map((snapshot) => ({ id: snapshot.id, hash: snapshot.contentHash }))))}`;

  return {
    version: 1,
    baseUrl: input.baseUrl,
    suites: input.suiteIds,
    authStrategy: input.authStrategy,
    crawlBounds: {
      depth: input.crawlBounds.depth,
      hostAllowlist: input.crawlBounds.hostAllowlist,
      timeoutMs: input.crawlBounds.timeoutMs,
      pageBudget: input.crawlBounds.pageBudget,
    },
    provenance: {
      sourceRevision,
      sourceHash,
      sourceTime,
      confidence: 'agent-proposed' as Confidence,
    },
  };
}

export function runBootstrapSaga(options: { input: BootstrapInput; paths: ProjectPaths }) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const ado = yield* AdoSource;
    const emittedArtifacts: EmittedArtifact[] = [];

    yield* fs.ensureDir(options.paths.adoSyncDir);
    yield* fs.ensureDir(options.paths.scenariosDir);
    yield* fs.ensureDir(path.join(options.paths.knowledgeDir, 'screens'));
    yield* fs.ensureDir(options.paths.surfacesDir);
    yield* fs.ensureDir(path.join(options.paths.evidenceDir, 'bootstrap'));

    const snapshots: AdoSnapshot[] = [];
    for (const suiteId of options.input.suiteIds) {
      const raw = yield* ado.loadSnapshot(createAdoId(suiteId));
      const snapshot = yield* trySync(
        () => validateAdoSnapshot(raw),
        'bootstrap-snapshot-validation-failed',
        `Bootstrap snapshot ${suiteId} failed validation`,
      );
      snapshots.push(snapshot);

      const scenario = scenarioSkeleton(snapshot);
      const scenarioTargetPath = scenarioPath(options.paths, snapshot.suitePath, snapshot.id);
      yield* fs.writeText(scenarioTargetPath, YAML.stringify(scenario, { indent: 2 }));

      const relativeScenarioPath = relativeProjectPath(options.paths, scenarioTargetPath);
      emittedArtifacts.push({
        artifactPath: relativeScenarioPath,
        provenance: provenanceFor(snapshot, relativeScenarioPath),
      });
    }

    const firstSnapshot = snapshots[0];
    if (!firstSnapshot) {
      return yield* Effect.fail(new Error('bootstrap requires at least one snapshot suite id'));
    }

    const screen = defaultScreenId(options.input.baseUrl);
    const elementsPath = path.join(options.paths.knowledgeDir, 'screens', `${screen}.elements.yaml`);
    const posturesPath = path.join(options.paths.knowledgeDir, 'screens', `${screen}.postures.yaml`);
    const surfacePath = path.join(options.paths.surfacesDir, `${screen}.surface.yaml`);

    yield* fs.writeText(elementsPath, YAML.stringify(screenElementsSeed(screen, options.input.baseUrl), { indent: 2 }));
    yield* fs.writeText(posturesPath, YAML.stringify(screenPosturesSeed(screen), { indent: 2 }));
    yield* fs.writeText(surfacePath, YAML.stringify(surfaceSeed(screen, options.input.baseUrl), { indent: 2 }));

    for (const absolutePath of [elementsPath, posturesPath, surfacePath]) {
      const relativePath = relativeProjectPath(options.paths, absolutePath);
      emittedArtifacts.push({
        artifactPath: relativePath,
        provenance: provenanceFor(firstSnapshot, relativePath),
      });
    }

    const metadataPath = path.join(options.paths.adoSyncDir, 'bootstrap', 'project-metadata.json');
    const metadata = projectMetadata(options.input, snapshots);
    yield* fs.writeJson(metadataPath, metadata);
    const relativeMetadataPath = relativeProjectPath(options.paths, metadataPath);
    emittedArtifacts.push({
      artifactPath: relativeMetadataPath,
      provenance: {
        artifactPath: relativeMetadataPath,
        sourceRevision: metadata.provenance.sourceRevision,
        sourceHash: metadata.provenance.sourceHash,
        sourceTime: metadata.provenance.sourceTime,
        confidence: metadata.provenance.confidence,
      },
    });

    const provenancePath = path.join(options.paths.evidenceDir, 'bootstrap', 'bootstrap.provenance.json');
    const ordered = [...emittedArtifacts].sort((left, right) => left.artifactPath.localeCompare(right.artifactPath));
    yield* fs.writeJson(provenancePath, { artifacts: ordered.map((entry) => entry.provenance) });

    return {
      metadataPath,
      provenancePath,
      artifacts: ordered.map((entry) => entry.artifactPath),
    };
  });
}

export function bootstrapProject(options: {
  paths: ProjectPaths;
  input: BootstrapCliInput;
}) {
  return Effect.gen(function* () {
    const validated = yield* trySync(
      () => validateBootstrapIngress(options.input),
      'bootstrap-ingress-validation-failed',
      'Bootstrap ingress validation failed',
    );

    return yield* runBootstrapSaga({ input: validated, paths: options.paths });
  });
}
