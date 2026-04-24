/**
 * Pattern-rung kernel — Z11a.4a laws.
 *
 * Per docs/v2-compounding-engine-plan.md Step 11 Z11a.4a, the
 * shape-locking slice pins:
 *
 *   ZC36   (foldPatternRungResult exhaustiveness): routes every
 *          variant; forwards payload to matched branch.
 *   ZC36.b (firstMatchWins first-wins): returns the first matcher
 *          whose result is Some; short-circuits remaining matchers.
 *   ZC36.c (firstMatchWins no-match when all miss): walks every
 *          matcher; returns no-match when none produced a result.
 *   ZC36.d (orchestrator attribution): matched candidate carries
 *          patternId + matcherIndex (the position of the matcher
 *          that fired) stamped by the orchestrator.
 *   ZC36.e (applicabilityGuard short-circuit): when guard returns
 *          false, no matchers are walked and result is no-match.
 *   ZC36.f (formSubmissionPattern applicability): accepts submit-
 *          like click intents; rejects non-click and non-submit-like
 *          intents.
 *   ZC36.g (formSubmissionPattern end-to-end): exact-name match
 *          fires M0; substring fallback fires M1; form-context
 *          fallback fires M2; nothing-matches returns no-match.
 */

import { describe, test, expect } from 'vitest';
import { Option } from 'effect';
import {
  foldPatternRungResult,
  matcherId,
  patternId,
  type ClassifiedIntent,
  type IndexedSurface,
  type Matcher,
  type MatcherContext,
  type Pattern,
  type PatternRungResult,
  type SurfaceIndex,
} from '../../../product/domain/resolution/patterns/rung-kernel';
import { firstMatchWins } from '../../../product/domain/resolution/patterns/orchestrators/first-match-wins';
import { formSubmissionPattern } from '../../../product/domain/resolution/patterns/patterns/form-submission.pattern';

// ─── Test fixtures ──────────────────────────────────────────────

function surface(overrides: Partial<IndexedSurface> & Pick<IndexedSurface, 'surfaceId' | 'role'>): IndexedSurface {
  return {
    name: null,
    landmarkRole: null,
    classes: [],
    ...overrides,
  };
}

function stubSurfaceIndex(surfaces: readonly IndexedSurface[]): SurfaceIndex {
  return {
    findByRoleAndName: (role, name) =>
      surfaces.filter((s) => s.role === role && s.name === name),
    findByRole: (role) => surfaces.filter((s) => s.role === role),
    findLandmarkByRole: (role) =>
      Option.fromNullable(surfaces.find((s) => s.landmarkRole === role) ?? null),
    surfacesWithin: (_ancestor) => surfaces,
    // NB: the stub's `surfacesWithin` returns all surfaces. Real
    // implementation narrows by ancestor. Matchers that rely on
    // containment are tested against scoped stubs in their own laws.
  };
}

function intent(overrides: Partial<ClassifiedIntent> & Pick<ClassifiedIntent, 'verb' | 'originalActionText'>): ClassifiedIntent {
  return {
    targetShape: {},
    ...overrides,
  };
}

function ctx(intentVal: ClassifiedIntent, surfaces: readonly IndexedSurface[]): MatcherContext {
  return { intent: intentVal, surfaceIndex: stubSurfaceIndex(surfaces) };
}

// ─── ZC36: foldPatternRungResult ────────────────────────────────

describe('Z11a.4a — foldPatternRungResult', () => {
  test('ZC36: routes matched variant to matched branch', () => {
    const result: PatternRungResult = {
      kind: 'matched',
      candidate: {
        targetSurfaceId: 'sid:test',
        patternId: patternId('test'),
        matcherId: matcherId('test-matcher'),
        matcherIndex: 0,
        rationale: 'ok',
      },
    };
    const tag = foldPatternRungResult(result, {
      matched: (r) => `matched:${r.candidate.targetSurfaceId}`,
      noMatch: () => 'no',
    });
    expect(tag).toBe('matched:sid:test');
  });

  test('ZC36.a: routes no-match variant to noMatch branch with pattern id', () => {
    const result: PatternRungResult = {
      kind: 'no-match',
      patternId: patternId('empty-pattern'),
    };
    const tag = foldPatternRungResult(result, {
      matched: () => 'ok',
      noMatch: (r) => `none:${r.patternId}`,
    });
    expect(tag).toBe('none:empty-pattern');
  });
});

// ─── ZC36.b/c/d/e: firstMatchWins orchestrator ──────────────────

describe('Z11a.4a — firstMatchWins orchestrator', () => {
  const alwaysNoneMatcher: Matcher = () => Option.none();

  function alwaysSomeMatcher(id: string, surfaceId: string): Matcher {
    return () =>
      Option.some({
        targetSurfaceId: surfaceId,
        matcherId: matcherId(id),
        rationale: `stub ${id}`,
      });
  }

  function passthroughPattern(matchers: readonly Matcher[]): Pattern {
    return {
      id: patternId('test-pattern'),
      description: 'stub',
      applicabilityGuard: () => true,
      matchers,
      orchestrator: firstMatchWins,
    };
  }

  const baseCtx = ctx(intent({ verb: 'click', originalActionText: 'anything' }), []);

  test('ZC36.b: first matcher that returns Some wins; subsequent matchers not consulted', () => {
    let secondCalled = false;
    const firstMatcher: Matcher = alwaysSomeMatcher('first', 'sid:first');
    const secondMatcher: Matcher = () => {
      secondCalled = true;
      return Option.none();
    };
    const pattern = passthroughPattern([firstMatcher, secondMatcher]);
    const result = firstMatchWins(pattern, baseCtx);
    expect(result.kind).toBe('matched');
    expect(secondCalled).toBe(false);
  });

  test('ZC36.c: walks every matcher; no-match when none produce', () => {
    const pattern = passthroughPattern([alwaysNoneMatcher, alwaysNoneMatcher, alwaysNoneMatcher]);
    const result = firstMatchWins(pattern, baseCtx);
    expect(result.kind).toBe('no-match');
  });

  test('ZC36.d: orchestrator stamps patternId + matcherIndex on the firing matcher', () => {
    // M0 none, M1 none, M2 Some → candidate should carry matcherIndex=2.
    const pattern = passthroughPattern([
      alwaysNoneMatcher,
      alwaysNoneMatcher,
      alwaysSomeMatcher('third', 'sid:third'),
    ]);
    const result = firstMatchWins(pattern, baseCtx);
    if (result.kind !== 'matched') throw new Error('expected matched');
    expect(result.candidate.patternId).toBe(patternId('test-pattern'));
    expect(result.candidate.matcherId).toBe(matcherId('third'));
    expect(result.candidate.matcherIndex).toBe(2);
    expect(result.candidate.targetSurfaceId).toBe('sid:third');
  });

  test('ZC36.e: applicabilityGuard short-circuits the walk', () => {
    let walked = false;
    const walkingMatcher: Matcher = () => {
      walked = true;
      return Option.some({
        targetSurfaceId: 'sid:x',
        matcherId: matcherId('x'),
        rationale: 'x',
      });
    };
    const blockedPattern: Pattern = {
      id: patternId('blocked'),
      description: 'guard always false',
      applicabilityGuard: () => false,
      matchers: [walkingMatcher],
      orchestrator: firstMatchWins,
    };
    const result = firstMatchWins(blockedPattern, baseCtx);
    expect(result.kind).toBe('no-match');
    expect(walked).toBe(false);
  });
});

// ─── ZC36.f/g: formSubmissionPattern end-to-end ─────────────────

describe('Z11a.4a — formSubmissionPattern', () => {
  const form = surface({ surfaceId: 'sid:form-1', role: 'form', landmarkRole: 'form' });
  const submitButton = surface({
    surfaceId: 'sid:submit',
    role: 'button',
    name: 'Submit',
  });

  test('ZC36.f: applicability accepts "Click Submit" / rejects navigate intents', () => {
    const submitLike = intent({
      verb: 'click',
      originalActionText: 'Click the Submit button',
      targetShape: { role: 'button', name: 'Submit' },
    });
    expect(formSubmissionPattern.applicabilityGuard(ctx(submitLike, [form, submitButton]))).toBe(true);

    const navigate = intent({
      verb: 'navigate',
      originalActionText: 'Go to the login page',
      targetShape: {},
    });
    expect(formSubmissionPattern.applicabilityGuard(ctx(navigate, [form, submitButton]))).toBe(false);

    const nonSubmitClick = intent({
      verb: 'click',
      originalActionText: 'Click the Cancel link',
      targetShape: { role: 'link', name: 'Cancel' },
    });
    expect(formSubmissionPattern.applicabilityGuard(ctx(nonSubmitClick, [form, submitButton]))).toBe(false);
  });

  test('ZC36.g.M0: exact role+name match fires the first matcher (index 0)', () => {
    const intentVal = intent({
      verb: 'click',
      originalActionText: 'Click the Submit button',
      targetShape: { role: 'button', name: 'Submit' },
    });
    const result = formSubmissionPattern.orchestrator(formSubmissionPattern, ctx(intentVal, [form, submitButton]));
    if (result.kind !== 'matched') throw new Error('expected matched');
    expect(result.candidate.matcherIndex).toBe(0);
    expect(result.candidate.matcherId).toBe(matcherId('role-and-name-exact'));
    expect(result.candidate.targetSurfaceId).toBe('sid:submit');
  });

  test('ZC36.g.M1: name-substring fallback fires the second matcher (index 1)', () => {
    // Operator wrote lowercase "submit"; page has "Submit" button.
    // Exact match fails (case mismatch), substring match wins.
    const intentVal = intent({
      verb: 'click',
      originalActionText: 'click submit',
      targetShape: { role: 'button', nameSubstring: 'submit' },
    });
    const result = formSubmissionPattern.orchestrator(formSubmissionPattern, ctx(intentVal, [form, submitButton]));
    if (result.kind !== 'matched') throw new Error('expected matched');
    expect(result.candidate.matcherIndex).toBe(1);
    expect(result.candidate.matcherId).toBe(matcherId('role-and-name-substring'));
  });

  test('ZC36.g.M2: form-context fallback fires when name hints are absent', () => {
    // No exact name, no substring — parser only caught "click submit"
    // as the verb, deferred naming to the pattern.
    const intentVal = intent({
      verb: 'click',
      originalActionText: 'Submit the form',
      targetShape: {},
    });
    const result = formSubmissionPattern.orchestrator(formSubmissionPattern, ctx(intentVal, [form, submitButton]));
    if (result.kind !== 'matched') throw new Error('expected matched');
    expect(result.candidate.matcherIndex).toBe(2);
    expect(result.candidate.matcherId).toBe(matcherId('form-context-submit'));
    expect(result.candidate.targetSurfaceId).toBe('sid:submit');
  });

  test('ZC36.g.miss: no-match when no surfaces satisfy any rung', () => {
    const emptyCtx = ctx(
      intent({
        verb: 'click',
        originalActionText: 'Click the Submit button',
        targetShape: { role: 'button', name: 'Submit' },
      }),
      [], // no surfaces
    );
    const result = formSubmissionPattern.orchestrator(formSubmissionPattern, emptyCtx);
    expect(result.kind).toBe('no-match');
  });

  test('ZC36.g.ambiguity: two matching buttons → M0 passes ambiguity down; M2 also rejects (>1 button in form)', () => {
    const duplicate = surface({ surfaceId: 'sid:submit-2', role: 'button', name: 'Submit' });
    const ambiguousCtx = ctx(
      intent({
        verb: 'click',
        originalActionText: 'Click Submit',
        targetShape: { role: 'button', name: 'Submit' },
      }),
      [form, submitButton, duplicate],
    );
    const result = formSubmissionPattern.orchestrator(formSubmissionPattern, ambiguousCtx);
    // All three rungs reject (M0 sees 2 exact matches; M1 also sees 2;
    // M2 also sees 2 buttons in form). No disambiguation available —
    // this is precisely the case for a customer-specific rung at M-1.
    expect(result.kind).toBe('no-match');
  });
});
