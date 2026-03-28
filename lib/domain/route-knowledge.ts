import type {
  ObservedRoute,
  RankedRouteVariant,
  RouteKnowledgeProposal,
  RoutePattern,
  RouteVariantKnowledge,
  RouteVariantSelectionInput,
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

function tokenizeDestination(value: string): readonly string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

function normalizeRoutePattern(urlOrPattern: string): string {
  try {
    const parsed = new URL(urlOrPattern);
    return `${parsed.pathname}${parsed.search}${parsed.hash}`.replace(/\/+/g, '/');
  } catch {
    return (urlOrPattern.startsWith('/') ? urlOrPattern : `/${urlOrPattern}`).replace(/\/+/g, '/');
  }
}

function specificityScore(variant: RouteVariantKnowledge): number {
  const normalized = normalizeRoutePattern(variant.urlPattern);
  const path = normalized.split(/[?#]/)[0] ?? '';
  const segmentCount = path.split('/').filter((segment) => segment.length > 0).length;
  const staticSegmentCount = path
    .split('/')
    .filter((segment) => segment.length > 0 && !segment.startsWith('{') && !segment.endsWith('}')).length;
  const dimensionsScore = variant.dimensions.length * 2;
  return staticSegmentCount * 3 + segmentCount + dimensionsScore;
}

function historicalSuccessScore(variant: RouteVariantKnowledge): number {
  const success = Math.max(0, variant.historicalSuccess.successCount);
  const failure = Math.max(0, variant.historicalSuccess.failureCount);
  const attempts = success + failure;
  if (attempts === 0) {
    return 0;
  }
  return Number(((success / attempts) * Math.log2(attempts + 1) * 10).toFixed(3));
}

function semanticScore(variant: RouteVariantKnowledge, semanticDestination: string): number {
  const normalizedPattern = normalizeRoutePattern(variant.urlPattern).toLowerCase();
  const normalizedUrl = normalizeRoutePattern(variant.url).toLowerCase();
  const tokens = tokenizeDestination(semanticDestination);
  if (tokens.length === 0) {
    return 0;
  }
  const matched = tokens.filter((token) => normalizedPattern.includes(token) || normalizedUrl.includes(token)).length;
  return Number((matched / tokens.length).toFixed(3));
}

function entryStateScore(variant: RouteVariantKnowledge, expectedEntryStateRefs: readonly string[]): number {
  if (expectedEntryStateRefs.length === 0) {
    return 0;
  }
  const actual = new Set(variant.expectedEntryStateRefs);
  const matched = expectedEntryStateRefs.filter((ref) => actual.has(ref)).length;
  return Number((matched / expectedEntryStateRefs.length).toFixed(3));
}

export function rankRouteVariants(
  variants: readonly RouteVariantKnowledge[],
  input: RouteVariantSelectionInput,
): readonly RankedRouteVariant[] {
  return variants
    .flatMap((variant) => variant.screenId === input.screenId ? [variant] : [])
    .map((variant) => {
      const bySpecificity = specificityScore(variant);
      const byHistory = historicalSuccessScore(variant);
      const bySemantic = semanticScore(variant, input.semanticDestination);
      const byEntryState = entryStateScore(variant, input.expectedEntryStateRefs);
      const score = Number((bySpecificity + byHistory + bySemantic * 6 + byEntryState * 5).toFixed(3));
      const rationale = [
        `specificity=${bySpecificity.toFixed(3)}`,
        `historicalSuccess=${byHistory.toFixed(3)}`,
        `semantic=${bySemantic.toFixed(3)}`,
        `entryState=${byEntryState.toFixed(3)}`,
      ].join(', ');
      return {
        variant,
        specificityScore: bySpecificity,
        historicalSuccessScore: byHistory,
        semanticScore: bySemantic,
        entryStateScore: byEntryState,
        score,
        rationale,
      } satisfies RankedRouteVariant;
    })
    .sort((left, right) =>
      right.score - left.score
      || right.specificityScore - left.specificityScore
      || right.historicalSuccessScore - left.historicalSuccessScore
      || left.variant.routeVariantRef.localeCompare(right.variant.routeVariantRef));
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
