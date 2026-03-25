import { SchemaError } from '../errors';
import type { MergedPatterns, PatternActionName, PatternAliasSet, PatternDocument } from '../types';
import { uniqueSorted } from '../collections';

const requiredActions = ['navigate', 'input', 'click', 'assert-snapshot'] as const satisfies ReadonlyArray<PatternActionName>;

function validatePatternAliasSet(value: unknown, path: string): PatternAliasSet {
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    throw new SchemaError('expected object', path);
  }
  const record = value as Record<string, unknown>;
  const id = record.id;
  const aliases = record.aliases;
  if (typeof id !== 'string') {
    throw new SchemaError('expected string', `${path}.id`);
  }
  if (!Array.isArray(aliases)) {
    throw new SchemaError('expected array', `${path}.aliases`);
  }
  return {
    id,
    aliases: uniqueSorted(aliases.map((entry, index) => {
      if (typeof entry !== 'string') {
        throw new SchemaError('expected string', `${path}.aliases[${index}]`);
      }
      return entry;
    })),
  };
}

export function validatePatternDocument(value: unknown, path = 'pattern-document'): PatternDocument {
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    throw new SchemaError('expected object', path);
  }

  const record = value as Record<string, unknown>;
  const version = record.version;
  if (typeof version !== 'number') {
    throw new SchemaError('expected number', `${path}.version`);
  }

  const rawActions = record.actions;
  const rawPostures = record.postures;
  if (rawActions !== undefined && (!rawActions || Array.isArray(rawActions) || typeof rawActions !== 'object')) {
    throw new SchemaError('expected object', `${path}.actions`);
  }
  if (rawPostures !== undefined && (!rawPostures || Array.isArray(rawPostures) || typeof rawPostures !== 'object')) {
    throw new SchemaError('expected object', `${path}.postures`);
  }

  const actions = Object.fromEntries(
    Object.entries((rawActions ?? {}) as Record<string, unknown>).map(([action, entry]) => {
      if (!requiredActions.includes(action as PatternActionName)) {
        throw new SchemaError(`expected one of ${requiredActions.join(', ')}`, `${path}.actions.${action}`);
      }
      return [action, validatePatternAliasSet(entry, `${path}.actions.${action}`)];
    }),
  ) as PatternDocument['actions'];

  const postures = Object.fromEntries(
    Object.entries((rawPostures ?? {}) as Record<string, unknown>).map(([postureId, entry]) => [
      postureId,
      validatePatternAliasSet(entry, `${path}.postures.${postureId}`),
    ]),
  );

  return {
    version: version as 1,
    ...(Object.keys(actions ?? {}).length > 0 ? { actions } : {}),
    ...(Object.keys(postures).length > 0 ? { postures } : {}),
  };
}

const EMPTY_ALIAS_SET: PatternAliasSet = { aliases: [] };

function emptyMergedPatterns(): MergedPatterns {
  const actions = Object.fromEntries(
    requiredActions.map((action) => [action, EMPTY_ALIAS_SET]),
  ) as Record<PatternActionName, PatternAliasSet>;
  const sources = Object.fromEntries(
    requiredActions.map((action) => [action, 'cold-start']),
  ) as Record<PatternActionName, string>;
  return {
    version: 1,
    actions,
    postures: {},
    documents: [],
    sources: { actions: sources, postures: {} },
  };
}

export function mergePatternDocuments(
  documents: ReadonlyArray<{ artifactPath: string; artifact: PatternDocument }>,
): MergedPatterns {
  if (documents.length === 0) {
    return emptyMergedPatterns();
  }

  const sorted = [...documents].sort((left, right) => left.artifactPath.localeCompare(right.artifactPath));
  const actions: Partial<Record<PatternActionName, PatternAliasSet>> = {};
  const actionSources: Partial<Record<PatternActionName, string>> = {};
  const postures: Record<string, PatternAliasSet> = {};
  const postureSources: Record<string, string> = {};

  for (const entry of sorted) {
    for (const [action, descriptor] of Object.entries(entry.artifact.actions ?? {}) as Array<[PatternActionName, PatternAliasSet]>) {
      if (actions[action]) {
        throw new SchemaError(`duplicate pattern action "${action}"`, entry.artifactPath);
      }
      actions[action] = descriptor;
      actionSources[action] = entry.artifactPath;
    }

    for (const [postureId, descriptor] of Object.entries(entry.artifact.postures ?? {})) {
      if (postures[postureId]) {
        throw new SchemaError(`duplicate pattern posture "${postureId}"`, entry.artifactPath);
      }
      postures[postureId] = descriptor;
      postureSources[postureId] = entry.artifactPath;
    }
  }

  for (const action of requiredActions) {
    if (!actions[action] || !actionSources[action]) {
      throw new SchemaError(`missing merged action "${action}"`, 'knowledge/patterns');
    }
  }

  return {
    version: 1,
    actions: actions as Record<PatternActionName, PatternAliasSet>,
    postures,
    documents: sorted.map((entry) => entry.artifactPath),
    sources: {
      actions: actionSources as Record<PatternActionName, string>,
      postures: postureSources,
    },
  };
}
