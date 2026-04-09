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

import { fingerprintFor, taggedFingerprintFor } from '../../domain/kernel/hash';
import type { AgentInterpretationResult } from '../../domain/interpretation/agent-interpreter';
import { readJsonCacheRecord, writeJsonCacheRecord, pruneCacheFiles } from '../cache/file-cache';
import type { ProjectPaths } from '../paths';
import { agentInterpretationCachePath } from '../paths';

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

function isAgentInterpretationCacheRecord(value: unknown): value is AgentInterpretationCacheRecord {
  return typeof value === 'object' && value !== null && (value as { kind?: unknown }).kind === 'agent-interpretation-cache-record';
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
  return taggedFingerprintFor('content', {
    actionText: input.actionText,
    expectedText: input.expectedText,
    normalizedIntent: input.normalizedIntent,
  });
}

/**
 * Compute the cache key from task fingerprint, knowledge fingerprint,
 * and the request content fingerprint. Knowledge changes invalidate entries.
 */
export function agentInterpretationCacheKey(input: AgentInterpretationCacheKeyInput): string {
  return `agent-interp-${fingerprintFor('agent-interp-cache-key', {
    task: input.taskFingerprint,
    knowledge: input.knowledgeFingerprint,
    request: requestFingerprint(input),
  })}`;
}

// ─── Read / Write ───

export function readAgentInterpretationCache(input: {
  readonly paths: ProjectPaths;
  readonly request: AgentInterpretationCacheKeyInput;
}) {
  const key = agentInterpretationCacheKey(input.request);
  return readJsonCacheRecord<AgentInterpretationCacheRecord>({
    filePath: agentInterpretationCachePath(input.paths, key),
    cacheKey: key,
    isRecord: isAgentInterpretationCacheRecord,
  });
}

export function writeAgentInterpretationCache(input: {
  readonly paths: ProjectPaths;
  readonly request: AgentInterpretationCacheKeyInput;
  readonly result: AgentInterpretationResult;
}) {
  const key = agentInterpretationCacheKey(input.request);
  const cacheFile = agentInterpretationCachePath(input.paths, key);
  const fingerprint = requestFingerprint(input.request);
  const record: AgentInterpretationCacheRecord = {
    kind: 'agent-interpretation-cache-record',
    version: 1,
    stage: 'resolution',
    scope: 'agent-interpretation',
    cacheKey: key,
    fingerprint: taggedFingerprintFor('artifact', { key, result: input.result, fingerprint }),
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

  return writeJsonCacheRecord({
    dirPath: input.paths.agentInterpretationCacheDir,
    filePath: cacheFile,
    record,
  });
}

/**
 * Prune the agent interpretation cache to at most `maxEntries` files,
 * keeping the most recently modified entries. Returns the number removed.
 */
export function pruneAgentInterpretationCache(input: {
  readonly paths: ProjectPaths;
  readonly maxEntries: number;
}) {
  return pruneCacheFiles({
    dirPath: input.paths.agentInterpretationCacheDir,
    maxEntries: input.maxEntries,
    includeFile: (fileName) => fileName.endsWith('.agent-interpretation.json'),
  });
}
