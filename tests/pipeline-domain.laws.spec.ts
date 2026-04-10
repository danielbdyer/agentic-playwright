/**
 * Laws for the lib/domain/pipeline/ namespace.
 *
 * These tests verify the typed primitives that implement the
 * canon-and-derivation doctrine's three-tier interface model:
 *
 *   - Stage enumeration (top-level + discovery/composition/projection sub-phases)
 *   - Source classifier (the 5 lookup chain slots)
 *   - Atom addresses + envelopes (Tier 1)
 *   - Composition addresses + envelopes (Tier 2)
 *   - Projection addresses + envelopes (Tier 3)
 *   - Qualifier bag and applicability composition
 *   - Lookup chain mode predicates
 *   - Promotion / demotion gate verdict shape
 *
 * Pure type-and-pure-function tests; no Effect, no IO.
 */

import { expect, test } from '@playwright/test';

import {
  TOP_LEVEL_STAGES,
  DISCOVERY_SUB_PHASES,
  COMPOSITION_SUB_PHASES,
  PROJECTION_SUB_PHASES,
  isDiscoverySubPhase,
  isCompositionSubPhase,
  isProjectionSubPhase,
  isTopLevelStage,
  tierOfStage,
} from '../lib/domain/pipeline/stage-enum';

import {
  SOURCE_PRECEDENCE,
  isCanonicalArtifact,
  isCanonicalSource,
  isDerivedOutput,
  isPromotable,
  isDemotable,
  foldPhaseOutputSource,
  compareSourcePrecedence,
} from '../lib/domain/pipeline/source';

import {
  ATOM_CLASSES,
  atomAddressToPath,
  atomAddressEquals,
  type AtomAddress,
} from '../lib/domain/pipeline/atom-address';

import { atom, isAtomOfClass, isAtomAddressConsistent } from '../lib/domain/pipeline/atom';

import {
  COMPOSITION_SUB_TYPES,
  compositionAddressToPath,
  compositionAddressEquals,
  type FlowId,
  type RunbookId,
} from '../lib/domain/pipeline/composition-address';

import { composition, isCompositionAddressConsistent } from '../lib/domain/pipeline/composition';

import {
  PROJECTION_SUB_TYPES,
  projectionAddressToPath,
  projectionAddressEquals,
  type RoleId,
} from '../lib/domain/pipeline/projection-address';

import { projection, isProjectionAddressConsistent, findBinding } from '../lib/domain/pipeline/projection';

import {
  EMPTY_QUALIFIER_BAG,
  hasQualifiers,
  intersectApplicability,
  APPLICABILITY_IDENTITY,
  type QualifierBag,
} from '../lib/domain/pipeline/qualifier';

import {
  DEFAULT_LOOKUP_MODE,
  modeRespectsOverrides,
  modeConsultsDeterministicObservations,
  modeRunsDiscovery,
  modeConsultsLiveCache,
} from '../lib/domain/pipeline/lookup-chain';

import { brandString } from '../lib/domain/kernel/brand';
import { asFingerprint } from '../lib/domain/kernel/hash';

// ─── Stage enumeration ───────────────────────────────────────────

test('every top-level stage classifies as untiered', () => {
  for (const stage of TOP_LEVEL_STAGES) {
    expect(isTopLevelStage(stage)).toBe(true);
    expect(tierOfStage(stage)).toBe('untiered');
  }
});

test('every discovery sub-phase classifies as atom tier', () => {
  for (const stage of DISCOVERY_SUB_PHASES) {
    expect(isDiscoverySubPhase(stage)).toBe(true);
    expect(tierOfStage(stage)).toBe('atom');
  }
});

test('every composition sub-phase classifies as composition tier', () => {
  for (const stage of COMPOSITION_SUB_PHASES) {
    expect(isCompositionSubPhase(stage)).toBe(true);
    expect(tierOfStage(stage)).toBe('composition');
  }
});

test('every projection sub-phase classifies as projection tier', () => {
  for (const stage of PROJECTION_SUB_PHASES) {
    expect(isProjectionSubPhase(stage)).toBe(true);
    expect(tierOfStage(stage)).toBe('projection');
  }
});

test('stage enumerations have no overlap', () => {
  const allLists = [
    new Set<string>(TOP_LEVEL_STAGES),
    new Set<string>(DISCOVERY_SUB_PHASES),
    new Set<string>(COMPOSITION_SUB_PHASES),
    new Set<string>(PROJECTION_SUB_PHASES),
  ];
  for (let i = 0; i < allLists.length; i++) {
    for (let j = i + 1; j < allLists.length; j++) {
      const intersection = [...allLists[i]!].filter((x) => allLists[j]!.has(x));
      expect(intersection).toEqual([]);
    }
  }
});

// ─── Source classifier ──────────────────────────────────────────

test('source precedence has all five slots in canonical order', () => {
  expect(SOURCE_PRECEDENCE).toEqual([
    'operator-override',
    'agentic-override',
    'deterministic-observation',
    'live-derivation',
    'cold-derivation',
  ]);
});

test('canonical source predicate matches only operator-override', () => {
  expect(isCanonicalSource('operator-override')).toBe(true);
  expect(isCanonicalSource('agentic-override')).toBe(false);
  expect(isCanonicalSource('deterministic-observation')).toBe(false);
  expect(isCanonicalSource('live-derivation')).toBe(false);
  expect(isCanonicalSource('cold-derivation')).toBe(false);
});

test('canonical artifact predicate matches agentic-override and deterministic-observation', () => {
  expect(isCanonicalArtifact('operator-override')).toBe(false);
  expect(isCanonicalArtifact('agentic-override')).toBe(true);
  expect(isCanonicalArtifact('deterministic-observation')).toBe(true);
  expect(isCanonicalArtifact('live-derivation')).toBe(false);
  expect(isCanonicalArtifact('cold-derivation')).toBe(false);
});

test('derived output predicate matches live and cold derivation', () => {
  expect(isDerivedOutput('operator-override')).toBe(false);
  expect(isDerivedOutput('agentic-override')).toBe(false);
  expect(isDerivedOutput('deterministic-observation')).toBe(false);
  expect(isDerivedOutput('live-derivation')).toBe(true);
  expect(isDerivedOutput('cold-derivation')).toBe(true);
});

test('promotable iff derived output', () => {
  for (const source of SOURCE_PRECEDENCE) {
    expect(isPromotable(source)).toBe(isDerivedOutput(source));
  }
});

test('demotable iff canonical artifact', () => {
  for (const source of SOURCE_PRECEDENCE) {
    expect(isDemotable(source)).toBe(isCanonicalArtifact(source));
  }
});

test('compareSourcePrecedence is consistent with the precedence order', () => {
  for (let i = 0; i < SOURCE_PRECEDENCE.length; i++) {
    for (let j = 0; j < SOURCE_PRECEDENCE.length; j++) {
      const a = SOURCE_PRECEDENCE[i]!;
      const b = SOURCE_PRECEDENCE[j]!;
      const cmp = compareSourcePrecedence(a, b);
      if (i < j) expect(cmp).toBeLessThan(0);
      else if (i > j) expect(cmp).toBeGreaterThan(0);
      else expect(cmp).toBe(0);
    }
  }
});

test('foldPhaseOutputSource is exhaustive over all five sources', () => {
  for (const source of SOURCE_PRECEDENCE) {
    const result = foldPhaseOutputSource(source, {
      operatorOverride: () => 'op',
      agenticOverride: () => 'ag',
      deterministicObservation: () => 'det',
      liveDerivation: () => 'live',
      coldDerivation: () => 'cold',
    });
    expect(['op', 'ag', 'det', 'live', 'cold']).toContain(result);
  }
});

// ─── Atom addresses ──────────────────────────────────────────────

test('atom address path is stable for the same identity tuple', () => {
  const addr: AtomAddress = {
    class: 'element',
    screen: brandString<'ScreenId'>('policy-search'),
    element: brandString<'ElementId'>('policyNumberInput'),
  };
  expect(atomAddressToPath(addr)).toBe('elements/policy-search/policyNumberInput');
});

test('atom address equality is path-based', () => {
  const a: AtomAddress = {
    class: 'route',
    id: brandString<'RouteId'>('policy-search-default'),
  };
  const b: AtomAddress = {
    class: 'route',
    id: brandString<'RouteId'>('policy-search-default'),
  };
  const c: AtomAddress = {
    class: 'route',
    id: brandString<'RouteId'>('different-route'),
  };
  expect(atomAddressEquals(a, b)).toBe(true);
  expect(atomAddressEquals(a, c)).toBe(false);
});

test('atomAddressToPath produces a unique path for each atom class', () => {
  const paths = new Set<string>();
  const addrs: AtomAddress[] = [
    { class: 'route', id: brandString<'RouteId'>('r1') },
    { class: 'screen', screen: brandString<'ScreenId'>('s1') },
    {
      class: 'element',
      screen: brandString<'ScreenId'>('s1'),
      element: brandString<'ElementId'>('e1'),
    },
    { class: 'pattern', id: 'p1' },
  ];
  for (const a of addrs) paths.add(atomAddressToPath(a));
  expect(paths.size).toBe(addrs.length);
});

// ─── Atom envelope ───────────────────────────────────────────────

test('atom() constructor preserves all fields', () => {
  const addr = {
    class: 'screen' as const,
    screen: brandString<'ScreenId'>('policy-search'),
  };
  const a = atom({
    class: 'screen',
    address: addr,
    content: { something: 'observed' },
    source: 'agentic-override',
    inputFingerprint: asFingerprint('atom-input', 'sha256:test'),
    provenance: {
      producedBy: 'test',
      producedAt: '2026-04-08T00:00:00.000Z',
    },
  });
  expect(a.class).toBe('screen');
  expect(a.address).toBe(addr);
  expect(a.source).toBe('agentic-override');
  expect(a.inputFingerprint).toBe('sha256:test');
});

test('atom address consistency check holds for valid atoms', () => {
  const a = atom({
    class: 'route',
    address: { class: 'route', id: brandString<'RouteId'>('r1') },
    content: {},
    source: 'deterministic-observation',
    inputFingerprint: asFingerprint('atom-input', 'sha256:test'),
    provenance: { producedBy: 'test', producedAt: '2026-04-08T00:00:00.000Z' },
  });
  expect(isAtomAddressConsistent(a)).toBe(true);
});

test('isAtomOfClass returns true for matching class and false otherwise', () => {
  const a = atom({
    class: 'screen',
    address: { class: 'screen', screen: brandString<'ScreenId'>('s1') },
    content: {},
    source: 'live-derivation',
    inputFingerprint: asFingerprint('atom-input', 'sha256:test'),
    provenance: { producedBy: 'test', producedAt: '2026-04-08T00:00:00.000Z' },
  });
  expect(isAtomOfClass(a, 'screen')).toBe(true);
  expect(isAtomOfClass(a, 'route')).toBe(false);
});

test('ATOM_CLASSES enumerates 15 classes (the full taxonomy)', () => {
  expect(ATOM_CLASSES.length).toBe(15);
});

// ─── Composition addresses + envelope ───────────────────────────

test('composition address path is stable', () => {
  const addr = { subType: 'flow' as const, id: brandString<'FlowId'>('account-to-review') };
  expect(compositionAddressToPath(addr)).toBe('flows/account-to-review');
});

test('composition address equality is path-based', () => {
  const a = { subType: 'runbook' as const, id: brandString<'RunbookId'>('demo-smoke') };
  const b = { subType: 'runbook' as const, id: brandString<'RunbookId'>('demo-smoke') };
  expect(compositionAddressEquals(a, b)).toBe(true);
});

test('composition envelope preserves atomReferences', () => {
  const c = composition({
    subType: 'flow',
    address: { subType: 'flow', id: brandString<'FlowId'>('demo-flow') },
    content: { name: 'demo' },
    atomReferences: [
      {
        address: { class: 'screen', screen: brandString<'ScreenId'>('policy-search') },
        role: 'sequence-step',
        order: 1,
      },
    ],
    source: 'agentic-override',
    inputFingerprint: asFingerprint('composition-input', 'sha256:flow'),
    provenance: { producedBy: 'test', producedAt: '2026-04-08T00:00:00.000Z' },
  });
  expect(c.atomReferences).toHaveLength(1);
  expect(c.atomReferences[0]?.role).toBe('sequence-step');
  expect(isCompositionAddressConsistent(c)).toBe(true);
});

test('COMPOSITION_SUB_TYPES enumerates 7 sub-types', () => {
  expect(COMPOSITION_SUB_TYPES.length).toBe(7);
});

// ─── Projection addresses + envelope ────────────────────────────

test('projection address path is stable', () => {
  const addr = {
    subType: 'role-visibility' as const,
    role: brandString<'RoleId'>('underwriter'),
  };
  expect(projectionAddressToPath(addr)).toBe('role-visibility/underwriter');
});

test('projection address equality is path-based', () => {
  const a = {
    subType: 'role-visibility' as const,
    role: brandString<'RoleId'>('broker'),
  };
  const b = {
    subType: 'role-visibility' as const,
    role: brandString<'RoleId'>('broker'),
  };
  expect(projectionAddressEquals(a, b)).toBe(true);
});

test('projection envelope carries bindings and address-class consistency', () => {
  const p = projection({
    subType: 'role-visibility',
    address: { subType: 'role-visibility', role: brandString<'RoleId'>('underwriter') },
    bindings: [
      {
        address: { class: 'screen', screen: brandString<'ScreenId'>('review-submit') },
        applicability: 'visible',
      },
    ],
    source: 'agentic-override',
    inputFingerprint: asFingerprint('projection-input', 'sha256:proj'),
    provenance: { producedBy: 'test', producedAt: '2026-04-08T00:00:00.000Z' },
  });
  expect(p.bindings).toHaveLength(1);
  expect(isProjectionAddressConsistent(p)).toBe(true);
});

test('findBinding returns the matching binding by atom address', () => {
  const elementAddr = {
    class: 'element' as const,
    screen: brandString<'ScreenId'>('review-submit'),
    element: brandString<'ElementId'>('submitButton'),
  };
  const p = projection({
    subType: 'role-interaction',
    address: { subType: 'role-interaction', role: brandString<'RoleId'>('underwriter') },
    bindings: [
      { address: elementAddr, applicability: 'interactive' },
    ],
    source: 'agentic-override',
    inputFingerprint: asFingerprint('projection-input', 'sha256:proj'),
    provenance: { producedBy: 'test', producedAt: '2026-04-08T00:00:00.000Z' },
  });
  const found = findBinding(p, elementAddr);
  expect(found?.applicability).toBe('interactive');
});

test('PROJECTION_SUB_TYPES enumerates 7 sub-types', () => {
  expect(PROJECTION_SUB_TYPES.length).toBe(7);
});

// ─── Qualifier bag and applicability composition ────────────────

test('hasQualifiers is false for an empty bag and undefined', () => {
  expect(hasQualifiers(EMPTY_QUALIFIER_BAG)).toBe(false);
  expect(hasQualifiers(undefined)).toBe(false);
});

test('hasQualifiers is true when any qualifier is set', () => {
  const bag: QualifierBag = { role: brandString<'RoleId'>('underwriter') };
  expect(hasQualifiers(bag)).toBe(true);
});

test('intersectApplicability is associative for the supported variants', () => {
  // Hidden trumps everything.
  expect(intersectApplicability('hidden', 'visible')).toBe('hidden');
  expect(intersectApplicability('visible', 'hidden')).toBe('hidden');
  // Gated trumps non-hidden.
  expect(intersectApplicability('gated', 'visible')).toBe('gated');
  expect(intersectApplicability('visible', 'gated')).toBe('gated');
  // Read-only trumps interactive and visible.
  expect(intersectApplicability('read-only', 'interactive')).toBe('read-only');
  // Visible trumps interactive (visible is more restrictive).
  expect(intersectApplicability('visible', 'interactive')).toBe('visible');
  // Interactive is the identity.
  expect(intersectApplicability('interactive', 'interactive')).toBe('interactive');
});

test('APPLICABILITY_IDENTITY is interactive', () => {
  expect(APPLICABILITY_IDENTITY).toBe('interactive');
});

test('intersectApplicability identity law: x ∧ identity = x', () => {
  const all = ['visible', 'interactive', 'read-only', 'hidden', 'gated'] as const;
  for (const x of all) {
    expect(intersectApplicability(x, APPLICABILITY_IDENTITY)).toBe(x);
    expect(intersectApplicability(APPLICABILITY_IDENTITY, x)).toBe(x);
  }
});

// ─── Lookup chain mode predicates ───────────────────────────────

test('default lookup mode is warm', () => {
  expect(DEFAULT_LOOKUP_MODE).toBe('warm');
});

test('warm mode walks the full chain', () => {
  expect(modeRespectsOverrides('warm')).toBe(true);
  expect(modeConsultsDeterministicObservations('warm')).toBe(true);
  expect(modeConsultsLiveCache('warm')).toBe(true);
  expect(modeRunsDiscovery('warm')).toBe(false);
});

test('cold mode skips deterministic and live cache, runs discovery', () => {
  expect(modeRespectsOverrides('cold')).toBe(true);
  expect(modeConsultsDeterministicObservations('cold')).toBe(false);
  expect(modeConsultsLiveCache('cold')).toBe(false);
  expect(modeRunsDiscovery('cold')).toBe(true);
});

test('compare mode walks deterministic AND runs discovery', () => {
  expect(modeRespectsOverrides('compare')).toBe(true);
  expect(modeConsultsDeterministicObservations('compare')).toBe(true);
  expect(modeRunsDiscovery('compare')).toBe(true);
});

test('no-overrides mode skips slot 1 and slot 2', () => {
  expect(modeRespectsOverrides('no-overrides')).toBe(false);
  expect(modeConsultsDeterministicObservations('no-overrides')).toBe(true);
});
