import path from 'path';
import { createProjectPaths, type ProjectPaths } from '../paths';
import type { ExecutionPosture } from '../../domain/types';
import { TesseractError } from '../../domain/kernel/errors';
import { commandRegistry } from './commands/index';
import {
  type CommandExecution,
  type CommandName,
  type FlagName,
  type ParsedFlags,
  commandNames,
  flagDecoders,
  flagDescriptorTable,
} from './shared';
import { withExecutionContext } from '../context/execution-context';

// Re-export public API so existing consumers are unaffected
export { commandNames } from './shared';
export type { CommandExecution, CommandName, CommandSpec } from './shared';

function parseTokensRec(
  tokens: ReadonlyArray<string>,
  index: number,
  flags: ParsedFlags,
  spec: { readonly flags: ReadonlyArray<FlagName> },
  command: string,
): ParsedFlags {
  if (index >= tokens.length) {
    return flags;
  }

  const token = tokens[index];
  if (!token || !token.startsWith('--')) {
    return parseTokensRec(tokens, index + 1, flags, spec, command);
  }

  if (!spec.flags.includes(token as FlagName)) {
    throw new TesseractError('invalid-argument', `Unknown flag for ${command}: ${token}`);
  }

  if (!(token in flagDescriptorTable)) {
    throw new TesseractError('invalid-argument', `Unsupported flag reader for ${token}`);
  }

  const decoder = flagDecoders[token as FlagName];
  const parsed = decoder(tokens, index, flags);
  return parseTokensRec(tokens, parsed.nextIndex + 1, parsed.flags, spec, command);
}

function isCommandName(value: string): value is CommandName {
  return (commandNames as readonly string[]).includes(value);
}


function deriveCliExecutionContext(command: CommandName, flags: ParsedFlags) {
  return {
    adoId: flags.adoId,
    runId: flags.runbook,
    workItemId: flags.proposalId,
    stage: `cli:${command}`,
  } as const;
}

export function parseCliInvocation(argv: string[]): CommandExecution {
  const [rawCommand = 'help', ...tokens] = argv;
  if (!isCommandName(rawCommand)) {
    throw new TesseractError('invalid-argument', 'Unknown command. Expected sync, parse, bind, emit, compile, refresh, run, replay, paths, capture, discover, harvest, surface, graph, trace, impact, types, workflow, inbox, approve, certify, rerun-plan, benchmark, scorecard, dogfood, workbench, speedrun, evolve, experiments, or generate.');
  }

  const spec = commandRegistry[rawCommand];
  const flags = parseTokensRec(tokens, 0, {}, spec, rawCommand);
  const parsedExecution = spec.parse({ flags });

  return {
    ...parsedExecution,
    execute: (paths, posture) => withExecutionContext(deriveCliExecutionContext(rawCommand, flags))(
      parsedExecution.execute(paths, posture),
    ),
  };
}

export function resolveExecutionPosture(input: CommandExecution['postureInput']): ExecutionPosture {
  const executionProfile = input.executionProfile ?? (input.isCI ? 'ci-batch' : 'interactive');
  const interpreterMode = input.baseline ? 'dry-run' : (input.interpreterMode ?? 'diagnostic');
  const writeMode = input.noWrite || input.baseline ? 'no-write' : 'persist';
  return {
    interpreterMode,
    writeMode,
    executionProfile,
    headed: executionProfile === 'ci-batch' ? false : Boolean(input.headed),
  };
}

export function createCliPaths(rootDir: string, suiteRoot?: string): ProjectPaths {
  const paths = createProjectPaths(rootDir, suiteRoot ?? path.join(rootDir, 'dogfood'));
  // Prefer lane-grouped access patterns in new callsites while preserving legacy aliases.
  return paths;
}

/** Exposes the full command registry for introspection and testing. */
export { commandRegistry } from './commands/index';
