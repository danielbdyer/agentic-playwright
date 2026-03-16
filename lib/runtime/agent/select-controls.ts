import type { StepResolution, GroundedStep } from '../../domain/types';
import { chooseByPrecedence, dataResolutionPrecedenceLaw, resolutionPrecedenceLaw, runSelectionPrecedenceLaw } from '../../domain/precedence';
import { uniqueSorted } from './shared';
import type { RuntimeStepAgentContext } from './types';

export function selectedRunbook(task: GroundedStep, context: RuntimeStepAgentContext) {
  const runbooks = context.resolutionContext.controls.runbooks;
  return chooseByPrecedence([
    { rung: 'cli-flag', value: runbooks.find((entry) => entry.name === context.controlSelection?.runbook) ?? null },
    { rung: 'runbook', value: runbooks.find((entry) => entry.isDefault) ?? null },
    { rung: 'repo-default', value: runbooks[0] ?? null },
  ], runSelectionPrecedenceLaw);
}

export function selectedControlResolution(task: GroundedStep, context: RuntimeStepAgentContext): StepResolution | null {
  const runbook = selectedRunbook(task, context);
  const selectedName = context.controlSelection?.resolutionControl ?? runbook?.resolutionControl ?? null;
  const scoped = context.resolutionContext.controls.resolutionControls.filter((entry) => entry.stepIndex === task.index);
  const selected = selectedName
    ? scoped.find((entry) => entry.name === selectedName) ?? null
    : null;
  return chooseByPrecedence([
    { rung: 'explicit', value: task.controlResolution },
    { rung: 'control', value: selected?.resolution ?? scoped[0]?.resolution ?? null },
  ], resolutionPrecedenceLaw);
}


export function selectedDomExplorationPolicy(task: GroundedStep, context: RuntimeStepAgentContext) {
  const runbook = selectedRunbook(task, context);
  const selectedName = context.controlSelection?.resolutionControl ?? runbook?.resolutionControl ?? null;
  const scoped = context.resolutionContext.controls.resolutionControls.filter((entry) => entry.stepIndex === task.index);
  const selected = selectedName
    ? scoped.find((entry) => entry.name === selectedName) ?? null
    : null;
  return selected?.domExplorationPolicy ?? scoped[0]?.domExplorationPolicy ?? null;
}

export function selectedDataset(task: GroundedStep, context: RuntimeStepAgentContext) {
  const datasets = context.resolutionContext.controls.datasets;
  const runbook = selectedRunbook(task, context);
  return chooseByPrecedence([
    { rung: 'explicit', value: datasets.find((entry) => entry.name === context.controlSelection?.dataset) ?? null },
    { rung: 'runbook-dataset-binding', value: datasets.find((entry) => entry.name === runbook?.dataset) ?? null },
    { rung: 'dataset-default', value: datasets.find((entry) => entry.isDefault) ?? null },
    { rung: 'hint-default-value', value: datasets[0] ?? null },
  ], dataResolutionPrecedenceLaw);
}

export function selectedControlRefs(task: GroundedStep, context: RuntimeStepAgentContext): string[] {
  const refs: string[] = [];
  const runbook = selectedRunbook(task, context);
  const dataset = selectedDataset(task, context);
  const resolutionControlName = context.controlSelection?.resolutionControl ?? runbook?.resolutionControl ?? null;
  const resolutionControl = resolutionControlName
    ? context.resolutionContext.controls.resolutionControls.find((entry) => entry.name === resolutionControlName)
    : null;

  if (runbook) {
    refs.push(runbook.artifactPath);
  }
  if (dataset) {
    refs.push(dataset.artifactPath);
  }
  if (resolutionControl) {
    refs.push(resolutionControl.artifactPath);
  }

  return uniqueSorted(refs);
}
