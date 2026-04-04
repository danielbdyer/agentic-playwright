/**
 * Shared pure utilities for Phase 6 learning evaluation modules.
 */

export function round4(value: number): number {
  return Number(value.toFixed(4));
}

export function screenFromGraphNodeIds(graphNodeIds: readonly string[]): string {
  const screenRef = graphNodeIds.find((id) => id.startsWith('screen:') || id.startsWith('target:'));
  return screenRef?.replace(/^(screen:|target:)/, '') ?? 'unknown';
}

export function actionFamilyOf(action: string): string {
  return action === 'composite' ? 'composite' : action;
}

// ─── Composable Scoring Rules ───
// ScoringRule<T> forms a monoid under addition (identity = 0, combine = +).
// combineScoringRules is foldMap over that monoid — makes the algebraic
// structure explicit and enables swapping monoid instances if needed.

export type { ScoringRule } from '../domain/algebra/scoring';
import type { ScoringRule } from '../domain/algebra/scoring';
import { scoringRuleMonoid } from '../domain/algebra/scoring';
import { concatAll } from '../domain/algebra/monoid';

export function combineScoringRules<T>(...rules: readonly ScoringRule<T>[]): ScoringRule<T> {
  return concatAll(scoringRuleMonoid<T>(), rules);
}

export function weightedScoringRule<T>(weight: number, rule: ScoringRule<T>): ScoringRule<T> {
  return { score: (input) => weight * rule.score(input) };
}

export function contramapScoringRule<A, B>(rule: ScoringRule<A>, f: (b: B) => A): ScoringRule<B> {
  return { score: (input) => rule.score(f(input)) };
}
