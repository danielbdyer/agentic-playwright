import { expect, test } from '@playwright/test';
import {
  normalizePostureEffects,
  normalizeScreenPostures,
  resolveEffectTargetKind,
  validatePostureContract,
} from '../lib/domain/posture-contract';
import { PostureEffect, ScreenElements, ScreenPostures, SurfaceGraph } from '../lib/domain/types';

function mulberry32(seed: number): () => number {
  let current = seed >>> 0;
  return () => {
    current = (current + 0x6D2B79F5) >>> 0;
    let t = Math.imul(current ^ (current >>> 15), 1 | current);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomInt(next: () => number, max: number): number {
  return Math.floor(next() * max);
}

function pick<T>(next: () => number, values: T[]): T {
  return values[randomInt(next, values.length)];
}

function maybe<T>(next: () => number, value: T): T | undefined {
  return next() > 0.5 ? value : undefined;
}

function effectSortKey(effect: PostureEffect): string {
  return [effect.targetKind ?? 'element', effect.target, effect.state, effect.message ?? ''].join('|');
}

function buildKnowledge(next: () => number): { elements: ScreenElements; surfaceGraph: SurfaceGraph } {
  const elementIds = ['elementA', 'elementB', 'shared'];
  const surfaceIds = ['surfaceA', 'surfaceB', 'shared'];

  const elements: ScreenElements = {
    screen: 'policy-search',
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
            widget: 'os-input',
            surface: 'surfaceA',
          },
        ]),
    ),
  };

  const surfaceGraph: SurfaceGraph = {
    screen: 'policy-search',
    url: '/policy-search',
    sections: {
      main: {
        selector: '#main',
        kind: 'screen-root',
        surfaces: ['surfaceA'],
      },
    },
    surfaces: Object.fromEntries(
      surfaceIds
        .filter(() => next() > 0.25)
        .map((id) => [
          id,
          {
            kind: 'form',
            section: 'main',
            selector: `#${id}`,
            parents: [],
            children: [],
            elements: [],
            assertions: ['state'],
          },
        ]),
    ),
  };

  return { elements, surfaceGraph };
}

function buildRandomEffects(next: () => number): PostureEffect[] {
  const targets: Array<PostureEffect['target']> = ['self', 'elementA', 'elementB', 'surfaceA', 'shared', 'unknown'];
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
  const elementIds = ['policyNumberInput', 'searchButton'];
  const postureIds = ['valid', 'invalid', 'empty', 'boundary', 'custom'];

  const postures: ScreenPostures['postures'] = {};

  for (const elementId of elementIds) {
    if (next() < 0.2) {
      continue;
    }

    const postureMap: Record<string, { values: string[]; effects: PostureEffect[] }> = {};
    const count = 1 + randomInt(next, postureIds.length);

    for (let index = 0; index < count; index += 1) {
      const postureId = postureIds[index % postureIds.length];
      postureMap[postureId] = {
        values: Array.from({ length: randomInt(next, 5) }, () => `value-${randomInt(next, 4)}`),
        effects: buildRandomEffects(next),
      };
    }

    postures[elementId] = postureMap;
  }

  return {
    screen: 'policy-search',
    postures,
  };
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
    { target: 'shared', targetKind: 'surface', state: 'visible', message: null },
    { target: 'shared', targetKind: 'surface', state: 'visible', message: null },
    { target: 'shared', targetKind: 'element', state: 'visible', message: null },
    { target: 'self', state: 'validation-error', message: null },
    { target: 'self', targetKind: 'self', state: 'validation-error', message: null },
  ]);

  expect(normalized).toEqual([
    { target: 'shared', targetKind: 'element', state: 'visible', message: null },
    { target: 'self', targetKind: 'self', state: 'validation-error', message: null },
    { target: 'shared', targetKind: 'surface', state: 'visible', message: null },
  ]);
});

test('resolveEffectTargetKind prioritizes explicit target kind and otherwise infers from knowledge', () => {
  for (let seed = 200; seed <= 260; seed += 1) {
    const next = mulberry32(seed);
    const { elements, surfaceGraph } = buildKnowledge(next);

    expect(
      resolveEffectTargetKind({
        effect: { target: 'unknown', targetKind: 'surface', state: 'visible' },
        elements,
        surfaceGraph,
      }),
    ).toBe('surface');

    expect(
      resolveEffectTargetKind({
        effect: { target: 'unknown', targetKind: 'element', state: 'visible' },
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
      effect: { target: 'shared', state: 'visible' },
      elements,
      surfaceGraph,
    });
    const hasElement = Boolean(elements.elements.shared);
    const hasSurface = Boolean(surfaceGraph.surfaces.shared);

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

    const postures = normalizeScreenPostures({
      screen: 'policy-search',
      postures: {
        policyNumberInput: {
          invalid: {
            values: Array.from({ length: randomInt(next, 3) }, (_, index) => `v-${index}`),
            effects: buildRandomEffects(next),
          },
        },
      },
    });

    const firstPass = validatePostureContract({
      elementId: 'policyNumberInput',
      postureId: 'invalid',
      postures,
      elements,
      surfaceGraph,
    });

    const secondPass = validatePostureContract({
      elementId: 'policyNumberInput',
      postureId: 'invalid',
      postures,
      elements,
      surfaceGraph,
    });

    expect(secondPass).toEqual(firstPass);
  }
});

test('validatePostureContract regression: ambiguous-effect-target', () => {
  const postures = normalizeScreenPostures({
    screen: 'policy-search',
    postures: {
      policyNumberInput: {
        invalid: {
          values: ['bad-value'],
          effects: [{ target: 'shared', state: 'visible' }],
        },
      },
    },
  });

  const elements: ScreenElements = {
    screen: 'policy-search',
    url: '/policy-search',
    elements: {
      shared: {
        role: 'alert',
        name: null,
        testId: null,
        cssFallback: null,
        widget: 'os-region',
        surface: 'form',
      },
    },
  };

  const surfaceGraph: SurfaceGraph = {
    screen: 'policy-search',
    url: '/policy-search',
    sections: {
      main: {
        selector: '#main',
        kind: 'screen-root',
        surfaces: ['shared'],
      },
    },
    surfaces: {
      shared: {
        kind: 'validation-region',
        section: 'main',
        selector: '#shared',
        parents: [],
        children: [],
        elements: [],
        assertions: ['state'],
      },
    },
  };

  expect(
    validatePostureContract({
      elementId: 'policyNumberInput',
      postureId: 'invalid',
      postures,
      elements,
      surfaceGraph,
    }),
  ).toEqual([
    {
      code: 'ambiguous-effect-target',
      elementId: 'policyNumberInput',
      postureId: 'invalid',
      target: 'shared',
    },
  ]);
});

test('validatePostureContract regression: missing-posture-values', () => {
  const issues = validatePostureContract({
    elementId: 'policyNumberInput',
    postureId: 'invalid',
    postures: normalizeScreenPostures({
      screen: 'policy-search',
      postures: {
        policyNumberInput: {
          invalid: {
            values: [],
            effects: [{ target: 'self', state: 'validation-error' }],
          },
        },
      },
    }),
    elements: {
      screen: 'policy-search',
      url: '/policy-search',
      elements: {},
    },
    surfaceGraph: {
      screen: 'policy-search',
      url: '/policy-search',
      sections: {},
      surfaces: {},
    },
  });

  expect(issues).toEqual([
    {
      code: 'missing-posture-values',
      elementId: 'policyNumberInput',
      postureId: 'invalid',
    },
  ]);
});

test('validatePostureContract regression: unknown-posture', () => {
  const issues = validatePostureContract({
    elementId: 'policyNumberInput',
    postureId: 'invalid',
    postures: {
      screen: 'policy-search',
      postures: {},
    },
    elements: {
      screen: 'policy-search',
      url: '/policy-search',
      elements: {},
    },
    surfaceGraph: {
      screen: 'policy-search',
      url: '/policy-search',
      sections: {},
      surfaces: {},
    },
  });

  expect(issues).toEqual([
    {
      code: 'unknown-posture',
      elementId: 'policyNumberInput',
      postureId: 'invalid',
    },
  ]);
});
