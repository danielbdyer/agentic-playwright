import { Effect } from 'effect';
import YAML from 'yaml';
import { createDiagnostic } from '../domain/governance/diagnostics';
import type { AdoId} from '../domain/kernel/identity';
import { normalizeHtmlText } from '../domain/kernel/hash';
import { createFixtureId } from '../domain/kernel/identity';
import type { AdoSnapshot, Scenario } from '../domain/types';
import { validateAdoSnapshot } from '../domain/validation';
import { trySync } from './effect';
import type { ProjectPaths} from './paths';
import { relativeProjectPath, scenarioPath, snapshotPath } from './paths';
import { FileSystem } from './ports';
import type { WorkspaceSession } from './workspace-session';

const fixtureReferencePattern = /\{\{\s*([A-Za-z0-9_-]+)(?:\.[^}]*)?\s*\}\}/g;

function inferredFixtures(steps: Scenario['steps']) {
  const fixtureIds = new Set<string>(['demoSession']);
  for (const step of steps) {
    if (!step.override) {
      continue;
    }
    for (const match of step.override.matchAll(fixtureReferencePattern)) {
      if (match[1]) {
        fixtureIds.add(match[1]);
      }
    }
  }
  return [...fixtureIds]
    .sort((left, right) => left.localeCompare(right))
    .map((fixture) => ({
      fixture: createFixtureId(fixture),
      params: undefined,
    }));
}

function stepsConfidence(steps: Scenario['steps']) {
  const unique = [...new Set(steps.map((step) => step.confidence))];
  return unique.length === 1 ? unique[0] : 'mixed';
}

export function parseSnapshotToScenario(snapshot: AdoSnapshot): Scenario {
  const steps = snapshot.steps.map((rawStep) => {
    const actionText = normalizeHtmlText(rawStep.action);
    const expectedText = normalizeHtmlText(rawStep.expected);
    return {
      index: rawStep.index,
      intent: actionText,
      action_text: actionText,
      expected_text: expectedText,
      action: 'custom' as const,
      screen: null,
      element: null,
      posture: null,
      override: null,
      snapshot_template: null,
      resolution: null,
      confidence: 'intent-only' as const,
    };
  });

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
    preconditions: inferredFixtures(steps),
    steps,
    postconditions: [],
  };
}

export function parseScenario(options: { adoId: AdoId; paths: ProjectPaths; session?: WorkspaceSession }) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const catalogSnapshot = options.session?.catalog.snapshots.find((entry) => entry.artifact.id === options.adoId);
    const snapshot = catalogSnapshot
      ? catalogSnapshot.artifact
      : yield* Effect.gen(function* () {
          const rawSnapshot = yield* fs.readJson(snapshotPath(options.paths, options.adoId));
          return yield* trySync(
            () => validateAdoSnapshot(rawSnapshot),
            'snapshot-validation-failed',
            `Snapshot ${options.adoId} failed validation`,
          );
        });
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
            confidence: stepsConfidence(scenario.steps),
          },
        }),
      ],
    };
  });
}
