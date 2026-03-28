import { expect, test } from '@playwright/test';
import {
  normalizePostureEffects,
  normalizeScreenPostures,
  resolveEffectTargetKind,
  validatePostureContract,
} from '../lib/domain/posture-contract';
import {
  createElementId,
  createPostureId,
  createScreenId,
  createSectionId,
  createSurfaceId,
  createWidgetId,
} from '../lib/domain/identity';
import type { PostureEffect, ScreenElements, ScreenPostures, SurfaceGraph } from '../lib/domain/types';
import { validateScreenElements, validateScreenPostures, validateSurfaceGraph } from '../lib/domain/validation';
import { maybe, mulberry32, pick, randomInt } from './support/random';

const policySearchScreenId = createScreenId('policy-search');
const policyNumberInputId = createElementId('policyNumberInput');
const searchButtonId = createElementId('searchButton');
const elementAId = createElementId('elementA');
const elementBId = createElementId('elementB');
const sharedElementId = createElementId('shared');
const unknownElementId = createElementId('unknown');
const surfaceAId = createSurfaceId('surfaceA');
const sharedSurfaceId = createSurfaceId('shared');
const formSurfaceId = createSurfaceId('form');
const mainSectionId = createSectionId('main');
const validPostureId = createPostureId('valid');
const invalidPostureId = createPostureId('invalid');
const emptyPostureId = createPostureId('empty');
const boundaryPostureId = createPostureId('boundary');
const customPostureId = createPostureId('custom');

function effectSortKey(effect: PostureEffect): string {
  return [effect.targetKind ?? 'element', effect.target, effect.state, effect.message ?? ''].join('|');
}

function buildKnowledge(next: () => number): { elements: ScreenElements; surfaceGraph: SurfaceGraph } {
  const elementIds = ['elementA', 'elementB', 'shared'];
  const surfaceIds = ['surfaceA', 'surfaceB', 'shared'];

  const elements = validateScreenElements({
    screen: policySearchScreenId,
    url: '/policy-search',
    elements: Object.fromEntries(
      elementIds
        .filter(() => next() > 0.25)
        .map((id) => [
          id,
          {
            role: 'textbox',
            name: id,
            testId: null,
            cssFallback: null,
            widget: createWidgetId('os-input'),
            surface: surfaceAId,
          },
        ]),
    ),
  });

  const surfaceGraph = validateSurfaceGraph({
    screen: policySearchScreenId,
    url: '/policy-search',
    sections: {
      main: {
        selector: '#main',
        kind: 'screen-root',
        surfaces: [surfaceAId],
      },
    },
    surfaces: Object.fromEntries(
      surfaceIds
        .filter(() => next() > 0.25)
        .map((id) => [
          id,
          {
            kind: 'form',
            section: mainSectionId,
            selector: `#${id}`,
            parents: [],
            children: [],
            elements: [],
            assertions: ['state'],
          },
        ]),
    ),
  });

  return { elements, surfaceGraph };
}

function buildRandomEffects(next: () => number): PostureEffect[] {
  const targets: Array<PostureEffect['target']> = [
    'self',
    elementAId,
    elementBId,
    surfaceAId,
    pick(next, [sharedElementId, sharedSurfaceId]),
    unknownElementId,
  ];
  const states: PostureEffect['state'][] = ['disabled', 'enabled', 'hidden', 'required-error', 'validation-error', 'visible'];
  const effectCount = 1 + randomInt(next, 8);

  return Array.from({ length: effectCount }, () => {
    const target = pick(next, targets);
    const effect: PostureEffect = {
      target,
      state: pick(next, states),
      targetKind: target === 'self' ? 'self' : maybe(next, pick(next, ['element', 'surface'] as const)),
      message: maybe(next, `message-${randomInt(next, 3)}`) ?? null,
    };

    if (next() > 0.55) {
      return { ...effect };
    }

    return effect;
  });
}

function buildRandomPostures(next: () => number): ScreenPostures {
  const elementIds = [policyNumberInputId, searchButtonId];
  const postureIds = [validPostureId, invalidPostureId, emptyPostureId, boundaryPostureId, customPostureId];
  const postures: Record<string, Record<string, { values: string[]; effects: PostureEffect[] }>> = {};

  for (const elementId of elementIds) {
    if (next() < 0.2) {
      continue;
    }

    const postureMap: Record<string, { values: string[]; effects: PostureEffect[] }> = {};
    const count = 1 + randomInt(next, postureIds.length);

    for (let index = 0; index < count; index += 1) {
      const postureId = postureIds[index % postureIds.length];
      if (!postureId) {
        continue;
      }

      postureMap[postureId] = {
        values: Array.from({ length: randomInt(next, 5) }, () => `value-${randomInt(next, 4)}`),
        effects: buildRandomEffects(next),
      };
    }

    postures[elementId] = postureMap;
  }

  return validateScreenPostures({
    screen: policySearchScreenId,
    postures,
  });
}

test('normalizeScreenPostures is idempotent for randomized posture sets', () => {
  for (let seed = 1; seed <= 75; seed += 1) {
    const next = mulberry32(seed);
    const randomPostures = buildRandomPostures(next);
    const normalized = normalizeScreenPostures(randomPostures);
    const normalizedAgain = normalizeScreenPostures(normalized);
    expect(normalizedAgain).toEqual(normalized);
  }
});

test('normalizePostureEffects is idempotent and preserves stable sorted order', () => {
  for (let seed = 50; seed <= 140; seed += 1) {
    const next = mulberry32(seed);
    const input = buildRandomEffects(next);

    const normalized = normalizePostureEffects(input);
    const normalizedAgain = normalizePostureEffects(normalized);
    expect(normalizedAgain).toEqual(normalized);

    const keys = normalized.map((effect) => effectSortKey(effect));
    const sortedKeys = [...keys].sort((left, right) => left.localeCompare(right));
    expect(keys).toEqual(sortedKeys);
    expect(new Set(keys).size).toBe(keys.length);
  }
});

test('normalizePostureEffects eliminates duplicates using deterministic effect sort keys', () => {
  const normalized = normalizePostureEffects([
    { target: sharedSurfaceId, targetKind: 'surface', state: 'visible', message: null },
    { target: sharedSurfaceId, targetKind: 'surface', state: 'visible', message: null },
    { target: sharedElementId, targetKind: 'element', state: 'visible', message: null },
    { target: 'self', state: 'validation-error', message: null },
    { target: 'self', targetKind: 'self', state: 'validation-error', message: null },
  ]);

  expect(normalized).toEqual([
    { target: sharedElementId, targetKind: 'element', state: 'visible', message: null },
    { target: 'self', targetKind: 'self', state: 'validation-error', message: null },
    { target: sharedSurfaceId, targetKind: 'surface', state: 'visible', message: null },
  ]);
});

test('resolveEffectTargetKind prioritizes explicit target kind and otherwise infers from knowledge', () => {
  for (let seed = 200; seed <= 260; seed += 1) {
    const next = mulberry32(seed);
    const { elements, surfaceGraph } = buildKnowledge(next);

    expect(
      resolveEffectTargetKind({
        effect: { target: unknownElementId, targetKind: 'surface', state: 'visible' },
        elements,
        surfaceGraph,
      }),
    ).toBe('surface');

    expect(
      resolveEffectTargetKind({
        effect: { target: unknownElementId, targetKind: 'element', state: 'visible' },
        elements,
        surfaceGraph,
      }),
    ).toBe('element');

    expect(
      resolveEffectTargetKind({
        effect: { target: 'self', state: 'visible' },
        elements,
        surfaceGraph,
      }),
    ).toBe('self');

    const inferred = resolveEffectTargetKind({
      effect: { target: sharedElementId, state: 'visible' },
      elements,
      surfaceGraph,
    });
    const hasElement = Boolean(elements.elements[sharedElementId]);
    const hasSurface = Boolean(surfaceGraph.surfaces[sharedSurfaceId]);

    if (hasElement && hasSurface) {
      expect(inferred).toBe('ambiguous');
    } else if (hasElement) {
      expect(inferred).toBe('element');
    } else if (hasSurface) {
      expect(inferred).toBe('surface');
    } else {
      expect(inferred).toBe('unknown');
    }
  }
});

test('validatePostureContract emits stable issues for randomized normalized inputs', () => {
  for (let seed = 350; seed <= 420; seed += 1) {
    const next = mulberry32(seed);
    const { elements, surfaceGraph } = buildKnowledge(next);

    const postures = validateScreenPostures({
      screen: policySearchScreenId,
      postures: {
        [policyNumberInputId]: {
          [invalidPostureId]: {
            values: Array.from({ length: randomInt(next, 3) }, (_, index) => `v-${index}`),
            effects: buildRandomEffects(next),
          },
        },
      },
    });

    const firstPass = validatePostureContract({
      elementId: policyNumberInputId,
      postureId: invalidPostureId,
      postures,
      elements,
      surfaceGraph,
    });

    const secondPass = validatePostureContract({
      elementId: policyNumberInputId,
      postureId: invalidPostureId,
      postures,
      elements,
      surfaceGraph,
    });

    expect(secondPass).toEqual(firstPass);
  }
});

test('validatePostureContract regression: ambiguous-effect-target', () => {
  const postures = validateScreenPostures({
    screen: policySearchScreenId,
    postures: {
      [policyNumberInputId]: {
        [invalidPostureId]: {
          values: ['bad-value'],
          effects: [{ target: sharedElementId, state: 'visible' }],
        },
      },
    },
  });

  const elements = validateScreenElements({
    screen: policySearchScreenId,
    url: '/policy-search',
    elements: {
      [sharedElementId]: {
        role: 'alert',
        name: null,
        testId: null,
        cssFallback: null,
        widget: createWidgetId('os-region'),
        surface: formSurfaceId,
      },
    },
  });

  const surfaceGraph = validateSurfaceGraph({
    screen: policySearchScreenId,
    url: '/policy-search',
    sections: {
      [mainSectionId]: {
        selector: '#main',
        kind: 'screen-root',
        surfaces: [sharedSurfaceId],
      },
    },
    surfaces: {
      [sharedSurfaceId]: {
        kind: 'validation-region',
        section: mainSectionId,
        selector: '#shared',
        parents: [],
        children: [],
        elements: [],
        assertions: ['state'],
      },
    },
  });

  expect(
    validatePostureContract({
      elementId: policyNumberInputId,
      postureId: invalidPostureId,
      postures,
      elements,
      surfaceGraph,
    }),
  ).toEqual([
    {
      code: 'ambiguous-effect-target',
      elementId: policyNumberInputId,
      postureId: invalidPostureId,
      target: sharedElementId,
    },
  ]);
});

test('validatePostureContract regression: missing-posture-values', () => {
  const issues = validatePostureContract({
    elementId: policyNumberInputId,
    postureId: invalidPostureId,
    postures: validateScreenPostures({
      screen: policySearchScreenId,
      postures: {
        [policyNumberInputId]: {
          [invalidPostureId]: {
            values: [],
            effects: [{ target: 'self', state: 'validation-error' }],
          },
        },
      },
    }),
    elements: validateScreenElements({
      screen: policySearchScreenId,
      url: '/policy-search',
      elements: {},
    }),
    surfaceGraph: validateSurfaceGraph({
      screen: policySearchScreenId,
      url: '/policy-search',
      sections: {},
      surfaces: {},
    }),
  });

  expect(issues).toEqual([
    {
      code: 'missing-posture-values',
      elementId: policyNumberInputId,
      postureId: invalidPostureId,
    },
  ]);
});

test('validatePostureContract regression: unknown-posture', () => {
  const issues = validatePostureContract({
    elementId: policyNumberInputId,
    postureId: invalidPostureId,
    postures: validateScreenPostures({
      screen: policySearchScreenId,
      postures: {},
    }),
    elements: validateScreenElements({
      screen: policySearchScreenId,
      url: '/policy-search',
      elements: {},
    }),
    surfaceGraph: validateSurfaceGraph({
      screen: policySearchScreenId,
      url: '/policy-search',
      sections: {},
      surfaces: {},
    }),
  });

  expect(issues).toEqual([
    {
      code: 'unknown-posture',
      elementId: policyNumberInputId,
      postureId: invalidPostureId,
    },
  ]);
});
