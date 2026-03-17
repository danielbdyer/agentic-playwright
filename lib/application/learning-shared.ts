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

export interface ScoringRule<T> {
  readonly score: (input: T) => number;
}

export function combineScoringRules<T>(...rules: readonly ScoringRule<T>[]): ScoringRule<T> {
  return { score: (input) => rules.reduce((total, rule) => total + rule.score(input), 0) };
}

export function weightedScoringRule<T>(weight: number, rule: ScoringRule<T>): ScoringRule<T> {
  return { score: (input) => weight * rule.score(input) };
}

export function contramapScoringRule<A, B>(rule: ScoringRule<A>, f: (b: B) => A): ScoringRule<B> {
  return { score: (input) => rule.score(f(input)) };
}
