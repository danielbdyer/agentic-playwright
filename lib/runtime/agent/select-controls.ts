import type { StepResolution, StepTask } from '../../domain/types';
import { uniqueSorted } from './shared';
import type { RuntimeStepAgentContext } from './types';

export function selectedRunbook(task: StepTask, context: RuntimeStepAgentContext) {
  if (context.controlSelection?.runbook) {
    return task.runtimeKnowledge.controls.runbooks.find((entry) => entry.name === context.controlSelection?.runbook) ?? null;
  }
  return task.runtimeKnowledge.controls.runbooks.find((entry) => entry.isDefault) ?? task.runtimeKnowledge.controls.runbooks[0] ?? null;
}

export function selectedControlResolution(task: StepTask, context: RuntimeStepAgentContext): StepResolution | null {
  const runbook = selectedRunbook(task, context);
  const selectedName = context.controlSelection?.resolutionControl ?? runbook?.resolutionControl ?? null;
  const scoped = task.runtimeKnowledge.controls.resolutionControls.filter((entry) => entry.stepIndex === task.index);
  const selected = selectedName
    ? scoped.find((entry) => entry.name === selectedName) ?? null
    : null;
  return selected?.resolution ?? task.controlResolution ?? scoped[0]?.resolution ?? null;
}


export function selectedDomExplorationPolicy(task: StepTask, context: RuntimeStepAgentContext) {
  const runbook = selectedRunbook(task, context);
  const selectedName = context.controlSelection?.resolutionControl ?? runbook?.resolutionControl ?? null;
  const scoped = task.runtimeKnowledge.controls.resolutionControls.filter((entry) => entry.stepIndex === task.index);
  const selected = selectedName
    ? scoped.find((entry) => entry.name === selectedName) ?? null
    : null;
  return selected?.domExplorationPolicy ?? scoped[0]?.domExplorationPolicy ?? null;
}

export function selectedDataset(task: StepTask, context: RuntimeStepAgentContext) {
  if (context.controlSelection?.dataset) {
    return task.runtimeKnowledge.controls.datasets.find((entry) => entry.name === context.controlSelection?.dataset) ?? null;
  }
  const runbook = selectedRunbook(task, context);
  if (runbook?.dataset) {
    return task.runtimeKnowledge.controls.datasets.find((entry) => entry.name === runbook.dataset) ?? null;
  }
  return task.runtimeKnowledge.controls.datasets.find((entry) => entry.isDefault) ?? task.runtimeKnowledge.controls.datasets[0] ?? null;
}

export function selectedControlRefs(task: StepTask, context: RuntimeStepAgentContext): string[] {
  const refs: string[] = [];
  const runbook = selectedRunbook(task, context);
  const dataset = selectedDataset(task, context);
  const resolutionControlName = context.controlSelection?.resolutionControl ?? runbook?.resolutionControl ?? null;
  const resolutionControl = resolutionControlName
    ? task.runtimeKnowledge.controls.resolutionControls.find((entry) => entry.name === resolutionControlName)
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
