import type { Page, Locator } from '@playwright/test';
import { Match, pipe } from 'effect';
import type { LocatorStrategy } from '../../domain/governance/workflow-types';
import type { ElementSig } from '../../domain/knowledge/types';

export interface ResolvedLocator {
  locator: Locator;
  strategies: LocatorStrategy[];
  strategy: LocatorStrategy;
  strategyIndex: number;
  degraded: boolean;
}

function fallbackRoleStrategy(element: ElementSig): LocatorStrategy {
  return {
    kind: 'role',
    role: element.role,
    name: element.name ?? null,
  };
}

export function locatorStrategies(element: ElementSig): LocatorStrategy[] {
  return element.locator && element.locator.length > 0
    ? [...element.locator]
    : [fallbackRoleStrategy(element), ...(element.cssFallback ? [{ kind: 'css', value: element.cssFallback } as const] : [])];
}

export function describeLocatorStrategy(strategy: LocatorStrategy): string {
  return pipe(
    Match.type<LocatorStrategy>(),
    Match.discriminatorsExhaustive('kind')({
      'role': (s) => s.name ? `role:${s.role}[name=${s.name}]` : `role:${s.role}`,
      'label': (s) => `label:${s.value}`,
      'placeholder': (s) => `placeholder:${s.value}`,
      'text': (s) => `text:${s.value}`,
      'test-id': (s) => `test-id:${s.value}`,
      'css': (s) => `css:${s.value}`,
    }),
  )(strategy);
}

function locatorForStrategy(page: Page, strategy: LocatorStrategy): Locator {
  return pipe(
    Match.type<LocatorStrategy>(),
    Match.discriminatorsExhaustive('kind')({
      'role': (s) => page.getByRole(s.role as never, s.name ? { name: s.name } : undefined),
      'label': (s) => page.getByLabel(s.value, s.exact !== undefined ? { exact: s.exact } : undefined),
      'placeholder': (s) => page.getByPlaceholder(s.value, s.exact !== undefined ? { exact: s.exact } : undefined),
      'text': (s) => page.getByText(s.value, s.exact !== undefined ? { exact: s.exact } : undefined),
      'test-id': (s) => page.getByTestId(s.value),
      'css': (s) => page.locator(s.value),
    }),
  )(strategy);
}

async function strategyMatches(locator: Locator): Promise<boolean> {
  const count = await locator.count().catch(() => 0);
  if (count > 0) {
    return true;
  }

  return locator.isVisible().catch(() => false);
}

export function locate(page: Page, element: ElementSig): Locator {
  const strategies = locatorStrategies(element);
  const [first, ...rest] = strategies;
  const initial = locatorForStrategy(page, first ?? fallbackRoleStrategy(element));
  return rest.reduce((current, strategy) => current.or(locatorForStrategy(page, strategy)), initial);
}

export async function resolveLocator(page: Page, element: ElementSig): Promise<ResolvedLocator> {
  const strategies = locatorStrategies(element);

  for (const [index, strategy] of strategies.entries()) {
    const candidate = locatorForStrategy(page, strategy);
    if (await strategyMatches(candidate)) {
      return {
        locator: candidate,
        strategies,
        strategy,
        strategyIndex: index,
        degraded: index > 0,
      };
    }
  }

  return {
    locator: locate(page, element),
    strategies,
    strategy: strategies[0] ?? fallbackRoleStrategy(element),
    strategyIndex: 0,
    degraded: false,
  };
}
