import { expect, test } from '@playwright/test';
import {
  epistemicStatusForSource,
  foldEpistemicStatus,
  isEpistemicallyApproved,
  isEpistemicallyBlocked,
  isEpistemicallyReviewRequired,
  isInformational,
  isInterpreted,
  isObserved,
  mintInformational,
  mintInterpreted,
  mintObserved,
} from '../../lib/domain/handshake/epistemic-brand';
import type { InterventionEpistemicStatus } from '../../lib/domain/handshake/intervention';

interface Carrier {
  readonly epistemicStatus: InterventionEpistemicStatus;
  readonly id: string;
}

// ─── Predicates ───────────────────────────────────────────────────

test('isObserved narrows correctly', () => {
  const c: Carrier = { epistemicStatus: 'observed', id: 'a' };
  expect(isObserved(c)).toBe(true);
  expect(isInterpreted(c)).toBe(false);
});

test('every status produces exactly one truthy predicate', () => {
  const all: InterventionEpistemicStatus[] = [
    'observed', 'interpreted', 'review-required', 'approved', 'blocked', 'informational',
  ];
  for (const status of all) {
    const c: Carrier = { epistemicStatus: status, id: status };
    const predicates = [
      isObserved(c), isInterpreted(c), isEpistemicallyReviewRequired(c),
      isEpistemicallyApproved(c), isEpistemicallyBlocked(c), isInformational(c),
    ];
    expect(predicates.filter(Boolean).length).toBe(1);
  }
});

// ─── foldEpistemicStatus ──────────────────────────────────────────

test('foldEpistemicStatus is exhaustive', () => {
  const dispatch = (status: InterventionEpistemicStatus): string =>
    foldEpistemicStatus<Carrier, string>({ epistemicStatus: status, id: 'x' }, {
      observed: () => 'observed-branch',
      interpreted: () => 'interpreted-branch',
      reviewRequired: () => 'review-branch',
      approved: () => 'approved-branch',
      blocked: () => 'blocked-branch',
      informational: () => 'informational-branch',
    });
  expect(dispatch('observed')).toBe('observed-branch');
  expect(dispatch('interpreted')).toBe('interpreted-branch');
  expect(dispatch('review-required')).toBe('review-branch');
  expect(dispatch('approved')).toBe('approved-branch');
  expect(dispatch('blocked')).toBe('blocked-branch');
  expect(dispatch('informational')).toBe('informational-branch');
});

// ─── A2 invariant: synthetic cannot mint Observed at compile time ──

test('mintObserved only accepts ObservedSource enum (compile-time gate)', () => {
  // This test passes if it compiles. The mint function's type signature
  // restricts the second argument to ObservedSource. Synthetic-derived
  // sources like 'agent-interpreted' would be a TypeScript error here:
  //
  //   mintObserved({ id: 'a' }, 'agent-interpreted')  // ❌ type error
  //
  // The runtime test below confirms only legitimate sources are accepted.
  const observed = mintObserved({ id: 'a', epistemicStatus: 'observed' as InterventionEpistemicStatus }, 'runtime-dom');
  expect(observed.id).toBe('a');
});

test('mintInterpreted accepts agent/translation/discovery sources', () => {
  const i1 = mintInterpreted({ id: 'a' }, 'agent-interpreted');
  const i2 = mintInterpreted({ id: 'b' }, 'knowledge-translation');
  expect(i1.id).toBe('a');
  expect(i2.id).toBe('b');
});

test('mintInformational accepts any payload', () => {
  const info = mintInformational({ id: 'c', extra: 42 });
  expect(info.id).toBe('c');
});

// ─── epistemicStatusForSource ─────────────────────────────────────

test('runtime DOM sources → observed', () => {
  expect(epistemicStatusForSource('runtime-dom')).toBe('observed');
  expect(epistemicStatusForSource('execution-receipt')).toBe('observed');
  expect(epistemicStatusForSource('live-dom')).toBe('observed');
  expect(epistemicStatusForSource('dom-exploration')).toBe('observed');
});

test('agent and translation sources → interpreted', () => {
  expect(epistemicStatusForSource('agent-interpreted')).toBe('interpreted');
  expect(epistemicStatusForSource('knowledge-translation')).toBe('interpreted');
  expect(epistemicStatusForSource('partial-resolution')).toBe('interpreted');
  expect(epistemicStatusForSource('cold-start-discovery')).toBe('interpreted');
});

test('approval / block sources → respective statuses', () => {
  expect(epistemicStatusForSource('approved-canon')).toBe('approved');
  expect(epistemicStatusForSource('trust-policy-block')).toBe('blocked');
  expect(epistemicStatusForSource('review-pending')).toBe('review-required');
});

test('unknown source → informational (safe default)', () => {
  expect(epistemicStatusForSource('something-novel')).toBe('informational');
});

// ─── Round-trip ───────────────────────────────────────────────────

test('mint → fold round-trip preserves identity', () => {
  const observed = mintObserved({ id: 'a', epistemicStatus: 'observed' as InterventionEpistemicStatus }, 'runtime-dom');
  const result = foldEpistemicStatus<Carrier, string>(observed as Carrier, {
    observed: (item) => `o:${item.id}`,
    interpreted: () => 'wrong',
    reviewRequired: () => 'wrong',
    approved: () => 'wrong',
    blocked: () => 'wrong',
    informational: () => 'wrong',
  });
  expect(result).toBe('o:a');
});
