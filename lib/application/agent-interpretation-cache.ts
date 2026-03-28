/**
 * Agent Interpretation Cache — avoids redundant LLM calls for identical steps.
 *
 * Follows the same envelope pattern as TranslationCache:
 *   - Cache key: SHA-256 of (stepText, screenId, elementId) fingerprint
 *   - Cache value: the AgentInterpretationResult with full provenance
 *   - Cold-start speedruns skip LLM for identical steps
 *
 * The cache key incorporates the task fingerprint and knowledge fingerprint
 * so that knowledge changes automatically invalidate stale entries.
 */

import { promises as nodeFs } from 'fs';
import { sha256, stableStringify } from '../domain/hash';
import type { AgentInterpretationRequest, AgentInterpretationResult } from './agent-interpreter-provider';
import type { ProjectPaths } from './paths';
import { agentInterpretationCachePath } from './paths';

// ─── Cache Record Envelope ───

export interface AgentInterpretationCacheRecord {
  readonly kind: 'agent-interpretation-cache-record';
  readonly version: 1;
  readonly stage: 'resolution';
  readonly scope: 'agent-interpretation';
  readonly cacheKey: string;
  readonly fingerprint: string;
  readonly fingerprints: {
    readonly task: string;
    readonly knowledge: string;
    readonly request: string;
  };
  readonly lineage: {
    readonly parents: readonly string[];
    readonly sources: readonly string[];
    readonly handshakes: readonly ['preparation', 'resolution'];
  };
  readonly payload: {
    readonly result: AgentInterpretationResult;
  };
}

// ─── Fingerprinting ───

export interface AgentInterpretationCacheKeyInput {
  readonly actionText: string;
  readonly expectedText: string;
  readonly normalizedIntent: string;
  readonly taskFingerprint: string;
  readonly knowledgeFingerprint: string;
}

/**
 * Compute a stable fingerprint from the request fields that determine
 * interpretation identity: step text, normalized intent, and context fingerprints.
 */
function requestFingerprint(input: AgentInterpretationCacheKeyInput): string {
  return `sha256:${sha256(stableStringify({
    actionText: input.actionText,
    expectedText: input.expectedText,
    normalizedIntent: input.normalizedIntent,
  }))}`;
}

/**
 * Compute the cache key from task fingerprint, knowledge fingerprint,
 * and the request content fingerprint. Knowledge changes invalidate entries.
 */
export function agentInterpretationCacheKey(input: AgentInterpretationCacheKeyInput): string {
  return `agent-interp-${sha256(stableStringify({
    task: input.taskFingerprint,
    knowledge: input.knowledgeFingerprint,
    request: requestFingerprint(input),
  }))}`;
}

// ─── Read / Write ───

export async function readAgentInterpretationCache(input: {
  readonly paths: ProjectPaths;
  readonly request: AgentInterpretationCacheKeyInput;
}): Promise<AgentInterpretationCacheRecord | null> {
  const key = agentInterpretationCacheKey(input.request);
  const cacheFile = agentInterpretationCachePath(input.paths, key);
  try {
    const value = JSON.parse(await nodeFs.readFile(cacheFile, 'utf8')) as AgentInterpretationCacheRecord;
    if (value?.kind !== 'agent-interpretation-cache-record' || value.cacheKey !== key) {
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

export async function writeAgentInterpretationCache(input: {
  readonly paths: ProjectPaths;
  readonly request: AgentInterpretationCacheKeyInput;
  readonly result: AgentInterpretationResult;
}): Promise<AgentInterpretationCacheRecord> {
  const key = agentInterpretationCacheKey(input.request);
  const cacheFile = agentInterpretationCachePath(input.paths, key);
  const fingerprint = requestFingerprint(input.request);
  const record: AgentInterpretationCacheRecord = {
    kind: 'agent-interpretation-cache-record',
    version: 1,
    stage: 'resolution',
    scope: 'agent-interpretation',
    cacheKey: key,
    fingerprint: `sha256:${sha256(stableStringify({ key, result: input.result, fingerprint }))}`,
    fingerprints: {
      task: input.request.taskFingerprint,
      knowledge: input.request.knowledgeFingerprint,
      request: fingerprint,
    },
    lineage: {
      parents: [input.request.taskFingerprint],
      sources: [input.request.knowledgeFingerprint],
      handshakes: ['preparation', 'resolution'],
    },
    payload: {
      result: input.result,
    },
  };

  await nodeFs.mkdir(input.paths.agentInterpretationCacheDir, { recursive: true });
  await nodeFs.writeFile(cacheFile, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  return record;
}

/**
 * Prune the agent interpretation cache to at most `maxEntries` files,
 * keeping the most recently modified entries. Returns the number removed.
 */
export async function pruneAgentInterpretationCache(input: {
  readonly paths: ProjectPaths;
  readonly maxEntries: number;
}): Promise<number> {
  const dir = input.paths.agentInterpretationCacheDir;
  const entries = await nodeFs.readdir(dir).catch(() => null);
  if (!entries) return 0;
  const cacheFiles = entries.filter((f) => f.endsWith('.agent-interpretation.json'));
  if (cacheFiles.length <= input.maxEntries) {
    return 0;
  }

  const withStats = await Promise.all(
    cacheFiles.map(async (file) => {
      const filePath = `${dir}/${file}`;
      const stat = await nodeFs.stat(filePath);
      return { filePath, mtimeMs: stat.mtimeMs };
    }),
  );

  // Sort newest first, remove the tail
  withStats.sort((a, b) => b.mtimeMs - a.mtimeMs);
  const toRemove = withStats.slice(input.maxEntries);
  await Promise.all(toRemove.map((entry) => nodeFs.unlink(entry.filePath)));
  return toRemove.length;
}
