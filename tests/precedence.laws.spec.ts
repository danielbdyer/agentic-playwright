import { expect, test } from '@playwright/test';
import { createElementId, createScreenId, createSurfaceId, createWidgetId } from '../lib/domain/identity';
import type { StepTask } from '../lib/domain/types';
import { rankActionCandidates } from '../lib/runtime/agent/candidate-lattice';
import { selectedControlResolution } from '../lib/runtime/agent/select-controls';
import { runResolutionPipeline } from '../lib/runtime/agent';

function buildTask(overrides: Partial<StepTask> = {}): StepTask {
  const policyScreen = {
    screen: createScreenId('policy-search'),
    url: '/policy-search',
    screenAliases: ['policy search', 'policy lookup'],
    knowledgeRefs: ['knowledge/surfaces/policy-search.surface.yaml'],
    supplementRefs: ['knowledge/screens/policy-search.hints.yaml'],
    elements: [
      {
        element: createElementId('policyNumberInput'),
        role: 'textbox',
        name: 'Policy Number',
        surface: createSurfaceId('search-form'),
        widget: createWidgetId('os-input'),
        affordance: 'text-entry',
        aliases: ['policy ref', 'policy number'],
        locator: [],
        postures: [],
        defaultValueRef: null,
        parameter: null,
        snapshotAliases: {},
      },
    ],
    sectionSnapshots: [],
  };

  return {
    index: 1,
    intent: 'Enter policy reference',
    actionText: 'Enter policy ref',
    expectedText: 'Policy ref is accepted',
    normalizedIntent: 'enter policy ref => policy ref is accepted',
    allowedActions: ['input', 'click'],
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
          click: { id: 'core.click', aliases: ['click', 'select'] },
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
      screens: [policyScreen],
      evidenceRefs: [],
      confidenceOverlays: [],
      controls: {
        datasets: [],
        resolutionControls: [
          { name: 'alpha-control', artifactPath: 'controls/resolution/alpha.resolution.yaml', stepIndex: 1, resolution: { action: 'click' } },
          { name: 'beta-control', artifactPath: 'controls/resolution/beta.resolution.yaml', stepIndex: 1, resolution: { action: 'input' } },
        ],
        runbooks: [
          {
            name: 'alpha-runbook',
            artifactPath: 'controls/runbooks/alpha.runbook.yaml',
            isDefault: true,
            selector: { adoIds: [], suites: [], tags: [] },
            interpreterMode: null,
            dataset: null,
            resolutionControl: 'alpha-control',
            translationEnabled: true,
            translationCacheEnabled: true,
            providerId: null,
          },
          {
            name: 'beta-runbook',
            artifactPath: 'controls/runbooks/beta.runbook.yaml',
            isDefault: false,
            selector: { adoIds: [], suites: [], tags: [] },
            interpreterMode: null,
            dataset: null,
            resolutionControl: 'beta-control',
            translationEnabled: true,
            translationCacheEnabled: true,
            providerId: null,
          },
        ],
      },
    },
    taskFingerprint: 'sha256:task',
    ...overrides,
  };
}

test('explicit always outranks control for the same resolution concern', () => {
  const task = buildTask({
    explicitResolution: { action: 'click' },
    controlResolution: { action: 'input' },
  });
  const ranked = rankActionCandidates(task, task.controlResolution);
  expect(ranked.selected?.source).toBe('explicit');
  expect(ranked.selected?.value).toBe('click');
});

test('control selection obeys runbook scoping deterministically under permutation', () => {
  const base = buildTask();
  const permuted = buildTask({
    runtimeKnowledge: {
      ...base.runtimeKnowledge!,
      controls: {
        ...base.runtimeKnowledge!.controls,
        resolutionControls: [...base.runtimeKnowledge!.controls.resolutionControls].reverse(),
        runbooks: [...base.runtimeKnowledge!.controls.runbooks].reverse(),
      },
    },
  });

  const context = {
    provider: 'test',
    mode: 'diagnostic',
    runAt: '2026-03-10T00:00:00.000Z',
    controlSelection: { runbook: 'beta-runbook' },
  };

  expect(selectedControlResolution(base, context)?.action).toBe('input');
  expect(selectedControlResolution(permuted, context)?.action).toBe('input');
});

test('needs-human is emitted only after machine rungs are exhausted', async () => {
  const task = buildTask({
    allowedActions: ['custom'],
    actionText: 'Do unsupported thing',
    runtimeKnowledge: {
      ...buildTask().runtimeKnowledge!,
      screens: [],
      controls: { datasets: [], resolutionControls: [], runbooks: [] },
    },
  });

  const receipt = await runResolutionPipeline(task, {
    provider: 'test',
    mode: 'diagnostic',
    runAt: '2026-03-10T00:00:00.000Z',
  });

  expect(receipt.kind).toBe('needs-human');
  const stages = receipt.exhaustion.map((entry) => entry.stage);
  expect(stages).toContain('structured-translation');
  expect(stages).toContain('live-dom');
  expect(stages.at(-1)).toBe('safe-degraded-resolution');
});

test('deterministic ordering stability holds under candidate permutation', () => {
  const left = buildTask({
    explicitResolution: null,
    controlResolution: null,
  });
  const right = buildTask({
    explicitResolution: null,
    controlResolution: null,
    runtimeKnowledge: {
      ...left.runtimeKnowledge!,
      sharedPatterns: {
        ...left.runtimeKnowledge!.sharedPatterns,
        actions: {
          navigate: { id: 'core.navigate', aliases: ['navigate'] },
          click: { id: 'core.click', aliases: ['select', 'click'] },
          input: { id: 'core.input', aliases: ['type', 'input', 'enter'] },
          'assert-snapshot': { id: 'core.assert-snapshot', aliases: ['verify'] },
        },
      },
    },
  });

  const leftRank = rankActionCandidates(left, null);
  const rightRank = rankActionCandidates(right, null);

  expect(leftRank.selected?.value).toBe(rightRank.selected?.value);
  expect(leftRank.ranked.map((entry) => entry.value)).toEqual(rightRank.ranked.map((entry) => entry.value));
});
