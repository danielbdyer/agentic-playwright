import path from 'path';
import { existsSync, readFileSync } from 'fs';
import { Page } from '@playwright/test';
import { createDiagnostic } from '../domain/diagnostics';
import { runtimeEscapeHatchError, toTesseractError, unknownScreenError } from '../domain/errors';
import { createPostureId, ScreenId, SnapshotTemplateId } from '../domain/identity';
import { ProgramFailure, StepProgramDiagnosticContext, StepProgramExecutionResult, StepProgramInstructionOutcome, StepProgramInterpreter } from '../domain/program';
import { CompilerDiagnostic, StepInstruction, StepProgram } from '../domain/types';
import { resolveDataValue } from './data';
import { engage } from './engage';
import { loadScreenRegistry, ScreenRegistry } from './load';
import { locate } from './locate';
import { expectAriaSnapshot } from './aria';
import { interact } from './interact';
import { RuntimeDiagnosticContext, RuntimeFailure, RuntimeResult, runtimeErr, runtimeOk, toRuntimeVoidResult } from './result';

interface PlaywrightEnvironment {
  page: Page;
  screens: ScreenRegistry;
  fixtures: Record<string, unknown>;
}

function requireScreen(screens: ScreenRegistry, screenId: ScreenId): RuntimeResult<ScreenRegistry[string]> {
  const screen = screens[screenId];
  if (!screen) {
    const error = unknownScreenError(screenId);
    return runtimeErr('runtime-unknown-screen', error.message, error.context, error);
  }
  return runtimeOk(screen);
}

function snapshotTemplatePath(snapshotTemplate: SnapshotTemplateId): string {
  return path.join(process.cwd(), 'knowledge', snapshotTemplate);
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

async function runInstruction(
  page: Page,
  screens: ScreenRegistry,
  fixtures: Record<string, unknown>,
  instruction: StepInstruction,
): Promise<RuntimeResult<void>> {
  try {
    switch (instruction.kind) {
      case 'navigate': {
        const screen = requireScreen(screens, instruction.screen);
        if (!screen.ok) {
          return screen;
        }
        await page.goto(screen.value.screen.url);
        return runtimeOk(undefined);
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
        const action = await interact(locate(page, element), element.widget, instruction.action);
        if (!action.ok) {
          return action;
        }
        return runtimeOk(undefined);
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
        const templatePath = snapshotTemplatePath(instruction.snapshotTemplate);
        if (!existsSync(templatePath)) {
          return runtimeErr('runtime-missing-snapshot-template', `Missing snapshot template ${instruction.snapshotTemplate}`, {
            snapshotTemplate: instruction.snapshotTemplate,
          });
        }
        return expectAriaSnapshot(
          locate(page, element),
          readFileSync(templatePath, 'utf8'),
        );
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
        observedEffects: ['effect-applied'],
        status: 'ok',
        diagnostics: [],
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
