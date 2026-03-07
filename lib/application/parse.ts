import { Effect } from 'effect';
import YAML from 'yaml';
import { createDiagnostic } from '../domain/diagnostics';
import { normalizeHtmlText } from '../domain/hash';
import {
  AdoId,
  createElementId,
  createFixtureId,
  createPostureId,
  createScreenId,
  createSnapshotTemplateId,
} from '../domain/identity';
import { Scenario, ScenarioStep } from '../domain/types';
import { validateAdoSnapshot } from '../domain/validation';
import { FileSystem } from './ports';
import { relativeProjectPath, ProjectPaths, scenarioPath, snapshotPath } from './paths';
import { trySync } from './effect';

const policySearchScreen = createScreenId('policy-search');
const policyNumberInput = createElementId('policyNumberInput');
const searchButton = createElementId('searchButton');
const resultsTable = createElementId('resultsTable');
const validPosture = createPostureId('valid');
const activePolicyNumber = '{{activePolicy.number}}';
const demoSessionFixture = createFixtureId('demoSession');
const activePolicyFixture = createFixtureId('activePolicy');
const resultsSnapshot = createSnapshotTemplateId('snapshots/policy-search/results-with-policy.yaml');

function deriveScenarioStep(intent: string, index: number): ScenarioStep {
  const normalizedIntent = intent.toLowerCase();

  if (normalizedIntent === 'navigate to policy search screen') {
    return {
      index,
      intent,
      action: 'navigate',
      screen: policySearchScreen,
      confidence: 'human',
    };
  }

  if (normalizedIntent === 'enter policy number in search field') {
    return {
      index,
      intent,
      action: 'input',
      screen: policySearchScreen,
      element: policyNumberInput,
      posture: validPosture,
      override: activePolicyNumber,
      confidence: 'human',
    };
  }

  if (normalizedIntent === 'click search button') {
    return {
      index,
      intent,
      action: 'click',
      screen: policySearchScreen,
      element: searchButton,
      confidence: 'human',
    };
  }

  if (normalizedIntent === 'verify search results show policy') {
    return {
      index,
      intent,
      action: 'assert-snapshot',
      screen: policySearchScreen,
      element: resultsTable,
      snapshot_template: resultsSnapshot,
      confidence: 'human',
    };
  }

  return {
    index,
    intent,
    action: 'custom',
    confidence: 'unbound',
  };
}

export function parseSnapshotToScenario(snapshot: ReturnType<typeof validateAdoSnapshot>): Scenario {
  const steps = snapshot.steps.map((step) => deriveScenarioStep(normalizeHtmlText(step.action), step.index));

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
      status: 'active',
      status_detail: null,
    },
    preconditions: [
      { fixture: demoSessionFixture },
      { fixture: activePolicyFixture },
    ],
    steps,
    postconditions: [],
  };
}

export function parseScenario(options: { adoId: AdoId; paths: ProjectPaths }) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const rawSnapshot = yield* fs.readJson(snapshotPath(options.paths, options.adoId));
    const snapshot = yield* trySync(
      () => validateAdoSnapshot(rawSnapshot),
      'snapshot-validation-failed',
      `Snapshot ${options.adoId} failed validation`,
    );
    const scenario = parseSnapshotToScenario(snapshot);
    const targetPath = scenarioPath(options.paths, snapshot.suitePath, snapshot.id);
    const serialized = YAML.stringify(scenario, { indent: 2 });
    yield* fs.writeText(targetPath, serialized);

    return {
      scenario,
      scenarioPath: targetPath,
      diagnostics: [
        createDiagnostic({
          code: 'scenario-parsed',
          severity: 'info',
          message: `Parsed scenario ${snapshot.id}`,
          adoId: snapshot.id,
          artifactPath: relativeProjectPath(options.paths, targetPath),
          provenance: {
            contentHash: snapshot.contentHash,
            sourceRevision: snapshot.revision,
            snapshotPath: relativeProjectPath(options.paths, snapshotPath(options.paths, snapshot.id)),
          },
        }),
      ],
    };
  });
}

