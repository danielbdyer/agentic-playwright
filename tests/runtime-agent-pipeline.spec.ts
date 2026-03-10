import { expect, test } from '@playwright/test';
import { createElementId, createScreenId, createSurfaceId, createWidgetId } from '../lib/domain/identity';
import type { StepTask } from '../lib/domain/types';
import { RESOLUTION_PRECEDENCE, runResolutionPipeline } from '../lib/runtime/agent';

function baseStep(): StepTask {
  return {
    index: 2,
    intent: 'Enter policy reference',
    actionText: 'Enter policy ref',
    expectedText: 'Policy ref is accepted',
    normalizedIntent: 'enter policy ref => policy ref is accepted',
    allowedActions: ['input'],
    explicitResolution: null,
    controlResolution: null,
    runtimeKnowledge: {
      knowledgeFingerprint: 'sha256:knowledge',
      confidenceFingerprint: 'sha256:confidence',
      sharedPatterns: {
        version: 1,
        actions: {
          navigate: { id: 'core.navigate', aliases: ['navigate'] },
          input: { id: 'core.input', aliases: ['enter', 'input', 'type'] },
          click: { id: 'core.click', aliases: ['click'] },
          'assert-snapshot': { id: 'core.assert-snapshot', aliases: ['verify'] },
        },
        postures: {},
        documents: ['knowledge/patterns/core.patterns.yaml'],
        sources: {
          actions: {
            navigate: 'knowledge/patterns/core.patterns.yaml',
            input: 'knowledge/patterns/core.patterns.yaml',
            click: 'knowledge/patterns/core.patterns.yaml',
            'assert-snapshot': 'knowledge/patterns/core.patterns.yaml',
          },
          postures: {},
        },
      },
      screens: [{
        screen: createScreenId('policy-search'),
        url: '/policy-search',
        screenAliases: ['policy search'],
        knowledgeRefs: ['knowledge/surfaces/policy-search.surface.yaml', 'knowledge/screens/policy-search.elements.yaml'],
        supplementRefs: ['knowledge/screens/policy-search.hints.yaml'],
        elements: [{
          element: createElementId('policyNumberInput'),
          role: 'textbox',
          name: 'Policy Number',
          surface: createSurfaceId('search-form'),
          widget: createWidgetId('os-input'),
          affordance: 'text-entry',
          aliases: ['policy number', 'policy ref'],
          locator: [],
          postures: [],
          defaultValueRef: null,
          parameter: null,
          snapshotAliases: {},
        }],
        sectionSnapshots: [],
      }],
      evidenceRefs: ['.tesseract/evidence/runs/10001/seed/step-2-0.json'],
      confidenceOverlays: [{
        id: 'overlay-policy-ref',
        artifactType: 'hints',
        artifactPath: 'knowledge/screens/policy-search.hints.yaml',
        score: 0.95,
        threshold: 0.9,
        status: 'approved-equivalent',
        successCount: 4,
        failureCount: 0,
        evidenceCount: 1,
        screen: createScreenId('policy-search'),
        element: createElementId('policyNumberInput'),
        posture: null,
        snapshotTemplate: null,
        learnedAliases: ['policy ref'],
        sourceRunId: 'run-1',
        sourceStepIndex: 2,
      }],
      controls: {
        datasets: [],
        resolutionControls: [],
        runbooks: [],
      },
    },
    taskFingerprint: 'sha256:task',
  };
}

test('resolution pipeline precedence is explicit and stable', () => {
  expect(RESOLUTION_PRECEDENCE).toEqual([
    'explicit',
    'control',
    'approved-knowledge',
    'overlays',
    'translation',
    'live-dom',
    'needs-human',
  ]);
});

test('overlay resolution short-circuits translation and preserves receipt fields', async () => {
  let translateCalls = 0;
  const receipt = await runResolutionPipeline(baseStep(), {
    provider: 'test-agent',
    mode: 'diagnostic',
    runAt: '2026-03-09T00:00:00.000Z',
    translate: () => {
      translateCalls += 1;
      return {
        version: 1,
        matched: true,
        rationale: 'should not run',
        selected: null,
        candidates: [],
      };
    },
  });

  expect(receipt.kind).toBe('resolved');
  expect(receipt.winningSource).toBe('approved-equivalent');
  expect(receipt.overlayRefs).toContain('overlay-policy-ref');
  expect(receipt.translation).toBeNull();
  expect(translateCalls).toBe(0);
});
