/**
 * VerbClassifier registry — structural laws.
 *
 * The VerbClassifier port at workshop/probe-derivation/verb-
 * classifier.ts is the minimal surface fixture-replay and the
 * higher-fidelity substrate harnesses consume. These laws pin the
 * registry's structural invariants — lookups are pure, keys are
 * verb names, and the empty registry is the identity.
 *
 * Pins:
 *   C1. `verbClassifierRegistry([])` equals `EMPTY_CLASSIFIER_REGISTRY`
 *       shape (empty map).
 *   C2. A classifier registered under verb V is retrievable by V.
 *   C3. An unregistered verb returns null — never undefined, never
 *       a thrown error. The null case is first-class; the harness
 *       stratifies on it.
 *   C4. Duplicate entries: later wins. Merging host extensions on
 *       top of defaults relies on this order.
 */

import { describe, test, expect } from 'vitest';
import { Effect } from 'effect';
import {
  EMPTY_CLASSIFIER_REGISTRY,
  lookupClassifier,
  verbClassifierRegistry,
  type VerbClassifier,
} from '../../workshop/probe-derivation/verb-classifier';

function stubClassifier(verb: string, errorFamily: string | null): VerbClassifier {
  return {
    verb,
    classify: () =>
      Effect.succeed({ classification: 'matched' as const, errorFamily }),
  };
}

describe('VerbClassifier registry — structural laws', () => {
  test('C1: empty-input registry has no classifiers', () => {
    const empty = verbClassifierRegistry([]);
    expect(empty.classifiers.size).toBe(0);
    expect(EMPTY_CLASSIFIER_REGISTRY.classifiers.size).toBe(0);
  });

  test('C2: a registered classifier is retrievable by verb name', () => {
    const registry = verbClassifierRegistry([stubClassifier('observe', null)]);
    const found = lookupClassifier(registry, 'observe');
    expect(found).not.toBeNull();
    expect(found?.verb).toBe('observe');
  });

  test('C3: unregistered verb returns null', () => {
    const registry = verbClassifierRegistry([stubClassifier('observe', null)]);
    expect(lookupClassifier(registry, 'facet-mint')).toBeNull();
    expect(lookupClassifier(EMPTY_CLASSIFIER_REGISTRY, 'anything')).toBeNull();
  });

  test('C4: duplicate verb entries — later wins', () => {
    const first = stubClassifier('observe', null);
    const second = stubClassifier('observe', 'not-visible');
    const registry = verbClassifierRegistry([first, second]);
    const found = lookupClassifier(registry, 'observe');
    expect(found).toBe(second);
  });
});
