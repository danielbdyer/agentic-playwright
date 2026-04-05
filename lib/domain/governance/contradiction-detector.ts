/**
 * Knowledge Contradiction Detector (N1.10)
 *
 * Pure detection logic for conflicting hints, routes, and patterns
 * across the knowledge base. Emits conflict receipts and blocks
 * contradictory promotion.
 */

import type {
  ContradictionCategory,
  ContradictionReport,
  ContradictionSeverity,
  ContradictionSummary,
  KnowledgeContradiction,
} from '../knowledge/contradiction-types';

// ─── Entry Types ───

export interface HintEntry {
  readonly screenId: string;
  readonly elementId: string;
  readonly selector: string;
  readonly source: string;
}

export interface RouteEntry {
  readonly pattern: string;
  readonly screenId: string;
  readonly source: string;
}

export interface PatternEntry {
  readonly name: string;
  readonly screenId: string;
  readonly action: string;
  readonly selector: string;
  readonly source: string;
}

// ─── Grouping Helpers ───

/**
 * Group items by a derived key, returning a record of key → items.
 * Pure fold — no mutation.
 */
const groupBy = <T>(items: readonly T[], keyFn: (item: T) => string): Readonly<Record<string, readonly T[]>> =>
  items.reduce<Record<string, readonly T[]>>(
    (acc, item) => {
      const key = keyFn(item);
      return { ...acc, [key]: [...(acc[key] ?? []), item] };
    },
    {},
  );

/**
 * Simple deterministic hash for a string — used only for ID generation.
 */
const simpleHash = (s: string): string =>
  [...s].reduce((hash, ch) => ((hash << 5) - hash + ch.charCodeAt(0)) | 0, 0)
    .toString(36)
    .replace(/^-/, 'n');

// ─── Hint Contradictions ───

export function detectHintContradictions(
  hints: readonly HintEntry[],
): readonly KnowledgeContradiction[] {
  const grouped = groupBy(hints, (h) => `${h.screenId}::${h.elementId}`);

  return Object.entries(grouped).flatMap(([key, entries]) => {
    const distinctSelectors = [...new Set(entries.map((e) => e.selector))];
    if (distinctSelectors.length <= 1) return [];

    const [screenId, elementId] = key.split('::') as [string, string];
    const contradiction: KnowledgeContradiction = {
      id: `hint-conflict-${screenId}-${elementId}`,
      category: 'locator-conflict',
      severity: 'error',
      description: `Element "${elementId}" on screen "${screenId}" has ${distinctSelectors.length} conflicting selectors: ${distinctSelectors.map((s) => `"${s}"`).join(', ')}`,
      sources: entries.map((e) => ({
        file: e.source,
        field: 'selector',
        value: e.selector,
      })),
      suggestedResolution: `Review and consolidate selectors for element "${elementId}" on screen "${screenId}" to a single canonical locator.`,
    };
    return [contradiction];
  });
}

// ─── Route Contradictions ───

export function detectRouteContradictions(
  routes: readonly RouteEntry[],
): readonly KnowledgeContradiction[] {
  const grouped = groupBy(routes, (r) => r.pattern);

  return Object.entries(grouped).flatMap(([pattern, entries]) => {
    const distinctScreens = [...new Set(entries.map((e) => e.screenId))];
    if (distinctScreens.length <= 1) return [];

    const contradiction: KnowledgeContradiction = {
      id: `route-conflict-${simpleHash(pattern)}`,
      category: 'route-conflict',
      severity: 'error',
      description: `Route pattern "${pattern}" maps to ${distinctScreens.length} different screens: ${distinctScreens.map((s) => `"${s}"`).join(', ')}`,
      sources: entries.map((e) => ({
        file: e.source,
        field: 'screenId',
        value: e.screenId,
      })),
      suggestedResolution: `Determine which screen owns route "${pattern}" and remove or update the conflicting mapping.`,
    };
    return [contradiction];
  });
}

// ─── Pattern Contradictions ───

export function detectPatternContradictions(
  patterns: readonly PatternEntry[],
): readonly KnowledgeContradiction[] {
  const grouped = groupBy(patterns, (p) => `${p.screenId}::${p.action}`);

  return Object.entries(grouped).flatMap(([key, entries]) => {
    const distinctSelectors = [...new Set(entries.map((e) => e.selector))];
    if (distinctSelectors.length <= 1) return [];

    const [screenId, action] = key.split('::') as [string, string];
    const contradiction: KnowledgeContradiction = {
      id: `pattern-conflict-${screenId}-${action}`,
      category: 'pattern-conflict',
      severity: 'warning',
      description: `Action "${action}" on screen "${screenId}" has ${distinctSelectors.length} conflicting selectors: ${distinctSelectors.map((s) => `"${s}"`).join(', ')}`,
      sources: entries.map((e) => ({
        file: e.source,
        field: 'selector',
        value: e.selector,
      })),
      suggestedResolution: `Review pattern definitions for action "${action}" on screen "${screenId}" and consolidate to a single selector.`,
    };
    return [contradiction];
  });
}

// ─── Report Builder ───

const ALL_CATEGORIES: readonly ContradictionCategory[] = [
  'locator-conflict',
  'route-conflict',
  'pattern-conflict',
  'hint-conflict',
  'screen-identity-conflict',
];

const ALL_SEVERITIES: readonly ContradictionSeverity[] = ['error', 'warning', 'info'];

const countBy = <T>(items: readonly T[], keyFn: (item: T) => string): Readonly<Record<string, number>> =>
  items.reduce<Record<string, number>>(
    (acc, item) => {
      const key = keyFn(item);
      return { ...acc, [key]: (acc[key] ?? 0) + 1 };
    },
    {},
  );

function buildSummary(contradictions: readonly KnowledgeContradiction[]): ContradictionSummary {
  const byCategoryCounts = countBy(contradictions, (c) => c.category);
  const bySeverityCounts = countBy(contradictions, (c) => c.severity);

  const byCategory = ALL_CATEGORIES.reduce<Record<string, number>>(
    (acc, cat) => ({ ...acc, [cat]: byCategoryCounts[cat] ?? 0 }),
    {},
  ) as Record<ContradictionCategory, number>;

  const bySeverity = ALL_SEVERITIES.reduce<Record<string, number>>(
    (acc, sev) => ({ ...acc, [sev]: bySeverityCounts[sev] ?? 0 }),
    {},
  ) as Record<ContradictionSeverity, number>;

  return {
    totalContradictions: contradictions.length,
    byCategory,
    bySeverity,
    blocksPromotion: contradictions.some((c) => c.severity === 'error'),
  };
}

export function buildContradictionReport(
  contradictions: readonly KnowledgeContradiction[],
  now: string,
): ContradictionReport {
  return {
    kind: 'contradiction-report',
    version: 1,
    generatedAt: now,
    contradictions,
    summary: buildSummary(contradictions),
  };
}
