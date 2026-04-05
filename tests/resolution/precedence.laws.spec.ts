import { expect, test } from '@playwright/test';
import { rankActionCandidates } from '../../lib/runtime/resolution/candidate-lattice';
import { selectedControlResolution } from '../../lib/runtime/resolution/select-controls';
import { runResolutionPipeline } from '../../lib/runtime/resolution';
import { chooseByPrecedence, routeSelectionPrecedenceLaw } from '../../lib/domain/resolution/precedence';
import { cloneJson, createAgentContext, createInterfaceResolutionContext, createGroundedStep } from '../support/interface-fixtures';

function buildContextWithControls() {
  return createInterfaceResolutionContext({
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
  });
}

test('explicit always outranks control for the same resolution concern', () => {
  const resolutionContext = buildContextWithControls();
  const task = createGroundedStep({
    explicitResolution: { action: 'click' },
    controlResolution: { action: 'input' },
  }, resolutionContext);
  const ranked = rankActionCandidates(task, task.controlResolution, resolutionContext);
  expect(ranked.selected?.source).toBe('explicit');
  expect(ranked.selected?.value).toBe('click');
});

test('control selection obeys runbook scoping deterministically under permutation', () => {
  const baseContext = buildContextWithControls();
  const permutedContext = cloneJson(baseContext);
  permutedContext.controls = {
    ...permutedContext.controls,
    resolutionControls: [...permutedContext.controls.resolutionControls].reverse(),
    runbooks: [...permutedContext.controls.runbooks].reverse(),
  };
  const base = createGroundedStep({}, baseContext);
  const permuted = createGroundedStep({}, permutedContext);

  const context = createAgentContext(baseContext, {
    controlSelection: { runbook: 'beta-runbook' },
  });
  const permutedAgentContext = createAgentContext(permutedContext, {
    controlSelection: { runbook: 'beta-runbook' },
  });

  expect(selectedControlResolution(base, context)?.action).toBe('input');
  expect(selectedControlResolution(permuted, permutedAgentContext)?.action).toBe('input');
});

test('needs-human is emitted only after machine rungs are exhausted', async () => {
  const resolutionContext = createInterfaceResolutionContext({
    screens: [],
    controls: { datasets: [], resolutionControls: [], runbooks: [] },
  });
  const task = createGroundedStep({
    allowedActions: ['custom'],
    actionText: 'Do unsupported thing',
    grounding: {
      targetRefs: [],
      selectorRefs: [],
      fallbackSelectorRefs: [],
      routeVariantRefs: [],
      assertionAnchors: [],
      effectAssertions: [],
      requiredStateRefs: [],
      forbiddenStateRefs: [],
      eventSignatureRefs: [],
      expectedTransitionRefs: [],
      resultStateRefs: [],
    },
  }, resolutionContext);

  const { receipt } = await runResolutionPipeline(task, createAgentContext(resolutionContext));

  expect(receipt.kind).toBe('needs-human');
  const stages = receipt.exhaustion.map((entry) => entry.stage);
  expect(stages).toContain('structured-translation');
  expect(stages).toContain('live-dom');
  expect(stages.at(-1)).toBe('needs-human');
});

test('deterministic ordering stability holds under candidate permutation', () => {
  const leftContext = createInterfaceResolutionContext();
  const rightContext = createInterfaceResolutionContext({
    sharedPatterns: {
      ...leftContext.sharedPatterns,
      actions: {
        navigate: { id: 'core.navigate', aliases: ['navigate'] },
        click: { id: 'core.click', aliases: ['select', 'click'] },
        input: { id: 'core.input', aliases: ['type', 'input', 'enter'] },
        'assert-snapshot': { id: 'core.assert-snapshot', aliases: ['verify'] },
      },
    },
  });
  const left = createGroundedStep({
    explicitResolution: null,
    controlResolution: null,
  }, leftContext);
  const right = createGroundedStep({
    explicitResolution: null,
    controlResolution: null,
  }, rightContext);

  const leftRank = rankActionCandidates(left, null, leftContext);
  const rightRank = rankActionCandidates(right, null, rightContext);

  expect(leftRank.selected?.value).toBe(rightRank.selected?.value);
  expect(leftRank.ranked.map((entry) => entry.value)).toEqual(rightRank.ranked.map((entry) => entry.value));
});

test('route selection precedence: explicit URL outranks runbook and route knowledge', () => {
  const selected = chooseByPrecedence(
    [
      { rung: 'route-knowledge', value: '/orders?tab=open' },
      { rung: 'runbook-binding', value: '/orders?tab=all' },
      { rung: 'explicit-url', value: '/orders?tab=assigned' },
      { rung: 'screen-default', value: '/orders' },
    ],
    routeSelectionPrecedenceLaw,
  );
  expect(selected).toBe('/orders?tab=assigned');
});
