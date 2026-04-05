import type {
  ProgramFailureCode,
  StepInterpreterDiagnostic,
  StepProgram,
  StepProgramDiagnosticContext,
  StepProgramExecutionResult,
  StepProgramInstructionOutcome,
  StepProgramInterpreter,
} from '../../domain/commitment/program';
import type { PostureId, ScreenId, SnapshotTemplateId } from '../../domain/kernel/identity';
import type { ValueRef } from '../../domain/intent/types';
import type { ScreenElements, ScreenPostures, SurfaceGraph } from '../../domain/knowledge/types';

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
    status: input.status,
    expectedEffects: expectedEffectsForInstruction(input.instruction.kind),
    observedEffects: input.observedEffects ?? [],
    diagnostics: input.diagnostics ?? [],
    failureCode: input.failureCode,
  };
}

export function requireScreen(screens: InterpreterScreenRegistry, screenId: ScreenId) {
  const screen = screens[screenId];
  if (!screen) {
    return {
      ok: false as const,
      code: 'runtime-unknown-screen' as const,
      message: `Unknown screen ${screenId}`,
      context: { screen: screenId },
    };
  }
  return {
    ok: true as const,
    value: screen,
  };
}

export function resolvePosture(
  screen: InterpreterLoadedScreen,
  elementId: string,
  postureId: PostureId | null,
) {
  if (!postureId) {
    return { ok: true as const, value: null };
  }

  const elementPostures = screen.postures[elementId];
  if (!elementPostures || !elementPostures[postureId]) {
    return {
      ok: false as const,
      code: 'runtime-unknown-effect-target' as const,
      message: `Unknown posture ${postureId} for ${elementId}`,
      context: { target: postureId, element: elementId, targetKind: 'posture' },
    };
  }

  return {
    ok: true as const,
    value: elementPostures[postureId],
  };
}

export type StaticInterpreter = StepProgramInterpreter<InterpreterEnvironment>;
export type { StepProgramExecutionResult, StepProgramDiagnosticContext };
