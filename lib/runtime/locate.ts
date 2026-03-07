import type { Page, Locator } from '@playwright/test';
import type { ElementSig, LocatorStrategy } from '../domain/types';

export interface ResolvedLocator {
  locator: Locator;
  strategies: LocatorStrategy[];
  strategy: LocatorStrategy;
  strategyIndex: number;
  degraded: boolean;
}

function fallbackRoleStrategy(element: ElementSig): LocatorStrategy {
  return {
    kind: 'role-name',
    role: element.role,
    name: element.name ?? null,
  };
}

export function locatorStrategies(element: ElementSig): LocatorStrategy[] {
  return element.locator && element.locator.length > 0
    ? element.locator
    : [fallbackRoleStrategy(element), ...(element.cssFallback ? [{ kind: 'css', value: element.cssFallback } as const] : [])];
}

export function describeLocatorStrategy(strategy: LocatorStrategy): string {
  switch (strategy.kind) {
    case 'test-id':
      return `test-id:${strategy.value}`;
    case 'role-name':
      return strategy.name ? `role:${strategy.role}[name=${strategy.name}]` : `role:${strategy.role}`;
    case 'css':
      return `css:${strategy.value}`;
  }
}

function locatorForStrategy(page: Page, strategy: LocatorStrategy): Locator {
  switch (strategy.kind) {
    case 'test-id':
      return page.getByTestId(strategy.value);
    case 'role-name':
      return page.getByRole(strategy.role as never, strategy.name ? { name: strategy.name } : undefined);
    case 'css':
      return page.locator(strategy.value);
  }
}

async function strategyMatches(locator: Locator): Promise<boolean> {
  const probe = locator as unknown as {
    count?: () => Promise<number>;
    isVisible?: () => Promise<boolean>;
  };

  if (typeof probe.count === 'function') {
    const count = await probe.count().catch(() => 0);
    if (count > 0) {
      return true;
    }
  }

  if (typeof probe.isVisible === 'function') {
    return probe.isVisible().catch(() => false);
  }

  return false;
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
