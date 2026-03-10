import { promises as nodeFs } from 'fs';
import { sha256, stableStringify } from '../domain/hash';
import type { TranslationReceipt, TranslationRequest } from '../domain/types';
import type { ProjectPaths } from './paths';
import { translationCachePath } from './paths';

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

export async function readTranslationCache(input: {
  paths: ProjectPaths;
  request: TranslationRequest;
}): Promise<TranslationCacheRecord | null> {
  const key = translationCacheKey(input.request);
  const cacheFile = translationCachePath(input.paths, key);
  try {
    const value = JSON.parse(await nodeFs.readFile(cacheFile, 'utf8')) as TranslationCacheRecord;
    if (value?.kind !== 'translation-cache-record' || value.cacheKey !== key) {
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

export async function writeTranslationCache(input: {
  paths: ProjectPaths;
  request: TranslationRequest;
  receipt: TranslationReceipt;
}): Promise<TranslationCacheRecord> {
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

  await nodeFs.mkdir(input.paths.translationCacheDir, { recursive: true });
  await nodeFs.writeFile(cacheFile, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  return record;
}
