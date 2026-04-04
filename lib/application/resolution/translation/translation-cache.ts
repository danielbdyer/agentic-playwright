import { sha256, stableStringify } from '../../../domain/kernel/hash';
import type { TranslationReceipt, TranslationRequest } from '../../../domain/resolution/types';
import { readJsonCacheRecord, writeJsonCacheRecord, pruneCacheFiles } from '../../cache/file-cache';
import type { ProjectPaths } from '../../paths';
import { translationCachePath } from '../../paths';

export interface TranslationCacheRecord {
  kind: 'translation-cache-record';
  version: 1;
  stage: 'resolution';
  scope: 'translation';
  cacheKey: string;
  fingerprint: string;
  fingerprints: {
    task: string;
    knowledge: string;
    controls: string | null;
    request: string;
  };
  lineage: {
    parents: string[];
    sources: string[];
    handshakes: ['preparation', 'resolution'];
  };
  payload: {
    receipt: TranslationReceipt;
  };
}

function isTranslationCacheRecord(value: unknown): value is TranslationCacheRecord {
  return typeof value === 'object' && value !== null && (value as { kind?: unknown }).kind === 'translation-cache-record';
}

function requestFingerprint(request: TranslationRequest): string {
  return `sha256:${sha256(stableStringify({
    actionText: request.actionText,
    expectedText: request.expectedText,
    allowedActions: request.allowedActions,
    screens: request.screens,
    overlayRefs: request.overlayRefs,
    evidenceRefs: request.evidenceRefs,
  }))}`;
}

export function translationCacheKey(request: TranslationRequest): string {
  return `translation-${sha256(stableStringify({
    task: request.taskFingerprint,
    knowledge: request.knowledgeFingerprint,
    controls: request.controlsFingerprint ?? null,
    request: requestFingerprint(request),
  }))}`;
}

export function readTranslationCache(input: {
  paths: ProjectPaths;
  request: TranslationRequest;
}) {
  const key = translationCacheKey(input.request);
  return readJsonCacheRecord<TranslationCacheRecord>({
    filePath: translationCachePath(input.paths, key),
    cacheKey: key,
    isRecord: isTranslationCacheRecord,
  });
}

export function writeTranslationCache(input: {
  paths: ProjectPaths;
  request: TranslationRequest;
  receipt: TranslationReceipt;
}) {
  const key = translationCacheKey(input.request);
  const cacheFile = translationCachePath(input.paths, key);
  const fingerprint = requestFingerprint(input.request);
  const record: TranslationCacheRecord = {
    kind: 'translation-cache-record',
    version: 1,
    stage: 'resolution',
    scope: 'translation',
    cacheKey: key,
    fingerprint: `sha256:${sha256(stableStringify({ key, receipt: input.receipt, fingerprint }))}`,
    fingerprints: {
      task: input.request.taskFingerprint,
      knowledge: input.request.knowledgeFingerprint,
      controls: input.request.controlsFingerprint ?? null,
      request: fingerprint,
    },
    lineage: {
      parents: [input.request.taskFingerprint],
      sources: [input.request.knowledgeFingerprint, ...(input.request.controlsFingerprint ? [input.request.controlsFingerprint] : [])],
      handshakes: ['preparation', 'resolution'],
    },
    payload: {
      receipt: input.receipt,
    },
  };

  return writeJsonCacheRecord({
    dirPath: input.paths.translationCacheDir,
    filePath: cacheFile,
    record,
  });
}

/**
 * Prune the translation cache to at most `maxEntries` files, keeping the
 * most recently modified entries. Returns the number of entries removed.
 */
export function pruneTranslationCache(input: {
  paths: ProjectPaths;
  maxEntries: number;
}) {
  return pruneCacheFiles({
    dirPath: input.paths.translationCacheDir,
    maxEntries: input.maxEntries,
    includeFile: (fileName) => fileName.endsWith('.translation.json'),
  });
}
