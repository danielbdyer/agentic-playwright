import type {
  ProgramFailureCode,
  StepInterpreterDiagnostic,
  StepProgram,
  StepProgramDiagnosticContext,
  StepProgramExecutionResult,
  StepProgramInstructionOutcome,
  StepProgramInterpreter,
} from '../../domain/program';
import type { PostureId, ScreenId, SnapshotTemplateId } from '../../domain/identity';
import type { ScreenElements, ScreenPostures, SurfaceGraph, ValueRef } from '../../domain/types';

export type InterpreterMode = 'playwright' | 'dry-run' | 'diagnostic';

export interface InterpreterLoadedScreen {
  screen: Pick<SurfaceGraph, 'screen' | 'url' | 'sections'>;
  surfaces: SurfaceGraph['surfaces'];
  elements: ScreenElements['elements'];
  postures: ScreenPostures['postures'];
}

export type InterpreterScreenRegistry = Record<string, InterpreterLoadedScreen>;

export interface InterpreterEnvironment {
  screens: InterpreterScreenRegistry;
  fixtures: Record<string, unknown>;
  hasSnapshotTemplate: (template: SnapshotTemplateId) => boolean;
  resolveValue: (fixtures: Record<string, unknown>, value: ValueRef | null | undefined) => string | undefined;
}

export function expectedEffectsForInstruction(kind: StepProgram['instructions'][number]['kind']): string[] {
  switch (kind) {
    case 'navigate':
      return ['navigation'];
    case 'enter':
      return ['value-entry'];
    case 'invoke':
      return ['interaction'];
    case 'observe-structure':
      return ['snapshot-observation'];
    case 'custom-escape-hatch':
      return ['escape-hatch'];
  }
}

export function interpreterOutcome(input: {
  index: number;
  instruction: StepProgram['instructions'][number];
  status: 'ok' | 'failed';
  observedEffects?: string[] | undefined;
  diagnostics?: StepInterpreterDiagnostic[] | undefined;
  failureCode?: ProgramFailureCode | undefined;
}): StepProgramInstructionOutcome {
  return {
    instructionIndex: input.index,
    instructionKind: input.instruction.kind,
    expectedEffects: expectedEffectsForInstruction(input.instruction.kind),
    observedEffects: input.observedEffects ?? [],
    status: input.status,
    diagnostics: input.diagnostics ?? [],
    failureCode: input.failureCode,
  };
}

export interface ProgramInterpreterRegistry {
  playwright: StepProgramInterpreter<unknown>;
  dryRun: StepProgramInterpreter<InterpreterEnvironment>;
  diagnostic: StepProgramInterpreter<InterpreterEnvironment>;
}

export async function runByMode(
  registry: ProgramInterpreterRegistry,
  mode: InterpreterMode,
  program: StepProgram,
  environment: InterpreterEnvironment,
  context?: StepProgramDiagnosticContext,
): Promise<StepProgramExecutionResult> {
  switch (mode) {
    case 'dry-run':
      return registry.dryRun.run(program, environment, context);
    case 'diagnostic':
      return registry.diagnostic.run(program, environment, context);
    case 'playwright':
    default:
      return registry.playwright.run(program, environment as unknown, context);
  }
}

export function requireScreen(
  screens: InterpreterScreenRegistry,
  screenId: ScreenId,
): { ok: true; value: InterpreterLoadedScreen } | { ok: false; code: ProgramFailureCode; message: string; context: Record<string, string> } {
  const screen = screens[screenId];
  if (!screen) {
    return { ok: false, code: 'runtime-unknown-screen', message: `Unknown screen ${screenId}`, context: { screenId } };
  }
  return { ok: true, value: screen };
}

export function resolvePosture(
  screen: InterpreterLoadedScreen,
  element: string,
  posture: PostureId | null,
): { ok: true } | { ok: false; code: ProgramFailureCode; message: string; context: Record<string, string> } {
  if (!posture) {
    return { ok: true };
  }
  if (!screen.postures[element] || !screen.postures[element][posture]) {
    return {
      ok: false,
      code: 'runtime-unknown-effect-target',
      message: `Unknown posture ${posture} for element ${element}`,
      context: { target: element, targetKind: 'element', posture },
    };
  }
  return { ok: true };
}
