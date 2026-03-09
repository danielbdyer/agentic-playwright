import { parseRefPath } from './ref-path';
import type { AdoId, ElementId, ScreenId, SnapshotTemplateId } from './identity';
import type { CapabilityName, CompilerDiagnostic, ScenarioStep, StepInstruction, StepProgram, ValueRef } from './types';

const TEMPLATE_PATTERN = /^\{\{([a-zA-Z0-9_.]+)\}\}$/;

export interface StepProgramTrace {
  instructionKinds: StepInstruction['kind'][];
  screens: ScreenId[];
  elements: ElementId[];
  snapshotTemplates: SnapshotTemplateId[];
  hasEscapeHatch: boolean;
}

function uniqueSorted<T extends string>(values: T[]): T[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right)) as T[];
}

export function parseValueRef(raw: string | null | undefined, step?: Pick<ScenarioStep, 'element' | 'posture'>): ValueRef | null {
  if (raw === undefined || raw === null) {
    if (step?.element && step.posture) {
      return {
        kind: 'posture-sample',
        element: step.element,
        posture: step.posture,
        sampleIndex: 0,
      };
    }
    return null;
  }

  const match = raw.match(TEMPLATE_PATTERN);
  const refPath = match?.[1];
  if (refPath) {
    return {
      kind: 'fixture-path',
      path: parseRefPath(refPath),
    };
  }

  return {
    kind: 'literal',
    value: raw,
  };
}

export function compileStepProgram(step: ScenarioStep): StepProgram {
  switch (step.action) {
    case 'navigate':
      return {
        kind: 'step-program',
        instructions: step.screen
          ? [{ kind: 'navigate', screen: step.screen }]
          : [{ kind: 'custom-escape-hatch', reason: 'missing-screen' }],
      };
    case 'input':
      return {
        kind: 'step-program',
        instructions: step.screen && step.element
          ? [{
              kind: 'enter',
              screen: step.screen,
              element: step.element,
              posture: step.posture ?? null,
              value: parseValueRef(step.override, { element: step.element, posture: step.posture ?? null }),
            }]
          : [{ kind: 'custom-escape-hatch', reason: 'missing-input-target' }],
      };
    case 'click':
      return {
        kind: 'step-program',
        instructions: step.screen && step.element
          ? [{
              kind: 'invoke',
              screen: step.screen,
              element: step.element,
              action: 'click',
            }]
          : [{ kind: 'custom-escape-hatch', reason: 'missing-click-target' }],
      };
    case 'assert-snapshot':
      return {
        kind: 'step-program',
        instructions: step.screen && step.element && step.snapshot_template
          ? [{
              kind: 'observe-structure',
              screen: step.screen,
              element: step.element,
              snapshotTemplate: step.snapshot_template,
            }]
          : [{ kind: 'custom-escape-hatch', reason: 'missing-assertion-target' }],
      };
    case 'custom':
    default:
      return {
        kind: 'step-program',
        instructions: [{ kind: 'custom-escape-hatch', reason: 'custom-step' }],
      };
  }
}

export function capabilityForInstruction(instruction: StepInstruction): CapabilityName {
  switch (instruction.kind) {
    case 'navigate':
      return 'navigate';
    case 'enter':
      return 'enter';
    case 'invoke':
      return 'invoke';
    case 'observe-structure':
      return 'observe-structure';
    case 'custom-escape-hatch':
    default:
      return 'custom-escape-hatch';
  }
}

export function traceStepProgram(program: StepProgram): StepProgramTrace {
  const screens: ScreenId[] = [];
  const elements: ElementId[] = [];
  const snapshotTemplates: SnapshotTemplateId[] = [];
  const instructionKinds = program.instructions.map((instruction) => instruction.kind);
  let hasEscapeHatch = false;

  for (const instruction of program.instructions) {
    switch (instruction.kind) {
      case 'navigate':
        screens.push(instruction.screen);
        break;
      case 'enter':
      case 'invoke':
        screens.push(instruction.screen);
        elements.push(instruction.element);
        break;
      case 'observe-structure':
        screens.push(instruction.screen);
        elements.push(instruction.element);
        snapshotTemplates.push(instruction.snapshotTemplate);
        break;
      case 'custom-escape-hatch':
        hasEscapeHatch = true;
        break;
    }
  }

  return {
    instructionKinds,
    screens: uniqueSorted(screens),
    elements: uniqueSorted(elements),
    snapshotTemplates: uniqueSorted(snapshotTemplates),
    hasEscapeHatch,
  };
}


export type ProgramFailureCode =
  | 'runtime-unknown-screen'
  | 'runtime-unknown-effect-target'
  | 'runtime-missing-action-handler'
  | 'runtime-widget-precondition-failed'
  | 'runtime-snapshot-handle-resolution-failed'
  | 'runtime-unresolved-value-ref'
  | 'runtime-missing-snapshot-template'
  | 'runtime-step-program-escape-hatch'
  | 'runtime-execution-failed';

export interface ProgramFailure {
  code: ProgramFailureCode;
  message: string;
  context?: Record<string, string> | undefined;
  cause?: unknown | undefined;
}

export interface StepProgramDiagnosticContext {
  adoId: AdoId;
  stepIndex?: number | undefined;
  artifactPath?: string | undefined;
  provenance?: {
    sourceRevision?: number | undefined;
    contentHash?: string | undefined;
  } | undefined;
}

export interface StepInterpreterDiagnostic {
  code: ProgramFailureCode;
  message: string;
  context?: Record<string, string> | undefined;
}

export interface StepProgramInstructionOutcome {
  instructionIndex: number;
  instructionKind: StepInstruction['kind'];
  expectedEffects: string[];
  observedEffects: string[];
  status: 'ok' | 'failed';
  diagnostics: StepInterpreterDiagnostic[];
  failureCode?: ProgramFailureCode | undefined;
  locatorStrategy?: string | undefined;
}

export interface StepProgramExecution {
  mode: string;
  outcomes: StepProgramInstructionOutcome[];
}

export type StepProgramExecutionResult =
  | { ok: true; value: StepProgramExecution }
  | { ok: false; error: ProgramFailure; diagnostic?: CompilerDiagnostic | undefined; value: StepProgramExecution };

export interface StepProgramInterpreter<TEnvironment> {
  mode: string;
  run(program: StepProgram, environment: TEnvironment, context?: StepProgramDiagnosticContext): Promise<StepProgramExecutionResult>;
}

export type { StepProgram };


