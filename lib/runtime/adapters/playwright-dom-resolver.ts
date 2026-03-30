import type { Page } from '@playwright/test';
import type { RuntimeDomCandidate, RuntimeDomResolver } from '../../domain/types';
import { describeLocatorStrategy, resolveLocator } from '../locate';

export function createPlaywrightDomResolver(page: Page): RuntimeDomResolver {
  return {
    async resolve(input) {
      const probe = async (
        remaining: typeof input.screen.elements,
        acc: { candidates: RuntimeDomCandidate[]; probes: number },
      ): Promise<typeof acc> => {
        if (remaining.length === 0 || acc.probes >= input.policy.maxProbes || acc.candidates.length >= input.policy.maxCandidates) {
          return acc;
        }
        const [candidate, ...rest] = remaining;
        const resolved = await resolveLocator(page, {
          role: candidate!.role,
          name: candidate!.name ?? null,
          testId: null,
          cssFallback: null,
          locator: candidate!.locator,
          surface: candidate!.surface,
          widget: candidate!.widget,
          affordance: candidate!.affordance ?? null,
        });
        const visibleCount = await resolved.locator.count().catch(() => 0);
        // Extract ARIA attributes for richer semantic scoring
        const ariaLabel = visibleCount >= 1
          ? await resolved.locator.first().getAttribute('aria-label').catch(() => null)
          : null;
        const nextCandidates = visibleCount >= 1
          ? [...acc.candidates, {
              element: candidate!,
              score: 0,
              evidence: {
                visibleCount,
                roleNameScore: 0,
                locatorQualityScore: resolved.degraded ? 0.5 : 1,
                widgetCompatibilityScore: 1,
                locatorRung: resolved.strategyIndex,
                locatorStrategy: describeLocatorStrategy(resolved.strategy),
                ariaLabel,
              },
            }]
          : acc.candidates;
        return probe(rest, { candidates: nextCandidates, probes: acc.probes + 1 });
      };

      const result = await probe([...input.screen.elements], { candidates: [], probes: 0 });
      return {
        candidates: result.candidates,
        topCandidate: result.candidates[0] ?? null,
        probes: result.probes,
      };
    },
  };
}
