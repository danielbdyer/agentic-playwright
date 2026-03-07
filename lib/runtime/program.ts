import path from 'path';
import { readFileSync } from 'fs';
import { Page } from '@playwright/test';
import { createDiagnostic } from '../domain/diagnostics';
import { runtimeEscapeHatchError, toTesseractError, unknownScreenError } from '../domain/errors';
import { createPostureId, ScreenId, SnapshotTemplateId } from '../domain/identity';
import { CompilerDiagnostic, StepInstruction, StepProgram } from '../domain/types';
import { resolveDataValue } from './data';
import { engage } from './engage';
import { loadScreenRegistry, ScreenRegistry } from './load';
import { locate } from './locate';
import { expectAriaSnapshot } from './aria';
import { interact } from './interact';
import { RuntimeDiagnosticContext, RuntimeFailure, RuntimeResult, runtimeErr, runtimeOk } from './result';

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
        return engage(
          page,
          screen.value.elements,
          screen.value.postures,
          screen.value.surfaces,
          instruction.element,
          instruction.posture ?? createPostureId('valid'),
          resolveDataValue(fixtures, instruction.value),
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
        return expectAriaSnapshot(
          locate(page, element),
          readFileSync(snapshotTemplatePath(instruction.snapshotTemplate), 'utf8'),
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

export async function runStepProgram(
  page: Page,
  screens: ScreenRegistry,
  fixtures: Record<string, unknown>,
  program: StepProgram,
  context?: RuntimeDiagnosticContext,
): Promise<RuntimeResult<void>> {
  for (const instruction of program.instructions) {
    const result = await runInstruction(page, screens, fixtures, instruction);
    if (!result.ok) {
      return context ? { ...result, diagnostic: runtimeFailureDiagnostic(result.error, context) } : result;
    }
  }

  return runtimeOk(undefined);
}

export { loadScreenRegistry, runtimeFailureDiagnostic };
