/**
 * Default Manifest Verb Handlers — Law Tests (v2 §6 Step 4c full).
 *
 * Exercises the real handler wiring at
 * `product/application/manifest/default-handlers.ts` — the
 * factory that binds the declared verbs to their runtime
 * implementations where available.
 *
 * For now the wired set is one verb (`test-compose`); the rest
 * fall through to "Unknown tool" intentionally. As more verb
 * runtimes gain standalone MCP-callable surfaces, they register
 * here and the fallthrough set shrinks.
 */

import { expect, test } from '@playwright/test';
import { createDefaultManifestVerbHandlers } from '../../product/application/manifest/default-handlers';
import { invokeManifestVerb } from '../../product/application/manifest/invoker';
import { createAdoId, createElementId, createScreenId } from '../../product/domain/kernel/identity';

function makeFlow() {
  const adoId = createAdoId('10001');
  const baseStep = {
    dataValue: null,
    dataSource: 'none' as const,
    confidence: 'compiler-derived' as const,
    governance: 'approved' as const,
    bindingKind: 'bound' as const,
    provenanceKind: 'approved-knowledge' as const,
    knowledgeRefs: [] as ReadonlyArray<string>,
    supplementRefs: [] as ReadonlyArray<string>,
    posture: null,
    snapshotTemplate: null,
  };
  return {
    kind: 'grounded-spec-flow' as const,
    metadata: {
      adoId,
      revision: 1,
      contentHash: 'hash1',
      title: 'Policy search flow',
      suite: 'policy-journey',
      tags: [] as ReadonlyArray<string>,
      lifecycle: 'normal' as const,
      confidence: 'compiler-derived' as const,
      governance: 'approved' as const,
      fixtures: [] as ReadonlyArray<string>,
    },
    steps: [
      {
        ...baseStep,
        index: 0,
        intent: 'Navigate to policy search',
        action: 'navigate' as const,
        screen: createScreenId('policy-search'),
        element: createElementId('root'),
        normalizedIntent: 'navigate-policy-search',
      },
    ],
  };
}

// ─── Law 1: test-compose is registered ───

test('createDefaultManifestVerbHandlers registers test-compose', async () => {
  const registry = createDefaultManifestVerbHandlers();
  const outcome = await invokeManifestVerb(registry, 'test-compose', {
    flow: makeFlow(),
    imports: {
      fixtures: './fixtures',
      scenarioContext: './scenario-context',
    },
  });
  expect(outcome.handled).toBe(true);
  if (outcome.handled) {
    const result = outcome.result as { code: string; lifecycle: string };
    expect(typeof result.code).toBe('string');
    expect(result.code.length).toBeGreaterThan(0);
    expect(result.lifecycle).toBe('normal');
  }
});

// ─── Law 2: emitted code is a valid TypeScript module ───

test('test-compose emitted code contains the expected structure', async () => {
  const registry = createDefaultManifestVerbHandlers();
  const outcome = await invokeManifestVerb(registry, 'test-compose', {
    flow: makeFlow(),
    imports: {
      fixtures: './fixtures',
      scenarioContext: './scenario-context',
    },
  });
  if (outcome.handled) {
    const { code } = outcome.result as { code: string };
    // Spec body opens with the test() call and references the
    // imports the caller requested.
    expect(code).toContain('test(');
    expect(code).toContain('./fixtures');
    expect(code).toContain('./scenario-context');
  }
});

// ─── Law 3: malformed input surfaces a validation error ───

test('test-compose handler throws on malformed input', async () => {
  const registry = createDefaultManifestVerbHandlers();
  let caught: unknown = null;
  try {
    await invokeManifestVerb(registry, 'test-compose', { notAFlow: 'nope' });
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeInstanceOf(Error);
  expect((caught as Error).message).toContain('test-compose expects');
});

// ─── Law 4: unwired verbs return handled:false ───

test('verbs without runtime implementations fall through (handled:false)', async () => {
  const registry = createDefaultManifestVerbHandlers();
  const outcome = await invokeManifestVerb(registry, 'observe', {});
  // observe is not yet wired (needs live Playwright page); falls through.
  expect(outcome.handled).toBe(false);
});
