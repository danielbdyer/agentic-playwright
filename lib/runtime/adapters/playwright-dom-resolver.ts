import type { Page } from '@playwright/test';
import type { RuntimeDomResolver } from '../../domain/types';
import { describeLocatorStrategy, resolveLocator } from '../locate';

export function createPlaywrightDomResolver(page: Page): RuntimeDomResolver {
  return {
    async resolve(input) {
      const candidates = [];
      let probes = 0;

      for (const candidate of input.screen.elements) {
        if (probes >= input.policy.maxProbes || candidates.length >= input.policy.maxCandidates) {
          break;
        }
        probes += 1;
        const resolved = await resolveLocator(page, {
          role: candidate.role,
          name: candidate.name ?? null,
          testId: null,
          cssFallback: null,
          locator: candidate.locator,
          surface: candidate.surface,
          widget: candidate.widget,
          affordance: candidate.affordance ?? null,
        });
        const visibleCount = await resolved.locator.count().catch(() => 0);
        if (visibleCount < 1) {
          continue;
        }

        candidates.push({
          element: candidate,
          score: 0,
          evidence: {
            visibleCount,
            roleNameScore: 0,
            locatorQualityScore: resolved.degraded ? 0.5 : 1,
            widgetCompatibilityScore: 1,
            locatorRung: resolved.strategyIndex,
            locatorStrategy: describeLocatorStrategy(resolved.strategy),
          },
        });
      }

      return {
        candidates,
        topCandidate: candidates[0] ?? null,
        probes,
      };
    },
  };
}
