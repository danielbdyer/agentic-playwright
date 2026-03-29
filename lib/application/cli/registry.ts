import path from 'path';
import { createProjectPaths, type ProjectPaths } from '../paths';
import type { ExecutionPosture } from '../../domain/types';
import { commandRegistry } from './commands/index';
import {
  type CommandExecution,
  type CommandName,
  type ParsedFlags,
  commandNames,
  flagReaders,
} from './shared';

// Re-export public API so existing consumers are unaffected
export { commandNames } from './shared';
export type { CommandExecution, CommandName, CommandSpec } from './shared';

function parseTokensRec(
  tokens: ReadonlyArray<string>,
  index: number,
  flags: ParsedFlags,
  spec: { readonly flags: ReadonlyArray<string> },
  command: string,
): ParsedFlags {
  if (index >= tokens.length) {
    return flags;
  }

  const token = tokens[index];
  if (!token || !token.startsWith('--')) {
    return parseTokensRec(tokens, index + 1, flags, spec, command);
  }

  if (!spec.flags.includes(token)) {
    throw new Error(`Unknown flag for ${command}: ${token}`);
  }

  const reader = flagReaders[token];
  if (!reader) {
    throw new Error(`Unsupported flag reader for ${token}`);
  }

  const nextIndex = reader(tokens as string[], index, flags);
  return parseTokensRec(tokens, nextIndex + 1, flags, spec, command);
}

function isCommandName(value: string): value is CommandName {
  return (commandNames as readonly string[]).includes(value);
}

export function parseCliInvocation(argv: string[]): CommandExecution {
  const [rawCommand = 'help', ...tokens] = argv;
  if (!isCommandName(rawCommand)) {
    throw new Error('Unknown command. Expected sync, parse, bind, emit, compile, refresh, run, replay, paths, capture, discover, harvest, surface, graph, trace, impact, types, workflow, inbox, approve, certify, rerun-plan, benchmark, scorecard, dogfood, workbench, speedrun, evolve, experiments, or generate.');
  }

  const spec = commandRegistry[rawCommand];
  const flags = parseTokensRec(tokens, 0, {}, spec, rawCommand);

  return spec.parse({ flags });
}

export function resolveExecutionPosture(input: CommandExecution['postureInput']): ExecutionPosture {
  const executionProfile = input.executionProfile ?? (process.env.CI ? 'ci-batch' : 'interactive');
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
  return createProjectPaths(rootDir, suiteRoot ?? path.join(rootDir, 'dogfood'));
}

/** Exposes the full command registry for introspection and testing. */
export { commandRegistry } from './commands/index';
