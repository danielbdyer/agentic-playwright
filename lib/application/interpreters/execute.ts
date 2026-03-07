import { existsSync } from 'fs';
import type { StepProgram, StepProgramDiagnosticContext, StepProgramExecutionResult } from '../../domain/program';
import type { ValueRef } from '../../domain/types';
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
  switch (raw.kind) {
    case 'literal':
      return raw.value;
    case 'fixture-path': {
      const resolved = lookupPath(fixtures, raw.path.segments);
      return resolved === undefined || resolved === null ? undefined : String(resolved);
    }
    case 'parameter-row': {
      const row = fixtures.dataRow as Record<string, unknown> | undefined;
      const resolved = row?.[raw.name];
      return resolved === undefined || resolved === null ? undefined : String(resolved);
    }
    case 'generated-token': {
      const resolved = (fixtures.generatedTokens as Record<string, unknown> | undefined)?.[raw.token];
      return resolved === undefined || resolved === null ? raw.token : String(resolved);
    }
    case 'posture-sample':
      return undefined;
  }
}

function createEnvironment(screens: InterpreterScreenRegistry, fixtures: Record<string, unknown>): InterpreterEnvironment {
  return {
    screens,
    fixtures,
    hasSnapshotTemplate: (template) => existsSync(`knowledge/${template}`),
    resolveValue,
  };
}

export async function runStaticInterpreter(
  mode: Exclude<InterpreterMode, 'playwright'>,
  program: StepProgram,
  screens: InterpreterScreenRegistry,
  fixtures: Record<string, unknown>,
  context?: StepProgramDiagnosticContext,
): Promise<StepProgramExecutionResult> {
  const environment = createEnvironment(screens, fixtures);
  return mode === 'dry-run'
    ? dryRunInterpreter.run(program, environment, context)
    : diagnosticInterpreter.run(program, environment, context);
}
