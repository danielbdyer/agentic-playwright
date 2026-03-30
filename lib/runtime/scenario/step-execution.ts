import type { Page } from '@playwright/test';
import { compileStepProgram } from '../../domain/program';
import { runStaticInterpreter } from '../interpreters/execute';
import { playwrightStepProgramInterpreter } from '../program';
import { attachConsoleSentinel } from '../console-sentinel';
import type { GroundedStep, ResolutionTarget, ScenarioStep } from '../../domain/types';
import type { RuntimeScenarioEnvironment } from '../scenario';
import type { RouteSelection } from './route-selection';
import type { ScenarioContextRef } from './types';

export function resolvedScenarioStep(task: GroundedStep, target: ResolutionTarget, confidence: ScenarioStep['confidence']): ScenarioStep {
  return {
    index: task.index,
    intent: task.intent,
    action_text: task.actionText,
    expected_text: task.expectedText,
    action: target.action,
    screen: target.screen,
    element: target.element ?? null,
    posture: target.posture ?? null,
    override: target.override ?? null,
    snapshot_template: target.snapshot_template ?? null,
    resolution: target,
    confidence,
  };
}

export async function executeStepProgramStage(input: {
  readonly task: GroundedStep;
  readonly environment: RuntimeScenarioEnvironment;
  readonly interpretation: { readonly target: ResolutionTarget; readonly confidence: ScenarioStep['confidence'] };
  readonly routeSelection: RouteSelection;
  readonly context?: ScenarioContextRef | undefined;
}) {
  const resolvedStep = resolvedScenarioStep(input.task, input.interpretation.target, input.interpretation.confidence);
  const program = compileStepProgram(resolvedStep);
  const diagnosticContext = input.context
    ? {
        adoId: input.context.adoId,
        stepIndex: input.task.index,
        artifactPath: input.context.artifactPath,
        provenance: {
          sourceRevision: input.context.revision,
          contentHash: input.context.contentHash,
        },
      }
    : undefined;

  const consoleSentinel = input.environment.mode === 'playwright' && input.environment.page
    ? attachConsoleSentinel(input.environment.page as Page)
    : null;

  if (
    input.environment.mode === 'playwright'
    && input.environment.page
    && input.interpretation.target.action !== 'navigate'
    && input.routeSelection.preNavigationRequested
    && input.routeSelection.selectedRouteUrl
  ) {
    await input.environment.page.goto(input.routeSelection.selectedRouteUrl);
  }

  const result = input.environment.mode === 'playwright'
    ? await playwrightStepProgramInterpreter.run(program, {
        page: input.environment.page as Page,
        screens: (() => {
          if (input.interpretation.target.action !== 'navigate' || !input.routeSelection.selectedRouteUrl) {
            return input.environment.screens as never;
          }
          const current = input.environment.screens[input.interpretation.target.screen];
          if (!current) {
            return input.environment.screens as never;
          }
          return {
            ...input.environment.screens,
            [input.interpretation.target.screen]: {
              ...current,
              screen: {
                ...current.screen,
                url: input.routeSelection.selectedRouteUrl,
              },
            },
          } as never;
        })(),
        fixtures: input.environment.fixtures,
        snapshotLoader: input.environment.snapshotLoader,
      }, diagnosticContext)
    : await runStaticInterpreter(
        input.environment.mode,
        program,
        input.interpretation.target.action === 'navigate' && input.routeSelection.selectedRouteUrl
          ? {
            ...input.environment.screens,
            [input.interpretation.target.screen]: {
              ...input.environment.screens[input.interpretation.target.screen]!,
              screen: {
                ...input.environment.screens[input.interpretation.target.screen]!.screen,
                url: input.routeSelection.selectedRouteUrl,
              },
            },
          }
          : input.environment.screens,
        input.environment.fixtures,
        diagnosticContext,
        input.environment.snapshotLoader,
      );

  return {
    result,
    consoleMessages: consoleSentinel?.detach() ?? [],
  };
}
