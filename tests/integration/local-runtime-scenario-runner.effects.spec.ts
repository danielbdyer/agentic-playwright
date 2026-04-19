import os from 'os';
import path from 'path';
import { promises as fs } from 'fs';
import { Effect } from 'effect';
import { expect, test } from '@playwright/test';
import { createProjectPaths, translationCachePath } from '../../product/application/paths';
import { translationCacheKey } from '../../product/reasoning/translation-cache';
import type { TranslationReceipt, TranslationRequest } from '../../product/domain/resolution/types';
import { createElementId, createScreenId } from '../../product/domain/kernel/identity';
import {
  buildCachedTranslator,
  buildDefaultTranslator,
  bridgeAgentInterpreterForRuntime,
} from '../../product/composition/local-runtime-scenario-runner';

function createRequest(): TranslationRequest {
  return {
    version: 1,
    taskFingerprint: 'sha256:task',
    knowledgeFingerprint: 'sha256:knowledge',
    controlsFingerprint: null,
    normalizedIntent: 'enter policy number => policy number accepted',
    actionText: 'Enter policy number',
    expectedText: 'Policy number accepted',
    allowedActions: ['input'],
    screens: [{
      screen: createScreenId('policy-search'),
      aliases: ['policy search'],
      elements: [{
        element: createElementId('policyNumberInput'),
        aliases: ['policy number'],
        postures: [],
        snapshotTemplates: [],
      }],
    }],
    evidenceRefs: [],
    overlayRefs: [],
  };
}

function createReceipt(): TranslationReceipt {
  return {
    kind: 'translation-receipt',
    version: 1,
    mode: 'structured-translation',
    matched: true,
    selected: {
      kind: 'element',
      target: 'policy-search.policyNumberInput',
      screen: createScreenId('policy-search'),
      element: createElementId('policyNumberInput'),
      aliases: ['policy number'],
      score: 0.92,
      sourceRefs: [],
    },
    candidates: [],
    rationale: 'Matched by test provider',
    failureClass: 'none',
  };
}

test('buildCachedTranslator returns cache miss then hit without behavior loss', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tesseract-cache-'));
  const paths = createProjectPaths(rootDir);
  const request = createRequest();
  let calls = 0;
  const translator = buildCachedTranslator(paths, false, {
    id: 'test-provider',
    kind: 'deterministic',
    translate: () => {
      calls += 1;
      return Effect.succeed(createReceipt());
    },
  });

  const miss = await Effect.runPromise(translator(request));
  const hit = await Effect.runPromise(translator(request));

  expect(miss.cache?.status).toBe('miss');
  expect(hit.cache?.status).toBe('hit');
  expect(calls).toBe(1);
});

test('buildCachedTranslator tolerates malformed cache records and recomputes', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tesseract-bad-cache-'));
  const paths = createProjectPaths(rootDir);
  const request = createRequest();
  const cacheFile = translationCachePath(paths, translationCacheKey(request));
  await fs.mkdir(path.dirname(cacheFile), { recursive: true });
  await fs.writeFile(cacheFile, '{ not-valid-json }', 'utf8');

  let calls = 0;
  const translator = buildCachedTranslator(paths, false, {
    id: 'test-provider',
    kind: 'deterministic',
    translate: () => {
      calls += 1;
      return Effect.succeed(createReceipt());
    },
  });

  const receipt = await Effect.runPromise(translator(request));
  expect(receipt.cache?.status).toBe('miss');
  expect(calls).toBe(1);
});

test('buildDefaultTranslator supports disabled cache status', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tesseract-default-'));
  const paths = createProjectPaths(rootDir);
  const receipt = await Effect.runPromise(buildDefaultTranslator(paths, true)(createRequest()));
  expect(receipt.cache?.status).toBe('disabled');
  expect(receipt.cache?.reason).toBe('cache-disabled');
});

test('bridgeAgentInterpreterForRuntime preserves agent fallback semantics', async () => {
  const runtimeInterpreter = bridgeAgentInterpreterForRuntime({
    id: 'agent-test',
    kind: 'heuristic',
    interpret: () => Effect.succeed({
      interpreted: false,
      target: null,
      confidence: 0.2,
      rationale: 'No confident interpretation',
      proposalDrafts: [],
      provider: 'agent-test',
    }),
  });

  const result = await runtimeInterpreter.interpret({
    actionText: 'Do unknown thing',
    expectedText: 'Unknown result',
    normalizedIntent: 'do unknown thing => unknown result',
    inferredAction: null,
    screens: [],
    exhaustionTrail: [],
    domSnapshot: null,
    priorTarget: null,
    taskFingerprint: 'sha256:task',
    knowledgeFingerprint: 'sha256:knowledge',
  });

  expect(result.interpreted).toBe(false);
  expect(result.target).toBeNull();
});
