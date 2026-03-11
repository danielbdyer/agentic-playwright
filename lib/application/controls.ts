import type {
  DatasetControl,
  ResolutionControl,
  RunbookControl,
  RuntimeControlSession,
  RuntimeDatasetBinding,
  RuntimeResolutionControl,
  RuntimeRunbookControl,
  Scenario,
  StepResolution,
} from '../domain/types';
import type { WorkspaceCatalog } from './catalog';
import { compareStrings, uniqueSorted } from '../domain/collections';
import { chooseByPrecedence, runSelectionPrecedenceLaw } from '../domain/precedence';

function selectorMatchesScenario(
  selector: { adoIds: string[]; suites: string[]; tags: string[] },
  scenario: Scenario,
): boolean {
  const matchesAdoId = selector.adoIds.length === 0 || selector.adoIds.includes(scenario.source.ado_id);
  const matchesSuite = selector.suites.length === 0 || selector.suites.some((suite) => scenario.metadata.suite.startsWith(suite));
  const matchesTags = selector.tags.length === 0 || selector.tags.some((tag) => scenario.metadata.tags.includes(tag));
  return matchesAdoId && matchesSuite && matchesTags;
}

function runtimeDatasetBinding(dataset: { artifact: DatasetControl; artifactPath: string }): RuntimeDatasetBinding {
  return {
    name: dataset.artifact.name,
    artifactPath: dataset.artifactPath,
    isDefault: Boolean(dataset.artifact.default),
    fixtures: dataset.artifact.fixtures,
    elementDefaults: dataset.artifact.defaults?.elements ?? {},
    generatedTokens: dataset.artifact.defaults?.generatedTokens ?? {},
  };
}

function runtimeRunbook(runbook: { artifact: RunbookControl; artifactPath: string }): RuntimeRunbookControl {
  return {
    name: runbook.artifact.name,
    artifactPath: runbook.artifactPath,
    isDefault: Boolean(runbook.artifact.default),
    selector: runbook.artifact.selector,
    interpreterMode: runbook.artifact.interpreterMode ?? null,
    dataset: runbook.artifact.dataset ?? null,
    resolutionControl: runbook.artifact.resolutionControl ?? null,
    translationEnabled: runbook.artifact.translationEnabled,
    translationCacheEnabled: runbook.artifact.translationCacheEnabled,
    providerId: runbook.artifact.providerId ?? null,
  };
}

function runtimeResolutionControls(
  controls: Array<{ artifact: ResolutionControl; artifactPath: string }>,
  scenario: Scenario,
): RuntimeResolutionControl[] {
  return controls
    .filter((entry) => selectorMatchesScenario(entry.artifact.selector, scenario))
    .flatMap((entry) =>
      entry.artifact.steps.map((step) => ({
        name: entry.artifact.name,
        artifactPath: entry.artifactPath,
        stepIndex: step.stepIndex,
        resolution: step.resolution,
        domExplorationPolicy: entry.artifact.domExplorationPolicy,
      })),
    )
    .sort((left, right) => {
      const stepOrder = left.stepIndex - right.stepIndex;
      if (stepOrder !== 0) {
        return stepOrder;
      }
      return compareStrings(left.name, right.name);
    });
}

export function runtimeControlsForScenario(catalog: WorkspaceCatalog, scenario: Scenario): RuntimeControlSession {
  return {
    datasets: catalog.datasets.map((entry) => runtimeDatasetBinding(entry)),
    resolutionControls: runtimeResolutionControls(catalog.resolutionControls, scenario),
    runbooks: catalog.runbooks
      .filter((entry) => entry.artifact.default || selectorMatchesScenario(entry.artifact.selector, scenario))
      .map((entry) => runtimeRunbook(entry))
      .sort((left, right) => compareStrings(left.name, right.name)),
  };
}

export function controlResolutionForStep(
  controls: RuntimeControlSession,
  stepIndex: number,
  selectedControlName?: string | null,
): StepResolution | null {
  const scoped = controls.resolutionControls.filter((entry) => entry.stepIndex === stepIndex);
  return chooseByPrecedence([
    { rung: 'cli-flag', value: selectedControlName ? scoped.find((entry) => entry.name === selectedControlName)?.resolution ?? null : null },
    { rung: 'runbook', value: scoped[0]?.resolution ?? null },
  ], runSelectionPrecedenceLaw);
}

export function findRunbook(
  catalog: WorkspaceCatalog,
  options: { runbookName?: string | null; scenario?: Scenario | null },
): RuntimeRunbookControl | null {
  const runtimeRunbooks = catalog.runbooks
    .map((entry) => runtimeRunbook(entry))
    .sort((left, right) => compareStrings(left.name, right.name));
  return chooseByPrecedence([
    { rung: 'cli-flag', value: options.runbookName ? runtimeRunbooks.find((entry) => entry.name === options.runbookName) ?? null : null },
    { rung: 'runbook', value: runtimeRunbooks.find((entry) => entry.isDefault) ?? null },
    { rung: 'repo-default', value: options.scenario ? runtimeRunbooks.find((entry) => selectorMatchesScenario(entry.selector, options.scenario)) ?? null : null },
  ], runSelectionPrecedenceLaw);
}

export function resolveRunSelection(
  catalog: WorkspaceCatalog,
  options: { adoId?: string | null; runbookName?: string | null; tag?: string | null },
): { adoIds: string[]; runbook: RuntimeRunbookControl | null } {
  if (options.adoId) {
    const scenario = catalog.scenarios.find((entry) => entry.artifact.source.ado_id === options.adoId)?.artifact ?? null;
    return {
      adoIds: [options.adoId],
      runbook: findRunbook(catalog, { runbookName: options.runbookName ?? null, scenario }),
    };
  }

  const runbook = findRunbook(catalog, { runbookName: options.runbookName ?? null, scenario: null });
  const tag = options.tag ?? null;
  const selected = catalog.scenarios
    .map((entry) => entry.artifact)
    .filter((scenario) => {
      if (tag && !scenario.metadata.tags.includes(tag)) {
        return false;
      }
      if (runbook && !selectorMatchesScenario(runbook.selector, scenario)) {
        return false;
      }
      return true;
    })
    .map((scenario) => scenario.source.ado_id);

  return {
    adoIds: uniqueSorted(selected),
    runbook,
  };
}

export function activeDatasetForRun(
  controls: RuntimeControlSession,
  runbook: RuntimeRunbookControl | null,
): RuntimeDatasetBinding | null {
  return chooseByPrecedence([
    { rung: 'runbook', value: runbook?.dataset ? controls.datasets.find((entry) => entry.name === runbook.dataset) ?? null : null },
    { rung: 'repo-default', value: controls.datasets.find((entry) => entry.isDefault) ?? controls.datasets[0] ?? null },
  ], runSelectionPrecedenceLaw);
}
