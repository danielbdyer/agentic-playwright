import type {
  ObservedRoute,
  RouteKnowledgeProposal,
  RoutePattern,
} from './types/route-knowledge';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NUMERIC_ID_PATTERN = /^\d+$/;

function isParameterSegment(segment: string): boolean {
  return UUID_PATTERN.test(segment) || NUMERIC_ID_PATTERN.test(segment);
}

function deriveParameterName(segments: readonly string[], index: number): string {
  const preceding = index > 0 ? segments[index - 1] : undefined;
  const base = preceding ?? 'id';
  // Singularize naive trailing 's' for common REST patterns
  const singular = base.endsWith('s') && base.length > 1 ? base.slice(0, -1) : base;
  return `${singular}Id`;
}

interface SegmentAnalysis {
  readonly pattern: string;
  readonly parameterNames: readonly string[];
}

function analyzeSegments(
  urlPaths: readonly string[],
): SegmentAnalysis {
  const splitPaths = urlPaths.map((p) => p.split('/'));
  const maxLen = splitPaths.reduce((max, segs) => Math.max(max, segs.length), 0);

  const result = Array.from({ length: maxLen }, (_, i) => {
    const segmentsAtPosition = splitPaths
      .flatMap((segs) => (i < segs.length ? [segs[i]!] : []));
    const uniqueValues = [...new Set(segmentsAtPosition)];
    const allAreParams = uniqueValues.length > 1 || uniqueValues.some((s) => isParameterSegment(s));

    if (allAreParams && uniqueValues.length > 0) {
      // Use the first path's segments for naming context
      const referenceSegments = splitPaths[0] ?? [];
      return {
        segment: `{${deriveParameterName(referenceSegments, i)}}`,
        paramName: deriveParameterName(referenceSegments, i),
      };
    }

    return {
      segment: uniqueValues[0] ?? '',
      paramName: null as string | null,
    };
  });

  return {
    pattern: result.map((r) => r.segment).join('/'),
    parameterNames: result
      .flatMap((r) => (r.paramName !== null ? [r.paramName] : [])),
  };
}

function extractUrlPath(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    // If not a full URL, treat as path
    return url.startsWith('/') ? url : `/${url}`;
  }
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}

/**
 * Extract route patterns from observed routes by grouping by screenId
 * and detecting parameter segments that vary across observations.
 */
export function extractRoutePatterns(
  routes: readonly ObservedRoute[],
): readonly RoutePattern[] {
  const grouped = routes.reduce<Record<string, readonly ObservedRoute[]>>(
    (acc, route) => ({
      ...acc,
      [route.screenId]: [...(acc[route.screenId] ?? []), route],
    }),
    {},
  );

  return Object.entries(grouped)
    .map(([screenId, screenRoutes]) => {
      const urls = screenRoutes.map((r) => r.url);
      const uniqueUrls = uniqueStrings(urls);
      const paths = uniqueUrls.map(extractUrlPath);

      const { pattern, parameterNames } = analyzeSegments(paths);

      return {
        pattern,
        screenId,
        parameterNames,
        exampleUrls: uniqueUrls,
        observationCount: screenRoutes.length,
      } satisfies RoutePattern;
    })
    .sort((a, b) => a.screenId.localeCompare(b.screenId));
}

function confidenceFromCount(count: number): 'high' | 'medium' | 'low' {
  return count >= 3 ? 'high' : count === 2 ? 'medium' : 'low';
}

function reasonFromConfidence(
  confidence: 'high' | 'medium' | 'low',
  observationCount: number,
  parameterCount: number,
): string {
  const paramDesc =
    parameterCount > 0
      ? ` with ${parameterCount} parameter${parameterCount > 1 ? 's' : ''}`
      : ' as static route';

  return confidence === 'high'
    ? `Observed ${observationCount} times${paramDesc} — high confidence`
    : confidence === 'medium'
      ? `Observed ${observationCount} times${paramDesc} — medium confidence`
      : `Observed ${observationCount} time${paramDesc} — low confidence, may need verification`;
}

/**
 * Propose route knowledge entries for patterns not already known.
 */
export function proposeRouteKnowledge(
  patterns: readonly RoutePattern[],
  existingRoutes: readonly string[],
): readonly RouteKnowledgeProposal[] {
  const existingSet = new Set(existingRoutes);

  return patterns
    .flatMap((pattern) => {
      if (existingSet.has(pattern.pattern)) return [];
      const confidence = confidenceFromCount(pattern.observationCount);
      return [{
        kind: 'route-knowledge-proposal' as const,
        screenId: pattern.screenId,
        pattern,
        confidence,
        reason: reasonFromConfidence(
          confidence,
          pattern.observationCount,
          pattern.parameterNames.length,
        ),
        suggestedPath: `knowledge/routes/${pattern.screenId}.routes.yaml`,
      } satisfies RouteKnowledgeProposal];
    });
}
