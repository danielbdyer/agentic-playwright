import type { StepProgram, StepProgramDiagnosticContext, StepProgramExecutionResult } from '../../domain/program';
import type { SnapshotTemplateLoader } from '../../domain/runtime-loaders';
import type { ValueRef } from '../../domain/types';
import { foldValueRef } from '../../domain/visitors';
import { diagnosticInterpreter } from './diagnostic';
import { dryRunInterpreter } from './dry-run';
import type { InterpreterEnvironment, InterpreterMode, InterpreterScreenRegistry } from './types';

function lookupPath(fixtures: Record<string, unknown>, segments: string[]): unknown {
  let current: unknown = fixtures;
  for (const segment of segments) {
    if (!current || typeof current !== 'object' || !(segment in (current as Record<string, unknown>))) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function resolveValue(fixtures: Record<string, unknown>, raw: ValueRef | null | undefined): string | undefined {
  if (!raw) {
    return undefined;
  }
  return foldValueRef(raw, {
    literal: (ref) => ref.value,
    fixturePath: (ref) => {
      const resolved = lookupPath(fixtures, ref.path.segments);
      return resolved === undefined || resolved === null ? undefined : String(resolved);
    },
    parameterRow: (ref) => {
      const row = fixtures.dataRow as Record<string, unknown> | undefined;
      const resolved = row?.[ref.name];
      return resolved === undefined || resolved === null ? undefined : String(resolved);
    },
    generatedToken: (ref) => {
      const resolved = (fixtures.generatedTokens as Record<string, unknown> | undefined)?.[ref.token];
      return resolved === undefined || resolved === null ? ref.token : String(resolved);
    },
    postureSample: () => undefined,
  });
}

function createEnvironment(
  screens: InterpreterScreenRegistry,
  fixtures: Record<string, unknown>,
  snapshotLoader?: SnapshotTemplateLoader,
): InterpreterEnvironment {
  return {
    screens,
    fixtures,
    hasSnapshotTemplate: (template) => snapshotLoader ? snapshotLoader.has(template) : false,
    resolveValue,
  };
}

export async function runStaticInterpreter(
  mode: Exclude<InterpreterMode, 'playwright'>,
  program: StepProgram,
  screens: InterpreterScreenRegistry,
  fixtures: Record<string, unknown>,
  context?: StepProgramDiagnosticContext,
  snapshotLoader?: SnapshotTemplateLoader,
): Promise<StepProgramExecutionResult> {
  const environment = createEnvironment(screens, fixtures, snapshotLoader);
  return mode === 'dry-run'
    ? dryRunInterpreter.run(program, environment, context)
    : diagnosticInterpreter.run(program, environment, context);
}
