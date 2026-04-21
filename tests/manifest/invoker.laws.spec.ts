/**
 * Manifest Verb Invoker — Law Tests (v2 §6 Step 4c full).
 *
 * Exercises the handler registry + dispatch surface that wires
 * manifest-derived MCP tools to their runtime implementations.
 */

import { expect, test } from '@playwright/test';
import {
  emptyManifestVerbHandlerRegistry,
  invokeManifestVerb,
  manifestVerbHandlerRegistry,
  mergeManifestVerbHandlerRegistries,
} from '../../product/application/manifest/invoker';

// ─── Law 1: empty registry always returns handled:false ───

test('invokeManifestVerb on an empty registry returns handled:false for any verb', async () => {
  const registry = emptyManifestVerbHandlerRegistry();
  const outcome = await invokeManifestVerb(registry, 'observe', {});
  expect(outcome.handled).toBe(false);
});

// ─── Law 2: registered handler is invoked with the raw input ───

test('invokeManifestVerb dispatches to the registered handler', async () => {
  const registry = manifestVerbHandlerRegistry({
    observe: (input) => ({ echo: input }),
  });
  const outcome = await invokeManifestVerb(registry, 'observe', { screen: 'test' });
  expect(outcome.handled).toBe(true);
  if (outcome.handled) {
    expect(outcome.result).toEqual({ echo: { screen: 'test' } });
  }
});

// ─── Law 3: Promise-returning handlers are awaited ───

test('invokeManifestVerb awaits async handlers', async () => {
  const registry = manifestVerbHandlerRegistry({
    'intent-fetch': async (input) => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      return { fetched: input };
    },
  });
  const outcome = await invokeManifestVerb(registry, 'intent-fetch', { id: '10001' });
  expect(outcome.handled).toBe(true);
  if (outcome.handled) {
    expect(outcome.result).toEqual({ fetched: { id: '10001' } });
  }
});

// ─── Law 4: unknown verbs return handled:false even when registry is populated ───

test('invokeManifestVerb returns handled:false when the verb is unregistered', async () => {
  const registry = manifestVerbHandlerRegistry({
    observe: () => ({ ok: true }),
  });
  const outcome = await invokeManifestVerb(registry, 'facet-mint', {});
  expect(outcome.handled).toBe(false);
});

// ─── Law 5: mergeRegistries: right wins on key collision ───

test('mergeManifestVerbHandlerRegistries: right side wins on duplicate keys', async () => {
  const base = manifestVerbHandlerRegistry({
    observe: () => ({ from: 'base' }),
    interact: () => ({ from: 'base' }),
  });
  const extensions = manifestVerbHandlerRegistry({
    observe: () => ({ from: 'extensions' }),
  });
  const merged = mergeManifestVerbHandlerRegistries(base, extensions);
  const observeOutcome = await invokeManifestVerb(merged, 'observe', {});
  const interactOutcome = await invokeManifestVerb(merged, 'interact', {});
  expect(observeOutcome.handled && observeOutcome.result).toEqual({ from: 'extensions' });
  expect(interactOutcome.handled && interactOutcome.result).toEqual({ from: 'base' });
});

// ─── Law 6: handler exceptions propagate ───

test('invokeManifestVerb propagates handler exceptions to the caller', async () => {
  const registry = manifestVerbHandlerRegistry({
    'intent-fetch': () => { throw new Error('deliberate failure'); },
  });
  let caught: unknown = null;
  try {
    await invokeManifestVerb(registry, 'intent-fetch', {});
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeInstanceOf(Error);
  expect((caught as Error).message).toBe('deliberate failure');
});
