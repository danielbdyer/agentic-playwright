/**
 * Canon Decomposer Registry Laws (Phase A item 4)
 *
 * Verifies that the decomposer registry covers every atom class
 * and that the implemented decomposers are correctly described.
 *
 * @see docs/cold-start-convergence-plan.md § 4.A item 4
 */
import { describe, test, expect } from 'vitest';
import { ATOM_CLASSES, type AtomClass } from '../../product/domain/pipeline/atom-address';
import {
  CANON_DECOMPOSERS,
  IMPLEMENTED_DECOMPOSER_CLASSES,
  hasDecomposer,
  type CanonDecomposerRegistry,
} from '../../product/application/canon/decomposer-registry';

describe('Canon decomposer registry laws', () => {
  // ─── Law 1: Every AtomClass has a registry entry ────────────

  test('Law 1: CANON_DECOMPOSERS has an entry for every AtomClass', () => {
    for (const cls of ATOM_CLASSES) {
      expect(cls in CANON_DECOMPOSERS).toBe(true);
    }
  });

  // ─── Law 2: Registry has no extra entries ───────────────────

  test('Law 2: CANON_DECOMPOSERS has no entries beyond ATOM_CLASSES', () => {
    const registryKeys = Object.keys(CANON_DECOMPOSERS).sort();
    const classKeys = [...ATOM_CLASSES].sort();
    expect(registryKeys).toEqual(classKeys);
  });

  // ─── Law 3: Every non-null entry has matching class field ───

  test('Law 3: every implemented decomposer descriptor has a class field matching its key', () => {
    for (const cls of ATOM_CLASSES) {
      const descriptor = CANON_DECOMPOSERS[cls];
      if (descriptor !== null) {
        expect(descriptor.class).toBe(cls);
      }
    }
  });

  // ─── Law 4: At least 7 classes have decomposers ─────────────

  test('Law 4: at least 7 atom classes have implemented decomposers', () => {
    expect(IMPLEMENTED_DECOMPOSER_CLASSES.length).toBeGreaterThanOrEqual(7);
  });

  // ─── Law 5: Element, pattern, route, surface have decomposers

  test('Law 5: the core knowledge classes have decomposers', () => {
    const required: AtomClass[] = [
      'element', 'pattern', 'route', 'route-variant',
      'surface', 'posture', 'snapshot',
    ];
    for (const cls of required) {
      expect(hasDecomposer(cls)).toBe(true);
    }
  });

  // ─── Law 6: hasDecomposer matches registry ─────────────────

  test('Law 6: hasDecomposer returns true iff CANON_DECOMPOSERS[cls] !== null', () => {
    for (const cls of ATOM_CLASSES) {
      expect(hasDecomposer(cls)).toBe(CANON_DECOMPOSERS[cls] !== null);
    }
  });

  // ─── Law 7: Non-null descriptors have required fields ───────

  test('Law 7: every non-null descriptor has sourceDescription, modulePath, functionName', () => {
    for (const cls of ATOM_CLASSES) {
      const descriptor = CANON_DECOMPOSERS[cls];
      if (descriptor !== null) {
        expect(descriptor.sourceDescription.length).toBeGreaterThan(0);
        expect(descriptor.modulePath.length).toBeGreaterThan(0);
        expect(descriptor.functionName.length).toBeGreaterThan(0);
      }
    }
  });
});
