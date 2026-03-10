import { expect, test } from '@playwright/test';
import { translationCacheKey } from '../lib/application/translation-cache';
import type { StepTask, TranslationRequest } from '../lib/domain/types';
import { createElementId, createScreenId } from '../lib/domain/identity';
import { deterministicRuntimeStepAgent } from '../lib/runtime/agent';

function baseRequest(): TranslationRequest {
  return {
    version: 1,
    taskFingerprint: 'sha256:task-a',
    knowledgeFingerprint: 'sha256:knowledge-a',
    controlsFingerprint: 'sha256:controls-a',
    normalizedIntent: 'enter policy number',
    actionText: 'Enter policy number',
    expectedText: 'Field accepts value',
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

test('translation cache key is stable for equivalent inputs', () => {
  const first = baseRequest();
  const second = JSON.parse(JSON.stringify(baseRequest())) as TranslationRequest;
  expect(translationCacheKey(first)).toBe(translationCacheKey(second));
});

test('translation cache key invalidates when fingerprints change', () => {
  const base = baseRequest();
  const changedKnowledge = { ...base, knowledgeFingerprint: 'sha256:knowledge-b' };
  const changedTask = { ...base, taskFingerprint: 'sha256:task-b' };

  expect(translationCacheKey(base)).not.toBe(translationCacheKey(changedKnowledge));
  expect(translationCacheKey(base)).not.toBe(translationCacheKey(changedTask));
});

test('translation-disabled replay is reproducible for runtime interpretation', async () => {
  const task: StepTask = {
    index: 1,
    intent: 'Enter policy number into search box',
    actionText: 'Enter policy number into search box',
    expectedText: 'Policy number should be accepted',
    normalizedIntent: 'enter policy number into search box => policy number should be accepted',
    allowedActions: ['input'],
    explicitResolution: null,
    controlResolution: null,
    taskFingerprint: 'sha256:task',
    runtimeKnowledge: {
      knowledgeFingerprint: 'sha256:knowledge',
      confidenceFingerprint: 'sha256:confidence',
      sharedPatterns: {
        version: 1,
        actions: {},
        postures: {},
        documents: [],
        sources: { actions: {}, postures: {} },
      },
      screens: [],
      evidenceRefs: [],
      confidenceOverlays: [],
      controls: { datasets: [], resolutionControls: [], runbooks: [] },
    } as StepTask['runtimeKnowledge'],
  };

  const context = {
    provider: 'deterministic-runtime-step-agent',
    mode: 'diagnostic',
    runAt: '2024-01-01T00:00:00.000Z',
    translate: undefined,
  };

  const first = await deterministicRuntimeStepAgent.resolve(task, context);
  const second = await deterministicRuntimeStepAgent.resolve(task, context);

  expect(first).toEqual(second);
  expect(first.translation).toBeNull();
  expect(first.kind).toBe('needs-human');
});
