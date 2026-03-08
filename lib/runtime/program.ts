import type { Page } from '@playwright/test';
import { createDiagnostic } from '../domain/diagnostics';
import { runtimeEscapeHatchError, toTesseractError, unknownScreenError } from '../domain/errors';
import type { ScreenId } from '../domain/identity';
import { createPostureId } from '../domain/identity';
import type {
  ProgramFailure,
  StepInterpreterDiagnostic,
  StepProgramDiagnosticContext,
  StepProgramExecutionResult,
  StepProgramInstructionOutcome,
  StepProgramInterpreter,
} from '../domain/program';
import type { CompilerDiagnostic, StepInstruction, StepProgram } from '../domain/types';
import { resolveDataValue } from './data';
import { engage } from './engage';
import type { ScreenRegistry } from './load';
import { loadScreenRegistry } from './load';
import { resolveLocator } from './locate';
import { expectAriaSnapshot } from '../playwright/aria';
import { interact } from './interact';
import { hasSnapshotTemplate, readSnapshotTemplate } from './snapshots';
import type { RuntimeDiagnosticContext, RuntimeFailure, RuntimeResult } from './result';
import { runtimeErr, runtimeOk, toRuntimeVoidResult } from './result';

interface PlaywrightEnvironment {
  page: Page;
  screens: ScreenRegistry;
  fixtures: Record<string, unknown>;
}

interface RuntimeInstructionSuccess {
  observedEffects: string[];
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
  page: Page,
  screens: ScreenRegistry,
  fixtures: Record<string, unknown>,
  instruction: StepInstruction,
): Promise<RuntimeResult<RuntimeInstructionSuccess>> {
  try {
    switch (instruction.kind) {
      case 'navigate': {
        const screen = requireScreen(screens, instruction.screen);
        if (!screen.ok) {
          return screen;
        }
        await page.goto(screen.value.screen.url);
        return runtimeOk({ observedEffects: ['effect-applied'] });
      }
      case 'enter': {
        const screen = requireScreen(screens, instruction.screen);
        if (!screen.ok) {
          return screen;
        }
        const resolvedValue = resolveDataValue(fixtures, instruction.value);
        if (instruction.value && resolvedValue === undefined) {
          return runtimeErr('runtime-unresolved-value-ref', 'Unable to resolve input value', { instructionKind: instruction.kind });
        }
        return engage(
          page,
          screen.value.elements,
          screen.value.postures,
          screen.value.surfaces,
          instruction.element,
          instruction.posture ?? createPostureId('valid'),
          resolvedValue,
        );
      }
      case 'invoke': {
        const screen = requireScreen(screens, instruction.screen);
        if (!screen.ok) {
          return screen;
        }
        const element = screen.value.elements[instruction.element];
        if (!element) {
          return runtimeErr('runtime-unknown-effect-target', `Unknown element target ${instruction.element}`, {
            target: instruction.element,
            targetKind: 'element',
          });
        }
        const resolvedLocator = await resolveLocator(page, element);
        const action = await interact(
          resolvedLocator.locator,
          element.widget,
          instruction.action,
          undefined,
          { affordance: element.affordance ?? null },
        );
        if (!action.ok) {
          return action;
        }
        return runtimeOk({ observedEffects: observedEffectsForLocator(resolvedLocator.degraded) });
      }
      case 'observe-structure': {
        const screen = requireScreen(screens, instruction.screen);
        if (!screen.ok) {
          return screen;
        }
        const element = screen.value.elements[instruction.element];
        if (!element) {
          return runtimeErr('runtime-unknown-effect-target', `Unknown element target ${instruction.element}`, {
            target: instruction.element,
            targetKind: 'element',
          });
        }
        if (!hasSnapshotTemplate(instruction.snapshotTemplate)) {
          return runtimeErr('runtime-missing-snapshot-template', `Missing snapshot template ${instruction.snapshotTemplate}`, {
            snapshotTemplate: instruction.snapshotTemplate,
          });
        }
        const resolvedLocator = await resolveLocator(page, element);
        const comparison = await expectAriaSnapshot(
          resolvedLocator.locator,
          readSnapshotTemplate(instruction.snapshotTemplate),
        );
        if (!comparison.ok) {
          return comparison;
        }
        return runtimeOk({ observedEffects: observedEffectsForLocator(resolvedLocator.degraded) });
      }
      case 'custom-escape-hatch': {
        const error = runtimeEscapeHatchError(instruction.reason);
        return runtimeErr('runtime-step-program-escape-hatch', error.message, error.context, error);
      }
    }
  } catch (cause) {
    const error = toTesseractError(cause, 'runtime-execution-failed', 'Runtime execution failed');
    return runtimeErr('runtime-execution-failed', error.message, undefined, cause);
  }
}

export const playwrightStepProgramInterpreter: StepProgramInterpreter<PlaywrightEnvironment> = {
  mode: 'playwright',
  async run(program: StepProgram, environment: PlaywrightEnvironment, context?: StepProgramDiagnosticContext): Promise<StepProgramExecutionResult> {
    const outcomes: StepProgramInstructionOutcome[] = [];

    for (const [index, instruction] of program.instructions.entries()) {
      const result = await runInstruction(environment.page, environment.screens, environment.fixtures, instruction);
      if (!result.ok) {
        const failure: ProgramFailure = result.error;
        outcomes.push({
          instructionIndex: index,
          instructionKind: instruction.kind,
          expectedEffects: [instruction.kind],
          observedEffects: [],
          status: 'failed',
          diagnostics: [{ code: failure.code, message: failure.message, context: failure.context }],
          failureCode: failure.code,
        });
        return {
          ok: false,
          error: failure,
          value: { mode: this.mode, outcomes },
          diagnostic: context ? runtimeFailureDiagnostic(failure, context as RuntimeDiagnosticContext) : undefined,
        };
      }
      outcomes.push({
        instructionIndex: index,
        instructionKind: instruction.kind,
        expectedEffects: [instruction.kind],
        observedEffects: result.value.observedEffects,
        status: 'ok',
        diagnostics: [] as StepInterpreterDiagnostic[],
      });
    }

    return { ok: true, value: { mode: this.mode, outcomes } };
  },
};

export async function runStepProgram(
  page: Page,
  screens: ScreenRegistry,
  fixtures: Record<string, unknown>,
  program: StepProgram,
  context?: RuntimeDiagnosticContext,
): Promise<RuntimeResult<void>> {
  const result = await playwrightStepProgramInterpreter.run(program, { page, screens, fixtures }, context);
  return toRuntimeVoidResult(result);
}

export { loadScreenRegistry, runtimeFailureDiagnostic };
