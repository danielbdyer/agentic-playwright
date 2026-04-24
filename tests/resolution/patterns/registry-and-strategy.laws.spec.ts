/**
 * Pattern registry + strategy plumbing — Z11a.4b laws.
 *
 *   ZC38     DEFAULT_PATTERN_REGISTRY contains formSubmissionPattern.
 *   ZC38.b   createPatternRegistry preserves patterns array order.
 *   ZC38.c   walkRegistry returns null on empty registry.
 *   ZC38.d   walkRegistry returns first matching pattern's candidate.
 *   ZC38.e   walkRegistry walks patterns in order; later pattern
 *            fires if earlier pattern's guard rejects.
 *   ZC38.f   walkRegistry candidate carries patternId + matcherId
 *            + matcherIndex (the orchestrator's stamp flows through).
 *   ZC38.g   createPatternResolutionStrategy claims 'shared-patterns'
 *            rung exclusively; name is 'pattern-resolution';
 *            requiresAccumulator is false.
 */

import { describe, test, expect } from 'vitest';
import { Option } from 'effect';
import {
  matcherId,
  patternId,
  type IndexedSurface,
  type Matcher,
  type MatcherContext,
  type Pattern,
} from '../../../product/domain/resolution/patterns/rung-kernel';
import { firstMatchWins } from '../../../product/domain/resolution/patterns/orchestrators/first-match-wins';
import {
  createPatternRegistry,
  DEFAULT_PATTERN_REGISTRY,
} from '../../../product/domain/resolution/patterns/registry';
import {
  createPatternResolutionStrategy,
  walkRegistry,
} from '../../../product/runtime/resolution/patterns/pattern-resolution-strategy';
import { formSubmissionPattern } from '../../../product/domain/resolution/patterns/patterns/form-submission.pattern';
import { surfaceIndexFromList } from '../../../product/runtime/resolution/patterns/surface-index-from-stage';

// ─── Test fixtures ─────────────────────────────────────────────

function makeCtx(intentVerb: 'click' | 'input' | 'navigate' | 'observe' | 'select', actionText: string, surfaces: readonly IndexedSurface[]): MatcherContext {
  return {
    intent: {
      verb: intentVerb,
      originalActionText: actionText,
      targetShape: {},
    },
    surfaceIndex: surfaceIndexFromList(surfaces),
  };
}

function okMatcher(id: string, targetSurfaceId: string): Matcher {
  return () =>
    Option.some({
      targetSurfaceId,
      matcherId: matcherId(id),
      rationale: `stub:${id}`,
    });
}

function guardedPattern(id: string, guard: (ctx: MatcherContext) => boolean, matcherArr: readonly Matcher[]): Pattern {
  return {
    id: patternId(id),
    description: `stub:${id}`,
    applicabilityGuard: guard,
    matchers: matcherArr,
    orchestrator: firstMatchWins,
  };
}

// ─── ZC38: default registry ────────────────────────────────────

describe('Z11a.4b — DEFAULT_PATTERN_REGISTRY', () => {
  test('ZC38: contains formSubmissionPattern', () => {
    const found = DEFAULT_PATTERN_REGISTRY.patterns.find(
      (p) => p.id === formSubmissionPattern.id,
    );
    expect(found).toBeDefined();
  });

  test('ZC38.b: createPatternRegistry preserves patterns array order', () => {
    const p1 = guardedPattern('p1', () => true, []);
    const p2 = guardedPattern('p2', () => true, []);
    const registry = createPatternRegistry([p1, p2]);
    expect(registry.patterns.map((p) => p.id)).toEqual([patternId('p1'), patternId('p2')]);
  });
});

// ─── ZC38.c–f: walkRegistry ─────────────────────────────────────

describe('Z11a.4b — walkRegistry', () => {
  test('ZC38.c: empty registry returns null', () => {
    const registry = createPatternRegistry([]);
    const result = walkRegistry(registry, makeCtx('click', 'Click Submit', []));
    expect(result).toBeNull();
  });

  test('ZC38.d: first matching pattern produces the candidate', () => {
    const p1 = guardedPattern('p1', () => true, [okMatcher('m1', 'sid:1')]);
    const p2 = guardedPattern('p2', () => true, [okMatcher('m2', 'sid:2')]);
    const registry = createPatternRegistry([p1, p2]);
    const result = walkRegistry(registry, makeCtx('click', 'any', []));
    expect(result).not.toBeNull();
    expect(result!.patternId).toBe(patternId('p1'));
    expect(result!.matcherId).toBe(matcherId('m1'));
    expect(result!.targetSurfaceId).toBe('sid:1');
  });

  test('ZC38.e: first pattern guard rejects → later pattern fires', () => {
    const p1 = guardedPattern('p1-rejected', () => false, [okMatcher('m1', 'sid:1')]);
    const p2 = guardedPattern('p2-accepts', () => true, [okMatcher('m2', 'sid:2')]);
    const registry = createPatternRegistry([p1, p2]);
    const result = walkRegistry(registry, makeCtx('click', 'any', []));
    expect(result).not.toBeNull();
    expect(result!.patternId).toBe(patternId('p2-accepts'));
    expect(result!.matcherId).toBe(matcherId('m2'));
  });

  test('ZC38.f: candidate carries matcherIndex stamped by the orchestrator', () => {
    // Two matchers; first returns None, second returns Some at index 1.
    const noneMatcher: Matcher = () => Option.none();
    const p = guardedPattern('p', () => true, [noneMatcher, okMatcher('m2', 'sid:2')]);
    const registry = createPatternRegistry([p]);
    const result = walkRegistry(registry, makeCtx('click', 'any', []));
    expect(result).not.toBeNull();
    expect(result!.matcherIndex).toBe(1);
  });
});

// ─── ZC38.g: strategy structure ─────────────────────────────────

describe('Z11a.4b — createPatternResolutionStrategy', () => {
  test('ZC38.g: constructs strategy with correct rung coverage + flags', () => {
    const strategy = createPatternResolutionStrategy(DEFAULT_PATTERN_REGISTRY);
    expect(strategy.name).toBe('pattern-resolution');
    expect(strategy.rungs).toEqual(['shared-patterns']);
    expect(strategy.requiresAccumulator).toBe(false);
  });
});
