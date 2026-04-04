import type { Page } from '@playwright/test';
import { Match, pipe } from 'effect';
import { navigationOptionsForUrl } from '../adapters/navigation-strategy';
import { createDiagnostic } from '../../domain/governance/diagnostics';
import { runtimeEscapeHatchError, toTesseractError, unknownScreenError } from '../../domain/kernel/errors';
import type { ScreenId } from '../../domain/kernel/identity';
import { createPostureId } from '../../domain/kernel/identity';
import type { SnapshotTemplateLoader } from '../../domain/commitment/runtime-loaders';
import type {
  ProgramFailure,
  StepInterpreterDiagnostic,
  StepProgramDiagnosticContext,
  StepProgramExecutionResult,
  StepProgramInstructionOutcome,
  StepProgramInterpreter,
} from '../../domain/commitment/program';
import type { CompilerDiagnostic, StepInstruction, StepProgram } from '../../domain/types';
import { resolveDataValue } from '../resolve/data';
import { engage } from '../resolve/engage';
import type { ScreenRegistry } from '../adapters/load';
import { resolveLocator } from '../widgets/locate';
import { describeLocatorStrategy } from '../widgets/locate';
import { expectAriaSnapshot } from '../../playwright/aria';
import { interact } from '../widgets/interact';
import { hasSnapshotTemplate, readSnapshotTemplate } from '../observe/snapshots';
import type { RuntimeDiagnosticContext, RuntimeFailure, RuntimeResult } from '../result';
import { runtimeErr, runtimeOk, toRuntimeVoidResult } from '../result';

interface PlaywrightEnvironment {
  page: Page;
  screens: ScreenRegistry;
  fixtures: Record<string, unknown>;
  snapshotLoader?: SnapshotTemplateLoader | undefined;
}

interface RuntimeInstructionSuccess {
  observedEffects: string[];
  locatorStrategy?: string | undefined;
  locatorRung?: number | undefined;
  widgetContract?: string | undefined;
}

function requireScreen(screens: ScreenRegistry, screenId: ScreenId): RuntimeResult<ScreenRegistry[string]> {
  const screen = screens[screenId];
  if (!screen) {
    const error = unknownScreenError(screenId);
    return runtimeErr('runtime-unknown-screen', error.message, error.context, error);
  }
  return runtimeOk(screen);
}

function runtimeFailureDiagnostic(failure: RuntimeFailure, context: RuntimeDiagnosticContext): CompilerDiagnostic {
  return createDiagnostic({
    code: failure.code,
    severity: 'error',
    message: failure.message,
    adoId: context.adoId,
    stepIndex: context.stepIndex,
    artifactPath: context.artifactPath,
    provenance: context.provenance,
  });
}

function observedEffectsForLocator(degraded: boolean): string[] {
  return degraded ? ['effect-applied', 'degraded-locator'] : ['effect-applied'];
}

async function runInstruction(
  environment: PlaywrightEnvironment,
  instruction: StepInstruction,
): Promise<RuntimeResult<RuntimeInstructionSuccess>> {
  try {
    return await pipe(
      Match.type<StepInstruction>(),
      Match.discriminatorsExhaustive('kind')({
        'navigate': async (i) => {
          const screen = requireScreen(environment.screens, i.screen);
          if (!screen.ok) {
            return screen;
          }
          const navOpts = navigationOptionsForUrl(screen.value.screen.url);
          await environment.page.goto(screen.value.screen.url, {
            waitUntil: navOpts.waitUntil,
            timeout: navOpts.timeout,
          });
          return runtimeOk({ observedEffects: ['effect-applied'] });
        },
        'enter': async (i) => {
          const screen = requireScreen(environment.screens, i.screen);
          if (!screen.ok) {
            return screen;
          }
          const resolvedValue = resolveDataValue(environment.fixtures, i.value);
          if (i.value && resolvedValue === undefined) {
            return runtimeErr('runtime-unresolved-value-ref', 'Unable to resolve input value', { instructionKind: i.kind });
          }
          return engage(
            environment.page,
            screen.value.elements,
            screen.value.postures,
            screen.value.surfaces,
            i.element,
            i.posture ?? createPostureId('valid'),
            resolvedValue,
          );
        },
        'invoke': async (i) => {
          const screen = requireScreen(environment.screens, i.screen);
          if (!screen.ok) {
            return screen;
          }
          const element = screen.value.elements[i.element];
          if (!element) {
            return runtimeErr('runtime-unknown-effect-target', `Unknown element target ${i.element}`, {
              target: i.element,
              targetKind: 'element',
            });
          }
          const resolvedLocator = await resolveLocator(environment.page, element);
          const action = await interact(
            resolvedLocator.locator,
            element.widget,
            i.action,
            undefined,
            { affordance: element.affordance ?? null },
          );
          if (!action.ok) {
            return action;
          }
          return runtimeOk({
            observedEffects: observedEffectsForLocator(resolvedLocator.degraded),
            locatorStrategy: describeLocatorStrategy(resolvedLocator.strategy),
            locatorRung: resolvedLocator.strategyIndex,
            widgetContract: element.widget,
          });
        },
        'observe-structure': async (i) => {
          const screen = requireScreen(environment.screens, i.screen);
          if (!screen.ok) {
            return screen;
          }
          const element = screen.value.elements[i.element];
          if (!element) {
            return runtimeErr('runtime-unknown-effect-target', `Unknown element target ${i.element}`, {
              target: i.element,
              targetKind: 'element',
            });
          }
          const snapshotLoader = environment.snapshotLoader;
          const hasTemplate = snapshotLoader
            ? snapshotLoader.has(i.snapshotTemplate)
            : hasSnapshotTemplate(i.snapshotTemplate);
          if (!hasTemplate) {
            return runtimeErr('runtime-missing-snapshot-template', `Missing snapshot template ${i.snapshotTemplate}`, {
              snapshotTemplate: i.snapshotTemplate,
            });
          }
          const resolvedLocator = await resolveLocator(environment.page, element);
          const comparison = await expectAriaSnapshot(
            resolvedLocator.locator,
            snapshotLoader
              ? snapshotLoader.read(i.snapshotTemplate)
              : readSnapshotTemplate(i.snapshotTemplate),
          );
          if (!comparison.ok) {
            return comparison;
          }
          return runtimeOk({
            observedEffects: observedEffectsForLocator(resolvedLocator.degraded),
            locatorStrategy: describeLocatorStrategy(resolvedLocator.strategy),
            locatorRung: resolvedLocator.strategyIndex,
            widgetContract: element.widget,
          });
        },
        'custom-escape-hatch': (i) => {
          const error = runtimeEscapeHatchError(i.reason);
          return Promise.resolve(runtimeErr('runtime-step-program-escape-hatch', error.message, error.context, error));
        },
      }),
    )(instruction);
  } catch (cause) {
    const error = toTesseractError(cause, 'runtime-execution-failed', 'Runtime execution failed');
    return runtimeErr('runtime-execution-failed', error.message, undefined, cause);
  }
}

export const playwrightStepProgramInterpreter: StepProgramInterpreter<PlaywrightEnvironment> = {
  mode: 'playwright',
  async run(program: StepProgram, environment: PlaywrightEnvironment, context?: StepProgramDiagnosticContext): Promise<StepProgramExecutionResult> {
    const step = async (
      remaining: readonly [number, (typeof program.instructions)[number]][],
      priorOutcomes: readonly StepProgramInstructionOutcome[],
    ): Promise<StepProgramExecutionResult> => {
      if (remaining.length === 0) {
        return { ok: true, value: { mode: this.mode, outcomes: [...priorOutcomes] } };
      }
      const [head, ...rest] = remaining;
      const [index, instruction] = head!;
      const result = await runInstruction(environment, instruction);
      if (!result.ok) {
        const failure: ProgramFailure = result.error;
        const outcomes = [...priorOutcomes, {
          instructionIndex: index,
          instructionKind: instruction.kind,
          expectedEffects: [instruction.kind],
          observedEffects: [] as string[],
          status: 'failed' as const,
          diagnostics: [{ code: failure.code, message: failure.message, context: failure.context }],
          failureCode: failure.code,
        }];
        return {
          ok: false,
          error: failure,
          value: { mode: this.mode, outcomes },
          diagnostic: context ? runtimeFailureDiagnostic(failure, context as RuntimeDiagnosticContext) : undefined,
        };
      }
      const outcomes = [...priorOutcomes, {
        instructionIndex: index,
        instructionKind: instruction.kind,
        expectedEffects: [instruction.kind],
        observedEffects: result.value.observedEffects,
        status: 'ok' as const,
        diagnostics: [] as StepInterpreterDiagnostic[],
        locatorStrategy: result.value.locatorStrategy,
        locatorRung: result.value.locatorRung,
        widgetContract: result.value.widgetContract,
      }];
      return step(rest, outcomes);
    };
    return step([...program.instructions.entries()], []);
  },
};

export async function runStepProgram(
  page: Page,
  screens: ScreenRegistry,
  fixtures: Record<string, unknown>,
  program: StepProgram,
  context?: RuntimeDiagnosticContext,
  snapshotLoader?: SnapshotTemplateLoader,
): Promise<RuntimeResult<void>> {
  const result = await playwrightStepProgramInterpreter.run(program, { page, screens, fixtures, snapshotLoader }, context);
  return toRuntimeVoidResult(result);
}

export { runtimeFailureDiagnostic };
